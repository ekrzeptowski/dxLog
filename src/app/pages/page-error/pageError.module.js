'use strict';

import route from './pageError.route';

const pageErrorModule = angular.module('pageError-module', [
  'ui.router'
]);

pageErrorModule
    .config(route);

export default pageErrorModule;
