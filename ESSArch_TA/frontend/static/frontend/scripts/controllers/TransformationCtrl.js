angular.module('myApp').controller('TransformationCtrl', function($scope, $controller, Resource, listViewService, TopAlert, $http, $sce, $rootScope, $cookies, $timeout, appConfig, $uibModal, $window) {
    var vm = this;
    var ipSortString ="";
    $controller('WorkareaCtrl', { $scope: $scope, vm: vm, ipSortString: ipSortString });
    var watchers=[];
    $scope.$on('$stateChangeStart', function () {
        watchers.forEach(function(watcher) {
            watcher();
        });
    });

    $scope.ipTableClick = function(row) {
        if($scope.select && $scope.ip.id== row.id){
            $scope.select = false;
            $scope.ip = null;
            $rootScope.ip = null;
            $scope.filebrowser = false;
        } else {
            $scope.ip = row;
            $rootScope.ip = row;
            $scope.select = true;
        }
        $scope.eventShow = false;
        $scope.statusShow = false;
    };

    vm.transform = function(ip) {
        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title',
            ariaDescribedBy: 'modal-body',
            templateUrl: 'static/frontend/views/transform_modal.html',
            controller: 'DataModalInstanceCtrl',
            controllerAs: '$ctrl',
            resolve: {
                data: {
                    ip: ip
                }
            }
        })
        modalInstance.result.then(function (data) {
            $scope.select = false;
            $scope.ip = null;
            $rootScope.ip = null;
            $scope.getListViewData();
        });
    }
});
