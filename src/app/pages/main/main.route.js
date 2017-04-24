'use strict';

import mainTpl from './main.html';
import mainController from './main.controller';

function routeConfig($stateProvider) {
    'ngInject';

    $stateProvider
        .state('main', {
            url: '/',
            templateUrl: mainTpl,
            controller: mainController,
            controllerAs: 'main'
        })
        .state('station', {
            url: '/station/:station',
            templateUrl: mainTpl,
            controller: mainController,
            controllerAs: 'main'
        })
        .state('country', {
            url: '/country/:itu',
            templateUrl: mainTpl,
            controller: mainController,
            controllerAs: 'main'
        })
        .state('transmitter', {
            url: "/transmitter/:transmitter",
            templateUrl: mainTpl,
            controller: mainController,
            controllerAs: 'main'
        });

}

export default routeConfig;
