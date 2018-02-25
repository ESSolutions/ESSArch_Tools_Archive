angular.module('myApp').component('profileEditor', {
  templateUrl: 'static/frontend/views/profile_editor.html',
  controller: 'ProfileCtrl',
  controllerAs: 'vm',
  bindings: {
    ip: '<',
    sa: '<',
    shareData: '&'
  }
});
