angular.module('essarch.controllers').controller('DataModalInstanceCtrl', function ($uibModalInstance, djangoAuth, IP, $scope, data, $http, appConfig, Notifications, $uibModal, $log, $translate) {
    var $ctrl = this;
    $ctrl.data = data;
    if(data.vm) {
        var vm = data.vm;
    }
    $ctrl.workareaRemove = true;
    $ctrl.receptionRemove = true;
    $ctrl.file = data.file;
    $ctrl.type = data.type;
    $ctrl.fullscreenActive = false;

    // Show fullscreen validation message
    $ctrl.showFullscreenMessage = function() {
        $ctrl.fullscreenActive = true;
        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title',
            ariaDescribedBy: 'modal-body',
            templateUrl: 'static/frontend/views/validation_fullscreen_message.html',
            controller: 'DataModalInstanceCtrl',
            controllerAs: '$ctrl',
            windowClass: 'fullscreen-modal',
            resolve: {
                data: {
                    validation: $ctrl.data.validation
                }
            }
        })
        modalInstance.result.then(function (data) {
            $ctrl.fullscreenActive = false;
        }, function () {
            $ctrl.fullscreenActive = false;
            $log.info('modal-component dismissed at: ' + new Date());
        });
    }
    $ctrl.ok = function () {
        $uibModalInstance.close();
    };

    // Transform IP
    $ctrl.transform = function() {
        $http.post(appConfig.djangoUrl + "workarea-entries/" + $ctrl.data.ip.workarea.id+"/transform/", {transformer: $ctrl.data.transformer}).then(function(response) {
            Notifications.add(response.data, "success");
            $uibModalInstance.close(response.data);
        }).catch(function(response) {
            if(![401, 403, 500, 503].includes(response.status)) {
                if(response.data && response.data.detail) {
                    Notifications.add(response.data.detail, "error");
                } else {
                    Notifications.add($translate('UNKNOWN_ERROR'), 'error')
                }
            }
        })
    }

    // Transfer IP
    $ctrl.transfer = function (ip) {
        $ctrl.transferring = true;
        IP.transfer({
            id: ip.id
        }).$promise.then(function(response) {
            $ctrl.transferring = false;
            $uibModalInstance.close();
        }).catch(function(response) {
            $ctrl.transferring = false;
            if(![401, 403, 500, 503].includes(response.status)) {
                if(response.data && response.data.detail) {
                    Notifications.add(response.data.detail, "error");
                } else {
                    Notifications.add($translate('UNKNOWN_ERROR'), 'error')
                }
            }
        });
    }

    $ctrl.cancel = function () {
        $uibModalInstance.dismiss('cancel');
    };

    // Remove IP
    $ctrl.remove = function (ipObject, workarea, reception) {
        $ctrl.removing = true;
        IP.delete({ id: ipObject.id }, { workarea: workarea, reception: reception }).$promise.then(function() {
            Notifications.add("IP " + ipObject.label + " Removed!", 'success');
            $ctrl.removing = false;
            $uibModalInstance.close();
    }).catch(function(response) {
            $ctrl.removing = false;
            if(![401, 403, 500, 503].includes(response.status)) {
                if(response.data && response.data.detail) {
                    Notifications.add(response.data.detail, "error");
                } else {
                    Notifications.add($translate('UNKNOWN_ERROR'), 'error')
                }
            }
        })
    };
});
