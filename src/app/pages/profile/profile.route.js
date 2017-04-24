'use strict';

import ProfileTpl from './profile.html';
import ProfileController from './profile.controller';

function routeConfig($stateProvider) {
    'ngInject';

    $stateProvider
        .state('profile', {
            url: '/profile',
            templateUrl: ProfileTpl,
            controller: ProfileController,
            controllerAs: 'profileCtrl'
        });

}

export default routeConfig;
