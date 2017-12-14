angular.module('myApp').controller('TransformationCtrl', function($scope, $controller, Resource, listViewService, TopAlert, $http, $sce, $rootScope, $cookies, $timeout, appConfig, $uibModal, $window, Profile, $q) {
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
            if(row.profile_validation) {
                Profile.get({id: row.profile_validation.profile}).$promise.then(function(resource) {
                    vm.buildValidatorTable(resource.specification, row);
                    var validationComplete = true;
                    angular.forEach(resource.specification, function(value, key, object) {
                        if (key.startsWith('_')) return;
                        if (row.workarea.successfully_validated[key] == false || row.workarea.successfully_validated[key] == null || angular.isUndefined(row.workarea.successfully_validated[key])) {
                            validationComplete = false;
                        }
                    });
                    if(validationComplete) {
                        vm.validation_complete = true;
                    } else {
                        vm.validation_complete = false;
                    }
                });
            }
            if(!row.profile_transformation) {
                TopAlert.add("IP "+row.label+" has no transformation profile!", "info");
            }
            $scope.select = true;
        }
        $scope.eventShow = false;
        $scope.statusShow = false;
    };

    vm.buildValidatorTable = function(specification, row) {
        var promises = [];
        angular.forEach(specification, function (value, key, object) {
            if (key.startsWith('_')) return;
            var val = {
                name: key,
                passed: true
            }
            if(object._required && object._required.includes(key)) {
                val.required = true;
            }
            promises.push($http.head(appConfig.djangoUrl + "information-packages/" + row.id + "/validations/",
                {
                    params: {
                        validator: key,
                    }
                }).then(function (response) {
                    val.failed_count = response.headers('Count');
                    return val;
                }));
        })
        $q.all(promises).then(function (validators) {
            vm.validators = validators;
        });
    }

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
