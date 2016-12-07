angular.module('myApp').controller('ReceptionCtrl', function($http, $scope, $rootScope, $state, $log, listViewService, Resource, $translate, appConfig, $interval, $uibModal, $timeout) {
    $rootScope.$on('$translateChangeSuccess', function () {
        $state.reload()
    });
    $scope.includedIps = [];
    $scope.receiveShow = false;
    $scope.validateShow = false;
    $scope.statusShow = false;
    $scope.eventShow = false;
    $scope.tree_data = [];
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
            field: "time_created",
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
        },
        {
            cellTemplate: "<a ng-click=\"treeControl.scope.taskStepUndo(row.branch)\" ng-if=\"(row.branch.status == 'SUCCESS' || row.branch.status == 'FAILURE') && !row.branch.undone && !row.branch.undo_type\" style=\"color: #a00\">{{'UNDO' | translate}}</a></br ><a ng-click=\"treeControl.scope.taskStepRedo(row.branch)\" ng-if=\"row.branch.undone\"style=\"color: #0a0\">{{'REDO' | translate}}</a>"
        }
        ];
    });
    var stateInterval;
    $scope.stateClicked = function(row){
        if($scope.statusShow && $scope.ip == row){
            $scope.statusShow = false;
        } else {
             $scope.eventShow = false;
             $scope.validateShow = false;
             $scope.statusShow = true;
             $scope.statusViewUpdate(row);
         }
         $scope.ip = row;
         $rootScope.ip = row;
     };
     $scope.$watch(function(){return $scope.statusShow;}, function(newValue, oldValue) {
         if(newValue) {
             $interval.cancel(stateInterval);
             stateInterval = $interval(function(){$scope.statusViewUpdate($scope.ip)}, appConfig.stateInterval);
        } else {
            $interval.cancel(stateInterval);
        }
     });
     $rootScope.$on('$stateChangeStart', function() {
         $interval.cancel(stateInterval);
         $interval.cancel(listViewInterval);
     });

//Get data for status view
     function checkExpanded(nodes) {
         var ret = [];
         nodes.forEach(function(node) {
             if(node.expanded == true) {
                ret.push({id: node.id, name: node.name});
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
            $scope.tree_data = value;
            $scope.statusLoading = false;
        });
    };
    /*
     * EVENTS
     */
    $scope.eventsClick = function (row) {
        if($scope.eventShow && $scope.ip == row){
            $scope.eventShow = false;
            $rootScope.stCtrl = null;
        } else {
            if($rootScope.stCtrl) {
                $rootScope.stCtrl.pipe();
            }
            getEventlogData();
            $scope.eventShow = true;
            $scope.validateShow = false;
            $scope.statusShow = false;
        }
        $scope.ip = row;
        $rootScope.ip = row;
    };
    function getEventlogData() {
        listViewService.getEventlogData().then(function(value){
            $scope.eventTypeCollection = value;
        });
    };

 $scope.currentStepTask = {id: ""}
    //Click funciton for steps and tasks
     $scope.stepTaskClick = function(branch) {
         if(branch.isTask){
             $http({
                 method: 'GET',
                 url: branch.url
             }).then(function(response){
                 console.log(response.data)
                 $scope.currentStepTask = response.data;
                 $scope.taskInfoModal();
             }, function(response) {
                 response.status;
             });
         }
     };
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


    /*******************************************/
    /*Piping and Pagination for List-view table*/
    /*******************************************/
    var vm = this;
    var ctrl = this;
    this.itemsPerPage = 10;
    $scope.selectedIp = {id: "", class: ""};
    this.displayedIps = [];

    //Get data according to ip table settings and populates ip table
    this.callServer = function callServer(tableState) {
        $scope.ipLoading = true;
        $scope.tableState = tableState;

        var sorting = tableState.sort;
        var pagination = tableState.pagination;
        var start = pagination.start || 0;     // This is NOT the page number, but the index of item in the list that you want to use to display the table.
        var number = pagination.number || ctrl.itemsPerPage;  // Number of entries showed per page.
        var pageNumber = start/number+1;

        Resource.getReceptionIps(start, number, pageNumber, tableState, $scope.selectedIp, $scope.includedIps, sorting, "Receiving").then(function (result) {
            vm.displayedIps = result.data;
            tableState.pagination.numberOfPages = result.numberOfPages;//set the number of pages so the pagination can update
            $scope.ipLoading = false;
        });
    };
    //Make ip selected and add class to visualize
    vm.displayedIps=[];
    $scope.selected = [];
        $scope.selectIp = function(row) {
        vm.displayedIps.forEach(function(ip) {
            if(ip.id == $scope.selectedIp.id){
                ip.class = "";
            }
        });
        if(row.id == $scope.selectedIp.id && !$scope.select && !$scope.statusShow && !$scope.eventShow){
            $scope.selectedIp = {id: "", class: ""};
        } else {
            row.class = "selected";
            $scope.selectedIp = row;
        }
    };
    $scope.receiveSip = function(ips) {
        if(ips == []) {
            return;
        }
        ips.forEach(function(ip) {
            $http({
                method: 'POST',
                url: appConfig.djangoUrl+"ip-reception/"+ip.id+"/create-ip/",
                data: {
                    validators: vm.validatorModel
                }
            }).then(function(response) {
                $scope.includedIps = [];
                $scope.getListViewData();
                console.log(response)
            });
        });
    };
    $scope.includeIp = function(row) {
        $scope.statusShow = false;
        $scope.eventShow = false;
        var temp = true;
        $scope.includedIps.forEach(function(included) {

            if(included.id == row.id) {
                $scope.includedIps.splice($scope.includedIps.indexOf(row), 1);
                temp = false;
            }
        });
        if(temp) {
            $scope.includedIps.push(row);
        }
        if($scope.includedIps == []) {
            $scope.receiveShow = true;
        } else {
            $scope.receiveShow = false;
        }
    }
    $scope.getListViewData = function() {
        vm.callServer($scope.tableState);
    };
    var listViewInterval;
    function updateListViewConditional() {
        $interval.cancel(listViewInterval);
        listViewInterval = $interval(function() {
            var updateVar = false;
            vm.displayedIps.forEach(function(ip, idx) {
                if(ip.status < 100) {
                    if(ip.step_state != "FAILURE") {
                        updateVar = true;
                    }
                }
            });
            if(updateVar) {
                $scope.getListViewData();
            } else {
                $interval.cancel(listViewInterval);
                listViewInterval = $interval(function() {
                    var updateVar = false;
                    vm.displayedIps.forEach(function(ip, idx) {
                        if(ip.status < 100) {
                            if(ip.step_state != "FAILURE") {
                                updateVar = true;
                            }
                        }
                    });
                    if(!updateVar) {
                        $scope.getListViewData();
                    } else {
                        updateListViewConditional();
                    }

                }, appConfig.ipIdleInterval);
            }
        }, appConfig.ipInterval);
    };
    updateListViewConditional();
    $scope.ipTableClick = function(row) {
        $scope.ip = row;
        $scope.statusShow = false;
        $scope.eventShow = false;
        //$scope.fileListCollection = listViewService.getFileList(row);
    }
    $scope.deliveryDescription = $translate.instant('DELIVERYDESCRIPTION');
    $scope.submitDescription = $translate.instant('SUBMITDESCRIPTION');
    $scope.package = $translate.instant('PACKAGE');
    $scope.tabsEditView = [
        {
            label: $scope.submitDescription,
            templateUrl: "static/frontend/views/reception_delivery_description.html"
        },
        {
            label: $scope.package,
            templateUrl: "static/frontend/views/reception_package.html"
        }
    ];
    $scope.colspan = 9;
    $scope.yes = $translate.instant('YES');
    $scope.no = $translate.instant('NO');
    vm.validatorModel = {

    };
    vm.validatorFields = [
    {
        "templateOptions": {
            "type": "text",
            "label": $translate.instant('VALIDATEFILEFORMAT'),
            "options": [{name: $scope.yes, value: true},{name: $scope.no, value: false}],
        },
        "defaultValue": true,
        "type": "select",
        "key": "validate_file_format",
    },
    {
        "templateOptions": {
            "type": "text",
            "label": $translate.instant('VALIDATEXMLFILE'),
            "options": [{name: $scope.yes, value: true},{name: $scope.no, value: false}],
        },
        "defaultValue": true,
        "type": "select",
        "key": "validate_xml_file",
    },
    {
        "templateOptions": {
            "type": "text",
            "label": $translate.instant('VALIDATELOGICALPHYSICALREPRESENTATION'),
            "options": [{name: $scope.yes, value: true},{name: $scope.no, value: false}],
        },
        "defaultValue": true,
        "type": "select",
        "key": "validate_logical_physical_representation",
    },
    {
        "templateOptions": {
            "type": "text",
            "label": $translate.instant('VALIDATEINTEGRITY'),
            "options": [{name: $scope.yes, value: true},{name: $scope.no, value: false}],
        },
        "defaultValue": true,
        "type": "select",
        "key": "validate_integrity",
    }
    ];
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
            $scope.removeIp(ipObject);
        }, function () {
            $log.info('modal-component dismissed at: ' + new Date());
        });
    }
    //Remove and ip
    $scope.removeIp = function (ipObject) {
        $http({
            method: 'DELETE',
            url: appConfig.djangoUrl+"information-packages/"+ipObject.id
        }).then(function() {
            console.log("ip removed");
            vm.displayedIps.splice(vm.displayedIps.indexOf(ipObject), 1);
            $scope.edit = false;
            $scope.select = false;
            $scope.eventlog = false;
            $scope.eventShow = false;
            $scope.statusShow = false;

        });
    }
    $scope.editUnidentifiedIp = true;

    vm.modelUnidentifiedIp = {
        "archivist": "ESS",
        "creator": "Government X, Dep Y",
        "submitter_organization": "Government X, Archival Dep",
        "submitter_individual": "Gene Simmons",
        "producer_organization": "Government X system type",
        "producer_individual": "Government X, Service Dep",
        "ipowner": "Lita Ford",
        "preservation_organization": "Government X, Legal Dep",
        "systemname": "National Archives of X",
        "systemversion": "National Archives of X Version",
        "systemtype": "National Archives of X Type",
        "SUBMISSIONAGREEMENT": "RA 13-2011/5329; 2012-04-12",
        "STARTDATE": moment().format('YYYY-MM-DD'),
        "ENDDATE": moment().format('YYYY-MM-DD'),
        "LABEL": "Package label",
        "RECORDSTATUS": "NEW",
        "profile": "The profile"
    };

    vm.fieldsUnidentifiedIp = [
        //list all fields
    {
        "type": "input",
        "key": "archivist",
        "templateOptions": {
            "type": "text",
            "label": "Archivist Organization"
        }
    },
    {
        "type": "input",
        "key": "creator",
        "templateOptions": {
            "type": "text",
            "label": "Creator Organization"
        }
    },
    {
        "type": "input",
        "key": "submitter_organization",
        "templateOptions": {
            "type": "text",
            "label": "Submitter Organization"
        }
    },
    {
        "type": "input",
        "key": "submitter_individual",
        "templateOptions": {
            "type": "text",
            "label": "Submitter Individual"
        }
    },
    {
        "type": "input",
        "key": "producer_organization",
        "templateOptions": {
            "type": "text",
            "label": "Producer Organization"
        }
    },
    {
        "type": "input",
        "key": "producer_individual",
        "templateOptions": {
            "type": "text",
            "label": "Producer Individual"
        }
    },
    {
        "type": "input",
        "key": "ipowner",
        "templateOptions": {
            "type": "text",
            "label": "IP Owner Organization"
        }
    },
    {
        "type": "input",
        "key": "preservation_organization",
        "templateOptions": {
            "type": "text",
            "label": "Preservation Organization"
        }
    },
    {
        "type": "input",
        "key": "systemname",
        "templateOptions": {
            "type": "text",
            "label": "Archivist Software"
        }
    },
    {
        "type": "input",
        "key": "systemversion",
        "templateOptions": {
            "type": "text",
            "label": "Archivist Software Version"
        }
    },
    {
        "type": "input",
        "key": "systemtype",
        "templateOptions": {
            "type": "text",
            "label": "Archivist Software Type"
        }
    },
    {
        "type": "input",
        "key": "SUBMISSIONAGREEMENT",
        "templateOptions": {
            "type": "text",
            "label": "Submission Agreement"
        }
    },
    {
        "type": "datepicker",
        "key": "STARTDATE",
        "templateOptions": {
            "type": "text",
            "label": "Start date",
        }
    },
    {
        "type": "datepicker",
        "key": "ENDDATE",
        "templateOptions": {
            "type": "text",
            "label": "End date",
        }
    },
    {
        "type": "input",
        "key": "LABEL",
        "templateOptions": {
            "type": "text",
            "label": "Label"
        }
    },
    {
        "type": "input",
        "key": "RECORDSTATUS",
        "templateOptions": {
            "type": "text",
            "label": "Record Status"
        }
    },
    {
        "type": "input",
        "key": "profile",
        "templateOptions": {
            "type": "text",
            "label": "Profile"
        }
    },
    ];
    $scope.prepareUnidentifiedIp = false;
    $scope.showPrepareUnidentified = function(ip) {
        if(ip == $scope.ip) {
            $scope.prepareUnidentifiedIp = false;
        }else {
            $scope.ip = ip;
            $scope.prepareUnidentifiedIp = true;
            $scope.statusShow = false;
            $scope.eventShow = false;
        }
    }
$scope.identifyIpModal = function (ip) {
        $scope.unidentifiedIp = ip;
        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title',
            ariaDescribedBy: 'modal-body',
            templateUrl: 'static/frontend/views/identify_ip_modal.html',
            scope: $scope,
            size: 'lg',
            controller: 'ModalInstanceCtrl',
            controllerAs: '$ctrl'
        })
        modalInstance.result.then(function (data) {
            $scope.identifyIp($scope.unidentifiedIp);
        }, function () {
            $log.info('modal-component dismissed at: ' + new Date());
        });
    }

    $scope.identifyIp = function(ip) {
        console.log(vm.modelUnidentifiedIp);
        $http({
            method: 'POST',
            url: appConfig.djangoUrl+'ip-reception/identify-ip/',
            data: {
                label: ip.Label,
                specification_data: vm.modelUnidentifiedIp
            }
        }).then(function(response) {
            $scope.prepareUnidentifiedIp = false;
            $timeout(function(){
                $scope.getListViewData();
                updateListViewConditional();
            }, 1000);
        });
    };
});
