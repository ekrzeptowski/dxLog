angular.module('dxLog').controller("FooterController", function($scope, AudioService, PagingService) {
    $scope.file = AudioService.file;
    $scope.paging = PagingService.paging;
    $scope.removeAudio = function () {
      AudioService.reset();
      $scope.file = AudioService.file;
    };
});
