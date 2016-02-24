'''
    ESSArch - ESSArch is an Electronic Archive system
    Copyright (C) 2010-2015  ES Solutions AB

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

    Contact information:
    Web - http://www.essolutions.se
    Email - essarch@essolutions.se
'''
try:
    import ESSArch_TA as eta
except ImportError:
    __version__ = '2'
else:
    __version__ = eta.__version__

from django.conf.urls import patterns, url, include
#from rest_framework.routers import DefaultRouter

from api.views import (ReceptionUploadView,
                    CreateReceptionUploadView,
                    CreateReceptionUploadCompleteView,
                    )

# Create a router and register our viewsets with it.
#router = DefaultRouter()

urlpatterns = patterns('',
    #url(r'^', include(router.urls)),
    url(r'^reception_upload', ReceptionUploadView.as_view(), name='chunked_upload'),
    url(r'^create_reception_upload/?$', CreateReceptionUploadView.as_view(), name='api_reception_upload'),
    url(r'^create_reception_upload_complete/?$', CreateReceptionUploadCompleteView.as_view(), name='api_reception_upload_complete'),
)
