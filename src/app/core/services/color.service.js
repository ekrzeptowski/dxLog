'use strict';

export default function(app) {

    class ColorService {
        constructor() {

        }
        set(source, dest) {
            source.forEach(function(value, key) {
                if (dest.findIndex(function(x) {
                        return x.freq === source[key].freq;
                    }) == -1) {
                    dest.push({
                        freq: source[key].freq
                    });
                }
            });
            dest.forEach(function(value, key) {
                if (key % 2 === 0) {
                    dest[key].even = false;
                } else {
                    dest[key].even = true;
                }
            });
        };

        filter(col, source, name) {
            if (col == "freq") {
                return source[source.findIndex(function(x) {
                    return x.freq === name;
                })].even;
            }
        };
    }

    app
        .service('ColorService', ColorService);
}
