angular.module('myApp').controller('UtilCtrl', function($scope, $state, $location, $window, $http, appConfig) {
    $scope.reloadPage = function (){
        $state.reload();
    }
    $scope.redirectAdmin = function () {
        $window.location.href="/admin/";
    }
    $scope.getVersionInfo = function() {
        $http({
            method: 'GET',
            url: appConfig.djangoUrl+"sysinfo/"
        }).then(function(response){
            $scope.sysInfo = response.data;
        }, function() {
            console.log('error');
        })
    }
    $scope.getVersionInfo();
});
