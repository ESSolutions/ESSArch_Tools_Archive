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

angular
  .module('essarch.controllers')
  .controller('ModalInstanceCtrl', function($uibModalInstance, djangoAuth, $scope, $http, appConfig, $translate) {
    var $ctrl = this;
    $ctrl.error_messages_old = [];
    $ctrl.error_messages_pw1 = [];
    $ctrl.error_messages_pw2 = [];
    $ctrl.tracebackCopied = false;
    $ctrl.copied = function() {
      $ctrl.tracebackCopied = true;
    };
    $ctrl.idCopied = false;
    $ctrl.idCopyDone = function() {
      $ctrl.idCopied = true;
    };
    $ctrl.save = function() {
      $ctrl.data = {
        name: $ctrl.profileName,
      };
      $uibModalInstance.close($ctrl.data);
    };
    $ctrl.prepare = function() {
      $ctrl.data = {
        label: $ctrl.label,
      };
      $uibModalInstance.close($ctrl.data);
    };
    $ctrl.receive = function() {
      $ctrl.data = {
        ip: $scope.displayedIps,
        sa: $ctrl.sa,
      };
      $uibModalInstance.close($ctrl.data);
    };
    $ctrl.lock = function() {
      $ctrl.data = {
        status: 'locked',
      };
      $uibModalInstance.close($ctrl.data);
    };
    $ctrl.lockSa = function() {
      $ctrl.data = {
        status: 'locked',
      };
      $uibModalInstance.close($ctrl.data);
    };
    $ctrl.remove = function() {
      $ctrl.data = {
        workarea: $ctrl.workareaRemove,
        reception: $ctrl.receptionRemove,
      };
      $uibModalInstance.close($ctrl.data);
    };
    $ctrl.prepareUnidentified = function() {
      $ctrl.data = {
        status: 'prepared',
      };
      $uibModalInstance.close($ctrl.data);
    };
    $ctrl.changePassword = function() {
      djangoAuth.changePassword($ctrl.pw1, $ctrl.pw2, $ctrl.oldPw).then(
        function(response) {
          $uibModalInstance.close($ctrl.data);
        },
        function(error) {
          $ctrl.error_messages_old = error.old_password || [];
          $ctrl.error_messages_pw1 = error.new_password1 || [];
          $ctrl.error_messages_pw2 = error.new_password2 || [];
        }
      );
    };
    $ctrl.cancel = function() {
      $uibModalInstance.dismiss('cancel');
    };
  });
