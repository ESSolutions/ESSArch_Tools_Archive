from django_filters import rest_framework as filters

from rest_framework import exceptions

from ESSArch_Core.ip.filters import InformationPackageFilter as InformationPackageFilterCore
from ESSArch_Core.ip.models import Workarea


class InformationPackageFilter(InformationPackageFilterCore):
    workarea = filters.ChoiceFilter(field_name='workareas__type', choices=Workarea.TYPE_CHOICES)

    class Meta(InformationPackageFilterCore.Meta):
        model = InformationPackageFilterCore.Meta.model
        fields = InformationPackageFilterCore.Meta.fields + ['workarea']
