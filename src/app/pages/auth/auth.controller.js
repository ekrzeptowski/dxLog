'use strict';

function AuthController($scope, $rootScope, $stateParams, $location, $window, $auth) {
    'ngInject';
    var vm = this;
    vm.type = $stateParams.type;
    vm.login = function() {
        $auth.login(vm.user)
            .then(function(response) {
                $rootScope.currentUser = response.data.user;
                $window.localStorage.user = JSON.stringify(response.data.user);
                $location.path('/profile');
            })
            .catch(function(response) {
                vm.messages = {
                    error: Array.isArray(response.data) ? response.data : [response.data]
                };
            });
    };

    vm.signup = function() {
        $auth.signup(vm.user)
            .then(function(response) {
                $auth.setToken(response);
                $rootScope.currentUser = response.data.user;
                $window.localStorage.user = JSON.stringify(response.data.user);
                $location.path('/');
            })
            .catch(function(response) {
                vm.messages = {
                    error: Array.isArray(response.data) ? response.data : [response.data]
                };
            });
    };

    vm.forgotPassword = function() {
        Account.forgotPassword(vm.user)
            .then(function(response) {
                vm.messages = {
                    success: [response.data]
                };
            })
            .catch(function(response) {
                vm.messages = {
                    error: Array.isArray(response.data) ? response.data : [response.data]
                };
            });
    };

    vm.authenticate = function(provider) {
        $auth.authenticate(provider)
            .then(function(response) {
                $rootScope.currentUser = response.data.user;
                $window.localStorage.user = JSON.stringify(response.data.user);
                $location.path('/');
            })
            .catch(function(response) {
                if (response.error) {
                    vm.messages = {
                        error: [{
                            msg: response.error
                        }]
                    };
                } else if (response.data) {
                    vm.messages = {
                        error: [response.data]
                    };
                }
            });
    };
}

export default AuthController;
