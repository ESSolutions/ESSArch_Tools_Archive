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

import errno
import glob
import json
import mimetypes
import os
import shutil
import uuid

from celery import states as celery_states

from django.conf import settings
from django.db import IntegrityError
from django.db.models import Prefetch
from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend

from lxml import etree

from rest_framework import exceptions, filters, status
from rest_framework.decorators import detail_route, list_route
from rest_framework.response import Response

from ESSArch_Core.configuration.models import (
    EventType,
    Path,
)

from ESSArch_Core.essxml.util import (
    get_agent,
    get_objectpath,
    parse_submit_description,
)

from ESSArch_Core.ip.models import (
    ArchivalInstitution,
    ArchivistOrganization,
    ArchivalType,
    ArchivalLocation,
    InformationPackage,
    EventIP
)

from ESSArch_Core.ip.permissions import (
    CanDeleteIP,
    CanTransferSIP,
)

from ESSArch_Core.pagination import LinkHeaderPagination

from ESSArch_Core.WorkflowEngine.models import (
    ProcessStep,
    ProcessTask
)

from ESSArch_Core.WorkflowEngine.serializers import (
    ProcessStepSerializer,
)

from ESSArch_Core.util import (
    creation_date,
    get_files_and_dirs,
    get_event_spec,
    get_value_from_path,
    in_directory,
    parse_content_range_header,
    timestamp_to_datetime,
    remove_prefix
)

from ip.filters import (
    ArchivalInstitutionFilter,
    ArchivistOrganizationFilter,
    ArchivalTypeFilter,
    ArchivalLocationFilter,
    InformationPackageFilter,
)

from ip.serializers import (
    ArchivalInstitutionSerializer,
    ArchivistOrganizationSerializer,
    ArchivalTypeSerializer,
    ArchivalLocationSerializer,
    InformationPackageSerializer,
    EventIPSerializer,
)

from rest_framework import viewsets


class ArchivalInstitutionViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows archival institutions to be viewed or edited.
    """
    queryset = ArchivalInstitution.objects.all()
    serializer_class = ArchivalInstitutionSerializer

    filter_backends = (DjangoFilterBackend,)
    filter_class = ArchivalInstitutionFilter

class ArchivistOrganizationViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows archivist organizations to be viewed or edited.
    """
    queryset = ArchivistOrganization.objects.all()
    serializer_class = ArchivistOrganizationSerializer

    filter_backends = (DjangoFilterBackend,)
    filter_class = ArchivistOrganizationFilter

class ArchivalTypeViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows archival types to be viewed or edited.
    """
    queryset = ArchivalType.objects.all()
    serializer_class = ArchivalTypeSerializer

    filter_backends = (DjangoFilterBackend,)
    filter_class = ArchivalTypeFilter


class ArchivalLocationViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows archival locations to be viewed or edited.
    """
    queryset = ArchivalLocation.objects.all()
    serializer_class = ArchivalLocationSerializer

    filter_backends = (DjangoFilterBackend,)
    filter_class = ArchivalLocationFilter

class InformationPackageReceptionViewSet(viewsets.ViewSet):
    def list(self, request):
        reception = Path.objects.get(entity="path_ingest_reception").value
        uip = Path.objects.get(entity="path_ingest_unidentified").value
        ips = []

        for xmlfile in glob.glob(os.path.join(reception, "*.xml")) + glob.glob(os.path.join(uip, "*.xml")):
            if os.path.isfile(xmlfile):
                if xmlfile.startswith(uip):
                    srcdir = uip
                else:
                    srcdir = reception

                ip = parse_submit_description(xmlfile, srcdir)
                ip['state'] = 'At reception'
                ip['status'] = 100
                ip['step_state'] = celery_states.SUCCESS
                if not InformationPackage.objects.filter(object_identifier_value=ip['object_identifier_value']).exists():
                    ips.append(ip)

        for container_file in glob.glob(os.path.join(uip, "*.tar")) + glob.glob(os.path.join(uip, "*.zip")):
            ip = {
                'object_identifier_value': os.path.basename(container_file),
                'label': os.path.basename(container_file),
                'create_date': str(timestamp_to_datetime(creation_date(container_file)).isoformat()),
                'state': 'Unidentified',
                'status': 0,
                'step_state': celery_states.SUCCESS,
            }

            include = True

            for xmlfile in glob.glob(os.path.join(uip, "*.xml")):
                if os.path.isfile(xmlfile):
                    doc = etree.parse(xmlfile)
                    root = doc.getroot()

                    el = root.xpath('.//*[local-name()="%s"]' % "FLocat")[0]
                    if ip['label'] == get_value_from_path(el, "@href").split('file:///')[1]:
                        include = False
                        break

            if include:
                ips.append(ip)

        from_db = InformationPackage.objects.filter(state='Receiving').prefetch_related(
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

        paginator = LinkHeaderPagination()
        page = paginator.paginate_queryset(ips, request)
        if page is not None:
            return paginator.get_paginated_response(page)

        return Response(ips)

    def retrieve(self, request, pk=None):
        path = Path.objects.get(entity="path_ingest_reception").value
        fullpath = os.path.join(path, "%s.xml" % pk)

        if not os.path.exists(fullpath):
            raise exceptions.NotFound

        return Response(parse_submit_description(fullpath, srcdir=path))

    @detail_route(methods=['get'])
    def files(self, request, pk=None):
        reception = Path.objects.get(entity="path_ingest_reception").value
        xml = os.path.join(reception, "%s.xml" % pk)

        if not os.path.exists(xml):
            raise exceptions.NotFound

        ip = parse_submit_description(xml, srcdir=reception)
        container = ip['object_path']

        path = request.query_params.get('path')

        if path in [os.path.basename(container), os.path.basename(xml)]:
            fullpath = os.path.join(os.path.dirname(container), path)
            content_type, _ = mimetypes.guess_type(fullpath)
            return HttpResponse(open(fullpath).read(), content_type=content_type)
        elif path is not None:
            raise exceptions.NotFound

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

        ProcessTask.objects.create(
            name="ESSArch_Core.tasks.ValidateIntegrity",
            params={
                "filename": filepath,
                "checksum": md5,
                "algorithm": 'MD5'
            },
            responsible=self.request.user,
        ).run().get()

        return Response('Upload of %s complete' % filepath)

    @detail_route(methods=['post'], url_path='receive')
    def receive(self, request, pk=None):
        if InformationPackage.objects.filter(object_identifier_value=pk).exists():
            raise exceptions.ParseError('IP with id "%s" already exist')

        reception = Path.objects.get(entity="path_ingest_reception").value
        uip = Path.objects.get(entity="path_ingest_unidentified").value
        xmlfile = os.path.join(reception, "%s.xml" % pk)
        srcdir = reception
        if not os.path.isfile(xmlfile):
            xmlfile = os.path.join(uip, "%s.xml" % pk)
            srcdir = uip

        doc = etree.parse(xmlfile)
        root = doc.getroot()
        objpath = os.path.join(srcdir, get_objectpath(root))

        objid, container_type = os.path.splitext(os.path.basename(objpath))
        parsed = parse_submit_description(xmlfile, srcdir=os.path.split(objpath)[0])

        ip = InformationPackage.objects.create(
            object_identifier_value=objid, label=parsed.get("label"), state="Receiving",
            responsible=self.request.user, object_path=parsed['object_path'],
            object_size=parsed['object_size'], create_date=parsed['create_date'],
        )

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
                    name="preingest.tasks.ValidateXMLFile",
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
                    name="preingest.tasks.ValidateFiles",
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
                    name="preingest.tasks.ValidateLogicalPhysicalRepresentation",
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

        ProcessTask.objects.create(
            name="preingest.tasks.ReceiveSIP",
            args=[ip.pk, xmlfile, objpath],
            processstep_pos=0,
            log=EventIP,
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
            name="preingest.tasks.UpdateIPStatus",
            args=[ip.pk],
            params={
                "status": "Received",
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
            name='preingest.tasks.GenerateXML',
            params={
                'info': spec_data,
                'filesToCreate': {
                    infoxml: spec
                },
                'folderToParse': container_file,
            },
        ).run()

        return Response({'status': 'Identified IP, created %s' % infoxml})


class InformationPackageViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows information packages to be viewed or edited.
    """
    queryset = InformationPackage.objects.all().prefetch_related(
        Prefetch('profileip_set', to_attr='profiles'), 'profiles__profile',
        'archival_institution', 'archivist_organization', 'archival_type', 'archival_location',
        'responsible__user_permissions', 'responsible__groups__permissions', 'steps',
    ).select_related('submission_agreement')
    serializer_class = InformationPackageSerializer
    filter_backends = (
        filters.OrderingFilter, DjangoFilterBackend, filters.SearchFilter,
    )
    ordering_fields = (
        'label', 'responsible', 'create_date', 'state', 'eventDateTime',
        'eventType', 'eventOutcomeDetailNote', 'eventOutcome',
        'linkingAgentIdentifierValue', 'id', 'object_identifier_value',
    )
    search_fields = (
        'object_identifier_value', 'label', 'responsible__first_name',
        'responsible__last_name', 'responsible__username', 'state',
        'submission_agreement__name', 'start_date', 'end_date',
    )
    filter_class = InformationPackageFilter

    def get_permissions(self):
        if self.action == 'destroy':
            self.permission_classes = [CanDeleteIP]

        return super(InformationPackageViewSet, self).get_permissions()

    def get_queryset(self):
        queryset = self.queryset

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
        dstdir = Path.objects.get(entity="path_gate_reception").value

        info = {
            "_OBJID": ip.object_identifier_value,
            "_OBJLABEL": ip.label
        }

        events_path = os.path.join(dstdir, "%s_ipevents.xml" % ip.object_identifier_value)
        filesToCreate = {
            events_path: get_event_spec()
        }

        step = ProcessStep.objects.create(
            name="Transfer SIP",
            information_package=ip,
            eager=False,
        )

        step.add_tasks(
            ProcessTask.objects.create(
                name="preingest.tasks.UpdateIPStatus",
                params={
                    "ip": ip.pk,
                    "status": "Transferring",
                },
                processstep_pos=10,
                log=EventIP,
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
                processstep_pos=15,
                log=EventIP,
                information_package=ip,
                responsible=self.request.user,
            )
        )

        step.add_tasks(
            ProcessTask.objects.create(
                name="preingest.tasks.GenerateXML",
                params={
                    "info": info,
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
                name="preingest.tasks.AppendEvents",
                params={
                    "filename": events_path,
                    "events": ip.events.all(),
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
                name="preingest.tasks.UpdateIPStatus",
                params={
                    "ip": ip.pk,
                    "status": "Transferred",
                },
                processstep_pos=50,
                log=EventIP,
                information_package=ip,
                responsible=self.request.user,
            )
        )

        step.run()

        return Response("IP Transferred")

    @detail_route(methods=['post'], url_path='validate')
    def validate(self, request, pk=None):
        ip = self.get_object()

        prepare = Path.objects.get(entity="path_ingest_work").value
        xmlfile = os.path.join(prepare, "%s.xml" % pk)

        step = ProcessStep.objects.create(
            name="Validation",
            information_package=ip
        )

        step.add_tasks(
            ProcessTask.objects.create(
                name="preingest.tasks.ValidateXMLFile",
                params={
                    "xml_filename": xmlfile
                },
                log=EventIP,
                information_package=ip,
                responsible=self.request.user,
            ),
            ProcessTask.objects.create(
                name="preingest.tasks.ValidateFiles",
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
        reception = Path.objects.get(entity="path_ingest_reception").value
        uip = Path.objects.get(entity="path_ingest_unidentified").value

        xmlfile = os.path.join(reception, "%s.xml" % pk)
        srcdir = reception

        if not os.path.isfile(xmlfile):
            xmlfile = os.path.join(uip, "%s.xml" % pk)
            srcdir = uip

        if os.path.isfile(xmlfile):
            doc = etree.parse(xmlfile)
            root = doc.getroot()

            el = root.xpath('.//*[local-name()="%s"]' % "FLocat")[0]
            objpath = get_value_from_path(el, "@href").split('file:///')[1]
            path = os.path.join(srcdir, objpath)

            try:
                shutil.rmtree(path)
            except OSError as e:
                if e.errno in [errno.ENOENT, errno.ENOTDIR]:
                    os.remove(path)
                else:
                    raise
            finally:
                for fl in glob.glob(os.path.splitext(xmlfile)[0] + "*"):
                    try:
                        os.remove(fl)
                    except:
                        raise

        if InformationPackage.objects.filter(pk=pk).exists():
            return super(InformationPackageViewSet, self).destroy(request, pk=pk)
        else:
            return Response(status=status.HTTP_204_NO_CONTENT)

    @detail_route()
    def events(self, request, pk=None):
        ip = self.get_object()
        events = filters.OrderingFilter().filter_queryset(request, ip.events.all(), self)
        page = self.paginate_queryset(events)
        if page is not None:
            serializers = EventIPSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializers.data)
        serializers = EventIPSerializer(events, many=True, context={'request': request})
        return Response(serializers.data)

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
        path = request.query_params.get('path')

        container = ip.object_path
        xml = os.path.splitext(ip.object_path)[0] + '.xml'

        if path in [os.path.basename(container), os.path.basename(xml)]:
            fullpath = os.path.join(os.path.dirname(container), path)
            content_type, _ = mimetypes.guess_type(fullpath)
            return HttpResponse(open(fullpath).read(), content_type=content_type)
        elif path is not None:
            raise exceptions.NotFound

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


class EventIPViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows events to be viewed or edited.
    """
    queryset = EventIP.objects.all()
    serializer_class = EventIPSerializer
    filter_backends = (
        filters.OrderingFilter, DjangoFilterBackend,
    )
    ordering_fields = (
        'id', 'eventType', 'eventOutcomeDetailNote', 'eventOutcome',
        'linkingAgentIdentifierValue', 'eventDateTime',
    )

    def create(self, request):
        """
        """

        outcomeDetailNote = request.data.get('eventOutcomeDetailNote', None)
        outcome = request.data.get('eventOutcome', 0)
        type_id = request.data.get('eventType', None)
        ip_id = request.data.get('information_package', None)

        eventType = EventType.objects.get(pk=type_id)
        ip = InformationPackage.objects.get(pk=ip_id)
        agent = request.user

        EventIP.objects.create(
            eventOutcome=outcome, eventOutcomeDetailNote=outcomeDetailNote,
            eventType=eventType, linkingObjectIdentifierValue=ip,
            linkingAgentIdentifierValue=agent,
        )
        return Response({"status": "Created event"})
