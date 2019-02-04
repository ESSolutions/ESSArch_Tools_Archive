angular.module('essarch.services').factory('Profile', function($resource, appConfig) {
  return $resource(
    appConfig.djangoUrl + 'profiles/:id/:action/?pager=none',
    {},
    {
      get: {
        method: 'GET',
        params: {id: '@id'},
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
});
