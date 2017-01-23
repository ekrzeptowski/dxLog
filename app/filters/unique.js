angular.module('dxLog').filter('unique', function() {
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
