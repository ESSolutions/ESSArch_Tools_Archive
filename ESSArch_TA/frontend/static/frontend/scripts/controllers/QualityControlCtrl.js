/*
    ESSArch is an open source archiving and digital preservation system

    ESSArch Tools for Archive (ETA)
    Copyright (C) 2005-2017 ES Solutions AB

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program. If not, see <http://www.gnu.org/licenses/>.

    Contact information:
    Web - http://www.essolutions.se
    Email - essarch@essolutions.se
*/

angular.module('myApp').controller('QualityControlCtrl', function($http, $scope, $rootScope, $state, $log, listViewService, Resource, $translate, $interval, $uibModal) {
    /*
     * Status view data
     */

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
             stateInterval = $interval(function(){$scope.statusViewUpdate($scope.ip)}, 10000);
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
        var expandedNodes = [];
        if($scope.tree_data != []) {
            expandedNodes = checkExpanded($scope.tree_data);
        }
        listViewService.getTreeData(row, expandedNodes).then(function(value) {
            $scope.tree_data = value;
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
            $scope.statusNoteCollection = value;
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
    $scope.tableState = tableState;
        var sorting = tableState.sort;
        var pagination = tableState.pagination;
        var start = pagination.start || 0;     // This is NOT the page number, but the index of item in the list that you want to use to display the table.
        var number = pagination.number || ctrl.itemsPerPage;  // Number of entries showed per page.
        var pageNumber = start/number+1;

        Resource.getIpPage(start, number, pageNumber, tableState, $scope.selectedIp, sorting).then(function (result) {
            ctrl.displayedIps = result.data;
            tableState.pagination.numberOfPages = result.numberOfPages;//set the number of pages so the pagination can update
        });
    };
    //Make ip selected and add class to visualize
    vm.displayedIps=[];
    $scope.selectIp = function(row) {
        vm.displayedIps.forEach(function(ip) {
            if(ip.id == $scope.selectedIp.id){
                ip.class = "";
            }
        });
        if(row.id == $scope.selectedIp.id){
            $scope.selectedIp = {id: "", class: ""};
        } else {
            row.class = "selected";
            $scope.selectedIp = row;
        }
    };
    $scope.getListViewData = function() {
        vm.callServer($scope.tableState);
    };
    var listViewInterval;
    function updateListViewConditional() {
        $interval.cancel(listViewInterval);
        listViewInterval = $interval(function() {
            $scope.getListViewData();
        }, 4000);
    };
    updateListViewConditional();
    $scope.ipTableClick = function(row) {
        $scope.ip = row;
        $scope.statusShow = false;
        $scope.eventShow = false;
        $scope.validateShow = !$scope.validateShow;
    }
    $scope.validateSip = function(ip) {
        $http({
            method: 'POST',
            url: ip.url+"validate/",
            data: {validators: vm.validatorModel}
        }).then(function(response) {
            $scope.getListViewData();
        });
    }

            $scope.packageDescription = $translate.instant('PACKAGEDESCRIPTION');
            $scope.contentDescription = $translate.instant('CONTENTDESCRIPTION');
            $scope.authorityInformation = $translate.instant('AUTHORITYINFORMATION');
            $scope.archivalDescription = $translate.instant('ARCHIVALDESCRIPTION');
            $scope.manageContent = $translate.instant('MANAGECONTENT');

    $scope.tabsEditView = [
        {
            label: $scope.packageDescription,
            templateUrl: 'static/frontend/views/reception_delivery_description.html'
        },
        {
            label: $scope.contentDescription,
            templateUrl: "static/frontend/views/reception_package.html"
        },
        {
            label: $scope.authorityInformation,
            templateUrl: "static/frontend/views/reception_package.html"
        },
        {
            label: $scope.archivalDescription,
            templateUrl: "static/frontend/views/reception_package.html"
        },
        {
            label: $scope.managecontent,
            templateUrl: "static/frontend/views/reception_package.html"
        }
    ];
    $scope.colspan = 6;

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
});
