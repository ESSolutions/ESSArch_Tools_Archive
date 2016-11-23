from __future__ import absolute_import

import os, shutil

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
        prepare = Path.objects.get(entity="path_ingest_prepare").value

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


class ValidateLogicalPhysicalRepresentation(DBTask):
    event_type = 20262

    """
    Validates the logical and physical representation of objects.

    The comparison checks if the lists contains the same elements (though not
    the order of the elements).

    See http://stackoverflow.com/a/7829388/1523238
    """

    def run(self, dirname=None, files=[], xmlfile=None):
        if dirname:
            xmlrelpath = os.path.relpath(xmlfile, dirname)
            xmlrelpath = remove_prefix(xmlrelpath, "./")
        else:
            xmlrelpath = xmlfile

        doc = etree.ElementTree(file=xmlfile)

        root = doc.getroot()

        logical_files = set()
        physical_files = set()

        for elname, props in settings.FILE_ELEMENTS.iteritems():
            for f in doc.xpath('.//*[local-name()="%s"]' % elname):
                filename = get_value_from_path(f, props["path"])

                if filename:
                    filename = remove_prefix(filename, props.get("pathprefix", ""))
                    logical_files.add(filename)

        if dirname:
            for root, dirs, filenames in os.walk(dirname):
                for f in filenames:
                    if f != xmlrelpath:
                        reldir = os.path.relpath(root, dirname)
                        relfile = os.path.join(reldir, f)
                        relfile = remove_prefix(relfile, "./")

                        physical_files.add(relfile)

        for f in files:
            physical_files.add(os.path.basename(f))

        assert logical_files == physical_files, "the logical representation differs from the physical"
        self.set_progress(100, total=100)

    def undo(self, dirname=None, files=[], xmlfile=None):
        pass

    def event_outcome_success(self, dirname=None, files=[], xmlfile=None):
        return "Validated logical and physical structure of %s and %s" % (xmlfile, dirname)

class ValidateIntegrity(tasks.ValidateIntegrity):
    event_type = 20263


class UpdateIPStatus(tasks.UpdateIPStatus):
    event_type = 20280
