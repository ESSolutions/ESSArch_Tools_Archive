angular
  .module('essarch.controllers')
  .controller('ConfirmReceiveCtrl', function(
    IPReception,
    Notifications,
    $uibModalInstance,
    data,
    $scope,
    $controller
  ) {
    var $ctrl = this;
    $ctrl.receiving = false;
    if (data) {
      $ctrl.data = data;
    }
    $ctrl.receive = function(ip) {
      var payload = {
        id: ip.id,
      };
      if ($ctrl.data.sa && $ctrl.data.sa != null) {
        payload.submission_agreement = $ctrl.data.sa.id;
      }
      $ctrl.receiving = true;
      IPReception.receive(payload)
        .$promise.then(function(response) {
          $ctrl.receiving = false;
          $uibModalInstance.close();
        })
        .catch(function(response) {
          $ctrl.receiving = false;
          $scope.receiveDisabled = false;
        });
    };

    $ctrl.cancel = function() {
      $uibModalInstance.dismiss('cancel');
    };
  });
