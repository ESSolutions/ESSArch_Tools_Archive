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
import glob
import json
import logging
import os
import uuid

from celery import states as celery_states
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Prefetch
from groups_manager.utils import get_permission_name
from guardian.shortcuts import assign_perm
from lxml import etree
from rest_framework import exceptions, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response

from ESSArch_Core.auth.decorators import permission_required_or_403
from ESSArch_Core.auth.models import Member
from ESSArch_Core.WorkflowEngine.models import (ProcessStep, ProcessTask)
from ESSArch_Core.WorkflowEngine.util import create_workflow
from ESSArch_Core.configuration.models import (Path,)
from ESSArch_Core.essxml.util import get_agents, get_objectpath, parse_submit_description
from ESSArch_Core.fixity.validation.backends.checksum import ChecksumValidator
from ESSArch_Core.ip.models import Agent, InformationPackage, EventIP
from ESSArch_Core.ip.permissions import CanTransferSIP, IsResponsibleOrCanSeeAllFiles
from ESSArch_Core.ip.views import InformationPackageViewSet as InformationPackageViewSetCore
from ESSArch_Core.mixins import GetObjectForUpdateViewMixin, PaginatedViewMixin
from ESSArch_Core.profiles.models import ProfileIP, SubmissionAgreement
from ESSArch_Core.util import (
    creation_date,
    flatten,
    get_immediate_subdirectories,
    get_value_from_path,
    in_directory,
    list_files,
    normalize_path,
    parse_content_range_header,
    timestamp_to_datetime,
    remove_prefix,
)

from .filters import InformationPackageFilter
from .serializers import InformationPackageSerializer, InformationPackageReadSerializer


class InformationPackageReceptionViewSet(viewsets.ViewSet, PaginatedViewMixin):

    def __init__(self, *args, **kwargs):
        self.logger = logging.getLogger('essarch.reception')
        self.reception = Path.objects.get(entity="path_ingest_reception").value
        self.uip = Path.objects.get(entity="path_ingest_unidentified").value
        super().__init__(*args, **kwargs)

    def get_queryset(self):
        user = self.request.user
        return InformationPackage.objects.visible_to_user(user).filter(state='Prepared')

    def parse_ip_with_xmlfile(self, xmlfile):
        if xmlfile.startswith(self.uip):
            srcdir = self.uip
        else:
            srcdir = self.reception

        try:
            ip = parse_submit_description(xmlfile, srcdir)
        except (etree.LxmlError, ValueError):
            self.logger.exception(u'Failed to parse {}'.format(xmlfile))
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
            'object_path': directory.path,
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
                except (etree.LxmlError, ValueError):
                    continue

                objid = ip['object_identifier_value']
                if not InformationPackage.objects.filter(object_identifier_value=objid).exists():
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
            objid = ip['object_identifier_value']
            if not InformationPackage.objects.filter(object_identifier_value=objid).exists():
                ips.append(ip)

        states = ['Prepared', 'Receiving']
        from_db = InformationPackage.objects.visible_to_user(request.user).filter(state__in=states).prefetch_related(
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
                if path == container:
                    return Response(self.parse_unidentified_ip(container))

        for directory in self.get_directories():
            for path in paths:
                if path == directory.path:
                    return Response(self.parse_directory_ip(directory))

        raise exceptions.NotFound()

    action(detail=True, methods=['get'])
    def files(self, request, pk=None):
        reception = Path.objects.get(entity="path_ingest_reception").value
        path = request.query_params.get('path', '').rstrip('/ ')
        download = request.query_params.get('download', False)

        if os.path.isdir(os.path.join(reception, pk)):
            path = os.path.join(reception, pk, path)
            return list_files(path, force_download=download, paginator=self.paginator, request=request)

        xml = os.path.join(reception, "%s.xml" % pk)

        if not os.path.exists(xml):
            raise exceptions.NotFound

        ip = parse_submit_description(xml, srcdir=reception)
        container = ip['object_path']

        if len(path):
            path = os.path.join(os.path.dirname(container), path)
            return list_files(path, force_download=download, paginator=self.paginator, request=request)

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

    action(detail=False, methods=['post'])
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

    action(detail=False, methods=['post'])
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

    @transaction.atomic
    action(detail=True, methods=['post'])
    def prepare(self, request, pk=None):
        perms = copy.deepcopy(getattr(settings, 'IP_CREATION_PERMS_MAP', {}))

        organization = request.user.user_profile.current_organization
        if organization is None:
            raise exceptions.ParseError('You must be part of an organization to prepare an IP')

        member = Member.objects.get(django_user=request.user)

        existing = InformationPackage.objects.filter(object_identifier_value=pk).first()
        if existing is not None:
            self.logger.warn(
                'Tried to prepare IP with id %s which already exists' % (pk),
                extra={'user': request.user.pk}
            )
            raise exceptions.ParseError('IP with id %s already exists: %s' % (pk, str(existing.pk)))

        reception = Path.objects.values_list('value', flat=True).get(entity="path_ingest_reception")
        xmlfile = None

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
                self.logger.warn(
                    'Tried to prepare IP with missing XML file %s' % (xmlfile),
                    extra={'user': request.user.pk}
                )
                raise exceptions.ParseError('%s does not exist' % xmlfile)

            try:
                container = os.path.join(reception, self.get_container_for_xml(xmlfile))
                objpath = container
            except etree.LxmlError:
                self.logger.warn(
                    'Tried to prepare IP with invalid XML file %s' % (xmlfile),
                    extra={'user': request.user.pk}
                )
                raise exceptions.ParseError('Invalid XML file, %s' % xmlfile)

            if not os.path.isfile(container):
                self.logger.warn(
                    'Tried to prepare IP with missing container file %s' % (container),
                    extra={'user': request.user.pk}
                )
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
        except (ValidationError, ValueError, SubmissionAgreement.DoesNotExist):
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
            object_path=normalize_path(objpath),
        )

        # refresh date fields to convert them to datetime instances instead of
        # strings to allow further datetime manipulation
        ip.refresh_from_db(fields=['entry_date', 'start_date', 'end_date'])

        if xmlfile is not None:
            for agent_el in get_agents(etree.parse(xmlfile)):
                agent = Agent.objects.from_mets_element(agent_el)
                ip.agents.add(agent)

        user_perms = perms.pop('owner', [])
        organization.assign_object(ip, custom_permissions=perms)
        organization.add_object(ip)

        for perm in user_perms:
            perm_name = get_permission_name(perm, ip)
            assign_perm(perm_name, member.django_user, ip)

        p_types = ['transfer_project', 'sip', 'preservation_metadata', 'submit_description', 'validation']
        ip.create_profile_rels(p_types, request.user)

        data = InformationPackageReadSerializer(ip, context={'request': request}).data

        self.logger.info('Prepared information package %s' % str(ip.pk), extra={'user': request.user.pk})
        return Response(data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    @permission_required_or_403(['ip.receive'])
    action(detail=True, methods=['post'], url_path='receive')
    def receive(self, request, pk=None):
        try:
            ip = get_object_or_404(self.get_queryset(), id=pk)
        except (ValueError, ValidationError):
            raise exceptions.NotFound('Information package with id="%s" not found' % pk)

        if ip.state != 'Prepared':
            self.logger.warn(
                'Tried to receive IP %s from reception which is in state "%s"' % (pk, ip.state),
                extra={'user': request.user.pk}
            )
            raise exceptions.ParseError('Information package must be in state "Prepared"')

        for profile_ip in ProfileIP.objects.filter(ip=ip).iterator():
            try:
                profile_ip.clean()
            except ValidationError as e:
                raise exceptions.ParseError('%s: %s' % (profile_ip.profile.name, e[0]))

            profile_ip.LockedBy = request.user
            profile_ip.save()

        workflow_spec = [
            {
                "step": True,
                "name": "Receive",
                "children": [
                    {
                        "name": "ESSArch_Core.tasks.UpdateIPStatus",
                        "label": "Set status to receiving",
                        "args": ["Receiving"],
                    },
                    {
                        "name": "preingest.tasks.ReceiveSIP",
                        "label": "Receive SIP",
                    },
                    {
                        "name": "ESSArch_Core.ip.tasks.ParseEvents",
                        "label": "Parse events",
                    },
                    {
                        "name": "ESSArch_Core.tasks.UpdateIPSizeAndCount",
                        "label": "Update IP size and file count",
                    },
                    {
                        "name": "ESSArch_Core.tasks.UpdateIPStatus",
                        "label": "Set status to received",
                        "args": ["Received"],
                    },
                ]
            },
        ]
        workflow = create_workflow(workflow_spec, ip)
        workflow.name = "Receive SIP"
        workflow.information_package = ip
        workflow.save()
        workflow.run()

        return Response("receiving ip")

    action(detail=False, methods=['post'], url_path='identify-ip')
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


class InformationPackageViewSet(InformationPackageViewSetCore, GetObjectForUpdateViewMixin):
    """
    API endpoint that allows information packages to be viewed or edited.
    """
    filterset_class = InformationPackageFilter

    def get_serializer_class(self):
        if self.request.method in permissions.SAFE_METHODS:
            return InformationPackageReadSerializer

        return InformationPackageSerializer

    @transaction.atomic
    action(detail=True, methods=['post'], url_path='transfer', permission_classes=[CanTransferSIP])
    def transfer(self, request, pk=None):
        ip = self.get_object_for_update()

        workflow_spec = [
            {
                "name": "ESSArch_Core.tasks.UpdateIPStatus",
                "label": "Set status to transferring",
                "args": ["Transferring"],
            },
            {
                "step": True,
                "name": "Create Log File",
                "children": [
                    {
                        "name": "ESSArch_Core.ip.tasks.GenerateEventsXML",
                        "label": "Generate events xml file",
                    },
                    {
                        "name": "ESSArch_Core.tasks.AppendEvents",
                        "label": "Add events to xml file",
                    },
                    {
                        "name": "ESSArch_Core.ip.tasks.AddPremisIPObjectElementToEventsFile",
                        "label": "Add premis IP object to xml file",
                    },

                ]
            },
            {
                "name": "preingest.tasks.TransferSIP",
                "label": "Transfer SIP",
            },
            {
                "name": "ESSArch_Core.tasks.UpdateIPStatus",
                "label": "Set status to transferred",
                "args": ["Transferred"],
            },
        ]
        workflow = create_workflow(workflow_spec, ip)
        workflow.name = "Transfer SIP"
        workflow.information_package = ip
        workflow.save()
        workflow.run()
        return Response({'status': 'transferring ip'})

    @transaction.atomic
    action(detail=True, methods=['post'], url_path='validate')
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

    @transaction.atomic
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

            if os.path.isdir(os.path.join(srcdir, objid)):
                paths.append(os.path.join(srcdir, objid))

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
            path = os.path.join(workarea, request.user.username, objid)

            paths.append(path)
            paths += [path + '.' + ext for ext in ['xml', 'tar', 'zip']]

        step = ProcessStep.objects.create(
            name="Delete files",
            eager=False,
            parallel=True,
        )

        for path in paths:
            path = normalize_path(path)
            ProcessTask.objects.create(
                name='ESSArch_Core.tasks.DeleteFiles',
                params={'path': path},
                processstep=step,
                responsible=request.user,
            )

        step.run()

        return super().destroy(request, pk=pk)

    action(detail=True, methods=['get'], permission_classes=[IsResponsibleOrCanSeeAllFiles])
    def files(self, request, pk=None):
        ip = self.get_object()
        path = request.query_params.get('path', '').rstrip('/')
        download = request.query_params.get('download', False)
        return ip.get_path_response(path, request, force_download=download, paginator=self.paginator)


class WorkareaViewSet(InformationPackageViewSet):
    def get_queryset(self):
        user = self.request.user
        see_all = self.request.user.has_perm('ip.see_all_in_workspaces')
        qs = super().get_queryset()

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
