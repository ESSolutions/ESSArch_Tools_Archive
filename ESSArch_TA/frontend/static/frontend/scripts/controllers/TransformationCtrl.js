angular.module('myApp').controller('TransformationCtrl', function($scope, $controller, Resource, listViewService, TopAlert, $http, $sce, $rootScope, $cookies, $timeout, appConfig, $uibModal, $window) {
    var vm = this;
    var ipSortString ="";
    $controller('BaseCtrl', { $scope: $scope, vm: vm, ipSortString: ipSortString });
    vm.workarea = "ingest";
    var watchers=[];
    $scope.$on('$stateChangeStart', function () {
        watchers.forEach(function(watcher) {
            watcher();
        });
    });

    $scope.ipTableClick = function(row) {
        if($scope.select && $scope.ip.id== row.id){
            $scope.select = false;
            $scope.ip = null;
            $rootScope.ip = null;
            $scope.filebrowser = false;
        } else {
            $scope.ip = row;
            $rootScope.ip = row;
            $scope.select = true;
        }
        $scope.eventShow = false;
        $scope.statusShow = false;
    };

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

            Resource.getWorkareaIps(vm.workarea, start, number, pageNumber, tableState, sorting, search, $scope.expandedAics, $scope.columnFilters).then(function (result) {
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

                    listViewService.checkPages("workspace", number, filters).then(function (result) {
                        tableState.pagination.numberOfPages = result.numberOfPages;//set the number of pages so the pagination can update
                        tableState.pagination.start = (result.numberOfPages*number) - number;
                        vm.callServer(tableState);
                    });
                }
            });
        }
    };

    // Filebrowser
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
                $scope.deckGridInit($scope.ip);
            }
        }
    }

    $scope.previousGridArrays = [];
    $scope.ip = $rootScope.ip;
    $scope.listView = false;
    $scope.gridView = true;
    $scope.useListView = function() {
        $scope.filesPerPage = $cookies.get("files-per-page") || 50;
        $scope.listView = true;
        $scope.gridView = false;
    }

    $scope.useGridView = function() {
        $scope.filesPerPage = $cookies.get("files-per-page") || 50;
        $scope.listView = false;
        $scope.gridView = true;
    }

    $scope.filesPerPage = $cookies.get("files-per-page") || 50;
    $scope.changeFilesPerPage = function(filesPerPage) {
        $cookies.put("files-per-page", filesPerPage, { expires: new Date("Fri, 31 Dec 9999 23:59:59 GMT") });
    }
    $scope.previousGridArraysString = function () {
        var retString = "";

        $scope.previousGridArrays.forEach(function (card) {
            retString = retString.concat(card.name, "/");
        });
        return retString;
    }
    $scope.deckGridData = [];
    $scope.dirPipe = function(tableState) {
        $scope.gridArrayLoading = true;
        if ($scope.deckGridData.length == 0) {
            $scope.initLoad = true;
        }
        if (!angular.isUndefined(tableState)) {
            $scope.fileTableState = tableState;
            var pagination = tableState.pagination;
            var start = pagination.start || 0;     // This is NOT the page number, but the index of item in the list that you want to use to display the table.
            var number = pagination.number || vm.filesPerPage;  // Number of entries showed per page.
            var pageNumber = start / number + 1;
            listViewService.getWorkareaDir("ingest", $scope.ip.object_identifier_value + "/" + $scope.previousGridArraysString(), pageNumber, number).then(function(dir) {
                $scope.deckGridData = dir.data;
                tableState.pagination.numberOfPages = dir.numberOfPages;//set the number of pages so the pagination can update
                $scope.gridArrayLoading = false;
                $scope.initLoad = false;
            })
        }
    }
    $scope.deckGridInit = function (ip) {
        $scope.previousGridArrays = [];
        if($scope.fileTableState) {
            $scope.dirPipe($scope.fileTableState);
            $scope.selectedCards = [];
        }
    };

    $scope.previousGridArray = function () {
        $scope.previousGridArrays.pop();
        if($scope.fileTableState) {
            $scope.dirPipe($scope.fileTableState);
            $scope.selectedCards = [];
        }
    };
    $scope.gridArrayLoading = false;
    $scope.updateGridArray = function (ip) {
        if($scope.fileTableState) {
            $scope.dirPipe($scope.fileTableState);
        }
    };
    $scope.expandFile = function (ip, card) {
        if (card.type == "dir" || card.name.endsWith('.tar') || card.name.endsWith('.zip')) {
            $scope.previousGridArrays.push(card);
            if($scope.fileTableState) {
                $scope.fileTableState.pagination.start = 0;
                $scope.dirPipe($scope.fileTableState);
                $scope.selectedCards = [];
            }
        } else {
            $scope.getFile(card);
        }
    };
    $scope.selectedCards = [];
    $scope.cardSelect = function (card) {

        if (includesWithProperty($scope.selectedCards, "name", card.name)) {
            $scope.selectedCards.splice($scope.selectedCards.indexOf(card), 1);
        } else {
            $scope.selectedCards.push(card);
        }
    };

    function includesWithProperty(array, property, value) {
        for (i = 0; i < array.length; i++) {
            if (array[i][property] === value) {
                return true;
            }
        }
        return false;
    }

    $scope.createFolder = function (folderName) {
        var folder = {
            "type": "dir",
            "name": folderName
        };
        var fileExists = false;
        $scope.deckGridData.forEach(function (chosen, index) {
            if (chosen.name === folder.name) {
                fileExists = true;
                folderNameExistsModal(index, folder, chosen);
            }
        });
        if (!fileExists) {
            listViewService.addNewWorkareaFolder("ingest", $scope.ip.object_identifier_value + "/" + $scope.previousGridArraysString(), folder)
                .then(function (response) {
                    $scope.updateGridArray();
                });
        }
    }

    $scope.getFile = function (file) {
        file.content = $sce.trustAsResourceUrl(appConfig.djangoUrl + "workarea-files/?type=ingest&path=" + $scope.ip.object_identifier_value + "/" + $scope.previousGridArraysString() + file.name);
        $window.open(file.content, '_blank');
    }
    function folderNameExistsModal(index, folder, fileToOverwrite) {
        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title',
            ariaDescribedBy: 'modal-body',
            templateUrl: 'static/frontend/views/folder-exists-modal.html',
            scope: $scope,
            controller: 'OverwriteModalInstanceCtrl',
            controllerAs: '$ctrl',
            resolve: {
                data: function () {
                    return {
                        file: folder,
                        type: fileToOverwrite.type
                    };
                }
            },
        })
        modalInstance.result.then(function (data) {
            listViewService.deleteWorkareaFile("ingest", $scope.ip.object_identifier_value + "/" + $scope.previousGridArraysString(), fileToOverwrite)
                .then(function () {
                    listViewService.addNewFolder($scope.ip, $scope.ip.object_identifier_value + "/" + $scope.previousGridArraysString(), folder)
                        .then(function () {
                            $scope.updateGridArray();
                        });
                })
        });
    }
    $scope.newDirModal = function () {
        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title',
            ariaDescribedBy: 'modal-body',
            templateUrl: 'static/frontend/views/new-dir-modal.html',
            scope: $scope,
            controller: 'ModalInstanceCtrl',
            controllerAs: '$ctrl',
        })
        modalInstance.result.then(function (data) {
            $scope.createFolder(data.dir_name);
        });
    }
    $scope.removeFiles = function () {
        $scope.selectedCards.forEach(function (file) {
            listViewService.deleteWorkareaFile("ingest", $scope.ip.object_identifier_value + "/" + $scope.previousGridArraysString(), file)
                .then(function () {
                    $scope.updateGridArray();
                });
        });
        $scope.selectedCards = [];
    }
    $scope.isSelected = function (card) {
        var cardClass = "";
        $scope.selectedCards.forEach(function (file) {
            if (card.name == file.name) {
                cardClass = "card-selected";
            }
        });
        return cardClass;
    };
    $scope.getFileExtension = function (file) {
        return file.name.split(".").pop().toUpperCase();
    }

    $scope.removeIpModal = function (ipObject) {
        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title',
            ariaDescribedBy: 'modal-body',
            templateUrl: 'static/frontend/views/remove-workarea-ip-modal.html',
            controller: 'ModalInstanceCtrl',
            controllerAs: '$ctrl'
        })
        modalInstance.result.then(function (data) {
            $scope.removeIp(ipObject);
        }, function () {
            $log.info('modal-component dismissed at: ' + new Date());
        });
    }
    // Remove ip
    $scope.removeIp = function (ipObject, workarea, reception) {
        if (ipObject.package_type == 1) {
            ipObject.information_packages.forEach(function (ip) {
                $scope.removeIp(ip);
            });
        } else {
            $http.delete(appConfig.djangoUrl + "workarea-entries/" + ipObject.workarea.id + "/")
                .then(function () {
                    $scope.edit = false;
                    $scope.select = false;
                    $scope.eventlog = false;
                    $scope.eventShow = false;
                    $scope.statusShow = false;
                    $scope.filebrowser = false;
                    $scope.requestForm = false;
                    if (vm.displayedIps.length == 0) {
                        $state.reload();
                    }
                    $scope.getListViewData();
                });
        }
    }

    vm.transform = function(ip) {
        $http.post(appConfig.djangoUrl + "workarea-entries/" + ip.workarea.id+"/transform/").then(function(response) {
            $scope.getListViewData();
        });
    }
});
