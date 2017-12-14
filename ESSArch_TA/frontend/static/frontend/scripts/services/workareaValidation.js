angular.module('myApp').factory('WorkareaValidation', function ($rootScope, $q, appConfig, $http, $sce, $filter, myService) {
    var service = {};

    function formatXml(validation) {
        var pretty = $filter("prettyXml")(validation.message);
        pretty = myService.replaceAll(pretty, "<", "&lt;"); //Replace open tags with "<" character
        pretty = myService.replaceAll(pretty, ">", "&gt;"); //Replace end tags with ">" character
        // Mediaconch validation message highlighing
        if(validation.validator == "MediaconchValidator") {
            pretty = myService.replaceAll(pretty, 'outcome="fail"', '<span style="background-color: red; color: white; font-weight: bold;">outcome="fail"</span>')
            pretty = myService.replaceAll(pretty, 'outcome="pass"', '<span style="background-color: green; color: white; font-weight: bold;">outcome="pass"</span>')
        }
        // VeraPDF validation message highlighting
        if(validation.validator == "VeraPDFValidator") {
            pretty = myService.replaceAll(pretty, 'isCompliant="false"', '<span style="background-color: red; color: white; font-weight: bold;">isCompliant="false"</span>')
            pretty = myService.replaceAll(pretty, 'isCompliant="true"', '<span style="background-color: green; color: white; font-weight: bold;">isCompliant="true"</span>')
            pretty = pretty.replace(/passedChecks="([\d]+)" failedChecks="([^0])"/g, '<span style="background-color: red; color: white;">passedChecks="$1" failedChecks="$2"</span>')
            pretty = pretty.replace(/passedChecks="([\d]+)" failedChecks="0"/g, '<span style="background-color: green; color: white;">passedChecks="$1" failedChecks="0"</span>')
            pretty = pretty.replace(/&lt;exceptionMessage&gt;([\s\S]*?)&lt;\/exceptionMessage\&gt;/g, '<span style="background-color: red; color: white;">&lt;exceptionMessage&gt;$1&lt;/exceptionMessage&gt;</span>')
        }
        return pretty;
    }

    service.getValidationsForIp = function (ip, pageNumber, pageSize, filters) {
        return $http({
            method: 'GET',
            url: appConfig.djangoUrl + "information-packages/" + ip.id + "/validation-files/",
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
                    if(child.validator == "MediaconchValidator" || child.validator == "VeraPDFValidator") {
                        child.prettyMessage = $sce.trustAsHtml(formatXml(child));
                    }
                })
                return response.data;
            }).catch(function(response) {
                return response;
            });
    }
    return service;
});
