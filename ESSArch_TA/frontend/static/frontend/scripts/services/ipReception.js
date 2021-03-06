angular.module('essarch.services').factory('IPReception', function($resource, appConfig) {
  return $resource(
    appConfig.djangoUrl + 'ip-reception/:id/:action/',
    {},
    {
      query: {
        method: 'GET',
        isArray: true,
        interceptor: {
          response: function(response) {
            response.resource.$httpHeaders = response.headers;
            return response.resource;
          },
        },
      },
      receive: {
        method: 'POST',
        params: {action: 'receive', id: '@id'},
      },
      changeSa: {
        method: 'PATCH',
        params: {id: '@id'},
      },
      identify: {
        method: 'POST',
        params: {action: 'identify-ip'},
      },
      files: {
        method: 'GET',
        params: {action: 'files', id: '@id'},
        isArray: true,
        interceptor: {
          response: function(response) {
            response.resource.$httpHeaders = response.headers;
            return response.resource;
          },
        },
      },
      submit: {
        method: 'POST',
        params: {action: 'submit', id: '@id'},
      },
      prepare: {
        method: 'POST',
        params: {action: 'prepare', id: '@id'},
      },
    }
  );
});
