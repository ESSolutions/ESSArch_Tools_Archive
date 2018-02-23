"""
    ESSArch is an open source archiving and digital preservation system

    ESSArch Tools for Archive (ETA)
    Copyright (C) 2005-2017 ES Solutions AB

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program. If not, see <http://www.gnu.org/licenses/>.

    Contact information:
    Web - http://www.essolutions.se
    Email - essarch@essolutions.se
"""

import copy
import datetime
import errno
import glob
import json
import logging
import mimetypes
import os
import re
import shutil
import tarfile
import tempfile
import uuid
import zipfile

from operator import itemgetter

from celery import states as celery_states

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured, ValidationError
from django.db import IntegrityError
from django.db.models import Prefetch
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend

from groups_manager.models import Member
from groups_manager.utils import get_permission_name

from guardian.shortcuts import assign_perm, get_objects_for_group


from lxml import etree

from rest_framework import exceptions, filters, permissions, status
from rest_framework.decorators import detail_route, list_route
from rest_framework.response import Response

from ESSArch_Core.auth.util import get_membership_descendants

from ESSArch_Core.configuration.models import (
    EventType,
    Path,
)

from ESSArch_Core.essxml.util import (
    get_agent,
    get_objectpath,
    parse_submit_description,
)

from ESSArch_Core.fixity.validation.backends.checksum import ChecksumValidator

from ESSArch_Core.ip.models import InformationPackage, EventIP, Workarea

from ESSArch_Core.ip.permissions import (
    CanDeleteIP,
    CanTransferSIP,
)

from ESSArch_Core.ip.serializers import EventIPSerializer

from ESSArch_Core.mixins import PaginatedViewMixin

from ESSArch_Core.pagination import LinkHeaderPagination

from ESSArch_Core.profiles.models import ProfileIP, ProfileIPData, SubmissionAgreement
from ESSArch_Core.profiles.utils import fill_specification_data

from ESSArch_Core.WorkflowEngine.models import (
    ProcessStep,
    ProcessTask
)

from ESSArch_Core.WorkflowEngine.serializers import (
    ProcessStepSerializer,
)

from ESSArch_Core.util import (
    creation_date,
    flatten,
    generate_file_response,
    get_files_and_dirs,
    get_event_spec,
    get_immediate_subdirectories,
    get_tree_size_and_count,
    get_value_from_path,
    in_directory,
    list_files,
    parse_content_range_header,
    timestamp_to_datetime,
    remove_prefix
)

from ip.filters import InformationPackageFilter
from ip.serializers import InformationPackageSerializer, InformationPackageReadSerializer, WorkareaSerializer

from rest_framework import viewsets


class InformationPackageReceptionViewSet(viewsets.ViewSet, PaginatedViewMixin):

    def __init__(self, *args, **kwargs):
        self.logger = logging.getLogger('essarch.reception')
        self.reception = Path.objects.get(entity="path_ingest_reception").value
        self.uip = Path.objects.get(entity="path_ingest_unidentified").value
        super(InformationPackageReceptionViewSet, self).__init__(*args, **kwargs)

    def parse_ip_with_xmlfile(self, xmlfile):
        if xmlfile.startswith(self.uip):
            srcdir = self.uip
        else:
            srcdir = self.reception

        try:
            ip = parse_submit_description(xmlfile, srcdir)
        except (etree.LxmlError, ValueError) as e:
            self.logger.warn('Failed to parse %s: %s' % (xmlfile, e.message))
            raise

        ip['state'] = 'At reception'
        ip['status'] = 100
        ip['step_state'] = celery_states.SUCCESS
        return ip

    def parse_unidentified_ip(self, container_file):
        ip = {
            'object_identifier_value': os.path.basename(container_file),
            'label': os.path.basename(container_file),
            'create_date': str(timestamp_to_datetime(creation_date(container_file)).isoformat()),
            'state': 'Unidentified',
            'status': 0,
            'step_state': celery_states.SUCCESS,
        }

        for xmlfile in glob.glob(os.path.join(self.uip, "*.xml")):
            if os.path.isfile(xmlfile):
                doc = etree.parse(xmlfile)
                root = doc.getroot()

                el = root.xpath('.//*[local-name()="%s"]' % "FLocat")[0]
                if ip['label'] == get_value_from_path(el, "@href").split('file:///')[1]:
                    raise exceptions.NotFound()

        return ip

    def parse_directory_ip(self, directory):
        ip = {
            'id': directory.name,
            'object_identifier_value': directory.name,
            'label': directory.name,
            'state': 'At reception',
            'status': 100,
            'step_state': celery_states.SUCCESS,
        }
        return ip

    def get_xml_files(self):
        return glob.glob(os.path.join(self.reception, "*.xml")) + glob.glob(os.path.join(self.uip, "*.xml"))

    def get_container_for_xml(self, xmlfile):
        doc = etree.parse(xmlfile)
        root = doc.getroot()
        return get_objectpath(root)

    def get_container_files(self):
        return glob.glob(os.path.join(self.uip, "*.tar")) + glob.glob(os.path.join(self.uip, "*.zip"))

    def get_directories(self):
        return get_immediate_subdirectories(self.reception)

    def list(self, request):
        ips = []

        for xmlfile in self.get_xml_files():
            if os.path.isfile(xmlfile):
                try:
                    ip = self.parse_ip_with_xmlfile(xmlfile)
                except (etree.LxmlError, ValueError) as e:
                    continue

                if not InformationPackage.objects.filter(object_identifier_value=ip['object_identifier_value']).exists():
                    ips.append(ip)

        for container_file in self.get_container_files():
            try:
                ip = self.parse_unidentified_ip(container_file)
            except exceptions.NotFound:
                pass
            else:
                ips.append(ip)

        for directory in self.get_directories():
            ip = self.parse_directory_ip(directory)
            if not InformationPackage.objects.filter(object_identifier_value=ip['object_identifier_value']).exists():
                ips.append(ip)

        from_db = InformationPackage.objects.filter(state__in=['Prepared', 'Receiving']).prefetch_related(
            Prefetch('profileip_set', to_attr='profiles'),
        )
        serializer = InformationPackageSerializer(
            data=from_db, many=True, context={'request': request}
        )
        serializer.is_valid()
        ips.extend(serializer.data)

        try:
            ordering = request.query_params.get('ordering', '')
            reverse = ordering.startswith('-')
            ordering = remove_prefix(ordering, '-')
            ips = sorted(ips, key=lambda k: k[ordering], reverse=reverse)
        except KeyError:
            pass

        if self.paginator is not None:
            paginated = self.paginator.paginate_queryset(ips, request)
            return self.paginator.get_paginated_response(paginated)

        return Response(ips)

    def retrieve(self, request, pk=None):
        reception_path = os.path.join(self.reception, pk)
        uip_path = os.path.join(self.uip, pk)
        paths = [reception_path, uip_path]

        xml_paths = [p + '.xml' for p in paths]
        container_paths = flatten([[p + '.tar', p + '.zip'] for p in paths])

        for xml in self.get_xml_files():
            for path in xml_paths:
                if path == xml:
                    return Response(self.parse_ip_with_xmlfile(xml))

        for container in self.get_container_files():
            for path in container_paths:
                if path + p == container:
                    return Response(self.parse_unidentified_ip(container))

        for directory in self.get_directories():
            for path in paths:
                if path == directory.path:
                    return Response(self.parse_directory_ip(directory))

        raise exceptions.NotFound()

    @detail_route(methods=['get'])
    def files(self, request, pk=None):
        reception = Path.objects.get(entity="path_ingest_reception").value
        path = request.query_params.get('path', '').rstrip('/ ')
        download = request.query_params.get('download', False)

        if os.path.isdir(os.path.join(reception, pk)):
            path = os.path.join(reception, pk, path)
            return list_files(path, download, paginator=self.paginator, request=request)

        xml = os.path.join(reception, "%s.xml" % pk)

        if not os.path.exists(xml):
            raise exceptions.NotFound

        ip = parse_submit_description(xml, srcdir=reception)
        container = ip['object_path']

        if len(path):
            path = os.path.join(os.path.dirname(container), path)
            return list_files(path, download, paginator=self.paginator, request=request)

        entry = {
            "name": os.path.basename(container),
            "type": 'file',
            "size": os.path.getsize(container),
            "modified": timestamp_to_datetime(os.path.getmtime(container)),
        }

        xmlentry = {
            "name": os.path.basename(xml),
            "type": 'file',
            "size": os.path.getsize(xml),
            "modified": timestamp_to_datetime(os.path.getmtime(xml)),
        }
        return Response([entry, xmlentry])

    @list_route(methods=['post'])
    def upload(self, request):
        if not request.user.has_perm('ip.can_receive_remote_files'):
            raise exceptions.PermissionDenied

        path = Path.objects.get(entity="path_ingest_reception").value

        f = request.FILES['the_file']
        content_range = request.META.get('HTTP_CONTENT_RANGE', 'bytes 0-0/0')
        filename = os.path.join(path, f.name)

        (start, end, total) = parse_content_range_header(content_range)

        if f.size != end - start + 1:
            raise exceptions.ParseError("File size doesn't match headers")

        if start == 0:
            with open(filename, 'wb') as dstf:
                dstf.write(f.read())
        else:
            with open(filename, 'ab') as dstf:
                dstf.seek(start)
                dstf.write(f.read())

        upload_id = request.data.get('upload_id', uuid.uuid4().hex)
        return Response({'upload_id': upload_id})

    @list_route(methods=['post'])
    def upload_complete(self, request):
        if not request.user.has_perm('ip.can_receive_remote_files'):
            raise exceptions.PermissionDenied

        path = Path.objects.get(entity="path_ingest_reception").value

        md5 = request.data['md5']
        filepath = request.data['path']
        filepath = os.path.join(path, filepath)

        options = {'expected': md5, 'algorithm': 'md5'}
        validator = ChecksumValidator(context='checksum_str', options=options)
        validator.validate(filepath)

        return Response('Upload of %s complete' % filepath)

    @detail_route(methods=['post'])
    def prepare(self, request, pk=None):
        try:
            perms = copy.deepcopy(settings.IP_CREATION_PERMS_MAP)
        except AttributeError:
            msg = 'IP_CREATION_PERMS_MAP not defined in settings'
            self.logger.error(msg)
            raise ImproperlyConfigured(msg)

        member = Member.objects.get(django_user=request.user)

        existing = InformationPackage.objects.filter(object_identifier_value=pk).first()
        if existing is not None:
            self.logger.warn('Tried to prepare IP with id %s which already exists' % (pk), extra={'user': request.user.pk})
            raise exceptions.ParseError('IP with id %s already exists: %s' % (pk, str(existing.pk)))

        reception = Path.objects.values_list('value', flat=True).get(entity="path_ingest_reception")

        if os.path.isdir(os.path.join(reception, pk)):
            # A directory with the given id exists, try to prepare it
            sa = request.data.get('submission_agreement')
            if sa is None:
                raise exceptions.ParseError(detail='Missing parameter submission_agreement')

            parsed = {'label': pk}
            objpath = os.path.join(reception, pk)
        else:
            # No directory, look for files instead
            xmlfile = os.path.join(reception, '%s.xml' % pk)

            if not os.path.isfile(xmlfile):
                self.logger.warn('Tried to prepare IP with missing XML file %s' % (xmlfile), extra={'user': request.user.pk})
                raise exceptions.ParseError('%s does not exist' % xmlfile)

            try:
                container = os.path.join(reception, self.get_container_for_xml(xmlfile))
                objpath = container
            except etree.LxmlError:
                self.logger.warn('Tried to prepare IP with invalid XML file %s' % (xmlfile), extra={'user': request.user.pk})
                raise exceptions.ParseError('Invalid XML file, %s' % xmlfile)

            if not os.path.isfile(container):
                self.logger.warn('Tried to prepare IP with missing container file %s' % (container), extra={'user': request.user.pk})
                raise exceptions.ParseError('%s does not exist' % container)

            objid, _ = os.path.splitext(os.path.basename(container))
            parsed = parse_submit_description(xmlfile, srcdir=os.path.split(container)[0])

            provided_sa = request.data.get('submission_agreement')
            parsed_sa = parsed.get('altrecordids', {}).get('SUBMISSIONAGREEMENT', [None])[0]

            if parsed_sa is not None and provided_sa is not None:
                if provided_sa == parsed_sa:
                    sa = provided_sa
                if provided_sa != parsed_sa:
                    raise exceptions.ParseError(detail='Must use SA specified in XML')
            elif parsed_sa and not provided_sa:
                sa = parsed_sa
            elif provided_sa and not parsed_sa:
                sa = provided_sa
            else:
                raise exceptions.ParseError(detail='Missing parameter submission_agreement')

        try:
            sa = SubmissionAgreement.objects.get(pk=sa)
        except (ValidationError, ValueError, SubmissionAgreement.DoesNotExist) as e:
            raise exceptions.ParseError('Could not find SA "%s"' % sa)

        ip = InformationPackage.objects.create(
            object_identifier_value=pk,
            package_type=InformationPackage.SIP,
            state='Prepared',
            responsible=request.user,
            submission_agreement=sa,
            submission_agreement_locked=True,
            label=parsed.get('label'),
            entry_date=parsed.get('entry_date'),
            start_date=parsed.get('start_date'),
            end_date=parsed.get('end_date'),
            object_path=objpath,
        )

        # refresh date fields to convert them to datetime instances instead of
        # strings to allow further datetime manipulation
        ip.refresh_from_db(fields=['entry_date', 'start_date', 'end_date'])

        user_perms = perms.pop('owner', [])

        organization = request.user.user_profile.current_organization
        organization.assign_object(ip, custom_permissions=perms)

        for perm in user_perms:
            perm_name = get_permission_name(perm, ip)
            assign_perm(perm_name, member.django_user, ip)

        extra_data = fill_specification_data(ip=ip, sa=sa)

        for profile_type in ['transfer_project', 'sip', 'preservation_metadata', 'submit_description', 'validation', 'transformation']:
            profile = getattr(sa, 'profile_%s' % profile_type, None)

            if profile is None:
                continue

            profile_ip = ProfileIP.objects.create(ip=ip, profile=profile)
            data = {}
            for field in profile_ip.profile.template:
                try:
                    if field['defaultValue'] in extra_data:
                        data[field['key']] = extra_data[field['defaultValue']]
                        continue

                    data[field['key']] = field['defaultValue']
                except KeyError:
                    pass

            data_obj = ProfileIPData.objects.create(
                relation=profile_ip, data=data, version=0, user=request.user,
            )
            profile_ip.data = data_obj
            profile_ip.save()

        data = InformationPackageReadSerializer(ip, context={'request': request}).data

        self.logger.info('Prepared information package %s' % str(ip.pk), extra={'user': request.user.pk})
        return Response(data, status=status.HTTP_201_CREATED)


    @detail_route(methods=['post'], url_path='receive')
    def receive(self, request, pk=None):
        try:
            ip = get_object_or_404(InformationPackage, id=pk)
        except (ValueError, ValidationError):
            raise exceptions.NotFound('Information package with id="%s" not found' % pk)

        if ip.state != 'Prepared':
            self.logger.warn('Tried to receive IP %s from reception which is in state "%s"' % (pk, ip.state), extra={'user': request.user.pk})
            raise exceptions.ParseError('Information package must be in state "Prepared"')

        for profile_ip in ProfileIP.objects.filter(ip=ip).iterator():
            try:
                profile_ip.clean()
            except ValidationError as e:
                raise exceptions.ParseError('%s: %s' % (profile_ip.profile.name, e[0]))

            profile_ip.LockedBy = request.user
            profile_ip.save()

        objpath = ip.object_path

        if not os.path.isdir(objpath):
            xmlfile = os.path.splitext(objpath)[0] + '.xml'
            if not os.path.isfile(xmlfile):
                xmlfile = os.path.join(uip, "%s.xml" % pk)
                srcdir = uip

            doc = etree.parse(xmlfile)
            root = doc.getroot()

            objid, _ = os.path.splitext(os.path.basename(objpath))
            parsed = parse_submit_description(xmlfile, srcdir=os.path.split(objpath)[0])

            events_xmlfile = None
            if tarfile.is_tarfile(objpath):
                with tarfile.open(objpath) as tarf:
                    try:
                        tmp = tempfile.NamedTemporaryFile(delete=False)
                        tmp.close()
                        tarf.extract('%s/ipevents.xml' % pk, os.path.dirname(tmp.name))
                        extracted = os.path.join(os.path.dirname(tmp.name), '%s/ipevents.xml' % pk)
                        os.rename(extracted, tmp.name)
                        events_xmlfile = tmp.name
                    except KeyError:
                        pass

            if zipfile.is_zipfile(objpath):
                with zipfile.open(objpath) as zipf:
                    try:
                        tmp = tempfile.NamedTemporaryFile(delete=False)
                        tmp.close()
                        zipf.extract('%s/ipevents.xml' % pk, os.path.dirname(tmp.name))
                        extracted = os.path.join(os.path.dirname(tmp.name), '%s/ipevents.xml' % pk)
                        os.rename(extracted, tmp.name)
                        events_xmlfile = tmp.name
                    except KeyError:
                        pass
        else:
            events_xmlfile=None

        step = ProcessStep.objects.create(
            name="Receive SIP",
            information_package=ip,
            eager=False,
        )

        validators = request.data.get('validators', {})
        available_validators = [
            'validate_xml_file', 'validate_file_format', 'validate_integrity',
            'validate_logical_physical_representation',
        ]

        if any(v is True and k in available_validators for k, v in validators.iteritems()):
            validation_step = ProcessStep.objects.create(
                name="Validate",
                parent_step=step
            )

            if validators.get('validate_xml_file', False):
                ProcessTask.objects.create(
                    name="ESSArch_Core.tasks.ValidateXMLFile",
                    params={
                        "xml_filename": xmlfile
                    },
                    log=EventIP,
                    information_package=ip,
                    responsible=self.request.user,
                    processstep=validation_step
                )

            val_format = validators.get("validate_file_format", False)
            val_integrity = validators.get("validate_integrity", False)

            if val_format or val_integrity:
                ProcessTask.objects.create(
                    name="ESSArch_Core.tasks.ValidateFiles",
                    params={
                        "rootdir": srcdir,
                        "xmlfile": xmlfile,
                        "validate_fileformat": val_format,
                        "validate_integrity": val_integrity
                    },
                    log=EventIP,
                    information_package=ip,
                    responsible=self.request.user,
                    processstep=validation_step
                )

            files = [objpath]

            if validators.get('validate_logical_physical_representation'):
                ProcessTask.objects.create(
                    name="ESSArch_Core.tasks.ValidateLogicalPhysicalRepresentation",
                    params={
                        "files": files,
                        "files_reldir": srcdir,
                        "xmlfile": xmlfile,
                    },
                    log=EventIP,
                    information_package=ip,
                    responsible=self.request.user,
                    processstep=validation_step
                )

        receive_step = ProcessStep.objects.create(
            name="Receive",
        )

        if os.path.isdir(objpath):
            ProcessTask.objects.create(
                name="preingest.tasks.ReceiveDir",
                args=[ip.pk, objpath],
                processstep_pos=0,
                log=EventIP,
                information_package=ip,
                responsible=self.request.user,
                processstep=receive_step,
            )
        else:
            ProcessTask.objects.create(
                name="preingest.tasks.ReceiveSIP",
                args=[ip.pk, xmlfile, objpath],
                processstep_pos=0,
                log=EventIP,
                information_package=ip,
                responsible=self.request.user,
                processstep=receive_step,
            )

        if events_xmlfile is not None:
            ProcessTask.objects.create(
                name="ESSArch_Core.tasks.ParseEvents",
                args=[events_xmlfile],
                params={'delete_file': True},
                processstep_pos=3,
                information_package=ip,
                responsible=self.request.user,
                processstep=receive_step,
            )
        ProcessTask.objects.create(
            name="ESSArch_Core.tasks.UpdateIPSizeAndCount",
            args=[ip.pk],
            processstep_pos=5,
            log=EventIP,
            information_package=ip,
            responsible=self.request.user,
            processstep=receive_step,
        )
        ProcessTask.objects.create(
            name="ESSArch_Core.tasks.UpdateIPStatus",
            args=[ip.pk],
            params={
                "status": "Received",
                "prev": ip.state,
            },
            processstep_pos=10,
            log=EventIP,
            information_package=ip,
            responsible=self.request.user,
            processstep=receive_step,
        )

        step.add_child_steps(receive_step)
        step.save()
        step.run()

        return Response("IP Received")

    @list_route(methods=['post'], url_path='identify-ip')
    def identify_ip(self, request):
        fname = request.data.get('filename')
        spec_data = request.data.get('specification_data', {})

        uip = Path.objects.get(entity="path_ingest_unidentified").value
        container_file = os.path.join(uip, fname)

        if not os.path.isfile(container_file):
            return Response(
                {'status': '%s does not exist' % container_file},
                status=status.HTTP_400_BAD_REQUEST
            )

        spec = json.loads(open(
            os.path.join(settings.BASE_DIR, 'templates/SDTemplate.json')
        ).read())

        objid = os.path.splitext(fname)[0]

        spec_data['_OBJID'] = spec_data.pop('ObjectIdentifierValue', objid)
        spec_data['_OBJLABEL'] = spec_data.pop('LABEL', objid)
        spec_data['_IP_CREATEDATE'] = timestamp_to_datetime(
            creation_date(container_file)
        ).isoformat()

        infoxml = u'%s.xml' % objid
        infoxml = os.path.join(uip, infoxml)

        ProcessTask.objects.create(
            name='ESSArch_Core.tasks.GenerateXML',
            params={
                'filesToCreate': {
                    infoxml: {'spec': spec, 'data': spec_data}
                },
                'folderToParse': container_file,
            },
            responsible=request.user,
        ).run()

        return Response({'status': 'Identified IP, created %s' % infoxml})


class InformationPackageViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows information packages to be viewed or edited.
    """
    queryset = InformationPackage.objects.none()
    serializer_class = InformationPackageSerializer
    filter_backends = (
        filters.OrderingFilter, DjangoFilterBackend, filters.SearchFilter,
    )
    ordering_fields = (
        'label', 'responsible', 'create_date', 'state',
        'id', 'object_identifier_value',
    )
    search_fields = (
        'object_identifier_value', 'label', 'responsible__first_name',
        'responsible__last_name', 'responsible__username', 'state',
        'submission_agreement__name', 'start_date', 'end_date',
    )
    filter_class = InformationPackageFilter

    def get_serializer_class(self):
        if self.request.method in permissions.SAFE_METHODS:
            return InformationPackageReadSerializer

        return InformationPackageSerializer

    def get_permissions(self):
        if self.action == 'destroy':
            self.permission_classes = [CanDeleteIP]

        return super(InformationPackageViewSet, self).get_permissions()

    def get_object(self):
        queryset = self.filter_queryset(self.get_queryset())

        # Perform the lookup filtering.
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field

        assert lookup_url_kwarg in self.kwargs, (
                'Expected view %s to be called with a URL keyword argument '
                'named "%s". Fix your URL conf, or set the `.lookup_field` '
                'attribute on the view correctly.' %
                (self.__class__.__name__, lookup_url_kwarg)
        )

        lookup_field = self.lookup_field

        objid = self.request.query_params.get('objid')
        if objid is not None:
            lookup_field = 'object_identifier_value'

        filter_kwargs = {lookup_field: self.kwargs[lookup_url_kwarg]}
        obj = get_object_or_404(queryset, **filter_kwargs)

        # May raise a permission denied
        self.check_object_permissions(self.request, obj)

        return obj

    def get_queryset(self):
        user = self.request.user
        queryset = InformationPackage.objects.visible_to_user(user)

        queryset = queryset.prefetch_related(
            Prefetch('profileip_set', to_attr='profiles'), 'profiles__profile',
            'archival_institution', 'archivist_organization', 'archival_type', 'archival_location',
            'responsible__user_permissions', 'responsible__groups__permissions', 'steps',
        ).select_related('submission_agreement')

        other = self.request.query_params.get('other')

        if other is not None:
            queryset = queryset.filter(
                archival_institution=None,
                archivist_organization=None,
                archival_type=None,
                archival_location=None
            )

        return queryset

    @detail_route(methods=['post'], url_path='transfer', permission_classes=[CanTransferSIP])
    def transfer(self, request, pk=None):
        ip = self.get_object()

        if ip.get_profile('transformation') is not None and ip.state.lower() != 'transformed':
            raise exceptions.ParseError('"{ip}" cannot be transferred without first being transformed'.format(ip=ip.object_identifier_value))

        dstdir = Path.objects.get(entity="path_gate_reception").value

        info = fill_specification_data(ip=ip)

        events_path = os.path.splitext(ip.object_path)[0] + '_ipevents.xml'
        filesToCreate = {
            events_path: {'spec': get_event_spec(), 'data': info}
        }

        step = ProcessStep.objects.create(
            name="Transfer SIP",
            information_package=ip,
            eager=False,
        )

        step.add_tasks(
            ProcessTask.objects.create(
                name="ESSArch_Core.tasks.UpdateIPStatus",
                params={
                    "ip": ip.pk,
                    "status": "Transferring",
                    "prev": ip.state,
                },
                processstep_pos=10,
                log=EventIP,
                information_package=ip,
                responsible=self.request.user,
            )
        )

        step.add_tasks(
            ProcessTask.objects.create(
                name="ESSArch_Core.tasks.GenerateXML",
                params={
                    "filesToCreate": filesToCreate,
                },
                processstep_pos=20,
                log=EventIP,
                information_package=ip,
                responsible=self.request.user,
            )
        )

        step.add_tasks(
            ProcessTask.objects.create(
                name="ESSArch_Core.tasks.AppendEvents",
                params={
                    "filename": events_path,
                },
                processstep_pos=30,
                log=EventIP,
                information_package=ip,
                responsible=self.request.user,
            )
        )

        spec = {
            "-name": "object",
            "-namespace": "premis",
            "-children": [
                {
                    "-name": "objectIdentifier",
                    "-namespace": "premis",
                    "-children": [
                        {
                            "-name": "objectIdentifierType",
                            "-namespace": "premis",
                            "#content": [{"var": "FIDType"}],
                            "-children": []
                        },
                        {
                            "-name": "objectIdentifierValue",
                            "-namespace": "premis",
                            "#content": [{"var": "FID"}],
                            "-children": []
                        }
                    ]
                },
                {
                    "-name": "objectCharacteristics",
                    "-namespace": "premis",
                    "-children": [
                        {
                            "-name": "format",
                            "-namespace": "premis",
                            "-children": [
                                {
                                    "-name": "formatDesignation",
                                    "-namespace": "premis",
                                    "-children": [
                                        {
                                            "-name": "formatName",
                                            "-namespace": "premis",
                                            "#content": [{"var": "FFormatName"}],
                                            "-children": []
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                },
                {
                    "-name": "storage",
                    "-namespace": "premis",
                    "-children": [
                        {
                            "-name": "contentLocation",
                            "-namespace": "premis",
                            "-children": [
                                {
                                    "-name": "contentLocationType",
                                    "-namespace": "premis",
                                    "#content": [{"var": "FLocationType"}],
                                    "-children": []
                                },
                                {
                                    "-name": "contentLocationValue",
                                    "-namespace": "premis",
                                    "#content": [{"text": "file:///%s.tar" % ip.object_identifier_value}],
                                    "-children": []
                                }
                            ]
                        }
                    ]
                }
            ],
            "-attr": [
                {
                  "-name": "type",
                  '-namespace': 'xsi',
                  "-req": "1",
                  "#content": [{"text": "premis:file"}]
                }
            ],
        }

        info = {
            'FIDType': "UUID",
            'FID': "%s" % str(ip.object_identifier_value),
            'FFormatName': 'TAR',
            'FLocationType': 'URI',
            'FName': ip.object_path,
        }

        step.add_tasks(
            ProcessTask.objects.create(
                name="ESSArch_Core.tasks.InsertXML",
                params={
                    "filename": events_path,
                    "elementToAppendTo": "premis",
                    "spec": spec,
                    "info": info,
                    "index": 0
                },
                processstep_pos=40,
                information_package=ip,
                responsible=self.request.user,
            )
        )

        step.add_tasks(
            ProcessTask.objects.create(
                name="preingest.tasks.TransferSIP",
                params={
                    "ip": ip.pk,
                },
                processstep_pos=45,
                log=EventIP,
                information_package=ip,
                responsible=self.request.user,
            )
        )

        step.add_tasks(
            ProcessTask.objects.create(
                name="ESSArch_Core.tasks.UpdateIPStatus",
                params={
                    "ip": ip.pk,
                    "status": "Transferred",
                    "prev": "Transferring",
                },
                processstep_pos=50,
                log=EventIP,
                information_package=ip,
                responsible=self.request.user,
            )
        )

        step.run()

        return Response("Transferring IP")

    @detail_route(methods=['post'], url_path='validate')
    def validate(self, request, pk=None):
        ip = self.get_object()

        prepare = Path.objects.get(entity="ingest_workarea").value
        xmlfile = os.path.join(prepare, "%s.xml" % pk)

        step = ProcessStep.objects.create(
            name="Validation",
            information_package=ip
        )

        step.add_tasks(
            ProcessTask.objects.create(
                name="ESSArch_Core.tasks.ValidateXMLFile",
                params={
                    "xml_filename": xmlfile
                },
                log=EventIP,
                information_package=ip,
                responsible=self.request.user,
            ),
            ProcessTask.objects.create(
                name="ESSArch_Core.tasks.ValidateFiles",
                params={
                    "ip": ip.pk,
                    "mets_path": xmlfile,
                    "validate_fileformat": True,
                    "validate_integrity": True,
                },
                log=EventIP,
                processstep_pos=0,
                information_package=ip,
                responsible=self.request.user,
            )
        )

        step.run()

        return Response("Validating IP")

    def destroy(self, request, pk=None):

        delete_from_reception = request.data.get('reception', True)
        delete_from_workarea = request.data.get('workarea', False)

        objid = self.get_object().object_identifier_value
        paths = []

        if delete_from_reception:
            reception = Path.objects.get(entity="path_ingest_reception").value
            uip = Path.objects.get(entity="path_ingest_unidentified").value

            xmlfile = os.path.join(reception, "%s.xml" % objid)
            srcdir = reception

            if not os.path.isfile(xmlfile):
                xmlfile = os.path.join(uip, "%s.xml" % objid)
                srcdir = uip

            if os.path.isfile(xmlfile):
                doc = etree.parse(xmlfile)
                root = doc.getroot()

                el = root.xpath('.//*[local-name()="%s"]' % "FLocat")[0]
                objpath = get_value_from_path(el, "@href").split('file:///')[1]
                path = os.path.join(srcdir, objpath)
                no_ext = os.path.splitext(path)[0]

                paths.append(path)
                paths += [no_ext + '.' + ext for ext in ['xml', 'tar', 'zip']]

        if delete_from_workarea:
            workarea = Path.objects.get(entity="ingest_workarea").value
            path = os.path.join(workarea, objid)
            no_ext = os.path.splitext(path)[0]

            paths.append(path)
            paths += [no_ext + '.' + ext for ext in ['xml', 'tar', 'zip']]


        step = ProcessStep.objects.create(
            name="Delete files",
            eager=False,
            parallel=True,
        )

        for path in paths:
            t = ProcessTask.objects.create(
                name='ESSArch_Core.tasks.DeleteFiles',
                params={'path': path},
                processstep=step,
                responsible=request.user,
            )

        step.run()

        return super(InformationPackageViewSet, self).destroy(request, pk=pk)

    @detail_route()
    def steps(self, request, pk=None):
        ip = self.get_object()
        steps = ip.steps.all()
        serializer = ProcessStepSerializer(
            data=steps, many=True, context={'request': request}
        )
        serializer.is_valid()
        return Response(serializer.data)

    @detail_route(methods=['get'])
    def files(self, request, pk=None):
        ip = self.get_object()
        return ip.files(request.query_params.get('path', '').rstrip('/'), paginator=self.paginator, request=request)


class WorkareaViewSet(InformationPackageViewSet):
    def get_queryset(self):
        user = self.request.user
        see_all = self.request.user.has_perm('ip.see_all_in_workspaces')
        qs = super(WorkareaViewSet, self).get_queryset()

        if not see_all:
            qs = qs.filter(workareas__user=user)

        return qs


class WorkareaFilesViewSet(viewsets.ViewSet, PaginatedViewMixin):
    def validate_path(self, path, root, existence=True):
        relpath = os.path.relpath(path, root)

        if not in_directory(path, root):
            raise exceptions.ParseError('Illegal path %s' % relpath)

        if existence and not os.path.exists(path):
            raise exceptions.NotFound('Path "%s" does not exist' % relpath)

    def list(self, request):
        root = os.path.join(Path.objects.get(entity='ingest_workarea').value, request.user.username)

        path = request.query_params.get('path', '').strip('/ ')
        force_download = request.query_params.get('download', False)
        fullpath = os.path.join(root, path)

        try:
            self.validate_path(fullpath, root)
        except exceptions.NotFound:
            if len(fullpath.split('.tar/')) == 2:
                tar_path, tar_subpath = fullpath.split('.tar/')
                tar_path += '.tar'
                if not os.path.isfile(tar_path):
                    raise
            else:
                raise

        return list_files(fullpath, force_download, paginator=self.paginator, request=request)
