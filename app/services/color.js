angular.module('dxLog').service('ColorService', function() {
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
