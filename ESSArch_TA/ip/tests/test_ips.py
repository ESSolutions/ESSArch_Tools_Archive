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

import os
import shutil

from django.contrib.auth.models import User
from django.test import TransactionTestCase, override_settings
from django.urls import reverse

from lxml import etree

from rest_framework import status
from rest_framework.test import APIClient

from ESSArch_Core.configuration.models import Path
from ESSArch_Core.ip.models import InformationPackage


@override_settings(CELERY_ALWAYS_EAGER=True, CELERY_EAGER_PROPAGATES_EXCEPTIONS=True)
class IdentifyIP(TransactionTestCase):
    def setUp(self):
        self.bd = os.path.dirname(os.path.realpath(__file__))
        self.datadir = os.path.join(self.bd, "datafiles")

        try:
            os.mkdir(self.datadir)
        except:
            pass

        mimetypes = Path.objects.create(
            entity="path_mimetypes_definitionfile",
            value=os.path.join(self.datadir, "mime.types"),
        ).value
        with open(mimetypes, 'w') as f:
            f.write('application/x-tar tar')

        self.path = Path.objects.create(
            entity="path_ingest_unidentified", value=self.datadir
        ).value
        self.user = User.objects.create(username="admin")

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.reception_url = reverse('ip-reception-list')
        self.identify_url = '%sidentify-ip/' % self.reception_url

        self.objid = 'unidentified_ip'
        fpath = os.path.join(self.path, '%s.tar' % self.objid)
        open(fpath, 'a').close()

    def tearDown(self):
        try:
            shutil.rmtree(self.datadir)
        except:
            pass

    def test_identify_ip(self):
        data = {
            'filename': '%s.tar' % self.objid,
            'specification_data': {
                'ObjectIdentifierValue': 'my obj',
                'LABEL': 'my label',
                'profile': 'my profile',
                'RECORDSTATUS': 'my recordstatus',
            },
        }

        res = self.client.post(self.identify_url, data, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        xmlfile = os.path.join(self.path, '%s.xml' % self.objid)
        self.assertTrue(os.path.isfile(xmlfile))

        doc = etree.parse(xmlfile)
        root = doc.getroot()

        self.assertEqual(root.get('OBJID').split(':')[1], self.objid)
        self.assertEqual(root.get('LABEL'), data['specification_data']['LABEL'])

    def test_identify_ip_no_objid(self):
        data = {
            'filename': '%s.tar' % self.objid,
            'specification_data': {
                'LABEL': 'my label',
                'profile': 'my profile',
                'RECORDSTATUS': 'my recordstatus',
            },
        }

        res = self.client.post(self.identify_url, data, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        xmlfile = os.path.join(self.path, '%s.xml' % self.objid)
        self.assertTrue(os.path.isfile(xmlfile))

        doc = etree.parse(xmlfile)
        root = doc.getroot()

        self.assertEqual(root.get('OBJID').split(':')[1], self.objid)
        self.assertEqual(root.get('LABEL'), data['specification_data']['LABEL'])

    def test_identify_ip_no_label(self):
        data = {
            'filename': '%s.tar' % self.objid,
            'specification_data': {
                'ObjectIdentifierValue': 'my obj',
                'profile': 'my profile',
                'RECORDSTATUS': 'my recordstatus',
            },
        }

        res = self.client.post(self.identify_url, data, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        xmlfile = os.path.join(self.path, '%s.xml' % self.objid)
        self.assertTrue(os.path.isfile(xmlfile))

        doc = etree.parse(xmlfile)
        root = doc.getroot()

        self.assertEqual(root.get('OBJID').split(':')[1], self.objid)
        self.assertEqual(root.get('LABEL'), self.objid)
