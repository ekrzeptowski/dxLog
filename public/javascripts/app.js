var app = angular.module('dxLog', ['ngResource', 'ui.router', 'satellizer']);

app.config(function($stateProvider, $urlRouterProvider, $locationProvider, $authProvider) {
    $stateProvider
        .state('index', {
            url: '/',
            templateUrl: 'partials/main.html',
            controller: 'MainCtrl'
        })
        .state('station', {
            url: '/station/:station',
            templateUrl: 'partials/station.html',
            controller: 'SingleStation'
        })
        .state('logge', {
            url: '/logge',
            templateUrl: 'partials/logge.html',
            controller: 'MainCtrl'
        })
        .state('transmitter', {
            url: '/transmitter/:site',
            templateUrl: 'partials/transmitter.html',
            controller: 'SingleTransmitter'
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
          url: '/reset/:token'
            templateUrl: 'partials/reset.html',
            controller: 'ResetCtrl',
            resolve: {
                skipIfAuthenticated: skipIfAuthenticated
            }
        })
        .otherwise({
            templateUrl: 'partials/404.html'
        });
    $locationProvider.html5Mode(true);
});

app.factory('StationsService', function($resource) {
    var Api = "http://dx.jkrzeptowski.pl:3000/api/";
    return {
        query: function(surl, afterf) {
            return $resource(Api + surl).query(function() {
                afterf
            });

        }
    }
});

app.controller("MainCtrl", function($scope, $http, $filter, $resource, StationsService) {
    $scope.stations = StationsService.query("logs");
    console.log($scope.stations);
    $scope.propertyName = 'freq';
    $scope.reverse = false;

    $scope.order = function(propertyName) {
        $scope.reverse = ($scope.propertyName === propertyName) ? !$scope.reverse : false;
        $scope.propertyName = propertyName;
    };
});

app.controller("SingleStation", function($scope, $http, $filter, $resource, $state, $stateParams, $location, StationsService) {
    $scope.stations = StationsService.query("network/" + $stateParams.station);
    $scope.stations.$promise.then(function() {
        $scope.title = $scope.stations[0].station;
        var loc = $scope.stations[0].location;
        map_init(loc.itu);
        angular.forEach($scope.stations, function(value, key) {
            var loc = $scope.stations[key].location;
            marker(loc.long, loc.lat, loc.site, loc._id);
        });
        map_show(loc.itu);

    });
    $scope.navob = function(url) {
        $state.go("transmitter", {
            site: url
        });
    };
    console.log($scope.stations);
    $scope.propertyName = 'freq';
    $scope.reverse = false;

    $scope.order = function(propertyName) {
        $scope.reverse = ($scope.propertyName === propertyName) ? !$scope.reverse : false;
        $scope.propertyName = propertyName;
    };
});

app.controller("SingleTransmitter", function($scope, $http, $filter, $resource, $stateParams, $location, StationsService) {
    $scope.title = "";
    $scope.stations = StationsService.query("location/" + $stateParams.site);
    $scope.stations.$promise.then(function() {
        var loc = $scope.stations[0].location;
        $scope.title = loc.site + ", " + loc.country + " (" + $scope.stations[0].qrb + "km)";
        map_init(loc.itu);
        marker(loc.long, loc.lat, loc.site, loc._id);
        map_show(loc.itu);
    });
    $scope.navob = function(url) {
        $location.url(url);
    };
    $scope.propertyName = 'freq';
    $scope.reverse = false;

    $scope.order = function(propertyName) {
        $scope.reverse = ($scope.propertyName === propertyName) ? !$scope.reverse : false;
        $scope.propertyName = propertyName;
    };
});
