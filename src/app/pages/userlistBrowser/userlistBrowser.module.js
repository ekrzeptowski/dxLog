'use strict';

import route from './userlistBrowser.route';

const userlistBrowserModule = angular.module('userlistBrowser', [
  'ui.router'
]);

userlistBrowserModule
    .config(route);

export default userlistBrowserModule;
