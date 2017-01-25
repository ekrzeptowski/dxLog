angular.module('dxLog').controller("MainCtrl", function($scope, $window, $http, $filter, $state, $stateParams, $auth, $resource, StationsService, ColorService, $sce, NgMap, filterFilter, $mdDialog, AudioService) {
    // default sorting settings
    $scope.col = 'freq';
    $scope.reverse = false;
    $scope.ituFilter = {};
    $scope.setFilter = function(item) {
        $scope.ituFilter.itu = item;
    };
    $scope.freqs = [];

    $scope.rx = [49.34, 19.84];

    $scope.stations = [];

    $scope.state = $state;

    $scope.isAuthenticated = function() {
        return $auth.isAuthenticated();
    };

    // Watch for window width
    var w = angular.element($window);
    $scope.$watch(
        function() {
            return $window.innerWidth;
        },
        function(value) {
            $scope.windowWidth = value;
        },
        true
    );

    w.bind('resize', function() {
        $scope.$apply();
    });

    $scope.editLog = function(entry) {
        $mdDialog.show({
            templateUrl: 'partials/logform.html',
            controller: 'LogForm',
            clickOutsideToClose: true,
            fullscreen: true,
            locals: {
                dialogData: {
                    editMode: true,
                    entry
                }
            }
        });
    };

    // fetch data
    $scope.transmitters = StationsService.query("logs");
    $scope.transmitters.$promise.then(function() {
        // filter stations
        $scope.transmitters = filterFilter($scope.transmitters, {
            stations: {
                station: $stateParams.station
            },
            itu: $stateParams.itu,
            _id: $stateParams.transmitter
        });
        var loc;
        for (var i = 0; i < $scope.transmitters.length; i++) {
            for (var j = 0; j < $scope.transmitters[i].stations.length; j++) {
                let currentStation = $scope.transmitters[i].stations[j];
                currentStation.stationId = currentStation._id;
                delete currentStation._id;
                let wyn = Object.assign({}, $scope.transmitters[i], currentStation);
                delete wyn.stations;
                $scope.stations.push(wyn);
            }
        }
        $scope.stations = filterFilter($scope.stations, {
            station: $stateParams.station
        });
        $scope.total = $scope.stations.length;

        ColorService.set($filter('orderBy')($scope.stations, 'freq'), $scope.freqs);


        switch ($state.current.name) {
            case "country":
                loc = $scope.stations[0];
                $scope.itu = loc.itu;
                // TODO: full country name
                $scope.title = " (" + loc.itu + ")";
                break;
            case "station":
                $scope.title = $scope.stations[0].station;
                break;
            case "transmitter":
                loc = $scope.stations[0];
                $scope.transmitter = loc;
                // TODO: full country name
                $scope.title = loc.transmitter + ", " + " (" + loc.qrb + "km)";
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
            transmitter: url._id
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
        return AudioService.play(file);
    };

    $scope.$on('$destroy', function() {
        AudioService.reset();
    });
});
