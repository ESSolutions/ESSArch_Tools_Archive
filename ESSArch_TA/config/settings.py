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

"""
Django settings for ETA project.

Generated by 'django-admin startproject' using Django 1.9.7.

For more information on this file, see
https://docs.djangoproject.com/en/1.9/topics/settings/

For the full list of settings and their values, see
https://docs.djangoproject.com/en/1.9/ref/settings/
"""

import os

# Build paths inside the project like this: os.path.join(BASE_DIR, ...)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/1.9/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = '#-f#k7@7eyaez26p-)5$7#+58m79t)yz1@d-s8wn2_downta8*'
SESSION_COOKIE_NAME = 'eta'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = []

REST_FRAMEWORK = {
    'DEFAULT_PAGINATION_CLASS': 'ESSArch_Core.pagination.LinkHeaderPagination',
    'PAGE_SIZE': 10
}


# Application definition

INSTALLED_APPS = [
    'allauth',
    'allauth.account',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.admin',
    'django.contrib.sites',
    'rest_auth',
    'rest_auth.registration',
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'frontend',
    'ESSArch_Core.auth',
    'ESSArch_Core.configuration',
    'ESSArch_Core.ip',
    'ESSArch_Core.profiles',
    'ESSArch_Core.essxml.Generator',
    'ESSArch_Core.essxml.ProfileMaker',
    'ESSArch_Core.WorkflowEngine',
]

SITE_ID = 1

MIDDLEWARE_CLASSES = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.auth.middleware.SessionAuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

CORS_ORIGIN_ALLOW_ALL = True
ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR, 'templates')],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# Database
# https://docs.djangoproject.com/en/1.9/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql', # Add 'postgresql_psycopg2', 'mysql', 'sqlite3' or 'oracle'.
        #'STORAGE_ENGINE': 'MyISAM',           # STORAGE_ENGINE for MySQL database tables, 'MyISAM' or 'INNODB'
        'NAME': 'eta',                    # Or path to database file if using sqlite3.
        'USER': 'arkiv',                      # Not used with sqlite3.
        'PASSWORD': 'password',               # Not used with sqlite3.
        'HOST': '',                           # Set to empty string for localhost. Not used with sqlite3.
        'PORT': '',                           # Set to empty string for default. Not used with sqlite3.
        # This options for storage_engine have to be set for "south migrate" to work.
        'OPTIONS': {
           #"init_command": "SET storage_engine=MyISAM",     # MySQL (<= 5.5.2)
           "init_command": "SET default_storage_engine=MyISAM",     # MySQL (>= 5.5.3)
        }
    }
}

# Cache
CACHES = {
    'default': {
        'TIMEOUT': None,
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': 'redis://127.0.0.1:6379/0',
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        }
    }
}

# Password validation
# https://docs.djangoproject.com/en/1.9/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Django Rest Auth serializers
# http://django-rest-auth.readthedocs.io/en/latest/configuration.html

REST_AUTH_SERIALIZERS = {
    'USER_DETAILS_SERIALIZER': 'ESSArch_Core.auth.serializers.UserSerializer'
}

# File elements in different metadata standards

FILE_ELEMENTS = {
    "file": {
        "path": "FLocat@href",
        "pathprefix": "file:///",
        "checksum": "@CHECKSUM",
        "checksumtype": "@CHECKSUMTYPE",
    },
    "mdRef": {
        "path": "@href",
        "pathprefix": "file:///",
        "checksum": "@CHECKSUM",
        "checksumtype": "@CHECKSUMTYPE",
    },
    "object": {
        "path": "storage/contentLocation/contentLocationValue",
        "pathprefix": "file:///",
        "checksum": "objectCharacteristics/fixity/messageDigest",
        "checksumtype": "objectCharacteristics/fixity/messageDigestAlgorithm",
        "format": "objectCharacteristics/format/formatDesignation/formatName",
    },
}

# Internationalization
# https://docs.djangoproject.com/en/1.9/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'Europe/Stockholm'

USE_I18N = True

USE_L10N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/1.9/howto/static-files/

STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'static_root')
STATICFILES_DIRS = (
    os.path.join(BASE_DIR, 'static'),
)

# Add etp vhost to rabbitmq:
# rabbitmqctl add_user guest guest
# rabbitmqctl add_vhost eta
# rabbitmqctl set_permissions -p eta guest ".*" ".*" ".*"

# Celery settings
BROKER_URL = 'amqp://guest:guest@localhost:5672/eta'
CELERY_IMPORTS = ("preingest.tasks", "ESSArch_Core.WorkflowEngine.tests.tasks")
CELERY_RESULT_BACKEND = 'amqp://'

# Rest auth settings
OLD_PASSWORD_FIELD_ENABLED = True

try:
    from local_eta_settings import *
except ImportError, exp:
    pass
