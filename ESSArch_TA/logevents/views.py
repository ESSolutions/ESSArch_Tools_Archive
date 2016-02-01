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

# Create your views here.
from django.template import Context, loader, RequestContext 
from django.http import HttpResponse, HttpResponseRedirect, Http404
from django.utils.http import urlquote
from django.core.context_processors import csrf
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
import os, uuid, operator, re

from django.views.generic import View
from django.shortcuts import render_to_response, get_object_or_404
from django.core.files.base import ContentFile
from django.utils import timezone
from django.core.files.storage import FileSystemStorage

#from chunked_upload.views import ChunkedUploadView, ChunkedUploadCompleteView
from chunked_upload.settings import MAX_BYTES
#from chunked_upload.views import ChunkedUploadBaseView
from chunked_upload.models import ChunkedUpload
from chunked_upload.response import Response
from chunked_upload.constants import http_status, COMPLETE
from chunked_upload.exceptions import ChunkedUploadError
from models import ETAupload
#from rest_framework import viewsets, mixins, permissions, views

# import the logging library and get an instance of a logger
import logging
logger = logging.getLogger('code.exceptions')

# own models etc
from ip.models import InformationPackage
#from configuration.models import Parameter, LogEvent, Path, ControlAreaForm_file 
from configuration.models import Parameter, LogEvent, Path 
from newlogeventform import NewLogEventForm, NewLogFileForm
import lib.utils as lu
import lib.app_tools as lat


@login_required
def index(request):
    # Get current site_profile and zone
    site_profile, zone = lat.getSiteZone()    
    t = loader.get_template('logevents/index.html')
    c = RequestContext(request)
    c['zone'] = zone
    return HttpResponse(t.render(c))
    

"List all logfiles at logfiles path"
###############################################
@login_required
def listlog(request):
    #ip = get_object_or_404(InformationPackage, pk=id)
    print 'listlog'
    # Get current site_profile and zone
    site_profile, zone = lat.getSiteZone()    
    
    # get a list of IPs from db
    ips = InformationPackage.objects.all()

    # need to find out path to log files
    logfilepath = lat.getLogFilePath()
    #print logfilepath
    # if zone3 add user home directories to path etccontrolarea/create.html
    if zone == 'zone3' :
        logfilepath = logfilepath +'/'+ str(request.user)
        
    # need to search through all log files to find the one that we want
    templatefile_log = Parameter.objects.get(entity="ip_logfile").value
    loglist = lat.getLogFiles(logfilepath, templatefile_log)
    #print templatefile_log
    #print logfilepath
    # reverse order so that the latest logs come first
    loglist = sorted(loglist, key=operator.itemgetter("createdate"))
    #for i in loglist:
    #    print i
    
    # look for mismatch db and filesystem
    found = 0 # not found any matching IP
    for log in loglist:
        for ip in ips:
            if ip.uuid == log["uuid"] :
                log[ "state" ] = ip.state
                found = 1  # found one match
        if not found :
            if  zone == 'zone3':
                log[ "state" ] = 'Processing'
            else:
                log[ "state" ] = 'Stale'
        found = 0 # reset flag
        
        # generate link URL
        log[ "link" ] = "%s/%s/%s/%s/%s" % ( log["uuid"], 
                                                log["archivist_organization"], 
                                                log["label"], 
                                                #log["startdate"],
                                                #log["enddate"], 
                                                log["iptype"], 
                                                log["createdate"] )
                                          
    c = {'log_list':loglist,
         'zone':zone,
         #'ip':ip,
         }
    return render_to_response('logevents/list.html', c,
                              context_instance=RequestContext(request) )


"View and add logevents to logfile"
###############################################controlarea/create.html
@login_required
def viewlog(request, uuid, archivist_organization, label, iptype, createdate):
#def viewlog(request, uuid, archivist_organization, label, startdate, enddate, iptype, createdate):
#def viewlog(request):
    # Get current site_profile and zone
    site_profile, zone = lat.getSiteZone()    
    print 'viewlog' 
    # need to find out path to log files
    logfilepath = lat.getLogFilePath()
    
    # if zone3 add user home directories to path etc
    if zone == 'zone3' :
        logfilepath = logfilepath +'/'+ str(request.user)
    
    # need to search through all log files to find the one that we want
    templatefile_log = Parameter.objects.get(entity="ip_logfile").value
    loglist = lat.getLogFiles(logfilepath, templatefile_log )
    logfile = None
    for log in loglist:
        #print log
        if log["uuid"] == uuid :
            logfile = log[ "fullpath" ]

    if logfile != None and logfile != "":

        if request.method == 'POST': # If the form has been submitted...
            form = NewLogEventForm(request.POST) # A form bound to the POST data
            if form.is_valid(): # All validation rules pass
                
                # get clean context data
                contextdata = form.cleaned_data
            
                # check status of event
                t =  contextdata["eventOutcome"]
                status = 0
                if t!="Ok":
                    status = 1
                
                # fetch logged in user
                user = str(request.user)

                # add event to logfile                                                               
                lat.appendToLogFile( logfile,
                         #form.cleaned_data[ "eventType" ],
                         contextdata[ "eventType" ],
                         status,
                         #form.cleaned_data[ "eventOutcomeDetailNote" ],
                         contextdata[ "eventOutcomeDetailNote" ],
                         user,
                         uuid )

                # get eventDetail for log
                eventDetail=LogEvent.objects.filter( eventType=contextdata["eventType"])[0].eventDetail
                logger.info('Successfully appended event "%s" to package IP %s', eventDetail, label)

            else:
                logger.error('Form NewLogEventForm is not valid.')
                #print form.data, form.errors

        else:
            form = NewLogEventForm()

        # we have the log file, need to generate the report.
        content = lat.getLogEvents( logfile )
        
        # reverse order so that the latest logs come first
        content.reverse()
        
        #link = urlquote( "%s/%s/%s/%s/%s/%s/%s" % ( uuid, creator, label, startdate, enddate, iptype, createdate ) )
        #link = urlquote( "%s/%s/%s/%s/%s/%s/%s" % ( uuid, archivist_organization, label, startdate, enddate, iptype, createdate ) )
        link = urlquote( "%s/%s/%s/%s/%s" % ( uuid, archivist_organization, label, iptype, createdate ) )
        c = { 'log_content':content, 
              'form': form,
              'link': link,
              'uuid': uuid,
              'zone':zone,
              'archivist_organization': archivist_organization,
              'label':label, 
              }
        c.update(csrf(request))
        return render_to_response( 'logevents/view.html', c, context_instance=RequestContext(request) )

    else:
        # something went wrong and we have a problem.
        raise Http404


"Create log circular eq logfile"
###############################################
@login_required
def createlog(request):
    
    # Get current site_profile and zone
    site_profile, zone = lat.getSiteZone()    

    # get a list of IPs from db
    ips = InformationPackage.objects.all()

    # need to search through all spec files to present them
    file_path = Path.objects.get(entity="path_ingest_reception").value
    spec_file = Parameter.objects.get(entity="package_descriptionfile").value
    file_list = lat.getFiles(file_path, spec_file )
    
    # look for mismatch db and filesystem
    found = 0 # not found any matching IP
    for fil in file_list:
        if fil["ip_uuid"][:5] == 'UUID:' or fil["ip_uuid"][:5] == 'RAID:' : 
            ip_uuid = fil["ip_uuid"][5:]
        else :
            ip_uuid = fil["ip_uuid"]
        for ip in ips:
            if ip.uuid == ip_uuid :
                fil[ "state" ] = ip.state
                found = 1  # found one match
        if not found :
            if  zone == 'zone3':
                fil[ "state" ] = 'Processing'
            else:
                fil[ "state" ] = 'Not received'
        found = 0 # reset flag
    
#    # declare files as delivered to us
#    for i in file_list:
#        i['state']='Delivered' 
#        print i
    
    if request.method == 'POST': # If the form has been submitted...
        form = NewLogFileForm(request.POST) # A form bound to the POST data
        if form.is_valid(): # All validation rules pass
            try: 
                #opt = [] 
                opt = request.POST.getlist('checkbox')
                #print opt 
            except:
                pass
            
            # get clean context data
            contextdata = form.cleaned_data
            #spec_file = contextdata["sourceroot"]
            
            # agent e.q user
            agent = str(request.user)
            
            for filename in opt:
                print filename
                contextdata["filename"] = filename
                contextdata["iplocation"] = os.path.split(filename)[0]
                print contextdata
                
                # prepare IP
                ip, errno, why = lat.prepareIP(agent, contextdata)
                if errno: 
                    logger.error(why)
                    c = { 'message': why }
                    c.update(csrf(request))
		    logger.error('Could not prepare package IP %s and create log file at gate %s' % (ip.label,ip.directory))
                    return render_to_response('status.html', c, context_instance=RequestContext(request) )
                else:
                    logger.info('Successfully prepared package IP %s and created log file at gate' % ip.label)

            # exit form
            return HttpResponseRedirect( '/logevents/list' )
        
        else:
            logger.error('Form PrepareFormSE/NO is not valid.')
            #print form.data, form.errors
            c = {'form': form,
                 'zone':zone,
                 }
            c.update(csrf(request))
            return render_to_response( 'logevents/create.html', c, context_instance=RequestContext(request) )
            #return render_to_response( 'logevents/list.html', c, context_instance=RequestContext(request) )
                    
    else:
        form = NewLogFileForm() # A unbound form
        #form = NewLogFileForm
        #print i['ip_uuid']
        #print k[0]
        #print k['id']
        #form_class.FileSelect_CHOICES = k
        #form = form_class()  
        #print form.errors
        #print form.data
        c = {'form':form,
             'zone':zone,
             'file_list':file_list,
             }
        c.update(csrf(request))
        return render_to_response('logevents/create.html', c, context_instance=RequestContext(request) )
        



class ChunkedUploadBaseView(View):
    """
    Base view for the rest of chunked upload views.
    """

    # Has to be a ChunkedUpload subclass
    model = ChunkedUpload
    
    @csrf_exempt
    def dispatch(self,  *args, **kwargs):
        return super(ChunkedUploadBaseView, self).dispatch(*args, **kwargs)

    def get_queryset(self, request):
        """
        Get (and filter) ChunkedUpload queryset.
        By default, users can only continue uploading their own uploads.
        """
        queryset = self.model.objects.all()
        
        if hasattr(request, 'user') and request.user.is_authenticated():
            queryset = queryset.filter(user=request.user)
            
        return queryset

    def validate(self, request):
        """
        Placeholder method to define extra validation.
        Must raise ChunkedUploadError if validation fails.
        """

    def get_response_data(self, chunked_upload, request):
        """
        Data for the response. Should return a dictionary-like object.
        Called *only* if POST is successful.
        """
        return {}

    def pre_save(self, chunked_upload, request, new=False):
        """
        Placeholder method for calling before saving an object.
        May be used to set attributes on the object that are implicit
        in either the request, or the url.
        """

    def save(self, chunked_upload, request, new=False):
        """
        Method that calls save(). Overriding may be useful is save() needs
        special args or kwargs.
        """
        chunked_upload.save()

    def post_save(self, chunked_upload, request, new=False):
        """
        Placeholder method for calling after saving an object.
        """

    def _save(self, chunked_upload):
        """
        Wraps save() method.
        """
        new = chunked_upload.id is None
        self.pre_save(chunked_upload, self.request, new=new)
        self.save(chunked_upload, self.request, new=new)
        self.post_save(chunked_upload, self.request, new=new)

    def check_permissions(self, request):
        """
        Grants permission to start/continue an upload based on the request.
        """
        if hasattr(request, 'user') and not request.user.is_authenticated():
            raise ChunkedUploadError(
                status=http_status.HTTP_403_FORBIDDEN,
                detail='Authentication credentials were not provided'
            )

    def _post(self, request, *args, **kwargs):
        raise NotImplementedError

    def post(self, request, *args, **kwargs):
        """
        Handle POST requests.
        """
        logger.info('A post request is being made')
        #try:
            #self.check_permissions(request)
        return self._post(request, *args, **kwargs)
        #except ChunkedUploadError as error:
            #return Response(error.data, status=error.status_code)

class ChunkedUploadView(ChunkedUploadBaseView):
    """
    Uploads large files in multiple chunks. Also, has the ability to resume
    if the upload is interrupted.
    """

    field_name = 'the_file'
    content_range_header = 'HTTP_CONTENT_RANGE'
    content_range_pattern = re.compile(
        r'^bytes (?P<start>\d+)-(?P<end>\d+)/(?P<total>\d+)$'
    )
    max_bytes = MAX_BYTES  # Max amount of data that can be uploaded
    # If `fail_if_no_header` is True, an exception will be raised if the
    # content-range header is not found. Default is False to match Jquery File
    # Upload behavior (doesn't send header if the file is smaller than chunk)
    fail_if_no_header = False

    def get_extra_attrs(self, request):
        """
        Extra attribute values to be passed to the new ChunkedUpload instance.
        Should return a dictionary-like object.
        """
        return {}

    def get_max_bytes(self, request):
        """
        Used to limit the max amount of data that can be uploaded. `None` means
        no limit.
        You can override this to have a custom `max_bytes`, e.g. based on
        logged user.
        """

        return self.max_bytes

    def create_chunked_upload(self, save=False, **attrs):
        """
        Creates new chunked upload instance. Called if no 'upload_id' is
        found in the POST data.
        """
        chunked_upload = self.model(**attrs)
        # file starts empty
        chunked_upload.file.save(name='', content=ContentFile(''), save=save)
        print 'checked upload created'
        return chunked_upload

    def is_valid_chunked_upload(self, chunked_upload):
        """
        Check if chunked upload has already expired or is already complete.
        """
        if chunked_upload.expired:
            raise ChunkedUploadError(status=http_status.HTTP_410_GONE,
                                     detail='Upload has expired')
        error_msg = 'Upload has already been marked as "%s"'
        if chunked_upload.status == COMPLETE:
            raise ChunkedUploadError(status=http_status.HTTP_400_BAD_REQUEST,
                                     detail=error_msg % 'complete')

    def get_response_data(self, chunked_upload, request):
        """
        Data for the response. Should return a dictionary-like object.
        """

        return {
            'upload_id': chunked_upload.upload_id,
            'offset': chunked_upload.offset,
            'expires': chunked_upload.expires_on
        }

    def _post(self, request, *args, **kwargs):
        
        logger.info('A post request to upload view is being made')
        chunk = request.FILES.get(self.field_name)
        if chunk is None:
            raise ChunkedUploadError(status=http_status.HTTP_400_BAD_REQUEST,
                                     detail='No chunk file was submitted')
        self.validate(request)

        upload_id = request.POST.get('upload_id')
        if upload_id:
            chunked_upload = get_object_or_404(self.get_queryset(request),
                                               upload_id=upload_id)
            self.is_valid_chunked_upload(chunked_upload)
        else:
            attrs = {'filename': chunk.name}
            if hasattr(request, 'user') and request.user.is_authenticated():
                attrs['user'] = request.user
            attrs.update(self.get_extra_attrs(request))
            chunked_upload = self.create_chunked_upload(save=False, **attrs)

        content_range = request.META.get(self.content_range_header, '')
        print 'content_range'
        print content_range
        match = self.content_range_pattern.match(content_range)
        if match:
            start = int(match.group('start'))
            end = int(match.group('end'))
            total = int(match.group('total'))
        elif self.fail_if_no_header:
            raise ChunkedUploadError(status=http_status.HTTP_400_BAD_REQUEST,
                                     detail='Error in request headers')
        else:
            # Use the whole size when HTTP_CONTENT_RANGE is not provided
            start = 0
            end = chunk.size - 1
            total = chunk.size

        chunk_size = end - start + 1
        max_bytes = self.get_max_bytes(request)

        if max_bytes is not None and total > max_bytes:
            raise ChunkedUploadError(
                status=http_status.HTTP_400_BAD_REQUEST,
                detail='Size of file exceeds the limit (%s bytes)' % max_bytes
            )
        if chunked_upload.offset != start:
            print 'offset check; ' 
            print chunked_upload.offset
            raise ChunkedUploadError(status=http_status.HTTP_400_BAD_REQUEST,
                                     detail='Offsets do not match',
                                     offset=chunked_upload.offset)
        if chunk.size != chunk_size:
            raise ChunkedUploadError(status=http_status.HTTP_400_BAD_REQUEST,
                                     detail="File size doesn't match headers")

        chunked_upload.append_chunk(chunk, chunk_size=chunk_size, save=False)

        self._save(chunked_upload)

        return Response(self.get_response_data(chunked_upload, request),
                        status=http_status.HTTP_200_OK)


class ChunkedUploadCompleteView(ChunkedUploadBaseView):
    """
    Completes an chunked upload. Method `on_completion` is a placeholder to
    define what to do when upload is complete.
    """

    # I wouldn't recommend to turn off the md5 check, unless is really
    # impacting your performance. Proceed at your own risk.
    do_md5_check = False  #True

    def on_completion(self, uploaded_file, request):
        """
        Placeholder method to define what to do when upload is complete.
        """
    def get_response_data(self, chunked_upload, request):
        return chunked_upload.filename
        #return {'message': ("%s %s " %
                            #(chunked_upload.filename, chunked_upload.offset))}


    def is_valid_chunked_upload(self, chunked_upload):
        """
        Check if chunked upload is already complete.
        """
        if chunked_upload.status == COMPLETE:
            error_msg = "Upload has already been marked as complete"
            return ChunkedUploadError(status=http_status.HTTP_400_BAD_REQUEST,
                                      detail=error_msg)

    def md5_check(self, chunked_upload, md5):
        """
        Verify if md5 checksum sent by client matches generated md5.
        """
        if chunked_upload.md5 != md5:
            raise ChunkedUploadError(status=http_status.HTTP_400_BAD_REQUEST,
                                     detail='md5 checksum does not match')

    def _post(self, request, *args, **kwargs):
        
        logger.info('A post request is being made to complete view')
        
        upload_id = request.POST.get('upload_id')
        md5 = request.POST.get('md5')

        error_msg = None
        if self.do_md5_check:
            if not upload_id or not md5:
                error_msg = "Both 'upload_id' and 'md5' are required"
        elif not upload_id:
            error_msg = "'upload_id' is required"
        if error_msg:
            raise ChunkedUploadError(status=http_status.HTTP_400_BAD_REQUEST,
                                     detail=error_msg)

        chunked_upload = get_object_or_404(self.get_queryset(request),
                                           upload_id=upload_id)

        self.validate(request)
        self.is_valid_chunked_upload(chunked_upload)
        if self.do_md5_check:
            self.md5_check(chunked_upload, md5)

        chunked_upload.status = COMPLETE
        chunked_upload.completed_on = timezone.now()
        self._save(chunked_upload)
        self.on_completion(chunked_upload.get_uploaded_file(), request)

        return Response(self.get_response_data(chunked_upload, request),
                        status=http_status.HTTP_200_OK)



class ETAUploadView(ChunkedUploadView):

    model = ETAupload
    #field_name = 'the_file'
    
    
    def check_permissions(self, request):
        # Allow non authenticated users to make uploads
        print 'permissions checked'
      
    #def is_valid_chunked_upload(self, chunked_upload):
        
        #pass

'''  
    #def save(self, chunked_upload, request, new=False):
    
        #Method that calls save(). Overriding may be useful is save() needs
        #special args or kwargs.
        
        #pass
'''

class ETAUploadCompleteView(ChunkedUploadCompleteView):

    model = ETAupload

    def check_permissions(self, request):
        # Allow non authenticated users to make uploads
        pass

    def on_completion(self, uploaded_file, request):
        # Do something with the uploaded file. E.g.:
        # * Store the uploaded file on another model:
        # SomeModel.objects.create(user=request.user, file=uploaded_file)
        # * Pass it as an argument to a function:
        # function_that_process_file(uploaded_file)
        #print uploaded_file.file
        #print 'filename: %s, type(file): %s' % (uploaded_file.name, type(uploaded_file.file))
        '''
        #ipidfromkwargs = self.kwargs['ipid']
        ourip = get_object_or_404(InformationPackage, pk=ipidfromkwargs)
        ipcontentpath = ourip.directory + '/' + ourip.uuid + '/content/'
        print ipcontentpath
        shutil.move(uploaded_file.file.path,ipcontentpath)
        
        file_path = Path.objects.get(entity="path_ingest_reception").value
        '''
        print 'Upload complete'
        #pass                        
