angular.module('myApp').controller('ReceptionCtrl', function($http, $scope, $rootScope, $state, $log, listViewService, Resource, $translate, appConfig) {
    $rootScope.$on('$translateChangeSuccess', function () {
        $state.reload()
    });
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
        var number = pagination.number;  // Number of entries showed per page.
        var pageNumber = start/number+1;

        Resource.getReceptionIps(start, number, pageNumber, tableState, $scope.selectedIp, sorting).then(function (result) {
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
        if(row.id == $scope.selectedIp.id && !$scope.select && !$scope.statusShow && !$scope.eventShow){
            $scope.selectedIp = {id: "", class: ""};
        } else {
            row.class = "selected";
            $scope.selectedIp = row;
        }
    };
    $scope.createIp = function(ip) {
        $http({
            method: 'POST',
            url: appConfig.djangoUrl+"ip-reception/"+ip.id+"/create-ip/"
        }).then(function(response) {
            console.log(response)
        });
    };
    $scope.ipTableClick = function(row) {
        $scope.ip = row;
        $scope.fileListCollection = listViewService.getFileList(row);
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
    $scope.colspan = 6;
});
