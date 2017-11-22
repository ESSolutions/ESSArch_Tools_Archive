angular.module('myApp').factory('WorkareaValidation', function ($rootScope, $q, appConfig, $http) {
    var service = {};
    service.getValidationsForIp = function (ip, pageNumber, pageSize, filters) {
        return $http({
            method: 'GET',
            url: appConfig.djangoUrl + "information-packages/" + ip.id + "/validations/",
            params: angular.extend(
                {
                    page: pageNumber,
                    page_size: pageSize
                }, filters)
        }).then(function (response) {
            var count = response.headers('Count');
            if (count == null) {
                count = response.data.length;
            }
            return {
                data: response.data,
                numberOfPages: Math.ceil(count / pageSize),
                count: count
            }
        }).catch(function (response) {
            return response;
        })
    }
    return service;
});
