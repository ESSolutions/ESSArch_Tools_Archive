angular.module('myApp').controller('ReceptionCtrl', function($http, $scope, $rootScope, $state, $log, listViewService, Resource, $translate, appConfig, $interval, $uibModal) {
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
        },
        {
            field: "progress",
            displayName: $scope.status,
            cellTemplate: "<uib-progressbar ng-click=\"taskStepUndo(row.branch)\" class=\"progress\" value=\"row.branch[col.field]\" type=\"success\"><b>{{row.branch[col.field]+\"%\"}}</b></uib-progressbar>"
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
            $scope.getListViewData();
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
        "agentname1": "ESS",
        "agentname2": "HR Employed",
        "agentname3": "5.0.34",
        "agentname4": "Noark 5",
        "agentname5": "Government X, Dep Y",
        "agentname6": "Government X, Archival Dep",
        "agentname7": "Gene Simmons",
        "agentname8": "Government X system type",
        "agentname9": "Government X, Service Dep",
        "agentname10": "Lita Ford",
        "agentname11": "Government X, Legal Dep",
        "agentname12": "National Archives of X",
        "SUBMISSIONAGREEMENT": "RA 13-2011/5329; 2012-04-12",
        "STARTDATE": "2012-01-01",
        "ENDDATE": "2012-12-30",
        "MetsLABEL": "Package label",
        "MetsHdrRECORDSTATUS": "NEW"
    };

    vm.fieldsUnidentifiedIp = [
        //list all fields
    {
        "type": "input",
        "key": "agentname1",
        "templateOptions": {
            "type": "text",
            "label": "Archivist Organization"
        }
    },
    {
        "type": "input",
        "key": "agentname2",
        "templateOptions": {
            "type": "text",
            "label": "Archivist Software"
        }
    },
    {
        "type": "input",
        "key": "agentname3",
        "templateOptions": {
            "type": "text",
            "label": "Archivist Software"
        }
    },
    {
        "type": "input",
        "key": "agentname4",
        "templateOptions": {
            "type": "text",
            "label": "Archivist Software"
        }
    },
    {
        "type": "input",
        "key": "agentname5",
        "templateOptions": {
            "type": "text",
            "label": "Creator Organization"
        }
    },
    {
        "type": "input",
        "key": "agentname6",
        "templateOptions": {
            "type": "text",
            "label": "Producer Organization"
        }
    },
    {
        "type": "input",
        "key": "agentname7",
        "templateOptions": {
            "type": "text",
            "label": "Producer Individual"
        }
    },
    {
        "type": "input",
        "key": "agentname8",
        "templateOptions": {
            "type": "text",
            "label": "Producer Software"
        }
    },
    {
        "type": "input",
        "key": "agentname9",
        "templateOptions": {
            "type": "text",
            "label": "Submitter Organization"
        }
    },
    {
        "type": "input",
        "key": "agentname10",
        "templateOptions": {
            "type": "text",
            "label": "Submitter Individual"
        }
    },
    {
        "type": "input",
        "key": "agentname11",
        "templateOptions": {
            "type": "text",
            "label": "IPOwner Individual"
        }
    },
    {
        "type": "input",
        "key": "agentname12",
        "templateOptions": {
            "type": "text",
            "label": "Preservation Organization"
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
        "type": "input",
        "key": "STARTDATE",
        "templateOptions": {
            "type": "text",
            "label": "Start data"
        }
    },
    {
        "type": "input",
        "key": "ENDDATE",
        "templateOptions": {
            "type": "text",
            "label": "End date"
        }
    },
    {
        "type": "input",
        "key": "MetsLABEL",
        "templateOptions": {
            "type": "text",
            "label": "Mets Label"
        }
    },
    {
        "type": "input",
        "key": "MetsHdrRECORDSTATUS",
        "templateOptions": {
            "type": "text",
            "label": "Record Status"
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
            url: appConfig.djangoUrl+'information-packages/'+ip.Label+'/identify-ip/',
            data: {specification_data: vm.modelUnidentifiedIp}
        }).then(function(response) {
            $scope.prepareUnidentifiedIp = false;
            $timeout(function(){
                $scope.getListViewData();
                $scope.updateListViewConditional();
            }, 1000);
        });
    };
});
