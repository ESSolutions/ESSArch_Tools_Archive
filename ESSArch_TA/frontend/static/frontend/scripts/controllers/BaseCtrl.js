angular.module('essarch.controllers').controller('BaseCtrl', function(IP, Task, Step, vm, ipSortString, $http, $scope, $rootScope, $state, $log, listViewService, Resource, $translate, appConfig, $interval, $uibModal, $timeout, $anchorScroll, PermPermissionStore, $cookies, $q, $window, ContextMenuBase, ContentTabs) {
    // Initialize variables
    $scope.filebrowser = false;
    $scope.statusShow = false;
    $scope.eventShow = false;
    $scope.ip = null;
    $rootScope.ip = null;
    $scope.ips = [];
    vm.specificTabs = [];

    vm.itemsPerPage = $cookies.get('eta-ips-per-page') || 10;
    var watchers = [];

    // Watchers
    watchers.push($scope.$watch(function() {
        return $scope.ips.length;
    }, function(newVal) {
        $timeout(function(){
            if($scope.ip !== null) {
                vm.specificTabs = ContentTabs.visible([$scope.ip], $state.current.name)                ;
            } else {
                    vm.specificTabs = ContentTabs.visible($scope.ips, $state.current.name);
            }
            if(newVal > 0) {
                vm.activeTab = vm.specificTabs[0];
            } else {
                vm.activeTab = 'no_tabs';
            }
        })
    }, true));

    watchers.push($scope.$watch(function() {
        return $scope.ip;
    }, function(newVal) {
        if(newVal !== null) {

            $timeout(function(){
                vm.specificTabs = ContentTabs.visible([$scope.ip], $state.current.name);
                if(vm.specificTabs.length > 0) {
                    vm.activeTab = vm.specificTabs[0];
                } else {
                    vm.activeTab = 'tasks';
                }
            })
        }
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
    //Click function for Ip table
    $scope.ipTableClick = function(row, event) {
        if( event && event.shiftKey) {
            vm.shiftClickrow(row);
        } else if(event && event.ctrlKey) {
            vm.ctrlClickRow(row);
        } else {
            vm.selectSingleRow(row);
        }
    };

    vm.shiftClickrow = function (row) {
        var index = vm.displayedIps.map(function(ip) { return ip.id; }).indexOf(row.id);
        var last;
        if($scope.ips.length > 0) {
            last = $scope.ips[$scope.ips.length-1].id;
        } else if ($scope.ips.length <= 0 && $scope.ip != null) {
            last = $scope.ip.id;
        } else {
            last = null;
        }
        var lastIndex = last != null?vm.displayedIps.map(function(ip) { return ip.id; }).indexOf(last):index;
        if(lastIndex > index) {
            for(i = lastIndex;i >= index;i--) {
                if(!$scope.selectedAmongOthers(vm.displayedIps[i].id)) {
                    $scope.ips.push(vm.displayedIps[i]);
                }
            }
        } else if(lastIndex < index) {
            for(i = lastIndex;i <= index;i++) {
                if(!$scope.selectedAmongOthers(vm.displayedIps[i].id)) {
                    $scope.ips.push(vm.displayedIps[i]);
                }
            }
        } else {
            vm.selectSingleRow(row);
        }
        $scope.statusShow = false;
    }

    vm.ctrlClickRow = function (row) {
        if(row.package_type != 1) {
            if($scope.ip != null) {
                $scope.ips.push($scope.ip);
            }
            $scope.ip = null;
            $rootScope.ip = null;
            $scope.eventShow = false;
            $scope.statusShow = false;
            $scope.filebrowser = false;
            var deleted = false;
            $scope.ips.forEach(function(ip, idx, array) {
                if(!deleted && ip.object_identifier_value == row.object_identifier_value) {
                    array.splice(idx, 1);
                    deleted = true;
                }
            })
            if(!deleted) {

                $scope.select = true;
                $scope.eventlog = true;
                $scope.edit = true;
                $scope.requestForm = true;
                $scope.eventShow = false;
                $scope.ips.push(row);
            }
            if($scope.ips.length == 1) {
                $scope.ip = $scope.ips[0];
                $rootScope.ip = $scope.ips[0];
                $scope.ips = [];
            }
        }
        $scope.statusShow = false;
    }

    vm.selectSingleRow = function (row) {
        $scope.ips = [];
        if($scope.ip !== null && $scope.ip.id== row.id){
            $scope.select = false;
            $scope.eventlog = false;
            $scope.ip = null;
            $rootScope.ip = null;
            $scope.filebrowser = false;
        } else {
            $scope.ip = row;
            $rootScope.ip = $scope.ip;
            $scope.eventlog = true;
            $scope.select = true;
        }
        $scope.edit = false;
        $scope.eventShow = false;
        $scope.statusShow = false;
    }

    $scope.selectedAmongOthers = function(id) {
        var exists = false;
        $scope.ips.forEach(function(ip) {
            if(ip.id == id) {
                exists = true;
            }
        })
        return exists;
    }

    vm.multipleIpResponsible = function() {
        if($scope.ips.length > 0) {
            var responsible = true;
            $scope.ips.forEach(function(ip) {
                if(ip.responsible.id !== $rootScope.auth.id) {
                    responsible = false;
                }
            })
            return responsible;
        } else {
            return false;
        }
    }

    vm.selectAll = function() {
        $scope.ips = [];
        vm.displayedIps.forEach(function(ip) {
            vm.ctrlClickRow(ip);
            if(ip.information_packages && ip.information_packages.length > 0 && !ip.collapsed) {
                ip.information_packages.forEach(function(subIp) {
                    vm.ctrlClickRow(subIp);
                });
            }
        });
    }

    vm.deselectAll = function() {
        $scope.ips = [];
        $scope.ip = null;
        $rootScope.ip = null;
    }

    $scope.checkPermission = function(perm) {
        return myService.checkPermission(perm);
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
        $scope.ips = [];
        $scope.ip = null;
        $rootScope.ip = null;
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
            if(key == "package_type_name_exclude" || key == "workarea") {
                delete column;
            } else {
                switch (column.type) {
                    case "ModelMultipleChoiceFilter":
                    case "MultipleChoiceFilter":
                        $scope.fields.push({
                            "templateOptions": {
                                "type": "text",
                                "label": column.label,
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
                                "label": column.label,
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
                                "label": column.label,
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
                                    "label": column.label + " " + $translate.instant('START'),
                                },
                                "type": "datepicker",
                                "key": key + "_after"
                            }
                        )
                        $scope.fields.push(
                            {
                                "templateOptions": {
                                    "type": "text",
                                    "label": column.label + " " + $translate.instant('END'),
                                },
                                "type": "datepicker",
                                "key": key + "_before"
                            }
                        )
                        break;
                }
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

    vm.clearFilters = function() {
        vm.setupForm();
        $scope.submitAdvancedFilters();
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
