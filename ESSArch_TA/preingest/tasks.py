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
from ESSArch_Core.ip.models import InformationPackage, Workarea
from ESSArch_Core.storage.copy import copy_file
from ESSArch_Core.util import mkdir_p

User = get_user_model()

class ReceiveSIP(DBTask):
    event_type = 20100

    def run(self):
        ip = InformationPackage.objects.get(pk=self.ip)
        package_mets = ip.package_mets_path

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
        ip.object_path = workarea_path
        ip.save()
        Workarea.objects.create(ip=ip, user_id=self.responsible, type=Workarea.INGEST, read_only=False)

    def undo(self):
        reception = Path.objects.values_list('value', flat=True).get(entity="path_ingest_reception")
        workarea_path = self.get_workarea_path()
        ip = InformationPackage.objects.get(pk=self.ip)
        ip.object_path = os.path.join(reception, ip.object_identifier_value)
        try:
            shutil.rmtree(workarea_path)
        except OSError as e:
            if e.errno != errno.ENOENT:
                raise

    def event_outcome_success(self):
        return "Received IP"


class TransferSIP(DBTask):
    event_type = 20600

    def run(self):
        ip = InformationPackage.objects.get(pk=self.ip)
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

    def undo(self):
        objectpath = InformationPackage.objects.values_list('object_path', flat=True).get(pk=self.ip)

        ipdir, ipfile = os.path.split(objectpath)
        gate_reception = Path.objects.get(entity="path_gate_reception").value

        objid = InformationPackage.objects.values_list(
            'object_identifier_value', flat=True
        ).get(pk=self.ip)

        os.remove(os.path.join(gate_reception, ipfile))
        os.remove(os.path.join(gate_reception, "%s.xml" % objid))

    def event_outcome_success(self):
        label = InformationPackage.objects.values_list('label', flat=True).get(pk=self.ip)
        return "Transferred IP with label '%s'" % (label)
