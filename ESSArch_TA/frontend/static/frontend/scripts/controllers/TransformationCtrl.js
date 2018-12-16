angular.module('essarch.controllers').controller('TransformationCtrl', function($scope, $controller, Resource, listViewService, Notifications, $http, $sce, $rootScope, $cookies, $timeout, appConfig, $uibModal, $window, Profile, $q, IP, $interval) {
    var vm = this;
    var ipSortString = [];
    $controller('WorkareaCtrl', { $scope: $scope, vm: vm, ipSortString: ipSortString });
    var watchers=[];
    $scope.error = null;
    $scope.$on('$stateChangeStart', function () {
        $interval.cancel(validatorInterval);
        watchers.forEach(function(watcher) {
            watcher();
        });
    });

    $scope.$on('REFRESH_LIST_VIEW', function (event, data) {
        if($scope.ip != null && $scope.select) {
            vm.validatorListPipe(vm.validatorTableState);
        }
    });

    vm.selectSingleRow = function(row) {
        $scope.ips = [];
        if($scope.ip !== null && $scope.ip.id== row.id){
            $scope.select = false;
            $scope.ip = null;
            $rootScope.ip = null;
            $scope.filebrowser = false;
            $scope.error = null;
        } else {
            $scope.ip = row;
            $rootScope.ip = row;
            vm.validatorListPipe(vm.validatorTableState);
            $scope.select = true;
            vm.getTransformers();
        }
        $scope.eventShow = false;
        $scope.statusShow = false;
    };

    var validatorInterval = $interval(function() {
        if($scope.ip && $scope.select) {
            vm.validatorListPipe(vm.validatorTableState);
        }
    }, appConfig.ipInterval);

    vm.getTransformers = function () {
        $http({'method': 'OPTIONS', 'url': appConfig.djangoUrl + "workarea-entries/" + $scope.ip.workarea.id+"/transform/"}).then(function(response) {
            $scope.transformers = response.data.transformers;
            vm.transformer = $scope.transformers[0];
        }).catch(function(response) {
            Notifications.add(response, "error");
        })
    };

    vm.validatorListPipe = function (tableState) {
        vm.validatorTableState = tableState;
        $scope.validatorsLoading = true;
        IP.get({ id: $scope.ip.id }).$promise.then(function (resource) {
            $scope.ip = resource;
            $rootScope.ip = resource;
            if ($scope.ip.profile_validation) {
                Profile.get({ id: $scope.ip.profile_validation.profile }).$promise.then(function (resource) {
                    vm.buildValidatorTable(resource.specification, $scope.ip);
                    var validationComplete = true;
                    for (var validator in $scope.ip.workarea.successfully_validated) {
                        if ($scope.ip.workarea.successfully_validated[validator] == false) {
                            validationComplete = false;
                            break;
                        }
                    }
                    $scope.validatorsLoading = false;
                    vm.validation_complete = validationComplete;
                });
            } else {
                vm.validators = [];
                $scope.validatorsLoading = false;
            }
        });
    }

    vm.buildValidatorTable = function(specification, row) {
        var promises = [];
        angular.forEach(specification, function (value, key, object) {
            if (key.startsWith('_')) return;
            var val = {
                name: key,
                passed: true,
                required: false,
            };
            angular.forEach(value, function (sub_spec, idx, o) {
                if (!("required" in sub_spec) || sub_spec.required){
                    val.required = true;
                }
            });
            promises.push($http.head(appConfig.djangoUrl + "information-packages/" + row.id + "/validations/",
                {
                    params: {
                        validator: key,
                        passed: false,
                    }
                }).then(function (response) {
                    val.failed_count = response.headers('Count');
		    $http.head(appConfig.djangoUrl + "information-packages/" + row.id + "/validations/",
			{
			    params: {
				validator: key,
				passed: false,
				required: true,
			    }
			}).then(function (response) {
			    val.failed_required_count = response.headers('Count');
			});
                    return val;
                }));
        })
        $q.all(promises).then(function (validators) {
            vm.validators = validators;
        });
    }

    vm.transform = function(ip, transformer) {
        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title',
            ariaDescribedBy: 'modal-body',
            templateUrl: 'static/frontend/views/transform_modal.html',
            controller: 'DataModalInstanceCtrl',
            controllerAs: '$ctrl',
            resolve: {
                data: {
                    ip: ip,
                    transformer: transformer
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
