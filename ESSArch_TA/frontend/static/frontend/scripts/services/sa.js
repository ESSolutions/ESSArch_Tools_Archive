angular
  .module('essarch.services')
  .factory('SA', function($resource, appConfig) {
    return $resource(
      appConfig.djangoUrl + 'submission-agreements/:id/:action/',
      {},
      {
        get: {
          method: 'GET',
          params: {id: '@id'},
        },
        includeType: {
          method: 'POST',
          params: {action: 'include-type', id: '@id'},
        },
        excludeType: {
          method: 'POST',
          params: {action: 'exclude-type', id: '@id'},
        },
        save: {
          method: 'POST',
          params: {action: 'save', id: '@id'},
        },
        update: {
          method: 'PUT',
          params: {id: '@id'},
        },
        new: {
          method: 'POST',
        },
        lock: {
          method: 'POST',
          params: {action: 'lock', id: '@id'},
        },
      }
    );
  })
  .factory('ProfileIp', function($resource, appConfig) {
    return $resource(
      appConfig.djangoUrl + 'profile-ip/:id/',
      {},
      {
        query: {
          method: 'GET',
          isArray: true,
        },
        get: {
          method: 'GET',
        },
        post: {
          method: 'POST',
        },
        patch: {
          method: 'PATCH',
          params: {id: '@id'},
        },
      }
    );
  })
  .factory('ProfileIpData', function($resource, appConfig) {
    return $resource(
      appConfig.djangoUrl + 'profile-ip-data/:id/:action/',
      {},
      {
        get: {
          method: 'GET',
          params: {id: '@id'},
        },
        post: {
          method: 'POST',
        },
      }
    );
  });
