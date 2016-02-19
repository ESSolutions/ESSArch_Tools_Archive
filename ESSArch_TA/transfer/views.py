from django.shortcuts import render
from django.http import HttpResponseRedirect
from django.views.generic import View
from django.utils.decorators import method_decorator
from django.contrib.auth.decorators import login_required
from ip.models import InformationPackage
from configuration.models import (
                                  Path,
                                  Parameter,
                                  )

import lib.app_tools as lat
import os
import logging
logger = logging.getLogger('code.exceptions')

class TransferIPList(View):
    template_name = 'transfer/create.html'

    @method_decorator(login_required)
    def get(self, request, *args, **kwargs):
        context = {}
        context['label'] = 'Transfer information packages'

        # Get current site_profile and zone
        site_profile, zone = lat.getSiteZone()    
    
        # get a list of IPs from db
        ips = InformationPackage.objects.all()
    
        # need to search through all spec files to present them
        path_ingest_reception = Path.objects.get(entity="path_ingest_reception").value
        package_descriptionfile = Parameter.objects.get(entity="package_descriptionfile").value
        file_list = lat.getFiles(path_ingest_reception, package_descriptionfile)
        
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
                    # If not state is 'Received' remove from file_list
                    if not ip.state == 'Received':
                        file_list.remove(fil)
            if not found :
                # If not found i database remove from file_list
                file_list.remove(fil)
            found = 0 # reset flag
        
        # set flag to transfer local or remote
        path_gate_reception = Path.objects.get(entity="path_gate_reception").value
        remote_server_string = Parameter.objects.get(entity='preservation_organization_receiver').value
        remote_server = remote_server_string.split(',')
        if len(remote_server) == 3:
            transfer_destination_string = u'Transfer to remote server: %s' % remote_server[0]
        else:
            transfer_destination_string = u'Transfer to local filesystem: %s' % path_gate_reception
        
        context['zone'] = zone
        context['file_list'] = file_list
        context['transfer_destination_string'] = transfer_destination_string             
        return render(request, self.template_name, context)

    @method_decorator(login_required)
    def post(self, request, *args, **kwargs):
        try: 
            opt = request.POST.getlist('checkbox')
        except:
            pass
        
        contextdata = {}
        
        # agent e.q user
        agent = str(request.user)
        
        for filename in opt:
            print 'filename: %s' % repr(filename)
            contextdata["filename"] = filename
            contextdata["iplocation"] = os.path.split(filename)[0]
            
            # transfer IP
            ip, errno, why = lat.transferIP(agent, contextdata)
            if errno: 
                logger.error(why)
                context = { 'message': why }
                logger.error('Problem to transfer package IP %s' % contextdata["iplocation"])
                return render(request, 'status.html', context)
            else:
                logger.info('Successfully transfer package IP %s' % ip.label)

        # exit form
        return HttpResponseRedirect('/transfer/transferiplist/')
