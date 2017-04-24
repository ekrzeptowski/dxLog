'use strict';

import route from './profile.route';

const ProfileModule = angular.module('profile', [
  'ui.router'
]);

ProfileModule
    .config(route);

export default ProfileModule;
