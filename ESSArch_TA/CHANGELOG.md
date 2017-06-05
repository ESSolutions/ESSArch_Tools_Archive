# [1.1.0](https://github.com/ESSolutions/ESSArch_Tools_Archive/releases/tag/1.1.0)


## Features and improvements

#### Pages and layout

* The GUI has been slightly updated with fewer and smaller borders, and a more distinct header with buttons instead of
  tabs.
* Added descriptive popovers
* Added support page
* Added button for copying traceback of a failed task to task report
* Added duration to task report
* Milliseconds are now included in start and end time in task report
* Updates of the task tree for an IP is no longer rebuilt on each refresh

#### API

* Object identifier value is now included in the information package serialization
* Object identifier value is now used for file and directory names
* IPs can now also be searched for with object identifier value, first and last
  name of responsible, start date and end date
* The task serialization now includes `args` which is the list of positional arguments provided to the task
* `ObjectIdentifierValue` and `LABEL` are now optional variables when identifying IP
* File uploads are now expected to be done using Multipart-Encoded files
* Each chunk will be verified against it's `HTTP_CONTENT_RANGE` header and will
  return `400 Bad Request` if it doesn't match.
* When all chunks has been uploaded for a file, an additional request to
  `/api/information-packages/id/upload_complete` can be done to verify that the
  checksum is correct

#### Misc

* INNODB is now the default database storage engine
* Redis is now the default task result backend

## Bug Fixes

* (API) Providing the IP files route with a path outside of the IP returns `400 Bad Request`
* (API) Providing the IP files route with a path that does not exist returns `404 Not Found`
* (API) Viewing a task with params containing non-ascii characters no longer results in a `500 Internal Server Error`

## Requirement changes
### Updates
* Updated `django-filter` from `0.15.2` to `1.0.3`
* Updated `djangorestframework` from `3.4.6` to `3.6.3`

### Additions
* Added `drf-extensions 0.3.1`
* Added `mock 2.0.0`
* Added `mysqlclient 1.3.10`
* Added `natsort 5.0.2`

### Deletions
* Deleted `MySQL-python`
