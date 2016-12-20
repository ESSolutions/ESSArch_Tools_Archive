angular.module('myApp').factory('myService', function($location, PermPermissionStore, $anchorScroll) {
    function changePath(state) {
        $state.go(state);
    };
    function getPermissions(permissions){
        PermPermissionStore.defineManyPermissions(permissions, /*@ngInject*/ function (permissionName) {
            return permissions.includes(permissionName);
        });
        return permissions;
    }
    return {
        changePath: changePath,
        getPermissions: getPermissions
    }
});
