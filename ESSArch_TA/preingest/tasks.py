from __future__ import absolute_import

import os, shutil, string

from django.conf import settings
from django.core import serializers

from lxml import etree

from ESSArch_Core.configuration.models import Path
from ESSArch_Core.WorkflowEngine.dbtask import DBTask
from ESSArch_Core.profiles.models import ProfileIP
from ESSArch_Core.util import (
    get_value_from_path,
    remove_prefix
)
from ESSArch_Core import tasks

class ReceiveSIP(DBTask):
    event_type = 20100

    def run(self, ip=None):
        reception = Path.objects.get(entity="path_ingest_reception").value
        prepare = Path.objects.get(entity="path_ingest_work").value

        tarfile = os.path.join(reception, "%s.tar" % ip.pk)
        zipfile = os.path.join(reception, "%s.zip" % ip.pk)

        if os.path.isfile(tarfile):
            src = tarfile
            dst = os.path.join(prepare, "%s.tar" % ip.pk)
            shutil.copy(src, dst)

        if os.path.isfile(zipfile):
            src = zipfile
            dst = os.path.join(prepare, "%s.zip" % ip.pk)
            shutil.copy(src, dst)

        ip.ObjectPath = dst
        ip.save(update_fields=['ObjectPath'])

        src = os.path.join(reception, "%s.xml" % ip.pk)
        dst = os.path.join(prepare, "%s.xml" % ip.pk)
        shutil.copy(src, dst)

        with open(os.path.join(reception, "%s_event_profile.json" % ip.pk)) as f:
            json_str = f.read()
            for p in serializers.deserialize("json", json_str):
                p.save()

                ProfileIP.objects.create(
                    profile=p.object,
                    ip=ip
                )

        self.set_progress(100, total=100)
        return ip

    def undo(self, ip=None):
        pass

    def event_outcome_success(self, ip=None):
        return "Received IP '%s' with label '%s'" % (ip.pk, ip.Label)

class TransferSIP(DBTask):
    event_type = 20900

    def run(self, ip=None):
        workdir = Path.objects.get(entity="path_ingest_work").value
        srcdir = Path.objects.get(entity="path_ingest_reception").value
        dstdir = Path.objects.get(entity="path_gate_reception").value

        src = string.replace(ip.ObjectPath, workdir, srcdir, 1)
        dst = string.replace(ip.ObjectPath, workdir, dstdir, 1)
        shutil.copy(src, dst)

        ip.ObjectPath = dst
        ip.save(update_fields=['ObjectPath'])

        self.set_progress(50, total=100)

        src = os.path.join(srcdir, "%s.xml" % ip.pk)
        dst = os.path.join(dstdir, "%s.xml" % ip.pk)
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
