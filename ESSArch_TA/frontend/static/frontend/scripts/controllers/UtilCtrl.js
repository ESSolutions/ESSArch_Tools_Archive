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
  .controller('UtilCtrl', function(
    $scope,
    $state,
    $location,
    $window,
    $http,
    appConfig,
    Notifications,
    permissionConfig,
    myService,
    $timeout,
    $anchorScroll
  ) {
    $scope.angular = angular;
    $scope.$state = $state;
    $scope.reloadPage = function() {
      $state.reload();
    };
    $scope.showAlert = function() {
      Notifications.toggle();
    };
    $scope.checkPermissions = function(page) {
      // Check if there is a sub state that does not require permissions
      if (nestedEmptyPermissions(Object.resolve(page, permissionConfig))) {
        return true;
      }
      var permissions = nestedPermissions(Object.resolve(page, permissionConfig));
      return myService.checkPermissions(permissions);
    };
    $scope.navigateToState = function(state) {
      $state.go(state);
      $scope.focusRouterView();
    };

    var enter = 13;
    var space = 32;

    var stateChangeListeners = [];
    function resetStateListeners() {
      stateChangeListeners.forEach(function(listener) {
        listener();
      });
      stateChangeListeners = [];
    }

    /**
     * Handle keydown events navigation
     * @param {Event} e
     */
    $scope.navKeydownListener = function(e, state) {
      switch (e.keyCode) {
        case space:
        case enter:
          event.preventDefault();
          stateChangeListeners.push(
            $scope.$on('$stateChangeSuccess', function(event, toState, toParams, fromState) {
              event.preventDefault();
              if (state == 'home.workarea') {
                $scope.focusWorkareaSubmenu();
              } else if (state.match(/home\.workarea/)) {
                $scope.focusWorkareaRouterView();
              } else {
                $scope.focusRouterView();
              }
              resetStateListeners();
            })
          );
          $state.go(state);
          break;
      }
    };
    $scope.focusRouterView = function() {
      $timeout(function() {
        var elm = document.getElementsByClassName('dynamic-part')[0];
        elm.focus();
        $anchorScroll();
      });
    };
    $scope.focusWorkareaSubmenu = function() {
      $timeout(function() {
        var elm = document.getElementsByClassName('workspace-sub-menu')[0];
        angular.element(elm)[0].children[0].focus();
        $anchorScroll();
      });
    };
    $scope.focusWorkareaRouterView = function() {
      $timeout(function() {
        var elm = document.getElementsByClassName('workarea-route')[0];
        angular.element(elm)[0].focus();
        $anchorScroll();
      });
    };
  });
