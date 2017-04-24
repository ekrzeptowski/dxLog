'use strict';






function LogFormController($scope, StationsService, Upload, $timeout, dialogData, $mdDialog, $mdToast) {
    'ngInject';

    var vm = this;
    // clear formData
    StationsService.clearMessages();

    // vars setup
    vm.formData = {};

    vm.messages = StationsService.messages;

    var toast = function(content) {
        return $mdToast.simple().content(content).hideDelay(4000).position('top right').toastClass('fixed-toast')
    };

    if (dialogData) {
        vm.formData = angular.copy(dialogData.entry);
        if (dialogData.editMode) {
            vm.editMode = true;
            vm.formData.stations = {};
            if (vm.formData.firstLog) {
                vm.formData.stations.firstLog = new Date(vm.formData.firstLog);
                delete vm.formData.firstLog;
            }

            vm.formData.stations._id = vm.formData.stationId;
            delete vm.formData.stationId;
            ["freq", "mode", "pmax", "pol", "station", "pi", "ps", "comment", "audio"].forEach(a => {
                vm.formData.stations[a] = vm.formData[a];
                delete vm.formData[a];
            });
        } else {
            vm.formData.stations.pmax = Math.ceil(vm.formData.stations.pmax * 100) / 100;
            vm.formData.stations.firstLog = new Date();
        }
    } else {
        vm.formData.stations = {};
        vm.formData.stations.pol = "h";
        vm.formData.stations.firstLog = new Date();
    }

    // audio upload
    vm.upload = function(file) {
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
                vm.errorMsg = response.status + ': ' + response.data;
        }, function(evt) {
            // Math.min is to fix IE which reports 200% sometimes
            file.progress = Math.min(100, parseInt(100.0 * evt.loaded / evt.total));
        });
    };

    // form send function
    vm.sendForm = function() {
        if (this.file) {
            vm.upload(this.file);
            vm.formData.stations.audio = this.file.name;
        }
        if (this.editMode) {
            StationsService.put(vm.formData)
                .$promise.then(() => {
                        $mdDialog.cancel();
                        $mdToast.show(toast("Item has been successfully modified"));
                    },
                    () => {
                        $mdToast.show(toast(vm.messages.error));
                    });
        } else {
            StationsService.post(vm.formData);
        }
        StationsService.clearMessages();

    };

    vm.cancel = function() {
        $mdDialog.cancel();
    };
}

export default LogFormController;
