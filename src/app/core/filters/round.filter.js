'use strict';

export default function(app) {

    app.filter('round', round);

    function round() {
        return function(value, mult, dir) {
            dir = dir || 'nearest';
            mult = mult || 1;
            value = !value ? 0 : Number(value);
            if (dir === 'up') {
                return Math.ceil(value / mult) * mult;
            } else if (dir === 'down') {
                return Math.floor(value / mult) * mult;
            } else {
                return Math.round(value / mult) * mult;
            }
        };
    }
}
