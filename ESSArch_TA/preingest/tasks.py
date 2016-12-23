from __future__ import absolute_import

import os
import shutil

from ESSArch_Core.configuration.models import Path
from ESSArch_Core.WorkflowEngine.dbtask import DBTask
from ESSArch_Core import tasks

class ReceiveSIP(DBTask):
    event_type = 20100

    def run(self, ip=None):
        prepare = Path.objects.get(entity="path_ingest_work").value

        srcdir, srcfile = os.path.split(ip.ObjectPath)
        dst = os.path.join(prepare, srcfile)

        shutil.copy(ip.ObjectPath, dst)

        src = os.path.join(srcdir, "%s.xml" % ip.pk)
        dst = os.path.join(prepare, "%s.xml" % ip.pk)
        shutil.copy(src, dst)

        self.set_progress(100, total=100)
        return ip

    def undo(self, ip=None):
        pass

    def event_outcome_success(self, ip=None):
        return "Received IP '%s' with label '%s'" % (ip.pk, ip.Label)

class TransferSIP(DBTask):
    event_type = 20900

    def run(self, ip=None):
        srcdir, srcfile = os.path.split(ip.ObjectPath)
        epp = Path.objects.get(entity="path_gate_reception").value
        dst = os.path.join(epp, srcfile)

        shutil.copy(ip.ObjectPath, dst)

        ip.ObjectPath = dst
        ip.save(update_fields=['ObjectPath'])

        self.set_progress(50, total=100)

        src = os.path.join(srcdir, "%s.xml" % ip.pk)
        dst = os.path.join(epp, "%s.xml" % ip.pk)
        shutil.copy(src, dst)

        self.set_progress(100, total=100)

        return ip.ObjectPath

    def undo(self, ip=None):
        pass

    def event_outcome_success(self, ip=None):
        return "Transferred IP '%s' with label '%s'" % (ip.pk, ip.Label)

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
