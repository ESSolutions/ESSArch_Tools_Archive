angular.module('myApp').controller('BaseCtrl', function(IP, Task, Step, vm, ipSortString, $http, $scope, $rootScope, $state, $log, listViewService, Resource, $translate, appConfig, $interval, $uibModal, $timeout, $anchorScroll, PermPermissionStore, $cookies, $q, $window, ContextMenuBase) {
    // Initialize variables
    $scope.filebrowser = false;
    $scope.statusShow = false;
    $scope.eventShow = false;
    $scope.ip = null;
    $rootScope.ip = null;

    vm.itemsPerPage = $cookies.get('eta-ips-per-page') || 10;
    var watchers = [];

    // Watchers
    watchers.push($scope.$watch(function(){return $rootScope.navigationFilter;}, function(newValue, oldValue) {
        $scope.getListViewData();
    }, true));
    $scope.$on('$translateChangeSuccess', function () {
        $state.reload()
    });

    // Init intervals
    $scope.$on('$stateChangeStart', function() {
        $interval.cancel(listViewInterval);
        watchers.forEach(function(watcher) {
            watcher();
        });
    });

    $scope.$on('REFRESH_LIST_VIEW', function (event, data) {
        $scope.getListViewData();
    });

    // Context menu

    $scope.menuOptions = function (rowType, row) {
        return [
            ContextMenuBase.changeOrganization(
                function () {
                    $scope.ip = row;
                    $rootScope.ip = row;
                    vm.changeOrganizationModal($scope.ip);
            })
        ];
    }

    // Update list view interval
    //Update only if status < 100 and no step has failed in any IP

    var listViewInterval;
    vm.updateListViewConditional = function () {
        $interval.cancel(listViewInterval);
        listViewInterval = $interval(function () {
            var updateVar = false;
            vm.displayedIps.forEach(function (ip, idx) {
                if (ip.status < 100) {
                    if (ip.step_state != "FAILURE") {
                        updateVar = true;
                    }
                }
            });
            if (updateVar) {
                $scope.getListViewData();
            } else {
                $interval.cancel(listViewInterval);
                listViewInterval = $interval(function () {
                    var updateVar = false;
                    vm.displayedIps.forEach(function (ip, idx) {
                        if (ip.status < 100) {
                            if (ip.step_state != "FAILURE") {
                                updateVar = true;
                            }
                        }
                    });
                    if (!updateVar) {
                        $scope.getListViewData();
                    } else {
                        vm.updateListViewConditional();
                    }

                }, appConfig.ipIdleInterval);
            }
        }, appConfig.ipInterval);
    };
    vm.updateListViewConditional();

    // Click functions

    $scope.stateClicked = function (row) {
        if ($scope.statusShow) {
                $scope.tree_data = [];
            if ($scope.ip == row) {
                $scope.statusShow = false;
                if(!$scope.select && !$scope.edit && !$scope.statusShow && !$scope.eventShow && !$scope.filebrowser) {
                    $scope.ip = null;
                    $rootScope.ip = null;
                }
            } else {
                $scope.statusShow = true;
                $scope.edit = false;
                $scope.ip = row;
                $rootScope.ip = row;
            }
        } else {
            $scope.statusShow = true;
            $scope.edit = false;
            $scope.ip = row;
            $rootScope.ip = row;
        }
        $scope.subSelect = false;
        $scope.eventlog = false;
        $scope.select = false;
        $scope.eventShow = false;
    };

    $scope.eventsClick = function (row) {
        if($scope.eventShow && $scope.ip == row){
            $scope.eventShow = false;
            $rootScope.stCtrl = null;
            if(!$scope.select && !$scope.edit && !$scope.statusShow && !$scope.eventShow && !$scope.filebrowser) {
                $scope.ip = null;
                $rootScope.ip = null;
            }
        } else {
            $scope.eventShow = true;
            $scope.validateShow = false;
            $scope.statusShow = false;
            $scope.ip = row;
            $rootScope.ip = row;
        }
    };

    $scope.filebrowserClick = function (ip) {
        if ($scope.filebrowser && $scope.ip == ip) {
            $scope.filebrowser = false;
            if(!$scope.select && !$scope.edit && !$scope.statusShow && !$scope.eventShow && !$scope.filebrowser) {
                $scope.ip = null;
                $rootScope.ip = null;
            }
        } else {
            if ($rootScope.auth.id == ip.responsible.id || !ip.responsible) {
                $scope.filebrowser = true;
                $scope.ip = ip;
                $rootScope.ip = ip;
            }
        }
    }

    // List view

    vm.displayedIps = [];

    //Get data according to ip table settings and populates ip table
    vm.callServer = function callServer(tableState) {
        $scope.ipLoading = true;
        if(vm.displayedIps.length == 0) {
            $scope.initLoad = true;
        }
        if(!angular.isUndefined(tableState)) {
            $scope.tableState = tableState;
            var search = "";
            if(tableState.search.predicateObject) {
                var search = tableState.search.predicateObject["$"];
            }
            var sorting = tableState.sort;
            var pagination = tableState.pagination;
            var start = pagination.start || 0;     // This is NOT the page number, but the index of item in the list that you want to use to display the table.
            var number = pagination.number || vm.itemsPerPage;  // Number of entries showed per page.
            var pageNumber = start/number+1;

            Resource.getIpPage(start, number, pageNumber, tableState, sorting, search, ipSortString, $scope.columnFilters, vm.workarea).then(function (result) {
                vm.displayedIps = result.data;
                tableState.pagination.numberOfPages = result.numberOfPages;//set the number of pages so the pagination can update
                $scope.ipLoading = false;
                $scope.initLoad = false;
                ipExists();
            }).catch(function(response) {
                if(response.status == 404) {
                    var filters = angular.extend({
                        state: ipSortString
                    }, $scope.columnFilters)

                    if(vm.workarea) {
                        filters.workarea = vm.workarea;
                    }

                    listViewService.checkPages("ip", number, filters).then(function (result) {
                        tableState.pagination.numberOfPages = result.numberOfPages;//set the number of pages so the pagination can update
                        tableState.pagination.start = (result.numberOfPages*number) - number;
                        vm.callServer(tableState);
                    });
                }
            });
        }
    };

    function ipExists() {
        if($scope.ip != null) {
            var temp = false;
            vm.displayedIps.forEach(function(aic) {
                if($scope.ip.id == aic.id) {
                    temp = true;
                }
            })
            if(!temp) {
                $scope.eventShow = false;
                $scope.statusShow = false;
                $scope.filebrowser = false;
                $scope.requestForm = false;
                $scope.eventlog = false;
                $scope.requestEventlog = false;
            }
        }
    }

    // Get list view data

    $scope.getListViewData = function() {
        vm.callServer($scope.tableState);
        if(!$state.is('home.reception')) {
            $rootScope.loadNavigation(ipSortString);
        }
    };

    // Keyboard shortcuts
    function selectNextIp() {
        var index = 0;
        if($scope.ip) {
            vm.displayedIps.forEach(function(ip, idx, array) {
                if($scope.ip.id === ip.id) {
                    index = idx+1;
                }
            });
        }
        if(index !== vm.displayedIps.length) {
            $scope.ipTableClick(vm.displayedIps[index]);
        }
    }

    function previousIp() {
        var index = vm.displayedIps.length-1;
        if($scope.ip) {
            vm.displayedIps.forEach(function(ip, idx, array) {
                if($scope.ip.id === ip.id) {
                    index = idx-1;
                }
            });
        }
        if(index >= 0) {
            $scope.ipTableClick(vm.displayedIps[index]);
        }
    }

    function closeContentViews() {
        $scope.stepTaskInfoShow = false;
        $scope.statusShow = false;
        $scope.eventShow = false;
        $scope.select = false;
        $scope.subSelect = false;
        $scope.edit = false;
        $scope.eventlog = false;
        $scope.filebrowser = false;
        $scope.ip = null;
        $rootScope.ip = null;
    }
    var arrowLeft = 37;
    var arrowUp = 38;
    var arrowRight = 39;
    var arrowDown = 40;
    var escape = 27;
    var enter = 13;
    var space = 32;

    /**
     * Handle keydown events in list view
     * @param {Event} e
     */
    vm.ipListKeydownListener = function(e) {
        switch(e.keyCode) {
            case arrowDown:
                e.preventDefault();
                selectNextIp();
                break;
            case arrowUp:
                e.preventDefault();
                previousIp();
                break;
            case arrowLeft:
                e.preventDefault();
                var pagination = $scope.tableState.pagination;
                if(pagination.start != 0) {
                    pagination.start -= pagination.number;
                    $scope.getListViewData();
                }
                break;
            case arrowRight:
                e.preventDefault();
                var pagination = $scope.tableState.pagination;
                if((pagination.start / pagination.number + 1) < pagination.numberOfPages) {
                    pagination.start+=pagination.number;
                    $scope.getListViewData();
                }
                break;
            case space:
                e.preventDefault();
                if($state.is('home.reception')) {
                    $scope.includeIp($scope.ip);
                    $scope.getListViewData();
                }
                break;
            case escape:
                if($scope.ip) {
                    closeContentViews();
                }
                break;
        }
    }

    /**
     * Handle keydown events in views outside list view
     * @param {Event} e
     */
    vm.contentViewsKeydownListener = function(e) {
        switch(e.keyCode) {
            case escape:
                if($scope.ip) {
                    closeContentViews();
                }
                document.getElementById("list-view").focus();
                break;
        }
    }

    // Validators
    vm.validators = function() {
        var list = [];
        for(key in vm.validatorModel) {
            if(vm.validatorModel[key]) {
                list.push(key);
            }
        }
        return list;
    }
    vm.validatorModel = {};
    vm.validatorFields = [
        {
            "templateOptions": {
                "type": "text",
                "label": $translate.instant('VALIDATEFILEFORMAT'),
            },
            "defaultValue": true,
            "type": "checkbox",
            "ngModelElAttrs": {
                "tabindex": '-1'
            },
            "key": "file_format",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": $translate.instant('VALIDATEXMLFILE'),
            },
            "defaultValue": true,
            "type": "checkbox",
            "ngModelElAttrs": {
                "tabindex": '-1'
            },
            "key": "xml_file",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": $translate.instant('VALIDATELOGICALPHYSICALREPRESENTATION'),
            },
            "defaultValue": true,
            "type": "checkbox",
            "ngModelElAttrs": {
                "tabindex": '-1'
            },
            "key": "logical_physical_representation",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": $translate.instant('VALIDATECHECKSUM'),
            },
            "defaultValue": true,
            "type": "checkbox",
            "ngModelElAttrs": {
                "tabindex": '-1'
            },
            "key": "checksum",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": $translate.instant('VALIDATEDIRECTORYSTRUCTURE'),
            },
            "defaultValue": true,
            "type": "checkbox",
            "ngModelElAttrs": {
                "tabindex": '-1'
            },
            "key": "structure",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": "Mediaconch",
            },
            "defaultValue": true,
            "type": "checkbox",
            "ngModelElAttrs": {
                "tabindex": '-1'
            },
            "key": "mediaconch",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": "VeraPDF",
            },
            "defaultValue": true,
            "type": "checkbox",
            "ngModelElAttrs": {
                "tabindex": '-1'
            },
            "key": "verapdf",
        },
    ];

    // Basic functions

    // Executed after IP is removed
    $scope.ipRemoved = function (ipObject) {
        vm.displayedIps.splice(vm.displayedIps.indexOf(ipObject), 1);
        $scope.edit = false;
        $scope.select = false;
        $scope.eventlog = false;
        $scope.eventShow = false;
        $scope.statusShow = false;
        $scope.filebrowser = false;
        $rootScope.loadNavigation(ipSortString);
        if(vm.displayedIps.length == 0) {
            $state.reload();
        }
        $scope.getListViewData();
    }
    vm.getEventlogData = function() {
        listViewService.getEventlogData().then(function(value){
            $scope.eventTypeCollection = value;
        });
    };
    $scope.checkPermission = function(permissionName) {
        return !angular.isUndefined(PermPermissionStore.getPermissionDefinition(permissionName));
    };
    $scope.updateIpsPerPage = function(items) {
        $cookies.put('eta-ips-per-page', items);
    };

    //advanced filter form data
    $scope.columnFilters = {};
    $scope.filterModel = {};
    $scope.options = {};
    $scope.fields = [];
    vm.setupForm = function() {
        $scope.fields = [];
        $scope.filterModel = {};
         for(var key in $scope.usedColumns) {
             var column = $scope.usedColumns[key];
             switch (column.type) {
                 case "ModelChoiceFilter":
                 case "ChoiceFilter":
                     $scope.fields.push({
                         "templateOptions": {
                             "type": "text",
                             "label": $translate.instant(key.toUpperCase()),
                             "labelProp": "display_name",
                             "valueProp": "value",
                             "options": column.choices,
                         },
                         "type": "select",
                         "key": key,
                     })
                     break;
                 case "BooleanFilter":
                     $scope.fields.push({
                         "templateOptions": {
                             "label": $translate.instant(key.toUpperCase()),
                             "labelProp": key,
                             "valueProp": key,
                         },
                         "type": "checkbox",
                         "key": key,
                     })
                     break;
                 case "ListFilter":
                 case "CharFilter":
                     $scope.fields.push({
                         "templateOptions": {
                             "type": "text",
                             "label": $translate.instant(key.toUpperCase()),
                             "labelProp": key,
                             "valueProp": key,
                         },
                         "type": "input",
                         "key": key,
                     })
                     break;
                 case "IsoDateTimeFromToRangeFilter":
                     $scope.fields.push(
                         {
                             "templateOptions": {
                                 "type": "text",
                                 "label": $translate.instant(key.toUpperCase() + "_START"),
                             },
                             "type": "datepicker",
                             "key": key + "_0"
                         }
                     )
                     $scope.fields.push(
                         {
                             "templateOptions": {
                                 "type": "text",
                                 "label": $translate.instant(key.toUpperCase() + "_END"),
                             },
                             "type": "datepicker",
                             "key": key + "_1"
                         }
                     )
                     break;
             }
         }
    }

    vm.toggleOwnIps = function(filterIps) {
        if(filterIps) {
            $scope.filterModel.responsible = $rootScope.auth.username;
        } else {
            if($scope.filterModel.responsible == $rootScope.auth.username) {
                delete $scope.filterModel.responsible;
            }
        }
    }

    //Toggle visibility of advanced filters
    $scope.toggleAdvancedFilters = function () {
        if ($scope.showAdvancedFilters) {
            $scope.showAdvancedFilters = false;
        } else {
            if ($scope.fields.length <=0) {
                $http({
                    method: "OPTIONS",
                    url: appConfig.djangoUrl + "information-packages/"
                }).then(function(response) {
                    $scope.usedColumns = response.data.filters;
                    vm.setupForm();
                });
            }
            $scope.showAdvancedFilters = true;
        }
         if ($scope.showAdvancedFilters) {
             $window.onclick = function (event) {
                 var clickedElement = $(event.target);
                 if (!clickedElement) return;
                 var elementClasses = event.target.classList;
                 var clickedOnAdvancedFilters = elementClasses.contains('filter-icon') ||
                 elementClasses.contains('advanced-filters') ||
                 clickedElement.parents('.advanced-filters').length ||
                 clickedElement.parents('.button-group').length;

                 if (!clickedOnAdvancedFilters) {
                     $scope.showAdvancedFilters = !$scope.showAdvancedFilters;
                     $window.onclick = null;
                     $scope.$apply();
                 }
             }
         } else {
             $window.onclick = null;
         }
    }

    $scope.clearSearch = function() {
        delete $scope.tableState.search.predicateObject;
        $('#search-input')[0].value = "";
        $scope.getListViewData();
    }

    $scope.filterActive = function() {
        var temp = false;
        for(var key in $scope.columnFilters) {
            if($scope.columnFilters[key] !== "" && $scope.columnFilters[key] !== null) {
                temp = true;
            }
        }
        return temp;
    }

    $scope.submitAdvancedFilters = function() {
        $scope.columnFilters = angular.copy($scope.filterModel);
        $scope.getListViewData();
    }

    // Click function for request form submit.
    // Replaced form="vm.requestForm" to work in IE
    $scope.clickSubmit = function () {
        if (vm.requestForm.$valid) {
            $scope.submitRequest($scope.ip, vm.request);
        }
    }

    //Creates and shows modal with task information
    $scope.taskInfoModal = function () {
        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title',
            ariaDescribedBy: 'modal-body',
            templateUrl: 'modals/task_info_modal.html',
            scope: $scope,
            controller: 'TaskInfoModalInstanceCtrl',
            controllerAs: '$ctrl',
            resolve: {
                data: {}
            }
        });
        modalInstance.result.then(function (data, $ctrl) {
        }, function () {
            $log.info('modal-component dismissed at: ' + new Date());
        });
    }
    //Creates and shows modal with step information
    $scope.stepInfoModal = function () {
        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title',
            ariaDescribedBy: 'modal-body',
            templateUrl: 'modals/step_info_modal.html',
            scope: $scope,
            controller: 'StepInfoModalInstanceCtrl',
            controllerAs: '$ctrl',
            resolve: {
                data: {}
            }
        });
        modalInstance.result.then(function (data, $ctrl) {
        }, function () {
            $log.info('modal-component dismissed at: ' + new Date());
        });
    }
    $scope.tracebackModal = function (profiles) {
        $scope.profileToSave = profiles;
        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title',
            ariaDescribedBy: 'modal-body',
            templateUrl: 'static/frontend/views/task_traceback_modal.html',
            scope: $scope,
            size: 'lg',
            controller: 'ModalInstanceCtrl',
            controllerAs: '$ctrl'
        })
        modalInstance.result.then(function (data) {
        }, function () {
            $log.info('modal-component dismissed at: ' + new Date());
        });
    }
    $scope.removeIpModal = function (ipObject) {
        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title',
            ariaDescribedBy: 'modal-body',
            templateUrl: 'static/frontend/views/remove-ip-modal.html',
            controller: 'DataModalInstanceCtrl',
            controllerAs: '$ctrl',
            resolve: {
                data: {
                    ip: ipObject
                }
            }
        })
        modalInstance.result.then(function (data) {
            $scope.ipRemoved(ipObject);
        }, function () {
            $log.info('modal-component dismissed at: ' + new Date());
        });
    }

    vm.changeOrganizationModal = function (ip) {
        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title',
            ariaDescribedBy: 'modal-body',
            templateUrl: 'modals/change_organization_modal.html',
            controller: 'OrganizationModalInstanceCtrl',
            controllerAs: '$ctrl',
            size: "sm",
            resolve: {
                data: function () {
                    return {
                        ip: ip,
                    };
                }
            },
        })
        modalInstance.result.then(function (data) {
            $scope.getListViewData();
        }).catch(function () {
            $log.info('modal-component dismissed at: ' + new Date());
        });
    }
});
