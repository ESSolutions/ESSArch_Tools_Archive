angular.module('myApp').controller("WorkareaValidationCtrl", function($scope, $controller, $interval, $http, appConfig, $rootScope, WorkareaValidation, $q, TopAlert, $uibModal, $window, $log) {
    var vm = this;
    var ipSortString ="";
    $controller('WorkareaCtrl', { $scope: $scope, vm: vm, ipSortString: ipSortString });

    var watchers=[];
    $scope.$on('$stateChangeStart', function () {
        $interval.cancel(validationInterval);
        watchers.forEach(function(watcher) {
            watcher();
        });
    });
    $scope.$on('REFRESH_LIST_VIEW', function (event, data) {
        if($scope.ip != null && $scope.select) {
            vm.validationPipe(vm.validationTableState);
        }
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
            vm.expandedRows = [];
            vm.validationPipe(vm.validationTableState);
            $scope.select = true;
        }
        $scope.eventShow = false;
        $scope.statusShow = false;
    };

    /*
     * Validation
     */

    vm.expandedRows = [];

    vm.collapseExpandRow = function(row) {
        if(row.collapsed) {
            vm.expandRow(row);
        } else {
            vm.collapseRow(row);
        }
    }
    vm.expandRow = function (row) {
        WorkareaValidation.getChildren(row, $scope.ip).then(function (children) {
            row.collapsed = false;
            row.children = children;
            vm.expandedRows.push({ filename: row.filename });
        })
    }

    vm.collapseRow = function(row) {
        row.collapsed = true;
        vm.expandedRows.forEach(function(x, idx, array) {
            if(x.id == row.id) {
                array.splice(idx, 1);
            }
        })
    }

    $scope.validationLoading = false;
    vm.validationsPerPage = 10;
    vm.validate = function(ip) {
        $http({
            method: "POST",
            url: appConfig.djangoUrl + "workarea-entries/" + ip.workarea.id + "/validate/",
            data: {
                validators: vm.validators()
            }
        }).then(function(response) {
            TopAlert.add(response.data, "success");
            vm.validationPipe(vm.validationTableState);
        }).catch(function(response) {
            TopAlert.add(response.data.detail, "error");
        })
    }

    var validationInterval = $interval(function() {
        if($scope.ip != null && $scope.select) {
            vm.validationPipe(vm.validationTableState);
        }
    }, appConfig.ipInterval);

    vm.validationFilters = {};

    vm.validations = [];

    vm.validationPipe = function (tableState) {
        if (tableState) {
            $scope.validationLoading = true;
            vm.validationTableState = tableState;
            var pagination = tableState.pagination;
            var start = pagination.start || 0;     // This is NOT the page number, but the index of item in the list that you want to use to display the table.
            var number = pagination.number;  // Number of entries showed per page.
            var pageNumber = start / number + 1;
            WorkareaValidation.getValidationsForIp($scope.ip, pageNumber, number, vm.validationFilters).then(function (response) {
                var promises = [];
                response.data.forEach(function (val) {
                    val.collapsed = true;
                    vm.expandedRows.forEach(function(x) {
                        if(x.filename == val.filename) {
                            val.collapsed = false;
                            promises.push(
                                WorkareaValidation.getChildren(val, $scope.ip).then(function (children) {
                                    val.children = children;
                                })
                            )
                        }
                    })
                });
                $q.all(promises).then(function() {
                    vm.validations = response.data;
                    vm.numberOfResults = response.count;
                    tableState.pagination.numberOfPages = response.numberOfPages;//set the number of pages so the pagination can update
                    $scope.validationLoading = false;
                })
            });
        }
    }
    vm.validationStatusMessage = function (row) {
        switch (row.passed) {
            case true:
                return "SUCCESS";
            case false:
                return "FAILURE";
            case null:
                return "INPROGRESS";
        };
    }

    vm.showValidationResult = function(validation) {
        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title',
            ariaDescribedBy: 'modal-body',
            templateUrl: 'static/frontend/views/validation_result_modal.html',
            controller: 'DataModalInstanceCtrl',
            size: "lg",
            controllerAs: '$ctrl',
            resolve: {
                data: {
                    validation: validation
                }
            }
        })
        modalInstance.result.then(function (data) {
        }, function () {
            $log.info('modal-component dismissed at: ' + new Date());
        });
    }
});
