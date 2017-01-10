import os
import shutil

from django.conf import settings
from django.contrib.auth.models import User
from django.test import TestCase

from install.install_default_config_eta import installDefaultEventTypes

from ESSArch_Core.configuration.models import (
    Path,
)

from ESSArch_Core.ip.models import (
    EventIP,
    InformationPackage,
)

from ESSArch_Core.WorkflowEngine.models import (
    ProcessTask,
)


def setUpModule():
    installDefaultEventTypes()


class test_tasks(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.root = os.path.dirname(os.path.realpath(__file__))
        cls.ingest_reception = os.path.join(cls.root, "ingest_reception")
        cls.ingest_work = os.path.join(cls.root, "ingest_work")
        cls.gate_reception = os.path.join(cls.root, "gate_reception")

        for path in [cls.ingest_reception, cls.ingest_work, cls.gate_reception]:
            try:
                os.makedirs(path)
            except OSError as e:
                if e.errno != 17:
                    raise

        Path.objects.create(
            entity="path_ingest_reception",
            value=cls.ingest_reception
        )
        Path.objects.create(
            entity="path_ingest_work",
            value=cls.ingest_work
        )
        Path.objects.create(
            entity="path_gate_reception",
            value=cls.gate_reception
        )

    @classmethod
    def tearDownClass(cls):
        for path in [cls.ingest_reception, cls.ingest_work, cls.gate_reception]:
            try:
                shutil.rmtree(path)
            except:
                pass

        super(test_tasks, cls).tearDownClass()

    def setUp(self):
        settings.CELERY_ALWAYS_EAGER = True
        settings.CELERY_EAGER_PROPAGATES_EXCEPTIONS = True

    def test_receive_sip(self):
        ip = InformationPackage.objects.create()

        srctar = os.path.join(self.ingest_reception, "%s.tar" % ip.pk)
        srcxml = os.path.join(self.ingest_reception, "%s.xml" % ip.pk)
        open(srctar, "a").close()
        open(srcxml, "a").close()

        ip.ObjectPath = os.path.join(self.ingest_reception, str(ip.pk) + ".tar")
        ip.save()

        task = ProcessTask(
            name="preingest.tasks.ReceiveSIP",
            params={
                "ip": ip
            },
        )
        task.run()

        self.assertTrue(os.path.isfile(os.path.join(self.ingest_work, str(ip.pk) + ".tar")))
        self.assertTrue(os.path.isfile(os.path.join(self.ingest_work, str(ip.pk) + ".xml")))

        task.undo()

        self.assertFalse(os.path.isfile(os.path.join(self.ingest_work, str(ip.pk) + ".tar")))
        self.assertFalse(os.path.isfile(os.path.join(self.ingest_work, str(ip.pk) + ".xml")))

    def test_transfer_sip(self):
        ip = InformationPackage.objects.create()

        srctar = os.path.join(self.ingest_reception, "%s.tar" % ip.pk)
        srcxml = os.path.join(self.ingest_reception, "%s.xml" % ip.pk)
        open(srctar, "a").close()
        open(srcxml, "a").close()

        ip.ObjectPath = os.path.join(self.ingest_reception, str(ip.pk) + ".tar")
        ip.save()

        task = ProcessTask(
            name="preingest.tasks.TransferSIP",
            params={
                "ip": ip
            },
        )
        task.run()

        self.assertTrue(os.path.isfile(os.path.join(self.gate_reception, str(ip.pk) + ".tar")))
        self.assertTrue(os.path.isfile(os.path.join(self.gate_reception, str(ip.pk) + ".xml")))

        task.undo()

        self.assertFalse(os.path.isfile(os.path.join(self.gate_reception, str(ip.pk) + ".tar")))
        self.assertFalse(os.path.isfile(os.path.join(self.gate_reception, str(ip.pk) + ".xml")))