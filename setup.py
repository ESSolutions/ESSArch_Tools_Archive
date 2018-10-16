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

from setuptools import find_packages, setup
import versioneer
versioneer.VCS = 'git'
versioneer.versionfile_source = 'ESSArch_TA/_version.py'
versioneer.versionfile_build = None
versioneer.tag_prefix = ''  # tags are like 1.2.0
versioneer.parentdir_prefix = 'ESSArch_TA-'

if __name__ == '__main__':
    setup(
        name='ESSArch_TA',
        version=versioneer.get_version(),
        description='ESSArch Tools Archive',
        author='Bjorn Skog',
        author_email='info@essolutions.se',
        url='http://www.essolutions.se',
        install_requires=[
            "ESSArch-Core>=1.1.0.*,<=1.1.1.*",
        ],
        extras_require={
            "mssql": ["django-pyodbc-azure==1.11.15.0"],
            "mysql": ["mysqlclient==1.3.13"],
            "postgres": ["psycopg2==2.7.5"],
        },
        packages=find_packages(),
        include_package_data=True,
        zip_safe=False,
        cmdclass=versioneer.get_cmdclass(),
    )
