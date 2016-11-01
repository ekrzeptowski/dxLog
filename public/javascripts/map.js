var map, rx, icon_tx;
var bounds;

function map_init(itu) {
    rx = new google.maps.LatLng(49.34, 19.84);

    bounds = new google.maps.LatLngBounds();
    bounds.extend(rx);

    var mapOptions = {
        disableDefaultUI: true,
        mapTypeId: google.maps.MapTypeId.TERRAIN,
        draggable: false,
        scrollwheel: false,
        disableDoubleClickZoom: true,
        maxZoom: 7,
        zoom: 5
    };

    switch (itu) {
        case "POL":

            break;

        case "D":
            document.getElementById('map').style.height = '625px';
            break;

        case "S":
            document.getElementById('map').style.height = '600px';
            break;

        case "CZE":
            document.getElementById('map').style.height = '375px';
            break;

        case "SVK":
            document.getElementById('map').style.height = '425px';
            break;

        case "LTU":
            document.getElementById('map').style.height = '400px';
            break;

        case "DNK":
            document.getElementById('map').style.height = '475px';
            break;

        case "FIN":
            document.getElementById('map').style.height = '575px';
            break;

        case "BLR":
            document.getElementById('map').style.height = '400px';
            break;

        case "AUT":
            document.getElementById('map').style.height = '500px';
            break;

        case "HNG":
            document.getElementById('map').style.height = '550px';
            break;

        case "LVA":
            document.getElementById('map').style.height = '500px';
            break;

        case "ROU":
            document.getElementById('map').style.height = '550px';
            break;

        case "RUS":
            document.getElementById('map').style.height = '425px';
            break;

        case "UKR":
            document.getElementById('map').style.height = '425px';
            break;

        case "EST":
            document.getElementById('map').style.height = '635px';
            break;

        case "NOR":
            document.getElementById('map').style.height = '500px';
            break;

        case "SUI":
            document.getElementById('map').style.height = '330px';
            break;

        case "G":
            document.getElementById('map').style.height = '425px';
            break;

        case "SRB":
            document.getElementById('map').style.height = '600px';
            break;

        case "MDA":
            document.getElementById('map').style.height = '475px';
            break;

        case "HRV":
            document.getElementById('map').style.height = '650px';
            break;

        case "SVN":
            document.getElementById('map').style.height = '350px';
            break;

        case "F":
            document.getElementById('map').style.height = '440px';
            break;

        case "HOL":
        case "BEL":
            document.getElementById('map').style.height = '400px';
            break;

        case "BIH":
            document.getElementById('map').style.height = '700px';
            break;

        case "I":
            document.getElementById('map').style.height = '790px';
            break;

        default:
            document.getElementById('map').style.height = '925px';
            break;
    }

    map = new google.maps.Map(document.getElementById('map'), mapOptions);

    var icon_rx = {
        anchor: new google.maps.Point(16, 27),
        size: new google.maps.Size(32, 32),
        url: "rx.png"
    };

    icon_tx = {
        anchor: new google.maps.Point(16, 28),
        size: new google.maps.Size(32, 32),
        url: "tx.png"
    };

    var marker_rx = new google.maps.Marker({
        map: map,
        position: rx,
        icon: icon_rx,
        title: 'QTH'
    });
}

function map_show() {
    document.getElementById('map').style.display = 'block';
    google.maps.event.trigger(map, "resize");
    map.fitBounds(bounds);
}

function map_hide() {
    document.getElementById('map').style.display = 'none';
}

function marker(lat, lon, title, id_l) {
    var tx = new google.maps.LatLng(lat, lon);
    var polylineIn = new google.maps.Polyline({
        map: map,
        path: [rx, tx],
        strokeColor: '#ff0000',
        strokeOpacity: 0.33,
        strokeWeight: 3,
        geodesic: true
    });

    var marker_tx = new google.maps.Marker({
        map: map,
        position: tx,
        icon: icon_tx,
        id_l: id_l,
        title: title
    });

    google.maps.event.addListener(marker_tx, 'click', function() {
      console.log(this);
        angular.element(document.getElementById('map')).scope().navob(this.id_l);
    });



    bounds.extend(tx);
}
