'use strict';

export default function(app) {


    class AudioService {
        constructor($sce) {
            'ngInject';

            this.file = {};
            this.$sce = $sce;
        }

        file() {
            return this.file;
        }

        play(audioFile) {
            this.file["name"] = audioFile;
            this.file["url"] = this.$sce.trustAsResourceUrl("audio/" + audioFile);
        }

        reset() {
            delete this.file.name;
            delete this.file.url;
        }
    }

    app
        .service('AudioService', AudioService).name;
}
