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

angular.module('myApp').controller('WorkareaCtrl', function(IP, $http, $scope, $rootScope, $state, $log, listViewService, Resource, $translate, $interval, $uibModal, appConfig, $timeout, $anchorScroll, PermPermissionStore, $cookies, $controller, $sce, $window, TopAlert, WorkareaValidation, $filter,  $q) {
    var vm = this;
    var ipSortString ="";
    $controller('BaseCtrl', { $scope: $scope, vm: vm, ipSortString: ipSortString });
    vm.workarea = "ingest";
    var watchers=[];
    $scope.$on('$stateChangeStart', function () {
        $interval.cancel(validationInterval);
        watchers.forEach(function(watcher) {
            watcher();
        });
    });
    $scope.$on('REFRESH_LIST_VIEW', function (event, data) {
        if($scope.ip != null && $scope.select) {
            vm.validationPipe(vm.validationTableState);
        }
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
            vm.expandedRows = [];
            vm.validationPipe(vm.validationTableState);
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

    /*
     * Validation
     */

    vm.expandedRows = [];

    vm.collapseExpandRow = function(row) {
        if(row.collapsed) {
            vm.expandRow(row);
        } else {
            vm.collapseRow(row);
        }
    }
    vm.expandRow = function (row) {
        WorkareaValidation.getChildren(row, $scope.ip).then(function (children) {
            row.collapsed = false;
            row.children = children;
            vm.expandedRows.push({ filename: row.filename });
        })
    }

    vm.collapseRow = function(row) {
        row.collapsed = true;
        vm.expandedRows.forEach(function(x, idx, array) {
            if(x.id == row.id) {
                array.splice(idx, 1);
            }
        })
    }

    $scope.validationLoading = false;
    vm.validationsPerPage = 10;
    vm.validate = function(ip) {
        $http({
            method: "POST",
            url: appConfig.djangoUrl + "workarea-entries/" + ip.workarea.id + "/validate/",
            data: {
                validators: vm.validators()
            }
        }).then(function(response) {
            TopAlert.add(response.data, "success");
            vm.validationPipe(vm.validationTableState);
        }).catch(function(response) {
            TopAlert.add(response.data.detail, "error");
        })
    }

    var validationInterval = $interval(function() {
        vm.validationPipe(vm.validationTableState);
    }, appConfig.ipInterval);

    vm.validationFilters = {};

    vm.validations = [];

    vm.validationPipe = function (tableState) {
        if (tableState) {
            $scope.validationLoading = true;
            vm.validationTableState = tableState;
            var pagination = tableState.pagination;
            var start = pagination.start || 0;     // This is NOT the page number, but the index of item in the list that you want to use to display the table.
            var number = pagination.number;  // Number of entries showed per page.
            var pageNumber = start / number + 1;
            WorkareaValidation.getValidationsForIp($scope.ip, pageNumber, number, vm.validationFilters).then(function (response) {
                var promises = [];
                response.data.forEach(function (val) {
                    val.collapsed = true;
                    vm.expandedRows.forEach(function(x) {
                        if(x.filename == val.filename) {
                            val.collapsed = false;
                            promises.push(
                                WorkareaValidation.getChildren(val, $scope.ip).then(function (children) {
                                    val.children = children;
                                })
                            )
                        }
                    })
                });
                $q.all(promises).then(function() {
                    vm.validations = response.data;
                    vm.numberOfResults = response.count;
                    tableState.pagination.numberOfPages = response.numberOfPages;//set the number of pages so the pagination can update
                    $scope.validationLoading = false;
                })
            });
        }
    }
    vm.validationStatusMessage = function (row) {
        switch (row.passed) {
            case true:
                return "SUCCESS";
            case false:
                return "FAILURE";
            case null:
                return "INPROGRESS";
        };
    }

    vm.showValidationResult = function(validation) {
        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title',
            ariaDescribedBy: 'modal-body',
            templateUrl: 'static/frontend/views/validation_result_modal.html',
            controller: 'DataModalInstanceCtrl',
            size: "lg",
            controllerAs: '$ctrl',
            resolve: {
                data: {
                    validation: validation
                }
            }
        })
        modalInstance.result.then(function (data) {
        }, function () {
            $log.info('modal-component dismissed at: ' + new Date());
        });
    }
});
