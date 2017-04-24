'use strict';

import logFormTpl from './logForm.html';
import logFormController from './logForm.controller';

function routeConfig($stateProvider) {
  'ngInject';

  $stateProvider
    .state('logForm', {
      url: '/log-form',
      templateUrl: logFormTpl,
      controller: logFormController,
      controllerAs: 'vm'
    });

}

export default routeConfig;
