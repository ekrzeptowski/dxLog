'use strict';

import logFormTpl from '../logForm/logForm.html';
import logFormController from '../logForm/logForm.controller';

import rxIcon from '../../../assets/images/rx.png';
import txIcon from '../../../assets/images/tx.png';


function MainController($scope, $window, $http, $filter, $state, $timeout, $stateParams, $auth, $resource, StationsService, ColorService, $sce, filterFilter, $mdDialog, AudioService) {
    'ngInject';

    var vm = this;

    vm.messages = StationsService.messages;

    // default sorting settings
    vm.col = 'freq';
    vm.reverse = false;
    vm.ituFilter = {};
    vm.setFilter = function(item) {
        vm.ituFilter.itu = item;
    };
    vm.freqs = [];

    vm.rx = {
        lat: 49.34,
        lng: 19.84
    };

    vm.stations = [];

    vm.state = $state;


    vm.isAuthenticated = function() {
        return $auth.isAuthenticated();
    };

    // Watch for window width
    var w = angular.element($window);
    $scope.$watch(
        function() {
            return $window.innerWidth;
        },
        function(value) {
            vm.windowWidth = value;
        },
        true
    );

    w.bind('resize', function() {
        $scope.$apply();
    });

    vm.editLog = function(entry) {
        $mdDialog.show({
            templateUrl: logFormTpl,
            controller: logFormController,
            controllerAs: 'vm',
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
    vm.transmitters = StationsService.query("logs");
    vm.transmitters.$promise.then(function() {
        // filter stations
        vm.transmitters = filterFilter(vm.transmitters, {
            stations: {
                station: $stateParams.station
            },
            itu: $stateParams.itu,
            _id: $stateParams.transmitter
        });

        var loc;
        for (var i = 0; i < vm.transmitters.length; i++) {
            for (var j = 0; j < vm.transmitters[i].stations.length; j++) {
                let currentStation = vm.transmitters[i].stations[j];
                currentStation.stationId = currentStation._id;
                delete currentStation._id;
                let wyn = Object.assign({}, vm.transmitters[i], currentStation);
                delete wyn.stations;
                vm.stations.push(wyn);
            }
        }
        vm.stations = filterFilter(vm.stations, {
            station: $stateParams.station
        });
        vm.total = vm.stations.length;

        ColorService.set($filter('orderBy')(vm.stations, 'freq'), vm.freqs);


        switch ($state.current.name) {
            case "country":
                loc = vm.stations[0];
                vm.itu = loc.itu;
                // TODO: full country name
                vm.title = " (" + loc.itu + ")";
                break;
            case "station":
                vm.title = vm.stations[0].station;
                break;
            case "transmitter":
                loc = vm.stations[0];
                vm.transmitter = loc;
                // TODO: full country name
                vm.title = loc.transmitter + ", " + " (" + loc.qrb + "km)";
                break;
            default:
                break;
        }
    });
    switch ($state.current.name) {
        case "main":
            vm.itus = StationsService.query("stats/itu");
            break;
        default:
            break;
    }

    // set class service
    vm.color = function(col, source, name) {
        return ColorService.filter(col, source, name);
    };

    // sort logic
    vm.order = function(col) {
        vm.reverse = (vm.col === col || vm.col[0] === col[0]) ? !vm.reverse : false;
        vm.col = col;
    };

    vm.playAudio = function(file) {
        return AudioService.play(file);
    };

    $scope.$on('$destroy', function() {
        AudioService.reset();
    });

}

export default MainController;
