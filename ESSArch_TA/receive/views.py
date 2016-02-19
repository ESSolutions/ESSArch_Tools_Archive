from django.core.urlresolvers import reverse_lazy
from django.shortcuts import render, render_to_response, get_object_or_404
from django.http import HttpResponseRedirect
from django.views.generic import View
from django.utils.decorators import method_decorator
from django.contrib.auth.decorators import permission_required
from django.contrib.auth.decorators import login_required
from django.template import RequestContext 
from ip.models import InformationPackage
from configuration.models import (
                                  Path,
                                  Parameter,
                                  )

import lib.app_tools as lat
import os

from .forms import NewLogFileForm

import logging
logger = logging.getLogger('code.exceptions')

class ReceiveIPList(View):
    form_class = NewLogFileForm
    initial = {}
    template_name = 'receive/create.html'

    @method_decorator(login_required)
    def get(self, request, *args, **kwargs):
        form = self.form_class(initial=self.initial)
        context = {}
        context['label'] = 'RECEPTION - Receive IP List'

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
        for fil in list(file_list):
            if fil["ip_uuid"][:5] == 'UUID:' or fil["ip_uuid"][:5] == 'RAID:' : 
                ip_uuid = fil["ip_uuid"][5:]
            else :
                ip_uuid = fil["ip_uuid"]
            for ip in ips:
                if ip.uuid == ip_uuid :
                    fil[ "state" ] = ip.state
                    found = 1  # found one match
                    # If state is 'Received' remove from file_list
                    if not ip.state == 'Not received':
                        file_list.remove(fil)
                        print 'remove ip_uuid %s from file_list' % ip_uuid
            if not found :
                fil[ "state" ] = 'Not received'
            found = 0 # reset flag

        context['form'] = form
        context['zone'] = zone
        context['file_list'] = file_list        
        return render(request, self.template_name, context)

    @method_decorator(login_required)
    def post(self, request, *args, **kwargs):
        form = self.form_class(request.POST)
        if form.is_valid(): # All validation rules pass
            try: 
                opt = request.POST.getlist('checkbox')
            except:
                pass
            
            # get clean context data
            contextdata = form.cleaned_data
            
            # agent e.q user
            agent = str(request.user)
            
            for filename in opt:
                contextdata["filename"] = filename
                contextdata["iplocation"] = os.path.split(filename)[0]
                
                # receive IP
                ip, errno, why = lat.receiveIP(agent, contextdata)
                if errno: 
                    logger.error(why)
                    context = { 'message': why }
                    logger.error('Problem to receive package IP %s' % contextdata["iplocation"])
                    return render(request, 'status.html', context)
                else:
                    logger.info('Successfully receive package IP %s and created log file' % ip.label)

            # exit form
            return HttpResponseRedirect('/logevents/list')

    
    

    