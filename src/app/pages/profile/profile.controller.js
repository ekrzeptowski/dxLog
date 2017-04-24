'use strict';

function ProfileController($scope, $rootScope, $location, $window, $auth, Account, Upload) {
    'ngInject';
    var vm = this;
    vm.profile = $rootScope.currentUser;

    vm.upload = function(file) {
        Upload.upload({
            url: 'http://localhost:3000/api/userlist',
            data: {
                csvfile: file
            }
        }).then(function(resp) {
            vm.messages = {
                success: [{
                    msg: resp.data
                }]
            };
            vm.profile.userlistUpdated = new Date();
            Account.updateProfile(vm.profile)
                .then(function(response) {
                    $rootScope.currentUser = response.data.user;
                    $window.localStorage.user = JSON.stringify(response.data.user);
                })
                .catch(function(response) {
                    vm.messages = {
                        error: Array.isArray(response.data) ? response.data : [response.data]
                    };
                });
        }, function(resp) {
            console.log('Error status: ' + resp.status);
        }, function(evt) {
            console.log(evt);
            var progressPercentage = parseInt(100.0 * evt.loaded / evt.total);
            console.log('progress: ' + progressPercentage + '% ' + evt.config.data.csvfile.name);
        });
    };

    vm.updateProfile = function() {
        Account.updateProfile(vm.profile)
            .then(function(response) {
                $rootScope.currentUser = response.data.user;
                $window.localStorage.user = JSON.stringify(response.data.user);
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

    vm.changePassword = function() {
        Account.changePassword(vm.profile)
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

    vm.link = function(provider) {
        $auth.link(provider)
            .then(function(response) {
                vm.messages = {
                    success: [response.data]
                };
            })
            .catch(function(response) {
                $window.scrollTo(0, 0);
                vm.messages = {
                    error: [response.data]
                };
            });
    };
    vm.unlink = function(provider) {
        $auth.unlink(provider)
            .then(function() {
                vm.messages = {
                    success: [response.data]
                };
            })
            .catch(function(response) {
                vm.messages = {
                    error: [response.data]
                };
            });
    };

    vm.deleteAccount = function() {
        Account.deleteAccount()
            .then(function() {
                $auth.logout();
                delete $window.localStorage.user;
                $location.path('/');
            })
            .catch(function(response) {
                vm.messages = {
                    error: [response.data]
                };
            });
    };
}

export default ProfileController;
