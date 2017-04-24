'use strict';

import AuthTpl from './auth.html';
import AuthController from './auth.controller';

function routeConfig($stateProvider) {
    'ngInject';

    $stateProvider
        .state('login', {
            url: '/login',
            templateUrl: AuthTpl,
            controller: AuthController,
            controllerAs: 'auth',
            params: {
                type: "login"
            }
        })
        .state('signup', {
            url: '/signup',
            templateUrl: AuthTpl,
            controller: AuthController,
            controllerAs: 'auth',
            params: {
                type: "signup"
            }
        })
				.state('forgot', {
            url: '/forgot',
            templateUrl: AuthTpl,
            controller: AuthController,
            controllerAs: 'auth',
            params: {
                type: "forgot"
            }
        });

}

export default routeConfig;
