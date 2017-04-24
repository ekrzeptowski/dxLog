'use strict';

export default function(app) {

    class StationsService {
        constructor($resource, $cacheFactory) {
            'ngInject';

            this.api = "/api/";
            this.messages = {};
            this.$resource = $resource;
            this.$cacheFactory = $cacheFactory;
        }

        messages() {
					console.log("test");
            return this.messages;
        }

        clearMessages() {
            delete this.messages.success;
            delete this.messages.error;
        }

        query(surl, afterf) {
            return this.$resource(this.api + surl, {}, {
                query: {
                    isArray: true,
                    cache: true,
                    method: 'GET'
                }
            }).query(() => afterf);
        }
        post(data) {
            return this.$resource(this.api + "logs").save(data,
                (resp, headers) => {
                    // success callback
                    this.messages.success = "Item has been successfully added";
                    // clean cache after adding new item
                    this.$cacheFactory.get('$http').removeAll();
                },
                (err) => {
                    this.messages.error = "Error occured";
                });
        }
        put(data) {
            return this.$resource(this.api + "logs", {}, {
                update: {
                    method: 'PUT'
                }
            }).update(data,
                (resp, headers) => {
                    // success callback
                    this.messages.success = resp;
                    // clean cache after modifying item
                    this.$cacheFactory.get('$http').removeAll();
                },
                (err) => this.messages.error = "Error occured"
            );
        }

    }

    app
        .service('StationsService', StationsService);
}
