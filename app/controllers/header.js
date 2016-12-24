angular.module('dxLog')
    .controller('HeaderCtrl', function($scope, $location, $window, $auth, ngDialog) {
        $scope.isActive = function(viewLocation) {
            return viewLocation === $location.path();
        };

        $scope.isAuthenticated = function() {
            return $auth.isAuthenticated();
        };

        $scope.addLog = function() {
            ngDialog.open({
                template: 'partials/addlog.html',
                controller: 'NewLogForm',
                closeByNavigation: true,
                className: 'ngdialog-theme-plain'
            });
        };

        $scope.logout = function() {
            $auth.logout();
            delete $window.localStorage.user;
            $location.path('/');
        };
    });
