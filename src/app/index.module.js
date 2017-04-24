'use strict';

import components from './index.components';
import config from './index.config';
import run from './index.run';

import uiRouter from 'angular-ui-router';

import coreModule from './core/core.module';
import indexComponents from './index.components';
import indexRoutes from './index.routes';
import authModule from './pages/auth/auth.module';
import mainModule from './pages/main/main.module';
import logFormModule from './pages/logForm/logForm.module';
import freqStatsModule from './pages/freqStats/freqStats.module';
import pageErrorModule from './pages/page-error/pageError.module';
import profileModule from './pages/profile/profile.module';
import userlistBrowserModule from './pages/userlistBrowser/userlistBrowser.module';


const App = angular.module(
    "dxLog", [
        // plugins
        uiRouter,
        "satellizer",
        "ngFileUpload",
        "ngMaterial",
        "ngAnimate",
        "ngSanitize",
        "ngMessages",
        "ngAria",
        "ngResource",
				"cl.paging",

        // core
        coreModule.name,

        // components
        indexComponents.name,

        // routes
        indexRoutes.name,

        // pages
				authModule.name,

				mainModule.name,

				logFormModule.name,

        freqStatsModule.name,

				pageErrorModule.name,

				profileModule.name,

				userlistBrowserModule.name

    ]
);

App
    .config(config)
    .run(run);



export default App;
