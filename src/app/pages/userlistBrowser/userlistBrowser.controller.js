'use strict';

import logFormTpl from '../logForm/logForm.html';
import logFormController from '../logForm/logForm.controller';

function LogFormController($scope, StationsService, $mdDialog, filterFilter, PagingService) {
    'ngInject';

    var vm = this;

    vm.itus = StationsService.query("userlist/itus");
    vm.rx = {
        lat: 49.34,
        lng: 19.84
    };

    vm.distance = function(lat1, lon1, lat2, lon2) {
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
    vm.paging = PagingService;
    vm.currentPage = vm.paging.currentPage;
    vm.pageSize = 50;
    vm.setCurrentPage = function(currentPage) {
        vm.currentPage = currentPage;
    };

    function loadPages() {
        vm.currentPage = vm.paging.current;
    }

    vm.getNumberAsArray = function(num) {
        return new Array(num);
    };

    $scope.$watch(function() {
        return PagingService.paging.current;
    }, function(newValue, oldValue) {
        vm.currentPage = newValue;
    });

    vm.userlistGet = function(itu) {
        vm.countrylist = StationsService.query("userlist/" + itu);
        vm.countrylist.$promise.then(function() {
            vm.lista = [];
            vm.countrylist.forEach(station => station.qrb = parseInt(vm.distance(vm.rx.lat, vm.rx.lng, station.lat, station.lon).toFixed()));
            for (var i = 0; i < vm.countrylist.length; i++) {
                for (var j = 0; j < vm.countrylist[i].stations.length; j++) {
                    let currentStation = vm.countrylist[i].stations[j];
                    let wyn = Object.assign({}, vm.countrylist[i], currentStation);
                    delete wyn.stations;
                    vm.lista.push(wyn);
                }

            }

            vm.filterList = vm.lista;
						vm.mapList = vm.countrylist;
            vm.numberOfPages = function() {
                return Math.ceil(this.filterList.length / vm.pageSize);
            };
            PagingService.paging.current = 1;
            PagingService.paging.pages = vm.numberOfPages();
        });
    };

    vm.searchEvt = function() {
        vm.filterList = filterFilter(this.lista, {
            freq: this.search.freq || '!!',
            station: this.search.station,
            transmitter: this.search.transmitter
        });
        PagingService.paging.current = 1;
        vm.numberOfPages = function() {
            return Math.ceil(this.filterList.length / vm.pageSize);
        };
        PagingService.paging.pages = vm.numberOfPages();
    };
		vm.logTemplate = {
			transmitter: "",
			ITU: "",
			lat: 0,
			lon: 0,
			qrb: 0,
			station: "",
			freq: 0,
			pol: "",
			pmax: 0
		}
    vm.addLog = function(entry) {
        $mdDialog.show({
            templateUrl: logFormTpl,
            controller: logFormController,
            controllerAs: 'vm',
            clickOutsideToClose: true,
            fullscreen: true,
            locals: {
                dialogData: {
                    editMode: false,
                    entry: {
                        transmitter: entry.transmitter,
                        itu: entry.ITU,
                        lat: entry.lat,
                        lon: entry.lon,
                        qrb: entry.qrb,
                        stations: {
                            station: entry.station,
                            freq: entry.freq,
                            pol: entry.pol,
                            pmax: entry.pmax
                        }
                    }
                }
            }
        });
    };

    $scope.$on('$destroy', function() {
        PagingService.reset();
    });
}

export default LogFormController;
