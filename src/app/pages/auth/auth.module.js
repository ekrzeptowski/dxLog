'use strict';

import route from './auth.route';

const AuthModule = angular.module('auth', [
  'ui.router'
]);

AuthModule
    .config(route);

export default AuthModule;
