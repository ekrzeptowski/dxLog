// rest service
angular.module('dxLog').factory('StationsService', function($resource, $cacheFactory) {
    var Api = "http://localhost:3000/api/";
    var messages = {};

    return {
        query: function(surl, afterf) {
            return $resource(Api + surl, {}, {
                query: {
                    isArray: true,
                    cache: true,
                    method: 'GET'
                }
            }).query(function() {
                afterf;
            });
        },
        messages: messages,
        post: function(data) {
            $resource(Api + "logs").save(data,
                function(resp, headers) {
                    // success callback
                    messages.success = "Item has been successfully added";
                    // clean cache after adding new item
                    $cacheFactory.get('$http').removeAll();
                },
                function(err) {
                    messages.error = "Error occured";
                });
        },
        put: function(data) {
            $resource(Api + "logs", {}, {
                update: {
                    method: 'PUT'
                }
            }).update(data,
                function(resp, headers) {
                    // success callback
                    messages.success = "Item has been successfully modified";
                    // clean cache after modifying item
                    $cacheFactory.get('$http').removeAll();
                },
                function(err) {
                    messages.error = "Error occured";
                });
        }
    };
});
