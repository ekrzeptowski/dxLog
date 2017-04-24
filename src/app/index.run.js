'use strict';

function runBlock($rootScope, $window) {
    'ngInject';

    if ($window.localStorage.user) {
        $rootScope.currentUser = JSON.parse($window.localStorage.user);
    }
}

export default runBlock;
