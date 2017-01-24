angular.module('dxLog')
    .controller('HeaderCtrl', function($scope, $location, $window, $auth, $mdDialog) {
        $scope.isActive = function(viewLocation) {
            return viewLocation === $location.path();
        };

        var originatorEv;

        this.openMenu = function($mdOpenMenu, ev) {
            originatorEv = ev;
            $mdOpenMenu(ev);
        };

        $scope.isAuthenticated = function() {
            return $auth.isAuthenticated();
        };

        $scope.logout = function() {
            $auth.logout();
            delete $window.localStorage.user;
            $location.path('/');
        };
    });
