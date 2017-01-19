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
                templateUrl: 'partials/main.html',
                controller: 'MainCtrl'
            })
            .state('country', {
                url: '/country/:itu',
                templateUrl: 'partials/main.html',
                controller: 'MainCtrl'
            })
            .state('transmitter', {
                url: "/transmitter/:site",
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
    app.filter('startFrom', function() {
        return function(input, start) {
            return input.slice(start);
    };
  });
// rest service
app.factory('StationsService', function($resource, $cacheFactory) {
    var Api = "http://localhost:3000/api/";
    var messages = {};

    return {
        query: function(surl, afterf) {
            return $resource(Api + surl, {}, {
                query: {
                    isArray: true,
                    cache: true,
                    method: 'GET'
                }
            }).query(function() {
                afterf;
            });
        },
        messages: messages,
        post: function(data) {
            $resource(Api + "logs").save(data,
                function(resp, headers) {
                    // success callback
                    messages.success = "Item has been successfully added";
                    // clean cache after adding new item
                    $cacheFactory.get('$http').removeAll();
                },
                function(err) {
                    messages.error = "Error occured";
                });
        },
        put: function(data) {
            $resource(Api + "logs", {}, {
                update: {
                    method: 'PUT'
                }
            }).update(data,
                function(resp, headers) {
                    // success callback
                    messages.success = "Item has been successfully modified";
                    // clean cache after modifying item
                    $cacheFactory.get('$http').removeAll();
                },
                function(err) {
                    messages.error = "Error occured";
                });
        }
    };
});

app.service('ColorService', function() {
    this.set = function(source, dest) {
        angular.forEach(source, function(value, key) {
            if (dest.findIndex(function(x) {
                    return x.freq === source[key].freq;
                }) == -1) {
                dest.push({
                    freq: source[key].freq
                });
            }
        });
        angular.forEach(dest, function(value, key) {
            if (key % 2 === 0) {
                dest[key].even = false;
            } else {
                dest[key].even = true;
            }
        });
    };

    this.filter = function(col, source, name) {
        if (col == "freq") {
            return source[source.findIndex(function(x) {
                return x.freq === name;
            })].even;
        }
    };
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

app.filter('round', function () {
	return function (value, mult, dir) {
		dir = dir || 'nearest';
		mult = mult || 1;
		value = !value ? 0 : Number(value);
		if (dir === 'up') {
			return Math.ceil(value / mult) * mult;
		} else if (dir === 'down') {
			return Math.floor(value / mult) * mult;
		} else {
			return Math.round(value / mult) * mult;
		}
	};
});

app.controller("MainCtrl", function($scope, $http, $filter, $state, $stateParams, $auth, $resource, StationsService, ColorService, $sce, NgMap, ngDialog) {
    // default sorting settings
    $scope.col = 'freq';
    $scope.reverse = false;
    $scope.ituFilter = {};
    $scope.setFilter = function(item) {
        $scope.ituFilter.itu = item;
    };
    $scope.freqs = [];

    $scope.rx = [49.34, 19.84];

    $scope.state = $state;

    $scope.isAuthenticated = function() {
        return $auth.isAuthenticated();
    };

    $scope.editLog = function(entry) {
        ngDialog.open({
            template: 'partials/logform.html',
            controller: 'LogForm',
            closeByNavigation: true,
            className: 'ngdialog-theme-plain',
            data: {
                editMode: true,
                entry
            }
        });
    };

    $scope.url = function() {
        var url;
        switch ($state.current.name) {
            case "index":
                url = "logs";
                break;
            case "station":
                url = "network/" + $stateParams.station;
                break;
            case "country":
                url = "itu/" + $stateParams.itu;
                break;
            case "transmitter":
                url = "location/" + $stateParams.site;
                break;
            default:
                break;
        }
        return url;
    };

    // fetch data
    $scope.stations = StationsService.query($scope.url());
    $scope.stations.$promise.then(function() {
        $scope.total = $scope.stations.length;
        ColorService.set($scope.stations, $scope.freqs);
        var loc;
        switch ($state.current.name) {
            case "country":
                loc = $scope.stations[0].location;
                $scope.itu = loc.itu;
                $scope.title = loc.country + " (" + loc.itu + ")";
                // filter unique transmitters
                $scope.transmitters = $filter('unique')($scope.stations, "location._id");
                break;
            case "station":
                $scope.title = $scope.stations[0].station;
                $scope.transmitters = [];
                angular.forEach($scope.stations, function(val, index) {
                    $scope.transmitters.push(val.location);
                });
                break;
            case "transmitter":
                loc = $scope.stations[0].location;
                $scope.transmitter = loc;
                $scope.title = loc.site + ", " + loc.country + " (" + loc.qrb + "km)";
                break;
            default:
                break;
        }
    });
    switch ($state.current.name) {
        case "index":
            $scope.itus = StationsService.query("stats/itu");
            break;
        default:
            break;
    }

    // map click function
    $scope.mapClick = function(aaa, url) {
        $state.go("transmitter", {
            site: url._id
        });
    };

    // set class service
    $scope.color = function(col, source, name) {
        return ColorService.filter(col, source, name);
    };

    // sort logic
    $scope.order = function(col) {
        $scope.reverse = ($scope.col === col || $scope.col[0] === col[0]) ? !$scope.reverse : false;
        $scope.col = col;
    };

    $scope.playAudio = function(file) {
        $scope.audio = file;
        $scope.audioUrl = $sce.trustAsResourceUrl("audio/" + file);
    };
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

app.controller("UserlistBrowser", function($scope, StationsService, ngDialog, NgMap, filterFilter) {
    $scope.itus = StationsService.query("userlist/itus");

    $scope.distance = function(lat1, lon1, lat2, lon2) {
        const deg2rad = 0.017453292519943295; // === Math.PI / 180
        var cos = Math.cos;
        lat1 *= deg2rad;
        lon1 *= deg2rad;
        lat2 *= deg2rad;
        lon2 *= deg2rad;
        var a = (
            (1 - cos(lat2 - lat1)) +
            (1 - cos(lon2 - lon1)) * cos(lat1) * cos(lat2)
        ) / 2;

        return 12742 * Math.asin(Math.sqrt(a)); // Diameter of the earth in km (2 * 6371)
    };

    $scope.currentPage = 0;
    $scope.pageSize = 50;
    $scope.setCurrentPage = function(currentPage) {
        $scope.currentPage = currentPage;
    }

    $scope.getNumberAsArray = function(num) {
        return new Array(num);
    };



    var map, infoWindow, bounds;
    var markers = [];

    // map config
    var mapOptions = {
        center: new google.maps.LatLng(50, 2),
        zoom: 4,
        mapTypeId: google.maps.MapTypeId.TERRAIN,
        scrollwheel: false
    };

    // init the map
    function initMap() {
        if (map === void 0) {
            map = new google.maps.Map(document.getElementById('transmap'), mapOptions);
        }
    }

    // place a marker
    function setMarker(map, position, title, content) {
        var marker;
        var markerOptions = {
            position: position,
            map: map,
            title: title,
            icon: {
                url: 'tx.png'
            }
        };
        marker = new google.maps.Marker(markerOptions);
        markers.push(marker); // add marker to array

        google.maps.event.addListener(marker, 'click', function() {
            // close window if not undefined
            if (infoWindow !== void 0) {
                infoWindow.close();
            }
            // create new window
            var infoWindowOptions = {
                content: content
            };
            infoWindow = new google.maps.InfoWindow(infoWindowOptions);
            infoWindow.open(map, marker);
        });

        bounds.extend(marker.getPosition());
    }

    function map_clear() {
        bounds = new google.maps.LatLngBounds();
        for (var i = 0; i < markers.length; i++) {
            markers[i].setMap(null);
        }
        markers.length = 0;
    }

    // show the map and place some markers

    $scope.userlistGet = function(itu) {
        $scope.countrylist = StationsService.query("userlist/" + itu);
        $scope.countrylist.$promise.then(function() {
            initMap();
            map_clear();
            $scope.lista = [];
            $scope.countrylist.forEach(station => station.qrb = parseInt($scope.distance(49.34, 19.84, station.lat, station.lon).toFixed()));
            for (var i = 0; i < $scope.countrylist.length; i++) {
                var tooltip = "";
                for (var j = 0; j < $scope.countrylist[i].stations.length; j++) {
                  let currentStation = $scope.countrylist[i].stations[j];
                    tooltip += currentStation.freq + " - " + currentStation.station + " - " + currentStation.pmax + "<br>";
                    let wyn = Object.assign({}, $scope.countrylist[i], currentStation);
                    delete wyn.stations;
                    $scope.lista.push(wyn);
                }
                let location = new google.maps.LatLng($scope.countrylist[i].lat, $scope.countrylist[i].lon);
                setMarker(map, location, $scope.countrylist[i].transmitter, tooltip);
                bounds.extend(location);
            }
            map.fitBounds(bounds);
            $scope.filterList = $scope.lista;
            $scope.numberOfPages = function() {
                return Math.ceil(this.filterList.length / $scope.pageSize);
            };
        });
    };

    $scope.searchEvt = function () {
      $scope.filterList = filterFilter(this.lista, {freq: this.search.freq || '!!', station: this.search.station});
      $scope.currentPage = 0;
      $scope.numberOfPages = function() {
          return Math.ceil(this.filterList.length / $scope.pageSize);
      };
    };
    $scope.addLog = function(entry) {
        ngDialog.open({
            template: 'partials/logform.html',
            controller: 'LogForm',
            closeByNavigation: true,
            className: 'ngdialog-theme-plain',
            data: {
                editMode: false,
                entry: {
                    station: entry.station,
                    freq: entry.freq,
                    pol: entry.pol,
                    pmax: entry.pmax,
                    location: {
                        itu: entry.ITU,
                        lat: entry.lat,
                        long: entry.lon,
                        site: entry.transmitter,
                        qrb: entry.qrb
                    }
                }
            }
        });
    };
});

app.controller("LogForm", function($scope, StationsService, Upload, $timeout) {
    // clear formData
    delete StationsService.messages.success;
    delete StationsService.messages.error;

    // vars setup
    $scope.formData = {};
    $scope.formData.location = {};
    $scope.formData.firstLog = new Date();
    $scope.messages = StationsService.messages;
    $scope.stations = [];
    $scope.sites = [];

    if ($scope.ngDialogData) {
        $scope.formData = $scope.ngDialogData.entry;
        if ($scope.ngDialogData.editMode) {
            $scope.formData.firstLog = new Date($scope.formData.firstLog);
        } else {
          $scope.formData.firstLog = new Date();
          $scope.formData.pmax = Math.ceil($scope.formData.pmax * 100) / 100;
        }
    }

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
        console.log(this.formData);
        console.log(this.file);
        console.log($scope.ngDialogData);
    };
    // form send function
    $scope.sendForm = function() {
        if (this.file) {
            $scope.upload(this.file);
            $scope.formData.audio = this.file.name;
        }
        if ($scope.ngDialogData.editMode) {
            StationsService.put($scope.formData);
        } else {
            StationsService.post($scope.formData);
        }
        delete StationsService.messages.success;
        delete StationsService.messages.error;
    };

    // CSVUserList parse function
    $scope.parseCSV = function() {

    };
});
