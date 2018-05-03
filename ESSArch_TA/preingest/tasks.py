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

import requests
from django.contrib.auth import get_user_model

# noinspection PyUnresolvedReferences
from ESSArch_Core import tasks
from ESSArch_Core.WorkflowEngine.dbtask import DBTask
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
from ESSArch_Core.storage.copy import copy_file
from ESSArch_Core.util import mkdir_p

User = get_user_model()

class ReceiveSIP(DBTask):
    event_type = 20100

    def run(self):
        ip = InformationPackage.objects.get(pk=self.ip)
        objpath = ip.object_path
        package_mets = ip.package_mets_path
        objid, container_type = os.path.splitext(os.path.basename(objpath))
        parsed = parse_submit_description(package_mets, srcdir=os.path.split(objpath)[0])

        archival_institution = parsed.get('archival_institution')
        archivist_organization = parsed.get('archivist_organization')
        archival_type = parsed.get('archival_type')
        archival_location = parsed.get('archival_location')

        if archival_institution:
            arch, _ = ArchivalInstitution.objects.get_or_create(
                name=archival_institution
            )
            ip.archival_institution = arch

        if archivist_organization:
            arch, _ = ArchivistOrganization.objects.get_or_create(
                name=archivist_organization
            )
            ip.archivist_organization = arch

        if archival_type:
            arch, _ = ArchivalType.objects.get_or_create(
                name=archival_type
            )
            ip.archival_type = arch

        if archival_location:
            arch, _ = ArchivalLocation.objects.get_or_create(
                name=archival_location
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

        shutil.copy(ip.object_path, dst_dir)
        shutil.copy(package_mets, dst_dir)

        Workarea.objects.create(ip=ip, user_id=self.responsible, type=Workarea.INGEST, read_only=False)

    def undo(self):
        ip = InformationPackage.objects.get(pk=self.ip)
        objpath = ip.object_path
        package_mets = ip.package_mets_path

        workarea = Path.objects.get(entity='ingest_workarea').value
        username = User.objects.get(pk=self.responsible).username
        workarea_user = os.path.join(workarea, username)

        workarea_obj = os.path.join(workarea_user, os.path.basename(objpath))
        workarea_package_mets = os.path.join(workarea_user, os.path.basename(package_mets))

        for workarea_file in [workarea_obj, workarea_package_mets]:
            try:
                os.remove(workarea_file)
            except OSError as e:
                if e.errno != errno.ENOENT:
                    raise

    def event_outcome_success(self):
        return "Received IP"


class ReceiveDir(DBTask):
    def get_workarea_path(self):
        ip = InformationPackage.objects.get(pk=self.ip)
        workarea = Path.objects.get(entity='ingest_workarea').value
        username = User.objects.get(pk=self.responsible).username
        workarea_user = os.path.join(workarea, username)
        return os.path.join(workarea_user, ip.object_identifier_value)

    def run(self):
        ip = InformationPackage.objects.get(pk=self.ip)
        objpath = ip.object_path
        workarea_path = self.get_workarea_path()

        shutil.copytree(objpath, workarea_path)
        Workarea.objects.create(ip=ip, user_id=self.responsible, type=Workarea.INGEST, read_only=False)

    def undo(self):
        workarea_path = self.get_workarea_path()
        try:
            shutil.rmtree(workarea_path)
        except OSError as e:
            if e.errno != errno.ENOENT:
                raise

    def event_outcome_success(self):
        return "Received IP"


class TransferSIP(DBTask):
    event_type = 20600

    def run(self, ip=None):
        ip = InformationPackage.objects.get(pk=ip)
        src = ip.object_path
        srcdir, srcfile = os.path.split(src)
        epp = Path.objects.get(entity="path_gate_reception").value

        try:
            remote = ip.get_profile_data('transfer_project').get(
                'preservation_organization_receiver_url_epp'
            )
        except AttributeError:
            remote = None

        session = None

        if remote:
            try:
                dst, remote_user, remote_pass = remote.split(',')

                session = requests.Session()
                session.verify = False
                session.auth = (remote_user, remote_pass)
            except ValueError:
                remote = None
        else:
            dst = os.path.join(epp, srcfile)

        block_size = 8 * 1000000 # 8MB

        copy_file(src, dst, requests_session=session, block_size=block_size)

        self.set_progress(50, total=100)

        objid = ip.object_identifier_value
        src = os.path.join(srcdir, "%s_ipevents.xml" % objid)
        if not remote:
            dst = os.path.join(epp, "%s_ipevents.xml" % objid)

        copy_file(src, dst, requests_session=session, block_size=block_size)

        self.set_progress(75, total=100)

        objid = ip.object_identifier_value
        src = os.path.join(srcdir, "%s.xml" % objid)
        if not remote:
            dst = os.path.join(epp, "%s.xml" % objid)

        copy_file(src, dst, requests_session=session, block_size=block_size)

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
