angular.module('myApp').factory('myService', function($location, PermPermissionStore, $anchorScroll, $http, appConfig) {
    function changePath(state) {
        $state.go(state);
    };
    function getPermissions(permissions){
        PermPermissionStore.defineManyPermissions(permissions, /*@ngInject*/ function (permissionName) {
            return permissions.includes(permissionName);
        });
        return permissions;
    }
    function getVersionInfo() {
        return $http({
            method: 'GET',
            url: appConfig.djangoUrl+"sysinfo/"
        }).then(function(response){
            return response.data;
        }, function() {
            console.log('error');
        })
    }
    return {
        changePath: changePath,
        getPermissions: getPermissions,
        getVersionInfo: getVersionInfo
    }
});
