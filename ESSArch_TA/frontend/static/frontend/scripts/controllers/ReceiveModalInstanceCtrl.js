angular
  .module('essarch.controllers')
  .controller('ReceiveModalInstanceCtrl', function(
    $uibModalInstance,
    djangoAuth,
    data,
    $scope,
    IPReception,
    $translate,
    Notifications,
    $uibModal,
    $log
  ) {
    var $ctrl = this;
    var vm = data.vm;
    $scope.profileEditor = true;
    $scope.receiveDisabled = false;
    $scope.ip = data.ip;
    $scope.$on('disable_receive', function() {
      $scope.receiveDisabled = true;
    });
    $scope.$on('update_ip', function(event, data) {
      var temp = angular.copy($scope.ip);
      $scope.ip = data.ip;
      vm.updateCheckedIp({id: temp.id}, $scope.ip);
    });
    $ctrl.$onInit = function() {
      $ctrl.data = data;
      $ctrl.file = data.file;
      $ctrl.type = data.type;
      if ($ctrl.data.sa) {
        $ctrl.data.submissionAgreements.forEach(function(sa) {
          if (sa.id == $ctrl.data.sa) {
            $ctrl.sa = sa;
            $ctrl.saDisabled = true;
          }
        });
      }

      if (angular.isUndefined($ctrl.sa)) {
        $ctrl.receiveSaError = $translate.instant('CANNOT_RECEIVE_ERROR');
        $ctrl.saDisabled = true;
      }
    };
    var checkProfileTypes = function(ip, types) {
      if (types instanceof Array) {
        return types.every(function(x) {
          return ip[x] != null;
        });
      } else {
        return ip[types] != null;
      }
    };
    $ctrl.approvedToReceive = function() {
      var saCheck = $scope.ip.submission_agreement && $scope.ip.submission_agreement_locked;
      var profileCheck = checkProfileTypes($scope.ip, [
        'profile_transfer_project',
        'profile_submit_description',
        'profile_sip',
        'profile_preservation_metadata',
      ]);
      return saCheck && profileCheck;
    };
    $ctrl.getProfileData = function($event) {};

    $ctrl.confirmReceiveModal = function(ip) {
      var modalInstance = $uibModal.open({
        animation: true,
        ariaLabelledBy: 'modal-title',
        ariaDescribedBy: 'modal-body',
        templateUrl: 'static/frontend/views/confirm_receive_modal.html',
        controller: 'ConfirmReceiveCtrl',
        controllerAs: '$ctrl',
        resolve: {
          data: {
            ip: ip,
            sa: $ctrl.sa,
          },
        },
      });
      modalInstance.result
        .then(function(data) {
          $uibModalInstance.close({status: 'received'});
        })
        .catch(function() {
          $log.info('modal-component dismissed at: ' + new Date());
        });
    };

    $ctrl.skip = function() {
      $ctrl.data = {
        status: 'skip',
      };
      $uibModalInstance.close($ctrl.data);
    };
    $ctrl.cancel = function() {
      $uibModalInstance.dismiss('cancel');
    };
  });
