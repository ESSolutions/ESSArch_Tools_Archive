angular.module('myApp').factory('WorkareaValidation', function ($rootScope, $q, appConfig, $http, $sce, $filter, myService) {
    var service = {};

    function formatXml(message) {
        var pretty = $filter("prettyXml")(message);
        pretty = myService.replaceAll(pretty, "<", "&lt;")
        pretty = myService.replaceAll(pretty, ">", "&gt;")
        pretty = myService.replaceAll(pretty, 'outcome="fail"', 'outcome="<span style="background-color: red; color: white; font-weight: bold;">fail</span>"')
        pretty = myService.replaceAll(pretty, 'outcome="pass"', 'outcome="<span style="background-color: green; color: white; font-weight: bold;">pass</span>"')
        return pretty;
    }

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

    service.getChildren = function(validation, ip) {
        return $http.get(
            appConfig.djangoUrl + "validations/",
            {
                params: {
                    information_package: ip.id,
                    filename: validation.filename,
                    pager: "none"
                }
            }).then(function(response) {
                response.data.forEach(function(child) {
                    child.duration = moment(child.time_done).diff(moment(child.time_started));
                    child.prettyMessage = $sce.trustAsHtml(formatXml(child.message));
                })
                return response.data;
            }).catch(function(response) {
                return response;
            });
    }
    return service;
});
