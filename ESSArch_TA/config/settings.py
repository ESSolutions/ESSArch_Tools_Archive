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
from datetime import timedelta

import dj_database_url

"""
Django settings for ETA project.

Generated by 'django-admin startproject' using Django 1.9.7.

For more information on this file, see
https://docs.djangoproject.com/en/1.9/topics/settings/

For the full list of settings and their values, see
https://docs.djangoproject.com/en/1.9/ref/settings/
"""

# Build paths inside the project like this: os.path.join(BASE_DIR, ...)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PROJECT_SHORTNAME = 'ETA'
PROJECT_NAME = 'ESSArch Tools Archive'

# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/1.9/howto/deployment/checklist/

ESSARCH_WORKFLOW_POLLERS = {
    'dir': {
        'class': 'workflow.polling.backends.directory.DirectoryWorkflowPoller',
        'path': '/ESSArch/data/eta/reception/eft',
    }
}

try:
    from local_eta_settings import REDIS_URL
except ImportError:
    REDIS_URL = os.environ.get('REDIS_URL_ETA', 'redis://localhost/2')

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = '#-f#k7@7eyaez26p-)5$7#+58m79t)yz1@d-s8wn2_downta8*'
SESSION_COOKIE_NAME = 'eta'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = ['*']

REST_FRAMEWORK = {
    'DEFAULT_METADATA_CLASS': 'ESSArch_Core.metadata.CustomMetadata',
    'DEFAULT_PAGINATION_CLASS': 'proxy_pagination.ProxyPagination',
    'PAGE_SIZE': 10,
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'ESSArch_Core.auth.SessionAuthentication',
        'rest_framework.authentication.BasicAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'TEST_REQUEST_DEFAULT_FORMAT': 'json',
}

CELERY_BEAT_SCHEDULE = {
    'RunWorkflowProfiles-every-10-seconds': {
        'task': 'ESSArch_Core.tasks.RunWorkflowProfiles',
        'schedule': timedelta(seconds=10),
    },
}

PROXY_PAGINATION_PARAM = 'pager'
PROXY_PAGINATION_DEFAULT = 'ESSArch_Core.pagination.LinkHeaderPagination'
PROXY_PAGINATION_MAPPING = {'none': 'ESSArch_Core.pagination.NoPagination'}


# Application definition

INSTALLED_APPS = [
    'allauth',
    'allauth.account',
    'channels',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.admin',
    'django.contrib.sites',
    'django_filters',
    'groups_manager',
    'nested_inline',
    'rest_auth',
    'rest_auth.registration',
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'mptt',
    'frontend',
    'ESSArch_Core.admin',
    'ESSArch_Core.auth',
    'ESSArch_Core.docs',
    'ESSArch_Core.configuration',
    'ESSArch_Core.frontend',
    'ESSArch_Core.ip',
    'ESSArch_Core.profiles',
    'ESSArch_Core.essxml.Generator',
    'ESSArch_Core.essxml.ProfileMaker',
    'ESSArch_Core.fixity',
    'ESSArch_Core.storage',
    'ESSArch_Core.tags',
    'ESSArch_Core.WorkflowEngine',
    'guardian',
]

AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',
    'ESSArch_Core.auth.backends.GroupRoleBackend',
    'guardian.backends.ObjectPermissionBackend',
]

GROUPS_MANAGER = {
    'AUTH_MODELS_SYNC': True,
    'PERMISSIONS': {
        'owner': [],
        'group': [],
        'groups_upstream': [],
        'groups_downstream': [],
        'groups_siblings': [],
    },
    'GROUP_NAME_PREFIX': '',
    'GROUP_NAME_SUFFIX': '',
    'USER_USERNAME_PREFIX': '',
    'USER_USERNAME_SUFFIX': '',
}

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [REDIS_URL],
        },
    },
}
ASGI_APPLICATION = 'ESSArch_Core.routing.application'

SITE_ID = 1

MIDDLEWARE_CLASSES = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.locale.LocaleMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
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
try:
    from local_eta_settings import DATABASE_URL
except ImportError:
    DATABASE_URL = os.environ.get('DATABASE_URL_ETA', 'sqlite:///db.sqlite')
DATABASES = {'default': dj_database_url.parse(url=DATABASE_URL)}

# Cache
CACHES = {
    'default': {
        'TIMEOUT': None,
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': REDIS_URL,
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        }
    }
}

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '%(asctime)s %(levelname)s %(message)s'
        },
    },
    'handlers': {
        'core': {
            'level': 'DEBUG',
            'class': 'ESSArch_Core.log.dbhandler.DBHandler',
            'application': 'ESSArch Tools for Archive',
            'agent_role': 'Archivist',
        },
        'file_eta': {
            'level': 'DEBUG',
            'formatter': 'verbose',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': '/ESSArch/log/eta.log',
            'maxBytes': 1024 * 1024 * 100,  # 100MB
            'backupCount': 5,
        },
        'log_file_auth': {
            'level': 'DEBUG',
            'class': 'logging.handlers.RotatingFileHandler',
            'formatter': 'verbose',
            'filename': '/ESSArch/log/auth_eta.log',
            'maxBytes': 1024 * 1024 * 100,  # 100MB
            'backupCount': 5,
        },
    },
    'loggers': {
        'essarch': {
            'handlers': ['core', 'file_eta'],
            'level': 'DEBUG',
        },
        'essarch.auth': {
            'level': 'DEBUG',
            'handlers': ['log_file_auth'],
            'propagate': False,
        },
    },
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
    'USER_DETAILS_SERIALIZER': 'ESSArch_Core.auth.serializers.UserLoggedInSerializer'
}

LOGIN_REDIRECT_URL = '/'
LOGOUT_REDIRECT_URL = '/?ref=logout'

# Internationalization
# https://docs.djangoproject.com/en/1.9/topics/i18n/

LANGUAGE_COOKIE_NAME = 'essarch_language'
LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'Europe/Stockholm'

USE_I18N = True

USE_L10N = True

USE_TZ = True

LOCALE_PATHS = [
    'ip/locale',
]

# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/1.9/howto/static-files/

STATIC_URL = '/static/'
STATIC_ROOT = os.environ.get('STATIC_ROOT_ETA', os.path.join(BASE_DIR, 'static_root'))
STATICFILES_DIRS = (
    os.path.join(BASE_DIR, 'static'),
)

DJANGO_GULP_REV_PATH = os.path.join(BASE_DIR, 'frontend/static/frontend/build/rev-manifest.json')

# Documentation
DOCS_ROOT = os.path.join(BASE_DIR, 'docs/_build/{lang}/html')

# Add etp vhost to rabbitmq:
# rabbitmqctl add_user guest guest
# rabbitmqctl add_vhost eta
# rabbitmqctl set_permissions -p eta guest ".*" ".*" ".*"

# Celery settings
try:
    from local_eta_settings import RABBITMQ_URL
except ImportError:
    RABBITMQ_URL = os.environ.get('RABBITMQ_URL_ETA', 'amqp://guest:guest@localhost:5672/eta')
CELERY_BROKER_URL = RABBITMQ_URL
CELERY_IMPORTS = ("ESSArch_Core.ip.tasks", "preingest.tasks", "ESSArch_Core.WorkflowEngine.tests.tasks")
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_TASK_EAGER_PROPAGATES = True

# Rest auth settings
OLD_PASSWORD_FIELD_ENABLED = True

try:
    from local_eta_settings import *  # noqa
except ImportError:
    pass
