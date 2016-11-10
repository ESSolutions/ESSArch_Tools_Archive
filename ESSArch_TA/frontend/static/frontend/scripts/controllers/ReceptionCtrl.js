angular.module('myApp').controller('ReceptionCtrl', function($http, $scope, $rootScope, $state, $log, listViewService, Resource, $translate, appConfig, $interval) {
    $rootScope.$on('$translateChangeSuccess', function () {
        $state.reload()
    });
    $rootScope.$on('$stateChangeStart', function() {
        $interval.cancel(listViewInterval);
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
    $scope.selected = [];
    $scope.selectIp = function(row) {
        if(row.class == "selected"){
            row.class = "";
            $scope.selected.forEach(function(ip, idx) {
                if(ip.id === row.id){
                    $scope.selected.splice(idx,1);
                }

            });
            console.log($scope.selected);
        } else {
            row.class = "selected";
            $scope.selected.push(row);
            console.log($scope.selected);
       }
    };
    $scope.receiveSip = function(ips) {
        ips.forEach(function(ip) {
            $http({
                method: 'POST',
                url: appConfig.djangoUrl+"ip-reception/"+ip.id+"/create-ip/"
            }).then(function(response) {
                $scope.getListViewData();
                console.log(response)
            });
        });
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
