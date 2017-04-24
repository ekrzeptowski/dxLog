'use strict';

import topBarModule from './components/topBar/topBar.module';
import footerModule from './components/footer/footer.module';

export default angular.module('index.components', [
	topBarModule.name,
	footerModule.name
]);
