'use strict';

export default function(app) {

    app.filter('startFrom', startFrom);

    function startFrom() {
        return function(input, start) {
            return input.slice(start);
        };
    }
}
