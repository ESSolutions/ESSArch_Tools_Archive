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

angular.module('myApp').controller('TransferSipCtrl', function($http, $scope, $rootScope, $state, $log, listViewService, Resource, $translate, $interval, $uibModal, appConfig, $timeout, $anchorScroll, PermPermissionStore, $cookies, $controller) {
    var vm = this;
    var ipSortString = "Received,Transferring,Transferred";
    $controller('BaseCtrl', { $scope: $scope, vm: vm, ipSortString: ipSortString });

    $scope.ipTableClick = function(row) {
        if($scope.select && $scope.ip.id== row.id){
            $scope.select = false;
            $scope.ip = null;
            $rootScope.ip = null;
        } else {
            $scope.ip = row;
            $rootScope.ip = row;
            $scope.select = true;
            $scope.transferDisabled = false;
        }
        $scope.eventShow = false;
        $scope.statusShow = false;
    };


    $scope.transferDisabled = false;
    $scope.transferSip = function(ip) {
        $scope.transferDisabled = true;
        $http({
            method: 'POST',
            url: ip.url+"transfer/"
        }).then(function(response) {
            $scope.select = false;
            $timeout(function() {
                $scope.getListViewData();
                vm.updateListViewConditional();
            }, 1000);
            $scope.transferDisabled = false;
        }, function(response) {
            $scope.transferDisabled = false;
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
            templateUrl: "static/frontend/views/reception_delivery_description.html"
        },
    ];
});
