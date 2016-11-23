from django.db.models import Prefetch

from profiles.serializers import (
    ProfileSerializer,
    ProfileSASerializer,
    ProfileIPSerializer,
    SubmissionAgreementSerializer
)

from ESSArch_Core.profiles.models import (
    SubmissionAgreement,
    Profile,
    ProfileSA,
    ProfileIP,
)

from rest_framework import viewsets

class SubmissionAgreementViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows submission agreements to be viewed or edited.
    """
    queryset = SubmissionAgreement.objects.all().prefetch_related(
        Prefetch('profilesa_set', to_attr='profiles')
    )
    serializer_class = SubmissionAgreementSerializer

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
    serializer_class = ProfileSerializer

    def get_queryset(self):
        queryset = Profile.objects.all()
        profile_type = self.request.query_params.get('type', None)

        if profile_type is not None:
            queryset = queryset.filter(profile_type=profile_type)

        return queryset
