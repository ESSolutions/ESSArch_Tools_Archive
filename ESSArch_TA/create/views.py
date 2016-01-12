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
from django.contrib.auth.models import User
from django.http import HttpResponse, HttpResponseRedirect, Http404
from django import forms
from django.core.context_processors import csrf
from django.contrib.auth import logout
from django.contrib.auth.decorators import login_required, permission_required
from django.contrib.admin.views.decorators import staff_member_required
from django.shortcuts import render_to_response, get_object_or_404
from django.utils.http import urlquote
import os, os.path, uuid, datetime, forms, pytz, shutil, time, operator, pdb, json

# import the logging library and get an instance of a logger
import logging
logger = logging.getLogger('code.exceptions')

# from ESSArch Tools
from ip.models import InformationPackage
from configuration.models import Parameter, LogEvent, SchemaProfile, IPParameter, Path
from forms import PrepareFormSE, PrepareFormNO, CreateFormSE, CreateFormNO
import lib.utils as lu
import lib.app_tools as lat

@login_required
def index(request):
    # Get current site_profile and zone
    site_profile, zone = lat.getSiteZone()    
    t = loader.get_template('create/index.html')
    c = RequestContext(request)
    c['zone'] = zone
    return HttpResponse(t.render(c))


"View IPs and prepare new IPs"
###############################################
@login_required
#def viewIPs(request, uuid, creator, label, iptype, createdate):
def viewIPs(request):    
    
    # Get current site_profile and zone
    site_profile, zone = lat.getSiteZone()
        
    # Prepare IPs
    if request.method == 'POST': # If the form has been submitted...
        if site_profile == "SE":
            form = PrepareFormSE(request.POST) # A form bound to the POST data
        if site_profile == "NO":
            form = PrepareFormNO(request.POST) # A form bound to the POST data
        #form = PrepareForm(request.POST) # A form bound to the POST data
        if form.is_valid(): # All validation rules pass
            
            # get clean context data
            contextdata = form.cleaned_data
            
            # agent e.q user
            agent = str(request.user)

            # prepare IP
            ip,errno,why = lat.prepareIP(agent, contextdata)
            if errno: 
                logger.error(why)
                c = { 'message': why }
                c.update(csrf(request))
                return render_to_response('status.html', c, context_instance=RequestContext(request) )
            else:
                logger.info('Successfully prepared package IP %s and created log file', ip.label)

            # exit form
            return HttpResponseRedirect( '/create/view' )
            
        else:
            logger.error('Form PrepareFormSE/NO is not valid.')
            #print form.data, form.errors
            c = {'form': form,
                 'zone':zone,
                 }
            c.update(csrf(request))
            return render_to_response( 'create/view.html', c, context_instance=RequestContext(request) )
    
    else:
        initialvalues = {'destinationroot':lat.getLogFilePath()}
        if site_profile == "SE":
            form = PrepareFormSE(initial=initialvalues) # Form with defaults
        if site_profile == "NO":
            form = PrepareFormNO(initial=initialvalues) # Form with defaults
        #form = PrepareForm(initial=initialvalues) # Form with defaults

    # Present only prepared IPs 
    ip = InformationPackage.objects.filter(state='Prepared')

    c = {'form': form,
         'zone':zone, 
         'informationpackages': ip,
        #'link': link,
         }
    c.update(csrf(request))
    return render_to_response( 'create/view.html', c, context_instance=RequestContext(request) )


"Create IPs"
###############################################
#@permission_required('ip.Can_view_ip_menu')
@login_required
def createip(request, id):
    ip = get_object_or_404(InformationPackage, pk=id)

    # Get current site_profile and zone
    site_profile, zone = lat.getSiteZone()

    # need to find out path for destination
    destination_path = Path.objects.get(entity="path_delivery").value
    
    if request.method == 'POST': # If the form has been submitted...
        if site_profile == "SE":
            form = forms.CreateFormSE(request.POST) # A form bound to the POST data
        if site_profile == "NO":
            form = forms.CreateFormNO(request.POST) # A form bound to the POST data
        #form = forms.CreateForm(request.POST) # A form bound to the POST data
        #pdb.set_trace()
        if form.is_valid(): # All validation rules pass
            
            # get clean context data from form
            contextdata = form.cleaned_data

            # create IP, if unsuccessful show status
            ip, errno, why = lat.createIP(ip, contextdata)
            if errno: 
                logger.error('Could not create IP: %s', why)
                c = { 'message': why }
                c.update(csrf(request))
                return render_to_response('status.html', c, context_instance=RequestContext(request) )
            else:
                logger.info('Successfully created package IP %s', ip.label)

            # exit form
            return HttpResponseRedirect( '/create/view' )

        else:
            logger.error('Form CreateFormSE/NO is not valid.')
            #print form.data, form.errors
            c = {'form': form,
                 'zone':zone,
                 'ip':ip,
                }
            c.update(csrf(request))
            return render_to_response('create/create.html', c, context_instance=RequestContext(request) )
    else:
        initialvalues = IPParameter.objects.all().values()[0]
        initialvalues['destinationroot'] = destination_path
        initialvalues['archivist_organization'] = ip.archivist_organization
        initialvalues['label'] = ip.label
        #initialvalues['startdate'] = ip.startdate
        #initialvalues['enddate'] = ip.enddate
        initialvalues['type'] = ip.iptype
        if site_profile == "SE":
            form = forms.CreateFormSE( initial=initialvalues )
        if site_profile == "NO":
            form = forms.CreateFormNO( initial=initialvalues )
        #form = forms.CreateForm( initial=initialvalues )
        
    c = {'form':form,
         'zone':zone,
         'ip':ip,
         'destinationroot':destination_path,
         }
    c.update(csrf(request))
    return render_to_response('create/create.html', c, context_instance=RequestContext(request) )
	


def navigationView(request):
	#import json
    originalTree = InformationPackage.objects.all()
    listOfIPs = []
    i = 0
    while (i < len(originalTree)):
        ip = {}
        a = originalTree[i]
        ip['archivist_organization'] = a.archivist_organization
        ip['label'] = a.label
        listOfIPs.append(ip)
        i = i + 1
    return HttpResponse(json.dumps(listOfIPs), content_type='application/json')
	
@login_required
def listView(request):
    
    ip = InformationPackage.objects.all()
    c = {
    'informationpackages': ip
	
    }
    return render_to_response( 'create/iplist.html', c, context_instance=RequestContext(request) )

def navigationFrameView(request):

    return render_to_response( 'create/navigation.html', context_instance=RequestContext(request) )



