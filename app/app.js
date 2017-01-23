var app = angular.module('dxLog', ['ngResource', 'ui.router', 'satellizer', 'ngFileUpload', 'ngMap', 'ngDialog']);

app.config(function($stateProvider, $urlRouterProvider, $locationProvider, $authProvider) {
        $stateProvider
            .state('index', {
                url: '/',
                templateUrl: 'partials/main.html',
                controller: 'MainCtrl'
            })
            .state('station', {
                url: '/station/:station',
                templateUrl: 'partials/main.html',
                controller: 'MainCtrl'
            })
            .state('country', {
                url: '/country/:itu',
                templateUrl: 'partials/main.html',
                controller: 'MainCtrl'
            })
            .state('transmitter', {
                url: "/transmitter/:transmitter",
                templateUrl: 'partials/main.html',
                controller: 'MainCtrl'
            })
            .state('newlog', {
                url: '/newlog',
                templateUrl: 'partials/newlog.html',
                controller: 'UserlistBrowser',
                resolve: {
                    loginRequired: loginRequired
                }
            })
            .state('stats', {
                url: '/stats',
                templateUrl: 'partials/stats.html',
                controller: 'FreqStats'
            })
            .state('login', {
                url: '/login',
                templateUrl: 'partials/login.html',
                controller: 'LoginCtrl',
                resolve: {
                    skipIfAuthenticated: skipIfAuthenticated
                }
            })
            .state('signup', {
                url: '/signup',
                templateUrl: 'partials/signup.html',
                controller: 'SignupCtrl',
                resolve: {
                    skipIfAuthenticated: skipIfAuthenticated
                }
            })
            .state('account', {
                url: '/account',
                templateUrl: 'partials/profile.html',
                controller: 'ProfileCtrl',
                resolve: {
                    loginRequired: loginRequired
                }
            })
            .state('forgot', {
                url: '/forgot',
                templateUrl: 'partials/forgot.html',
                controller: 'ForgotCtrl',
                resolve: {
                    skipIfAuthenticated: skipIfAuthenticated
                }
            })
            .state('reset', {
                url: '/reset/:token',
                templateUrl: 'partials/reset.html',
                controller: 'ResetCtrl',
                resolve: {
                    skipIfAuthenticated: skipIfAuthenticated
                }
            })
            .state('404', {
                // no url defined
                template: '<div>Page not found</div>',
            });

        $urlRouterProvider.otherwise(function($injector, $location) {
            var state = $injector.get('$state');
            state.go('404');
            return $location.path();
        });

        $locationProvider.html5Mode(true);

        $authProvider.loginUrl = '/login';
        $authProvider.signupUrl = '/signup';

        function skipIfAuthenticated($location, $auth) {
            if ($auth.isAuthenticated()) {
                $location.path('/');
            }
        }

        function loginRequired($location, $auth) {
            if (!$auth.isAuthenticated()) {
                $location.path('/login');
            }
        }


    })
    .run(function($rootScope, $window) {
        if ($window.localStorage.user) {
            $rootScope.currentUser = JSON.parse($window.localStorage.user);
        }
    });
