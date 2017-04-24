'use strict';

import topBarDirective from './topBar.directive';
import './topBar.scss';

const topBarModule = angular.module('topBar-module', []);

topBarModule
  .directive('topbar', topBarDirective);

export default topBarModule;
