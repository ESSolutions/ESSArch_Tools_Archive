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

from rest_framework import viewsets
from ESSArch_Core.profiles.models import Profile, ProfileIP, ProfileSA
from ESSArch_Core.profiles.serializers import (ProfileDetailSerializer,
                                               ProfileIPSerializer,
                                               ProfileSASerializer,
                                               ProfileSerializer,
                                               ProfileWriteSerializer)


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
