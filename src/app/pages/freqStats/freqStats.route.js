'use strict';

import freqStatsTpl from './freqStats.html';
import freqStatsController from './freqStats.controller';

function routeConfig($stateProvider) {
  'ngInject';

  $stateProvider
    .state('freqStats', {
      url: '/freq-stats',
      templateUrl: freqStatsTpl,
      controller: freqStatsController,
      controllerAs: 'statsCtrl'
    });

}

export default routeConfig;
