'use strict';

import rxIcon from '../../../../assets/images/rx.png';
import txIcon from '../../../../assets/images/tx.png';

export default function(app) {

    class TransmitterMapDirective {
        constructor() {
            this.restrict = 'E'
            this.template = '<div id="transmitter-map"></div>'
            this.scope = {
                rx: '=',
                transmitters: '=',
                info: '=',
                draggable: '='
            }
        }

        compile(tElement) {
            tElement.css('max-width', '960px');
            tElement.css('display', 'block');
            tElement.css('margin', '10px auto');
            tElement.css('height', '480px');
            return this.link;
        }

        controller($scope, $state) {
            'ngInject'
            $scope.state = $state;
        }

        link(scope, element, attrs) {
            var map, infoWindow, bounds;
            var markers = [];
            // map config
            var mapOptions = {
                center: new google.maps.LatLng(50, 2),
                zoom: 4,
                mapTypeId: google.maps.MapTypeId.TERRAIN,
                scrollwheel: false,
                disableDefaultUI: true,
                draggable: false
            };

            if (scope.draggable) {
                mapOptions.disableDefaultUI = false;
                mapOptions.draggable = true;
            }

            // init the map
            function initMap() {
                if (map === void 0) {
                    map = new google.maps.Map(element[0], mapOptions);
                }
                bounds = new google.maps.LatLngBounds();
                if (scope.rx) {
                    var rxMarker = new google.maps.Marker({
                        position: scope.rx,
                        map: map,
                        title: "RX",
                        icon: {
                            url: rxIcon,
                            anchor: new google.maps.Point(16, 16)
                        }
                    });
                    bounds.extend(scope.rx);
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
                        url: txIcon,
                        anchor: new google.maps.Point(16, 16)
                    }
                };

                marker = new google.maps.Marker(markerOptions);
                markers.push(marker); // add marker to array

                if (scope.info) {
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
                } else {
                    google.maps.event.addListener(marker, 'click', function() {
                        scope.state.go("transmitter", {
                            transmitter: content
                        });
                    });
                }
                if (scope.rx) {
                    var polylineOptions = {
                        map: map,
                        path: [scope.rx, position],
                        strokeColor: '#ff0000',
                        strokeOpacity: 0.33,
                        strokeWeight: 3,
                        geodesic: true
                    };
                    var polyline = new google.maps.Polyline(polylineOptions);
                }
                bounds.extend(marker.getPosition());
            }

            scope.$watch(function() {
                return scope.transmitters;
            }, function() {
                initMap();
                // clear markers
                for (var i = 0; i < markers.length; i++) {
                    markers[i].setMap(null);
                }
                markers = [];

                angular.forEach(scope.transmitters, function(value, key) {
                    var location = new google.maps.LatLng(value.lat, value.lon);
                    if (scope.info) {
                        let tooltip = "";
                        for (var i = 0; i < value.stations.length; i++) {
                            let currentStation = value.stations[i];
                            tooltip += currentStation.freq + " - " + currentStation.station + " - " + currentStation.pmax + "kW<br>"
                        }
                        setMarker(map, location, value.title, tooltip);
                    } else {
                        setMarker(map, location, value.title, value._id);
                    }
                });
                map.fitBounds(bounds);
            });
        }
    }
    app.directive('transmitterMap', () => new TransmitterMapDirective)
}
