'use strict';

import topBarTpl from './topBar.html';

function topBarComponent($location, $window, $auth, $mdDialog) {
    'ngInject';

    var directive = {
        restrict: 'E',
        templateUrl: topBarTpl,
        controller: TopBarController,
        controllerAs: 'topBar',
        bindToController: true
    };

    return directive;

    function TopBarController() {
        this.isActive = function(viewLocation) {
            return viewLocation === $location.path();
        };

        var originatorEv;

        this.openMenu = function($mdOpenMenu, ev) {
            originatorEv = ev;
            $mdOpenMenu(ev);
        };

        this.isAuthenticated = function() {
            return $auth.isAuthenticated();
        };

        this.logout = function() {
            $auth.logout();
            delete $window.localStorage.user;
            $location.path('/');
        };
    }


}

export default topBarComponent;
