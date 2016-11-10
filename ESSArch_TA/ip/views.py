import glob, os, shutil

from django.core import serializers

from django_filters.rest_framework import DjangoFilterBackend

from lxml import etree

from rest_framework import filters, status
from rest_framework.decorators import detail_route
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
    ProfileIP
)

from ip.filters import InformationPackageFilter

from ip.serializers import (
    ArchivalInstitutionSerializer,
    ArchivistOrganizationSerializer,
    ArchivalTypeSerializer,
    ArchivalLocationSerializer,
    InformationPackageSerializer,
    EventIPSerializer,
)

from preingest.serializers import (
    ProcessStepSerializer,
)

from preingest.pagination import (
    LinkHeaderPagination
)

from ip.steps import (
    prepare_ip,
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

        return ip

    def list(self, request):
        path = Path.objects.get(entity="path_ingest_reception").value
        ips = []

        for xmlfile in glob.glob(os.path.join(path, "*.xml")):
            ip = self.parseFile(xmlfile)
            if not InformationPackage.objects.filter(id=ip['id']).exists():
                ips.append(self.parseFile(xmlfile))

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
        prepare = Path.objects.get(entity="path_ingest_prepare").value

        ipobj = self.parseFile(os.path.join(reception, "%s.xml" % pk))

        ip = InformationPackage.objects.create(
            id=pk, Label=ipobj.get("Label")
        )

        ip.CreateDate = ipobj.get("CreateDate")

        src = os.path.join(reception, "%s.tar" % pk)
        dst = os.path.join(prepare, "%s.tar" % pk)
        shutil.copy(src, dst)

        src = os.path.join(reception, "%s.xml" % pk)
        dst = os.path.join(prepare, "%s.xml" % pk)
        shutil.copy(src, dst)

        with open(os.path.join(reception, "%s_event_profile.json" % pk)) as f:
            json_str = f.read()
            for p in serializers.deserialize("json", json_str):
                p.save()

                ProfileIP.objects.create(
                    profile=p.object,
                    ip=ip
                )

        ip.save()

        return Response("IP Created")


class InformationPackageViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows information packages to be viewed or edited.
    """
    queryset = InformationPackage.objects.all()
    serializer_class = InformationPackageSerializer
    filter_backends = (
        filters.OrderingFilter, DjangoFilterBackend,
    )
    ordering_fields = ('Label', 'Responsible', 'CreateDate', 'State', 'eventDateTime', 'eventDetail', 'id')
    filter_class = InformationPackageFilter

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

        srcdir = Path.objects.get(entity="path_ingest_prepare").value
        dstdir = Path.objects.get(entity="path_gate_reception").value

        src = os.path.join(srcdir, "%s.tar" % pk)
        dst = os.path.join(dstdir, "%s.tar" % pk)
        shutil.copy(src, dst)

        src = os.path.join(srcdir, "%s.xml" % pk)
        dst = os.path.join(dstdir, "%s.xml" % pk)
        shutil.copy(src, dst)

        event_profile = ip.get_profile('event')
        info = event_profile.specification_data
        info["_OBJID"] = str(pk)
        info["_LABEL"] = ip.Label

        events_path = os.path.join(dstdir, "%s_ipevents.xml" % pk)
        filesToCreate = {
            events_path: event_profile.specification
        }

        step = ProcessStep.objects.create(
            name="Transfer SIP",
            information_package=ip
        )

        step.tasks.add(
            ProcessTask.objects.create(
                name="preingest.tasks.GenerateXML",
                params={
                    "info": info,
                    "filesToCreate": filesToCreate,
                },
                processstep_pos=0,
                information_package=ip
            )
        )

        step.tasks.add(
            ProcessTask.objects.create(
                name="preingest.tasks.AppendEvents",
                params={
                    "filename": events_path,
                    "events": ip.events.all(),
                },
                processstep_pos=1,
                information_package=ip
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
                                    "#content": [{"text": "file:///"},{"var": "FName"}],
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
                name="preingest.tasks.InsertXML",
                params={
                    "filename": events_path,
                    "elementToAppendTo": "premis",
                    "spec": spec,
                    "info": info,
                    "index": 0
                },
                processstep_pos=2,
                information_package=ip
            )
        )

        step.run()

        return Response("IP Transferred")

    @detail_route(methods=['post'], url_path='validate')
    def validate(self, request, pk=None):
        ip = self.get_object()

        prepare = Path.objects.get(entity="path_ingest_prepare").value
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
                information_package=ip
            ),
            ProcessTask.objects.create(
                name="preingest.tasks.ValidateFiles",
                params={
                    "ip": ip,
                    "mets_path": xmlfile,
                    "validate_fileformat": True,
                    "validate_integrity": True,
                },
                processstep_pos=0,
                information_package=ip
            )
        )

        step.run()

        return Response("Validating IP")

    def create(self, request):
        """
        Prepares a new information package (IP) using the following tasks:

        1. Creates a new IP in the database.

        2. Creates a directory in the prepare directory with the name set to
        the id of the new IP.

        3. Creates an event in the database connected to the IP and with the
        detail "Prepare IP".

        Args:

        Returns:
            None
        """


        label = request.data.get('label', None)
        responsible = self.request.user.username or "Anonymous user"

        prepare_ip(label, responsible).run()
        return Response({"status": "Prepared IP"})

    def destroy(self, request, pk=None):
        ip = InformationPackage.objects.get(pk=pk)

        try:
            shutil.rmtree(ip.ObjectPath)
        except:
            pass

        try:
            os.remove(ip.ObjectPath + ".tar")
        except:
            pass

        try:
            os.remove(ip.ObjectPath + ".zip")
        except:
            pass

        return super(InformationPackageViewSet, self).destroy(request, pk=pk)

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

    @detail_route(methods=['post'], url_path='create')
    def create_ip(self, request, pk=None):
        """
        Creates the specified information package

        Args:
            pk: The primary key (id) of the information package to create

        Returns:
            None
        """

        validators = request.data.get('validators', {})

        try:
            InformationPackage.objects.get(pk=pk).create(
                validate_xml_file=validators.get('validate_xml_file', False),
                validate_file_format=validators.get('validate_file_format', False),
                validate_integrity=validators.get('validate_integrity', False),
                validate_logical_physical_representation=validators.get('validate_logical_physical_representation', False),
            )

            return Response({'status': 'creating ip'})
        except InformationPackage.DoesNotExist:
            return Response(
                {'status': 'Information package with id %s does not exist' % pk},
                status=status.HTTP_404_NOT_FOUND
            )

    @detail_route(methods=['post'], url_path='submit')
    def submit(self, request, pk=None):
        """
        Submits the specified information package

        Args:
            pk: The primary key (id) of the information package to submit

        Returns:
            None
        """

        self.get_object().submit()
        return Response({'status': 'submitting ip'})

    @detail_route(methods=['put'], url_path='change-profile')
    def change_profile(self, request, pk=None):
        ip = self.get_object()
        new_profile = Profile.objects.get(pk=request.data["new_profile"])

        ip.change_profile(new_profile)

        return Response({
            'status': 'updating IP (%s) with new profile (%s)' % (
                ip.pk, new_profile
            )
        })

    @detail_route(methods=['post'], url_path='unlock-profile')
    def unlock_profile(self, request, pk=None):
        ip = self.get_object()
        ptype = request.data.get("type")

        if ptype:
            ip.unlock_profile(ptype)
            return Response({
                'status': 'unlocking profile with type "%s" in IP "%s"' % (
                    ptype, ip.pk
                )
            })

        return Response()

class EventIPViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows events to be viewed or edited.
    """
    queryset = EventIP.objects.all()
    serializer_class = EventIPSerializer
    filter_backends = (
        filters.OrderingFilter, DjangoFilterBackend,
    )
    ordering_fields = ('id', 'eventDetail', 'eventDateTime')

    def create(self, request):
        """
        """

        detail = request.data.get('eventDetail', None)
        type_id = request.data.get('eventType', None)
        ip_id = request.data.get('information_package', None)

        eventType = EventType.objects.get(pk=type_id)
        ip = InformationPackage.objects.get(pk=ip_id)

        EventIP.objects.create(
            eventDetail=detail, eventType=eventType,
            linkingObjectIdentifierValue=ip
        )
        return Response({"status": "Created event"})
