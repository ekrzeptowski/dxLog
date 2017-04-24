'use strict';



function routeConfig($urlRouterProvider, $locationProvider, $authProvider, $mdAriaProvider) {
    'ngInject';



    $urlRouterProvider.otherwise(function($injector, $location) {
        var state = $injector.get('$state');
        state.go('pageError');
        return $location.path();
    });

    $locationProvider.html5Mode(true).hashPrefix('');

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

    $mdAriaProvider.disableWarnings();

}

export default angular
    .module('index.routes', [])
    .config(routeConfig);
