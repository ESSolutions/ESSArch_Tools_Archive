import errno, glob, json, os, shutil, uuid

from celery import states as celery_states

from django.conf import settings
from django.db import IntegrityError
from django.db.models import Prefetch
from django_filters.rest_framework import DjangoFilterBackend

from lxml import etree

from rest_framework import filters, status
from rest_framework.decorators import detail_route, list_route
from rest_framework.response import Response

from ESSArch_Core.configuration.models import (
    EventType,
    Path,
)

from ESSArch_Core.ip.models import (
    ArchivalInstitution,
    ArchivistOrganization,
    ArchivalType,
    ArchivalLocation,
    InformationPackage,
    EventIP
)

from ESSArch_Core.WorkflowEngine.models import (
    ProcessStep,
    ProcessTask
)

from ESSArch_Core.profiles.models import (
    Profile,
)

from ESSArch_Core.util import (
    creation_date,
    get_files_and_dirs,
    get_event_spec,
    get_value_from_path,
    timestamp_to_datetime,
    remove_prefix
)

from ip.filters import InformationPackageFilter

from ip.serializers import (
    ArchivalInstitutionSerializer,
    ArchivistOrganizationSerializer,
    ArchivalTypeSerializer,
    ArchivalLocationSerializer,
    InformationPackageSerializer,
    InformationPackageDetailSerializer,
    EventIPSerializer,
)

from preingest.serializers import (
    ProcessStepSerializer,
)

from preingest.pagination import (
    LinkHeaderPagination
)

from rest_framework import viewsets

class ArchivalInstitutionViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows archival institutions to be viewed or edited.
    """
    queryset = ArchivalInstitution.objects.all()
    serializer_class = ArchivalInstitutionSerializer

class ArchivistOrganizationViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows archivist organizations to be viewed or edited.
    """
    queryset = ArchivistOrganization.objects.all()
    serializer_class = ArchivistOrganizationSerializer

class ArchivalTypeViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows archival types to be viewed or edited.
    """
    queryset = ArchivalType.objects.all()
    serializer_class = ArchivalTypeSerializer

class ArchivalLocationViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows archival locations to be viewed or edited.
    """
    queryset = ArchivalLocation.objects.all()
    serializer_class = ArchivalLocationSerializer

class InformationPackageReceptionViewSet(viewsets.ViewSet):
    def get_archvist_organization(self, el):
        return el.xpath(
            ".//*[local-name()='agent'][@ROLE='ARCHIVIST'][@TYPE='ORGANIZATION']"
        )[0].xpath(
            "*[local-name()='name']"
        )[0].text


    def parseFile(self, path):
        ip = {}
        doc = etree.parse(path)
        root = doc.getroot()

        try:
            ip['id'] = root.get('OBJID').split(':')[1]
        except:
            ip['id'] = root.get('OBJID')

        ip['Label'] = root.get('LABEL')
        ip['CreateDate'] = root.find("{*}metsHdr").get('CREATEDATE')
        ip['State'] = "At reception"
        ip['status'] = 100.0
        ip['step_state'] = celery_states.SUCCESS
        ip['ArchivistOrganization'] = {
            'name': self.get_archvist_organization(root)
        }

        return ip

    def list(self, request):
        reception = Path.objects.get(entity="path_ingest_reception").value
        uip = Path.objects.get(entity="path_ingest_unidentified").value
        ips = []

        for xmlfile in glob.glob(os.path.join(reception, "*.xml")):
            if os.path.isfile(xmlfile):
                ip = self.parseFile(xmlfile)
                if not InformationPackage.objects.filter(id=ip['id']).exists():
                    ips.append(ip)

        for xmlfile in glob.glob(os.path.join(uip, "*.xml")):
            if os.path.isfile(xmlfile):
                ip = self.parseFile(xmlfile)
                if not InformationPackage.objects.filter(id=ip['id']).exists():
                    ips.append(ip)

        for container_file in glob.glob(os.path.join(uip, "*.tar")) + glob.glob(os.path.join(uip, "*.zip")):
            ip = {
                'Label': os.path.basename(container_file),
                'CreateDate': str(timestamp_to_datetime(creation_date(container_file)).isoformat()),
                'State': 'Unidentified',
                'status': 0,
                'step_state': celery_states.SUCCESS,
            }

            include = True

            for xmlfile in glob.glob(os.path.join(uip, "*.xml")):
                if os.path.isfile(xmlfile):
                    doc = etree.parse(xmlfile)
                    root = doc.getroot()

                    el = root.xpath('.//*[local-name()="%s"]' % "FLocat")[0]
                    if ip['Label'] == get_value_from_path(el, "@href").split('file:///')[1]:
                        include = False
                        break

            if include:
                ips.append(ip)


        from_db = InformationPackage.objects.filter(State='Receiving').prefetch_related(
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
        return Response(self.parseFile(os.path.join(path, "%s.xml" % pk)))

    @detail_route(methods=['post'], url_path='create-ip')
    def create_ip(self, request, pk=None):
        reception = Path.objects.get(entity="path_ingest_reception").value
        uip = Path.objects.get(entity="path_ingest_unidentified").value
        xmlfile = os.path.join(reception, "%s.xml" % pk)
        srcdir = reception
        if not os.path.isfile(xmlfile):
            xmlfile = os.path.join(uip, "%s.xml" % pk)
            srcdir = uip

        doc = etree.parse(xmlfile)
        root = doc.getroot()

        el = root.xpath('.//*[local-name()="%s"]' % "FLocat")[0]
        objpath = get_value_from_path(el, "@href").split('file:///')[1]
        objpath = os.path.join(srcdir, objpath)

        ipdata = self.parseFile(xmlfile)

        responsible = self.request.user.username or "Anonymous user"
        archivist_organization = self.get_archvist_organization(root)

        try:
            (arch, _) = ArchivistOrganization.objects.get_or_create(
                name = archivist_organization
            )
        except IntegrityError:
            arch = ArchivistOrganization.objects.get(
                name = archivist_organization
            )

        ip = InformationPackage.objects.create(
            id=pk, Label=ipdata["Label"], State="Receiving",
            Responsible=responsible, ObjectPath=objpath,
            ArchivistOrganization=arch,
        )
        ip.CreateDate = ipdata["CreateDate"]
        ip.save()

        step = ProcessStep.objects.create(
            name="Receive SIP",
            information_package=ip
        )

        validators = request.data.get('validators', {})
        if any(validators.itervalues()):
            validation_step = ProcessStep.objects.create(
                name="Validate",
                parent_step=step
            )

            if validators.get('validate_xml_file', False):
                validation_step.tasks.add(
                    ProcessTask.objects.create(
                        name="preingest.tasks.ValidateXMLFile",
                        params={
                            "xml_filename": xmlfile
                        },
                        log=EventIP,
                        information_package=ip,
                        responsible=self.request.user,
                    )
                )

            val_format = validators.get("validate_file_format", False)
            val_integrity = validators.get("validate_integrity", False)

            if val_format or val_integrity:
                validation_step.tasks.add(
                    ProcessTask.objects.create(
                        name="preingest.tasks.ValidateFiles",
                        params={
                            "ip": ip,
                            "rootdir": srcdir,
                            "xmlfile": xmlfile,
                            "validate_fileformat": val_format,
                            "validate_integrity": val_integrity
                        },
                        log=EventIP,
                        information_package=ip,
                        responsible=self.request.user,
                    )
                )

            files = [objpath]

            if validators.get('validate_logical_physical_representation'):
                validation_step.tasks.add(
                    ProcessTask.objects.create(
                        name="preingest.tasks.ValidateLogicalPhysicalRepresentation",
                        params={
                            "files": files,
                            "xmlfile": xmlfile,
                        },
                        log=EventIP,
                        information_package=ip,
                        responsible=self.request.user,
                    )
                )

        receive_step = ProcessStep.objects.create(
            name="Receive",
        )

        receive_step.tasks.add(
            ProcessTask.objects.create(
                name="preingest.tasks.ReceiveSIP",
                params={
                    "ip": ip,
                },
                information_package=ip,
                processstep_pos=0,
                log=EventIP,
                responsible=self.request.user,
            ),
            ProcessTask.objects.create(
                name="preingest.tasks.UpdateIPStatus",
                params={
                    "status": "Received",
                    "ip": ip
                },
                information_package=ip,
                processstep_pos=1,
                log=EventIP,
                responsible=self.request.user,
            )
        )
        receive_step.save()

        step.child_steps.add(receive_step)
        step.save()
        step.run()

        return Response("IP Received")

    @list_route(methods=['post'], url_path='identify-ip')
    def identify_ip(self, request):
        fname = request.data.get('label')
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

        ip_id = uuid.uuid4()

        spec_data['_OBJID'] = unicode(ip_id)
        spec_data['_OBJLABEL'] = spec_data.pop('LABEL')
        spec_data['_IP_CREATEDATE'] = timestamp_to_datetime(
            creation_date(container_file)
        ).isoformat()

        infoxml = u'%s.xml' % unicode(ip_id)
        infoxml = os.path.join(uip, infoxml)

        ProcessTask(
            name='preingest.tasks.GenerateXML',
            params={
                'info': spec_data,
                'filesToCreate': {
                    infoxml: spec
                },
                'folderToParse': container_file,
            },
        ).run_eagerly()

        return Response({'status': 'Identified IP, created %s' % infoxml})


class InformationPackageViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows information packages to be viewed or edited.
    """
    queryset = InformationPackage.objects.all().prefetch_related(
        Prefetch('profileip_set', to_attr='profiles'), 'steps__child_steps',
    )
    serializer_class = InformationPackageSerializer
    filter_backends = (
        filters.OrderingFilter, DjangoFilterBackend, filters.SearchFilter,
    )
    ordering_fields = ('Label', 'Responsible', 'CreateDate', 'State', 'eventDateTime', 'eventDetail', 'id')
    search_fields = ('Label', 'Responsible', 'State', 'SubmissionAgreement__sa_name')
    filter_class = InformationPackageFilter

    def get_serializer_class(self):
        if self.action == 'list':
            return InformationPackageSerializer

        return InformationPackageDetailSerializer

    def get_queryset(self):
        queryset = self.queryset

        other = self.request.query_params.get('other')

        if other is not None:
            queryset = queryset.filter(
                ArchivalInstitution=None,
                ArchivistOrganization=None,
                ArchivalType=None,
                ArchivalLocation=None
            )

        return queryset

    @detail_route(methods=['post'], url_path='transfer')
    def transfer(self, request, pk=None):
        ip = self.get_object()
        dstdir = Path.objects.get(entity="path_gate_reception").value

        info = {
            "_OBJID": str(pk),
            "_OBJLABEL": ip.Label
        }

        events_path = os.path.join(dstdir, "%s_ipevents.xml" % pk)
        filesToCreate = {
            events_path: get_event_spec()
        }

        step = ProcessStep.objects.create(
            name="Transfer SIP",
            information_package=ip
        )

        step.tasks.add(
            ProcessTask.objects.create(
                name="preingest.tasks.UpdateIPStatus",
                params={
                    "ip": ip,
                    "status": "Transferring",
                },
                processstep_pos=10,
                log=EventIP,
                information_package=ip,
                responsible=self.request.user,
            )
        )

        step.tasks.add(
            ProcessTask.objects.create(
                name="preingest.tasks.TransferSIP",
                params={
                    "ip": ip,
                },
                processstep_pos=15,
                log=EventIP,
                information_package=ip,
                responsible=self.request.user,
            )
        )

        step.tasks.add(
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

        step.tasks.add(
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
                                    "#content": [{"text": "file:///%s.tar" % pk}],
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
                  "#content": [{"text":"premis:file"}]
                }
            ],
        }

        info = {
            'FIDType': "UUID",
            'FID': "%s" % str(ip.pk),
            'FFormatName': 'TAR',
            'FLocationType': 'URI',
            'FName': ip.ObjectPath,
        }

        step.tasks.add(
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

        step.tasks.add(
            ProcessTask.objects.create(
                name="preingest.tasks.UpdateIPStatus",
                params={
                    "ip": ip,
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

        step.tasks.add(
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
                    "ip": ip,
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

    @detail_route()
    def files(self, request, pk=None):
        ip = self.get_object()
        entries = []
        path = os.path.join(ip.ObjectPath, request.query_params.get('path', ''))

        for entry in get_files_and_dirs(path):
            entry_type = "dir" if entry.is_dir() else "file"
            entries.append(
                {
                    "name": os.path.basename(entry.path),
                    "type": entry_type
                }
            )

        return Response(entries)


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
        agent = request.user.username or "System"

        EventIP.objects.create(
            eventOutcome=outcome, eventOutcomeDetailNote=outcomeDetailNote,
            eventType=eventType, linkingObjectIdentifierValue=ip,
            linkingAgentIdentifierValue=agent,
        )
        return Response({"status": "Created event"})
