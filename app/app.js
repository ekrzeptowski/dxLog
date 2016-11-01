var app = angular.module('dxLog', ['ngResource', 'angucomplete-alt', 'ui.router', 'satellizer', 'ngFileUpload', 'ngMap', 'ngDialog']);

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
            .state('country', {
                url: '/country/:itu',
                templateUrl: 'partials/country.html',
                controller: 'SingleCountry'
            })
            .state('transmitter', {
                url: "/transmitter/:site",
                templateUrl: 'partials/transmitter.html',
                controller: 'SingleTransmitter'
            })
            .state('addlog', {
                url: '/addlog',
                templateUrl: 'partials/addlog.html',
                controller: 'NewLogForm',
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

						$urlRouterProvider.otherwise(function($injector, $location){
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

// rest service
app.factory('StationsService', function($resource) {
    var Api = "http://localhost:3000/api/";
    var messages = {};

    return {
        query: function(surl, afterf) {
            return $resource(Api + surl).query(function() {
                afterf
            });
        },
        messages: messages,
        post: function(data) {
            $resource(Api + "logs").save(data,
                function(resp, headers) {
                    //success callback
                    messages.success = "Item has been added successfully";
                },
                function(err) {
                    messages.error = "Error occured"
                });
        }
    }
});

app.service('ColorService', function() {
    this.set = function(source, dest) {
        angular.forEach(source, function(value, key) {
            if (dest.findIndex(function(x) {
                    return x.freq === source[key].freq
                }) == -1) {
                dest.push({
                    freq: source[key].freq
                });
            }
        });
        angular.forEach(dest, function(value, key) {
            if (key % 2 == 0) {
                dest[key].even = false;
            } else {
                dest[key].even = true;
            }
        });
    };

    this.filter = function(col, source, name) {
        if (col == "freq") {
            return source[source.findIndex(function(x) {
                return x.freq === name
            })].even;
        }
    }
});
app.filter('unique', function() {
    return function(collection, keyname) {
        var output = [],
            keys = [];

        angular.forEach(collection, function(item, keyname) {
            var key = item.location._id;
            if (keys.indexOf(key) === -1) {
                keys.push(key);
                output.push(item.location);
            }
        });
        return output;
    };
});

app.controller("MainCtrl", function($scope, $http, $filter, $resource, StationsService, ColorService, $sce) {
    // default sorting settings
    $scope.col = 'freq';
    $scope.reverse = false;
    $scope.ituFilter = {};
    $scope.setFilter = function(item) {
        $scope.ituFilter.itu = item;
    }
    $scope.freqs = [];

    // fetch data
    $scope.stations = StationsService.query("logs");
    $scope.stations.$promise.then(function() {
        $scope.total = $scope.stations.length;
        ColorService.set($scope.stations, $scope.freqs);
    });
    $scope.itus = StationsService.query("stats/itu");

    // set class service
    $scope.color = function(col, source, name) {
        return ColorService.filter(col, source, name);
    }

    // sort logic
    $scope.order = function(col) {
        $scope.reverse = ($scope.col === col || $scope.col[0] === col[0]) ? !$scope.reverse : false;
        $scope.col = col;
    };

    $scope.playAudio = function(file) {
        $scope.audio = file;
        $scope.audioUrl = $sce.trustAsResourceUrl("audio/" + file);
    }
});

app.controller("FreqStats", function($scope, StationsService) {
    // fetch data
    $scope.freqs = StationsService.query("stats/freq");
    $scope.max = 0;
    $scope.freqs.$promise.then(function() {
        $scope.max = Math.max.apply(Math, $scope.freqs.map(function(item) {
            return item.count;
        }));
    });

});

app.controller("SingleCountry", function($scope, $filter, $state, $stateParams, $location, StationsService, ColorService, $sce, NgMap) {
    // default sorting settings
    $scope.col = 'freq';
    $scope.reverse = false;

    $scope.freqs = [];

    // fetch data from Api
    $scope.stations = StationsService.query("itu/" + $stateParams.itu);
    $scope.stations.$promise.then(function() {
        var loc = $scope.stations[0].location;
        ColorService.set($scope.stations, $scope.freqs);
        $scope.itu = loc.itu;
        $scope.title = loc.country + " (" + loc.itu + ")";
        $scope.transmitters = $filter('unique')($scope.stations, "location._id");
    });

    $scope.rx = [49.34, 19.84];

    // map click function
    $scope.mapClick = function(aaa, url) {
        $state.go("transmitter", {
            site: url._id
        });
    };

    // set class service
    $scope.color = function(col, source, name) {
        return ColorService.filter(col, source, name);
    }

    $scope.playAudio = function(file) {
        $scope.audio = file;
        $scope.audioUrl = $sce.trustAsResourceUrl("audio/" + file);
    }

    //sort logic
    $scope.order = function(col) {
        $scope.reverse = ($scope.col === col || $scope.col[0] === col[0]) ? !$scope.reverse : false;
        $scope.col = col;
    };
});

app.controller("SingleStation", function($scope, $filter, $state, $stateParams, $location, StationsService, ColorService, $sce) {
    // default sorting settings
    $scope.col = 'freq';
    $scope.reverse = false;

    $scope.freqs = [];

    // fetch data from Api
    $scope.stations = StationsService.query("network/" + $stateParams.station);
    $scope.stations.$promise.then(function() {
        ColorService.set($scope.stations, $scope.freqs);
        $scope.title = $scope.stations[0].station;
    });

    $scope.rx = [49.34, 19.84];

    // map click function
    $scope.mapClick = function(aaa, url) {
        $state.go("transmitter", {
            site: url._id
        });
    };

    // set class service
    $scope.color = function(col, source, name) {
        return ColorService.filter(col, source, name);
    }

    $scope.playAudio = function(file) {
        $scope.audio = file;
        $scope.audioUrl = $sce.trustAsResourceUrl("audio/" + file);
    }

    //sort logic
    $scope.order = function(col) {
        $scope.reverse = ($scope.col === col || $scope.col[0] === col[0]) ? !$scope.reverse : false;
        $scope.col = col;
    };
});

app.controller("SingleTransmitter", function($scope, $filter, $stateParams, $location, StationsService, ColorService, $sce) {
    $scope.title = "";
    // default sorting settings
    $scope.col = 'freq';
    $scope.reverse = false;

    $scope.freqs = [];

    // fetch data from Api
    $scope.stations = StationsService.query("location/" + $stateParams.site);
    $scope.stations.$promise.then(function() {
        var loc = $scope.stations[0].location;
        $scope.transmitter = loc;
        ColorService.set($scope.stations, $scope.freqs);
        $scope.title = loc.site + ", " + loc.country + " (" + loc.qrb + "km)";
    });

    $scope.rx = [49.34, 19.84];

    // set class service
    $scope.color = function(col, source, name) {
        return ColorService.filter(col, source, name);
    }

    $scope.playAudio = function(file) {
        $scope.audio = file;
        $scope.audioUrl = $sce.trustAsResourceUrl("audio/" + file);
    }

    // sort logic
    $scope.order = function(col) {
        $scope.reverse = ($scope.col === col || $scope.col[0] === col[0]) ? !$scope.reverse : false;
        $scope.col = col;
    };
});

app.controller("NewLogForm", function($scope, StationsService, Upload, $timeout) {
    // vars setup
    $scope.formData = {};
    $scope.formData.location = {};
    $scope.formData.pol = "h";
    $scope.formData.firstLog = new Date();
    $scope.messages = StationsService.messages;
    $scope.stations = [];
    $scope.sites = [];

    // autocomplete click action
    $scope.selectedStation = function(selected) {
        $scope.formData.station = selected.title || selected.originalObject;
    };

    // autocomplete click action
    $scope.selectedTransmitter = function(selected) {
        var fD = $scope.formData.location;
        var oO = selected.originalObject;
        fD.site = selected.title || oO;
        if (selected.title) {
            fD.country = oO.country;
            fD.itu = oO.itu;
            fD.long = oO.long;
            fD.lat = oO.lat;
            fD.qrb = oO.qrb;
        }
    };
    // fetch autocomplete data from Api and push it to vars
    $scope.autocomplet = StationsService.query('autocomplete');
    $scope.autocomplet.$promise.then(function() {
        $scope.stations = $scope.autocomplet[0].stations;
        $scope.sites = $scope.autocomplet[0].transmitters;
    });

    // audio upload

    $scope.upload = function(file) {
        file.upload = Upload.upload({
            url: 'api/upload',
            data: {
                file: file
            },
        });

        file.upload.then(function(response) {
            $timeout(function() {
                file.result = response.data;
            });
        }, function(response) {
            if (response.status > 0)
                $scope.errorMsg = response.status + ': ' + response.data;
        }, function(evt) {
            // Math.min is to fix IE which reports 200% sometimes
            file.progress = Math.min(100, parseInt(100.0 * evt.loaded / evt.total));
        });
    };

    $scope.log = function() {
            console.log($scope.formData);
            console.log($scope.file);
        }
        // form send function
    $scope.sendForm = function() {
        if ($scope.file) {
            $scope.upload($scope.file);
            $scope.formData.audio = $scope.file.name;
        }
        StationsService.post($scope.formData);
    };

    // clear formData after page leave
    $scope.clearForm = function() {
        delete StationsService.messages.success;
        delete StationsService.messages.error;
        delete $scope.formData;
    }

    // CSVUserList parse function
    $scope.parseCSV = function() {

    };
});
