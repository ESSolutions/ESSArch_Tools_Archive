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

import os.path
import shutil
from django.views.generic.base import TemplateView
from django.utils.decorators import method_decorator
from django.contrib.auth.decorators import permission_required
from django.conf import settings
from chunked_upload.views import ChunkedUploadView, ChunkedUploadCompleteView
from configuration.models import (
                                  Path,
                                  )
from api.models import (
                        ReceptionUpload,
                        )

from rest_framework import permissions, views

class ReceptionUploadView(TemplateView):
    template_name = 'api/reception_upload.html'

    @method_decorator(permission_required('essarch.change_ingestqueue'))
    def dispatch(self, *args, **kwargs):
        return super(ReceptionUploadView, self).dispatch( *args, **kwargs)


class CreateReceptionUploadView(views.APIView, ChunkedUploadView):

    model = ReceptionUpload
    field_name = 'the_file'
    permission_classes = (permissions.IsAuthenticated,)

class CreateReceptionUploadCompleteView(views.APIView, ChunkedUploadCompleteView):

    model = ReceptionUpload
    permission_classes = (permissions.IsAuthenticated,)

    def on_completion(self, uploaded_file, request):
        # Do something with the uploaded file. E.g.:
        # * Store the uploaded file on another model:
        # SomeModel.objects.create(user=request.user, file=uploaded_file)
        # * Pass it as an argument to a function:
        # function_that_process_file(uploaded_file)
        #print dir(uploaded_file)
        #print 'filename: %s, type(file): %s' % (uploaded_file.name, type(uploaded_file.file))
        pass

    def move_to_destination(self, chunked_upload, request):
        """
        Move file to destination path and remove uploaded file from database
        """
        try:
            upload_root =  Path.objects.get(entity='path_ingest_reception').value
        except  Path.DoesNotExist as e:
            upload_root = settings.MEDIA_ROOT

        # get or create IP and AIC structure
        ip_uuid = request.POST.get('ipuuid', None)
        if ip_uuid is None:
            print 'Missing parameter ipuuid in request, setting ip_uuid to blank'
            ip_uuid = ''
        eft_path = os.path.join(upload_root, 'eft')
        
        tmp_file_path = chunked_upload.file.path

        # Create a new information package folder ready for deliver
        ip_path = os.path.join( eft_path, ip_uuid)
        print 'ippath'
        print ip_path
        if os.path.exists(ip_path):
            print 'path exists'
            shutil.move(tmp_file_path, ip_path)
            print 'file moved'
            
        else:
            print 'path vill be created'
            os.makedirs(ip_path)
            print 'file will be moved'
            shutil.move(tmp_file_path, ip_path)
            print 'file moved'

        chunked_upload.delete(delete_file=True)

    def get_response_data(self, chunked_upload, request):
        self.move_to_destination(chunked_upload, request)
        return {'message': ("You successfully uploaded '%s' (%s bytes)!" %
                            (chunked_upload.filename, chunked_upload.offset))}
