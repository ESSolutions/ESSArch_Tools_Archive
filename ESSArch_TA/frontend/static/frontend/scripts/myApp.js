angular.module('myApp', ['ngRoute', 'treeControl', 'ui.bootstrap', 'formly', 'formlyBootstrap', 'smart-table', 'treeGrid', 'ui.router', 'ngCookies', 'permission', 'pascalprecht.translate', 'ngSanitize', 'moment-picker'])
    .config(function($routeProvider, formlyConfigProvider, $stateProvider, $urlRouterProvider, $rootScopeProvider, $uibTooltipProvider) {
        $stateProvider
            .state('home', {
                url: '/',
                templateUrl: '/static/frontend/views/home.html',
            })
        .state('login', {
            url: '/login',
            templateUrl: '/static/frontend/views/login.html',
            controller: 'LoginCtrl as vm',
            resolve: {
                authenticated: ['djangoAuth', function(djangoAuth){
                    return djangoAuth.authenticationStatus();
                }],
            }
        })
        .state('logout', {
            url: '/logout',
            templateUrl: '/static/frontend/views/logout.html',
            controller: 'LogoutCtrl as vm',
            resolve: {
                authenticated: ['djangoAuth', function(djangoAuth){
                    return djangoAuth.authenticationStatus();
                }],
            }
        })
        .state('home.myPage', {
            url: 'my-page',
            templateUrl: '/static/frontend/views/my_page.html',
            resolve: {
                authenticated: ['djangoAuth', function(djangoAuth){
                    return djangoAuth.authenticationStatus();
                }],
            }
        })
        .state('home.info', {
            url: 'info',
            templateUrl: '/static/frontend/views/info_page.html',
            resolve: {
                authenticated: ['djangoAuth', function(djangoAuth){
                    return djangoAuth.authenticationStatus();
                }],
            }
        })
        .state('home.reception', {
            url: 'reception',
            templateUrl: '/static/frontend/views/receive_sip_reception.html',
            controller: 'ReceptionCtrl as vm',
            resolve: {
                authenticated: ['djangoAuth', function(djangoAuth){
                    return djangoAuth.authenticationStatus();
                }],
            }
        })
        .state('home.qualityControl', {
            url: 'quality-control',
            templateUrl: '/static/frontend/views/receive_sip_quality_control.html',
            controller: 'QualityControlCtrl as vm',
            resolve: {
                authenticated: ['djangoAuth', function(djangoAuth){
                    return djangoAuth.authenticationStatus();
                }],
            }
        })
        .state('home.catalogue', {
            url: 'catalogue',
            templateUrl: '/static/frontend/views/receive_sip_catalogue.html',
            controller: 'CatalogueCtrl as vm',
            resolve: {
                authenticated: ['djangoAuth', function(djangoAuth){
                    return djangoAuth.authenticationStatus();
                }],
            }
        })
        .state('home.transferSip', {
            url: 'transfer-SIP',
            templateUrl: '/static/frontend/views/receive_sip_transfer_sip.html',
            controller: 'TransferSipCtrl as vm',
            resolve: {
                authenticated: ['djangoAuth', function(djangoAuth){
                    return djangoAuth.authenticationStatus();
                }],
            }
        })
        .state('restricted', {
            url: '/restricted',
            templateUrl: '/static/frontend/views/restricted.html',
            controller: 'RestrictedCtrl as vm',
            resolve: {
                authenticated: ['djangoAuth', function(djangoAuth){
                    return djangoAuth.authenticationStatus();
                }],
            }
        })
        .state('authRequired', {
            url: '/auth-required',
            templateUrl: '/static/frontend/views/auth_required.html',
            controller: 'authRequiredCtrl as vm',
            resolve: {
                authenticated: ['djangoAuth', function(djangoAuth){
                    return djangoAuth.authenticationStatus();
                }],
            }
        });
        $urlRouterProvider.otherwise('info');
    })
.config(['$httpProvider', function($httpProvider, $rootScope) {
    $httpProvider.defaults.xsrfCookieName = 'csrftoken';
    $httpProvider.defaults.xsrfHeaderName = 'X-CSRFToken';
}])
.constant('appConfig', {
    djangoUrl: "/api/",
    ipInterval: 10000, //ms
    ipIdleInterval: 60000, //ms
    stateInterval: 10000, //ms
    eventInterval: 10000 //ms
})
.service('myService', function($location, PermPermissionStore) {
        this.changePath = function(state) {
            $state.go(state);
        };
        this.getPermissions = function(group){
            var permissions = group.permissions.map(function(currentValue){return currentValue.codename});
            PermPermissionStore.defineManyPermissions(permissions, function(permissionName) {
                return_.contains(permissions, permissionName);
            });
            return permissions;
        }
})
.config(function(stConfig) {
  stConfig.sort.delay = -1;
})
.run(function(djangoAuth, $rootScope, $state, $location, $cookies, PermPermissionStore, PermRoleStore, $http, myService, formlyConfig){
    function _defineProperty(obj, key, value) {
        if (key in obj) {
            Object.defineProperty(obj, key, {
                value: value,
                enumerable: true,
                configurable: true,
                writable: true
            });
        } else {
            obj[key] = value;
        }
        return obj;
    }

    formlyConfig.setType({
        name: 'input',
        templateUrl: 'static/frontend/views/form_template_input.html',
        overwriteOk: true
    });
    formlyConfig.setType({
        name: 'select-tree-edit',
        template: '<select class="form-control" ng-model="model[options.key]"><option value="" disabled hidden>Choose here</option></select>',
        wrapper: ['bootstrapLabel', 'bootstrapHasError'],
        defaultOptions: function defaultOptions(options) {
            /* jshint maxlen:195 */
            var ngOptions = options.templateOptions.ngOptions || "option[to.valueProp || 'value'] as option[to.labelProp || 'name'] group by option[to.groupProp || 'group'] for option in to.options";
            return {
                ngModelAttrs: _defineProperty({}, ngOptions, {
                    value: options.templateOptions.optionsAttr || 'ng-options'
                })
            };
        },

        apiCheck: function apiCheck(check) {
            return {
                templateOptions: {
                    options: check.arrayOf(check.object),
                    optionsAttr: check.string.optional,
                    labelProp: check.string.optional,
                    valueProp: check.string.optional,
                    groupProp: check.string.optional
                }
            };
        }
    });
    djangoAuth.initialize('/rest-auth', false).then(function() {

        djangoAuth.profile().then(function(data) {
            $rootScope.auth = data;
            data.groups.forEach(function(group){
                $http({
                    method: 'GET',
                    url: group
                }).then(function(response) {
                    PermRoleStore.defineRole(response.data.name, myService.getPermissions(response.data));
                }, function() {
                    console.log("error");
                });
            });
        }, function() {
            $state.go('login');
        });

        $rootScope.$on('$stateChangeStart', function (event, toState, toParams, fromState) {
            if (toState.name === 'login' ){
                return;
            }
            if(djangoAuth.authenticated !== true){
                event.preventDefault();
                $state.go('login'); // go to login
            }

            // now, redirect only not authenticated


        });
    }, function(status) {
        console.log("when not logged in");
        console.log(status);
    });
    $rootScope.$on('$stateChangeStart', function(evt, to, params) {
        if (to.redirectTo) {
            evt.preventDefault();
            $state.go(to.redirectTo, params, {location: 'replace'})
        }
    });

}).run(function(formlyConfig){
    var ngModelAttrs = {};

    var attributes = [
        'ng-model',
        'min-date',
        'max-date',
        'date-disabled',
        'day-format',
        'month-format',
        'year-format',
        'year-range',
        'day-header-format',
        'day-title-format',
        'month-title-format',
        'date-format',
        'date-options',
        'hour-step',
        'minute-step',
        'show-meridian',
        'meridians',
        'readonly-time',
        'readonly-date',
        'hidden-time',
        'hidden-date',
        'mousewheel',
        'show-spinners',
        'current-text',
        'clear-text',
        'close-text'
            ];

    var bindings = [
        'ng-model',
        'min-date',
        'max-date',
        'date-disabled',
        'day-format',
        'month-format',
        'year-format',
        'year-range',
        'day-header-format',
        'day-title-format',
        'month-title-format',
        'date-format',
        'date-options',
        'hour-step',
        'minute-step',
        'show-meridian',
        'readonly-time',
        'readonly-date',
        'hidden-time',
        'hidden-date'
            ];

    angular.forEach(attributes, function(attr) {
        ngModelAttrs[camelize(attr)] = {
            attribute: attr
        };
    });

    angular.forEach(bindings, function(binding) {
        ngModelAttrs[camelize(binding)] = {
            bound: binding
        };
    });

    function camelize(string) {
        string = string.replace(/[\-_\s]+(.)?/g,

                function(match, chr) {
                    return chr ? chr.toUpperCase() : '';
                });
        // Ensure 1st char is always lowercase
        return string.replace(/^([A-Z])/, function(match, chr) {
            return chr ? chr.toLowerCase() : '';
        });
    }

    formlyConfig.setType({
        name: 'datepicker',
        //template: '<input class="form-control" ng-model="ctrl.input" ng-model-options="{ updateOn: \'blur\' }" placeholder="Select a date..." moment-picker="ctrl.input">',
        templateUrl: "static/frontend/views/datepicker_template.html",// '<br><datetimepicker ng-model="model[options.key]" show-spinners="true" date-format="M/d/yyyy" date-options="dateOptions" show-meridian="false"></datetimepicker>',
        wrapper: ['bootstrapLabel'],
        defaultOptions: {
            ngModelAttrs: ngModelAttrs,
            templateOptions: {
                label: 'Time'
            }
        }
    });
    moment.locale('sv');
});
