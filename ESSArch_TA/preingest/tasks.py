"""
    ESSArch is an open source archiving and digital preservation system

    ESSArch Tools for Archive (ETA)
    Copyright (C) 2005-2017 ES Solutions AB

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program. If not, see <http://www.gnu.org/licenses/>.

    Contact information:
    Web - http://www.essolutions.se
    Email - essarch@essolutions.se
"""

from __future__ import absolute_import

import errno
import os
import shutil

from django.contrib.auth import get_user_model

from ESSArch_Core.configuration.models import Path
from ESSArch_Core.essxml.util import parse_submit_description
from ESSArch_Core.ip.models import (
    ArchivalInstitution,
    ArchivistOrganization,
    ArchivalLocation,
    ArchivalType,
    InformationPackage,
    Workarea,
)
from ESSArch_Core.util import mkdir_p
from ESSArch_Core.WorkflowEngine.dbtask import DBTask
from ESSArch_Core.WorkflowEngine.models import ProcessTask, ProcessStep
from ESSArch_Core import tasks


User = get_user_model()

class ReceiveSIP(DBTask):
    event_type = 20100

    def run(self, ip, xml, container):
        ip = InformationPackage.objects.get(pk=ip)
        objid, container_type = os.path.splitext(os.path.basename(container))
        parsed = parse_submit_description(xml, srcdir=os.path.split(container)[0])

        archival_institution = parsed.get('archival_institution')
        archivist_organization = parsed.get('archivist_organization')
        archival_type = parsed.get('archival_type')
        archival_location = parsed.get('archival_location')

        if archival_institution:
            arch, _ = ArchivalInstitution.objects.get_or_create(
                name=archival_institution['name']
            )
            ip.archival_institution = arch

        if archivist_organization:
            arch, _ = ArchivistOrganization.objects.get_or_create(
                name=archivist_organization['name']
            )
            ip.archivist_organization = arch

        if archival_type:
            arch, _ = ArchivalType.objects.get_or_create(
                name=archival_type['name']
            )
            ip.archival_type = arch

        if archival_location:
            arch, _ = ArchivalLocation.objects.get_or_create(
                name=archival_location['name']
            )
            ip.archival_location = arch

        ip.save(update_fields=[
            'archival_institution', 'archivist_organization', 'archival_type',
            'archival_location',
        ])

        workarea = Path.objects.get(entity='ingest_workarea').value
        username = User.objects.get(pk=self.responsible).username
        workarea_user = os.path.join(workarea, username)
        dst_dir = os.path.join(workarea_user, ip.object_identifier_value)
        mkdir_p(dst_dir)

        srcdir, srcfile = os.path.split(ip.object_path)
        dst = os.path.join(dst_dir, srcfile)
        shutil.copy(ip.object_path, dst)

        src = os.path.join(srcdir, "%s.xml" % objid)
        dst = os.path.join(dst_dir, "%s.xml" % objid)
        shutil.copy(src, dst)

        Workarea.objects.create(ip=ip, user_id=self.responsible, type=Workarea.INGEST, read_only=False)

    def undo(self, ip, xml, container):
        objid, container_type = os.path.splitext(os.path.basename(container))
        ip = InformationPackage.objects.get(object_identifier_value=objid)
        ingest_work = Path.objects.get(entity="ingest_workarea").value

        try:
            shutil.rmtree(os.path.join(ingest_work, ip.object_identifier_value))
        except OSError as e:
            if e.errno != errno.ENOENT:
                raise

        InformationPackage.objects.filter(pk=ip).delete()

    def event_outcome_success(self, ip, xml, container):
        return "Received IP '%s'" % str(ip)


class ReceiveDir(DBTask):
    def run(self, ip, objpath):
        ip = InformationPackage.objects.get(pk=ip)
        workarea = Path.objects.get(entity='ingest_workarea').value
        username = User.objects.get(pk=self.responsible).username
        workarea_user = os.path.join(workarea, username)
        dst = os.path.join(workarea_user, ip.object_identifier_value)

        shutil.copytree(objpath, dst)
        Workarea.objects.create(ip=ip, user_id=self.responsible, type=Workarea.INGEST, read_only=False)

    def undo(self, ip, objpath):
        ip = InformationPackage.objects.get(pk=ip)
        workarea = Path.objects.get(entity='ingest_workarea').value
        username = User.objects.get(pk=self.responsible).username
        workarea_user = os.path.join(workarea, username)
        workarea_ip = os.path.join(workarea_user, ip.object_identifier_value)

        try:
            shutil.rmtree(workarea_ip)
        except OSError as e:
            if e.errno != errno.ENOENT:
                raise

        InformationPackage.objects.filter(pk=ip).delete()

    def event_outcome_success(self, ip, xml, container):
        return "Received IP '%s'" % str(ip)


class TransferSIP(DBTask):
    event_type = 20600

    def run(self, ip=None):
        objectpath = InformationPackage.objects.values_list('object_path', flat=True).get(pk=ip)

        srcdir, srcfile = os.path.split(objectpath)
        epp = Path.objects.get(entity="path_gate_reception").value
        dst = os.path.join(epp, srcfile)

        shutil.copy(objectpath, dst)

        InformationPackage.objects.filter(pk=ip).update(object_path=dst)

        self.set_progress(50, total=100)

        objid = InformationPackage.objects.values_list(
            'object_identifier_value', flat=True
        ).get(pk=ip)

        src = os.path.join(srcdir, "%s.xml" % objid)
        dst = os.path.join(epp, "%s.xml" % objid)
        shutil.copy(src, dst)

        self.set_progress(100, total=100)

        return dst

    def undo(self, ip=None):
        objectpath = InformationPackage.objects.values_list('object_path', flat=True).get(pk=ip)

        ipdir, ipfile = os.path.split(objectpath)
        gate_reception = Path.objects.get(entity="path_gate_reception").value

        objid = InformationPackage.objects.values_list(
            'object_identifier_value', flat=True
        ).get(pk=ip)

        os.remove(os.path.join(gate_reception, ipfile))
        os.remove(os.path.join(gate_reception, "%s.xml" % objid))

    def event_outcome_success(self, ip=None):
        label = InformationPackage.objects.values_list('label', flat=True).get(pk=ip)
        return "Transferred IP '%s' with label '%s'" % (ip, label)
