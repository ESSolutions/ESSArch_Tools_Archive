/*
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
*/

angular
  .module('essarch.services')
  .factory('listViewService', function(
    IP,
    SA,
    Profile,
    Workarea,
    WorkareaFiles,
    IPReception,
    Event,
    Step,
    EventType,
    $q,
    $http,
    appConfig,
    $rootScope,
    $filter,
    linkHeaderParser
  ) {
    /**
     * Map given table type with an url
     * @param {String} table - Type of table, example: "ip", "events", "workspace"
     * @param {string} [id] - Optional id for url
     */
    function tableMap(table, id) {
      var map = {
        ip: 'information-packages/',
        events: 'information-packages/' + id + '/events/',
        reception: 'ip-reception/',
        workspace: 'workareas/',
      };
      return map[table];
    }

    /**
     * Check number of items and how many pages a table has.
     * Used to update tables correctly when amount of pages is reduced.
     * @param {String} table - Type of table, example: "ip", "events", "workspace"
     * @param {Integer} pageSize - Page size
     * @param {Object} filters - All filters and relevant sort string etc
     * @param {String} [id] - ID used in table url, for example IP ID
     */
    function checkPages(table, pageSize, filters, id) {
      var data = angular.extend(
        {
          page: 1,
          page_size: pageSize,
        },
        filters
      );
      var url;
      if (id) {
        url = tableMap(table, id);
      } else {
        url = tableMap(table);
      }
      return $http.head(appConfig.djangoUrl + url, {params: data}).then(function(response) {
        count = response.headers('Count');
        if (count == null) {
          count = response.length;
        }
        if (count == 0) {
          count = 1;
        }
        return {
          count: count,
          numberOfPages: Math.ceil(count / pageSize),
        };
      });
    }
    //Gets data for list view i.e information packages
    function getListViewData(pageNumber, pageSize, sortString, searchString, state, columnFilters, workarea) {
      var data = angular.extend(
        {
          page: pageNumber,
          page_size: pageSize,
          ordering: sortString,
          search: searchString,
          state: state,
        },
        columnFilters
      );

      if (workarea) {
        data = angular.extend(data, {workarea: workarea});
      }

      return IP.query(data).$promise.then(function(resource) {
        count = resource.$httpHeaders('Count');
        if (count == null) {
          count = resource.length;
        }
        return {
          count: count,
          data: resource,
        };
      });
    }

    function getReceptionIps(pageNumber, pageSize, sortString) {
      return IPReception.query({
        page: pageNumber,
        page_size: pageSize,
        ordering: sortString,
      }).$promise.then(function(resource) {
        count = resource.$httpHeaders('Count');
        if (count == null) {
          count = resource.length;
        }
        return {
          count: count,
          data: resource,
        };
      });
    }

    //Add a new event
    function addEvent(ip, eventType, eventDetail, outcome) {
      return Event.save({
        eventType: eventType.eventType,
        eventOutcomeDetailNote: eventDetail,
        eventOutcome: outcome.value,
        information_package: ip.id,
      }).$promise.then(function(resource) {
        return resource;
      });
    }
    //Returns all events for one ip
    function getEvents(ip, pageNumber, pageSize, sortString, columnFilters, searchString) {
      return IP.events(
        angular.extend(
          {
            id: ip.id,
            page: pageNumber,
            page_size: pageSize,
            search: searchString,
            ordering: sortString,
          },
          columnFilters
        )
      ).$promise.then(function(resource) {
        count = resource.$httpHeaders('Count');
        if (count == null) {
          count = resource.length;
        }
        return {
          count: count,
          data: resource,
        };
      });
    }
    //Gets event type for dropdown selection
    function getEventlogData() {
      return EventType.query().$promise.then(function(resource) {
        return resource;
      });
    }

    //Returns IP
    function getIp(id) {
      return IP.get({
        id: id,
      }).then(function(data) {
        return data;
      });
    }

    //Get list of files in Ip
    function getFileList(ip) {
      var array = [];
      var tempElement = {
        filename: ip.object_path,
        created: ip.create_date,
        size: ip.object_size,
      };
      array.push(tempElement);
      return array;
    }

    function getDir(ip, pathStr, pageNumber, pageSize) {
      var id = ip.state == 'Prepared' ? ip.object_identifier_value : ip.id;
      if (pathStr == '') {
        sendData = {
          id: id,
          page: pageNumber,
          page_size: pageSize,
        };
      } else {
        sendData = {
          id: id,
          page: pageNumber,
          page_size: pageSize,
          path: pathStr,
        };
      }
      if (ip.state == 'At reception' || ip.state == 'Prepared') {
        return IPReception.files(sendData)
          .$promise.then(function(data) {
            var count = data.$httpHeaders('Count');
            if (count == null) {
              count = data.length;
            }
            return {
              numberOfPages: Math.ceil(count / pageSize),
              data: data,
            };
          })
          .catch(function(response) {
            return response;
          });
      } else {
        return IP.files(sendData)
          .$promise.then(function(data) {
            var count = data.$httpHeaders('Count');
            if (count == null) {
              count = data.length;
            }
            return {
              numberOfPages: Math.ceil(count / pageSize),
              data: data,
            };
          })
          .catch(function(response) {
            return response;
          });
      }
    }

    function getFile(ip, path, file) {
      return IP.files({
        id: ip.id,
        path: path + file.name,
      }).$promise.then(function(response) {
        return response;
      });
    }

    //Fetches IP's for given workarea (ingest or access)
    function getWorkareaData(workarea, pageNumber, pageSize, sortString, searchString, columnFilters) {
      return Workarea.query(
        angular.extend(
          {
            type: workarea,
            page: pageNumber,
            page_size: pageSize,
            ordering: sortString,
            search: searchString,
            tag: $rootScope.selectedTag != null ? $rootScope.selectedTag.id : null,
          },
          columnFilters
        )
      ).$promise.then(function(resource) {
        count = resource.$httpHeaders('Count');
        if (count == null) {
          count = resource.length;
        }
        return {
          count: count,
          data: resource,
        };
      });
    }

    function getWorkareaDir(workareaType, pathStr, pageNumber, pageSize) {
      var sendData;
      if (pathStr == '') {
        sendData = {
          page: pageNumber,
          page_size: pageSize,
          type: workareaType,
        };
      } else {
        sendData = {
          page: pageNumber,
          page_size: pageSize,
          path: pathStr,
          type: workareaType,
        };
      }

      return $http.get(appConfig.djangoUrl + 'workarea-files/', {params: sendData}).then(function(response) {
        var count = response.headers('Count');
        if (count == null) {
          count = response.data.length;
        }
        if (response.headers()['content-disposition']) {
          return $q.reject(response);
        } else {
          return {
            numberOfPages: Math.ceil(count / pageSize),
            data: response.data,
          };
        }
      });
    }
    function addNewWorkareaFolder(workareaType, path, file) {
      return WorkareaFiles.addDirectory({
        type: workareaType,
        path: path + file.name,
      }).$promise.then(function(response) {
        return response;
      });
    }

    //returns all SA-profiles and current as an object
    function getSaProfiles(ip) {
      var sas = [];
      var saProfile = {
        entity: 'PROFILE_SUBMISSION_AGREEMENT',
        profile: null,
        profiles: [],
      };
      return SA.query({
        pager: 'none',
      }).$promise.then(function(resource) {
        sas = resource;
        saProfile.profiles = [];
        var promises = [];
        sas.forEach(function(sa) {
          saProfile.profiles.push(sa);
          if (
            ip.submission_agreement == sa.url ||
            (ip.altrecordids && ip.altrecordids['SUBMISSIONAGREEMENT'] == sa.id)
          ) {
            saProfile.profile = sa;
            saProfile.locked = ip.submission_agreement_locked;
            if (saProfile.profile.profile_aip) {
              promises.push(
                Profile.get({id: saProfile.profile.profile_aip}).$promise.then(function(resource) {
                  saProfile.profile.profile_aip = resource;
                })
              );
            }
            if (saProfile.profile.profile_dip) {
              promises.push(
                Profile.get({id: saProfile.profile.profile_dip}).$promise.then(function(resource) {
                  saProfile.profile.profile_dip = resource;
                })
              );
            }
          }
        });
        return $q.all(promises).then(function() {
          return saProfile;
        });
      });
    }

    return {
      getListViewData: getListViewData,
      addEvent: addEvent,
      getEvents: getEvents,
      getEventlogData: getEventlogData,
      getIp: getIp,
      getDir: getDir,
      getFileList: getFileList,
      getReceptionIps: getReceptionIps,
      getFile: getFile,
      getWorkareaData: getWorkareaData,
      getWorkareaDir: getWorkareaDir,
      addNewWorkareaFolder: addNewWorkareaFolder,
      checkPages: checkPages,
      getSaProfiles: getSaProfiles,
    };
  });
