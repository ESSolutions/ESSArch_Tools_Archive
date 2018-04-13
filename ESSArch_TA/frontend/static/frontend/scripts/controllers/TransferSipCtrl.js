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

angular.module('myApp').controller('TransferSipCtrl', function(IP, $http, $scope, $rootScope, $state, $log, listViewService, Resource, $translate, $interval, $uibModal, appConfig, $timeout, $anchorScroll, PermPermissionStore, $cookies, $controller, Notifications) {
    var vm = this;
    var ipSortString = "Received,Transformed,Transferring,Transferred";
    $controller('BaseCtrl', { $scope: $scope, vm: vm, ipSortString: ipSortString });
    vm.info = {
        text: "",
        values: null,
        visible: false
    };
    $scope.transferDisabled = false;
    $scope.ipTableClick = function(row) {
        if($scope.select && $scope.ip.id== row.id){
            vm.info.visible = false;
            $scope.select = false;
            $scope.ip = null;
            $rootScope.ip = null;
            $scope.filebrowser = false;
        } else {
            $scope.transferDisabled = false;
            $scope.ip = row;
            $rootScope.ip = row;
            vm.info.visible = false;
            $scope.select = true;
            if(row.state == "Transferred" || row.state == "Transferring") {
                vm.info = {
                    text: "IP_IS_ALREADY_" + row.state.toUpperCase(),
                    values: {
                        label: row.label
                    },
                    visible: true
                };
                $scope.transferDisabled = true;
            } else if(row.profile_transformation != null && row.state != 'Transformed') {
                vm.info = {
                    text: "HAS_TRANSFORMATION_PROFILE_NOT_TRANSFORMED",
                    values: {
                        label: row.label
                    },
                    visible: true
                };
                $scope.transferDisabled = true;
            }
        }
        $scope.eventShow = false;
        $scope.statusShow = false;
    };

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
            templateUrl: "static/frontend/views/reception_delivery_description.html"
        },
    ];
    vm.transferModal = function (ips) {
        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title',
            ariaDescribedBy: 'modal-body',
            templateUrl: 'static/frontend/views/transfer_sip_modal.html',
            scope: $scope,
            controller: 'DataModalInstanceCtrl',
            controllerAs: '$ctrl',
            resolve: {
                data: {
                    ip: $scope.ip
                }
            }
        })
        modalInstance.result.then(function (data) {
            $scope.transferDisabled = true;
            $scope.select = false;
            $timeout(function () {
                $scope.getListViewData();
                vm.updateListViewConditional();
            }, 1000);
            $scope.transferDisabled = false;
        });
    }
});
