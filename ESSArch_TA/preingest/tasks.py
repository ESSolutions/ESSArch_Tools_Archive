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

import os
import shutil

from ESSArch_Core.configuration.models import Path
from ESSArch_Core.ip.models import InformationPackage
from ESSArch_Core.WorkflowEngine.dbtask import DBTask
from ESSArch_Core import tasks


class ReceiveSIP(DBTask):
    event_type = 20100

    def run(self, ip=None):
        prepare = Path.objects.get(entity="path_ingest_work").value
        objectpath = InformationPackage.objects.values_list('ObjectPath', flat=True).get(pk=ip)

        srcdir, srcfile = os.path.split(objectpath)
        dst = os.path.join(prepare, srcfile)

        shutil.copy(objectpath, dst)

        objid = InformationPackage.objects.values_list(
            'ObjectIdentifierValue', flat=True
        ).get(pk=ip)

        src = os.path.join(srcdir, "%s.xml" % objid)
        dst = os.path.join(prepare, "%s.xml" % objid)
        shutil.copy(src, dst)

        self.set_progress(100, total=100)
        return ip

    def undo(self, ip=None):
        objectpath = InformationPackage.objects.values_list('ObjectPath', flat=True).get(pk=ip)

        ipdir, ipfile = os.path.split(objectpath)
        ingest_work = Path.objects.get(entity="path_ingest_work").value

        objid = InformationPackage.objects.values_list(
            'ObjectIdentifierValue', flat=True
        ).get(pk=ip)

        os.remove(os.path.join(ingest_work, ipfile))
        os.remove(os.path.join(ingest_work, "%s.xml" % objid))

    def event_outcome_success(self, ip=None):
        label = InformationPackage.objects.values_list('Label', flat=True).get(pk=ip)
        return "Received IP '%s' with label '%s'" % (ip, label)


class TransferSIP(DBTask):
    event_type = 20900

    def run(self, ip=None):
        objectpath = InformationPackage.objects.values_list('ObjectPath', flat=True).get(pk=ip)

        srcdir, srcfile = os.path.split(objectpath)
        epp = Path.objects.get(entity="path_gate_reception").value
        dst = os.path.join(epp, srcfile)

        shutil.copy(objectpath, dst)

        InformationPackage.objects.filter(pk=ip).update(ObjectPath=dst)

        self.set_progress(50, total=100)

        objid = InformationPackage.objects.values_list(
            'ObjectIdentifierValue', flat=True
        ).get(pk=ip)

        src = os.path.join(srcdir, "%s.xml" % objid)
        dst = os.path.join(epp, "%s.xml" % objid)
        shutil.copy(src, dst)

        self.set_progress(100, total=100)

        return dst

    def undo(self, ip=None):
        objectpath = InformationPackage.objects.values_list('ObjectPath', flat=True).get(pk=ip)

        ipdir, ipfile = os.path.split(objectpath)
        gate_reception = Path.objects.get(entity="path_gate_reception").value

        objid = InformationPackage.objects.values_list(
            'ObjectIdentifierValue', flat=True
        ).get(pk=ip)

        os.remove(os.path.join(gate_reception, ipfile))
        os.remove(os.path.join(gate_reception, "%s.xml" % objid))

    def event_outcome_success(self, ip=None):
        label = InformationPackage.objects.values_list('Label', flat=True).get(pk=ip)
        return "Transferred IP '%s' with label '%s'" % (ip, label)


class CalculateChecksum(tasks.CalculateChecksum):
    event_type = 20210


class IdentifyFileFormat(tasks.IdentifyFileFormat):
    event_type = 20220


class GenerateXML(tasks.GenerateXML):
    event_type = 20230


class AppendEvents(tasks.AppendEvents):
    event_type = 20240


class CopySchemas(tasks.CopySchemas):
    event_type = 20250


class ValidateFileFormat(tasks.ValidateFileFormat):
    event_type = 20260


class ValidateXMLFile(tasks.ValidateXMLFile):
    event_type = 20261


class ValidateLogicalPhysicalRepresentation(tasks.ValidateLogicalPhysicalRepresentation):
    event_type = 20262


class ValidateIntegrity(tasks.ValidateIntegrity):
    event_type = 20263


class ValidateFiles(tasks.ValidateFiles):
    fileformat_task = "preingest.tasks.ValidateFileFormat"
    checksum_task = "preingest.tasks.ValidateIntegrity"


class UpdateIPStatus(tasks.UpdateIPStatus):
    event_type = 20280
