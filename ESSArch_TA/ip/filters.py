from django_filters import rest_framework as filters

from rest_framework import exceptions

from ESSArch_Core.ip.filters import InformationPackageFilter as InformationPackageFilterCore
from ESSArch_Core.ip.models import Workarea


class InformationPackageFilter(InformationPackageFilterCore):
    workarea = filters.CharFilter(field_name='workareas__type', method='filter_workarea')

    def filter_workarea(self, queryset, name, value):
        workarea_type_reverse = dict((v.lower(), k) for k, v in Workarea.TYPE_CHOICES)

        try:
            workarea_type = workarea_type_reverse[value]
        except KeyError:
            raise exceptions.ParseError('Workarea of type "%s" does not exist' % value)

        return queryset.filter(**{name: workarea_type})

    class Meta:
        model = InformationPackageFilterCore.Meta.model
        fields = InformationPackageFilterCore.Meta.fields + ['workarea']
