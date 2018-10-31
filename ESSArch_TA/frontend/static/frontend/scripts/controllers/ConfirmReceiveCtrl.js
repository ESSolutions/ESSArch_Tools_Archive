angular.module('essarch.controllers').controller('ConfirmReceiveCtrl', function (IPReception, Notifications, $uibModalInstance, data, $scope, $controller, $translate) {
    var $ctrl = this;
    $ctrl.receiving = false;
    if(data) {
        $ctrl.data = data;
    }
    $ctrl.receive = function (ip) {
        var payload = {
            id: ip.id,
        }
        if($ctrl.data.sa && $ctrl.data.sa != null) {
            payload.submission_agreement = $ctrl.data.sa.id;
        }
        $ctrl.receiving = true;
        IPReception.receive(payload).$promise.then(function(response) {
            $ctrl.receiving = false;
            $uibModalInstance.close();
        }).catch(function(response) {
            $ctrl.receiving = false;
            $scope.receiveDisabled = false;
            if(![401, 403, 500, 503].includes(response.status)) {
                if(response.data && response.data.detail) {
                    Notifications.add(response.data.detail, "error");
                } else {
                    Notifications.add($translate('UNKNOWN_ERROR'), 'error')
                }
            }
        });
    };

    $ctrl.cancel = function () {
        $uibModalInstance.dismiss('cancel');
    };
})
