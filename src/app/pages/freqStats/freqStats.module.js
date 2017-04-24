'use strict';

import route from './freqStats.route';

const freqStatsModule = angular.module('freqStats', [
  'ui.router'
]);

freqStatsModule
    .config(route);

export default freqStatsModule;
