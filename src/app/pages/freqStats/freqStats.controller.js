'use strict';

function freqStatsController($scope, StationsService) {
    'ngInject';
		var vm = this;
    // fetch data
    vm.freqs = StationsService.query("stats/freq");
    vm.max = 0;
    vm.freqs.$promise.then(function() {
        vm.max = Math.max.apply(Math, vm.freqs.map(function(item) {
            return item.count;
        }));
    });
}

export default freqStatsController;
