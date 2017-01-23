angular.module('dxLog').filter('startFrom', function() {
    return function(input, start) {
        return input.slice(start);
    };
});
