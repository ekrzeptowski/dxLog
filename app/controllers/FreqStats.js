angular.module('dxLog').controller("FreqStats", function($scope, StationsService) {
    // fetch data
    $scope.freqs = StationsService.query("stats/freq");
    $scope.max = 0;
    $scope.freqs.$promise.then(function() {
        $scope.max = Math.max.apply(Math, $scope.freqs.map(function(item) {
            return item.count;
        }));
    });

});
