angular.module('dxLog').controller("UserlistBrowser", function($scope, StationsService, ngDialog, NgMap, filterFilter) {
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

    $scope.searchEvt = function() {
        $scope.filterList = filterFilter(this.lista, {
            freq: this.search.freq || '!!',
            station: this.search.station
        });
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
        });
    };
});
