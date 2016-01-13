#!/usr/bin/env /ESSArch/python27/bin/python
# -*- coding: UTF-8 -*-
'''
    ESSArch Tools - ESSArch is an Electronic Preservation Platform
    Copyright (C) 2005-2013  ES Solutions AB

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

# Create your models here.
import time
import os.path
import hashlib
import uuid

from django.db import models
from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from django.core.files.storage import FileSystemStorage
from django.utils import timezone

from chunked_upload.settings import EXPIRATION_DELTA, UPLOAD_PATH, STORAGE, ABSTRACT_MODEL
from chunked_upload.constants import CHUNKED_UPLOAD_CHOICES, UPLOADING

from config.settings import MEDIA_ROOT


AUTH_USER_MODEL = getattr(settings, 'AUTH_USER_MODEL', 'auth.User')


def generate_upload_id():
    return uuid.uuid4().hex


def generate_filename(instance, filename):
    filename = os.path.join(MEDIA_ROOT, instance.upload_id + '.part') #UPLOAD_PATH
    #filename = os.path.join(MEDIA_ROOT, filename) 
    return time.strftime(filename)

def alternative_filename(instance, filename):

    upload_path = os.path.join(MEDIA_ROOT,'files')
    filename = os.path.join(upload_path, instance.filename )
    return filename


class BaseChunkedUpload(models.Model):
    """
    Base chunked upload model. This model is abstract (doesn't create a table
    in the database).
    Inherit from this model to implement your own.
    """

    upload_id = models.CharField(max_length=32, unique=True, editable=False,
                                 default=generate_upload_id)
    #file = models.FileField(max_length=255, upload_to=generate_filename,storage=STORAGE)
    filename = models.CharField(max_length=255)
    offset = models.BigIntegerField(default=0)
    created_on = models.DateTimeField(auto_now_add=True)
    status = models.PositiveSmallIntegerField(choices=CHUNKED_UPLOAD_CHOICES,
                                              default=UPLOADING)
    completed_on = models.DateTimeField(null=True, blank=True)
    user = models.ForeignKey(AUTH_USER_MODEL, related_name='chunked_uploads', blank=True)
    @property
    def expires_on(self):
        return self.created_on + EXPIRATION_DELTA

    @property
    def expired(self):
        return self.expires_on <= timezone.now()

    @property
    def md5(self):
        if getattr(self, '_md5', None) is None:
            md5 = hashlib.md5()
            for chunk in self.file.chunks():
                md5.update(chunk)
            self._md5 = md5.hexdigest()
        return self._md5

    def delete(self, delete_file=True, *args, **kwargs):
        storage, path = self.file.storage, self.file.path
        super(BaseChunkedUpload, self).delete(*args, **kwargs)
        if delete_file:
            storage.delete(path)

    def __unicode__(self):
        return u'<%s - upload_id: %s - bytes: %s - status: %s>' % (
            self.filename, self.upload_id, self.offset, self.status)

    def close_file(self):
        """
        Bug in django 1.4: FieldFile `close` method is not reaching all the
        way to the actual python file.
        Fix: we had to loop all inner files and close them manually.
        """
        file_ = self.file
        while file_ is not None:
            file_.close()
            file_ = getattr(file_, 'file', None)

    def append_chunk(self, chunk, chunk_size=None, save=True):

        self.close_file()
        self.file.open(mode='ab')  # mode = append+binary
        # We can use .read() safely because chunk is already in memory
        self.file.write(chunk.read())
        if chunk_size is not None:
            self.offset += chunk_size
        elif hasattr(chunk, 'size'):
            self.offset += chunk.size
        else:
            self.offset = self.file.size
        self._md5 = None  # Clear cached md5
        if save:
            self.save()
        self.close_file()  # Flush
        print 'offset'
        print self.offset

    def get_uploaded_file(self):

        self.close_file()
        self.file.open(mode='rb')  # mode = read+binary
        return UploadedFile(file=self.file, name=self.filename,
                            size=self.offset)

    class Meta:
        abstract = True


class ETAstorage(FileSystemStorage):
    def __init__(self):
        super(ETPstorage, self).__init__(location=MEDIA_ROOT)

        
class ETAupload(BaseChunkedUpload):
    
    file = models.FileField(max_length=255, upload_to=alternative_filename,storage=ETPstorage()) 

