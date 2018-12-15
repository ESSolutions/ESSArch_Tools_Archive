from django.utils.translation import ugettext_lazy as _
from django_filters import rest_framework as filters

from ESSArch_Core.ip.filters import InformationPackageFilter as InformationPackageFilterCore
from ESSArch_Core.ip.models import Workarea


class InformationPackageFilter(InformationPackageFilterCore):
    workarea = filters.ChoiceFilter(label=_("Workarea"), field_name='workareas__type', choices=Workarea.TYPE_CHOICES)

    class Meta(InformationPackageFilterCore.Meta):
        model = InformationPackageFilterCore.Meta.model
        fields = InformationPackageFilterCore.Meta.fields + ['workarea']
