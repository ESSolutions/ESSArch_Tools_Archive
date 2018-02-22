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

from django.db.models import Prefetch
from rest_framework import viewsets
from rest_framework.decorators import detail_route
from rest_framework.response import Response

from ESSArch_Core.ip.models import ArchivistOrganization, InformationPackage
from ESSArch_Core.profiles.models import (Profile, ProfileIP, ProfileIPData,
                                          ProfileSA, SubmissionAgreement)
from ESSArch_Core.profiles.serializers import (ProfileDetailSerializer,
                                               ProfileIPSerializer,
                                               ProfileSASerializer,
                                               ProfileSerializer,
                                               ProfileWriteSerializer,
                                               SubmissionAgreementSerializer)
from ESSArch_Core.profiles.utils import fill_specification_data


class SubmissionAgreementViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows submission agreements to be viewed or edited.
    """
    queryset = SubmissionAgreement.objects.all().prefetch_related(
        Prefetch('profilesa_set', to_attr='profiles')
    )
    serializer_class = SubmissionAgreementSerializer

    @detail_route(methods=["post"])
    def lock(self, request, pk=None):
        sa = self.get_object()
        ip_id = request.data.get("ip")


        try:
            ip = InformationPackage.objects.get(
                pk=ip_id
            )
        except InformationPackage.DoesNotExist:
            return Response(
                {'status': 'Information Package with id %s does not exist' % ip_id},
                status=status.HTTP_404_NOT_FOUND
            )

        ProfileIP.objects.filter(ip=ip).delete()
        ip.submission_agreement_locked = False
        ip.save()


        if ip.submission_agreement_locked:
            raise exceptions.ParseError('IP already has a locked SA')

        if ip.submission_agreement == sa:
            ip.submission_agreement_locked = True

            types = ('sip', 'transfer_project', 'submit_description', 'preservation_metadata', 'validation', 'transformation')
            extra_data = fill_specification_data(ip=ip, sa=sa)

            for profile_type in types:
                lower_type = profile_type.lower().replace(' ', '_')
                profile = getattr(sa, 'profile_%s' % lower_type, None)

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

            if sa.archivist_organization:
                arch, _ = ArchivistOrganization.objects.get_or_create(
                    name=sa.archivist_organization
                )
                ip.archivist_organization = arch

            ip.save()

            return Response({'status': 'locking submission_agreement'})
        elif ip.submission_agreement is None:
            return Response(
                {'status': 'No SA connected to IP'},
                status=status.HTTP_400_BAD_REQUEST
            )
        else:
            return Response(
                {'status': 'This SA is not connected to the selected IP'},
                status=status.HTTP_400_BAD_REQUEST
            )


class ProfileSAViewSet(viewsets.ModelViewSet):
    queryset = ProfileSA.objects.all()
    serializer_class = ProfileSASerializer


class ProfileIPViewSet(viewsets.ModelViewSet):
    queryset = ProfileIP.objects.all()
    serializer_class = ProfileIPSerializer


class ProfileViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows profiles to be viewed or edited.
    """
    queryset = Profile.objects.all()

    def get_serializer_class(self):
        if self.action == 'list':
            return ProfileSerializer

        if self.action == 'retrieve':
            return ProfileDetailSerializer

        return ProfileWriteSerializer

    def get_queryset(self):
        queryset = Profile.objects.all()
        profile_type = self.request.query_params.get('type', None)

        if profile_type is not None:
            queryset = queryset.filter(profile_type=profile_type)

        return queryset
