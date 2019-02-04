angular
  .module('essarch.services')
  .factory('WorkareaValidation', function($rootScope, $q, appConfig, $http, $sce, $filter, myService) {
    var service = {};

    /**
     * Format and highligt XML string from validation message
     * @param {Object} validation
     */
    function formatXml(validation) {
      // General formatting of XML string
      var pretty = $filter('prettyXml')(validation.message);
      pretty = myService.replaceAll(pretty, '<', '&lt;'); //Replace open tags with "<" character
      pretty = myService.replaceAll(pretty, '>', '&gt;'); //Replace end tags with ">" character
      if (validation.validator == 'MediaconchValidator') {
        pretty = mediaconchValidator(pretty);
      }
      if (validation.validator == 'VeraPDFValidator') {
        pretty = veraPDFValidator(pretty);
      }
      return pretty;
    }

    /**
     * Highlight mediaconch result
     * @param {String} pretty
     */
    function mediaconchValidator(pretty) {
      pretty = myService.replaceAll(
        pretty,
        'outcome="fail"',
        '<span style="background-color: red; color: white; font-weight: bold;">outcome="fail"</span>'
      );
      pretty = myService.replaceAll(
        pretty,
        'outcome="pass"',
        '<span style="background-color: green; color: white; font-weight: bold;">outcome="pass"</span>'
      );
      return pretty;
    }

    /**
     * Highlight VeraPDF result
     * @param {String} pretty
     */
    function veraPDFValidator(pretty) {
      // Mark isCompliant true/false
      pretty = myService.replaceAll(
        pretty,
        'isCompliant="false"',
        '<span style="background-color: red; color: white; font-weight: bold;">isCompliant="false"</span>'
      );
      pretty = myService.replaceAll(
        pretty,
        'isCompliant="true"',
        '<span style="background-color: green; color: white; font-weight: bold;">isCompliant="true"</span>'
      );

      // Mark passedChecks and failedChecks
      pretty = pretty.replace(
        /passedChecks="([\d]+)" failedChecks="([^0])"/g,
        '<span style="background-color: red; color: white;">passedChecks="$1" failedChecks="$2"</span>'
      );
      pretty = pretty.replace(
        /passedChecks="([\d]+)" failedChecks="0"/g,
        '<span style="background-color: green; color: white;">passedChecks="$1" failedChecks="0"</span>'
      );

      // Mark exceptionMessage element if there is one
      pretty = pretty.replace(
        /&lt;exceptionMessage&gt;([\s\S]*?)&lt;\/exceptionMessage\&gt;/g,
        '<span style="background-color: red; color: white;">&lt;exceptionMessage&gt;$1&lt;/exceptionMessage&gt;</span>'
      );

      // Mark validationReports element
      function validationReports(pretty) {
        var regex = /&lt;validationReports compliant="([\d])" nonCompliant="([\d])" failedJobs="([\d])"&gt;([\s\S]*?)&lt;\/validationReports&gt;/g;
        var match = regex.exec(pretty);
        if (match && (match[2] != '0' || match[3] != '0')) {
          var replace =
            '<span style="background-color: red; color: white;">&lt;validationReports compliant="$1" nonCompliant="$2" failedJobs="$3"&gt;$4&lt;/validationReports&gt;</span>';
          pretty = pretty.replace(regex, replace);
        } else {
          var replace =
            '<span style="background-color: green; color: white;">&lt;validationReports compliant="$1" nonCompliant="$2" failedJobs="$3"&gt;$4&lt;/validationReports&gt;</span>';
          pretty = pretty.replace(regex, replace);
        }
        return pretty;
      }
      pretty = validationReports(pretty);

      // Mark featureReports element
      pretty = pretty.replace(
        /&lt;featureReports failedJobs="([1-9][0-9]*)"&gt;([\s\S]*)&lt;\/featureReports&gt;/g,
        '<span style="background-color: red; color: white;">&lt;featureReports failedJobs="$1"&gt;$2&lt;/featureReports&gt;</span>'
      );
      pretty = pretty.replace(
        /&lt;featureReports failedJobs="0"&gt;([\s\S]*)&lt;\/featureReports&gt;/g,
        '<span style="background-color: green; color: white;">&lt;featureReports failedJobs="0"&gt;$1&lt;/featureReports&gt;</span>'
      );

      // Mark repairReports element
      pretty = pretty.replace(
        /&lt;repairReports failedJobs="([1-9][0-9]*)"&gt;([\s\S]*)&lt;\/repairReports&gt;/g,
        '<span style="background-color: red; color: white;">&lt;repairReports failedJobs="$1"&gt;$2&lt;/repairReports&gt;</span>'
      );
      pretty = pretty.replace(
        /&lt;repairReports failedJobs="0"&gt;([\s\S]*)&lt;\/repairReports&gt;/g,
        '<span style="background-color: green; color: white;">&lt;repairReports failedJobs="0"&gt;$1&lt;/repairReports&gt;</span>'
      );

      // Mark taskResult element
      pretty = pretty.replace(
        /&lt;taskResult ([\s\S]*) isSuccess="false"&gt;/g,
        '<span style="background-color: red; color: white;">&lt;taskResult $1 isSuccess="false"&gt;</span>'
      );
      pretty = pretty.replace(
        /&lt;taskResult ([\s\S]*) isSuccess="true"&gt;/g,
        '<span style="background-color: green; color: white;">&lt;taskResult $1 isSuccess="true"&gt;</span>'
      );

      return pretty;
    }

    service.getValidationsForIp = function(ip, pageNumber, pageSize, filters) {
      return $http({
        method: 'GET',
        url: appConfig.djangoUrl + 'information-packages/' + ip.id + '/validation-files/',
        params: angular.extend(
          {
            page: pageNumber,
            page_size: pageSize,
          },
          filters
        ),
      })
        .then(function(response) {
          var count = response.headers('Count');
          if (count == null) {
            count = response.data.length;
          }
          return {
            data: response.data,
            numberOfPages: Math.ceil(count / pageSize),
            count: count,
          };
        })
        .catch(function(response) {
          return response;
        });
    };

    service.getChildren = function(validation, ip) {
      return $http
        .get(appConfig.djangoUrl + 'validations/', {
          params: {
            information_package: ip.id,
            filename: validation.filename,
            pager: 'none',
          },
        })
        .then(function(response) {
          response.data.forEach(function(child) {
            child.duration = moment(child.time_done).diff(moment(child.time_started));
            if (child.validator == 'MediaconchValidator' || child.validator == 'VeraPDFValidator') {
              child.prettyMessage = $sce.trustAsHtml(formatXml(child));
            }
          });
          return response.data;
        })
        .catch(function(response) {
          return response;
        });
    };
    return service;
  });
