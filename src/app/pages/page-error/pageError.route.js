'use strict';

import pageErrorTpl from './pageError.html';
import pageErrorController from './pageError.controller';

function routeConfig($stateProvider) {
  'ngInject';

  $stateProvider
    .state('pageError', {
      url: '/error',
      templateUrl: pageErrorTpl,
      controller: pageErrorController,
      controllerAs: 'pageError'
    });

}

export default routeConfig;
