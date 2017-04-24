'use strict';

import userlistBrowserTpl from './userlistBrowser.html';
import userlistBrowserController from './userlistBrowser.controller';

function routeConfig($stateProvider) {
  'ngInject';

  $stateProvider
    .state('userlistBrowser', {
      url: '/userlist-browser',
      templateUrl: userlistBrowserTpl,
      controller: userlistBrowserController,
      controllerAs: 'userlistCtrl'
    });

}

export default routeConfig;
