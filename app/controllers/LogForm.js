angular.module('dxLog').controller("LogForm", function($scope, StationsService, Upload, $timeout) {
    // clear formData
    delete StationsService.messages.success;
    delete StationsService.messages.error;

    // vars setup
    $scope.formData = {};

    $scope.messages = StationsService.messages;

    if ($scope.ngDialogData) {
        $scope.formData = $scope.ngDialogData.entry;
        if ($scope.ngDialogData.editMode) {
            $scope.formData.stations.firstLog = new Date($scope.formData.firstLog);
            delete $scope.formData.firstLog;
            $scope.formData.stations._id = $scope.formData.stationId;
            delete $scope.formData.stationId;
            ["freq", "mode", "pmax", "pol", "station", "pi", "ps", "comment", "audio"].forEach(a => {
                $scope.formData.stations[a] = $scope.formData[a];
                delete $scope.formData[a];
            });
        } else {
            $scope.formData.stations.pmax = Math.ceil($scope.formData.stations.pmax * 100) / 100;
            $scope.formData.stations.firstLog = new Date();
        }
    } else {
        $scope.formData.stations = {};
        $scope.formData.stations.pol = "h";
        $scope.formData.stations.firstLog = new Date();
    }

    // audio upload
    $scope.upload = function(file) {
        file.upload = Upload.upload({
            url: 'api/upload',
            data: {
                file: file
            },
        });

        file.upload.then(function(response) {
            $timeout(function() {
                file.result = response.data;
            });
        }, function(response) {
            if (response.status > 0)
                $scope.errorMsg = response.status + ': ' + response.data;
        }, function(evt) {
            // Math.min is to fix IE which reports 200% sometimes
            file.progress = Math.min(100, parseInt(100.0 * evt.loaded / evt.total));
        });
    };

    // form send function
    $scope.sendForm = function() {
        if (this.file) {
            $scope.upload(this.file);
            $scope.formData.stations.audio = this.file.name;
        }
        if ($scope.ngDialogData.editMode) {
            StationsService.put($scope.formData);
        } else {
            StationsService.post($scope.formData);
        }
        delete StationsService.messages.success;
        delete StationsService.messages.error;
    };

});
