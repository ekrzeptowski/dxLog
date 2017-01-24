angular.module('dxLog').factory('AudioService', function($sce) {
    var file = {};

    return {
        play: function(audioFile) {
            file["name"] = audioFile;
            file["url"] = $sce.trustAsResourceUrl("audio/" + audioFile);
        },
        reset: function() {
            delete file.name;
            delete file.url;
        },
        file: file,
    };
});
