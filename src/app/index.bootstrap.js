'use strict';

// index.html page to dist folder
import '!!file-loader?name=[name].[ext]!../favicon.ico';

// vendor files
import "./index.vendor";

// main App module
import "./index.module";

import "../assets/styles/sass/index.scss";

import "../assets/styles/flags.css";

angular.element(document).ready(() => {
  angular.bootstrap(document, ['dxLog'], {
    strictDi: true
  });
});
