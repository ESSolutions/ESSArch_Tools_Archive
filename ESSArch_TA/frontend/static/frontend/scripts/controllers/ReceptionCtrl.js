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

angular.module('myApp').controller('ReceptionCtrl', function(IPReception, $http, $scope, $rootScope, $state, $log, listViewService, Resource, $translate, appConfig, $interval, $uibModal, $timeout, $anchorScroll, PermPermissionStore, $cookies, $controller) {
    var vm = this;
    var ipSortString = "Receiving";
    $controller('BaseCtrl', { $scope: $scope, vm: vm, ipSortString: ipSortString });

    $scope.includedIps = [];
    $scope.receiveShow = false;
    $scope.validateShow = false;

    /*******************************************/
    /*Piping and Pagination for List-view table*/
    /*******************************************/
    var ctrl = this;
    vm.displayedIps = [];

    //Get data according to ip table settings and populates ip table
    vm.callServer = function callServer(tableState) {
        $scope.ipLoading = true;
        if(vm.displayedIps.length == 0) {
            $scope.initLoad = true;
        }
        if(!angular.isUndefined(tableState)) {
            $scope.tableState = tableState;

            var sorting = tableState.sort;
            var pagination = tableState.pagination;
            var start = pagination.start || 0;     // This is NOT the page number, but the index of item in the list that you want to use to display the table.
            var number = pagination.number || vm.itemsPerPage;  // Number of entries showed per page.
            var pageNumber = start/number+1;

            Resource.getReceptionIps(start, number, pageNumber, tableState, $scope.includedIps, sorting).then(function (result) {
                vm.displayedIps = result.data;
                tableState.pagination.numberOfPages = result.numberOfPages;//set the number of pages so the pagination can update
                $scope.ipLoading = false;
                $scope.initLoad = false;
            }).catch(function(response) {
                if(response.status == 404) {
                    var filters = angular.extend({
                        state: ipSortString
                    }, $scope.columnFilters)

                    if(vm.workarea) {
                        filters.workarea = vm.workarea;
                    }

                    listViewService.checkPages("reception", number, filters).then(function (result) {
                        tableState.pagination.numberOfPages = result.numberOfPages;//set the number of pages so the pagination can update
                        tableState.pagination.start = (result.numberOfPages*number) - number;
                        vm.callServer(tableState);
                    });
                }
            });
        }
    };
    $scope.receiveDisabled = false;
    $scope.receiveSip = function(ips, sa) {
        $scope.receiveDisabled = true;
        if(ips == []) {
            return;
        }
        ips.forEach(function(ip) {
            var payload = {
                id: ip.id,
            }
            if(sa && sa != null) {
                payload.submission_agreement = sa.id;
            }
            IPReception.receive(payload).$promise.then(function(response) {
                $scope.includedIps = [];
                $timeout(function() {
                    $scope.getListViewData();
                    vm.updateListViewConditional();
                }, 1000);
                $scope.edit = false;
                $scope.select = false;
                $scope.eventShow = false;
                $scope.statusShow = false;
                $scope.filebrowser = false;
                $scope.receiveDisabled = false;
                $anchorScroll();
            }, function(response) {
                $scope.receiveDisabled = false;
            });
        });
    };
    $scope.filebrowserClick = function (ip) {
        if ($scope.filebrowser && $scope.ip == ip) {
            $scope.filebrowser = false;
            if(!$scope.select && !$scope.edit && !$scope.statusShow && !$scope.eventShow) {
                $scope.ip = null;
                $rootScope.ip = null;
            }
        } else {
            if (!ip.responsible) {
                $scope.filebrowser = true;
                if(!ip.url) {
                    ip.url = appConfig.djangoUrl + "ip-reception/" + ip.id + "/";
                }
                $scope.ip = ip;
                $rootScope.ip = ip;
            }
        }
    }
    $scope.includeIp = function(row) {
        $scope.statusShow = false;
        $scope.eventShow = false;
        var temp = true;
        $scope.includedIps.forEach(function(included, index, array) {

            if(included.id == row.id) {
                $scope.includedIps.splice(index, 1);
                temp = false;
            }
        });
        if(temp) {
            $scope.includedIps.push({ id: row.id });
        }
        if($scope.includedIps == []) {
            $scope.receiveShow = true;
        } else {
            $scope.receiveShow = false;
        }
    }

    $scope.ipTableClick = function(row) {
        $scope.statusShow = false;
        $scope.eventShow = false;
        if($scope.edit && $scope.ip == row) {
            $scope.edit = false;
            $scope.ip = null;
            $rootScope.ip = null;
            $scope.filebrowser = false;
        } else {
            vm.sdModel = {};
            if(row.state == "At reception") {
                $scope.ip = row;
                $rootScope.ip = row;
                $scope.buildSdForm(row);
                $scope.getFileList(row);
                $scope.edit = true;
                if($scope.filebrowser && !$scope.ip.url) {
                    $scope.ip.url = appConfig.djangoUrl + "ip-reception/" + $scope.ip.id + "/";
                }
            } else {
                $scope.edit = false;
                $scope.ip = null;
                $rootScope.ip = null;
            }
        }
    }

    vm.uncheckAll = function() {
        $scope.includedIps = [];
        vm.displayedIps.forEach(function(row) {
            row.checked = false;
        });
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
    $scope.yes = $translate.instant('YES');
    $scope.no = $translate.instant('NO');

    vm.sdModel = {};
    vm.sdFields = [
        {
            "templateOptions": {
                "type": "text",
                "label": "Start date",
                "disabled": true
            },
            "type": "input",
            "key": "start_date",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": "End date",
                "disabled": true
            },
            "type": "input",
            "key": "end_date",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": "Archivist Organization",
                "disabled": true
            },
            "type": "input",
            "key": "archivist_organization",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": "Creator",
                "disabled": true
            },
            "type": "input",
            "key": "creator",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": "Submitter Organization",
                "disabled": true
            },
            "type": "input",
            "key": "submitter_organization",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": "Submitter Individual",
                "disabled": true
            },
            "type": "input",
            "key": "submitter_individual",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": "Producer Organization",
                "disabled": true
            },
            "type": "input",
            "key": "producer_organization",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": "Producer Individual",
                "disabled": true
            },
            "type": "input",
            "key": "producer_individual",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": "IP owner",
                "disabled": true
            },
            "type": "input",
            "key": "ip_owner",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": "Preservation Organization",
                "disabled": true
            },
            "type": "input",
            "key": "preservation_organization",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": "System Name",
                "disabled": true
            },
            "type": "input",
            "key": "system_name",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": "System Version",
                "disabled": true
            },
            "type": "input",
            "key": "system_version",
        },
        {
            "templateOptions": {
                "type": "text",
                "label": "System Type",
                "disabled": true
            },
            "type": "input",
            "key": "system_type",
        }
    ];
    $scope.buildSdForm = function(ip) {
        vm.sdModel = {
            "start_date": ip.start_date,
            "end_date": ip.end_date,
            "archivist_organization": ip.archivist_organization.name,
            "creator": ip.creator_organization,
            "submitter_organization": ip.submitter_organization,
            "submitter_individual": ip.submitter_individual,
            "producer_organization": ip.producer_organization,
            "producer_individual": ip.producer_individual,
            "ip_owner": ip.ipowner_organization,
            "preservation_organization": ip.preservation_organization,
            "system_name": ip.system_name,
            "system_version": ip.system_version,
            "system_type": ip.system_type
        };
    };
    $scope.getFileList = function(ip) {
        var array = [];
        var tempElement = {
            filename: ip.object_path,
            created: ip.create_date,
            size: ip.object_size
        };
        array.push(tempElement);
        $scope.fileListCollection = array;
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
        IPReception.identify({
                filename: ip.label,
                specification_data: vm.modelUnidentifiedIp
        }).$promise.then(function(response) {
            $scope.prepareUnidentifiedIp = false;
            $timeout(function(){
                $scope.getListViewData();
                vm.updateListViewConditional();
            }, 1000);
        });
    };
    vm.receiveModal = function (ip) {
        IPReception.get({id: ip.id }).$promise.then(function(resource) {
            $http.get(appConfig.djangoUrl + "submission-agreements").then(function(response) {
                var data = {
                    ip: ip.id,
                    validators: vm.validators(),
                    submissionAgreements: response.data
                }
                if(resource.altrecordids && resource.altrecordids.SUBMISSIONAGREEMENT) {
                    angular.extend(data, {sa: resource.altrecordids.SUBMISSIONAGREEMENT[0]})
                }
                var modalInstance = $uibModal.open({
                    animation: true,
                    ariaLabelledBy: 'modal-title',
                    ariaDescribedBy: 'modal-body',
                    templateUrl: 'static/frontend/views/receive_modal.html',
                    scope: $scope,
                    controller: 'ReceiveModalInstanceCtrl',
                    controllerAs: '$ctrl',
                    resolve: {
                        data: data
                    }
                })
                modalInstance.result.then(function (data) {
                    $scope.includedIps.shift();
                    $scope.getListViewData();
                    if($scope.includedIps.length > 0) {
                        vm.receiveModal($scope.includedIps[0]);
                    }
                }, function () {
                    $log.info('modal-component dismissed at: ' + new Date());
                });
            })
        })
    }
});
