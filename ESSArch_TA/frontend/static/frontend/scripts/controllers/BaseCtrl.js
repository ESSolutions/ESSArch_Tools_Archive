angular.module('myApp').controller('BaseCtrl', function(IP, Task, Step, vm, ipSortString, $http, $scope, $rootScope, $state, $log, listViewService, Resource, $translate, appConfig, $interval, $uibModal, $timeout, $anchorScroll, PermPermissionStore, $cookies, $q, $window) {
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
        $interval.cancel(stateInterval);
        $interval.cancel(listViewInterval);
        watchers.forEach(function(watcher) {
            watcher();
        });
    });

    $scope.$on('REFRESH_LIST_VIEW', function (event, data) {
        $scope.getListViewData();
    });

    var stateInterval;
    watchers.push($scope.$watch(function(){return $scope.statusShow;}, function(newValue, oldValue) {
        if(newValue) {
            $interval.cancel(stateInterval);
            stateInterval = $interval(function(){$scope.statusViewUpdate($scope.ip)}, appConfig.stateInterval);
        } else {
            $interval.cancel(stateInterval);
        }
    }));

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
                $scope.statusViewUpdate(row);
                $scope.ip = row;
                $rootScope.ip = row;
            }
        } else {
            $scope.statusShow = true;
            $scope.edit = false;
            $scope.statusViewUpdate(row);
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

    // Validators
    vm.validators = function() {
        var list = [];
        for(key in vm.validatorModel) {
            list.push(key);
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
            "key": "file_format",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": $translate.instant('VALIDATEXMLFILE'),
            },
            "defaultValue": true,
            "type": "checkbox",
            "key": "xml_file",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": $translate.instant('VALIDATELOGICALPHYSICALREPRESENTATION'),
            },
            "defaultValue": true,
            "type": "checkbox",
            "key": "logical_physical_representation",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": $translate.instant('VALIDATECHECKSUM'),
            },
            "defaultValue": true,
            "type": "checkbox",
            "key": "checksum",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": "Mediaconch",
            },
            "defaultValue": true,
            "type": "checkbox",
            "key": "mediaconch",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": "VeraPDF",
            },
            "defaultValue": true,
            "type": "checkbox",
            "key": "verapdf",
        }
    ];

    // Basic functions

    //Remove and ip
    $scope.removeIp = function (ipObject, workarea, reception) {
        IP.delete({ id: ipObject.id }, { workarea: workarea, reception: reception }).$promise.then(function() {
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
        });
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
    // Status tree view structure
    $scope.tree_data = [];
    $scope.angular = angular;
    $translate(['LABEL', 'RESPONSIBLE', 'DATE', 'STATE', 'STATUS']).then(function(translations) {
        $scope.responsible = translations.RESPONSIBLE;
        $scope.label = translations.LABEL;
        $scope.date = translations.DATE;
        $scope.state = translations.STATE;
        $scope.status = translations.STATUS;
        $scope.expanding_property = {
            field: "name",
            displayName: $scope.label,
        };
        $scope.col_defs = [
            {
                field: "user",
                displayName: $scope.responsible,
            },
            {
                cellTemplate: "<div ng-include src=\"'static/frontend/views/task_pagination.html'\"></div>"
            },
            {
                field: "time_started",
                displayName: $scope.date
            },
            {
                field: "status",
                displayName: $scope.state,
                cellTemplate: "<div ng-if=\"row.branch[col.field] == 'SUCCESS'\" class=\"step-state-success\"><b>{{'SUCCESS' | translate}}</b></div><div ng-if=\"row.branch[col.field] == 'FAILURE'\" class=\"step-state-failure\"><b>{{'FAILURE' | translate}}</b></div><div ng-if=\"row.branch[col.field] != 'SUCCESS' && row.branch[col.field] !='FAILURE'\" class=\"step-state-in-progress\"><b>{{'INPROGRESS' | translate}}</b></div>"

            },
            {
                field: "progress",
                displayName: $scope.status,
                cellTemplate: "<uib-progressbar class=\"progress\" value=\"row.branch[col.field]\" type=\"success\"><b>{{row.branch[col.field]+\"%\"}}</b></uib-progressbar>"
            }
        ];
        if($scope.checkPermission("WorkflowEngine.can_undo") || $scope.checkPermission("WorkflowEngine.can_retry")) {
            $scope.col_defs.push(
            {
                cellTemplate: "<div ng-include src=\"'static/frontend/views/undo_redo.html'\"></div>"
            });
        }
    });
    $scope.myTreeControl = {};
    $scope.myTreeControl.scope = this;
    //Undo step/task
    $scope.myTreeControl.scope.taskStepUndo = function(branch) {
        branch.$undo().then(function(response) {
            $timeout(function(){
                $scope.statusViewUpdate($scope.ip);
            }, 1000);
        }).catch(function() {
            console.log("error");
        });
    };
    //Redo step/task
    $scope.myTreeControl.scope.taskStepRedo = function(branch){
        branch.$retry().then(function(response) {
            $timeout(function(){
                $scope.statusViewUpdate($scope.ip);
            }, 1000);
        }).catch(function() {
            console.log("error");
        });
    };
    $scope.myTreeControl.scope.updatePageNumber = function(branch, page) {
        if(page > branch.page_number && branch.next){
            branch.page_number = parseInt(branch.next.page);
            listViewService.getChildrenForStep(branch, branch.page_number).then(function(result) {
                branch = result;
            })
        } else if(page < branch.page_number && branch.prev && page > 0) {
            branch.page_number = parseInt(branch.prev.page);
            listViewService.getChildrenForStep(branch, branch.page_number).then(function(result) {
                branch = result;
            })
        }
    };

    //Get data for status view
     function checkExpanded(nodes) {
         var ret = [];
         nodes.forEach(function(node) {
             if(node.expanded == true) {
                ret.push(node);
            }
            if(node.children && node.children.length > 0) {
                ret = ret.concat(checkExpanded(node.children));
            }
        });
        return ret;
    }

    //Update status view data
    $scope.statusViewUpdate = function(row){
        $scope.statusLoading = true;
        var expandedNodes = [];
        if($scope.tree_data != []) {
            expandedNodes = checkExpanded($scope.tree_data);
        }
        listViewService.getTreeData(row, expandedNodes).then(function(value) {
            $q.all(value).then(function(values) {
                if($scope.tree_data.length) {
                    $scope.tree_data = updateStepProperties($scope.tree_data, values);
                } else {
                    $scope.tree_data = value;
                }
            })
            $scope.statusLoading = false;
        }, function(response){
            if(response.status == 404) {
                $scope.statusShow = false;
                $timeout(function(){
                    $scope.getListViewData();
                    updateListViewConditional();
                }, 1000);
            }
        });
    };

    // Calculates difference in two sets of steps and tasks recursively
    // and updates the old set with the differances.
    function updateStepProperties(A, B) {
        if (A.length > B.length) {
            A.splice(0, B.length);
        }
        for (i = 0; i < B.length; i++) {
            if (A[i]) {
                for (var prop in B[i]) {
                    if (B[i].hasOwnProperty(prop) && prop != "children") {
                        A[i][prop] = compareAndReplace(A[i], B[i], prop);
                    }
                }
                if (B[i].flow_type != "task") {
                    waitForChildren(A[i], B[i]).then(function (result) {
                        result.step.children = result.children;
                    })
                }
            } else {
                A.push(B[i]);
            }
        }
        return A;
    }

    // Waits for promises in b.children to resolve before returning
    // the result from updateStepProperties called with children of a and b
    function waitForChildren(a, b) {
        return $q.all(b.children).then(function (bchildren) {
            return { step: a, children: updateStepProperties(a.children, bchildren) };
        })
    }

    // If property in a and b does not have the same value, update a with the value of b
    function compareAndReplace(a, b, prop) {
        if (a.hasOwnProperty(prop) && b.hasOwnProperty(prop)) {
            if (a[prop] !== b[prop]) {
                a[prop] = b[prop];
            }
            return a[prop];
        } else {
            return b[prop]
        }
    }

    $scope.currentStepTask = {id: ""}
    //Click on +/- on step
    $scope.stepClick = function(step) {
        listViewService.getChildrenForStep(step);
    };

    $scope.getTask = function(branch) {
        return Task.get({ id: branch.id }).$promise.then(function (data) {
            var started = moment(data.time_started);
            var done = moment(data.time_done);
            data.duration = done.diff(started);
            $scope.currentStepTask = data;
            $scope.stepTaskLoading = false;
            return data;
        });
    }

    $scope.getStep = function(branch) {
        return Step.get({ id: branch.id }).$promise.then(function (data) {
            var started = moment(data.time_started);
            var done = moment(data.time_done);
            data.duration = done.diff(started);
            $scope.currentStepTask = data;
            $scope.stepTaskLoading = false;
            return data;
        });
    }
    //Click funciton for steps and tasks
    $scope.stepTaskClick = function (branch) {
        $scope.stepTaskLoading = true;
        if (branch.flow_type == "task") {
            $scope.getTask(branch).then(function(data) {
                $scope.taskInfoModal();
            });
        } else {
            $scope.getStep(branch).then(function(data) {
                $scope.stepInfoModal();
            });
        }
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
            templateUrl: 'static/frontend/views/task_info_modal.html',
            scope: $scope,
            controller: 'ModalInstanceCtrl',
            controllerAs: '$ctrl'
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
            templateUrl: 'static/frontend/views/step_info_modal.html',
            scope: $scope,
            controller: 'ModalInstanceCtrl',
            controllerAs: '$ctrl'
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
            controller: 'ModalInstanceCtrl',
            controllerAs: '$ctrl'
        })
        modalInstance.result.then(function (data) {
            $scope.removeIp(ipObject, data.workarea, data.reception);
        }, function () {
            $log.info('modal-component dismissed at: ' + new Date());
        });
    }
});
