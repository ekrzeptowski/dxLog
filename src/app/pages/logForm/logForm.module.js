'use strict';

import route from './logForm.route';

const logFormModule = angular.module('log-form', [
  'ui.router'
]);

logFormModule
    .config(route);

export default logFormModule;
