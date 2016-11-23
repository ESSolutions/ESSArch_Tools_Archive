from __future__ import absolute_import

import os, shutil, urllib

from django.conf import settings
from django.core import serializers

from ESSArch_Core.essxml.Generator.xmlGenerator import XMLGenerator

from fido.fido import Fido

from lxml import etree

from ESSArch_Core.configuration.models import Path
from ESSArch_Core.WorkflowEngine.dbtask import DBTask
from ESSArch_Core.profiles.models import ProfileIP
from ESSArch_Core.WorkflowEngine.models import ProcessStep, ProcessTask

from ESSArch_Core.util import (
    alg_from_str,
    getSchemas,
    get_value_from_path,
    remove_prefix
)

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

class CalculateChecksum(DBTask):
    event_type = 20210

    def run(self, filename=None, block_size=65536, algorithm='SHA-256'):
        """
        Calculates the checksum for the given file, one chunk at a time

        Args:
            filename: The filename to calculate checksum for
            block_size: The size of the chunk to calculate
            algorithm: The algorithm to use

        Returns:
            The hexadecimal digest of the checksum
        """

        hash_val = alg_from_str(algorithm)()

        with open(filename, 'r') as f:
            while True:
                data = f.read(block_size)
                if data:
                    hash_val.update(data)
                else:
                    break

        self.set_progress(100, total=100)
        return hash_val.hexdigest()

    def undo(self, filename=None, block_size=65536, algorithm='SHA-256'):
        pass

    def event_outcome_success(self, filename=None, block_size=65536, algorithm='SHA-256'):
        return "Created checksum for %s with %s" % (filename, algorithm)

class IdentifyFileFormat(DBTask):
    event_type = 20220

    def handle_matches(self, fullname, matches, delta_t, matchtype=''):
        f, sigName = matches[-1]
        self.lastFmt = f.find('name').text

    def run(self, filename=None):
        """
        Identifies the format of the file using the fido library

        Args:
            filename: The filename to identify

        Returns:
            The format of the file
        """

        self.fid = Fido()
        self.fid.handle_matches = self.handle_matches
        self.fid.identify_file(filename)

        self.set_progress(100, total=100)

        return self.lastFmt

    def undo(self, filename=None):
        pass

    def event_outcome_success(self, filename=None, block_size=65536, algorithm='SHA-256'):
        return "Identified foramt of %s" % filename

class GenerateXML(DBTask):
    event_type = 20230

    """
    Generates the XML using the specified data and folder, and adds the XML to
    the specified files
    """

    def run(self, info={}, filesToCreate={}, folderToParse=None):
        generator = XMLGenerator(
            filesToCreate, info
        )

        generator.generate(
            folderToParse=folderToParse,
            ip=self.taskobj.information_package
        )

        self.set_progress(100, total=100)

    def undo(self, info={}, filesToCreate={}, folderToParse=None):
        for f, template in filesToCreate.iteritems():
            os.remove(f)

    def event_outcome_success(self, info={}, filesToCreate={}, folderToParse=None, algorithm='SHA-256'):
        return "Generated %s" % ", ".join(filesToCreate.keys())


class InsertXML(DBTask):
    """
    Inserts XML to the specifed file
    """

    def run(self, filename=None, elementToAppendTo=None, spec={}, info={}, index=None):
        generator = XMLGenerator()

        generator.insert(filename, elementToAppendTo, spec, info=info, index=index)

        self.set_progress(100, total=100)

    def undo(self, filename=None, elementToAppendTo=None, spec={}, info={}, index=None):
        pass

    def event_outcome_success(self, filename=None, elementToAppendTo=None, spec={}, info={}, index=None):
        return "Inserted XML to element %s in %s" % (elementToAppendTo, filename)

class AppendEvents(DBTask):
    event_type = 20240

    """
    """

    def run(self, filename="", events={}):
        generator = XMLGenerator()
        template = {
            "-name": "event",
            "-min": 1,
            "-max": 1,
            "-allowEmpty": 1,
            "-namespace": "premis",
            "-children": [
                {
                    "-name": "eventIdentifier",
                    "-min": 1,
                    "-max": 1,
                    "-allowEmpty": 1,
                    "-namespace": "premis",
                    "-children": [
                        {
                            "-name": "eventIdentifierType",
                            "-min": 1,
                            "-max": 1,
                            "-namespace": "premis",
                            "#content": [{"var":"eventIdentifierType"}]
                        },{
                            "-name": "eventIdentifierValue",
                            "-min": 1,
                            "-max": 1,
                            "-allowEmpty": 1,
                            "-namespace": "premis",
                            "#content": [{"var": "eventIdentifierValue"}]
                        },
                    ]
                },
                {
                    "-name": "eventType",
                    "-min": 1,
                    "-max": 1,
                    "-allowEmpty": 1,
                    "-namespace": "premis",
                    "#content": [{"var": "eventType"}]
                },
                {
                    "-name": "eventDateTime",
                    "-min": 1,
                    "-max": 1,
                    "-allowEmpty": 1,
                    "-namespace": "premis",
                    "#content": [{"var": "eventDateTime"}]
                },
                {
                    "-name": "eventDetailInformation",
                    "-namespace": "premis",
                    "-children": [
                        {
                            "-name": "eventDetail",
                            "-min": 1,
                            "-max": 1,
                            "-allowEmpty": 1,
                            "-namespace": "premis",
                            "#content": [{"var": "eventDetail"}]
                        },
                    ]
                },
                {
                    "-name": "eventOutcomeInformation",
                    "-min": 1,
                    "-max": 1,
                    "-allowEmpty": 1,
                    "-namespace": "premis",
                    "-children": [
                        {
                            "-name": "eventOutcome",
                            "-min": 1,
                            "-max": 1,
                            "-allowEmpty": 1,
                            "-namespace": "premis",
                            "#content": [{"var":"eventOutcome"}]
                        },
                        {
                            "-name": "eventOutcomeDetail",
                            "-min": 1,
                            "-max": 1,
                            "-allowEmpty": 1,
                            "-namespace": "premis",
                            "-children": [
                                {
                                    "-name": "eventOutcomeDetailNote",
                                    "-min": 1,
                                    "-max": 1,
                                    "-allowEmpty": 1,
                                    "-namespace": "premis",
                                    "#content": [{"var":"eventOutcomeDetailNote"}]
                                },
                            ]
                        },
                    ]
                },
                {
                    "-name": "linkingAgentIdentifier",
                    "-min": 1,
                    "-max": 1,
                    "-allowEmpty": 1,
                    "-namespace": "premis",
                    "-children": [
                        {
                            "-name": "linkingAgentIdentifierType",
                            "-min": 1,
                            "-max": 1,
                            "-namespace": "premis",
                            "#content": [{"var":"linkingAgentIdentifierType"}]
                        },
                        {
                            "-name": "linkingAgentIdentifierValue",
                            "-min": 1,
                            "-max": 1,
                            "-allowEmpty": 1,
                            "-namespace": "premis",
                            "#content": [{"var": "linkingAgentIdentifierValue"}]
                        },
                    ]
                },
                {
                    "-name": "linkingObjectIdentifier",
                    "-min": 1,
                    "-max": 1,
                    "-allowEmpty": 1,
                    "-namespace": "premis",
                    "-children": [
                        {
                            "-name": "linkingObjectIdentifierType",
                            "-min": 1,
                            "-max": 1,
                            "-namespace": "premis",
                            "#content": [{"var":"linkingObjectIdentifierType"}]
                        },
                        {
                            "-name": "linkingObjectIdentifierValue",
                            "-min": 1,
                            "-max": 1,
                            "-allowEmpty": 1,
                            "-namespace": "premis",
                            "#content": [{"var": "linkingObjectIdentifierValue"}]
                        },
                    ]
                },
            ]
        }

        for event in events:

            data = {
                "eventIdentifierType": "SE/RA",
                "eventIdentifierValue": str(event.id),
                "eventType": str(event.eventType.eventType),
                "eventDateTime": str(event.eventDateTime),
                "eventDetail": event.eventType.eventDetail,
                "eventOutcome": event.eventOutcome,
                "eventOutcomeDetailNote": event.eventOutcomeDetailNote,
                "linkingAgentIdentifierType": "SE/RA",
                "linkingAgentIdentifierValue": event.linkingAgentIdentifierValue,
                "linkingObjectIdentifierType": "SE/RA",
                "linkingObjectIdentifierValue": str(event.linkingObjectIdentifierValue.ObjectIdentifierValue),
            }

            generator.insert(filename, "premis", template, data)

        self.set_progress(100, total=100)

    def undo(self, filename="", events={}):
        pass

    def event_outcome_success(self, filename="", events={}):
        return "Appended events to %s" % filename

class CopySchemas(DBTask):
    event_type = 20250

    """
    Copies the schema to a specified (?) location
    """

    def findDestination(self, dirname, structure, path=''):
        for content in structure:
            if content['name'] == dirname and content['type'] == 'folder':
                return os.path.join(path, dirname)
            elif content['type'] == 'dir':
                rec = self.findDestination(
                    dirname, content['children'], os.path.join(path, content['name'])
                )
                if rec: return rec

    def createSrcAndDst(self, schema, root, structure):
        src = schema['location']
        fname = os.path.basename(src.rstrip("/"))
        dst = os.path.join(
            root,
            self.findDestination(schema['preservation_location'], structure),
            fname
        )

        return src, dst

    def run(self, schema={}, root=None, structure=None):

        src, dst = self.createSrcAndDst(schema, root, structure)
        urllib.urlretrieve(src, dst)

        self.set_progress(100, total=100)

    def undo(self, schema={}, root=None, structure=None):
        pass

    def event_outcome_success(self, schema={}, root=None, structure=None):
        src, dst = self.createSrcAndDst(schema, root, structure)
        return "Copied schemas from %s to %s" % src, dst


class ValidateFiles(DBTask):

    def run(self, ip=None, xmlfile=None, validate_fileformat=True, validate_integrity=True, rootdir=""):
        doc = etree.ElementTree(file=xmlfile)

        print "validate files"
        step = ProcessStep.objects.create(
            name="Validate Files",
            parallel=True,
            parent_step=self.taskobj.processstep
        )

        if any([validate_fileformat, validate_integrity]):
            for elname, props in settings.FILE_ELEMENTS.iteritems():
                for f in doc.xpath('.//*[local-name()="%s"]' % elname):
                    fpath = get_value_from_path(f, props["path"])

                    if fpath:
                        fpath = remove_prefix(fpath, props.get("pathprefix", ""))

                    fformat = get_value_from_path(f, props.get("format"))
                    checksum = get_value_from_path(f, props.get("checksum"))
                    algorithm = get_value_from_path(f, props.get("checksumtype"))

                    if validate_fileformat and fformat is not None:
                        step.tasks.add(ProcessTask.objects.create(
                            name="preingest.tasks.ValidateFileFormat",
                            params={
                                "filename": os.path.join(rootdir, fpath),
                                "fileformat": fformat,
                            },
                            information_package=ip
                        ))

                    if validate_integrity and checksum is not None:
                        step.tasks.add(ProcessTask.objects.create(
                            name="preingest.tasks.ValidateIntegrity",
                            params={
                                "filename": os.path.join(rootdir, fpath),
                                "checksum": checksum,
                                "algorithm": algorithm,
                            },
                            information_package=ip
                        ))

        self.set_progress(100, total=100)

        return step.run()

    def undo(self, ip=None, xmlfile=None, validate_fileformat=True, validate_integrity=True, rootdir=""):
        pass

    def event_outcome_success(self, ip, xmlfile, validate_fileformat=True, validate_integrity=True, rootdir=""):
        return "Validated files in %s" % xmlfile

class ValidateFileFormat(DBTask):
    event_type = 20260

    """
    Validates the format (PREFORMA, jhove, droid, etc.) of the given file
    """

    def run(self, filename=None, fileformat=None):
        t = ProcessTask(
            name="preingest.tasks.IdentifyFileFormat",
            params={
                "filename": filename,
            },
            information_package=self.taskobj.information_package
        )

        res = t.run_eagerly()

        self.set_progress(100, total=100)
        assert res == fileformat, "fileformat for %s is not valid" % filename

    def undo(self, filename=None, fileformat=None):
        pass

    def event_outcome_success(self, filename=None, fileformat=None):
        return "Validated format of %s to be %s" % (filename, fileformat)


class ValidateXMLFile(DBTask):
    event_type = 20261

    """
    Validates (using LXML) an XML file using a specified schema file
    """

    def run(self, xml_filename=None, schema_filename=None):
        doc = etree.ElementTree(file=xml_filename)

        if schema_filename:
            xmlschema = etree.XMLSchema(etree.parse(schema_filename))
        else:
            xmlschema = getSchemas(doc=doc)

        self.set_progress(100, total=100)

        xmlschema.assertValid(doc), "XML file %s is not valid", xml_filename

    def undo(self, xml_filename=None, schema_filename=None):
        pass

    def event_outcome_success(self, xml_filename=None, schema_filename=None):
        return "Validated %s against schema" % xml_filename


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

class ValidateIntegrity(DBTask):
    event_type = 20263

    def run(self, filename=None, checksum=None, block_size=65536, algorithm='SHA-256'):
        """
        Validates the integrity(checksum) for the given file
        """

        t = ProcessTask(
            name="preingest.tasks.CalculateChecksum",
            params={
                "filename": filename,
                "block_size": block_size,
                "algorithm": algorithm
            },
            information_package=self.taskobj.information_package
        )

        digest = t.run_eagerly()

        self.set_progress(100, total=100)

        assert digest == checksum, "checksum for %s is not valid" % filename

    def undo(self, filename=None,checksum=None,  block_size=65536, algorithm='SHA-256'):
        pass

    def event_outcome_success(self, filename=None, checksum=None, block_size=65536, algorithm='SHA-256'):
        return "Validated integrity of %s against %s with %s" % (filename, checksum, algorithm)

class UpdateIPStatus(DBTask):
    event_type = 20280

    def run(self, ip=None, status=None):
        ip.State = status
        ip.save()
        self.set_progress(100, total=100)

    def undo(self, ip=None, status=None):
        pass

    def event_outcome_success(self, ip=None, status=None):
        return "Updated status of %s" % (ip.pk)
