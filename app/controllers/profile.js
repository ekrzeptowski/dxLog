angular.module('dxLog')
  .controller('ProfileCtrl', function($scope, $rootScope, $location, $window, $auth, Account, Upload) {
    $scope.profile = $rootScope.currentUser;

    $scope.upload = function (file) {
        Upload.upload({
            url: '/api/userlist',
            data: {csvfile: file}
        }).then(function (resp) {
            $scope.messages = {
              success: [{msg: resp.data}]
            };
            $scope.profile.userlistUpdated = new Date();
            Account.updateProfile($scope.profile)
              .then(function(response) {
                $rootScope.currentUser = response.data.user;
                $window.localStorage.user = JSON.stringify(response.data.user);
              })
              .catch(function(response) {
                $scope.messages = {
                  error: Array.isArray(response.data) ? response.data : [response.data]
                };
              });
        }, function (resp) {
            console.log('Error status: ' + resp.status);
        }, function (evt) {
          console.log(evt);
            var progressPercentage = parseInt(100.0 * evt.loaded / evt.total);
            console.log('progress: ' + progressPercentage + '% ' + evt.config.data.csvfile.name);
        });
    };

    $scope.updateProfile = function() {
      Account.updateProfile($scope.profile)
        .then(function(response) {
          $rootScope.currentUser = response.data.user;
          $window.localStorage.user = JSON.stringify(response.data.user);
          $scope.messages = {
            success: [response.data]
          };
        })
        .catch(function(response) {
          $scope.messages = {
            error: Array.isArray(response.data) ? response.data : [response.data]
          };
        });
    };

    $scope.changePassword = function() {
      Account.changePassword($scope.profile)
        .then(function(response) {
          $scope.messages = {
            success: [response.data]
          };
        })
        .catch(function(response) {
          $scope.messages = {
            error: Array.isArray(response.data) ? response.data : [response.data]
          };
        });
    };

    $scope.link = function(provider) {
      $auth.link(provider)
        .then(function(response) {
          $scope.messages = {
            success: [response.data]
          };
        })
        .catch(function(response) {
          $window.scrollTo(0, 0);
          $scope.messages = {
            error: [response.data]
          };
        });
    };
    $scope.unlink = function(provider) {
      $auth.unlink(provider)
        .then(function() {
          $scope.messages = {
            success: [response.data]
          };
        })
        .catch(function(response) {
          $scope.messages = {
            error: [response.data]
          };
        });
    };

    $scope.deleteAccount = function() {
      Account.deleteAccount()
        .then(function() {
          $auth.logout();
          delete $window.localStorage.user;
          $location.path('/');
        })
        .catch(function(response) {
          $scope.messages = {
            error: [response.data]
          };
        });
    };
  });
