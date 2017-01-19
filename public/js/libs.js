/*
 * angucomplete-alt
 * Autocomplete directive for AngularJS
 * This is a fork of Daryl Rowland's angucomplete with some extra features.
 * By Hidenari Nozaki
 */

/*! Copyright (c) 2014 Hidenari Nozaki and contributors | Licensed under the MIT license */

(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    // CommonJS
    module.exports = factory(require('angular'));
  } else if (typeof define === 'function' && define.amd) {
    // AMD
    define(['angular'], factory);
  } else {
    // Global Variables
    factory(root.angular);
  }
}(window, function (angular) {
  'use strict';

  angular.module('angucomplete-alt', []).directive('angucompleteAlt', ['$q', '$parse', '$http', '$sce', '$timeout', '$templateCache', '$interpolate', function ($q, $parse, $http, $sce, $timeout, $templateCache, $interpolate) {
    // keyboard events
    var KEY_DW  = 40;
    var KEY_RT  = 39;
    var KEY_UP  = 38;
    var KEY_LF  = 37;
    var KEY_ES  = 27;
    var KEY_EN  = 13;
    var KEY_TAB =  9;

    var MIN_LENGTH = 3;
    var MAX_LENGTH = 524288;  // the default max length per the html maxlength attribute
    var PAUSE = 500;
    var BLUR_TIMEOUT = 200;

    // string constants
    var REQUIRED_CLASS = 'autocomplete-required';
    var TEXT_SEARCHING = 'Searching...';
    var TEXT_NORESULTS = 'No results found';
    var TEMPLATE_URL = '/angucomplete-alt/index.html';

    // Set the default template for this directive
    $templateCache.put(TEMPLATE_URL,
        '<div class="angucomplete-holder" ng-class="{\'angucomplete-dropdown-visible\': showDropdown}">' +
        '  <input id="{{id}}_value" name="{{inputName}}" tabindex="{{fieldTabindex}}" ng-class="{\'angucomplete-input-not-empty\': notEmpty}" ng-model="searchStr" ng-disabled="disableInput" type="{{inputType}}" placeholder="{{placeholder}}" maxlength="{{maxlength}}" ng-focus="onFocusHandler()" class="{{inputClass}}" ng-focus="resetHideResults()" ng-blur="hideResults($event)" autocapitalize="off" autocorrect="off" autocomplete="off" ng-change="inputChangeHandler(searchStr)"/>' +
        '  <div id="{{id}}_dropdown" class="angucomplete-dropdown" ng-show="showDropdown">' +
        '    <div class="angucomplete-searching" ng-show="searching" ng-bind="textSearching"></div>' +
        '    <div class="angucomplete-searching" ng-show="!searching && (!results || results.length == 0)" ng-bind="textNoResults"></div>' +
        '    <div class="angucomplete-row" ng-repeat="result in results" ng-click="selectResult(result)" ng-mouseenter="hoverRow($index)" ng-class="{\'angucomplete-selected-row\': $index == currentIndex}">' +
        '      <div ng-if="imageField" class="angucomplete-image-holder">' +
        '        <img ng-if="result.image && result.image != \'\'" ng-src="{{result.image}}" class="angucomplete-image"/>' +
        '        <div ng-if="!result.image && result.image != \'\'" class="angucomplete-image-default"></div>' +
        '      </div>' +
        '      <div class="angucomplete-title" ng-if="matchClass" ng-bind-html="result.title"></div>' +
        '      <div class="angucomplete-title" ng-if="!matchClass">{{ result.title }}</div>' +
        '      <div ng-if="matchClass && result.description && result.description != \'\'" class="angucomplete-description" ng-bind-html="result.description"></div>' +
        '      <div ng-if="!matchClass && result.description && result.description != \'\'" class="angucomplete-description">{{result.description}}</div>' +
        '    </div>' +
        '  </div>' +
        '</div>'
    );

    function link(scope, elem, attrs, ctrl) {
      var inputField = elem.find('input');
      var minlength = MIN_LENGTH;
      var searchTimer = null;
      var hideTimer;
      var requiredClassName = REQUIRED_CLASS;
      var responseFormatter;
      var validState = null;
      var httpCanceller = null;
      var httpCallInProgress = false;
      var dd = elem[0].querySelector('.angucomplete-dropdown');
      var isScrollOn = false;
      var mousedownOn = null;
      var unbindInitialValue;
      var displaySearching;
      var displayNoResults;

      elem.on('mousedown', function(event) {
        if (event.target.id) {
          mousedownOn = event.target.id;
          if (mousedownOn === scope.id + '_dropdown') {
            document.body.addEventListener('click', clickoutHandlerForDropdown);
          }
        }
        else {
          mousedownOn = event.target.className;
        }
      });

      scope.currentIndex = scope.focusFirst ? 0 : null;
      scope.searching = false;
      unbindInitialValue = scope.$watch('initialValue', function(newval) {
        if (newval) {
          // remove scope listener
          unbindInitialValue();
          // change input
          handleInputChange(newval, true);
        }
      });

      scope.$watch('fieldRequired', function(newval, oldval) {
        if (newval !== oldval) {
          if (!newval) {
            ctrl[scope.inputName].$setValidity(requiredClassName, true);
          }
          else if (!validState || scope.currentIndex === -1) {
            handleRequired(false);
          }
          else {
            handleRequired(true);
          }
        }
      });

      scope.$on('angucomplete-alt:clearInput', function (event, elementId) {
        if (!elementId || elementId === scope.id) {
          scope.searchStr = null;
          callOrAssign();
          handleRequired(false);
          clearResults();
        }
      });

      scope.$on('angucomplete-alt:changeInput', function (event, elementId, newval) {
        if (!!elementId && elementId === scope.id) {
          handleInputChange(newval);
        }
      });

      function handleInputChange(newval, initial) {
        if (newval) {
          if (typeof newval === 'object') {
            scope.searchStr = extractTitle(newval);
            callOrAssign({originalObject: newval});
          } else if (typeof newval === 'string' && newval.length > 0) {
            scope.searchStr = newval;
          } else {
            if (console && console.error) {
              console.error('Tried to set ' + (!!initial ? 'initial' : '') + ' value of angucomplete to', newval, 'which is an invalid value');
            }
          }

          handleRequired(true);
        }
      }

      // #194 dropdown list not consistent in collapsing (bug).
      function clickoutHandlerForDropdown(event) {
        mousedownOn = null;
        scope.hideResults(event);
        document.body.removeEventListener('click', clickoutHandlerForDropdown);
      }

      // for IE8 quirkiness about event.which
      function ie8EventNormalizer(event) {
        return event.which ? event.which : event.keyCode;
      }

      function callOrAssign(value) {
        if (typeof scope.selectedObject === 'function') {
          scope.selectedObject(value, scope.selectedObjectData);
        }
        else {
          scope.selectedObject = value;
        }

        if (value) {
          handleRequired(true);
        }
        else {
          handleRequired(false);
        }
      }

      function callFunctionOrIdentity(fn) {
        return function(data) {
          return scope[fn] ? scope[fn](data) : data;
        };
      }

      function setInputString(str) {
        callOrAssign({originalObject: str});

        if (scope.clearSelected) {
          scope.searchStr = null;
        }
        clearResults();
      }

      function extractTitle(data) {
        // split title fields and run extractValue for each and join with ' '
        return scope.titleField.split(',')
          .map(function(field) {
            return extractValue(data, field);
          })
          .join(' ');
      }

      function extractValue(obj, key) {
        var keys, result;
        if (key) {
          keys= key.split('.');
          result = obj;
          for (var i = 0; i < keys.length; i++) {
            result = result[keys[i]];
          }
        }
        else {
          result = obj;
        }
        return result;
      }

      function findMatchString(target, str) {
        var result, matches, re;
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
        // Escape user input to be treated as a literal string within a regular expression
        re = new RegExp(str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        if (!target) { return; }
        if (!target.match || !target.replace) { target = target.toString(); }
        matches = target.match(re);
        if (matches) {
          result = target.replace(re,
              '<span class="'+ scope.matchClass +'">'+ matches[0] +'</span>');
        }
        else {
          result = target;
        }
        return $sce.trustAsHtml(result);
      }

      function handleRequired(valid) {
        scope.notEmpty = valid;
        validState = scope.searchStr;
        if (scope.fieldRequired && ctrl && scope.inputName) {
          ctrl[scope.inputName].$setValidity(requiredClassName, valid);
        }
      }

      function keyupHandler(event) {
        var which = ie8EventNormalizer(event);
        if (which === KEY_LF || which === KEY_RT) {
          // do nothing
          return;
        }

        if (which === KEY_UP || which === KEY_EN) {
          event.preventDefault();
        }
        else if (which === KEY_DW) {
          event.preventDefault();
          if (!scope.showDropdown && scope.searchStr && scope.searchStr.length >= minlength) {
            initResults();
            scope.searching = true;
            searchTimerComplete(scope.searchStr);
          }
        }
        else if (which === KEY_ES) {
          clearResults();
          scope.$apply(function() {
            inputField.val(scope.searchStr);
          });
        }
        else {
          if (minlength === 0 && !scope.searchStr) {
            return;
          }

          if (!scope.searchStr || scope.searchStr === '') {
            scope.showDropdown = false;
          } else if (scope.searchStr.length >= minlength) {
            initResults();

            if (searchTimer) {
              $timeout.cancel(searchTimer);
            }

            scope.searching = true;

            searchTimer = $timeout(function() {
              searchTimerComplete(scope.searchStr);
            }, scope.pause);
          }

          if (validState && validState !== scope.searchStr && !scope.clearSelected) {
            scope.$apply(function() {
              callOrAssign();
            });
          }
        }
      }

      function handleOverrideSuggestions(event) {
        if (scope.overrideSuggestions &&
            !(scope.selectedObject && scope.selectedObject.originalObject === scope.searchStr)) {
          if (event) {
            event.preventDefault();
          }

          // cancel search timer
          $timeout.cancel(searchTimer);
          // cancel http request
          cancelHttpRequest();

          setInputString(scope.searchStr);
        }
      }

      function dropdownRowOffsetHeight(row) {
        var css = getComputedStyle(row);
        return row.offsetHeight +
          parseInt(css.marginTop, 10) + parseInt(css.marginBottom, 10);
      }

      function dropdownHeight() {
        return dd.getBoundingClientRect().top +
          parseInt(getComputedStyle(dd).maxHeight, 10);
      }

      function dropdownRow() {
        return elem[0].querySelectorAll('.angucomplete-row')[scope.currentIndex];
      }

      function dropdownRowTop() {
        return dropdownRow().getBoundingClientRect().top -
          (dd.getBoundingClientRect().top +
           parseInt(getComputedStyle(dd).paddingTop, 10));
      }

      function dropdownScrollTopTo(offset) {
        dd.scrollTop = dd.scrollTop + offset;
      }

      function updateInputField(){
        var current = scope.results[scope.currentIndex];
        if (scope.matchClass) {
          inputField.val(extractTitle(current.originalObject));
        }
        else {
          inputField.val(current.title);
        }
      }

      function keydownHandler(event) {
        var which = ie8EventNormalizer(event);
        var row = null;
        var rowTop = null;

        if (which === KEY_EN && scope.results) {
          if (scope.currentIndex >= 0 && scope.currentIndex < scope.results.length) {
            event.preventDefault();
            scope.selectResult(scope.results[scope.currentIndex]);
          } else {
            handleOverrideSuggestions(event);
            clearResults();
          }
          scope.$apply();
        } else if (which === KEY_DW && scope.results) {
          event.preventDefault();
          if ((scope.currentIndex + 1) < scope.results.length && scope.showDropdown) {
            scope.$apply(function() {
              scope.currentIndex ++;
              updateInputField();
            });

            if (isScrollOn) {
              row = dropdownRow();
              if (dropdownHeight() < row.getBoundingClientRect().bottom) {
                dropdownScrollTopTo(dropdownRowOffsetHeight(row));
              }
            }
          }
        } else if (which === KEY_UP && scope.results) {
          event.preventDefault();
          if (scope.currentIndex >= 1) {
            scope.$apply(function() {
              scope.currentIndex --;
              updateInputField();
            });

            if (isScrollOn) {
              rowTop = dropdownRowTop();
              if (rowTop < 0) {
                dropdownScrollTopTo(rowTop - 1);
              }
            }
          }
          else if (scope.currentIndex === 0) {
            scope.$apply(function() {
              scope.currentIndex = -1;
              inputField.val(scope.searchStr);
            });
          }
        } else if (which === KEY_TAB) {
          if (scope.results && scope.results.length > 0 && scope.showDropdown) {
            if (scope.currentIndex === -1 && scope.overrideSuggestions) {
              // intentionally not sending event so that it does not
              // prevent default tab behavior
              handleOverrideSuggestions();
            }
            else {
              if (scope.currentIndex === -1) {
                scope.currentIndex = 0;
              }
              scope.selectResult(scope.results[scope.currentIndex]);
              scope.$digest();
            }
          }
          else {
            // no results
            // intentionally not sending event so that it does not
            // prevent default tab behavior
            if (scope.searchStr && scope.searchStr.length > 0) {
              handleOverrideSuggestions();
            }
          }
        } else if (which === KEY_ES) {
          // This is very specific to IE10/11 #272
          // without this, IE clears the input text
          event.preventDefault();
        }
      }

      function httpSuccessCallbackGen(str) {
        return function(responseData, status, headers, config) {
          // normalize return obejct from promise
          if (!status && !headers && !config && responseData.data) {
            responseData = responseData.data;
          }
          scope.searching = false;
          processResults(
            extractValue(responseFormatter(responseData), scope.remoteUrlDataField),
            str);
        };
      }

      function httpErrorCallback(errorRes, status, headers, config) {
        scope.searching = httpCallInProgress;

        // normalize return obejct from promise
        if (!status && !headers && !config) {
          status = errorRes.status;
        }

        // cancelled/aborted
        if (status === 0 || status === -1) { return; }
        if (scope.remoteUrlErrorCallback) {
          scope.remoteUrlErrorCallback(errorRes, status, headers, config);
        }
        else {
          if (console && console.error) {
            console.error('http error');
          }
        }
      }

      function cancelHttpRequest() {
        if (httpCanceller) {
          httpCanceller.resolve();
        }
      }

      function getRemoteResults(str) {
        var params = {},
            url = scope.remoteUrl + encodeURIComponent(str);
        if (scope.remoteUrlRequestFormatter) {
          params = {params: scope.remoteUrlRequestFormatter(str)};
          url = scope.remoteUrl;
        }
        if (!!scope.remoteUrlRequestWithCredentials) {
          params.withCredentials = true;
        }
        cancelHttpRequest();
        httpCanceller = $q.defer();
        params.timeout = httpCanceller.promise;
        httpCallInProgress = true;
        $http.get(url, params)
          .success(httpSuccessCallbackGen(str))
          .error(httpErrorCallback)
          .finally(function(){httpCallInProgress=false;});
      }

      function getRemoteResultsWithCustomHandler(str) {
        cancelHttpRequest();

        httpCanceller = $q.defer();

        scope.remoteApiHandler(str, httpCanceller.promise)
          .then(httpSuccessCallbackGen(str))
          .catch(httpErrorCallback);

        /* IE8 compatible
        scope.remoteApiHandler(str, httpCanceller.promise)
          ['then'](httpSuccessCallbackGen(str))
          ['catch'](httpErrorCallback);
        */
      }

      function clearResults() {
        scope.showDropdown = false;
        scope.results = [];
        if (dd) {
          dd.scrollTop = 0;
        }
      }

      function initResults() {
        scope.showDropdown = displaySearching;
        scope.currentIndex = scope.focusFirst ? 0 : -1;
        scope.results = [];
      }

      function getLocalResults(str) {
        var i, match, s, value,
            searchFields = scope.searchFields.split(','),
            matches = [];
        if (typeof scope.parseInput() !== 'undefined') {
          str = scope.parseInput()(str);
        }
        for (i = 0; i < scope.localData.length; i++) {
          match = false;

          for (s = 0; s < searchFields.length; s++) {
            value = extractValue(scope.localData[i], searchFields[s]) || '';
            match = match || (value.toString().toLowerCase().indexOf(str.toString().toLowerCase()) >= 0);
          }

          if (match) {
            matches[matches.length] = scope.localData[i];
          }
        }
        return matches;
      }

      function checkExactMatch(result, obj, str){
        if (!str) { return false; }
        for(var key in obj){
          if(obj[key].toLowerCase() === str.toLowerCase()){
            scope.selectResult(result);
            return true;
          }
        }
        return false;
      }

      function searchTimerComplete(str) {
        // Begin the search
        if (!str || str.length < minlength) {
          return;
        }
        if (scope.localData) {
          scope.$apply(function() {
            var matches;
            if (typeof scope.localSearch() !== 'undefined') {
              matches = scope.localSearch()(str, scope.localData);
            } else {
              matches = getLocalResults(str);
            }
            scope.searching = false;
            processResults(matches, str);
          });
        }
        else if (scope.remoteApiHandler) {
          getRemoteResultsWithCustomHandler(str);
        } else {
          getRemoteResults(str);
        }
      }

      function processResults(responseData, str) {
        var i, description, image, text, formattedText, formattedDesc;

        if (responseData && responseData.length > 0) {
          scope.results = [];

          for (i = 0; i < responseData.length; i++) {
            if (scope.titleField && scope.titleField !== '') {
              text = formattedText = extractTitle(responseData[i]);
            }

            description = '';
            if (scope.descriptionField) {
              description = formattedDesc = extractValue(responseData[i], scope.descriptionField);
            }

            image = '';
            if (scope.imageField) {
              image = extractValue(responseData[i], scope.imageField);
            }

            if (scope.matchClass) {
              formattedText = findMatchString(text, str);
              formattedDesc = findMatchString(description, str);
            }

            scope.results[scope.results.length] = {
              title: formattedText,
              description: formattedDesc,
              image: image,
              originalObject: responseData[i]
            };
          }

        } else {
          scope.results = [];
        }

        if (scope.autoMatch && scope.results.length === 1 &&
            checkExactMatch(scope.results[0],
              {title: text, desc: description || ''}, scope.searchStr)) {
          scope.showDropdown = false;
        } else if (scope.results.length === 0 && !displayNoResults) {
          scope.showDropdown = false;
        } else {
          scope.showDropdown = true;
        }
      }

      function showAll() {
        if (scope.localData) {
          scope.searching = false;
          processResults(scope.localData, '');
        }
        else if (scope.remoteApiHandler) {
          scope.searching = true;
          getRemoteResultsWithCustomHandler('');
        }
        else {
          scope.searching = true;
          getRemoteResults('');
        }
      }

      scope.onFocusHandler = function() {
        if (scope.focusIn) {
          scope.focusIn();
        }
        if (minlength === 0 && (!scope.searchStr || scope.searchStr.length === 0)) {
          scope.currentIndex = scope.focusFirst ? 0 : scope.currentIndex;
          scope.showDropdown = true;
          showAll();
        }
      };

      scope.hideResults = function() {
        if (mousedownOn &&
            (mousedownOn === scope.id + '_dropdown' ||
             mousedownOn.indexOf('angucomplete') >= 0)) {
          mousedownOn = null;
        }
        else {
          hideTimer = $timeout(function() {
            clearResults();
            scope.$apply(function() {
              if (scope.searchStr && scope.searchStr.length > 0) {
                inputField.val(scope.searchStr);
              }
            });
          }, BLUR_TIMEOUT);
          cancelHttpRequest();

          if (scope.focusOut) {
            scope.focusOut();
          }

          if (scope.overrideSuggestions) {
            if (scope.searchStr && scope.searchStr.length > 0 && scope.currentIndex === -1) {
              handleOverrideSuggestions();
            }
          }
        }
      };

      scope.resetHideResults = function() {
        if (hideTimer) {
          $timeout.cancel(hideTimer);
        }
      };

      scope.hoverRow = function(index) {
        scope.currentIndex = index;
      };

      scope.selectResult = function(result) {
        // Restore original values
        if (scope.matchClass) {
          result.title = extractTitle(result.originalObject);
          result.description = extractValue(result.originalObject, scope.descriptionField);
        }

        if (scope.clearSelected) {
          scope.searchStr = null;
        }
        else {
          scope.searchStr = result.title;
        }
        callOrAssign(result);
        clearResults();
      };

      scope.inputChangeHandler = function(str) {
        if (str.length < minlength) {
          cancelHttpRequest();
          clearResults();
        }
        else if (str.length === 0 && minlength === 0) {
          showAll();
        }

        if (scope.inputChanged) {
          str = scope.inputChanged(str);
        }
        return str;
      };

      // check required
      if (scope.fieldRequiredClass && scope.fieldRequiredClass !== '') {
        requiredClassName = scope.fieldRequiredClass;
      }

      // check min length
      if (scope.minlength && scope.minlength !== '') {
        minlength = parseInt(scope.minlength, 10);
      }

      // check pause time
      if (!scope.pause) {
        scope.pause = PAUSE;
      }

      // check clearSelected
      if (!scope.clearSelected) {
        scope.clearSelected = false;
      }

      // check override suggestions
      if (!scope.overrideSuggestions) {
        scope.overrideSuggestions = false;
      }

      // check required field
      if (scope.fieldRequired && ctrl) {
        // check initial value, if given, set validitity to true
        if (scope.initialValue) {
          handleRequired(true);
        }
        else {
          handleRequired(false);
        }
      }

      scope.inputType = attrs.type ? attrs.type : 'text';

      // set strings for "Searching..." and "No results"
      scope.textSearching = attrs.textSearching ? attrs.textSearching : TEXT_SEARCHING;
      scope.textNoResults = attrs.textNoResults ? attrs.textNoResults : TEXT_NORESULTS;
      displaySearching = scope.textSearching === 'false' ? false : true;
      displayNoResults = scope.textNoResults === 'false' ? false : true;

      // set max length (default to maxlength deault from html
      scope.maxlength = attrs.maxlength ? attrs.maxlength : MAX_LENGTH;

      // register events
      inputField.on('keydown', keydownHandler);
      inputField.on('keyup compositionend', keyupHandler);

      // set response formatter
      responseFormatter = callFunctionOrIdentity('remoteUrlResponseFormatter');

      // set isScrollOn
      $timeout(function() {
        var css = getComputedStyle(dd);
        isScrollOn = css.maxHeight && css.overflowY === 'auto';
      });
    }

    return {
      restrict: 'EA',
      require: '^?form',
      scope: {
        selectedObject: '=',
        selectedObjectData: '=',
        disableInput: '=',
        initialValue: '=',
        localData: '=',
        localSearch: '&',
        remoteUrlRequestFormatter: '=',
        remoteUrlRequestWithCredentials: '@',
        remoteUrlResponseFormatter: '=',
        remoteUrlErrorCallback: '=',
        remoteApiHandler: '=',
        id: '@',
        type: '@',
        placeholder: '@',
        textSearching: '@',
        textNoResults: '@',
        remoteUrl: '@',
        remoteUrlDataField: '@',
        titleField: '@',
        descriptionField: '@',
        imageField: '@',
        inputClass: '@',
        pause: '@',
        searchFields: '@',
        minlength: '@',
        matchClass: '@',
        clearSelected: '@',
        overrideSuggestions: '@',
        fieldRequired: '=',
        fieldRequiredClass: '@',
        inputChanged: '=',
        autoMatch: '@',
        focusOut: '&',
        focusIn: '&',
        fieldTabindex: '@',
        inputName: '@',
        focusFirst: '@',
        parseInput: '&'
      },
      templateUrl: function(element, attrs) {
        return attrs.templateUrl || TEMPLATE_URL;
      },
      compile: function(tElement) {
        var startSym = $interpolate.startSymbol();
        var endSym = $interpolate.endSymbol();
        if (!(startSym === '{{' && endSym === '}}')) {
          var interpolatedHtml = tElement.html()
            .replace(/\{\{/g, startSym)
            .replace(/\}\}/g, endSym);
          tElement.html(interpolatedHtml);
        }
        return link;
      }
    };
  }]);

}));

/*
 AngularJS v1.5.8
 (c) 2010-2016 Google, Inc. http://angularjs.org
 License: MIT
*/
(function(P,d){'use strict';function G(t,g){g=g||{};d.forEach(g,function(d,q){delete g[q]});for(var q in t)!t.hasOwnProperty(q)||"$"===q.charAt(0)&&"$"===q.charAt(1)||(g[q]=t[q]);return g}var z=d.$$minErr("$resource"),M=/^(\.[a-zA-Z_$@][0-9a-zA-Z_$@]*)+$/;d.module("ngResource",["ng"]).provider("$resource",function(){var t=/^https?:\/\/[^\/]*/,g=this;this.defaults={stripTrailingSlashes:!0,cancellable:!1,actions:{get:{method:"GET"},save:{method:"POST"},query:{method:"GET",isArray:!0},remove:{method:"DELETE"},
"delete":{method:"DELETE"}}};this.$get=["$http","$log","$q","$timeout",function(q,L,H,I){function A(d,h){return encodeURIComponent(d).replace(/%40/gi,"@").replace(/%3A/gi,":").replace(/%24/g,"$").replace(/%2C/gi,",").replace(/%20/g,h?"%20":"+")}function B(d,h){this.template=d;this.defaults=v({},g.defaults,h);this.urlParams={}}function J(e,h,n,k){function b(a,c){var b={};c=v({},h,c);u(c,function(c,h){x(c)&&(c=c(a));var f;if(c&&c.charAt&&"@"==c.charAt(0)){f=a;var l=c.substr(1);if(null==l||""===l||"hasOwnProperty"===
l||!M.test("."+l))throw z("badmember",l);for(var l=l.split("."),m=0,k=l.length;m<k&&d.isDefined(f);m++){var r=l[m];f=null!==f?f[r]:void 0}}else f=c;b[h]=f});return b}function N(a){return a.resource}function m(a){G(a||{},this)}var t=new B(e,k);n=v({},g.defaults.actions,n);m.prototype.toJSON=function(){var a=v({},this);delete a.$promise;delete a.$resolved;return a};u(n,function(a,c){var h=/^(POST|PUT|PATCH)$/i.test(a.method),e=a.timeout,E=d.isDefined(a.cancellable)?a.cancellable:k&&d.isDefined(k.cancellable)?
k.cancellable:g.defaults.cancellable;e&&!d.isNumber(e)&&(L.debug("ngResource:\n  Only numeric values are allowed as `timeout`.\n  Promises are not supported in $resource, because the same value would be used for multiple requests. If you are looking for a way to cancel requests, you should use the `cancellable` option."),delete a.timeout,e=null);m[c]=function(f,l,k,g){var r={},n,w,C;switch(arguments.length){case 4:C=g,w=k;case 3:case 2:if(x(l)){if(x(f)){w=f;C=l;break}w=l;C=k}else{r=f;n=l;w=k;break}case 1:x(f)?
w=f:h?n=f:r=f;break;case 0:break;default:throw z("badargs",arguments.length);}var D=this instanceof m,p=D?n:a.isArray?[]:new m(n),s={},A=a.interceptor&&a.interceptor.response||N,B=a.interceptor&&a.interceptor.responseError||void 0,y,F;u(a,function(a,c){switch(c){default:s[c]=O(a);case "params":case "isArray":case "interceptor":case "cancellable":}});!D&&E&&(y=H.defer(),s.timeout=y.promise,e&&(F=I(y.resolve,e)));h&&(s.data=n);t.setUrlParams(s,v({},b(n,a.params||{}),r),a.url);r=q(s).then(function(f){var b=
f.data;if(b){if(d.isArray(b)!==!!a.isArray)throw z("badcfg",c,a.isArray?"array":"object",d.isArray(b)?"array":"object",s.method,s.url);if(a.isArray)p.length=0,u(b,function(a){"object"===typeof a?p.push(new m(a)):p.push(a)});else{var l=p.$promise;G(b,p);p.$promise=l}}f.resource=p;return f},function(a){(C||K)(a);return H.reject(a)});r["finally"](function(){p.$resolved=!0;!D&&E&&(p.$cancelRequest=d.noop,I.cancel(F),y=F=s.timeout=null)});r=r.then(function(a){var c=A(a);(w||K)(c,a.headers);return c},B);
return D?r:(p.$promise=r,p.$resolved=!1,E&&(p.$cancelRequest=y.resolve),p)};m.prototype["$"+c]=function(a,b,d){x(a)&&(d=b,b=a,a={});a=m[c].call(this,a,this,b,d);return a.$promise||a}});m.bind=function(a){return J(e,v({},h,a),n)};return m}var K=d.noop,u=d.forEach,v=d.extend,O=d.copy,x=d.isFunction;B.prototype={setUrlParams:function(e,h,n){var k=this,b=n||k.template,g,m,q="",a=k.urlParams={};u(b.split(/\W/),function(c){if("hasOwnProperty"===c)throw z("badname");!/^\d+$/.test(c)&&c&&(new RegExp("(^|[^\\\\]):"+
c+"(\\W|$)")).test(b)&&(a[c]={isQueryParamValue:(new RegExp("\\?.*=:"+c+"(?:\\W|$)")).test(b)})});b=b.replace(/\\:/g,":");b=b.replace(t,function(a){q=a;return""});h=h||{};u(k.urlParams,function(a,e){g=h.hasOwnProperty(e)?h[e]:k.defaults[e];d.isDefined(g)&&null!==g?(m=a.isQueryParamValue?A(g,!0):A(g,!0).replace(/%26/gi,"&").replace(/%3D/gi,"=").replace(/%2B/gi,"+"),b=b.replace(new RegExp(":"+e+"(\\W|$)","g"),function(a,c){return m+c})):b=b.replace(new RegExp("(/?):"+e+"(\\W|$)","g"),function(a,c,b){return"/"==
b.charAt(0)?b:c+b})});k.defaults.stripTrailingSlashes&&(b=b.replace(/\/+$/,"")||"/");b=b.replace(/\/\.(?=\w+($|\?))/,".");e.url=q+b.replace(/\/\\\./,"/.");u(h,function(a,b){k.urlParams[b]||(e.params=e.params||{},e.params[b]=a)})}};return J}]})})(window,window.angular);
//# sourceMappingURL=angular-resource.min.js.map

/*!
 * State-based routing for AngularJS
 * @version v1.0.0-beta.3
 * @link https://ui-router.github.io
 * @license MIT License, http://www.opensource.org/licenses/MIT
 */
!function(t,e){"object"==typeof exports&&"object"==typeof module?module.exports=e(require("angular")):"function"==typeof define&&define.amd?define("angular-ui-router",["angular"],e):"object"==typeof exports?exports["angular-ui-router"]=e(require("angular")):t["angular-ui-router"]=e(t.angular)}(this,function(t){return function(t){function e(n){if(r[n])return r[n].exports;var i=r[n]={exports:{},id:n,loaded:!1};return t[n].call(i.exports,i,i.exports,e),i.loaded=!0,i.exports}var r={};return e.m=t,e.c=r,e.p="",e(0)}([function(t,e,r){"use strict";function n(t){for(var r in t)e.hasOwnProperty(r)||(e[r]=t[r])}n(r(1)),n(r(53)),n(r(55)),n(r(58)),r(60),r(61),r(62),r(63),Object.defineProperty(e,"__esModule",{value:!0}),e["default"]="ui.router"},function(t,e,r){"use strict";function n(t){for(var r in t)e.hasOwnProperty(r)||(e[r]=t[r])}n(r(2)),n(r(46)),n(r(47)),n(r(48)),n(r(49)),n(r(50)),n(r(51)),n(r(52)),n(r(44));var i=r(25);e.UIRouter=i.UIRouter},function(t,e,r){"use strict";function n(t){for(var r in t)e.hasOwnProperty(r)||(e[r]=t[r])}n(r(3)),n(r(6)),n(r(7)),n(r(5)),n(r(4)),n(r(8)),n(r(9)),n(r(12))},function(t,e,r){"use strict";function n(t,e,r,n){return void 0===n&&(n=Object.keys(t)),n.filter(function(e){return"function"==typeof t[e]}).forEach(function(n){return e[n]=t[n].bind(r)})}function i(t){void 0===t&&(t={});for(var r=[],n=1;n<arguments.length;n++)r[n-1]=arguments[n];var i=o.apply(null,[{}].concat(r));return e.extend({},i,c(t||{},Object.keys(i)))}function o(t){for(var r=[],n=1;n<arguments.length;n++)r[n-1]=arguments[n];return e.forEach(r,function(r){e.forEach(r,function(e,r){t.hasOwnProperty(r)||(t[r]=e)})}),t}function a(t,e){var r=[];for(var n in t.path){if(t.path[n]!==e.path[n])break;r.push(t.path[n])}return r}function s(t,e,r){void 0===r&&(r=Object.keys(t));for(var n=0;n<r.length;n++){var i=r[n];if(t[i]!=e[i])return!1}return!0}function u(t,e){for(var r=[],n=2;n<arguments.length;n++)r[n-2]=arguments[n];var i={};for(var o in e)t(r,o)&&(i[o]=e[o]);return i}function c(t){return u.apply(null,[e.inArray].concat(T(arguments)))}function f(t){var r=function(t,r){return!e.inArray(t,r)};return u.apply(null,[r].concat(T(arguments)))}function l(t,e){return v(t,P.prop(e))}function p(t,r){var n=k.isArray(t),i=n?[]:{},o=n?function(t){return i.push(t)}:function(t,e){return i[e]=t};return e.forEach(t,function(t,e){r(t,e)&&o(t,e)}),i}function h(t,r){var n;return e.forEach(t,function(t,e){n||r(t,e)&&(n=t)}),n}function v(t,r){var n=k.isArray(t)?[]:{};return e.forEach(t,function(t,e){return n[e]=r(t,e)}),n}function d(t,e){return t.push(e),t}function m(t,e){return void 0===e&&(e="assert failure"),function(r){if(!t(r))throw new Error(k.isFunction(e)?e(r):e);return!0}}function g(){for(var t=[],e=0;e<arguments.length;e++)t[e-0]=arguments[e];if(0===t.length)return[];var r=t.reduce(function(t,e){return Math.min(e.length,t)},9007199254740991);return Array.apply(null,Array(r)).map(function(e,r){return t.map(function(t){return t[r]})})}function y(t,e){var r,n;if(k.isArray(e)&&(r=e[0],n=e[1]),!k.isString(r))throw new Error("invalid parameters to applyPairs");return t[r]=n,t}function w(t){return t.length&&t[t.length-1]||void 0}function b(t,r){return r&&Object.keys(r).forEach(function(t){return delete r[t]}),r||(r={}),e.extend(r,t)}function $(t,e,r){return k.isArray(t)?t.forEach(e,r):void Object.keys(t).forEach(function(r){return e(t[r],r)})}function R(t,e){return Object.keys(e).forEach(function(r){return t[r]=e[r]}),t}function S(t){return T(arguments,1).filter(e.identity).reduce(R,t)}function E(t,e){if(t===e)return!0;if(null===t||null===e)return!1;if(t!==t&&e!==e)return!0;var r=typeof t,n=typeof e;if(r!==n||"object"!==r)return!1;var i=[t,e];if(P.all(k.isArray)(i))return x(t,e);if(P.all(k.isDate)(i))return t.getTime()===e.getTime();if(P.all(k.isRegExp)(i))return t.toString()===e.toString();if(P.all(k.isFunction)(i))return!0;var o=[k.isFunction,k.isArray,k.isDate,k.isRegExp];if(o.map(P.any).reduce(function(t,e){return t||!!e(i)},!1))return!1;var a,s={};for(a in t){if(!E(t[a],e[a]))return!1;s[a]=!0}for(a in e)if(!s[a])return!1;return!0}function x(t,e){return t.length===e.length&&g(t,e).reduce(function(t,e){return t&&E(e[0],e[1])},!0)}var k=r(4),P=r(5),_=r(6),C="undefined"==typeof window?{}:window,O=C.angular||{};e.fromJson=O.fromJson||JSON.parse.bind(JSON),e.toJson=O.toJson||JSON.stringify.bind(JSON),e.copy=O.copy||b,e.forEach=O.forEach||$,e.extend=O.extend||S,e.equals=O.equals||E,e.identity=function(t){return t},e.noop=function(){},e.bindFunctions=n,e.inherit=function(t,r){return e.extend(new(e.extend(function(){},{prototype:t})),r)};var T=function(t,e){return void 0===e&&(e=0),Array.prototype.concat.apply(Array.prototype,Array.prototype.slice.call(t,e))};e.inArray=function(t,e){return t.indexOf(e)!==-1},e.removeFrom=P.curry(function(t,e){var r=t.indexOf(e);return r>=0&&t.splice(r,1),t}),e.defaults=i,e.merge=o,e.mergeR=function(t,r){return e.extend(t,r)},e.ancestors=a,e.equalForKeys=s,e.pick=c,e.omit=f,e.pluck=l,e.filter=p,e.find=h,e.mapObj=v,e.map=v,e.values=function(t){return Object.keys(t).map(function(e){return t[e]})},e.allTrueR=function(t,e){return t&&e},e.anyTrueR=function(t,e){return t||e},e.unnestR=function(t,e){return t.concat(e)},e.flattenR=function(t,r){return k.isArray(r)?t.concat(r.reduce(e.flattenR,[])):d(t,r)},e.pushR=d,e.uniqR=function(t,r){return e.inArray(t,r)?t:d(t,r)},e.unnest=function(t){return t.reduce(e.unnestR,[])},e.flatten=function(t){return t.reduce(e.flattenR,[])},e.assertPredicate=m,e.pairs=function(t){return Object.keys(t).map(function(e){return[e,t[e]]})},e.arrayTuples=g,e.applyPairs=y,e.tail=w,e.silenceUncaughtInPromise=function(t){return t["catch"](function(t){return 0})&&t},e.silentRejection=function(t){return e.silenceUncaughtInPromise(_.services.$q.reject(t))}},function(t,e,r){"use strict";function n(t){if(e.isArray(t)&&t.length){var r=t.slice(0,-1),n=t.slice(-1);return!(r.filter(i.not(e.isString)).length||n.filter(i.not(e.isFunction)).length)}return e.isFunction(t)}var i=r(5),o=Object.prototype.toString,a=function(t){return function(e){return typeof e===t}};e.isUndefined=a("undefined"),e.isDefined=i.not(e.isUndefined),e.isNull=function(t){return null===t},e.isFunction=a("function"),e.isNumber=a("number"),e.isString=a("string"),e.isObject=function(t){return null!==t&&"object"==typeof t},e.isArray=Array.isArray,e.isDate=function(t){return"[object Date]"===o.call(t)},e.isRegExp=function(t){return"[object RegExp]"===o.call(t)},e.isInjectable=n,e.isPromise=i.and(e.isObject,i.pipe(i.prop("then"),e.isFunction))},function(t,e){"use strict";function r(t){function e(r){return r.length>=n?t.apply(null,r):function(){return e(r.concat([].slice.apply(arguments)))}}var r=[].slice.apply(arguments,[1]),n=t.length;return e(r)}function n(){var t=arguments,e=t.length-1;return function(){for(var r=e,n=t[e].apply(this,arguments);r--;)n=t[r].call(this,n);return n}}function i(){for(var t=[],e=0;e<arguments.length;e++)t[e-0]=arguments[e];return n.apply(null,[].slice.call(arguments).reverse())}function o(t,e){return function(){for(var r=[],n=0;n<arguments.length;n++)r[n-0]=arguments[n];return t.apply(null,r)&&e.apply(null,r)}}function a(t,e){return function(){for(var r=[],n=0;n<arguments.length;n++)r[n-0]=arguments[n];return t.apply(null,r)||e.apply(null,r)}}function s(t,e){return function(r){return r[t].apply(r,e)}}function u(t){return function(e){for(var r=0;r<t.length;r++)if(t[r][0](e))return t[r][1](e)}}e.curry=r,e.compose=n,e.pipe=i,e.prop=function(t){return function(e){return e&&e[t]}},e.propEq=r(function(t,e,r){return r&&r[t]===e}),e.parse=function(t){return i.apply(null,t.split(".").map(e.prop))},e.not=function(t){return function(){for(var e=[],r=0;r<arguments.length;r++)e[r-0]=arguments[r];return!t.apply(null,e)}},e.and=o,e.or=a,e.all=function(t){return function(e){return e.reduce(function(e,r){return e&&!!t(r)},!0)}},e.any=function(t){return function(e){return e.reduce(function(e,r){return e||!!t(r)},!1)}},e.is=function(t){return function(e){return null!=e&&e.constructor===t||e instanceof t}},e.eq=function(t){return function(e){return t===e}},e.val=function(t){return function(){return t}},e.invoke=s,e.pattern=u},function(t,e){"use strict";var r=function(t){return function(){throw new Error(t+"(): No coreservices implementation for UI-Router is loaded. You should include one of: ['angular1.js']")}},n={$q:void 0,$injector:void 0,location:{},locationConfig:{},template:{}};e.services=n,["setUrl","path","search","hash","onChange"].forEach(function(t){return n.location[t]=r(t)}),["port","protocol","host","baseHref","html5Mode","hashPrefix"].forEach(function(t){return n.locationConfig[t]=r(t)})},function(t,e){"use strict";var r=function(){function t(t){this.text=t,this.glob=t.split(".");var e=this.text.split(".").map(function(t){return"**"===t?"(?:|(?:\\.[^.]*)*)":"*"===t?"\\.[^.]*":"\\."+t}).join("");this.regexp=new RegExp("^"+e+"$")}return t.prototype.matches=function(t){return this.regexp.test("."+t)},t.is=function(t){return t.indexOf("*")>-1},t.fromString=function(e){return this.is(e)?new t(e):null},t}();e.Glob=r},function(t,e){"use strict";var r=function(){function t(t,e){void 0===t&&(t=[]),void 0===e&&(e=null),this._items=t,this._limit=e}return t.prototype.enqueue=function(t){var e=this._items;return e.push(t),this._limit&&e.length>this._limit&&e.shift(),t},t.prototype.dequeue=function(){if(this.size())return this._items.splice(0,1)[0]},t.prototype.clear=function(){var t=this._items;return this._items=[],t},t.prototype.size=function(){return this._items.length},t.prototype.remove=function(t){var e=this._items.indexOf(t);return e>-1&&this._items.splice(e,1)[0]},t.prototype.peekTail=function(){return this._items[this._items.length-1]},t.prototype.peekHead=function(){if(this.size())return this._items[0]},t}();e.Queue=r},function(t,e,r){"use strict";function n(t,e){return e.length<=t?e:e.substr(0,t-3)+"..."}function i(t,e){for(;e.length<t;)e+=" ";return e}function o(t){return t.replace(/^([A-Z])/,function(t){return t.toLowerCase()}).replace(/([A-Z])/g,function(t){return"-"+t.toLowerCase()})}function a(t){var e=s(t),r=e.match(/^(function [^ ]+\([^)]*\))/),n=r?r[1]:e,i=t.name||"";return i&&n.match(/function \(/)?"function "+i+n.substr(9):n}function s(t){var e=c.isArray(t)?t.slice(-1)[0]:t;return e&&e.toString()||"undefined"}function u(t){function e(t){if(c.isObject(t)){if(r.indexOf(t)!==-1)return"[circular ref]";r.push(t)}return m(t)}var r=[];return JSON.stringify(t,function(t,r){return e(r)}).replace(/\\"/g,'"')}var c=r(4),f=r(10),l=r(3),p=r(5),h=r(11),v=r(19);e.maxLength=n,e.padString=i,e.kebobString=o,e.functionToString=a,e.fnToString=s;var d=null,m=function(t){var e=f.Rejection.isTransitionRejectionPromise;return(d=d||p.pattern([[p.not(c.isDefined),p.val("undefined")],[c.isNull,p.val("null")],[c.isPromise,p.val("[Promise]")],[e,function(t){return t._transitionRejection.toString()}],[p.is(f.Rejection),p.invoke("toString")],[p.is(h.Transition),p.invoke("toString")],[p.is(v.Resolvable),p.invoke("toString")],[c.isInjectable,a],[p.val(!0),l.identity]]))(t)};e.stringify=u,e.beforeAfterSubstr=function(t){return function(e){if(!e)return["",""];var r=e.indexOf(t);return r===-1?[e,""]:[e.substr(0,r),e.substr(r+1)]}}},function(t,e,r){"use strict";var n=r(3),i=r(9);!function(t){t[t.SUPERSEDED=2]="SUPERSEDED",t[t.ABORTED=3]="ABORTED",t[t.INVALID=4]="INVALID",t[t.IGNORED=5]="IGNORED",t[t.ERROR=6]="ERROR"}(e.RejectType||(e.RejectType={}));var o=e.RejectType,a=function(){function t(t,e,r){this.type=t,this.message=e,this.detail=r}return t.prototype.toString=function(){var t=function(t){return t&&t.toString!==Object.prototype.toString?t.toString():i.stringify(t)},e=this.type,r=this.message,n=t(this.detail);return"TransitionRejection(type: "+e+", message: "+r+", detail: "+n+")"},t.prototype.toPromise=function(){return n.extend(n.silentRejection(this),{_transitionRejection:this})},t.isTransitionRejectionPromise=function(e){return e&&"function"==typeof e.then&&e._transitionRejection instanceof t},t.superseded=function(e,r){var n="The transition has been superseded by a different transition",i=new t(o.SUPERSEDED,n,e);return r&&r.redirected&&(i.redirected=!0),i},t.redirected=function(e){return t.superseded(e,{redirected:!0})},t.invalid=function(e){var r="This transition is invalid";return new t(o.INVALID,r,e)},t.ignored=function(e){var r="The transition was ignored";return new t(o.IGNORED,r,e)},t.aborted=function(e){var r="The transition has been aborted";return new t(o.ABORTED,r,e)},t.errored=function(e){var r="The transition errored";return new t(o.ERROR,r,e)},t}();e.Rejection=a},function(t,e,r){"use strict";var n=r(9),i=r(12),o=r(6),a=r(3),s=r(4),u=r(5),c=r(13),f=r(15),l=r(16),p=r(21),h=r(20),v=r(14),d=r(22),m=r(19),g=r(10),y=r(17),w=r(25),b=0,$=u.prop("self"),R=function(){function t(e,r,n){var i=this;if(this._deferred=o.services.$q.defer(),this.promise=this._deferred.promise,this.treeChanges=function(){return i._treeChanges},this.isActive=function(){return i===i._options.current()},this.router=n,this._targetState=r,!r.valid())throw new Error(r.error());f.HookRegistry.mixin(new f.HookRegistry,this),this._options=a.extend({current:u.val(this)},r.options()),this.$id=b++;var s=h.PathFactory.buildToPath(e,r);this._treeChanges=h.PathFactory.treeChanges(e,s,this._options.reloadState);var c=this._treeChanges.entering.map(function(t){return t.state});h.PathFactory.applyViewConfigs(n.transitionService.$view,this._treeChanges.to,c);var l=[new m.Resolvable(w.UIRouter,function(){return n},[],(void 0),n),new m.Resolvable(t,function(){return i},[],(void 0),this),new m.Resolvable("$transition$",function(){return i},[],(void 0),this),new m.Resolvable("$stateParams",function(){return i.params()},[],(void 0),this.params())],p=this._treeChanges.to[0],v=new y.ResolveContext(this._treeChanges.to);v.addResolvables(l,p.state)}return t.prototype.onBefore=function(t,e,r){throw""},t.prototype.onStart=function(t,e,r){throw""},t.prototype.onExit=function(t,e,r){throw""},t.prototype.onRetain=function(t,e,r){throw""},t.prototype.onEnter=function(t,e,r){throw""},t.prototype.onFinish=function(t,e,r){throw""},t.prototype.onSuccess=function(t,e,r){throw""},t.prototype.onError=function(t,e,r){throw""},t.prototype.$from=function(){return a.tail(this._treeChanges.from).state},t.prototype.$to=function(){return a.tail(this._treeChanges.to).state},t.prototype.from=function(){return this.$from().self},t.prototype.to=function(){return this.$to().self},t.prototype.targetState=function(){return this._targetState},t.prototype.is=function(e){return e instanceof t?this.is({to:e.$to().name,from:e.$from().name}):!(e.to&&!f.matchState(this.$to(),e.to)||e.from&&!f.matchState(this.$from(),e.from))},t.prototype.params=function(t){return void 0===t&&(t="to"),this._treeChanges[t].map(u.prop("paramValues")).reduce(a.mergeR,{})},t.prototype.injector=function(t){var e=this.treeChanges().to;return t&&(e=h.PathFactory.subPath(e,function(e){return e.state===t||e.state.name===t})),new y.ResolveContext(e).injector()},t.prototype.getResolveTokens=function(){return new y.ResolveContext(this._treeChanges.to).getTokens()},t.prototype.getResolveValue=function(t){var e=new y.ResolveContext(this._treeChanges.to),r=function(t){var r=e.getResolvable(t);if(void 0===r)throw new Error("Dependency Injection token not found: "+n.stringify(t));return r.data};return s.isArray(t)?t.map(r):r(t)},t.prototype.getResolvable=function(t){return new y.ResolveContext(this._treeChanges.to).getResolvable(t)},t.prototype.addResolvable=function(t,e){void 0===e&&(e="");var r="string"==typeof e?e:e.name,n=this._treeChanges.to,i=a.find(n,function(t){return t.state.name===r}),o=new y.ResolveContext(n);o.addResolvables([t],i.state)},t.prototype.redirectedFrom=function(){return this._options.redirectedFrom||null},t.prototype.options=function(){return this._options},t.prototype.entering=function(){return a.map(this._treeChanges.entering,u.prop("state")).map($)},t.prototype.exiting=function(){return a.map(this._treeChanges.exiting,u.prop("state")).map($).reverse()},t.prototype.retained=function(){return a.map(this._treeChanges.retained,u.prop("state")).map($)},t.prototype.views=function(t,e){void 0===t&&(t="entering");var r=this._treeChanges[t];return r=e?r.filter(u.propEq("state",e)):r,r.map(u.prop("views")).filter(a.identity).reduce(a.unnestR,[])},t.prototype.redirect=function(t){var e=a.extend({},this.options(),t.options(),{redirectedFrom:this,source:"redirect"});t=new v.TargetState(t.identifier(),t.$state(),t.params(),e);var r=this.router.transitionService.create(this._treeChanges.from,t),n=this.treeChanges().entering,i=r.treeChanges().entering,o=function(t){return function(e){return t&&e.state.includes[t.name]}},s=p.PathNode.matching(i,n).filter(u.not(o(t.options().reloadState)));return s.forEach(function(t,e){t.resolvables=n[e].resolvables}),r},t.prototype._changedParams=function(){var t=this._treeChanges,e=t.to,r=t.from;if(!this._options.reload&&a.tail(e).state===a.tail(r).state){var n=e.map(function(t){return t.paramSchema}),i=[e,r].map(function(t){return t.map(function(t){return t.paramValues})}),o=i[0],s=i[1],u=a.arrayTuples(n,o,s);return u.map(function(t){var e=t[0],r=t[1],n=t[2];return d.Param.changed(e,r,n)}).reduce(a.unnestR,[])}},t.prototype.dynamic=function(){var t=this._changedParams();return!!t&&t.map(function(t){return t.dynamic}).reduce(a.anyTrueR,!1)},t.prototype.ignored=function(){var t=this._changedParams();return!!t&&0===t.length},t.prototype.hookBuilder=function(){return new l.HookBuilder(this.router.transitionService,this,{transition:this,current:this._options.current})},t.prototype.run=function(){var t=this,e=c.TransitionHook.runSynchronousHooks,r=this.hookBuilder(),n=this.router.globals;n.transitionHistory.enqueue(this);var o=e(r.getOnBeforeHooks());if(g.Rejection.isTransitionRejectionPromise(o)){o["catch"](function(){return 0});var a=o._transitionRejection;return this._deferred.reject(a),this.promise}if(!this.valid()){var s=new Error(this.error());return this._deferred.reject(s),this.promise}if(this.ignored())return i.trace.traceTransitionIgnored(this),this._deferred.reject(g.Rejection.ignored()),this.promise;var u=function(){i.trace.traceSuccess(t.$to(),t),t.success=!0,t._deferred.resolve(t.to()),e(r.getOnSuccessHooks(),!0)},f=function(n){i.trace.traceError(n,t),t.success=!1,t._deferred.reject(n),t._error=n,e(r.getOnErrorHooks(),!0)};i.trace.traceTransitionStart(this);var l=function(t,e){return t.then(function(){return e.invokeHook()})};return r.asyncHooks().reduce(l,o).then(u,f),this.promise},t.prototype.valid=function(){return!this.error()||void 0!==this.success},t.prototype.error=function(){for(var t=this.$to(),e=0,r=this;null!=(r=r.redirectedFrom());)if(++e>20)return"Too many Transition redirects (20+)";return t.self["abstract"]?"Cannot transition to abstract state '"+t.name+"'":d.Param.validates(t.parameters(),this.params())?this.success===!1?this._error:void 0:"Param values not valid for state '"+t.name+"'"},t.prototype.toString=function(){var t=this.from(),e=this.to(),r=function(t){return null!==t["#"]&&void 0!==t["#"]?t:a.omit(t,"#")},n=this.$id,i=s.isObject(t)?t.name:t,o=a.toJson(r(this._treeChanges.from.map(u.prop("paramValues")).reduce(a.mergeR,{}))),c=this.valid()?"":"(X) ",f=s.isObject(e)?e.name:e,l=a.toJson(r(this.params()));return"Transition#"+n+"( '"+i+"'"+o+" -> "+c+"'"+f+"'"+l+" )"},t.diToken=t,t}();e.Transition=R},function(t,e,r){"use strict";function n(t){return t?"[ui-view#"+t.id+" tag "+("in template from '"+(t.creationContext&&t.creationContext.name||"(root)")+"' state]: ")+("fqn: '"+t.fqn+"', ")+("name: '"+t.name+"@"+t.creationContext+"')"):"ui-view (defunct)"}function i(t){return a.isNumber(t)?c[t]:c[c[t]]}var o=r(5),a=r(4),s=r(9),u=function(t){return"[ViewConfig#"+t.$id+" from '"+(t.viewDecl.$context.name||"(root)")+"' state]: target ui-view: '"+t.viewDecl.$uiViewName+"@"+t.viewDecl.$uiViewContextAnchor+"'"};!function(t){t[t.RESOLVE=0]="RESOLVE",t[t.TRANSITION=1]="TRANSITION",t[t.HOOK=2]="HOOK",t[t.UIVIEW=3]="UIVIEW",t[t.VIEWCONFIG=4]="VIEWCONFIG"}(e.Category||(e.Category={}));var c=e.Category,f=function(){function t(){this._enabled={},this.approximateDigests=0}return t.prototype._set=function(t,e){var r=this;e.length||(e=Object.keys(c).map(function(t){return parseInt(t,10)}).filter(function(t){return!isNaN(t)}).map(function(t){return c[t]})),e.map(i).forEach(function(e){return r._enabled[e]=t})},t.prototype.enable=function(){for(var t=[],e=0;e<arguments.length;e++)t[e-0]=arguments[e];this._set(!0,t)},t.prototype.disable=function(){for(var t=[],e=0;e<arguments.length;e++)t[e-0]=arguments[e];this._set(!1,t)},t.prototype.enabled=function(t){return!!this._enabled[i(t)]},t.prototype.traceTransitionStart=function(t){if(this.enabled(c.TRANSITION)){var e=t.$id,r=this.approximateDigests,n=s.stringify(t);console.log("Transition #"+e+" Digest #"+r+": Started  -> "+n)}},t.prototype.traceTransitionIgnored=function(t){if(this.enabled(c.TRANSITION)){var e=t&&t.$id,r=this.approximateDigests,n=s.stringify(t);console.log("Transition #"+e+" Digest #"+r+": Ignored  <> "+n)}},t.prototype.traceHookInvocation=function(t,e){if(this.enabled(c.HOOK)){var r=o.parse("transition.$id")(e),n=this.approximateDigests,i=o.parse("traceData.hookType")(e)||"internal",a=o.parse("traceData.context.state.name")(e)||o.parse("traceData.context")(e)||"unknown",u=s.functionToString(t.eventHook.callback);console.log("Transition #"+r+" Digest #"+n+":   Hook -> "+i+" context: "+a+", "+s.maxLength(200,u))}},t.prototype.traceHookResult=function(t,e){if(this.enabled(c.HOOK)){var r=o.parse("transition.$id")(e),n=this.approximateDigests,i=s.stringify(t);console.log("Transition #"+r+" Digest #"+n+":   <- Hook returned: "+s.maxLength(200,i))}},t.prototype.traceResolvePath=function(t,e,r){if(this.enabled(c.RESOLVE)){var n=r&&r.$id,i=this.approximateDigests,o=t&&t.toString();console.log("Transition #"+n+" Digest #"+i+":         Resolving "+o+" ("+e+")")}},t.prototype.traceResolvableResolved=function(t,e){if(this.enabled(c.RESOLVE)){var r=e&&e.$id,n=this.approximateDigests,i=t&&t.toString(),o=s.stringify(t.data);console.log("Transition #"+r+" Digest #"+n+":               <- Resolved  "+i+" to: "+s.maxLength(200,o))}},t.prototype.traceError=function(t,e){if(this.enabled(c.TRANSITION)){var r=e&&e.$id,n=this.approximateDigests,i=s.stringify(e);console.log("Transition #"+r+" Digest #"+n+": <- Rejected "+i+", reason: "+t)}},t.prototype.traceSuccess=function(t,e){if(this.enabled(c.TRANSITION)){var r=e&&e.$id,n=this.approximateDigests,i=t.name,o=s.stringify(e);console.log("Transition #"+r+" Digest #"+n+": <- Success  "+o+", final state: "+i)}},t.prototype.traceUIViewEvent=function(t,e,r){void 0===r&&(r=""),this.enabled(c.UIVIEW)&&console.log("ui-view: "+s.padString(30,t)+" "+n(e)+r)},t.prototype.traceUIViewConfigUpdated=function(t,e){this.enabled(c.UIVIEW)&&this.traceUIViewEvent("Updating",t," with ViewConfig from context='"+e+"'")},t.prototype.traceUIViewFill=function(t,e){this.enabled(c.UIVIEW)&&this.traceUIViewEvent("Fill",t," with: "+s.maxLength(200,e))},t.prototype.traceViewServiceEvent=function(t,e){this.enabled(c.VIEWCONFIG)&&console.log("VIEWCONFIG: "+t+" "+u(e))},t.prototype.traceViewServiceUIViewEvent=function(t,e){this.enabled(c.VIEWCONFIG)&&console.log("VIEWCONFIG: "+t+" "+n(e))},t}();e.Trace=f;var l=new f;e.trace=l},function(t,e,r){"use strict";var n=r(3),i=r(9),o=r(4),a=r(5),s=r(12),u=r(6),c=r(10),f=r(14),l={async:!0,rejectIfSuperseded:!0,current:n.noop,transition:null,traceData:{},bind:null},p=function(){function t(t,e,r,i){var o=this;this.transition=t,this.stateContext=e,this.eventHook=r,this.options=i,this.isSuperseded=function(){return o.options.current()!==o.options.transition},this.options=n.defaults(i,l)}return t.prototype.invokeHook=function(){var t=this,e=t.options,r=t.eventHook;if(s.trace.traceHookInvocation(this,e),e.rejectIfSuperseded&&this.isSuperseded())return c.Rejection.superseded(e.current()).toPromise();var n=r._deregistered?void 0:r.callback.call(e.bind,this.transition,this.stateContext);return this.handleHookResult(n)},t.prototype.handleHookResult=function(t){if(this.isSuperseded())return c.Rejection.superseded(this.options.current()).toPromise();if(o.isPromise(t))return t.then(this.handleHookResult.bind(this));if(s.trace.traceHookResult(t,this.options),t===!1)return c.Rejection.aborted("Hook aborted transition").toPromise();var e=a.is(f.TargetState);return e(t)?c.Rejection.redirected(t).toPromise():void 0},t.prototype.toString=function(){var t=this,e=t.options,r=t.eventHook,n=a.parse("traceData.hookType")(e)||"internal",o=a.parse("traceData.context.state.name")(e)||a.parse("traceData.context")(e)||"unknown",s=i.fnToString(r.callback);return n+" context: "+o+", "+i.maxLength(200,s)},t.runSynchronousHooks=function(t,e){void 0===e&&(e=!1);for(var r=[],n=0;n<t.length;n++){var i=t[n];try{r.push(i.invokeHook())}catch(s){if(!e)return c.Rejection.errored(s).toPromise();var f=i.transition.router.stateService.defaultErrorHandler();f(s)}}var l=r.filter(c.Rejection.isTransitionRejectionPromise);return l.length?l[0]:r.filter(o.isPromise).reduce(function(t,e){return t.then(a.val(e))},u.services.$q.when())},t}();e.TransitionHook=p},function(t,e,r){"use strict";var n=r(3),i=function(){function t(t,e,r,n){void 0===r&&(r={}),void 0===n&&(n={}),this._identifier=t,this._definition=e,this._options=n,this._params=r||{}}return t.prototype.name=function(){return this._definition&&this._definition.name||this._identifier},t.prototype.identifier=function(){return this._identifier},t.prototype.params=function(){return this._params},t.prototype.$state=function(){return this._definition},t.prototype.state=function(){return this._definition&&this._definition.self},t.prototype.options=function(){return this._options},t.prototype.exists=function(){return!(!this._definition||!this._definition.self)},t.prototype.valid=function(){return!this.error()},t.prototype.error=function(){var t=this.options().relative;if(!this._definition&&t){var e=t.name?t.name:t;return"Could not resolve '"+this.name()+"' from state '"+e+"'"}return this._definition?this._definition.self?void 0:"State '"+this.name()+"' has an invalid definition":"No such state '"+this.name()+"'"},t.prototype.toString=function(){return"'"+this.name()+"'"+n.toJson(this.params())},t}();e.TargetState=i},function(t,e,r){"use strict";function n(t,e){function r(t){for(var e=n,r=0;r<e.length;r++){var i=s.Glob.fromString(e[r]);if(i&&i.matches(t.name)||!i&&e[r]===t.name)return!0}return!1}var n=a.isString(e)?[e]:e,i=a.isFunction(n)?n:r;return!!i(t)}function i(t,e){return function(r,n,i){void 0===i&&(i={});var a=new u(r,n,i);return t[e].push(a),function(){a._deregistered=!0,o.removeFrom(t[e])(a)}}}var o=r(3),a=r(4),s=r(7);e.matchState=n;var u=function(){function t(t,e,r){void 0===r&&(r={}),this.callback=e,this.matchCriteria=o.extend({to:!0,from:!0,exiting:!0,retained:!0,entering:!0},t),this.priority=r.priority||0,this.bind=r.bind||null,this._deregistered=!1}return t._matchingNodes=function(t,e){if(e===!0)return t;var r=t.filter(function(t){return n(t.state,e)});return r.length?r:null},t.prototype.matches=function(e){var r=this.matchCriteria,n=t._matchingNodes,i={to:n([o.tail(e.to)],r.to),from:n([o.tail(e.from)],r.from),exiting:n(e.exiting,r.exiting),retained:n(e.retained,r.retained),entering:n(e.entering,r.entering)},a=["to","from","exiting","retained","entering"].map(function(t){return i[t]}).reduce(o.allTrueR,!0);return a?i:null},t}();e.EventHook=u;var c=function(){function t(){var t=this;this._transitionEvents={onBefore:[],onStart:[],onEnter:[],onRetain:[],onExit:[],onFinish:[],onSuccess:[],onError:[]},this.getHooks=function(e){return t._transitionEvents[e]},this.onBefore=i(this._transitionEvents,"onBefore"),this.onStart=i(this._transitionEvents,"onStart"),this.onEnter=i(this._transitionEvents,"onEnter"),this.onRetain=i(this._transitionEvents,"onRetain"),this.onExit=i(this._transitionEvents,"onExit"),this.onFinish=i(this._transitionEvents,"onFinish"),this.onSuccess=i(this._transitionEvents,"onSuccess"),this.onError=i(this._transitionEvents,"onError")}return t.mixin=function(t,e){Object.keys(t._transitionEvents).concat(["getHooks"]).forEach(function(r){return e[r]=t[r]})},t}();e.HookRegistry=c},function(t,e,r){"use strict";function n(t){return void 0===t&&(t=!1),function(e,r){var n=t?-1:1,i=(e.node.state.path.length-r.node.state.path.length)*n;return 0!==i?i:r.hook.priority-e.hook.priority}}var i=r(3),o=r(4),a=r(13),s=r(17),u=function(){function t(t,e,r){var o=this;this.$transitions=t,this.transition=e,this.baseHookOptions=r,this.getOnBeforeHooks=function(){return o._buildNodeHooks("onBefore","to",n(),{async:!1})},this.getOnStartHooks=function(){return o._buildNodeHooks("onStart","to",n())},this.getOnExitHooks=function(){return o._buildNodeHooks("onExit","exiting",n(!0),{stateHook:!0})},this.getOnRetainHooks=function(){return o._buildNodeHooks("onRetain","retained",n(!1),{stateHook:!0})},this.getOnEnterHooks=function(){return o._buildNodeHooks("onEnter","entering",n(!1),{stateHook:!0})},this.getOnFinishHooks=function(){return o._buildNodeHooks("onFinish","to",n())},this.getOnSuccessHooks=function(){return o._buildNodeHooks("onSuccess","to",n(),{async:!1,rejectIfSuperseded:!1})},this.getOnErrorHooks=function(){return o._buildNodeHooks("onError","to",n(),{async:!1,rejectIfSuperseded:!1})},this.treeChanges=e.treeChanges(),this.toState=i.tail(this.treeChanges.to).state,this.fromState=i.tail(this.treeChanges.from).state,this.transitionOptions=e.options()}return t.prototype.asyncHooks=function(){var t=this.getOnStartHooks(),e=this.getOnExitHooks(),r=this.getOnRetainHooks(),n=this.getOnEnterHooks(),o=this.getOnFinishHooks(),a=[t,e,r,n,o];return a.reduce(i.unnestR,[]).filter(i.identity)},t.prototype._buildNodeHooks=function(t,e,r,n){var o=this,u=this._matchingHooks(t,this.treeChanges);if(!u)return[];var c=function(r){var u=r.matches(o.treeChanges),c=u[e],f="exiting"===e?o.treeChanges.from:o.treeChanges.to;new s.ResolveContext(f);return c.map(function(e){var s=i.extend({bind:r.bind,traceData:{hookType:t,context:e}},o.baseHookOptions,n),u=s.stateHook?e.state:null,c=new a.TransitionHook(o.transition,u,r,s);return{hook:r,node:e,transitionHook:c}})};return u.map(c).reduce(i.unnestR,[]).sort(r).map(function(t){return t.transitionHook})},t.prototype._matchingHooks=function(t,e){return[this.transition,this.$transitions].map(function(e){return e.getHooks(t)}).filter(i.assertPredicate(o.isArray,"broken event named: "+t)).reduce(i.unnestR,[]).filter(function(t){return t.matches(e)})},t}();e.HookBuilder=u},function(t,e,r){"use strict";var n=r(3),i=r(5),o=r(12),a=r(6),s=r(18),u=r(19),c=r(20),f=r(9),l=s.resolvePolicies.when,p=[l.EAGER,l.LAZY],h=[l.EAGER];e.NATIVE_INJECTOR_TOKEN="Native Injector";var v=function(){function t(t){this._path=t}return t.prototype.getTokens=function(){return this._path.reduce(function(t,e){return t.concat(e.resolvables.map(function(t){return t.token}))},[]).reduce(n.uniqR,[])},t.prototype.getResolvable=function(t){var e=this._path.map(function(t){return t.resolvables}).reduce(n.unnestR,[]).filter(function(e){return e.token===t});return n.tail(e)},t.prototype.subContext=function(e){return new t(c.PathFactory.subPath(this._path,function(t){return t.state===e}))},t.prototype.addResolvables=function(t,e){var r=n.find(this._path,i.propEq("state",e)),o=t.map(function(t){return t.token});r.resolvables=r.resolvables.filter(function(t){return o.indexOf(t.token)===-1}).concat(t)},t.prototype.resolvePath=function(t,e){var r=this;void 0===t&&(t="LAZY");var i=n.inArray(p,t)?t:"LAZY",u=i===s.resolvePolicies.when.EAGER?h:p;o.trace.traceResolvePath(this._path,t,e);var c=this._path.reduce(function(t,i){var o=function(t){return n.inArray(u,t.getPolicy(i.state).when)},a=i.resolvables.filter(o),s=r.subContext(i.state),c=function(t){return t.get(s,e).then(function(e){return{token:t.token,value:e}})};return t.concat(a.map(c))},[]);return a.services.$q.all(c)},t.prototype.injector=function(){
return this._injector||(this._injector=new d(this))},t.prototype.findNode=function(t){return n.find(this._path,function(e){return n.inArray(e.resolvables,t)})},t.prototype.getDependencies=function(t){var e=this,r=this.findNode(t),i=c.PathFactory.subPath(this._path,function(t){return t===r})||this._path,o=i.reduce(function(t,e){return t.concat(e.resolvables)},[]).filter(function(e){return e!==t}),a=function(t){var r=o.filter(function(e){return e.token===t});if(r.length)return n.tail(r);var i=e.injector().getNative(t);if(!i)throw new Error("Could not find Dependency Injection token: "+f.stringify(t));return new u.Resolvable(t,function(){return i},[],i)};return t.deps.map(a)},t}();e.ResolveContext=v;var d=function(){function t(t){this.context=t,this["native"]=this.get(e.NATIVE_INJECTOR_TOKEN)||a.services.$injector}return t.prototype.get=function(t){var e=this.context.getResolvable(t);if(e){if(!e.resolved)throw new Error("Resolvable async .get() not complete:"+f.stringify(e.token));return e.data}return this["native"]&&this["native"].get(t)},t.prototype.getAsync=function(t){var e=this.context.getResolvable(t);return e?e.get(this.context):a.services.$q.when(this["native"].get(t))},t.prototype.getNative=function(t){return this["native"].get(t)},t}()},function(t,e){"use strict";e.resolvePolicies={when:{LAZY:"LAZY",EAGER:"EAGER"},async:{WAIT:"WAIT",NOWAIT:"NOWAIT",RXWAIT:"RXWAIT"}}},function(t,e,r){"use strict";var n=r(3),i=r(6),o=r(12),a=r(9),s=r(4);e.defaultResolvePolicy={when:"LAZY",async:"WAIT"};var u=function(){function t(e,r,o,a,u){if(this.resolved=!1,this.promise=void 0,e instanceof t)n.extend(this,e);else if(s.isFunction(r)){if(null==e||void 0==e)throw new Error("new Resolvable(): token argument is required");if(!s.isFunction(r))throw new Error("new Resolvable(): resolveFn argument must be a function");this.token=e,this.policy=a,this.resolveFn=r,this.deps=o||[],this.data=u,this.resolved=void 0!==u,this.promise=this.resolved?i.services.$q.when(this.data):void 0}else if(s.isObject(e)&&e.token&&s.isFunction(e.resolveFn)){var c=e;return new t(c.token,c.resolveFn,c.deps,c.policy,c.data)}}return t.prototype.getPolicy=function(t){var r=this.policy||{},n=t&&t.resolvePolicy||{};return{when:r.when||n.when||e.defaultResolvePolicy.when,async:r.async||n.async||e.defaultResolvePolicy.async}},t.prototype.resolve=function(t,e){var r=this,a=i.services.$q,s=function(){return a.all(t.getDependencies(r).map(function(r){return r.get(t,e)}))},u=function(t){return r.resolveFn.apply(null,t)},c=function(t){var e=t.cache(1);return e.take(1).toPromise().then(function(){return e})},f=t.findNode(this),l=f&&f.state,p="RXWAIT"===this.getPolicy(l).async?c:n.identity,h=function(t){return r.data=t,r.resolved=!0,o.trace.traceResolvableResolved(r,e),r.data};return this.promise=a.when().then(s).then(u).then(p).then(h)},t.prototype.get=function(t,e){return this.promise||this.resolve(t,e)},t.prototype.toString=function(){return"Resolvable(token: "+a.stringify(this.token)+", requires: ["+this.deps.map(a.stringify)+"])"},t.prototype.clone=function(){return new t(this)},t.fromData=function(e,r){return new t(e,function(){return r},null,null,r)},t}();e.Resolvable=u},function(t,e,r){"use strict";var n=r(3),i=r(5),o=r(14),a=r(21),s=function(){function t(){}return t.makeTargetState=function(t){var e=n.tail(t).state;return new o.TargetState(e,e,t.map(i.prop("paramValues")).reduce(n.mergeR,{}))},t.buildPath=function(t){var e=t.params();return t.$state().path.map(function(t){return new a.PathNode(t).applyRawParams(e)})},t.buildToPath=function(e,r){var n=t.buildPath(r);return r.options().inherit?t.inheritParams(e,n,Object.keys(r.params())):n},t.applyViewConfigs=function(e,r,i){r.filter(function(t){return n.inArray(i,t.state)}).forEach(function(i){var o=n.values(i.state.views||{}),a=t.subPath(r,function(t){return t===i}),s=o.map(function(t){return e.createViewConfig(a,t)});i.views=s.reduce(n.unnestR,[])})},t.inheritParams=function(t,e,r){function o(t,e){var r=n.find(t,i.propEq("state",e));return n.extend({},r&&r.paramValues)}function s(e){var i=n.extend({},e&&e.paramValues),s=n.pick(i,r);i=n.omit(i,r);var u=o(t,e.state)||{},c=n.extend(i,u,s);return new a.PathNode(e.state).applyRawParams(c)}return void 0===r&&(r=[]),e.map(s)},t.treeChanges=function(t,e,r){function n(t,r){var n=a.PathNode.clone(t);return n.paramValues=e[r].paramValues,n}for(var o=0,s=Math.min(t.length,e.length),u=function(t){return t.parameters({inherit:!1}).filter(i.not(i.prop("dynamic"))).map(i.prop("id"))},c=function(t,e){return t.equals(e,u(t.state))};o<s&&t[o].state!==r&&c(t[o],e[o]);)o++;var f,l,p,h,v;f=t,l=f.slice(0,o),p=f.slice(o);var d=l.map(n);return h=e.slice(o),v=d.concat(h),{from:f,to:v,retained:l,exiting:p,entering:h}},t.subPath=function(t,e){var r=n.find(t,e),i=t.indexOf(r);return i===-1?void 0:t.slice(0,i+1)},t.paramValues=function(t){return t.reduce(function(t,e){return n.extend(t,e.paramValues)},{})},t}();e.PathFactory=s},function(t,e,r){"use strict";var n=r(3),i=r(5),o=r(22),a=function(){function t(e){if(e instanceof t){var r=e;this.state=r.state,this.paramSchema=r.paramSchema.slice(),this.paramValues=n.extend({},r.paramValues),this.resolvables=r.resolvables.slice(),this.views=r.views&&r.views.slice()}else{var i=e;this.state=i,this.paramSchema=i.parameters({inherit:!1}),this.paramValues={},this.resolvables=i.resolvables.map(function(t){return t.clone()})}}return t.prototype.applyRawParams=function(t){var e=function(e){return[e.id,e.value(t[e.id])]};return this.paramValues=this.paramSchema.reduce(function(t,r){return n.applyPairs(t,e(r))},{}),this},t.prototype.parameter=function(t){return n.find(this.paramSchema,i.propEq("id",t))},t.prototype.equals=function(t,e){var r=this;void 0===e&&(e=this.paramSchema.map(function(t){return t.id}));var i=function(e){return r.parameter(e).type.equals(r.paramValues[e],t.paramValues[e])};return this.state===t.state&&e.map(i).reduce(n.allTrueR,!0)},t.clone=function(e){return new t(e)},t.matching=function(t,e,r){void 0===r&&(r=!0);for(var n=[],i=0;i<t.length&&i<e.length;i++){var a=t[i],s=e[i];if(a.state!==s.state)break;var u=o.Param.changed(a.paramSchema,a.paramValues,s.paramValues).filter(function(t){return!(r&&t.dynamic)});if(u.length)break;n.push(a)}return n},t}();e.PathNode=a},function(t,e,r){"use strict";function n(t){return t=v(t)&&{value:t}||t,s.extend(t,{$$fn:c.isInjectable(t.value)?t.value:function(){return t.value}})}function i(t,e,r,n,i){if(t.type&&e&&"string"!==e.name)throw new Error("Param '"+n+"' has two type configurations.");return t.type&&e&&"string"===e.name&&i.type(t.type)?i.type(t.type):e?e:t.type?t.type instanceof p.ParamType?t.type:i.type(t.type):r===d.CONFIG?i.type("any"):i.type("string")}function o(t,e){var r=t.squash;if(!e||r===!1)return!1;if(!c.isDefined(r)||null==r)return l.matcherConfig.defaultSquashPolicy();if(r===!0||c.isString(r))return r;throw new Error("Invalid squash policy: '"+r+"'. Valid policies: false, true, or arbitrary string")}function a(t,e,r,n){var i,o,a=[{from:"",to:r||e?void 0:""},{from:null,to:r||e?void 0:""}];return i=c.isArray(t.replace)?t.replace:[],c.isString(n)&&i.push({from:n,to:void 0}),o=s.map(i,u.prop("from")),s.filter(a,function(t){return o.indexOf(t.from)===-1}).concat(i)}var s=r(3),u=r(5),c=r(4),f=r(6),l=r(23),p=r(24),h=Object.prototype.hasOwnProperty,v=function(t){return 0===["value","type","squash","array","dynamic"].filter(h.bind(t||{})).length};!function(t){t[t.PATH=0]="PATH",t[t.SEARCH=1]="SEARCH",t[t.CONFIG=2]="CONFIG"}(e.DefType||(e.DefType={}));var d=e.DefType,m=function(){function t(t,e,r,u,f){function l(){var e={array:u===d.SEARCH&&"auto"},n=t.match(/\[\]$/)?{array:!0}:{};return s.extend(e,n,r).array}r=n(r),e=i(r,e,u,t,f);var p=l();e=p?e.$asArray(p,u===d.SEARCH):e;var h=void 0!==r.value,v=c.isDefined(r.dynamic)?!!r.dynamic:!!e.dynamic,m=o(r,h),g=a(r,p,h,m);s.extend(this,{id:t,type:e,location:u,squash:m,replace:g,isOptional:h,dynamic:v,config:r,array:p})}return t.prototype.isDefaultValue=function(t){return this.isOptional&&this.type.equals(this.value(),t)},t.prototype.value=function(t){var e=this,r=function(){if(!f.services.$injector)throw new Error("Injectable functions cannot be called at configuration time");var t=f.services.$injector.invoke(e.config.$$fn);if(null!==t&&void 0!==t&&!e.type.is(t))throw new Error("Default value ("+t+") for parameter '"+e.id+"' is not an instance of ParamType ("+e.type.name+")");return t},n=function(t){var r=s.map(s.filter(e.replace,u.propEq("from",t)),u.prop("to"));return r.length?r[0]:t};return t=n(t),c.isDefined(t)?this.type.$normalize(t):r()},t.prototype.isSearch=function(){return this.location===d.SEARCH},t.prototype.validates=function(t){if((!c.isDefined(t)||null===t)&&this.isOptional)return!0;var e=this.type.$normalize(t);if(!this.type.is(e))return!1;var r=this.type.encode(e);return!(c.isString(r)&&!this.type.pattern.exec(r))},t.prototype.toString=function(){return"{Param:"+this.id+" "+this.type+" squash: '"+this.squash+"' optional: "+this.isOptional+"}"},t.fromConfig=function(e,r,n,i){return new t(e,r,n,d.CONFIG,i)},t.fromPath=function(e,r,n,i){return new t(e,r,n,d.PATH,i)},t.fromSearch=function(e,r,n,i){return new t(e,r,n,d.SEARCH,i)},t.values=function(t,e){return void 0===e&&(e={}),t.map(function(t){return[t.id,t.value(e[t.id])]}).reduce(s.applyPairs,{})},t.changed=function(t,e,r){return void 0===e&&(e={}),void 0===r&&(r={}),t.filter(function(t){return!t.type.equals(e[t.id],r[t.id])})},t.equals=function(e,r,n){return void 0===r&&(r={}),void 0===n&&(n={}),0===t.changed(e,r,n).length},t.validates=function(t,e){return void 0===e&&(e={}),t.map(function(t){return t.validates(e[t.id])}).reduce(s.allTrueR,!0)},t}();e.Param=m},function(t,e,r){"use strict";var n=r(4),i=function(){function t(){this._isCaseInsensitive=!1,this._isStrictMode=!0,this._defaultSquashPolicy=!1}return t.prototype.caseInsensitive=function(t){return this._isCaseInsensitive=n.isDefined(t)?t:this._isCaseInsensitive},t.prototype.strictMode=function(t){return this._isStrictMode=n.isDefined(t)?t:this._isStrictMode},t.prototype.defaultSquashPolicy=function(t){if(n.isDefined(t)&&t!==!0&&t!==!1&&!n.isString(t))throw new Error("Invalid squash policy: "+t+". Valid policies: false, true, arbitrary-string");return this._defaultSquashPolicy=n.isDefined(t)?t:this._defaultSquashPolicy},t}();e.MatcherConfig=i,e.matcherConfig=new i},function(t,e,r){"use strict";function n(t,e){function r(t){return o.isArray(t)?t:o.isDefined(t)?[t]:[]}function n(t){switch(t.length){case 0:return;case 1:return"auto"===e?t[0]:t;default:return t}}function a(t,e){return function(a){if(o.isArray(a)&&0===a.length)return a;var s=r(a),u=i.map(s,t);return e===!0?0===i.filter(u,function(t){return!t}).length:n(u)}}function s(t){return function(e,n){var i=r(e),o=r(n);if(i.length!==o.length)return!1;for(var a=0;a<i.length;a++)if(!t(i[a],o[a]))return!1;return!0}}var u=this;["encode","decode","equals","$normalize"].forEach(function(e){var r=t[e].bind(t),n="equals"===e?s:a;u[e]=n(r)}),i.extend(this,{dynamic:t.dynamic,name:t.name,pattern:t.pattern,is:a(t.is.bind(t),!0),$arrayMode:e})}var i=r(3),o=r(4),a=function(){function t(t){this.pattern=/.*/,i.extend(this,t)}return t.prototype.is=function(t,e){return!0},t.prototype.encode=function(t,e){return t},t.prototype.decode=function(t,e){return t},t.prototype.equals=function(t,e){return t==e},t.prototype.$subPattern=function(){var t=this.pattern.toString();return t.substr(1,t.length-2)},t.prototype.toString=function(){return"{ParamType:"+this.name+"}"},t.prototype.$normalize=function(t){return this.is(t)?t:this.decode(t)},t.prototype.$asArray=function(t,e){if(!t)return this;if("auto"===t&&!e)throw new Error("'auto' array mode is for query parameters only");return new n(this,t)},t}();e.ParamType=a},function(t,e,r){"use strict";var n=r(26),i=r(29),o=r(29),a=r(30),s=r(37),u=r(38),c=r(43),f=r(44),l=function(){function t(){this.viewService=new s.ViewService,this.transitionService=new a.TransitionService(this),this.globals=new f.Globals(this.transitionService),this.urlMatcherFactory=new n.UrlMatcherFactory,this.urlRouterProvider=new i.UrlRouterProvider(this.urlMatcherFactory,this.globals.params),this.urlRouter=new o.UrlRouter(this.urlRouterProvider),this.stateRegistry=new u.StateRegistry(this.urlMatcherFactory,this.urlRouterProvider),this.stateService=new c.StateService(this),this.viewService.rootContext(this.stateRegistry.root()),this.globals.$current=this.stateRegistry.root(),this.globals.current=this.globals.$current.self}return t}();e.UIRouter=l},function(t,e,r){"use strict";function n(){return{strict:s.matcherConfig.strictMode(),caseInsensitive:s.matcherConfig.caseInsensitive()}}var i=r(3),o=r(4),a=r(27),s=r(23),u=r(22),c=r(28),f=function(){function t(){this.paramTypes=new c.ParamTypes,i.extend(this,{UrlMatcher:a.UrlMatcher,Param:u.Param})}return t.prototype.caseInsensitive=function(t){return s.matcherConfig.caseInsensitive(t)},t.prototype.strictMode=function(t){return s.matcherConfig.strictMode(t)},t.prototype.defaultSquashPolicy=function(t){return s.matcherConfig.defaultSquashPolicy(t)},t.prototype.compile=function(t,e){return new a.UrlMatcher(t,this.paramTypes,i.extend(n(),e))},t.prototype.isMatcher=function(t){if(!o.isObject(t))return!1;var e=!0;return i.forEach(a.UrlMatcher.prototype,function(r,n){o.isFunction(r)&&(e=e&&o.isDefined(t[n])&&o.isFunction(t[n]))}),e},t.prototype.type=function(t,e,r){var n=this.paramTypes.type(t,e,r);return o.isDefined(e)?this:n},t.prototype.$get=function(){return this.paramTypes.enqueue=!1,this.paramTypes._flushTypeQueue(),this},t}();e.UrlMatcherFactory=f},function(t,e,r){"use strict";function n(t,e){var r=["",""],n=t.replace(/[\\\[\]\^$*+?.()|{}]/g,"\\$&");if(!e)return n;switch(e.squash){case!1:r=["(",")"+(e.isOptional?"?":"")];break;case!0:n=n.replace(/\/$/,""),r=["(?:/(",")|/)?"];break;default:r=["("+e.squash+"|",")?"]}return n+r[0]+e.type.pattern.source+r[1]}var i=r(3),o=r(5),a=r(4),s=r(22),u=r(4),c=r(22),f=r(3),l=r(3),p=function(t,e,r){return t[e]=t[e]||r()},h=function(){function t(e,r,a){var u=this;this.config=a,this._cache={path:[],pattern:null},this._children=[],this._params=[],this._segments=[],this._compiled=[],this.pattern=e,this.config=i.defaults(this.config,{params:{},strict:!0,caseInsensitive:!1,paramMap:i.identity});for(var c,f,l,p=/([:*])([\w\[\]]+)|\{([\w\[\]]+)(?:\:\s*((?:[^{}\\]+|\\.|\{(?:[^{}\\]+|\\.)*\})+))?\}/g,h=/([:]?)([\w\[\].-]+)|\{([\w\[\].-]+)(?:\:\s*((?:[^{}\\]+|\\.|\{(?:[^{}\\]+|\\.)*\})+))?\}/g,v=0,d=[],m=function(r){if(!t.nameValidator.test(r))throw new Error("Invalid parameter name '"+r+"' in pattern '"+e+"'");if(i.find(u._params,o.propEq("id",r)))throw new Error("Duplicate parameter name '"+r+"' in pattern '"+e+"'")},g=function(t,n){var o=t[2]||t[3],a=n?t[4]:t[4]||("*"===t[1]?".*":null);return{id:o,regexp:a,cfg:u.config.params[o],segment:e.substring(v,t.index),type:a?r.type(a||"string")||i.inherit(r.type("string"),{pattern:new RegExp(a,u.config.caseInsensitive?"i":void 0)}):null}};(c=p.exec(e))&&(f=g(c,!1),!(f.segment.indexOf("?")>=0));)m(f.id),this._params.push(s.Param.fromPath(f.id,f.type,this.config.paramMap(f.cfg,!1),r)),this._segments.push(f.segment),d.push([f.segment,i.tail(this._params)]),v=p.lastIndex;l=e.substring(v);var y=l.indexOf("?");if(y>=0){var w=l.substring(y);if(l=l.substring(0,y),w.length>0)for(v=0;c=h.exec(w);)f=g(c,!0),m(f.id),this._params.push(s.Param.fromSearch(f.id,f.type,this.config.paramMap(f.cfg,!0),r)),v=p.lastIndex}this._segments.push(l),i.extend(this,{_compiled:d.map(function(t){return n.apply(null,t)}).concat(n(l)),prefix:this._segments[0]}),Object.freeze(this)}return t.prototype.append=function(t){return this._children.push(t),i.forEach(t._cache,function(e,r){return t._cache[r]=a.isArray(e)?[]:null}),t._cache.path=this._cache.path.concat(this),t},t.prototype.isRoot=function(){return 0===this._cache.path.length},t.prototype.toString=function(){return this.pattern},t.prototype.exec=function(t,e,r,n){function a(t){var e=function(t){return t.split("").reverse().join("")},r=function(t){return t.replace(/\\-/g,"-")},n=e(t).split(/-(?!\\)/),o=i.map(n,e);return i.map(o,r).reverse()}var s=this;void 0===e&&(e={}),void 0===n&&(n={});var c=p(this._cache,"pattern",function(){return new RegExp(["^",i.unnest(s._cache.path.concat(s).map(o.prop("_compiled"))).join(""),s.config.strict===!1?"/?":"","$"].join(""),s.config.caseInsensitive?"i":void 0)}).exec(t);if(!c)return null;var f=this.parameters(),l=f.filter(function(t){return!t.isSearch()}),h=f.filter(function(t){return t.isSearch()}),v=this._cache.path.concat(this).map(function(t){return t._segments.length-1}).reduce(function(t,e){return t+e}),d={};if(v!==c.length-1)throw new Error("Unbalanced capture group in route '"+this.pattern+"'");for(var m=0;m<v;m++){for(var g=l[m],y=c[m+1],w=0;w<g.replace.length;w++)g.replace[w].from===y&&(y=g.replace[w].to);y&&g.array===!0&&(y=a(y)),u.isDefined(y)&&(y=g.type.decode(y)),d[g.id]=g.value(y)}return h.forEach(function(t){for(var r=e[t.id],n=0;n<t.replace.length;n++)t.replace[n].from===r&&(r=t.replace[n].to);u.isDefined(r)&&(r=t.type.decode(r)),d[t.id]=t.value(r)}),r&&(d["#"]=r),d},t.prototype.parameters=function(t){return void 0===t&&(t={}),t.inherit===!1?this._params:i.unnest(this._cache.path.concat(this).map(o.prop("_params")))},t.prototype.parameter=function(t,e){void 0===e&&(e={});var r=i.tail(this._cache.path);return i.find(this._params,o.propEq("id",t))||e.inherit!==!1&&r&&r.parameter(t)||null},t.prototype.validates=function(t){var e=this,r=function(t,e){return!t||t.validates(e)};return i.pairs(t||{}).map(function(t){var n=t[0],i=t[1];return r(e.parameter(n),i)}).reduce(i.allTrueR,!0)},t.prototype.format=function(e){function r(t){var r=t.value(e[t.id]),n=t.isDefaultValue(r),i=!!n&&t.squash,o=t.type.encode(r);return{param:t,value:r,isDefaultValue:n,squash:i,encoded:o}}if(void 0===e&&(e={}),!this.validates(e))return null;var n=this._cache.path.slice().concat(this),o=n.map(t.pathSegmentsAndParams).reduce(f.unnestR,[]),s=n.map(t.queryParams).reduce(f.unnestR,[]),u=o.reduce(function(e,n){if(a.isString(n))return e+n;var o=r(n),s=o.squash,u=o.encoded,c=o.param;return s===!0?e.match(/\/$/)?e.slice(0,-1):e:a.isString(s)?e+s:s!==!1?e:null==u?e:a.isArray(u)?e+i.map(u,t.encodeDashes).join("-"):c.type.raw?e+u:e+encodeURIComponent(u)},""),c=s.map(function(t){var e=r(t),n=e.squash,o=e.encoded,s=e.isDefaultValue;if(!(null==o||s&&n!==!1)&&(a.isArray(o)||(o=[o]),0!==o.length))return t.type.raw||(o=i.map(o,encodeURIComponent)),o.map(function(e){return t.id+"="+e})}).filter(i.identity).reduce(f.unnestR,[]).join("&");return u+(c?"?"+c:"")+(e["#"]?"#"+e["#"]:"")},t.encodeDashes=function(t){return encodeURIComponent(t).replace(/-/g,function(t){return"%5C%"+t.charCodeAt(0).toString(16).toUpperCase()})},t.pathSegmentsAndParams=function(t){var e=t._segments,r=t._params.filter(function(t){return t.location===c.DefType.PATH});return l.arrayTuples(e,r.concat(void 0)).reduce(f.unnestR,[]).filter(function(t){return""!==t&&u.isDefined(t)})},t.queryParams=function(t){return t._params.filter(function(t){return t.location===c.DefType.SEARCH})},t.nameValidator=/^\w+([-.]+\w+)*(?:\[\])?$/,t}();e.UrlMatcher=h},function(t,e,r){"use strict";function n(t){return null!=t?t.toString().replace(/(~|\/)/g,function(t){return{"~":"~~","/":"~2F"}[t]}):t}function i(t){return null!=t?t.toString().replace(/(~~|~2F)/g,function(t){return{"~~":"~","~2F":"/"}[t]}):t}var o=r(3),a=r(4),s=r(5),u=r(6),c=r(24),f=function(){function t(){this.enqueue=!0,this.typeQueue=[],this.defaultTypes={hash:{encode:n,decode:i,is:s.is(String),pattern:/.*/,equals:function(t,e){return t==e}},string:{encode:n,decode:i,is:s.is(String),pattern:/[^\/]*/},"int":{encode:n,decode:function(t){return parseInt(t,10)},is:function(t){return a.isDefined(t)&&this.decode(t.toString())===t},pattern:/-?\d+/},bool:{encode:function(t){return t&&1||0},decode:function(t){return 0!==parseInt(t,10)},is:s.is(Boolean),pattern:/0|1/},date:{encode:function(t){return this.is(t)?[t.getFullYear(),("0"+(t.getMonth()+1)).slice(-2),("0"+t.getDate()).slice(-2)].join("-"):void 0},decode:function(t){if(this.is(t))return t;var e=this.capture.exec(t);return e?new Date(e[1],e[2]-1,e[3]):void 0},is:function(t){return t instanceof Date&&!isNaN(t.valueOf())},equals:function(t,e){return["getFullYear","getMonth","getDate"].reduce(function(r,n){return r&&t[n]()===e[n]()},!0)},pattern:/[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[1-2][0-9]|3[0-1])/,capture:/([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1])/},json:{encode:o.toJson,decode:o.fromJson,is:s.is(Object),equals:o.equals,pattern:/[^\/]*/},any:{encode:o.identity,decode:o.identity,equals:o.equals,pattern:/.*/}};var t=function(t,e){return new c.ParamType(o.extend({name:e},t))};this.types=o.inherit(o.map(this.defaultTypes,t),{})}return t.prototype.type=function(t,e,r){if(!a.isDefined(e))return this.types[t];if(this.types.hasOwnProperty(t))throw new Error("A type named '"+t+"' has already been defined.");return this.types[t]=new c.ParamType(o.extend({name:t},e)),r&&(this.typeQueue.push({name:t,def:r}),this.enqueue||this._flushTypeQueue()),this},t.prototype._flushTypeQueue=function(){for(;this.typeQueue.length;){var t=this.typeQueue.shift();if(t.pattern)throw new Error("You cannot override a type's .pattern at runtime.");o.extend(this.types[t.name],u.services.$injector.invoke(t.def))}},t}();e.ParamTypes=f},function(t,e,r){"use strict";function n(t){var e=/^\^((?:\\[^a-zA-Z0-9]|[^\\\[\]\^$*+?.()|{}]+)*)/.exec(t.source);return null!=e?e[1].replace(/\\(.)/g,"$1"):""}function i(t,e){return t.replace(/\$(\$|\d{1,2})/,function(t,r){return e["$"===r?0:Number(r)]})}function o(t,e,r,n){if(!n)return!1;var i=t.invoke(r,r,{$match:n,$stateParams:e});return!c.isDefined(i)||i}function a(t,e,r){var n=f.services.locationConfig.baseHref();return"/"===n?t:e?n.slice(0,-1)+t:r?n.slice(1)+t:t}function s(t,e,r){function n(t){var e=t(f.services.$injector,l);return!!e&&(c.isString(e)&&l.setUrl(e,!0),!0)}if(!r||!r.defaultPrevented){for(var i=t.length,o=0;o<i;o++)if(n(t[o]))return;e&&n(e)}}var u=r(3),c=r(4),f=r(6),l=f.services.location,p=function(){function t(t,e){this.rules=[],this.interceptDeferred=!1,this.$urlMatcherFactory=t,this.$stateParams=e}return t.prototype.rule=function(t){if(!c.isFunction(t))throw new Error("'rule' must be a function");return this.rules.push(t),this},t.prototype.removeRule=function(t){return this.rules.length!==u.removeFrom(this.rules,t).length},t.prototype.otherwise=function(t){if(!c.isFunction(t)&&!c.isString(t))throw new Error("'rule' must be a string or function");return this.otherwiseFn=c.isString(t)?function(){return t}:t,this},t.prototype.when=function(t,e,r){void 0===r&&(r=function(t){});var a,s=this,p=s.$urlMatcherFactory,h=s.$stateParams,v=c.isString(e);if(c.isString(t)&&(t=p.compile(t)),!v&&!c.isFunction(e)&&!c.isArray(e))throw new Error("invalid 'handler' in when()");var d={matcher:function(t,e){return v&&(a=p.compile(e),e=["$match",a.format.bind(a)]),u.extend(function(){return o(f.services.$injector,h,e,t.exec(l.path(),l.search(),l.hash()))},{prefix:c.isString(t.prefix)?t.prefix:""})},regex:function(t,e){if(t.global||t.sticky)throw new Error("when() RegExp must not be global or sticky");return v&&(a=e,e=["$match",function(t){return i(a,t)}]),u.extend(function(){return o(f.services.$injector,h,e,t.exec(l.path()))},{prefix:n(t)})}},m={matcher:p.isMatcher(t),regex:t instanceof RegExp};for(var g in m)if(m[g]){var y=d[g](t,e);return r(y),this.rule(y)}throw new Error("invalid 'what' in when()")},t.prototype.deferIntercept=function(t){void 0===t&&(t=!0),this.interceptDeferred=t},t}();e.UrlRouterProvider=p;var h=function(){function t(e){this.urlRouterProvider=e,u.bindFunctions(t.prototype,this,this)}return t.prototype.sync=function(){s(this.urlRouterProvider.rules,this.urlRouterProvider.otherwiseFn)},t.prototype.listen=function(){var t=this;return this.listener=this.listener||l.onChange(function(e){return s(t.urlRouterProvider.rules,t.urlRouterProvider.otherwiseFn,e)})},t.prototype.update=function(t){return t?void(this.location=l.path()):void(l.path()!==this.location&&l.setUrl(this.location,!0))},t.prototype.push=function(t,e,r){var n=r&&!!r.replace;l.setUrl(t.format(e||{}),n)},t.prototype.href=function(t,e,r){if(!t.validates(e))return null;var n=t.format(e);r=r||{absolute:!1};var i=f.services.locationConfig,o=i.html5Mode();if(o||null===n||(n="#"+i.hashPrefix()+n),n=a(n,o,r.absolute),!r.absolute||!n)return n;var s=!o&&n?"/":"",u=i.port();return u=80===u||443===u?"":":"+u,[i.protocol(),"://",i.host(),u,s,n].join("")},t}();e.UrlRouter=h},function(t,e,r){"use strict";var n=r(11),i=r(15),o=r(31),a=r(32),s=r(33),u=r(34),c=r(35),f=r(36);e.defaultTransOpts={location:!0,relative:null,inherit:!1,notify:!0,reload:!1,custom:{},current:function(){return null},source:"unknown"};var l=function(){function t(t){this._router=t,this.$view=t.viewService,i.HookRegistry.mixin(new i.HookRegistry,this),this._deregisterHookFns={},this.registerTransitionHooks()}return t.prototype.registerTransitionHooks=function(){var t=this._deregisterHookFns;t.redirectTo=u.registerRedirectToHook(this),t.onExit=c.registerOnExitHook(this),t.onRetain=c.registerOnRetainHook(this),t.onEnter=c.registerOnEnterHook(this),t.eagerResolve=o.registerEagerResolvePath(this),t.lazyResolve=o.registerLazyResolveState(this),t.loadViews=a.registerLoadEnteringViews(this),t.activateViews=a.registerActivateViews(this),t.updateUrl=s.registerUpdateUrl(this),t.lazyLoad=f.registerLazyLoadHook(this)},t.prototype.onBefore=function(t,e,r){throw""},t.prototype.onStart=function(t,e,r){throw""},t.prototype.onExit=function(t,e,r){throw""},t.prototype.onRetain=function(t,e,r){throw""},t.prototype.onEnter=function(t,e,r){throw""},t.prototype.onFinish=function(t,e,r){throw""},t.prototype.onSuccess=function(t,e,r){throw""},t.prototype.onError=function(t,e,r){throw""},t.prototype.create=function(t,e){return new n.Transition(t,e,this._router)},t}();e.TransitionService=l},function(t,e,r){"use strict";var n=r(3),i=r(17),o=r(5),a=function(t){return new i.ResolveContext(t.treeChanges().to).resolvePath("EAGER",t).then(n.noop)};e.registerEagerResolvePath=function(t){return t.onStart({},a,{priority:1e3})};var s=function(t,e){return new i.ResolveContext(t.treeChanges().to).subContext(e).resolvePath("LAZY",t).then(n.noop)};e.registerLazyResolveState=function(t){return t.onEnter({entering:o.val(!0)},s,{priority:1e3})}},function(t,e,r){"use strict";var n=r(3),i=r(6),o=function(t){var e=t.views("entering");if(e.length)return i.services.$q.all(e.map(function(t){return t.load()})).then(n.noop)};e.registerLoadEnteringViews=function(t){return t.onStart({},o)};var a=function(t){var e=t.views("entering"),r=t.views("exiting");if(e.length||r.length){var n=t.router.viewService;r.forEach(function(t){return n.deactivateViewConfig(t)}),e.forEach(function(t){return n.activateViewConfig(t)}),n.sync()}};e.registerActivateViews=function(t){return t.onSuccess({},a)}},function(t,e){"use strict";var r=function(t){var e=t.options(),r=t.router.stateService,n=t.router.urlRouter;if("url"!==e.source&&e.location&&r.$current.navigable){var i={replace:"replace"===e.location};n.push(r.$current.navigable.url,r.params,i)}n.update(!0)};e.registerUpdateUrl=function(t){return t.onSuccess({},r,{priority:9999})}},function(t,e,r){"use strict";var n=r(4),i=r(6),o=r(14),a=function(t){function e(e){var r=t.router.stateService;return e instanceof o.TargetState?e:n.isString(e)?r.target(e,t.params(),t.options()):e.state||e.params?r.target(e.state||t.to(),e.params||t.params(),t.options()):void 0}var r=t.to().redirectTo;if(r)return n.isFunction(r)?i.services.$q.when(r(t)).then(e):e(r)};e.registerRedirectToHook=function(t){return t.onStart({to:function(t){return!!t.redirectTo}},a)}},function(t,e){"use strict";function r(t){return function(e,r){var n=r[t];return n(e,r)}}var n=r("onExit");e.registerOnExitHook=function(t){return t.onExit({exiting:function(t){return!!t.onExit}},n)};var i=r("onRetain");e.registerOnRetainHook=function(t){return t.onRetain({retained:function(t){return!!t.onRetain}},i)};var o=r("onEnter");e.registerOnEnterHook=function(t){return t.onEnter({entering:function(t){return!!t.onEnter}},o)}},function(t,e,r){"use strict";var n=r(6),i=function(t){function e(){if("url"===t.options().source){var e=n.services.location,r=e.path(),i=e.search(),a=e.hash(),s=function(t){return[t,t.url&&t.url.exec(r,i,a)]},u=o.get().map(function(t){return t.$$state()}).map(s).filter(function(t){var e=(t[0],t[1]);return!!e});if(u.length){var c=u[0],f=c[0],l=c[1];return t.router.stateService.target(f,l,t.options())}t.router.urlRouter.sync()}var p=t.targetState();return t.router.stateService.target(p.identifier(),p.params(),p.options())}function r(e){o.deregister(t.$to()),e&&Array.isArray(e.states)&&e.states.forEach(function(t){return o.register(t)})}var i=t.to(),o=t.router.stateRegistry,a=i.lazyLoad,s=a._promise;if(!s){s=a._promise=a(t).then(r);var u=function(){return delete a._promise};s.then(u,u)}return s.then(e)};e.registerLazyLoadHook=function(t){return t.onBefore({to:function(t){return!!t.lazyLoad}},i)}},function(t,e,r){"use strict";var n=r(3),i=r(5),o=r(4),a=r(12),s=function(){function t(){var t=this;this.uiViews=[],this.viewConfigs=[],this._viewConfigFactories={},this.sync=function(){function e(t){return t.fqn.split(".").length}function r(t){for(var e=t.viewDecl.$context,r=0;++r&&e.parent;)e=e.parent;return r}var o=t.uiViews.map(function(t){return[t.fqn,t]}).reduce(n.applyPairs,{}),a=function(t){return function(e){if(t.$type!==e.viewDecl.$type)return!1;var r=e.viewDecl,i=r.$uiViewName.split("."),a=t.fqn.split(".");if(!n.equals(i,a.slice(0-i.length)))return!1;var s=1-i.length||void 0,u=a.slice(0,s).join("."),c=o[u].creationContext;return r.$uiViewContextAnchor===(c&&c.name)}},s=i.curry(function(t,e,r,n){return e*(t(r)-t(n))}),u=function(e){var n=t.viewConfigs.filter(a(e));return n.length>1&&n.sort(s(r,-1)),[e,n[0]]},c=function(e){var r=e[0],n=e[1];t.uiViews.indexOf(r)!==-1&&r.configUpdated(n)};t.uiViews.sort(s(e,1)).map(u).forEach(c)}}return t.prototype.rootContext=function(t){return this._rootContext=t||this._rootContext},t.prototype.viewConfigFactory=function(t,e){this._viewConfigFactories[t]=e},t.prototype.createViewConfig=function(t,e){var r=this._viewConfigFactories[e.$type];if(!r)throw new Error("ViewService: No view config factory registered for type "+e.$type);var n=r(t,e);return o.isArray(n)?n:[n]},t.prototype.deactivateViewConfig=function(t){a.trace.traceViewServiceEvent("<- Removing",t),n.removeFrom(this.viewConfigs,t)},t.prototype.activateViewConfig=function(t){a.trace.traceViewServiceEvent("-> Registering",t),this.viewConfigs.push(t)},t.prototype.registerUIView=function(t){a.trace.traceViewServiceUIViewEvent("-> Registering",t);var e=this.uiViews,r=function(e){return e.fqn===t.fqn};return e.filter(r).length&&a.trace.traceViewServiceUIViewEvent("!!!! duplicate uiView named:",t),e.push(t),this.sync(),function(){var r=e.indexOf(t);return r===-1?void a.trace.traceViewServiceUIViewEvent("Tried removing non-registered uiView",t):(a.trace.traceViewServiceUIViewEvent("<- Deregistering",t),void n.removeFrom(e)(t))}},t.prototype.available=function(){return this.uiViews.map(i.prop("fqn"))},t.prototype.active=function(){return this.uiViews.filter(i.prop("$config")).map(i.prop("name"))},t.normalizeUIViewTarget=function(t,e){void 0===e&&(e="");var r=e.split("@"),n=r[0]||"$default",i=o.isString(r[1])?r[1]:"^",a=/^(\^(?:\.\^)*)\.(.*$)/.exec(n);a&&(i=a[1],n=a[2]),"!"===n.charAt(0)&&(n=n.substr(1),i="");var s=/^(\^(?:\.\^)*)$/;if(s.exec(i)){var u=i.split(".").reduce(function(t,e){return t.parent},t);i=u.name}return{uiViewName:n,uiViewContextAnchor:i}},t}();e.ViewService=s},function(t,e,r){"use strict";var n=r(39),i=r(40),o=r(41),a=r(3),s=function(){function t(t,e){this.urlRouterProvider=e,this.states={},this.listeners=[],this.matcher=new n.StateMatcher(this.states),this.builder=new i.StateBuilder(this.matcher,t),this.stateQueue=new o.StateQueueManager(this.states,this.builder,e,this.listeners);
var r={name:"",url:"^",views:null,params:{"#":{value:null,type:"hash",dynamic:!0}},"abstract":!0},a=this._root=this.stateQueue.register(r);a.navigable=null}return t.prototype.onStatesChanged=function(t){return this.listeners.push(t),function(){a.removeFrom(this.listeners)(t)}.bind(this)},t.prototype.root=function(){return this._root},t.prototype.register=function(t){return this.stateQueue.register(t)},t.prototype._deregisterTree=function(t){var e=this,r=this.get().map(function(t){return t.$$state()}),n=function(t){var e=r.filter(function(e){return t.indexOf(e.parent)!==-1});return 0===e.length?e:e.concat(n(e))},i=n([t]),o=[t].concat(i).reverse();return o.forEach(function(t){e.urlRouterProvider.removeRule(t._urlRule),delete e.states[t.name]}),o},t.prototype.deregister=function(t){var e=this.get(t);if(!e)throw new Error("Can't deregister state; not found: "+t);var r=this._deregisterTree(e.$$state());return this.listeners.forEach(function(t){return t("deregistered",r.map(function(t){return t.self}))}),r},t.prototype.get=function(t,e){var r=this;if(0===arguments.length)return Object.keys(this.states).map(function(t){return r.states[t].self});var n=this.matcher.find(t,e);return n&&n.self||null},t.prototype.decorator=function(t,e){return this.builder.builder(t,e)},t}();e.StateRegistry=s},function(t,e,r){"use strict";var n=r(4),i=r(7),o=r(3),a=function(){function t(t){this._states=t}return t.prototype.isRelative=function(t){return t=t||"",0===t.indexOf(".")||0===t.indexOf("^")},t.prototype.find=function(t,e){if(t||""===t){var r=n.isString(t),a=r?t:t.name;this.isRelative(a)&&(a=this.resolvePath(a,e));var s=this._states[a];if(s&&(r||!(r||s!==t&&s.self!==t)))return s;if(r){var u=o.values(this._states).filter(function(t){return new i.Glob(t.name).matches(a)});return u.length>1&&console.log("stateMatcher.find: Found multiple matches for "+a+" using glob: ",u.map(function(t){return t.name})),u[0]}}},t.prototype.resolvePath=function(t,e){if(!e)throw new Error("No reference point given for path '"+t+"'");for(var r=this.find(e),n=t.split("."),i=0,o=n.length,a=r;i<o;i++)if(""!==n[i]||0!==i){if("^"!==n[i])break;if(!a.parent)throw new Error("Path '"+t+"' not valid for state '"+r.name+"'");a=a.parent}else a=r;var s=n.slice(i).join(".");return a.name+(a.name&&s?".":"")+s},t}();e.StateMatcher=a},function(t,e,r){"use strict";function n(t){return t.lazyLoad&&(t.name=t.self.name+".**"),t.name}function i(t){return t.self.$$state=function(){return t},t.self}function o(t){return t.parent&&t.parent.data&&(t.data=t.self.data=c.inherit(t.parent.data,t.data)),t.data}function a(t){return t.parent?t.parent.path.concat(t):[t]}function s(t){var e=t.parent?c.extend({},t.parent.includes):{};return e[t.name]=!0,e}function u(t){var e=function(t,e){return Object.keys(t||{}).map(function(r){return{token:r,val:t[r],deps:void 0,policy:e[r]}})},r=function(t){return t.$inject||d.services.$injector.annotate(t,d.services.$injector.strictDi)},n=function(t){return!(!t.token||!t.resolveFn)},i=function(t){return!(!t.provide&&!t.token||!(t.useValue||t.useFactory||t.useExisting||t.useClass))},o=function(t){return!!(t&&t.val&&(f.isString(t.val)||f.isArray(t.val)||f.isFunction(t.val)))},a=function(t){return t.provide||t.token},s=p.pattern([[p.prop("resolveFn"),function(t){return new v.Resolvable(a(t),t.resolveFn,t.deps,t.policy)}],[p.prop("useFactory"),function(t){return new v.Resolvable(a(t),t.useFactory,t.deps||t.dependencies,t.policy)}],[p.prop("useClass"),function(t){return new v.Resolvable(a(t),function(){return new t.useClass},[],t.policy)}],[p.prop("useValue"),function(t){return new v.Resolvable(a(t),function(){return t.useValue},[],t.policy,t.useValue)}],[p.prop("useExisting"),function(t){return new v.Resolvable(a(t),c.identity,[t.useExisting],t.policy)}]]),u=p.pattern([[p.pipe(p.prop("val"),f.isString),function(t){return new v.Resolvable(t.token,c.identity,[t.val],t.policy)}],[p.pipe(p.prop("val"),f.isArray),function(t){return new v.Resolvable(t.token,c.tail(t.val),t.val.slice(0,-1),t.policy)}],[p.pipe(p.prop("val"),f.isFunction),function(t){return new v.Resolvable(t.token,t.val,r(t.val),t.policy)}]]),h=p.pattern([[p.is(v.Resolvable),function(t){return t}],[n,s],[i,s],[o,u],[p.val(!0),function(t){throw new Error("Invalid resolve value: "+l.stringify(t))}]]),m=t.resolve,g=f.isArray(m)?m:e(m,t.resolvePolicy||{});return g.map(h)}var c=r(3),f=r(4),l=r(9),p=r(5),h=r(22),v=r(19),d=r(6),m=function(t){if(!f.isString(t))return!1;var e="^"===t.charAt(0);return{val:e?t.substring(1):t,root:e}},g=function(t,e){return function(r){var n=r;n&&n.url&&n.lazyLoad&&(n.url+="{remainder:any}");var i=m(n.url),o=r.parent,a=i?t.compile(i.val,{params:r.params||{},paramMap:function(t,e){return n.reloadOnSearch===!1&&e&&(t=c.extend(t||{},{dynamic:!0})),t}}):n.url;if(!a)return null;if(!t.isMatcher(a))throw new Error("Invalid url '"+a+"' in state '"+r+"'");return i&&i.root?a:(o&&o.navigable||e()).url.append(a)}},y=function(t){return function(e){return!t(e)&&e.url?e:e.parent?e.parent.navigable:null}},w=function(t){return function(e){var r=function(e,r){return h.Param.fromConfig(r,null,e,t)},n=e.url&&e.url.parameters({inherit:!1})||[],i=c.values(c.mapObj(c.omit(e.params||{},n.map(p.prop("id"))),r));return n.concat(i).map(function(t){return[t.id,t]}).reduce(c.applyPairs,{})}};e.resolvablesBuilder=u;var b=function(){function t(t,e){function r(e){return l(e)?null:t.find(c.parentName(e))||f()}this.matcher=t;var c=this,f=function(){return t.find("")},l=function(t){return""===t.name};this.builders={name:[n],self:[i],parent:[r],data:[o],url:[g(e,f)],navigable:[y(l)],params:[w(e.paramTypes)],views:[],path:[a],includes:[s],resolvables:[u]}}return t.prototype.builder=function(t,e){var r=this.builders,n=r[t]||[];return f.isString(t)&&!f.isDefined(e)?n.length>1?n:n[0]:f.isString(t)&&f.isFunction(e)?(r[t]=n,r[t].push(e),function(){return r[t].splice(r[t].indexOf(e,1))&&null}):void 0},t.prototype.build=function(t){var e=this,r=e.matcher,n=e.builders,i=this.parentName(t);if(i&&!r.find(i))return null;for(var o in n)if(n.hasOwnProperty(o)){var a=n[o].reduce(function(t,e){return function(r){return e(r,t)}},c.noop);t[o]=a(t)}return t},t.prototype.parentName=function(t){var e=t.name||"",r=e.split(".");if(r.length>1){if(t.parent)throw new Error("States that specify the 'parent:' property should not have a '.' in their name ("+e+")");var n=r.pop();return"**"===n&&r.pop(),r.join(".")}return t.parent?f.isString(t.parent)?t.parent:t.parent.name:""},t.prototype.name=function(t){var e=t.name;if(e.indexOf(".")!==-1||!t.parent)return e;var r=f.isString(t.parent)?t.parent:t.parent.name;return r?r+"."+e:e},t}();e.StateBuilder=b},function(t,e,r){"use strict";var n=r(3),i=r(4),o=r(42),a=function(){function t(t,e,r,n){this.states=t,this.builder=e,this.$urlRouterProvider=r,this.listeners=n,this.queue=[]}return t.prototype.register=function(t){var e=this,r=e.states,a=e.queue,s=e.$state,u=n.inherit(new o.State,n.extend({},t,{self:t,resolve:t.resolve||[],toString:function(){return t.name}}));if(!i.isString(u.name))throw new Error("State must have a valid name");if(r.hasOwnProperty(u.name)||n.pluck(a,"name").indexOf(u.name)!==-1)throw new Error("State '"+u.name+"' is already defined");return a.push(u),this.$state&&this.flush(s),u},t.prototype.flush=function(t){for(var e=this,r=e.queue,n=e.states,i=e.builder,o=[],a=[],s={};r.length>0;){var u=r.shift(),c=i.build(u),f=a.indexOf(u);if(c){if(n.hasOwnProperty(u.name))throw new Error("State '"+name+"' is already defined");n[u.name]=u,this.attachRoute(t,u),f>=0&&a.splice(f,1),o.push(u)}else{var l=s[u.name];if(s[u.name]=r.length,f>=0&&l===r.length)return r.push(u),n;f<0&&a.push(u),r.push(u)}}return o.length&&this.listeners.forEach(function(t){return t("registered",o.map(function(t){return t.self}))}),n},t.prototype.autoFlush=function(t){this.$state=t,this.flush(t)},t.prototype.attachRoute=function(t,e){var r=this.$urlRouterProvider;!e["abstract"]&&e.url&&r.when(e.url,["$match","$stateParams",function(r,i){t.$current.navigable===e&&n.equalForKeys(r,i)||t.transitionTo(e,r,{inherit:!0,source:"url"})}],function(t){return e._urlRule=t})},t}();e.StateQueueManager=a},function(t,e,r){"use strict";var n=r(3),i=r(5),o=function(){function t(t){n.extend(this,t)}return t.prototype.is=function(t){return this===t||this.self===t||this.fqn()===t},t.prototype.fqn=function(){if(!(this.parent&&this.parent instanceof this.constructor))return this.name;var t=this.parent.fqn();return t?t+"."+this.name:this.name},t.prototype.root=function(){return this.parent&&this.parent.root()||this},t.prototype.parameters=function(t){t=n.defaults(t,{inherit:!0});var e=t.inherit&&this.parent&&this.parent.parameters()||[];return e.concat(n.values(this.params))},t.prototype.parameter=function(t,e){return void 0===e&&(e={}),this.url&&this.url.parameter(t,e)||n.find(n.values(this.params),i.propEq("id",t))||e.inherit&&this.parent&&this.parent.parameter(t)},t.prototype.toString=function(){return this.fqn()},t}();e.State=o},function(t,e,r){"use strict";var n=r(3),i=r(4),o=r(8),a=r(6),s=r(20),u=r(21),c=r(30),f=r(10),l=r(14),p=r(22),h=r(7),v=r(3),d=r(3),m=r(17),g=function(){function t(e){this.router=e,this.invalidCallbacks=[],this._defaultErrorHandler=function(t){t instanceof Error&&t.stack?(console.error(t),console.error(t.stack)):t instanceof f.Rejection?(console.error(t.toString()),t.detail&&t.detail.stack&&console.error(t.detail.stack)):console.error(t)};var r=["current","$current","params","transition"],n=Object.keys(t.prototype).filter(function(t){return r.indexOf(t)===-1});d.bindFunctions(t.prototype,this,this,n)}return Object.defineProperty(t.prototype,"transition",{get:function(){return this.router.globals.transition},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"params",{get:function(){return this.router.globals.params},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"current",{get:function(){return this.router.globals.current},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"$current",{get:function(){return this.router.globals.$current},enumerable:!0,configurable:!0}),t.prototype._handleInvalidTargetState=function(t,e){function r(){var t=h.dequeue();if(void 0===t)return f.Rejection.invalid(e.error()).toPromise();var n=a.services.$q.when(t(e,i,v));return n.then(d).then(function(t){return t||r()})}var n=this,i=s.PathFactory.makeTargetState(t),u=this.router.globals,c=function(){return u.transitionHistory.peekTail()},p=c(),h=new o.Queue(this.invalidCallbacks.slice()),v=new m.ResolveContext(t).injector(),d=function(t){if(t instanceof l.TargetState){var e=t;return e=n.target(e.identifier(),e.params(),e.options()),e.valid()?c()!==p?f.Rejection.superseded().toPromise():n.transitionTo(e.identifier(),e.params(),e.options()):f.Rejection.invalid(e.error()).toPromise()}};return r()},t.prototype.onInvalid=function(t){return this.invalidCallbacks.push(t),function(){n.removeFrom(this.invalidCallbacks)(t)}.bind(this)},t.prototype.reload=function(t){return this.transitionTo(this.current,this.params,{reload:!i.isDefined(t)||t,inherit:!1,notify:!1})},t.prototype.go=function(t,e,r){var i={relative:this.$current,inherit:!0},o=n.defaults(r,i,c.defaultTransOpts);return this.transitionTo(t,e,o)},t.prototype.target=function(t,e,r){if(void 0===r&&(r={}),i.isObject(r.reload)&&!r.reload.name)throw new Error("Invalid reload state object");var n=this.router.stateRegistry;if(r.reloadState=r.reload===!0?n.root():n.matcher.find(r.reload,r.relative),r.reload&&!r.reloadState)throw new Error("No such reload state '"+(i.isString(r.reload)?r.reload:r.reload.name)+"'");var o=n.matcher.find(t,r.relative);return new l.TargetState(t,o,e,r)},t.prototype.transitionTo=function(t,e,r){var i=this;void 0===e&&(e={}),void 0===r&&(r={});var o=this.router,s=o.globals,p=s.transitionHistory;r=n.defaults(r,c.defaultTransOpts),r=n.extend(r,{current:p.peekTail.bind(p)});var h=this.target(t,e,r),v=s.successfulTransitions.peekTail(),d=function(){return[new u.PathNode(i.router.stateRegistry.root())]},m=v?v.treeChanges().to:d();if(!h.exists())return this._handleInvalidTargetState(m,h);if(!h.valid())return n.silentRejection(h.error());var g=function(t){return function(e){if(e instanceof f.Rejection){if(e.type===f.RejectType.IGNORED)return o.urlRouter.update(),a.services.$q.when(s.current);var r=e.detail;if(e.type===f.RejectType.SUPERSEDED&&e.redirected&&r instanceof l.TargetState){var n=t.redirect(r);return n.run()["catch"](g(n))}e.type===f.RejectType.ABORTED&&o.urlRouter.update()}var u=i.defaultErrorHandler();return u(e),a.services.$q.reject(e)}},y=this.router.transitionService.create(m,h),w=y.run()["catch"](g(y));return n.silenceUncaughtInPromise(w),n.extend(w,{transition:y})},t.prototype.is=function(t,e,r){r=n.defaults(r,{relative:this.$current});var o=this.router.stateRegistry.matcher.find(t,r.relative);if(i.isDefined(o))return this.$current===o&&(!i.isDefined(e)||null===e||p.Param.equals(o.parameters(),this.params,e))},t.prototype.includes=function(t,e,r){r=n.defaults(r,{relative:this.$current});var o=i.isString(t)&&h.Glob.fromString(t);if(o){if(!o.matches(this.$current.name))return!1;t=this.$current.name}var a=this.router.stateRegistry.matcher.find(t,r.relative),s=this.$current.includes;if(i.isDefined(a))return!!i.isDefined(s[a.name])&&(!e||v.equalForKeys(p.Param.values(a.parameters(),e),this.params,Object.keys(e)))},t.prototype.href=function(t,e,r){var o={lossy:!0,inherit:!0,absolute:!1,relative:this.$current};r=n.defaults(r,o),e=e||{};var a=this.router.stateRegistry.matcher.find(t,r.relative);if(!i.isDefined(a))return null;r.inherit&&(e=this.params.$inherit(e,this.$current,a));var s=a&&r.lossy?a.navigable:a;return s&&void 0!==s.url&&null!==s.url?this.router.urlRouter.href(s.url,p.Param.values(a.parameters(),e),{absolute:r.absolute}):null},t.prototype.defaultErrorHandler=function(t){return this._defaultErrorHandler=t||this._defaultErrorHandler},t.prototype.get=function(t,e){var r=this.router.stateRegistry;return 0===arguments.length?r.get():r.get(t,e||this.$current)},t}();e.StateService=g},function(t,e,r){"use strict";var n=r(45),i=r(8),o=r(3),a=function(){function t(t){var e=this;this.params=new n.StateParams,this.transitionHistory=new i.Queue([],1),this.successfulTransitions=new i.Queue([],1);var r=function(t){e.transition=t,e.transitionHistory.enqueue(t);var r=function(){e.successfulTransitions.enqueue(t),e.$current=t.$to(),e.current=e.$current.self,o.copy(t.params(),e.params)};t.onSuccess({},r,{priority:1e4});var n=function(){e.transition===t&&(e.transition=null)};t.promise.then(n,n)};t.onBefore({},r)}return t}();e.Globals=a},function(t,e,r){"use strict";var n=r(3),i=function(){function t(t){void 0===t&&(t={}),n.extend(this,t)}return t.prototype.$inherit=function(t,e,r){var i,o=n.ancestors(e,r),a={},s=[];for(var u in o)if(o[u]&&o[u].params&&(i=Object.keys(o[u].params),i.length))for(var c in i)s.indexOf(i[c])>=0||(s.push(i[c]),a[i[c]]=this[i[c]]);return n.extend({},a,t)},t}();e.StateParams=i},function(t,e,r){"use strict";function n(t){for(var r in t)e.hasOwnProperty(r)||(e[r]=t[r])}n(r(22)),n(r(28)),n(r(45)),n(r(24))},function(t,e,r){"use strict";function n(t){for(var r in t)e.hasOwnProperty(r)||(e[r]=t[r])}n(r(21)),n(r(20))},function(t,e,r){"use strict";function n(t){for(var r in t)e.hasOwnProperty(r)||(e[r]=t[r])}n(r(18)),n(r(19)),n(r(17))},function(t,e,r){"use strict";function n(t){for(var r in t)e.hasOwnProperty(r)||(e[r]=t[r])}n(r(40)),n(r(42)),n(r(39)),n(r(41)),n(r(38)),n(r(43)),n(r(14))},function(t,e,r){"use strict";function n(t){for(var r in t)e.hasOwnProperty(r)||(e[r]=t[r])}n(r(16)),n(r(15)),n(r(10)),n(r(11)),n(r(13)),n(r(30))},function(t,e,r){"use strict";function n(t){for(var r in t)e.hasOwnProperty(r)||(e[r]=t[r])}n(r(27)),n(r(23)),n(r(26)),n(r(29))},function(t,e,r){"use strict";function n(t){for(var r in t)e.hasOwnProperty(r)||(e[r]=t[r])}n(r(37))},function(t,e,r){"use strict";function n(t){var e=l.services.$injector,r=e.get("$controller"),n=e.instantiate;try{var i;return e.instantiate=function(t){e.instantiate=n,i=e.annotate(t)},r(t,{$scope:{}}),i}finally{e.instantiate=n}}function i(t){function e(e,n,i,o,a,s){return o.$on("$locationChangeSuccess",function(t){return r.forEach(function(e){return e(t)})}),l.services.locationConfig.html5Mode=function(){var e=t.html5Mode();return e=v.isObject(e)?e.enabled:e,e&&i.history},l.services.location.setUrl=function(t,r){void 0===r&&(r=!1),e.url(t),r&&e.replace()},l.services.template.get=function(t){return a.get(t,{cache:s,headers:{Accept:"text/html"}}).then(h.prop("data"))},p.bindFunctions(e,l.services.location,e,["replace","url","path","search","hash"]),p.bindFunctions(e,l.services.locationConfig,e,["port","protocol","host"]),p.bindFunctions(n,l.services.locationConfig,n,["baseHref"]),R}R=new f.UIRouter,R.stateProvider=new w.StateProvider(R.stateRegistry,R.stateService),R.stateRegistry.decorator("views",g.ng1ViewsBuilder),R.stateRegistry.decorator("onExit",b.getStateHookBuilder("onExit")),R.stateRegistry.decorator("onRetain",b.getStateHookBuilder("onRetain")),R.stateRegistry.decorator("onEnter",b.getStateHookBuilder("onEnter")),R.viewService.viewConfigFactory("ng1",g.ng1ViewConfigFactory),p.bindFunctions(t,l.services.locationConfig,t,["hashPrefix"]);var r=[];l.services.location.onChange=function(t){return r.push(t),function(){return p.removeFrom(r)(t)}},this.$get=e,e.$inject=["$location","$browser","$sniffer","$rootScope","$http","$templateCache"]}function o(t,e){l.services.$injector=t,l.services.$q=e}function a(){return R.urlRouterProvider.$get=function(){return R.urlRouter.update(!0),this.interceptDeferred||R.urlRouter.listen(),R.urlRouter},R.urlRouterProvider}function s(){return R.stateProvider.$get=function(){return R.stateRegistry.stateQueue.autoFlush(R.stateService),R.stateService},R.stateProvider}function u(){return R.transitionService.$get=function(){return R.transitionService},R.transitionService}function c(t){t.$watch(function(){m.trace.approximateDigests++})}var f=r(25),l=r(6),p=r(3),h=r(5),v=r(4),d=r(54),m=r(12),g=r(55),y=r(56),w=r(58),b=r(59),$=r(57);$.module("ui.router.angular1",[]);$.module("ui.router.util",["ng","ui.router.init"]),$.module("ui.router.router",["ui.router.util"]),$.module("ui.router.state",["ui.router.router","ui.router.util","ui.router.angular1"]),$.module("ui.router",["ui.router.init","ui.router.state","ui.router.angular1"]),$.module("ui.router.compat",["ui.router"]),e.annotateController=n;var R=null;i.$inject=["$locationProvider"],$.module("ui.router.init",[]).provider("$uiRouter",i),o.$inject=["$injector","$q"],$.module("ui.router.init").run(o),$.module("ui.router.init").run(["$uiRouter",function(t){}]),$.module("ui.router.util").provider("$urlMatcherFactory",["$uiRouterProvider",function(){return R.urlMatcherFactory}]),$.module("ui.router.util").run(["$urlMatcherFactory",function(t){}]),$.module("ui.router.router").provider("$urlRouter",["$uiRouterProvider",a]),$.module("ui.router.router").run(["$urlRouter",function(t){}]),$.module("ui.router.state").provider("$state",["$uiRouterProvider",s]),$.module("ui.router.state").run(["$state",function(t){}]),$.module("ui.router.state").factory("$stateParams",["$uiRouter",function(t){return t.globals.params}]),$.module("ui.router.state").provider("$transitions",["$uiRouterProvider",u]),$.module("ui.router.util").factory("$templateFactory",["$uiRouter",function(){return new y.TemplateFactory}]),$.module("ui.router").factory("$view",function(){return R.viewService}),$.module("ui.router").factory("$resolve",d.resolveFactory),$.module("ui.router").service("$trace",function(){return m.trace}),c.$inject=["$rootScope"],e.watchDigests=c,$.module("ui.router").run(c),e.getLocals=function(t){var e=t.getTokens().filter(v.isString),r=e.map(function(e){return[e,t.getResolvable(e).data]});return r.reduce(p.applyPairs,{})}},function(t,e,r){"use strict";var n=r(42),i=r(21),o=r(17),a=r(3),s=r(40),u={resolve:function(t,e,r){void 0===e&&(e={});var u=new i.PathNode(new n.State({params:{},resolvables:[]})),c=new i.PathNode(new n.State({params:{},resolvables:[]})),f=new o.ResolveContext([u,c]);f.addResolvables(s.resolvablesBuilder({resolve:t}),c.state);var l=function(t){var r=function(t){return s.resolvablesBuilder({resolve:a.mapObj(t,function(t){return function(){return t}})})};f.addResolvables(r(t),u.state),f.addResolvables(r(e),c.state);var n=function(t,e){return t[e.token]=e.value,t};return f.resolvePath().then(function(t){return t.reduce(n,{})})};return r?r.then(l):l({})}};e.resolveFactory=function(){return u}},function(t,e,r){"use strict";function n(t){var e=["templateProvider","templateUrl","template","notify","async"],r=["controller","controllerProvider","controllerAs","resolveAs"],n=["component","bindings"],c=e.concat(r),f=n.concat(c),l={},p=t.views||{$default:o.pick(t,f)};return o.forEach(p,function(e,r){if(r=r||"$default",u.isString(e)&&(e={component:e}),Object.keys(e).length){if(e.component){if(c.map(function(t){return u.isDefined(e[t])}).reduce(o.anyTrueR,!1))throw new Error("Cannot combine: "+n.join("|")+" with: "+c.join("|")+" in stateview: 'name@"+t.name+"'");e.templateProvider=["$injector",function(t){var r=function(t){return e.bindings&&e.bindings[t]||t},n=v.version.minor>=3?"::":"",o=function(t){var e=a.kebobString(t.name),i=r(t.name);return"@"===t.type?e+"='{{"+n+"$resolve."+i+"}}'":e+"='"+n+"$resolve."+i+"'"},s=i(t,e.component).map(o).join(" "),u=a.kebobString(e.component);return"<"+u+" "+s+"></"+u+">"}]}e.resolveAs=e.resolveAs||"$resolve",e.$type="ng1",e.$context=t,e.$name=r;var f=s.ViewService.normalizeUIViewTarget(e.$context,e.$name);e.$uiViewName=f.uiViewName,e.$uiViewContextAnchor=f.uiViewContextAnchor,l[r]=e}}),l}function i(t,e){var r=t.get(e+"Directive");if(!r||!r.length)throw new Error("Unable to find component named '"+e+"'");return r.map(m).reduce(o.unnestR,[])}var o=r(3),a=r(9),s=r(37),u=r(4),c=r(6),f=r(12),l=r(56),p=r(17),h=r(19),v=r(57);e.ng1ViewConfigFactory=function(t,e){return[new y(t,e)]},e.ng1ViewsBuilder=n;var d=function(t){return Object.keys(t||{}).map(function(e){return[e,/^([=<@])[?]?(.*)/.exec(t[e])]}).filter(function(t){return u.isDefined(t)&&u.isDefined(t[1])}).map(function(t){return{name:t[1][2]||t[0],type:t[1][1]}})},m=function(t){return d(u.isObject(t.bindToController)?t.bindToController:t.scope)},g=0,y=function(){function t(t,e){this.path=t,this.viewDecl=e,this.$id=g++,this.loaded=!1}return t.prototype.load=function(){var t=this,e=c.services.$q;if(!this.hasTemplate())throw new Error("No template configuration specified for '"+this.viewDecl.$uiViewName+"@"+this.viewDecl.$uiViewContextAnchor+"'");var r=new p.ResolveContext(this.path),n=this.path.reduce(function(t,e){return o.extend(t,e.paramValues)},{}),i={template:e.when(this.getTemplate(n,new l.TemplateFactory,r)),controller:e.when(this.getController(r))};return e.all(i).then(function(e){return f.trace.traceViewServiceEvent("Loaded",t),t.controller=e.controller,t.template=e.template,t})},t.prototype.hasTemplate=function(){return!!(this.viewDecl.template||this.viewDecl.templateUrl||this.viewDecl.templateProvider)},t.prototype.getTemplate=function(t,e,r){return e.fromConfig(this.viewDecl,t,r)},t.prototype.getController=function(t){var e=this.viewDecl.controllerProvider;if(!u.isInjectable(e))return this.viewDecl.controller;var r=c.services.$injector.annotate(e),n=u.isArray(e)?o.tail(e):e,i=new h.Resolvable("",n,r);return i.get(t)},t}();e.Ng1ViewConfig=y},function(t,e,r){"use strict";var n=r(4),i=r(6),o=r(3),a=r(19),s=function(){function t(){}return t.prototype.fromConfig=function(t,e,r){return n.isDefined(t.template)?this.fromString(t.template,e):n.isDefined(t.templateUrl)?this.fromUrl(t.templateUrl,e):n.isDefined(t.templateProvider)?this.fromProvider(t.templateProvider,e,r):null},t.prototype.fromString=function(t,e){return n.isFunction(t)?t(e):t},t.prototype.fromUrl=function(t,e){return n.isFunction(t)&&(t=t(e)),null==t?null:i.services.template.get(t)},t.prototype.fromProvider=function(t,e,r){var s=i.services.$injector.annotate(t),u=n.isArray(t)?o.tail(t):t,c=new a.Resolvable("",u,s);return c.get(r)},t}();e.TemplateFactory=s},function(e,r){e.exports=t},function(t,e,r){"use strict";var n=r(4),i=r(3),o=function(){function t(e,r){this.stateRegistry=e,this.stateService=r,i.bindFunctions(t.prototype,this,this)}return t.prototype.decorator=function(t,e){return this.stateRegistry.decorator(t,e)||this},t.prototype.state=function(t,e){return n.isObject(t)?e=t:e.name=t,this.stateRegistry.register(e),this},t.prototype.onInvalid=function(t){return this.stateService.onInvalid(t)},t}();e.StateProvider=o},function(t,e,r){"use strict";var n=r(6),i=r(53),o=r(17),a=r(3);e.getStateHookBuilder=function(t){return function(e,r){function s(t,e){var r=new o.ResolveContext(t.treeChanges().to);return n.services.$injector.invoke(u,this,a.extend({$state$:e},i.getLocals(r)))}var u=e[t];return u?s:void 0}}},function(t,e,r){"use strict";function n(t,e){var r,n=t.match(/^\s*({[^}]*})\s*$/);if(n&&(t=e+"("+n[1]+")"),r=t.replace(/\n/g," ").match(/^([^(]+?)\s*(\((.*)\))?$/),!r||4!==r.length)throw new Error("Invalid state ref '"+t+"'");return{state:r[1],paramExpr:r[3]||null}}function i(t){var e=t.parent().inheritedData("$uiView"),r=l.parse("$cfg.path")(e);return r?c.tail(r).state.name:void 0}function o(t){var e="[object SVGAnimatedString]"===Object.prototype.toString.call(t.prop("href")),r="FORM"===t[0].nodeName;return{attr:r?"action":e?"xlink:href":"href",isAnchor:"A"===t.prop("tagName").toUpperCase(),clickable:!r}}function a(t,e,r,n,i){return function(o){var a=o.which||o.button,s=i();if(!(a>1||o.ctrlKey||o.metaKey||o.shiftKey||t.attr("target"))){var u=r(function(){e.go(s.state,s.params,s.options)});o.preventDefault();var c=n.isAnchor&&!s.href?1:0;o.preventDefault=function(){c--<=0&&r.cancel(u)}}}}function s(t,e){return{relative:i(t)||e.$current,inherit:!0,source:"sref"}}var u=r(57),c=r(3),f=r(4),l=r(5),p=["$state","$timeout",function(t,e){return{restrict:"A",require:["?^uiSrefActive","?^uiSrefActiveEq"],link:function(r,i,f,l){var p,h=n(f.uiSref,t.current.name),v={state:h.state,href:null,params:null,options:null},d=o(i),m=l[1]||l[0],g=null;v.options=c.extend(s(i,t),f.uiSrefOpts?r.$eval(f.uiSrefOpts):{});var y=function(e){e&&(v.params=u.copy(e)),v.href=t.href(h.state,v.params,v.options),g&&g(),m&&(g=m.$$addStateInfo(h.state,v.params)),null!==v.href&&f.$set(d.attr,v.href)};h.paramExpr&&(r.$watch(h.paramExpr,function(t){t!==v.params&&y(t)},!0),v.params=u.copy(r.$eval(h.paramExpr))),y(),d.clickable&&(p=a(i,t,e,d,function(){return v}),i.on("click",p),r.$on("$destroy",function(){i.off("click",p)}))}}}],h=["$state","$timeout",function(t,e){return{restrict:"A",require:["?^uiSrefActive","?^uiSrefActiveEq"],link:function(r,n,i,s){function u(e){v.state=e[0],v.params=e[1],v.options=e[2],v.href=t.href(v.state,v.params,v.options),d&&d(),l&&(d=l.$$addStateInfo(v.state,v.params)),v.href&&i.$set(f.attr,v.href)}var c,f=o(n),l=s[1]||s[0],p=[i.uiState,i.uiStateParams||null,i.uiStateOpts||null],h="["+p.map(function(t){return t||"null"}).join(", ")+"]",v={state:null,params:null,options:null,href:null},d=null;r.$watch(h,u,!0),u(r.$eval(h)),f.clickable&&(c=a(n,t,e,f,function(){return v}),n.on("click",c),r.$on("$destroy",function(){n.off("click",c)}))}}}],v=["$state","$stateParams","$interpolate","$transitions","$uiRouter",function(t,e,r,o,a){return{restrict:"A",controller:["$scope","$element","$attrs","$timeout",function(e,s,u,l){function p(t){t.promise.then(d)}function h(e,r,n){var o=t.get(e,i(s)),a=v(e,r),u={state:o||{name:e},params:r,hash:a};return R.push(u),S[a]=n,function(){var t=R.indexOf(u);t!==-1&&R.splice(t,1)}}function v(t,r){if(!f.isString(t))throw new Error("state should be a string");return f.isObject(r)?t+c.toJson(r):(r=e.$eval(r),f.isObject(r)?t+c.toJson(r):t)}function d(){for(var t=0;t<R.length;t++)y(R[t].state,R[t].params)?m(s,S[R[t].hash]):g(s,S[R[t].hash]),w(R[t].state,R[t].params)?m(s,b):g(s,b)}function m(t,e){l(function(){t.addClass(e)})}function g(t,e){t.removeClass(e)}function y(e,r){return t.includes(e.name,r)}function w(e,r){return t.is(e.name,r)}var b,$,R=[],S={};b=r(u.uiSrefActiveEq||"",!1)(e);try{$=e.$eval(u.uiSrefActive)}catch(E){}$=$||r(u.uiSrefActive||"",!1)(e),f.isObject($)&&c.forEach($,function(r,i){if(f.isString(r)){var o=n(r,t.current.name);h(o.state,e.$eval(o.paramExpr),i)}}),this.$$addStateInfo=function(t,e){if(!(f.isObject($)&&R.length>0)){var r=h(t,e,$);return d(),r}},e.$on("$stateChangeSuccess",d),e.$on("$destroy",o.onStart({},p)),a.globals.transition&&p(a.globals.transition),d()}]}}];u.module("ui.router.state").directive("uiSref",p).directive("uiSrefActive",v).directive("uiSrefActiveEq",v).directive("uiState",h)},function(t,e,r){"use strict";function n(t){var e=function(e,r,n){return t.is(e,r,n)};return e.$stateful=!0,e}function i(t){var e=function(e,r,n){return t.includes(e,r,n)};return e.$stateful=!0,e}var o=r(57);n.$inject=["$state"],e.$IsStateFilter=n,i.$inject=["$state"],e.$IncludedByStateFilter=i,o.module("ui.router.state").filter("isState",n).filter("includedByState",i)},function(t,e,r){"use strict";function n(t,e,r,n,u){var v=c.parse("viewDecl.controllerAs"),d=c.parse("viewDecl.resolveAs");return{restrict:"ECA",priority:-400,compile:function(n){var u=n.html();return function(n,c){var m=c.data("$uiView");if(m){var g=m.$cfg||{viewDecl:{}};c.html(g.template||u),s.trace.traceUIViewFill(m.$uiView,c.html());var y=t(c.contents()),w=g.controller,b=v(g),$=d(g),R=g.path&&new f.ResolveContext(g.path),S=R&&p.getLocals(R);if(n[$]=S,w){var E=e(w,o.extend({},S,{$scope:n,$element:c}));b&&(n[b]=E,n[b][$]=S),c.data("$ngControllerController",E),c.children().data("$ngControllerController",E),i(r,E,n,g)}if(a.isString(g.viewDecl.component))var x=g.viewDecl.component,k=l.kebobString(x),P=function(){var t=[].slice.call(c[0].children).filter(function(t){return t&&t.tagName&&t.tagName.toLowerCase()===k});return t&&h.element(t).data("$"+x+"Controller")},_=n.$watch(P,function(t){t&&(i(r,t,n,g),_())});y(n)}}}}}function i(t,e,r,n){!a.isFunction(e.$onInit)||n.viewDecl.component&&d||e.$onInit();var i=o.tail(n.path).state.self,s={bind:e};if(a.isFunction(e.uiOnParamsChanged)){var u=new f.ResolveContext(n.path),c=u.getResolvable("$transition$").data,l=function(t){if(t!==c&&t.exiting().indexOf(i)===-1){var r=t.params("to"),n=t.params("from"),a=t.treeChanges().to.map(function(t){return t.paramSchema}).reduce(o.unnestR,[]),s=t.treeChanges().from.map(function(t){return t.paramSchema}).reduce(o.unnestR,[]),u=a.filter(function(t){var e=s.indexOf(t);return e===-1||!s[e].type.equals(r[t.id],n[t.id])});if(u.length){var f=u.map(function(t){return t.id});e.uiOnParamsChanged(o.filter(r,function(t,e){return f.indexOf(e)!==-1}),t)}}};r.$on("$destroy",t.onSuccess({},l,s))}if(a.isFunction(e.uiCanExit)){var p={exiting:i.name};r.$on("$destroy",t.onBefore(p,e.uiCanExit,s))}}var o=r(3),a=r(4),s=r(12),u=r(55),c=r(5),f=r(17),l=r(9),p=r(53),h=r(57),v=["$view","$animate","$uiViewScroll","$interpolate","$q",function(t,e,r,n,i){function o(t,r){return{enter:function(t,r,n){h.version.minor>2?e.enter(t,null,r).then(n):e.enter(t,null,r,n)},leave:function(t,r){h.version.minor>2?e.leave(t).then(r):e.leave(t,r)}}}function f(t,e){return t===e}var l={$cfg:{viewDecl:{$context:t.rootContext()}},$uiView:{}},p={count:0,restrict:"ECA",terminal:!0,priority:400,transclude:"element",compile:function(e,h,v){return function(e,h,d){function m(t){(!t||t instanceof u.Ng1ViewConfig)&&(f(k,t)||(s.trace.traceUIViewConfigUpdated(C,t&&t.viewDecl&&t.viewDecl.$context),k=t,y(t)))}function g(){if(w&&(s.trace.traceUIViewEvent("Removing (previous) el",w.data("$uiView")),w.remove(),w=null),$&&(s.trace.traceUIViewEvent("Destroying scope",C),$.$destroy(),$=null),b){var t=b.data("$uiViewAnim");s.trace.traceUIViewEvent("Animate out",t),x.leave(b,function(){t.$$animLeave.resolve(),w=null}),w=b,b=null}}function y(t){var n=e.$new(),o=i.defer(),s=i.defer(),u={$cfg:t,$uiView:C},c={$animEnter:o.promise,$animLeave:s.promise,$$animLeave:s},f=v(n,function(t){t.data("$uiViewAnim",c),t.data("$uiView",u),
x.enter(t,h,function(){o.resolve(),$&&$.$emit("$viewContentAnimationEnded"),(a.isDefined(E)&&!E||e.$eval(E))&&r(t)}),g()});b=f,$=n,$.$emit("$viewContentLoaded",t||k),$.$eval(S)}var w,b,$,R,S=d.onload||"",E=d.autoscroll,x=o(d,e),k=void 0,P=h.inheritedData("$uiView")||l,_=n(d.uiView||d.name||"")(e)||"$default",C={$type:"ng1",id:p.count++,name:_,fqn:P.$uiView.fqn?P.$uiView.fqn+"."+_:_,config:null,configUpdated:m,get creationContext(){return c.parse("$cfg.viewDecl.$context")(P)}};s.trace.traceUIViewEvent("Linking",C),h.data("$uiView",{$uiView:C}),y(),R=t.registerUIView(C),e.$on("$destroy",function(){s.trace.traceUIViewEvent("Destroying/Unregistering",C),R()})}}};return p}];n.$inject=["$compile","$controller","$transitions","$view","$timeout"];var d="function"==typeof h.module("ui.router").component;h.module("ui.router.state").directive("uiView",v),h.module("ui.router.state").directive("uiView",n)},function(t,e,r){"use strict";function n(){var t=!1;this.useAnchorScroll=function(){t=!0},this.$get=["$anchorScroll","$timeout",function(e,r){return t?e:function(t){return r(function(){t[0].scrollIntoView()},0,!1)}}]}var i=r(57);i.module("ui.router.state").provider("$uiViewScroll",n)}])});
//# sourceMappingURL=angular-ui-router.min.js.map
/**!
 * AngularJS file upload directives and services. Supoorts: file upload/drop/paste, resume, cancel/abort,
 * progress, resize, thumbnail, preview, validation and CORS
 * @author  Danial  <danial.farid@gmail.com>
 * @version 12.2.13
 */

if (window.XMLHttpRequest && !(window.FileAPI && FileAPI.shouldLoad)) {
  window.XMLHttpRequest.prototype.setRequestHeader = (function (orig) {
    return function (header, value) {
      if (header === '__setXHR_') {
        var val = value(this);
        // fix for angular < 1.2.0
        if (val instanceof Function) {
          val(this);
        }
      } else {
        orig.apply(this, arguments);
      }
    };
  })(window.XMLHttpRequest.prototype.setRequestHeader);
}

var ngFileUpload = angular.module('ngFileUpload', []);

ngFileUpload.version = '12.2.13';

ngFileUpload.service('UploadBase', ['$http', '$q', '$timeout', function ($http, $q, $timeout) {
  var upload = this;
  upload.promisesCount = 0;

  this.isResumeSupported = function () {
    return window.Blob && window.Blob.prototype.slice;
  };

  var resumeSupported = this.isResumeSupported();

  function sendHttp(config) {
    config.method = config.method || 'POST';
    config.headers = config.headers || {};

    var deferred = config._deferred = config._deferred || $q.defer();
    var promise = deferred.promise;

    function notifyProgress(e) {
      if (deferred.notify) {
        deferred.notify(e);
      }
      if (promise.progressFunc) {
        $timeout(function () {
          promise.progressFunc(e);
        });
      }
    }

    function getNotifyEvent(n) {
      if (config._start != null && resumeSupported) {
        return {
          loaded: n.loaded + config._start,
          total: (config._file && config._file.size) || n.total,
          type: n.type, config: config,
          lengthComputable: true, target: n.target
        };
      } else {
        return n;
      }
    }

    if (!config.disableProgress) {
      config.headers.__setXHR_ = function () {
        return function (xhr) {
          if (!xhr || !xhr.upload || !xhr.upload.addEventListener) return;
          config.__XHR = xhr;
          if (config.xhrFn) config.xhrFn(xhr);
          xhr.upload.addEventListener('progress', function (e) {
            e.config = config;
            notifyProgress(getNotifyEvent(e));
          }, false);
          //fix for firefox not firing upload progress end, also IE8-9
          xhr.upload.addEventListener('load', function (e) {
            if (e.lengthComputable) {
              e.config = config;
              notifyProgress(getNotifyEvent(e));
            }
          }, false);
        };
      };
    }

    function uploadWithAngular() {
      $http(config).then(function (r) {
          if (resumeSupported && config._chunkSize && !config._finished && config._file) {
            var fileSize = config._file && config._file.size || 0;
            notifyProgress({
                loaded: Math.min(config._end, fileSize),
                total: fileSize,
                config: config,
                type: 'progress'
              }
            );
            upload.upload(config, true);
          } else {
            if (config._finished) delete config._finished;
            deferred.resolve(r);
          }
        }, function (e) {
          deferred.reject(e);
        }, function (n) {
          deferred.notify(n);
        }
      );
    }

    if (!resumeSupported) {
      uploadWithAngular();
    } else if (config._chunkSize && config._end && !config._finished) {
      config._start = config._end;
      config._end += config._chunkSize;
      uploadWithAngular();
    } else if (config.resumeSizeUrl) {
      $http.get(config.resumeSizeUrl).then(function (resp) {
        if (config.resumeSizeResponseReader) {
          config._start = config.resumeSizeResponseReader(resp.data);
        } else {
          config._start = parseInt((resp.data.size == null ? resp.data : resp.data.size).toString());
        }
        if (config._chunkSize) {
          config._end = config._start + config._chunkSize;
        }
        uploadWithAngular();
      }, function (e) {
        throw e;
      });
    } else if (config.resumeSize) {
      config.resumeSize().then(function (size) {
        config._start = size;
        if (config._chunkSize) {
          config._end = config._start + config._chunkSize;
        }
        uploadWithAngular();
      }, function (e) {
        throw e;
      });
    } else {
      if (config._chunkSize) {
        config._start = 0;
        config._end = config._start + config._chunkSize;
      }
      uploadWithAngular();
    }


    promise.success = function (fn) {
      promise.then(function (response) {
        fn(response.data, response.status, response.headers, config);
      });
      return promise;
    };

    promise.error = function (fn) {
      promise.then(null, function (response) {
        fn(response.data, response.status, response.headers, config);
      });
      return promise;
    };

    promise.progress = function (fn) {
      promise.progressFunc = fn;
      promise.then(null, null, function (n) {
        fn(n);
      });
      return promise;
    };
    promise.abort = promise.pause = function () {
      if (config.__XHR) {
        $timeout(function () {
          config.__XHR.abort();
        });
      }
      return promise;
    };
    promise.xhr = function (fn) {
      config.xhrFn = (function (origXhrFn) {
        return function () {
          if (origXhrFn) origXhrFn.apply(promise, arguments);
          fn.apply(promise, arguments);
        };
      })(config.xhrFn);
      return promise;
    };

    upload.promisesCount++;
    if (promise['finally'] && promise['finally'] instanceof Function) {
      promise['finally'](function () {
        upload.promisesCount--;
      });
    }
    return promise;
  }

  this.isUploadInProgress = function () {
    return upload.promisesCount > 0;
  };

  this.rename = function (file, name) {
    file.ngfName = name;
    return file;
  };

  this.jsonBlob = function (val) {
    if (val != null && !angular.isString(val)) {
      val = JSON.stringify(val);
    }
    var blob = new window.Blob([val], {type: 'application/json'});
    blob._ngfBlob = true;
    return blob;
  };

  this.json = function (val) {
    return angular.toJson(val);
  };

  function copy(obj) {
    var clone = {};
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        clone[key] = obj[key];
      }
    }
    return clone;
  }

  this.isFile = function (file) {
    return file != null && (file instanceof window.Blob || (file.flashId && file.name && file.size));
  };

  this.upload = function (config, internal) {
    function toResumeFile(file, formData) {
      if (file._ngfBlob) return file;
      config._file = config._file || file;
      if (config._start != null && resumeSupported) {
        if (config._end && config._end >= file.size) {
          config._finished = true;
          config._end = file.size;
        }
        var slice = file.slice(config._start, config._end || file.size);
        slice.name = file.name;
        slice.ngfName = file.ngfName;
        if (config._chunkSize) {
          formData.append('_chunkSize', config._chunkSize);
          formData.append('_currentChunkSize', config._end - config._start);
          formData.append('_chunkNumber', Math.floor(config._start / config._chunkSize));
          formData.append('_totalSize', config._file.size);
        }
        return slice;
      }
      return file;
    }

    function addFieldToFormData(formData, val, key) {
      if (val !== undefined) {
        if (angular.isDate(val)) {
          val = val.toISOString();
        }
        if (angular.isString(val)) {
          formData.append(key, val);
        } else if (upload.isFile(val)) {
          var file = toResumeFile(val, formData);
          var split = key.split(',');
          if (split[1]) {
            file.ngfName = split[1].replace(/^\s+|\s+$/g, '');
            key = split[0];
          }
          config._fileKey = config._fileKey || key;
          formData.append(key, file, file.ngfName || file.name);
        } else {
          if (angular.isObject(val)) {
            if (val.$$ngfCircularDetection) throw 'ngFileUpload: Circular reference in config.data. Make sure specified data for Upload.upload() has no circular reference: ' + key;

            val.$$ngfCircularDetection = true;
            try {
              for (var k in val) {
                if (val.hasOwnProperty(k) && k !== '$$ngfCircularDetection') {
                  var objectKey = config.objectKey == null ? '[i]' : config.objectKey;
                  if (val.length && parseInt(k) > -1) {
                    objectKey = config.arrayKey == null ? objectKey : config.arrayKey;
                  }
                  addFieldToFormData(formData, val[k], key + objectKey.replace(/[ik]/g, k));
                }
              }
            } finally {
              delete val.$$ngfCircularDetection;
            }
          } else {
            formData.append(key, val);
          }
        }
      }
    }

    function digestConfig() {
      config._chunkSize = upload.translateScalars(config.resumeChunkSize);
      config._chunkSize = config._chunkSize ? parseInt(config._chunkSize.toString()) : null;

      config.headers = config.headers || {};
      config.headers['Content-Type'] = undefined;
      config.transformRequest = config.transformRequest ?
        (angular.isArray(config.transformRequest) ?
          config.transformRequest : [config.transformRequest]) : [];
      config.transformRequest.push(function (data) {
        var formData = new window.FormData(), key;
        data = data || config.fields || {};
        if (config.file) {
          data.file = config.file;
        }
        for (key in data) {
          if (data.hasOwnProperty(key)) {
            var val = data[key];
            if (config.formDataAppender) {
              config.formDataAppender(formData, key, val);
            } else {
              addFieldToFormData(formData, val, key);
            }
          }
        }

        return formData;
      });
    }

    if (!internal) config = copy(config);
    if (!config._isDigested) {
      config._isDigested = true;
      digestConfig();
    }

    return sendHttp(config);
  };

  this.http = function (config) {
    config = copy(config);
    config.transformRequest = config.transformRequest || function (data) {
        if ((window.ArrayBuffer && data instanceof window.ArrayBuffer) || data instanceof window.Blob) {
          return data;
        }
        return $http.defaults.transformRequest[0].apply(this, arguments);
      };
    config._chunkSize = upload.translateScalars(config.resumeChunkSize);
    config._chunkSize = config._chunkSize ? parseInt(config._chunkSize.toString()) : null;

    return sendHttp(config);
  };

  this.translateScalars = function (str) {
    if (angular.isString(str)) {
      if (str.search(/kb/i) === str.length - 2) {
        return parseFloat(str.substring(0, str.length - 2) * 1024);
      } else if (str.search(/mb/i) === str.length - 2) {
        return parseFloat(str.substring(0, str.length - 2) * 1048576);
      } else if (str.search(/gb/i) === str.length - 2) {
        return parseFloat(str.substring(0, str.length - 2) * 1073741824);
      } else if (str.search(/b/i) === str.length - 1) {
        return parseFloat(str.substring(0, str.length - 1));
      } else if (str.search(/s/i) === str.length - 1) {
        return parseFloat(str.substring(0, str.length - 1));
      } else if (str.search(/m/i) === str.length - 1) {
        return parseFloat(str.substring(0, str.length - 1) * 60);
      } else if (str.search(/h/i) === str.length - 1) {
        return parseFloat(str.substring(0, str.length - 1) * 3600);
      }
    }
    return str;
  };

  this.urlToBlob = function(url) {
    var defer = $q.defer();
    $http({url: url, method: 'get', responseType: 'arraybuffer'}).then(function (resp) {
      var arrayBufferView = new Uint8Array(resp.data);
      var type = resp.headers('content-type') || 'image/WebP';
      var blob = new window.Blob([arrayBufferView], {type: type});
      var matches = url.match(/.*\/(.+?)(\?.*)?$/);
      if (matches.length > 1) {
        blob.name = matches[1];
      }
      defer.resolve(blob);
    }, function (e) {
      defer.reject(e);
    });
    return defer.promise;
  };

  this.setDefaults = function (defaults) {
    this.defaults = defaults || {};
  };

  this.defaults = {};
  this.version = ngFileUpload.version;
}

]);

ngFileUpload.service('Upload', ['$parse', '$timeout', '$compile', '$q', 'UploadExif', function ($parse, $timeout, $compile, $q, UploadExif) {
  var upload = UploadExif;
  upload.getAttrWithDefaults = function (attr, name) {
    if (attr[name] != null) return attr[name];
    var def = upload.defaults[name];
    return (def == null ? def : (angular.isString(def) ? def : JSON.stringify(def)));
  };

  upload.attrGetter = function (name, attr, scope, params) {
    var attrVal = this.getAttrWithDefaults(attr, name);
    if (scope) {
      try {
        if (params) {
          return $parse(attrVal)(scope, params);
        } else {
          return $parse(attrVal)(scope);
        }
      } catch (e) {
        // hangle string value without single qoute
        if (name.search(/min|max|pattern/i)) {
          return attrVal;
        } else {
          throw e;
        }
      }
    } else {
      return attrVal;
    }
  };

  upload.shouldUpdateOn = function (type, attr, scope) {
    var modelOptions = upload.attrGetter('ngfModelOptions', attr, scope);
    if (modelOptions && modelOptions.updateOn) {
      return modelOptions.updateOn.split(' ').indexOf(type) > -1;
    }
    return true;
  };

  upload.emptyPromise = function () {
    var d = $q.defer();
    var args = arguments;
    $timeout(function () {
      d.resolve.apply(d, args);
    });
    return d.promise;
  };

  upload.rejectPromise = function () {
    var d = $q.defer();
    var args = arguments;
    $timeout(function () {
      d.reject.apply(d, args);
    });
    return d.promise;
  };

  upload.happyPromise = function (promise, data) {
    var d = $q.defer();
    promise.then(function (result) {
      d.resolve(result);
    }, function (error) {
      $timeout(function () {
        throw error;
      });
      d.resolve(data);
    });
    return d.promise;
  };

  function applyExifRotations(files, attr, scope) {
    var promises = [upload.emptyPromise()];
    angular.forEach(files, function (f, i) {
      if (f.type.indexOf('image/jpeg') === 0 && upload.attrGetter('ngfFixOrientation', attr, scope, {$file: f})) {
        promises.push(upload.happyPromise(upload.applyExifRotation(f), f).then(function (fixedFile) {
          files.splice(i, 1, fixedFile);
        }));
      }
    });
    return $q.all(promises);
  }

  function resizeFile(files, attr, scope, ngModel) {
    var resizeVal = upload.attrGetter('ngfResize', attr, scope);
    if (!resizeVal || !upload.isResizeSupported() || !files.length) return upload.emptyPromise();
    if (resizeVal instanceof Function) {
      var defer = $q.defer();
      return resizeVal(files).then(function (p) {
        resizeWithParams(p, files, attr, scope, ngModel).then(function (r) {
          defer.resolve(r);
        }, function (e) {
          defer.reject(e);
        });
      }, function (e) {
        defer.reject(e);
      });
    } else {
      return resizeWithParams(resizeVal, files, attr, scope, ngModel);
    }
  }

  function resizeWithParams(params, files, attr, scope, ngModel) {
    var promises = [upload.emptyPromise()];

    function handleFile(f, i) {
      if (f.type.indexOf('image') === 0) {
        if (params.pattern && !upload.validatePattern(f, params.pattern)) return;
        params.resizeIf = function (width, height) {
          return upload.attrGetter('ngfResizeIf', attr, scope,
            {$width: width, $height: height, $file: f});
        };
        var promise = upload.resize(f, params);
        promises.push(promise);
        promise.then(function (resizedFile) {
          files.splice(i, 1, resizedFile);
        }, function (e) {
          f.$error = 'resize';
          (f.$errorMessages = (f.$errorMessages || {})).resize = true;
          f.$errorParam = (e ? (e.message ? e.message : e) + ': ' : '') + (f && f.name);
          ngModel.$ngfValidations.push({name: 'resize', valid: false});
          upload.applyModelValidation(ngModel, files);
        });
      }
    }

    for (var i = 0; i < files.length; i++) {
      handleFile(files[i], i);
    }
    return $q.all(promises);
  }

  upload.updateModel = function (ngModel, attr, scope, fileChange, files, evt, noDelay) {
    function update(files, invalidFiles, newFiles, dupFiles, isSingleModel) {
      attr.$$ngfPrevValidFiles = files;
      attr.$$ngfPrevInvalidFiles = invalidFiles;
      var file = files && files.length ? files[0] : null;
      var invalidFile = invalidFiles && invalidFiles.length ? invalidFiles[0] : null;

      if (ngModel) {
        upload.applyModelValidation(ngModel, files);
        ngModel.$setViewValue(isSingleModel ? file : files);
      }

      if (fileChange) {
        $parse(fileChange)(scope, {
          $files: files,
          $file: file,
          $newFiles: newFiles,
          $duplicateFiles: dupFiles,
          $invalidFiles: invalidFiles,
          $invalidFile: invalidFile,
          $event: evt
        });
      }

      var invalidModel = upload.attrGetter('ngfModelInvalid', attr);
      if (invalidModel) {
        $timeout(function () {
          $parse(invalidModel).assign(scope, isSingleModel ? invalidFile : invalidFiles);
        });
      }
      $timeout(function () {
        // scope apply changes
      });
    }

    var allNewFiles, dupFiles = [], prevValidFiles, prevInvalidFiles,
      invalids = [], valids = [];

    function removeDuplicates() {
      function equals(f1, f2) {
        return f1.name === f2.name && (f1.$ngfOrigSize || f1.size) === (f2.$ngfOrigSize || f2.size) &&
          f1.type === f2.type;
      }

      function isInPrevFiles(f) {
        var j;
        for (j = 0; j < prevValidFiles.length; j++) {
          if (equals(f, prevValidFiles[j])) {
            return true;
          }
        }
        for (j = 0; j < prevInvalidFiles.length; j++) {
          if (equals(f, prevInvalidFiles[j])) {
            return true;
          }
        }
        return false;
      }

      if (files) {
        allNewFiles = [];
        dupFiles = [];
        for (var i = 0; i < files.length; i++) {
          if (isInPrevFiles(files[i])) {
            dupFiles.push(files[i]);
          } else {
            allNewFiles.push(files[i]);
          }
        }
      }
    }

    function toArray(v) {
      return angular.isArray(v) ? v : [v];
    }

    function resizeAndUpdate() {
      function updateModel() {
        $timeout(function () {
          update(keep ? prevValidFiles.concat(valids) : valids,
            keep ? prevInvalidFiles.concat(invalids) : invalids,
            files, dupFiles, isSingleModel);
        }, options && options.debounce ? options.debounce.change || options.debounce : 0);
      }

      var resizingFiles = validateAfterResize ? allNewFiles : valids;
      resizeFile(resizingFiles, attr, scope, ngModel).then(function () {
        if (validateAfterResize) {
          upload.validate(allNewFiles, keep ? prevValidFiles.length : 0, ngModel, attr, scope)
            .then(function (validationResult) {
              valids = validationResult.validsFiles;
              invalids = validationResult.invalidsFiles;
              updateModel();
            });
        } else {
          updateModel();
        }
      }, function () {
        for (var i = 0; i < resizingFiles.length; i++) {
          var f = resizingFiles[i];
          if (f.$error === 'resize') {
            var index = valids.indexOf(f);
            if (index > -1) {
              valids.splice(index, 1);
              invalids.push(f);
            }
            updateModel();
          }
        }
      });
    }

    prevValidFiles = attr.$$ngfPrevValidFiles || [];
    prevInvalidFiles = attr.$$ngfPrevInvalidFiles || [];
    if (ngModel && ngModel.$modelValue) {
      prevValidFiles = toArray(ngModel.$modelValue);
    }

    var keep = upload.attrGetter('ngfKeep', attr, scope);
    allNewFiles = (files || []).slice(0);
    if (keep === 'distinct' || upload.attrGetter('ngfKeepDistinct', attr, scope) === true) {
      removeDuplicates(attr, scope);
    }

    var isSingleModel = !keep && !upload.attrGetter('ngfMultiple', attr, scope) && !upload.attrGetter('multiple', attr);

    if (keep && !allNewFiles.length) return;

    upload.attrGetter('ngfBeforeModelChange', attr, scope, {
      $files: files,
      $file: files && files.length ? files[0] : null,
      $newFiles: allNewFiles,
      $duplicateFiles: dupFiles,
      $event: evt
    });

    var validateAfterResize = upload.attrGetter('ngfValidateAfterResize', attr, scope);

    var options = upload.attrGetter('ngfModelOptions', attr, scope);
    upload.validate(allNewFiles, keep ? prevValidFiles.length : 0, ngModel, attr, scope)
      .then(function (validationResult) {
      if (noDelay) {
        update(allNewFiles, [], files, dupFiles, isSingleModel);
      } else {
        if ((!options || !options.allowInvalid) && !validateAfterResize) {
          valids = validationResult.validFiles;
          invalids = validationResult.invalidFiles;
        } else {
          valids = allNewFiles;
        }
        if (upload.attrGetter('ngfFixOrientation', attr, scope) && upload.isExifSupported()) {
          applyExifRotations(valids, attr, scope).then(function () {
            resizeAndUpdate();
          });
        } else {
          resizeAndUpdate();
        }
      }
    });
  };

  return upload;
}]);

ngFileUpload.directive('ngfSelect', ['$parse', '$timeout', '$compile', 'Upload', function ($parse, $timeout, $compile, Upload) {
  var generatedElems = [];

  function isDelayedClickSupported(ua) {
    // fix for android native browser < 4.4 and safari windows
    var m = ua.match(/Android[^\d]*(\d+)\.(\d+)/);
    if (m && m.length > 2) {
      var v = Upload.defaults.androidFixMinorVersion || 4;
      return parseInt(m[1]) < 4 || (parseInt(m[1]) === v && parseInt(m[2]) < v);
    }

    // safari on windows
    return ua.indexOf('Chrome') === -1 && /.*Windows.*Safari.*/.test(ua);
  }

  function linkFileSelect(scope, elem, attr, ngModel, $parse, $timeout, $compile, upload) {
    /** @namespace attr.ngfSelect */
    /** @namespace attr.ngfChange */
    /** @namespace attr.ngModel */
    /** @namespace attr.ngfModelOptions */
    /** @namespace attr.ngfMultiple */
    /** @namespace attr.ngfCapture */
    /** @namespace attr.ngfValidate */
    /** @namespace attr.ngfKeep */
    var attrGetter = function (name, scope) {
      return upload.attrGetter(name, attr, scope);
    };

    function isInputTypeFile() {
      return elem[0].tagName.toLowerCase() === 'input' && attr.type && attr.type.toLowerCase() === 'file';
    }

    function fileChangeAttr() {
      return attrGetter('ngfChange') || attrGetter('ngfSelect');
    }

    function changeFn(evt) {
      if (upload.shouldUpdateOn('change', attr, scope)) {
        var fileList = evt.__files_ || (evt.target && evt.target.files), files = [];
        /* Handle duplicate call in  IE11 */
        if (!fileList) return;
        for (var i = 0; i < fileList.length; i++) {
          files.push(fileList[i]);
        }
        upload.updateModel(ngModel, attr, scope, fileChangeAttr(),
          files.length ? files : null, evt);
      }
    }

    upload.registerModelChangeValidator(ngModel, attr, scope);

    var unwatches = [];
    if (attrGetter('ngfMultiple')) {
      unwatches.push(scope.$watch(attrGetter('ngfMultiple'), function () {
        fileElem.attr('multiple', attrGetter('ngfMultiple', scope));
      }));
    }
    if (attrGetter('ngfCapture')) {
      unwatches.push(scope.$watch(attrGetter('ngfCapture'), function () {
        fileElem.attr('capture', attrGetter('ngfCapture', scope));
      }));
    }
    if (attrGetter('ngfAccept')) {
      unwatches.push(scope.$watch(attrGetter('ngfAccept'), function () {
        fileElem.attr('accept', attrGetter('ngfAccept', scope));
      }));
    }
    unwatches.push(attr.$observe('accept', function () {
      fileElem.attr('accept', attrGetter('accept'));
    }));
    function bindAttrToFileInput(fileElem, label) {
      function updateId(val) {
        fileElem.attr('id', 'ngf-' + val);
        label.attr('id', 'ngf-label-' + val);
      }

      for (var i = 0; i < elem[0].attributes.length; i++) {
        var attribute = elem[0].attributes[i];
        if (attribute.name !== 'type' && attribute.name !== 'class' && attribute.name !== 'style') {
          if (attribute.name === 'id') {
            updateId(attribute.value);
            unwatches.push(attr.$observe('id', updateId));
          } else {
            fileElem.attr(attribute.name, (!attribute.value && (attribute.name === 'required' ||
            attribute.name === 'multiple')) ? attribute.name : attribute.value);
          }
        }
      }
    }

    function createFileInput() {
      if (isInputTypeFile()) {
        return elem;
      }

      var fileElem = angular.element('<input type="file">');

      var label = angular.element('<label>upload</label>');
      label.css('visibility', 'hidden').css('position', 'absolute').css('overflow', 'hidden')
        .css('width', '0px').css('height', '0px').css('border', 'none')
        .css('margin', '0px').css('padding', '0px').attr('tabindex', '-1');
      bindAttrToFileInput(fileElem, label);

      generatedElems.push({el: elem, ref: label});

      document.body.appendChild(label.append(fileElem)[0]);

      return fileElem;
    }

    function clickHandler(evt) {
      if (elem.attr('disabled')) return false;
      if (attrGetter('ngfSelectDisabled', scope)) return;

      var r = detectSwipe(evt);
      // prevent the click if it is a swipe
      if (r != null) return r;

      resetModel(evt);

      // fix for md when the element is removed from the DOM and added back #460
      try {
        if (!isInputTypeFile() && !document.body.contains(fileElem[0])) {
          generatedElems.push({el: elem, ref: fileElem.parent()});
          document.body.appendChild(fileElem.parent()[0]);
          fileElem.bind('change', changeFn);
        }
      } catch (e) {/*ignore*/
      }

      if (isDelayedClickSupported(navigator.userAgent)) {
        setTimeout(function () {
          fileElem[0].click();
        }, 0);
      } else {
        fileElem[0].click();
      }

      return false;
    }


    var initialTouchStartY = 0;
    var initialTouchStartX = 0;

    function detectSwipe(evt) {
      var touches = evt.changedTouches || (evt.originalEvent && evt.originalEvent.changedTouches);
      if (touches) {
        if (evt.type === 'touchstart') {
          initialTouchStartX = touches[0].clientX;
          initialTouchStartY = touches[0].clientY;
          return true; // don't block event default
        } else {
          // prevent scroll from triggering event
          if (evt.type === 'touchend') {
            var currentX = touches[0].clientX;
            var currentY = touches[0].clientY;
            if ((Math.abs(currentX - initialTouchStartX) > 20) ||
              (Math.abs(currentY - initialTouchStartY) > 20)) {
              evt.stopPropagation();
              evt.preventDefault();
              return false;
            }
          }
          return true;
        }
      }
    }

    var fileElem = elem;

    function resetModel(evt) {
      if (upload.shouldUpdateOn('click', attr, scope) && fileElem.val()) {
        fileElem.val(null);
        upload.updateModel(ngModel, attr, scope, fileChangeAttr(), null, evt, true);
      }
    }

    if (!isInputTypeFile()) {
      fileElem = createFileInput();
    }
    fileElem.bind('change', changeFn);

    if (!isInputTypeFile()) {
      elem.bind('click touchstart touchend', clickHandler);
    } else {
      elem.bind('click', resetModel);
    }

    function ie10SameFileSelectFix(evt) {
      if (fileElem && !fileElem.attr('__ngf_ie10_Fix_')) {
        if (!fileElem[0].parentNode) {
          fileElem = null;
          return;
        }
        evt.preventDefault();
        evt.stopPropagation();
        fileElem.unbind('click');
        var clone = fileElem.clone();
        fileElem.replaceWith(clone);
        fileElem = clone;
        fileElem.attr('__ngf_ie10_Fix_', 'true');
        fileElem.bind('change', changeFn);
        fileElem.bind('click', ie10SameFileSelectFix);
        fileElem[0].click();
        return false;
      } else {
        fileElem.removeAttr('__ngf_ie10_Fix_');
      }
    }

    if (navigator.appVersion.indexOf('MSIE 10') !== -1) {
      fileElem.bind('click', ie10SameFileSelectFix);
    }

    if (ngModel) ngModel.$formatters.push(function (val) {
      if (val == null || val.length === 0) {
        if (fileElem.val()) {
          fileElem.val(null);
        }
      }
      return val;
    });

    scope.$on('$destroy', function () {
      if (!isInputTypeFile()) fileElem.parent().remove();
      angular.forEach(unwatches, function (unwatch) {
        unwatch();
      });
    });

    $timeout(function () {
      for (var i = 0; i < generatedElems.length; i++) {
        var g = generatedElems[i];
        if (!document.body.contains(g.el[0])) {
          generatedElems.splice(i, 1);
          g.ref.remove();
        }
      }
    });

    if (window.FileAPI && window.FileAPI.ngfFixIE) {
      window.FileAPI.ngfFixIE(elem, fileElem, changeFn);
    }
  }

  return {
    restrict: 'AEC',
    require: '?ngModel',
    link: function (scope, elem, attr, ngModel) {
      linkFileSelect(scope, elem, attr, ngModel, $parse, $timeout, $compile, Upload);
    }
  };
}]);

(function () {

  ngFileUpload.service('UploadDataUrl', ['UploadBase', '$timeout', '$q', function (UploadBase, $timeout, $q) {
    var upload = UploadBase;
    upload.base64DataUrl = function (file) {
      if (angular.isArray(file)) {
        var d = $q.defer(), count = 0;
        angular.forEach(file, function (f) {
          upload.dataUrl(f, true)['finally'](function () {
            count++;
            if (count === file.length) {
              var urls = [];
              angular.forEach(file, function (ff) {
                urls.push(ff.$ngfDataUrl);
              });
              d.resolve(urls, file);
            }
          });
        });
        return d.promise;
      } else {
        return upload.dataUrl(file, true);
      }
    };
    upload.dataUrl = function (file, disallowObjectUrl) {
      if (!file) return upload.emptyPromise(file, file);
      if ((disallowObjectUrl && file.$ngfDataUrl != null) || (!disallowObjectUrl && file.$ngfBlobUrl != null)) {
        return upload.emptyPromise(disallowObjectUrl ? file.$ngfDataUrl : file.$ngfBlobUrl, file);
      }
      var p = disallowObjectUrl ? file.$$ngfDataUrlPromise : file.$$ngfBlobUrlPromise;
      if (p) return p;

      var deferred = $q.defer();
      $timeout(function () {
        if (window.FileReader && file &&
          (!window.FileAPI || navigator.userAgent.indexOf('MSIE 8') === -1 || file.size < 20000) &&
          (!window.FileAPI || navigator.userAgent.indexOf('MSIE 9') === -1 || file.size < 4000000)) {
          //prefer URL.createObjectURL for handling refrences to files of all sizes
          //since it doesn´t build a large string in memory
          var URL = window.URL || window.webkitURL;
          if (URL && URL.createObjectURL && !disallowObjectUrl) {
            var url;
            try {
              url = URL.createObjectURL(file);
            } catch (e) {
              $timeout(function () {
                file.$ngfBlobUrl = '';
                deferred.reject();
              });
              return;
            }
            $timeout(function () {
              file.$ngfBlobUrl = url;
              if (url) {
                deferred.resolve(url, file);
                upload.blobUrls = upload.blobUrls || [];
                upload.blobUrlsTotalSize = upload.blobUrlsTotalSize || 0;
                upload.blobUrls.push({url: url, size: file.size});
                upload.blobUrlsTotalSize += file.size || 0;
                var maxMemory = upload.defaults.blobUrlsMaxMemory || 268435456;
                var maxLength = upload.defaults.blobUrlsMaxQueueSize || 200;
                while ((upload.blobUrlsTotalSize > maxMemory || upload.blobUrls.length > maxLength) && upload.blobUrls.length > 1) {
                  var obj = upload.blobUrls.splice(0, 1)[0];
                  URL.revokeObjectURL(obj.url);
                  upload.blobUrlsTotalSize -= obj.size;
                }
              }
            });
          } else {
            var fileReader = new FileReader();
            fileReader.onload = function (e) {
              $timeout(function () {
                file.$ngfDataUrl = e.target.result;
                deferred.resolve(e.target.result, file);
                $timeout(function () {
                  delete file.$ngfDataUrl;
                }, 1000);
              });
            };
            fileReader.onerror = function () {
              $timeout(function () {
                file.$ngfDataUrl = '';
                deferred.reject();
              });
            };
            fileReader.readAsDataURL(file);
          }
        } else {
          $timeout(function () {
            file[disallowObjectUrl ? '$ngfDataUrl' : '$ngfBlobUrl'] = '';
            deferred.reject();
          });
        }
      });

      if (disallowObjectUrl) {
        p = file.$$ngfDataUrlPromise = deferred.promise;
      } else {
        p = file.$$ngfBlobUrlPromise = deferred.promise;
      }
      p['finally'](function () {
        delete file[disallowObjectUrl ? '$$ngfDataUrlPromise' : '$$ngfBlobUrlPromise'];
      });
      return p;
    };
    return upload;
  }]);

  function getTagType(el) {
    if (el.tagName.toLowerCase() === 'img') return 'image';
    if (el.tagName.toLowerCase() === 'audio') return 'audio';
    if (el.tagName.toLowerCase() === 'video') return 'video';
    return /./;
  }

  function linkFileDirective(Upload, $timeout, scope, elem, attr, directiveName, resizeParams, isBackground) {
    function constructDataUrl(file) {
      var disallowObjectUrl = Upload.attrGetter('ngfNoObjectUrl', attr, scope);
      Upload.dataUrl(file, disallowObjectUrl)['finally'](function () {
        $timeout(function () {
          var src = (disallowObjectUrl ? file.$ngfDataUrl : file.$ngfBlobUrl) || file.$ngfDataUrl;
          if (isBackground) {
            elem.css('background-image', 'url(\'' + (src || '') + '\')');
          } else {
            elem.attr('src', src);
          }
          if (src) {
            elem.removeClass('ng-hide');
          } else {
            elem.addClass('ng-hide');
          }
        });
      });
    }

    $timeout(function () {
      var unwatch = scope.$watch(attr[directiveName], function (file) {
        var size = resizeParams;
        if (directiveName === 'ngfThumbnail') {
          if (!size) {
            size = {
              width: elem[0].naturalWidth || elem[0].clientWidth,
              height: elem[0].naturalHeight || elem[0].clientHeight
            };
          }
          if (size.width === 0 && window.getComputedStyle) {
            var style = getComputedStyle(elem[0]);
            if (style.width && style.width.indexOf('px') > -1 && style.height && style.height.indexOf('px') > -1) {
              size = {
                width: parseInt(style.width.slice(0, -2)),
                height: parseInt(style.height.slice(0, -2))
              };
            }
          }
        }

        if (angular.isString(file)) {
          elem.removeClass('ng-hide');
          if (isBackground) {
            return elem.css('background-image', 'url(\'' + file + '\')');
          } else {
            return elem.attr('src', file);
          }
        }
        if (file && file.type && file.type.search(getTagType(elem[0])) === 0 &&
          (!isBackground || file.type.indexOf('image') === 0)) {
          if (size && Upload.isResizeSupported()) {
            size.resizeIf = function (width, height) {
              return Upload.attrGetter('ngfResizeIf', attr, scope,
                {$width: width, $height: height, $file: file});
            };
            Upload.resize(file, size).then(
              function (f) {
                constructDataUrl(f);
              }, function (e) {
                throw e;
              }
            );
          } else {
            constructDataUrl(file);
          }
        } else {
          elem.addClass('ng-hide');
        }
      });

      scope.$on('$destroy', function () {
        unwatch();
      });
    });
  }


  /** @namespace attr.ngfSrc */
  /** @namespace attr.ngfNoObjectUrl */
  ngFileUpload.directive('ngfSrc', ['Upload', '$timeout', function (Upload, $timeout) {
    return {
      restrict: 'AE',
      link: function (scope, elem, attr) {
        linkFileDirective(Upload, $timeout, scope, elem, attr, 'ngfSrc',
          Upload.attrGetter('ngfResize', attr, scope), false);
      }
    };
  }]);

  /** @namespace attr.ngfBackground */
  /** @namespace attr.ngfNoObjectUrl */
  ngFileUpload.directive('ngfBackground', ['Upload', '$timeout', function (Upload, $timeout) {
    return {
      restrict: 'AE',
      link: function (scope, elem, attr) {
        linkFileDirective(Upload, $timeout, scope, elem, attr, 'ngfBackground',
          Upload.attrGetter('ngfResize', attr, scope), true);
      }
    };
  }]);

  /** @namespace attr.ngfThumbnail */
  /** @namespace attr.ngfAsBackground */
  /** @namespace attr.ngfSize */
  /** @namespace attr.ngfNoObjectUrl */
  ngFileUpload.directive('ngfThumbnail', ['Upload', '$timeout', function (Upload, $timeout) {
    return {
      restrict: 'AE',
      link: function (scope, elem, attr) {
        var size = Upload.attrGetter('ngfSize', attr, scope);
        linkFileDirective(Upload, $timeout, scope, elem, attr, 'ngfThumbnail', size,
          Upload.attrGetter('ngfAsBackground', attr, scope));
      }
    };
  }]);

  ngFileUpload.config(['$compileProvider', function ($compileProvider) {
    if ($compileProvider.imgSrcSanitizationWhitelist) $compileProvider.imgSrcSanitizationWhitelist(/^\s*(https?|ftp|mailto|tel|webcal|local|file|data|blob):/);
    if ($compileProvider.aHrefSanitizationWhitelist) $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|tel|webcal|local|file|data|blob):/);
  }]);

  ngFileUpload.filter('ngfDataUrl', ['UploadDataUrl', '$sce', function (UploadDataUrl, $sce) {
    return function (file, disallowObjectUrl, trustedUrl) {
      if (angular.isString(file)) {
        return $sce.trustAsResourceUrl(file);
      }
      var src = file && ((disallowObjectUrl ? file.$ngfDataUrl : file.$ngfBlobUrl) || file.$ngfDataUrl);
      if (file && !src) {
        if (!file.$ngfDataUrlFilterInProgress && angular.isObject(file)) {
          file.$ngfDataUrlFilterInProgress = true;
          UploadDataUrl.dataUrl(file, disallowObjectUrl);
        }
        return '';
      }
      if (file) delete file.$ngfDataUrlFilterInProgress;
      return (file && src ? (trustedUrl ? $sce.trustAsResourceUrl(src) : src) : file) || '';
    };
  }]);

})();

ngFileUpload.service('UploadValidate', ['UploadDataUrl', '$q', '$timeout', function (UploadDataUrl, $q, $timeout) {
  var upload = UploadDataUrl;

  function globStringToRegex(str) {
    var regexp = '', excludes = [];
    if (str.length > 2 && str[0] === '/' && str[str.length - 1] === '/') {
      regexp = str.substring(1, str.length - 1);
    } else {
      var split = str.split(',');
      if (split.length > 1) {
        for (var i = 0; i < split.length; i++) {
          var r = globStringToRegex(split[i]);
          if (r.regexp) {
            regexp += '(' + r.regexp + ')';
            if (i < split.length - 1) {
              regexp += '|';
            }
          } else {
            excludes = excludes.concat(r.excludes);
          }
        }
      } else {
        if (str.indexOf('!') === 0) {
          excludes.push('^((?!' + globStringToRegex(str.substring(1)).regexp + ').)*$');
        } else {
          if (str.indexOf('.') === 0) {
            str = '*' + str;
          }
          regexp = '^' + str.replace(new RegExp('[.\\\\+*?\\[\\^\\]$(){}=!<>|:\\-]', 'g'), '\\$&') + '$';
          regexp = regexp.replace(/\\\*/g, '.*').replace(/\\\?/g, '.');
        }
      }
    }
    return {regexp: regexp, excludes: excludes};
  }

  upload.validatePattern = function (file, val) {
    if (!val) {
      return true;
    }
    var pattern = globStringToRegex(val), valid = true;
    if (pattern.regexp && pattern.regexp.length) {
      var regexp = new RegExp(pattern.regexp, 'i');
      valid = (file.type != null && regexp.test(file.type)) ||
        (file.name != null && regexp.test(file.name));
    }
    var len = pattern.excludes.length;
    while (len--) {
      var exclude = new RegExp(pattern.excludes[len], 'i');
      valid = valid && (file.type == null || exclude.test(file.type)) &&
        (file.name == null || exclude.test(file.name));
    }
    return valid;
  };

  upload.ratioToFloat = function (val) {
    var r = val.toString(), xIndex = r.search(/[x:]/i);
    if (xIndex > -1) {
      r = parseFloat(r.substring(0, xIndex)) / parseFloat(r.substring(xIndex + 1));
    } else {
      r = parseFloat(r);
    }
    return r;
  };

  upload.registerModelChangeValidator = function (ngModel, attr, scope) {
    if (ngModel) {
      ngModel.$formatters.push(function (files) {
        if (ngModel.$dirty) {
          var filesArray = files;
          if (files && !angular.isArray(files)) {
            filesArray = [files];
          }
          upload.validate(filesArray, 0, ngModel, attr, scope).then(function () {
            upload.applyModelValidation(ngModel, filesArray);
          });
        }
        return files;
      });
    }
  };

  function markModelAsDirty(ngModel, files) {
    if (files != null && !ngModel.$dirty) {
      if (ngModel.$setDirty) {
        ngModel.$setDirty();
      } else {
        ngModel.$dirty = true;
      }
    }
  }

  upload.applyModelValidation = function (ngModel, files) {
    markModelAsDirty(ngModel, files);
    angular.forEach(ngModel.$ngfValidations, function (validation) {
      ngModel.$setValidity(validation.name, validation.valid);
    });
  };

  upload.getValidationAttr = function (attr, scope, name, validationName, file) {
    var dName = 'ngf' + name[0].toUpperCase() + name.substr(1);
    var val = upload.attrGetter(dName, attr, scope, {$file: file});
    if (val == null) {
      val = upload.attrGetter('ngfValidate', attr, scope, {$file: file});
      if (val) {
        var split = (validationName || name).split('.');
        val = val[split[0]];
        if (split.length > 1) {
          val = val && val[split[1]];
        }
      }
    }
    return val;
  };

  upload.validate = function (files, prevLength, ngModel, attr, scope) {
    ngModel = ngModel || {};
    ngModel.$ngfValidations = ngModel.$ngfValidations || [];

    angular.forEach(ngModel.$ngfValidations, function (v) {
      v.valid = true;
    });

    var attrGetter = function (name, params) {
      return upload.attrGetter(name, attr, scope, params);
    };

    var ignoredErrors = (upload.attrGetter('ngfIgnoreInvalid', attr, scope) || '').split(' ');
    var runAllValidation = upload.attrGetter('ngfRunAllValidations', attr, scope);

    if (files == null || files.length === 0) {
      return upload.emptyPromise({'validFiles': files, 'invalidFiles': []});
    }

    files = files.length === undefined ? [files] : files.slice(0);
    var invalidFiles = [];

    function validateSync(name, validationName, fn) {
      if (files) {
        var i = files.length, valid = null;
        while (i--) {
          var file = files[i];
          if (file) {
            var val = upload.getValidationAttr(attr, scope, name, validationName, file);
            if (val != null) {
              if (!fn(file, val, i)) {
                if (ignoredErrors.indexOf(name) === -1) {
                  file.$error = name;
                  (file.$errorMessages = (file.$errorMessages || {}))[name] = true;
                  file.$errorParam = val;
                  if (invalidFiles.indexOf(file) === -1) {
                    invalidFiles.push(file);
                  }
                  if (!runAllValidation) {
                    files.splice(i, 1);
                  }
                  valid = false;
                } else {
                  files.splice(i, 1);
                }
              }
            }
          }
        }
        if (valid !== null) {
          ngModel.$ngfValidations.push({name: name, valid: valid});
        }
      }
    }

    validateSync('pattern', null, upload.validatePattern);
    validateSync('minSize', 'size.min', function (file, val) {
      return file.size + 0.1 >= upload.translateScalars(val);
    });
    validateSync('maxSize', 'size.max', function (file, val) {
      return file.size - 0.1 <= upload.translateScalars(val);
    });
    var totalSize = 0;
    validateSync('maxTotalSize', null, function (file, val) {
      totalSize += file.size;
      if (totalSize > upload.translateScalars(val)) {
        files.splice(0, files.length);
        return false;
      }
      return true;
    });

    validateSync('validateFn', null, function (file, r) {
      return r === true || r === null || r === '';
    });

    if (!files.length) {
      return upload.emptyPromise({'validFiles': [], 'invalidFiles': invalidFiles});
    }

    function validateAsync(name, validationName, type, asyncFn, fn) {
      function resolveResult(defer, file, val) {
        function resolveInternal(fn) {
          if (fn()) {
            if (ignoredErrors.indexOf(name) === -1) {
              file.$error = name;
              (file.$errorMessages = (file.$errorMessages || {}))[name] = true;
              file.$errorParam = val;
              if (invalidFiles.indexOf(file) === -1) {
                invalidFiles.push(file);
              }
              if (!runAllValidation) {
                var i = files.indexOf(file);
                if (i > -1) files.splice(i, 1);
              }
              defer.resolve(false);
            } else {
              var j = files.indexOf(file);
              if (j > -1) files.splice(j, 1);
              defer.resolve(true);
            }
          } else {
            defer.resolve(true);
          }
        }

        if (val != null) {
          asyncFn(file, val).then(function (d) {
            resolveInternal(function () {
              return !fn(d, val);
            });
          }, function () {
            resolveInternal(function () {
              return attrGetter('ngfValidateForce', {$file: file});
            });
          });
        } else {
          defer.resolve(true);
        }
      }

      var promises = [upload.emptyPromise(true)];
      if (files) {
        files = files.length === undefined ? [files] : files;
        angular.forEach(files, function (file) {
          var defer = $q.defer();
          promises.push(defer.promise);
          if (type && (file.type == null || file.type.search(type) !== 0)) {
            defer.resolve(true);
            return;
          }
          if (name === 'dimensions' && upload.attrGetter('ngfDimensions', attr) != null) {
            upload.imageDimensions(file).then(function (d) {
              resolveResult(defer, file,
                attrGetter('ngfDimensions', {$file: file, $width: d.width, $height: d.height}));
            }, function () {
              defer.resolve(false);
            });
          } else if (name === 'duration' && upload.attrGetter('ngfDuration', attr) != null) {
            upload.mediaDuration(file).then(function (d) {
              resolveResult(defer, file,
                attrGetter('ngfDuration', {$file: file, $duration: d}));
            }, function () {
              defer.resolve(false);
            });
          } else {
            resolveResult(defer, file,
              upload.getValidationAttr(attr, scope, name, validationName, file));
          }
        });
      }
      var deffer = $q.defer();
      $q.all(promises).then(function (values) {
        var isValid = true;
        for (var i = 0; i < values.length; i++) {
          if (!values[i]) {
            isValid = false;
            break;
          }
        }
        ngModel.$ngfValidations.push({name: name, valid: isValid});
        deffer.resolve(isValid);
      });
      return deffer.promise;
    }

    var deffer = $q.defer();
    var promises = [];

    promises.push(validateAsync('maxHeight', 'height.max', /image/,
      this.imageDimensions, function (d, val) {
        return d.height <= val;
      }));
    promises.push(validateAsync('minHeight', 'height.min', /image/,
      this.imageDimensions, function (d, val) {
        return d.height >= val;
      }));
    promises.push(validateAsync('maxWidth', 'width.max', /image/,
      this.imageDimensions, function (d, val) {
        return d.width <= val;
      }));
    promises.push(validateAsync('minWidth', 'width.min', /image/,
      this.imageDimensions, function (d, val) {
        return d.width >= val;
      }));
    promises.push(validateAsync('dimensions', null, /image/,
      function (file, val) {
        return upload.emptyPromise(val);
      }, function (r) {
        return r;
      }));
    promises.push(validateAsync('ratio', null, /image/,
      this.imageDimensions, function (d, val) {
        var split = val.toString().split(','), valid = false;
        for (var i = 0; i < split.length; i++) {
          if (Math.abs((d.width / d.height) - upload.ratioToFloat(split[i])) < 0.01) {
            valid = true;
          }
        }
        return valid;
      }));
    promises.push(validateAsync('maxRatio', 'ratio.max', /image/,
      this.imageDimensions, function (d, val) {
        return (d.width / d.height) - upload.ratioToFloat(val) < 0.0001;
      }));
    promises.push(validateAsync('minRatio', 'ratio.min', /image/,
      this.imageDimensions, function (d, val) {
        return (d.width / d.height) - upload.ratioToFloat(val) > -0.0001;
      }));
    promises.push(validateAsync('maxDuration', 'duration.max', /audio|video/,
      this.mediaDuration, function (d, val) {
        return d <= upload.translateScalars(val);
      }));
    promises.push(validateAsync('minDuration', 'duration.min', /audio|video/,
      this.mediaDuration, function (d, val) {
        return d >= upload.translateScalars(val);
      }));
    promises.push(validateAsync('duration', null, /audio|video/,
      function (file, val) {
        return upload.emptyPromise(val);
      }, function (r) {
        return r;
      }));

    promises.push(validateAsync('validateAsyncFn', null, null,
      function (file, val) {
        return val;
      }, function (r) {
        return r === true || r === null || r === '';
      }));

    $q.all(promises).then(function () {

      if (runAllValidation) {
        for (var i = 0; i < files.length; i++) {
          var file = files[i];
          if (file.$error) {
            files.splice(i--, 1);
          }
        }
      }

      runAllValidation = false;
      validateSync('maxFiles', null, function (file, val, i) {
        return prevLength + i < val;
      });

      deffer.resolve({'validFiles': files, 'invalidFiles': invalidFiles});
    });
    return deffer.promise;
  };

  upload.imageDimensions = function (file) {
    if (file.$ngfWidth && file.$ngfHeight) {
      var d = $q.defer();
      $timeout(function () {
        d.resolve({width: file.$ngfWidth, height: file.$ngfHeight});
      });
      return d.promise;
    }
    if (file.$ngfDimensionPromise) return file.$ngfDimensionPromise;

    var deferred = $q.defer();
    $timeout(function () {
      if (file.type.indexOf('image') !== 0) {
        deferred.reject('not image');
        return;
      }
      upload.dataUrl(file).then(function (dataUrl) {
        var img = angular.element('<img>').attr('src', dataUrl)
          .css('visibility', 'hidden').css('position', 'fixed')
          .css('max-width', 'none !important').css('max-height', 'none !important');

        function success() {
          var width = img[0].naturalWidth || img[0].clientWidth;
          var height = img[0].naturalHeight || img[0].clientHeight;
          img.remove();
          file.$ngfWidth = width;
          file.$ngfHeight = height;
          deferred.resolve({width: width, height: height});
        }

        function error() {
          img.remove();
          deferred.reject('load error');
        }

        img.on('load', success);
        img.on('error', error);

        var secondsCounter = 0;
        function checkLoadErrorInCaseOfNoCallback() {
          $timeout(function () {
            if (img[0].parentNode) {
              if (img[0].clientWidth) {
                success();
              } else if (secondsCounter++ > 10) {
                error();
              } else {
                checkLoadErrorInCaseOfNoCallback();
              }
            }
          }, 1000);
        }

        checkLoadErrorInCaseOfNoCallback();

        angular.element(document.getElementsByTagName('body')[0]).append(img);
      }, function () {
        deferred.reject('load error');
      });
    });

    file.$ngfDimensionPromise = deferred.promise;
    file.$ngfDimensionPromise['finally'](function () {
      delete file.$ngfDimensionPromise;
    });
    return file.$ngfDimensionPromise;
  };

  upload.mediaDuration = function (file) {
    if (file.$ngfDuration) {
      var d = $q.defer();
      $timeout(function () {
        d.resolve(file.$ngfDuration);
      });
      return d.promise;
    }
    if (file.$ngfDurationPromise) return file.$ngfDurationPromise;

    var deferred = $q.defer();
    $timeout(function () {
      if (file.type.indexOf('audio') !== 0 && file.type.indexOf('video') !== 0) {
        deferred.reject('not media');
        return;
      }
      upload.dataUrl(file).then(function (dataUrl) {
        var el = angular.element(file.type.indexOf('audio') === 0 ? '<audio>' : '<video>')
          .attr('src', dataUrl).css('visibility', 'none').css('position', 'fixed');

        function success() {
          var duration = el[0].duration;
          file.$ngfDuration = duration;
          el.remove();
          deferred.resolve(duration);
        }

        function error() {
          el.remove();
          deferred.reject('load error');
        }

        el.on('loadedmetadata', success);
        el.on('error', error);
        var count = 0;

        function checkLoadError() {
          $timeout(function () {
            if (el[0].parentNode) {
              if (el[0].duration) {
                success();
              } else if (count > 10) {
                error();
              } else {
                checkLoadError();
              }
            }
          }, 1000);
        }

        checkLoadError();

        angular.element(document.body).append(el);
      }, function () {
        deferred.reject('load error');
      });
    });

    file.$ngfDurationPromise = deferred.promise;
    file.$ngfDurationPromise['finally'](function () {
      delete file.$ngfDurationPromise;
    });
    return file.$ngfDurationPromise;
  };
  return upload;
}
]);

ngFileUpload.service('UploadResize', ['UploadValidate', '$q', function (UploadValidate, $q) {
  var upload = UploadValidate;

  /**
   * Conserve aspect ratio of the original region. Useful when shrinking/enlarging
   * images to fit into a certain area.
   * Source:  http://stackoverflow.com/a/14731922
   *
   * @param {Number} srcWidth Source area width
   * @param {Number} srcHeight Source area height
   * @param {Number} maxWidth Nestable area maximum available width
   * @param {Number} maxHeight Nestable area maximum available height
   * @return {Object} { width, height }
   */
  var calculateAspectRatioFit = function (srcWidth, srcHeight, maxWidth, maxHeight, centerCrop) {
    var ratio = centerCrop ? Math.max(maxWidth / srcWidth, maxHeight / srcHeight) :
      Math.min(maxWidth / srcWidth, maxHeight / srcHeight);
    return {
      width: srcWidth * ratio, height: srcHeight * ratio,
      marginX: srcWidth * ratio - maxWidth, marginY: srcHeight * ratio - maxHeight
    };
  };

  // Extracted from https://github.com/romelgomez/angular-firebase-image-upload/blob/master/app/scripts/fileUpload.js#L89
  var resize = function (imagen, width, height, quality, type, ratio, centerCrop, resizeIf) {
    var deferred = $q.defer();
    var canvasElement = document.createElement('canvas');
    var imageElement = document.createElement('img');
    imageElement.setAttribute('style', 'visibility:hidden;position:fixed;z-index:-100000');
    document.body.appendChild(imageElement);

    imageElement.onload = function () {
      var imgWidth = imageElement.width, imgHeight = imageElement.height;
      imageElement.parentNode.removeChild(imageElement);
      if (resizeIf != null && resizeIf(imgWidth, imgHeight) === false) {
        deferred.reject('resizeIf');
        return;
      }
      try {
        if (ratio) {
          var ratioFloat = upload.ratioToFloat(ratio);
          var imgRatio = imgWidth / imgHeight;
          if (imgRatio < ratioFloat) {
            width = imgWidth;
            height = width / ratioFloat;
          } else {
            height = imgHeight;
            width = height * ratioFloat;
          }
        }
        if (!width) {
          width = imgWidth;
        }
        if (!height) {
          height = imgHeight;
        }
        var dimensions = calculateAspectRatioFit(imgWidth, imgHeight, width, height, centerCrop);
        canvasElement.width = Math.min(dimensions.width, width);
        canvasElement.height = Math.min(dimensions.height, height);
        var context = canvasElement.getContext('2d');
        context.drawImage(imageElement,
          Math.min(0, -dimensions.marginX / 2), Math.min(0, -dimensions.marginY / 2),
          dimensions.width, dimensions.height);
        deferred.resolve(canvasElement.toDataURL(type || 'image/WebP', quality || 0.934));
      } catch (e) {
        deferred.reject(e);
      }
    };
    imageElement.onerror = function () {
      imageElement.parentNode.removeChild(imageElement);
      deferred.reject();
    };
    imageElement.src = imagen;
    return deferred.promise;
  };

  upload.dataUrltoBlob = function (dataurl, name, origSize) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    var blob = new window.Blob([u8arr], {type: mime});
    blob.name = name;
    blob.$ngfOrigSize = origSize;
    return blob;
  };

  upload.isResizeSupported = function () {
    var elem = document.createElement('canvas');
    return window.atob && elem.getContext && elem.getContext('2d') && window.Blob;
  };

  if (upload.isResizeSupported()) {
    // add name getter to the blob constructor prototype
    Object.defineProperty(window.Blob.prototype, 'name', {
      get: function () {
        return this.$ngfName;
      },
      set: function (v) {
        this.$ngfName = v;
      },
      configurable: true
    });
  }

  upload.resize = function (file, options) {
    if (file.type.indexOf('image') !== 0) return upload.emptyPromise(file);

    var deferred = $q.defer();
    upload.dataUrl(file, true).then(function (url) {
      resize(url, options.width, options.height, options.quality, options.type || file.type,
        options.ratio, options.centerCrop, options.resizeIf)
        .then(function (dataUrl) {
          if (file.type === 'image/jpeg' && options.restoreExif !== false) {
            try {
              dataUrl = upload.restoreExif(url, dataUrl);
            } catch (e) {
              setTimeout(function () {throw e;}, 1);
            }
          }
          try {
            var blob = upload.dataUrltoBlob(dataUrl, file.name, file.size);
            deferred.resolve(blob);
          } catch (e) {
            deferred.reject(e);
          }
        }, function (r) {
          if (r === 'resizeIf') {
            deferred.resolve(file);
          }
          deferred.reject(r);
        });
    }, function (e) {
      deferred.reject(e);
    });
    return deferred.promise;
  };

  return upload;
}]);

(function () {
  ngFileUpload.directive('ngfDrop', ['$parse', '$timeout', '$window', 'Upload', '$http', '$q',
    function ($parse, $timeout, $window, Upload, $http, $q) {
      return {
        restrict: 'AEC',
        require: '?ngModel',
        link: function (scope, elem, attr, ngModel) {
          linkDrop(scope, elem, attr, ngModel, $parse, $timeout, $window, Upload, $http, $q);
        }
      };
    }]);

  ngFileUpload.directive('ngfNoFileDrop', function () {
    return function (scope, elem) {
      if (dropAvailable()) elem.css('display', 'none');
    };
  });

  ngFileUpload.directive('ngfDropAvailable', ['$parse', '$timeout', 'Upload', function ($parse, $timeout, Upload) {
    return function (scope, elem, attr) {
      if (dropAvailable()) {
        var model = $parse(Upload.attrGetter('ngfDropAvailable', attr));
        $timeout(function () {
          model(scope);
          if (model.assign) {
            model.assign(scope, true);
          }
        });
      }
    };
  }]);

  function linkDrop(scope, elem, attr, ngModel, $parse, $timeout, $window, upload, $http, $q) {
    var available = dropAvailable();

    var attrGetter = function (name, scope, params) {
      return upload.attrGetter(name, attr, scope, params);
    };

    if (attrGetter('dropAvailable')) {
      $timeout(function () {
        if (scope[attrGetter('dropAvailable')]) {
          scope[attrGetter('dropAvailable')].value = available;
        } else {
          scope[attrGetter('dropAvailable')] = available;
        }
      });
    }
    if (!available) {
      if (attrGetter('ngfHideOnDropNotAvailable', scope) === true) {
        elem.css('display', 'none');
      }
      return;
    }

    function isDisabled() {
      return elem.attr('disabled') || attrGetter('ngfDropDisabled', scope);
    }

    if (attrGetter('ngfSelect') == null) {
      upload.registerModelChangeValidator(ngModel, attr, scope);
    }

    var leaveTimeout = null;
    var stopPropagation = $parse(attrGetter('ngfStopPropagation'));
    var dragOverDelay = 1;
    var actualDragOverClass;

    elem[0].addEventListener('dragover', function (evt) {
      if (isDisabled() || !upload.shouldUpdateOn('drop', attr, scope)) return;
      evt.preventDefault();
      if (stopPropagation(scope)) evt.stopPropagation();
      // handling dragover events from the Chrome download bar
      if (navigator.userAgent.indexOf('Chrome') > -1) {
        var b = evt.dataTransfer.effectAllowed;
        evt.dataTransfer.dropEffect = ('move' === b || 'linkMove' === b) ? 'move' : 'copy';
      }
      $timeout.cancel(leaveTimeout);
      if (!actualDragOverClass) {
        actualDragOverClass = 'C';
        calculateDragOverClass(scope, attr, evt, function (clazz) {
          actualDragOverClass = clazz;
          elem.addClass(actualDragOverClass);
          attrGetter('ngfDrag', scope, {$isDragging: true, $class: actualDragOverClass, $event: evt});
        });
      }
    }, false);
    elem[0].addEventListener('dragenter', function (evt) {
      if (isDisabled() || !upload.shouldUpdateOn('drop', attr, scope)) return;
      evt.preventDefault();
      if (stopPropagation(scope)) evt.stopPropagation();
    }, false);
    elem[0].addEventListener('dragleave', function (evt) {
      if (isDisabled() || !upload.shouldUpdateOn('drop', attr, scope)) return;
      evt.preventDefault();
      if (stopPropagation(scope)) evt.stopPropagation();
      leaveTimeout = $timeout(function () {
        if (actualDragOverClass) elem.removeClass(actualDragOverClass);
        actualDragOverClass = null;
        attrGetter('ngfDrag', scope, {$isDragging: false, $event: evt});
      }, dragOverDelay || 100);
    }, false);
    elem[0].addEventListener('drop', function (evt) {
      if (isDisabled() || !upload.shouldUpdateOn('drop', attr, scope)) return;
      evt.preventDefault();
      if (stopPropagation(scope)) evt.stopPropagation();
      if (actualDragOverClass) elem.removeClass(actualDragOverClass);
      actualDragOverClass = null;
      extractFilesAndUpdateModel(evt.dataTransfer, evt, 'dropUrl');
    }, false);
    elem[0].addEventListener('paste', function (evt) {
      if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1 &&
        attrGetter('ngfEnableFirefoxPaste', scope)) {
        evt.preventDefault();
      }
      if (isDisabled() || !upload.shouldUpdateOn('paste', attr, scope)) return;
      extractFilesAndUpdateModel(evt.clipboardData || evt.originalEvent.clipboardData, evt, 'pasteUrl');
    }, false);

    if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1 &&
      attrGetter('ngfEnableFirefoxPaste', scope)) {
      elem.attr('contenteditable', true);
      elem.on('keypress', function (e) {
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
        }
      });
    }

    function extractFilesAndUpdateModel(source, evt, updateOnType) {
      if (!source) return;
      // html needs to be calculated on the same process otherwise the data will be wiped
      // after promise resolve or setTimeout.
      var html;
      try {
        html = source && source.getData && source.getData('text/html');
      } catch (e) {/* Fix IE11 that throw error calling getData */
      }
      extractFiles(source.items, source.files, attrGetter('ngfAllowDir', scope) !== false,
        attrGetter('multiple') || attrGetter('ngfMultiple', scope)).then(function (files) {
        if (files.length) {
          updateModel(files, evt);
        } else {
          extractFilesFromHtml(updateOnType, html).then(function (files) {
            updateModel(files, evt);
          });
        }
      });
    }

    function updateModel(files, evt) {
      upload.updateModel(ngModel, attr, scope, attrGetter('ngfChange') || attrGetter('ngfDrop'), files, evt);
    }

    function extractFilesFromHtml(updateOn, html) {
      if (!upload.shouldUpdateOn(updateOn, attr, scope) || typeof html !== 'string') return upload.rejectPromise([]);
      var urls = [];
      html.replace(/<(img src|img [^>]* src) *=\"([^\"]*)\"/gi, function (m, n, src) {
        urls.push(src);
      });
      var promises = [], files = [];
      if (urls.length) {
        angular.forEach(urls, function (url) {
          promises.push(upload.urlToBlob(url).then(function (blob) {
            files.push(blob);
          }));
        });
        var defer = $q.defer();
        $q.all(promises).then(function () {
          defer.resolve(files);
        }, function (e) {
          defer.reject(e);
        });
        return defer.promise;
      }
      return upload.emptyPromise();
    }

    function calculateDragOverClass(scope, attr, evt, callback) {
      var obj = attrGetter('ngfDragOverClass', scope, {$event: evt}), dClass = 'dragover';
      if (angular.isString(obj)) {
        dClass = obj;
      } else if (obj) {
        if (obj.delay) dragOverDelay = obj.delay;
        if (obj.accept || obj.reject) {
          var items = evt.dataTransfer.items;
          if (items == null || !items.length) {
            dClass = obj.accept;
          } else {
            var pattern = obj.pattern || attrGetter('ngfPattern', scope, {$event: evt});
            var len = items.length;
            while (len--) {
              if (!upload.validatePattern(items[len], pattern)) {
                dClass = obj.reject;
                break;
              } else {
                dClass = obj.accept;
              }
            }
          }
        }
      }
      callback(dClass);
    }

    function extractFiles(items, fileList, allowDir, multiple) {
      var maxFiles = upload.getValidationAttr(attr, scope, 'maxFiles');
      if (maxFiles == null) {
        maxFiles = Number.MAX_VALUE;
      }
      var maxTotalSize = upload.getValidationAttr(attr, scope, 'maxTotalSize');
      if (maxTotalSize == null) {
        maxTotalSize = Number.MAX_VALUE;
      }
      var includeDir = attrGetter('ngfIncludeDir', scope);
      var files = [], totalSize = 0;

      function traverseFileTree(entry, path) {
        var defer = $q.defer();
        if (entry != null) {
          if (entry.isDirectory) {
            var promises = [upload.emptyPromise()];
            if (includeDir) {
              var file = {type: 'directory'};
              file.name = file.path = (path || '') + entry.name;
              files.push(file);
            }
            var dirReader = entry.createReader();
            var entries = [];
            var readEntries = function () {
              dirReader.readEntries(function (results) {
                try {
                  if (!results.length) {
                    angular.forEach(entries.slice(0), function (e) {
                      if (files.length <= maxFiles && totalSize <= maxTotalSize) {
                        promises.push(traverseFileTree(e, (path ? path : '') + entry.name + '/'));
                      }
                    });
                    $q.all(promises).then(function () {
                      defer.resolve();
                    }, function (e) {
                      defer.reject(e);
                    });
                  } else {
                    entries = entries.concat(Array.prototype.slice.call(results || [], 0));
                    readEntries();
                  }
                } catch (e) {
                  defer.reject(e);
                }
              }, function (e) {
                defer.reject(e);
              });
            };
            readEntries();
          } else {
            entry.file(function (file) {
              try {
                file.path = (path ? path : '') + file.name;
                if (includeDir) {
                  file = upload.rename(file, file.path);
                }
                files.push(file);
                totalSize += file.size;
                defer.resolve();
              } catch (e) {
                defer.reject(e);
              }
            }, function (e) {
              defer.reject(e);
            });
          }
        }
        return defer.promise;
      }

      var promises = [upload.emptyPromise()];

      if (items && items.length > 0 && $window.location.protocol !== 'file:') {
        for (var i = 0; i < items.length; i++) {
          if (items[i].webkitGetAsEntry && items[i].webkitGetAsEntry() && items[i].webkitGetAsEntry().isDirectory) {
            var entry = items[i].webkitGetAsEntry();
            if (entry.isDirectory && !allowDir) {
              continue;
            }
            if (entry != null) {
              promises.push(traverseFileTree(entry));
            }
          } else {
            var f = items[i].getAsFile();
            if (f != null) {
              files.push(f);
              totalSize += f.size;
            }
          }
          if (files.length > maxFiles || totalSize > maxTotalSize ||
            (!multiple && files.length > 0)) break;
        }
      } else {
        if (fileList != null) {
          for (var j = 0; j < fileList.length; j++) {
            var file = fileList.item(j);
            if (file.type || file.size > 0) {
              files.push(file);
              totalSize += file.size;
            }
            if (files.length > maxFiles || totalSize > maxTotalSize ||
              (!multiple && files.length > 0)) break;
          }
        }
      }

      var defer = $q.defer();
      $q.all(promises).then(function () {
        if (!multiple && !includeDir && files.length) {
          var i = 0;
          while (files[i] && files[i].type === 'directory') i++;
          defer.resolve([files[i]]);
        } else {
          defer.resolve(files);
        }
      }, function (e) {
        defer.reject(e);
      });

      return defer.promise;
    }
  }

  function dropAvailable() {
    var div = document.createElement('div');
    return ('draggable' in div) && ('ondrop' in div) && !/Edge\/12./i.test(navigator.userAgent);
  }

})();

// customized version of https://github.com/exif-js/exif-js
ngFileUpload.service('UploadExif', ['UploadResize', '$q', function (UploadResize, $q) {
  var upload = UploadResize;

  upload.isExifSupported = function () {
    return window.FileReader && new FileReader().readAsArrayBuffer && upload.isResizeSupported();
  };

  function applyTransform(ctx, orientation, width, height) {
    switch (orientation) {
      case 2:
        return ctx.transform(-1, 0, 0, 1, width, 0);
      case 3:
        return ctx.transform(-1, 0, 0, -1, width, height);
      case 4:
        return ctx.transform(1, 0, 0, -1, 0, height);
      case 5:
        return ctx.transform(0, 1, 1, 0, 0, 0);
      case 6:
        return ctx.transform(0, 1, -1, 0, height, 0);
      case 7:
        return ctx.transform(0, -1, -1, 0, height, width);
      case 8:
        return ctx.transform(0, -1, 1, 0, 0, width);
    }
  }

  upload.readOrientation = function (file) {
    var defer = $q.defer();
    var reader = new FileReader();
    var slicedFile = file.slice ? file.slice(0, 64 * 1024) : file;
    reader.readAsArrayBuffer(slicedFile);
    reader.onerror = function (e) {
      return defer.reject(e);
    };
    reader.onload = function (e) {
      var result = {orientation: 1};
      var view = new DataView(this.result);
      if (view.getUint16(0, false) !== 0xFFD8) return defer.resolve(result);

      var length = view.byteLength,
        offset = 2;
      while (offset < length) {
        var marker = view.getUint16(offset, false);
        offset += 2;
        if (marker === 0xFFE1) {
          if (view.getUint32(offset += 2, false) !== 0x45786966) return defer.resolve(result);

          var little = view.getUint16(offset += 6, false) === 0x4949;
          offset += view.getUint32(offset + 4, little);
          var tags = view.getUint16(offset, little);
          offset += 2;
          for (var i = 0; i < tags; i++)
            if (view.getUint16(offset + (i * 12), little) === 0x0112) {
              var orientation = view.getUint16(offset + (i * 12) + 8, little);
              if (orientation >= 2 && orientation <= 8) {
                view.setUint16(offset + (i * 12) + 8, 1, little);
                result.fixedArrayBuffer = e.target.result;
              }
              result.orientation = orientation;
              return defer.resolve(result);
            }
        } else if ((marker & 0xFF00) !== 0xFF00) break;
        else offset += view.getUint16(offset, false);
      }
      return defer.resolve(result);
    };
    return defer.promise;
  };

  function arrayBufferToBase64(buffer) {
    var binary = '';
    var bytes = new Uint8Array(buffer);
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  upload.applyExifRotation = function (file) {
    if (file.type.indexOf('image/jpeg') !== 0) {
      return upload.emptyPromise(file);
    }

    var deferred = $q.defer();
    upload.readOrientation(file).then(function (result) {
      if (result.orientation < 2 || result.orientation > 8) {
        return deferred.resolve(file);
      }
      upload.dataUrl(file, true).then(function (url) {
        var canvas = document.createElement('canvas');
        var img = document.createElement('img');

        img.onload = function () {
          try {
            canvas.width = result.orientation > 4 ? img.height : img.width;
            canvas.height = result.orientation > 4 ? img.width : img.height;
            var ctx = canvas.getContext('2d');
            applyTransform(ctx, result.orientation, img.width, img.height);
            ctx.drawImage(img, 0, 0);
            var dataUrl = canvas.toDataURL(file.type || 'image/WebP', 0.934);
            dataUrl = upload.restoreExif(arrayBufferToBase64(result.fixedArrayBuffer), dataUrl);
            var blob = upload.dataUrltoBlob(dataUrl, file.name);
            deferred.resolve(blob);
          } catch (e) {
            return deferred.reject(e);
          }
        };
        img.onerror = function () {
          deferred.reject();
        };
        img.src = url;
      }, function (e) {
        deferred.reject(e);
      });
    }, function (e) {
      deferred.reject(e);
    });
    return deferred.promise;
  };

  upload.restoreExif = function (orig, resized) {
    var ExifRestorer = {};

    ExifRestorer.KEY_STR = 'ABCDEFGHIJKLMNOP' +
      'QRSTUVWXYZabcdef' +
      'ghijklmnopqrstuv' +
      'wxyz0123456789+/' +
      '=';

    ExifRestorer.encode64 = function (input) {
      var output = '',
        chr1, chr2, chr3 = '',
        enc1, enc2, enc3, enc4 = '',
        i = 0;

      do {
        chr1 = input[i++];
        chr2 = input[i++];
        chr3 = input[i++];

        enc1 = chr1 >> 2;
        enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
        enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
        enc4 = chr3 & 63;

        if (isNaN(chr2)) {
          enc3 = enc4 = 64;
        } else if (isNaN(chr3)) {
          enc4 = 64;
        }

        output = output +
          this.KEY_STR.charAt(enc1) +
          this.KEY_STR.charAt(enc2) +
          this.KEY_STR.charAt(enc3) +
          this.KEY_STR.charAt(enc4);
        chr1 = chr2 = chr3 = '';
        enc1 = enc2 = enc3 = enc4 = '';
      } while (i < input.length);

      return output;
    };

    ExifRestorer.restore = function (origFileBase64, resizedFileBase64) {
      if (origFileBase64.match('data:image/jpeg;base64,')) {
        origFileBase64 = origFileBase64.replace('data:image/jpeg;base64,', '');
      }

      var rawImage = this.decode64(origFileBase64);
      var segments = this.slice2Segments(rawImage);

      var image = this.exifManipulation(resizedFileBase64, segments);

      return 'data:image/jpeg;base64,' + this.encode64(image);
    };


    ExifRestorer.exifManipulation = function (resizedFileBase64, segments) {
      var exifArray = this.getExifArray(segments),
        newImageArray = this.insertExif(resizedFileBase64, exifArray);
      return new Uint8Array(newImageArray);
    };


    ExifRestorer.getExifArray = function (segments) {
      var seg;
      for (var x = 0; x < segments.length; x++) {
        seg = segments[x];
        if (seg[0] === 255 & seg[1] === 225) //(ff e1)
        {
          return seg;
        }
      }
      return [];
    };


    ExifRestorer.insertExif = function (resizedFileBase64, exifArray) {
      var imageData = resizedFileBase64.replace('data:image/jpeg;base64,', ''),
        buf = this.decode64(imageData),
        separatePoint = buf.indexOf(255, 3),
        mae = buf.slice(0, separatePoint),
        ato = buf.slice(separatePoint),
        array = mae;

      array = array.concat(exifArray);
      array = array.concat(ato);
      return array;
    };


    ExifRestorer.slice2Segments = function (rawImageArray) {
      var head = 0,
        segments = [];

      while (1) {
        if (rawImageArray[head] === 255 & rawImageArray[head + 1] === 218) {
          break;
        }
        if (rawImageArray[head] === 255 & rawImageArray[head + 1] === 216) {
          head += 2;
        }
        else {
          var length = rawImageArray[head + 2] * 256 + rawImageArray[head + 3],
            endPoint = head + length + 2,
            seg = rawImageArray.slice(head, endPoint);
          segments.push(seg);
          head = endPoint;
        }
        if (head > rawImageArray.length) {
          break;
        }
      }

      return segments;
    };


    ExifRestorer.decode64 = function (input) {
      var chr1, chr2, chr3 = '',
        enc1, enc2, enc3, enc4 = '',
        i = 0,
        buf = [];

      // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
      var base64test = /[^A-Za-z0-9\+\/\=]/g;
      if (base64test.exec(input)) {
        console.log('There were invalid base64 characters in the input text.\n' +
          'Valid base64 characters are A-Z, a-z, 0-9, ' + ', ' / ',and "="\n' +
          'Expect errors in decoding.');
      }
      input = input.replace(/[^A-Za-z0-9\+\/\=]/g, '');

      do {
        enc1 = this.KEY_STR.indexOf(input.charAt(i++));
        enc2 = this.KEY_STR.indexOf(input.charAt(i++));
        enc3 = this.KEY_STR.indexOf(input.charAt(i++));
        enc4 = this.KEY_STR.indexOf(input.charAt(i++));

        chr1 = (enc1 << 2) | (enc2 >> 4);
        chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        chr3 = ((enc3 & 3) << 6) | enc4;

        buf.push(chr1);

        if (enc3 !== 64) {
          buf.push(chr2);
        }
        if (enc4 !== 64) {
          buf.push(chr3);
        }

        chr1 = chr2 = chr3 = '';
        enc1 = enc2 = enc3 = enc4 = '';

      } while (i < input.length);

      return buf;
    };

    return ExifRestorer.restore(orig, resized);  //<= EXIF
  };

  return upload;
}]);


!function(e,t){"object"==typeof exports?module.exports=t(require("angular")):"function"==typeof define&&define.amd?define(["angular"],t):t(e.angular)}(this,function(angular){/**
 * AngularJS Google Maps Ver. 1.17.6
 *
 * The MIT License (MIT)
 * 
 * Copyright (c) 2014, 2015, 1016 Allen Kim
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
return angular.module("ngMap",[]),function(){"use strict";var e,t=function(t,n,o,i,a,r,s){e=a;var p=this;p.mapOptions,p.mapEvents,p.eventListeners,p.addObject=function(e,t){if(p.map){p.map[e]=p.map[e]||{};var n=Object.keys(p.map[e]).length;p.map[e][t.id||n]=t,p.map instanceof google.maps.Map&&("infoWindows"!=e&&t.setMap&&t.setMap&&t.setMap(p.map),t.centered&&t.position&&p.map.setCenter(t.position),"markers"==e&&p.objectChanged("markers"),"customMarkers"==e&&p.objectChanged("customMarkers"))}},p.deleteObject=function(e,t){if(t.map){var n=t.map[e];for(var o in n)n[o]===t&&(google.maps.event.clearInstanceListeners(t),delete n[o]);t.map&&t.setMap&&t.setMap(null),"markers"==e&&p.objectChanged("markers"),"customMarkers"==e&&p.objectChanged("customMarkers")}},p.observeAttrSetObj=function(t,n,o){if(n.noWatcher)return!1;for(var i=e.getAttrsToObserve(t),a=0;a<i.length;a++){var s=i[a];n.$observe(s,r.observeAndSet(s,o))}},p.zoomToIncludeMarkers=function(){if(null!=p.map.markers&&Object.keys(p.map.markers).length>0||null!=p.map.customMarkers&&Object.keys(p.map.customMarkers).length>0){var e=new google.maps.LatLngBounds;for(var t in p.map.markers)e.extend(p.map.markers[t].getPosition());for(var n in p.map.customMarkers)e.extend(p.map.customMarkers[n].getPosition());p.mapOptions.maximumZoom&&(p.enableMaximumZoomCheck=!0),p.map.fitBounds(e)}},p.objectChanged=function(e){!p.map||"markers"!=e&&"customMarkers"!=e||"auto"!=p.map.zoomToIncludeMarkers||p.zoomToIncludeMarkers()},p.initializeMap=function(){var a=p.mapOptions,u=p.mapEvents,l=p.map;if(p.map=s.getMapInstance(n[0]),r.setStyle(n[0]),l){var g=e.filter(o),d=e.getOptions(g),m=e.getControlOptions(g);a=angular.extend(d,m);for(var f in l){var v=l[f];if("object"==typeof v)for(var y in v)p.addObject(f,v[y])}p.map.showInfoWindow=p.showInfoWindow,p.map.hideInfoWindow=p.hideInfoWindow}a.zoom=a.zoom||15;var h=a.center;if(!a.center||"string"==typeof h&&h.match(/\{\{.*\}\}/))a.center=new google.maps.LatLng(0,0);else if(!(h instanceof google.maps.LatLng)){var M=a.center;delete a.center,r.getGeoLocation(M,a.geoLocationOptions).then(function(e){p.map.setCenter(e);var n=a.geoCallback;n&&i(n)(t)},function(){a.geoFallbackCenter&&p.map.setCenter(a.geoFallbackCenter)})}p.map.setOptions(a);for(var b in u){var O=u[b],w=google.maps.event.addListener(p.map,b,O);p.eventListeners[b]=w}p.observeAttrSetObj(c,o,p.map),p.singleInfoWindow=a.singleInfoWindow,google.maps.event.trigger(p.map,"resize"),google.maps.event.addListenerOnce(p.map,"idle",function(){r.addMap(p),a.zoomToIncludeMarkers&&p.zoomToIncludeMarkers(),t.map=p.map,t.$emit("mapInitialized",p.map),o.mapInitialized&&i(o.mapInitialized)(t,{map:p.map})}),a.zoomToIncludeMarkers&&a.maximumZoom&&google.maps.event.addListener(p.map,"zoom_changed",function(){1==p.enableMaximumZoomCheck&&(p.enableMaximumZoomCheck=!1,google.maps.event.addListenerOnce(p.map,"bounds_changed",function(){p.map.setZoom(Math.min(a.maximumZoom,p.map.getZoom()))}))})},t.google=google;var c=e.orgAttributes(n),u=e.filter(o),l=e.getOptions(u,{scope:t}),g=e.getControlOptions(u),d=angular.extend(l,g),m=e.getEvents(t,u);if(Object.keys(m).length&&void 0,p.mapOptions=d,p.mapEvents=m,p.eventListeners={},l.lazyInit){if(o.id&&0===o.id.indexOf("{{",0)&&-1!==o.id.indexOf("}}",o.id.length-"}}".length))var f=o.id.slice(2,-2),v=i(f)(t);else var v=o.id;p.map={id:v},r.addMap(p)}else p.initializeMap();l.triggerResize&&google.maps.event.trigger(p.map,"resize"),n.bind("$destroy",function(){s.returnMapInstance(p.map),r.deleteMap(p)})};t.$inject=["$scope","$element","$attrs","$parse","Attr2MapOptions","NgMap","NgMapPool"],angular.module("ngMap").controller("__MapController",t)}(),function(){"use strict";var e,t=function(t,o,i,a){a=a[0]||a[1];var r=e.orgAttributes(o),s=e.filter(i),p=e.getOptions(s,{scope:t}),c=e.getEvents(t,s),u=n(p,c);a.addObject("bicyclingLayers",u),a.observeAttrSetObj(r,i,u),o.bind("$destroy",function(){a.deleteObject("bicyclingLayers",u)})},n=function(e,t){var n=new google.maps.BicyclingLayer(e);for(var o in t)google.maps.event.addListener(n,o,t[o]);return n},o=function(n){return e=n,{restrict:"E",require:["?^map","?^ngMap"],link:t}};o.$inject=["Attr2MapOptions"],angular.module("ngMap").directive("bicyclingLayer",o)}(),function(){"use strict";var e,t,n,o=function(n,o,i,a){a=a[0]||a[1];var r=e.filter(i),s=e.getOptions(r,{scope:n}),p=e.getEvents(n,r),c=o[0].parentElement.removeChild(o[0]);t(c.innerHTML.trim())(n);for(var u in p)google.maps.event.addDomListener(c,u,p[u]);a.addObject("customControls",c);var l=s.position;a.map.controls[google.maps.ControlPosition[l]].push(c),o.bind("$destroy",function(){a.deleteObject("customControls",c)})},i=function(i,a,r){return e=i,t=a,n=r,{restrict:"E",require:["?^map","?^ngMap"],link:o}};i.$inject=["Attr2MapOptions","$compile","NgMap"],angular.module("ngMap").directive("customControl",i)}(),function(){"use strict";var e,t,n,o,i=function(e){e=e||{},this.el=document.createElement("div"),this.el.style.display="inline-block",this.el.style.visibility="hidden",this.visible=!0;for(var t in e)this[t]=e[t]},a=function(){i.prototype=new google.maps.OverlayView,i.prototype.setContent=function(e,t){this.el.innerHTML=e,this.el.style.position="absolute",t&&n(angular.element(this.el).contents())(t)},i.prototype.getDraggable=function(){return this.draggable},i.prototype.setDraggable=function(e){this.draggable=e},i.prototype.getPosition=function(){return this.position},i.prototype.setPosition=function(e){if(e&&(this.position=e),this.getProjection()&&"function"==typeof this.position.lng){var n=this,o=function(){var e=n.getProjection().fromLatLngToDivPixel(n.position),t=Math.round(e.x-n.el.offsetWidth/2),o=Math.round(e.y-n.el.offsetHeight-10);n.el.style.left=t+"px",n.el.style.top=o+"px",n.el.style.visibility="visible"};n.el.offsetWidth&&n.el.offsetHeight?o():t(o,300)}},i.prototype.setZIndex=function(e){e&&(this.zIndex=e),this.el.style.zIndex=this.zIndex},i.prototype.getVisible=function(){return this.visible},i.prototype.setVisible=function(e){this.el.style.display=e?"inline-block":"none",this.visible=e},i.prototype.addClass=function(e){var t=this.el.className.trim().split(" ");-1==t.indexOf(e)&&t.push(e),this.el.className=t.join(" ")},i.prototype.removeClass=function(e){var t=this.el.className.split(" "),n=t.indexOf(e);n>-1&&t.splice(n,1),this.el.className=t.join(" ")},i.prototype.onAdd=function(){this.getPanes().overlayMouseTarget.appendChild(this.el)},i.prototype.draw=function(){this.setPosition(),this.setZIndex(this.zIndex),this.setVisible(this.visible)},i.prototype.onRemove=function(){this.el.parentNode.removeChild(this.el)}},r=function(n,a){return function(r,s,p,c){c=c[0]||c[1];var u=e.orgAttributes(s),l=e.filter(p),g=e.getOptions(l,{scope:r}),d=e.getEvents(r,l);s[0].style.display="none";var m=new i(g);t(function(){r.$watch("["+a.join(",")+"]",function(){m.setContent(n,r)},!0),m.setContent(s[0].innerHTML,r);var e=s[0].firstElementChild.className;m.addClass("custom-marker"),m.addClass(e),g.position instanceof google.maps.LatLng||o.getGeoLocation(g.position).then(function(e){m.setPosition(e)})});for(var f in d)google.maps.event.addDomListener(m.el,f,d[f]);c.addObject("customMarkers",m),c.observeAttrSetObj(u,p,m),s.bind("$destroy",function(){c.deleteObject("customMarkers",m)})}},s=function(i,s,p,c){return e=p,t=i,n=s,o=c,{restrict:"E",require:["?^map","?^ngMap"],compile:function(e){a(),e[0].style.display="none";var t=e.html(),n=t.match(/{{([^}]+)}}/g),o=[];return(n||[]).forEach(function(e){var t=e.replace("{{","").replace("}}","");-1==e.indexOf("::")&&-1==e.indexOf("this.")&&-1==o.indexOf(t)&&o.push(e.replace("{{","").replace("}}",""))}),r(t,o)}}};s.$inject=["$timeout","$compile","Attr2MapOptions","NgMap"],angular.module("ngMap").directive("customMarker",s)}(),function(){"use strict";var e,t,n,o=function(e,t){e.panel&&(e.panel=document.getElementById(e.panel)||document.querySelector(e.panel));var n=new google.maps.DirectionsRenderer(e);for(var o in t)google.maps.event.addListener(n,o,t[o]);return n},i=function(e,o){var i=new google.maps.DirectionsService,a=o;a.travelMode=a.travelMode||"DRIVING";var r=["origin","destination","travelMode","transitOptions","unitSystem","durationInTraffic","waypoints","optimizeWaypoints","provideRouteAlternatives","avoidHighways","avoidTolls","region"];for(var s in a)-1===r.indexOf(s)&&delete a[s];a.waypoints&&("[]"==a.waypoints||""===a.waypoints)&&delete a.waypoints;var p=function(n){i.route(n,function(n,o){o==google.maps.DirectionsStatus.OK&&t(function(){e.setDirections(n)})})};a.origin&&a.destination&&("current-location"==a.origin?n.getCurrentPosition().then(function(e){a.origin=new google.maps.LatLng(e.coords.latitude,e.coords.longitude),p(a)}):"current-location"==a.destination?n.getCurrentPosition().then(function(e){a.destination=new google.maps.LatLng(e.coords.latitude,e.coords.longitude),p(a)}):p(a))},a=function(a,r,s,p){var c=a;e=p,t=r,n=s;var u=function(n,a,r,s){s=s[0]||s[1];var p=c.orgAttributes(a),u=c.filter(r),l=c.getOptions(u,{scope:n}),g=c.getEvents(n,u),d=c.getAttrsToObserve(p),m=o(l,g);s.addObject("directionsRenderers",m),d.forEach(function(e){!function(e){r.$observe(e,function(n){if("panel"==e)t(function(){var e=document.getElementById(n)||document.querySelector(n);e&&m.setPanel(e)});else if(l[e]!==n){var o=c.toOptionValue(n,{key:e});l[e]=o,i(m,l)}})}(e)}),e.getMap().then(function(){i(m,l)}),a.bind("$destroy",function(){s.deleteObject("directionsRenderers",m)})};return{restrict:"E",require:["?^map","?^ngMap"],link:u}};a.$inject=["Attr2MapOptions","$timeout","NavigatorGeolocation","NgMap"],angular.module("ngMap").directive("directions",a)}(),function(){"use strict";angular.module("ngMap").directive("drawingManager",["Attr2MapOptions",function(e){var t=e;return{restrict:"E",require:["?^map","?^ngMap"],link:function(e,n,o,i){i=i[0]||i[1];var a=t.filter(o),r=t.getOptions(a,{scope:e}),s=t.getControlOptions(a),p=t.getEvents(e,a),c=new google.maps.drawing.DrawingManager({drawingMode:r.drawingmode,drawingControl:r.drawingcontrol,drawingControlOptions:s.drawingControlOptions,circleOptions:r.circleoptions,markerOptions:r.markeroptions,polygonOptions:r.polygonoptions,polylineOptions:r.polylineoptions,rectangleOptions:r.rectangleoptions});o.$observe("drawingControlOptions",function(e){c.drawingControlOptions=t.getControlOptions({drawingControlOptions:e}).drawingControlOptions,c.setDrawingMode(null),c.setMap(i.map)});for(var u in p)google.maps.event.addListener(c,u,p[u]);i.addObject("mapDrawingManager",c),n.bind("$destroy",function(){i.deleteObject("mapDrawingManager",c)})}}}])}(),function(){"use strict";angular.module("ngMap").directive("dynamicMapsEngineLayer",["Attr2MapOptions",function(e){var t=e,n=function(e,t){var n=new google.maps.visualization.DynamicMapsEngineLayer(e);for(var o in t)google.maps.event.addListener(n,o,t[o]);return n};return{restrict:"E",require:["?^map","?^ngMap"],link:function(e,o,i,a){a=a[0]||a[1];var r=t.filter(i),s=t.getOptions(r,{scope:e}),p=t.getEvents(e,r,p),c=n(s,p);a.addObject("mapsEngineLayers",c)}}}])}(),function(){"use strict";angular.module("ngMap").directive("fusionTablesLayer",["Attr2MapOptions",function(e){var t=e,n=function(e,t){var n=new google.maps.FusionTablesLayer(e);for(var o in t)google.maps.event.addListener(n,o,t[o]);return n};return{restrict:"E",require:["?^map","?^ngMap"],link:function(e,o,i,a){a=a[0]||a[1];var r=t.filter(i),s=t.getOptions(r,{scope:e}),p=t.getEvents(e,r,p),c=n(s,p);a.addObject("fusionTablesLayers",c)}}}])}(),function(){"use strict";angular.module("ngMap").directive("heatmapLayer",["Attr2MapOptions","$window",function(e,t){var n=e;return{restrict:"E",require:["?^map","?^ngMap"],link:function(e,o,i,a){a=a[0]||a[1];var r=n.filter(i),s=n.getOptions(r,{scope:e});if(s.data=t[i.data]||e[i.data],!(s.data instanceof Array))throw"invalid heatmap data";s.data=new google.maps.MVCArray(s.data);{var p=new google.maps.visualization.HeatmapLayer(s);n.getEvents(e,r)}a.addObject("heatmapLayers",p)}}}])}(),function(){"use strict";var e=function(e,t,n,o,i,a,r){var s=e,p=function(e,a,r){var s;!e.position||e.position instanceof google.maps.LatLng||delete e.position,s=new google.maps.InfoWindow(e);for(var p in a)p&&google.maps.event.addListener(s,p,a[p]);var c=n(function(e){angular.isString(r)?o(r).then(function(t){e(angular.element(t).wrap("<div>").parent())},function(e){throw"info-window template request failed: "+e}):e(r)}).then(function(e){var t=e.html().trim();if(1!=angular.element(t).length)throw"info-window working as a template must have a container";s.__template=t.replace(/\s?ng-non-bindable[='"]+/,"")});return s.__open=function(e,n,o){c.then(function(){i(function(){o&&(n.anchor=o);var i=t(s.__template)(n);s.setContent(i[0]),n.$apply(),o&&o.getPosition?s.open(e,o):o&&o instanceof google.maps.LatLng?(s.open(e),s.setPosition(o)):s.open(e);var a=s.content.parentElement.parentElement.parentElement;a.className="ng-map-info-window"})})},s},c=function(e,t,n,o){o=o[0]||o[1],t.css("display","none");var i,c=s.orgAttributes(t),u=s.filter(n),l=s.getOptions(u,{scope:e}),g=s.getEvents(e,u),d=p(l,g,l.template||t);!l.position||l.position instanceof google.maps.LatLng||(i=l.position),i&&r.getGeoLocation(i).then(function(t){d.setPosition(t),d.__open(o.map,e,t);var i=n.geoCallback;i&&a(i)(e)}),o.addObject("infoWindows",d),o.observeAttrSetObj(c,n,d),o.showInfoWindow=o.map.showInfoWindow=o.showInfoWindow||function(t,n,i){var a="string"==typeof t?t:n,r="string"==typeof t?n:i;if("string"==typeof r)if("undefined"!=typeof o.map.markers&&"undefined"!=typeof o.map.markers[r])r=o.map.markers[r];else{if("undefined"==typeof o.map.customMarkers[r])throw new Error("Cant open info window for id "+r+". Marker or CustomMarker is not defined");r=o.map.customMarkers[r]}var s=o.map.infoWindows[a],p=r?r:this.getPosition?this:null;s.__open(o.map,e,p),o.singleInfoWindow&&(o.lastInfoWindow&&e.hideInfoWindow(o.lastInfoWindow),o.lastInfoWindow=a)},o.hideInfoWindow=o.map.hideInfoWindow=o.hideInfoWindow||function(e,t){var n="string"==typeof e?e:t,i=o.map.infoWindows[n];i.close()},e.showInfoWindow=o.map.showInfoWindow,e.hideInfoWindow=o.map.hideInfoWindow;var m=d.mapId?{id:d.mapId}:0;r.getMap(m).then(function(t){if(d.visible&&d.__open(t,e),d.visibleOnMarker){var n=d.visibleOnMarker;d.__open(t,e,t.markers[n])}})};return{restrict:"E",require:["?^map","?^ngMap"],link:c}};e.$inject=["Attr2MapOptions","$compile","$q","$templateRequest","$timeout","$parse","NgMap"],angular.module("ngMap").directive("infoWindow",e)}(),function(){"use strict";angular.module("ngMap").directive("kmlLayer",["Attr2MapOptions",function(e){var t=e,n=function(e,t){var n=new google.maps.KmlLayer(e);for(var o in t)google.maps.event.addListener(n,o,t[o]);return n};return{restrict:"E",require:["?^map","?^ngMap"],link:function(e,o,i,a){a=a[0]||a[1];var r=t.orgAttributes(o),s=t.filter(i),p=t.getOptions(s,{scope:e}),c=t.getEvents(e,s),u=n(p,c);a.addObject("kmlLayers",u),a.observeAttrSetObj(r,i,u),o.bind("$destroy",function(){a.deleteObject("kmlLayers",u)})}}}])}(),function(){"use strict";angular.module("ngMap").directive("mapData",["Attr2MapOptions","NgMap",function(e,t){var n=e;return{restrict:"E",require:["?^map","?^ngMap"],link:function(e,o,i){var a=n.filter(i),r=n.getOptions(a,{scope:e}),s=n.getEvents(e,a,s);t.getMap().then(function(t){for(var n in r){var o=r[n];"function"==typeof e[o]?t.data[n](e[o]):t.data[n](o)}for(var i in s)t.data.addListener(i,s[i])})}}}])}(),function(){"use strict";var e,t,n,o=[],i=[],a=function(n,a,r){var s=r.mapLazyLoadParams||r.mapLazyLoad;if(void 0===window.google||void 0===window.google.maps){i.push({scope:n,element:a,savedHtml:o[i.length]}),window.lazyLoadCallback=function(){e(function(){i.forEach(function(e){e.element.html(e.savedHtml),t(e.element.contents())(e.scope)})},100)};var p=document.createElement("script");p.src=s+(s.indexOf("?")>-1?"&":"?")+"callback=lazyLoadCallback",document.querySelector('script[src="'+p.src+'"]')||document.body.appendChild(p)}else a.html(o),t(a.contents())(n)},r=function(e,t){return!t.mapLazyLoad&&void 0,o.push(e.html()),n=t.mapLazyLoad,void 0!==window.google&&void 0!==window.google.maps?!1:(e.html(""),{pre:a})},s=function(n,o){return t=n,e=o,{compile:r}};s.$inject=["$compile","$timeout"],angular.module("ngMap").directive("mapLazyLoad",s)}(),function(){"use strict";angular.module("ngMap").directive("mapType",["$parse","NgMap",function(e,t){return{restrict:"E",require:["?^map","?^ngMap"],link:function(n,o,i,a){a=a[0]||a[1];var r,s=i.name;if(!s)throw"invalid map-type name";if(r=e(i.object)(n),!r)throw"invalid map-type object";t.getMap().then(function(e){e.mapTypes.set(s,r)}),a.addObject("mapTypes",r)}}}])}(),function(){"use strict";var e=function(){return{restrict:"AE",controller:"__MapController",controllerAs:"ngmap"}};angular.module("ngMap").directive("map",[e]),angular.module("ngMap").directive("ngMap",[e])}(),function(){"use strict";angular.module("ngMap").directive("mapsEngineLayer",["Attr2MapOptions",function(e){var t=e,n=function(e,t){var n=new google.maps.visualization.MapsEngineLayer(e);for(var o in t)google.maps.event.addListener(n,o,t[o]);return n};return{restrict:"E",require:["?^map","?^ngMap"],link:function(e,o,i,a){a=a[0]||a[1];var r=t.filter(i),s=t.getOptions(r,{scope:e}),p=t.getEvents(e,r,p),c=n(s,p);a.addObject("mapsEngineLayers",c)}}}])}(),function(){"use strict";var e,t,n,o=function(e,t){var o;if(n.defaultOptions.marker)for(var i in n.defaultOptions.marker)"undefined"==typeof e[i]&&(e[i]=n.defaultOptions.marker[i]);e.position instanceof google.maps.LatLng||(e.position=new google.maps.LatLng(0,0)),o=new google.maps.Marker(e),Object.keys(t).length>0;for(var a in t)a&&google.maps.event.addListener(o,a,t[a]);return o},i=function(i,a,r,s){s=s[0]||s[1];var p,c=e.orgAttributes(a),u=e.filter(r),l=e.getOptions(u,i,{scope:i}),g=e.getEvents(i,u);l.position instanceof google.maps.LatLng||(p=l.position);var d=o(l,g);s.addObject("markers",d),p&&n.getGeoLocation(p).then(function(e){d.setPosition(e),l.centered&&d.map.setCenter(e);var n=r.geoCallback;n&&t(n)(i)}),s.observeAttrSetObj(c,r,d),a.bind("$destroy",function(){s.deleteObject("markers",d)})},a=function(o,a,r){return e=o,t=a,n=r,{restrict:"E",require:["^?map","?^ngMap"],link:i}};a.$inject=["Attr2MapOptions","$parse","NgMap"],angular.module("ngMap").directive("marker",a)}(),function(){"use strict";angular.module("ngMap").directive("overlayMapType",["NgMap",function(e){return{restrict:"E",require:["?^map","?^ngMap"],link:function(t,n,o,i){i=i[0]||i[1];var a=o.initMethod||"insertAt",r=t[o.object];e.getMap().then(function(e){if("insertAt"==a){var t=parseInt(o.index,10);e.overlayMapTypes.insertAt(t,r)}else"push"==a&&e.overlayMapTypes.push(r)}),i.addObject("overlayMapTypes",r)}}}])}(),function(){"use strict";var e=function(e,t){var n=e,o=function(e,o,i,a){if("false"===i.placesAutoComplete)return!1;var r=n.filter(i),s=n.getOptions(r,{scope:e}),p=n.getEvents(e,r),c=new google.maps.places.Autocomplete(o[0],s);for(var u in p)google.maps.event.addListener(c,u,p[u]);var l=function(){t(function(){a&&a.$setViewValue(o.val())},100)};google.maps.event.addListener(c,"place_changed",l),o[0].addEventListener("change",l),i.$observe("types",function(e){if(e){var t=n.toOptionValue(e,{key:"types"});c.setTypes(t)}}),i.$observe("componentRestrictions",function(t){t&&c.setComponentRestrictions(e.$eval(t))})};return{restrict:"A",require:"?ngModel",link:o}};e.$inject=["Attr2MapOptions","$timeout"],angular.module("ngMap").directive("placesAutoComplete",e)}(),function(){"use strict";var e=function(e,t){var n,o=e.name;switch(delete e.name,o){case"circle":e.center instanceof google.maps.LatLng||(e.center=new google.maps.LatLng(0,0)),n=new google.maps.Circle(e);break;case"polygon":n=new google.maps.Polygon(e);break;case"polyline":n=new google.maps.Polyline(e);break;case"rectangle":n=new google.maps.Rectangle(e);break;case"groundOverlay":case"image":var i=e.url,a={opacity:e.opacity,clickable:e.clickable,id:e.id};n=new google.maps.GroundOverlay(i,e.bounds,a)}for(var r in t)t[r]&&google.maps.event.addListener(n,r,t[r]);return n},t=function(t,n,o){var i=t,a=function(t,a,r,s){s=s[0]||s[1];var p,c,u=i.orgAttributes(a),l=i.filter(r),g=i.getOptions(l,{scope:t}),d=i.getEvents(t,l);c=g.name,g.center instanceof google.maps.LatLng||(p=g.center);var m=e(g,d);s.addObject("shapes",m),p&&"circle"==c&&o.getGeoLocation(p).then(function(e){m.setCenter(e),m.centered&&m.map.setCenter(e);var o=r.geoCallback;o&&n(o)(t)}),s.observeAttrSetObj(u,r,m),a.bind("$destroy",function(){s.deleteObject("shapes",m)})};return{restrict:"E",require:["?^map","?^ngMap"],link:a}};t.$inject=["Attr2MapOptions","$parse","NgMap"],angular.module("ngMap").directive("shape",t)}(),function(){"use strict";var e=function(e,t){var n=e,o=function(e,t,n){var o,i;t.container&&(i=document.getElementById(t.container),i=i||document.querySelector(t.container)),i?o=new google.maps.StreetViewPanorama(i,t):(o=e.getStreetView(),o.setOptions(t));for(var a in n)a&&google.maps.event.addListener(o,a,n[a]);return o},i=function(e,i,a){var r=n.filter(a),s=n.getOptions(r,{scope:e}),p=n.getControlOptions(r),c=angular.extend(s,p),u=n.getEvents(e,r);t.getMap().then(function(e){var t=o(e,c,u);e.setStreetView(t),!t.getPosition()&&t.setPosition(e.getCenter()),google.maps.event.addListener(t,"position_changed",function(){t.getPosition()!==e.getCenter()&&e.setCenter(t.getPosition())});var n=google.maps.event.addListener(e,"center_changed",function(){t.setPosition(e.getCenter()),google.maps.event.removeListener(n)})})};return{restrict:"E",require:["?^map","?^ngMap"],link:i}};e.$inject=["Attr2MapOptions","NgMap"],angular.module("ngMap").directive("streetViewPanorama",e)}(),function(){"use strict";angular.module("ngMap").directive("trafficLayer",["Attr2MapOptions",function(e){var t=e,n=function(e,t){var n=new google.maps.TrafficLayer(e);for(var o in t)google.maps.event.addListener(n,o,t[o]);return n};return{restrict:"E",require:["?^map","?^ngMap"],link:function(e,o,i,a){a=a[0]||a[1];var r=t.orgAttributes(o),s=t.filter(i),p=t.getOptions(s,{scope:e}),c=t.getEvents(e,s),u=n(p,c);a.addObject("trafficLayers",u),a.observeAttrSetObj(r,i,u),o.bind("$destroy",function(){a.deleteObject("trafficLayers",u)})}}}])}(),function(){"use strict";angular.module("ngMap").directive("transitLayer",["Attr2MapOptions",function(e){var t=e,n=function(e,t){var n=new google.maps.TransitLayer(e);for(var o in t)google.maps.event.addListener(n,o,t[o]);return n};return{restrict:"E",require:["?^map","?^ngMap"],link:function(e,o,i,a){a=a[0]||a[1];var r=t.orgAttributes(o),s=t.filter(i),p=t.getOptions(s,{scope:e}),c=t.getEvents(e,s),u=n(p,c);a.addObject("transitLayers",u),a.observeAttrSetObj(r,i,u),o.bind("$destroy",function(){a.deleteObject("transitLayers",u)})}}}])}(),function(){"use strict";var e=/([\:\-\_]+(.))/g,t=/^moz([A-Z])/,n=function(){return function(n){return n.replace(e,function(e,t,n,o){return o?n.toUpperCase():n}).replace(t,"Moz$1")}};angular.module("ngMap").filter("camelCase",n)}(),function(){"use strict";var e=function(){return function(e){try{return JSON.parse(e),e}catch(t){return e.replace(/([\$\w]+)\s*:/g,function(e,t){return'"'+t+'":'}).replace(/'([^']+)'/g,function(e,t){return'"'+t+'"'})}}};angular.module("ngMap").filter("jsonize",e)}(),function(){"use strict";var isoDateRE=/^(\d{4}\-\d\d\-\d\d([tT][\d:\.]*)?)([zZ]|([+\-])(\d\d):?(\d\d))?$/,Attr2MapOptions=function($parse,$timeout,$log,NavigatorGeolocation,GeoCoder,camelCaseFilter,jsonizeFilter){var orgAttributes=function(e){e.length>0&&(e=e[0]);for(var t={},n=0;n<e.attributes.length;n++){var o=e.attributes[n];t[o.name]=o.value}return t},getJSON=function(e){var t=/^[\+\-]?[0-9\.]+,[ ]*\ ?[\+\-]?[0-9\.]+$/;return e.match(t)&&(e="["+e+"]"),JSON.parse(jsonizeFilter(e))},getLatLng=function(e){var t=e;return e[0].constructor==Array?t=e.map(function(e){return new google.maps.LatLng(e[0],e[1])}):!isNaN(parseFloat(e[0]))&&isFinite(e[0])&&(t=new google.maps.LatLng(t[0],t[1])),t},toOptionValue=function(input,options){var output;try{output=getNumber(input)}catch(err){try{var output=getJSON(input);if(output instanceof Array)output=output[0].constructor==Object?output:getLatLng(output);else if(output===Object(output)){var newOptions=options;newOptions.doNotConverStringToNumber=!0,output=getOptions(output,newOptions)}}catch(err2){if(input.match(/^[A-Z][a-zA-Z0-9]+\(.*\)$/))try{var exp="new google.maps."+input;output=eval(exp)}catch(e){output=input}else if(input.match(/^([A-Z][a-zA-Z0-9]+)\.([A-Z]+)$/))try{var matches=input.match(/^([A-Z][a-zA-Z0-9]+)\.([A-Z]+)$/);output=google.maps[matches[1]][matches[2]]}catch(e){output=input}else if(input.match(/^[A-Z]+$/))try{var capitalizedKey=options.key.charAt(0).toUpperCase()+options.key.slice(1);options.key.match(/temperatureUnit|windSpeedUnit|labelColor/)?(capitalizedKey=capitalizedKey.replace(/s$/,""),output=google.maps.weather[capitalizedKey][input]):output=google.maps[capitalizedKey][input]}catch(e){output=input}else if(input.match(isoDateRE))try{output=new Date(input)}catch(e){output=input}else if(input.match(/^{/)&&options.scope)try{var expr=input.replace(/{{/,"").replace(/}}/g,"");output=options.scope.$eval(expr)}catch(err){output=input}else output=input}}if(("center"==options.key||"center"==options.key)&&output instanceof Array&&(output=new google.maps.LatLng(output[0],output[1])),"bounds"==options.key&&output instanceof Array&&(output=new google.maps.LatLngBounds(output[0],output[1])),"icons"==options.key&&output instanceof Array)for(var i=0;i<output.length;i++){var el=output[i];el.icon.path.match(/^[A-Z_]+$/)&&(el.icon.path=google.maps.SymbolPath[el.icon.path])}if("icon"==options.key&&output instanceof Object){(""+output.path).match(/^[A-Z_]+$/)&&(output.path=google.maps.SymbolPath[output.path]);for(var key in output){var arr=output[key];"anchor"==key||"origin"==key||"labelOrigin"==key?output[key]=new google.maps.Point(arr[0],arr[1]):("size"==key||"scaledSize"==key)&&(output[key]=new google.maps.Size(arr[0],arr[1]))}}return output},getAttrsToObserve=function(e){var t=[];if(!e.noWatcher)for(var n in e){var o=e[n];o&&o.match(/\{\{.*\}\}/)&&t.push(camelCaseFilter(n))}return t},filter=function(e){var t={};for(var n in e)n.match(/^\$/)||n.match(/^ng[A-Z]/)||(t[n]=e[n]);return t},getOptions=function(e,t){t=t||{};var n={};for(var o in e)if(e[o]||0===e[o]){if(o.match(/^on[A-Z]/))continue;if(o.match(/ControlOptions$/))continue;n[o]="string"!=typeof e[o]?e[o]:t.doNotConverStringToNumber&&e[o].match(/^[0-9]+$/)?e[o]:toOptionValue(e[o],{key:o,scope:t.scope})}return n},getEvents=function(e,t){var n={},o=function(e){return"_"+e.toLowerCase()},i=function(t){var n=t.match(/([^\(]+)\(([^\)]*)\)/),o=n[1],i=n[2].replace(/event[ ,]*/,""),a=$parse("["+i+"]");return function(t){function n(e,t){return e[t]}var i=a(e),r=o.split(".").reduce(n,e);r&&r.apply(this,[t].concat(i)),$timeout(function(){e.$apply()})}};for(var a in t)if(t[a]){if(!a.match(/^on[A-Z]/))continue;var r=a.replace(/^on/,"");r=r.charAt(0).toLowerCase()+r.slice(1),r=r.replace(/([A-Z])/g,o);var s=t[a];n[r]=new i(s)}return n},getControlOptions=function(e){var t={};if("object"!=typeof e)return!1;for(var n in e)if(e[n]){if(!n.match(/(.*)ControlOptions$/))continue;var o=e[n],i=o.replace(/'/g,'"');i=i.replace(/([^"]+)|("[^"]+")/g,function(e,t,n){return t?t.replace(/([a-zA-Z0-9]+?):/g,'"$1":'):n});try{var a=JSON.parse(i);for(var r in a)if(a[r]){var s=a[r];if("string"==typeof s?s=s.toUpperCase():"mapTypeIds"===r&&(s=s.map(function(e){return e.match(/^[A-Z]+$/)?google.maps.MapTypeId[e.toUpperCase()]:e})),"style"===r){var p=n.charAt(0).toUpperCase()+n.slice(1),c=p.replace(/Options$/,"")+"Style";a[r]=google.maps[c][s]}else a[r]="position"===r?google.maps.ControlPosition[s]:s}t[n]=a}catch(u){}}return t};return{filter:filter,getOptions:getOptions,getEvents:getEvents,getControlOptions:getControlOptions,toOptionValue:toOptionValue,getAttrsToObserve:getAttrsToObserve,orgAttributes:orgAttributes}};Attr2MapOptions.$inject=["$parse","$timeout","$log","NavigatorGeolocation","GeoCoder","camelCaseFilter","jsonizeFilter"],angular.module("ngMap").service("Attr2MapOptions",Attr2MapOptions)}(),function(){"use strict";var e,t=function(t){var n=e.defer(),o=new google.maps.Geocoder;return o.geocode(t,function(e,t){t==google.maps.GeocoderStatus.OK?n.resolve(e):n.reject(t)}),n.promise},n=function(n){return e=n,{geocode:t}};n.$inject=["$q"],angular.module("ngMap").service("GeoCoder",n)}(),function(){"use strict";var e,t=function(t){var n=e.defer();return navigator.geolocation?(void 0===t?t={timeout:5e3}:void 0===t.timeout&&(t.timeout=5e3),navigator.geolocation.getCurrentPosition(function(e){n.resolve(e)},function(e){n.reject(e)},t)):n.reject("Browser Geolocation service failed."),n.promise},n=function(n){return e=n,{getCurrentPosition:t}};n.$inject=["$q"],angular.module("ngMap").service("NavigatorGeolocation",n)}(),function(){"use strict";var e,t,n,o=[],i=function(n){var i=t.createElement("div");i.style.width="100%",i.style.height="100%",n.appendChild(i);var a=new e.google.maps.Map(i,{});return o.push(a),a},a=function(e,t){for(var n,i=0;i<o.length;i++){var a=o[i];if(a.id==t&&!a.inUse){var r=a.getDiv();e.appendChild(r),n=a;break}}return n},r=function(e){for(var t,n=0;n<o.length;n++){var i=o[n];if(!i.id&&!i.inUse){var a=i.getDiv();e.appendChild(a),t=i;break}}return t},s=function(e){var t=a(e,e.id)||r(e);return t?n(function(){google.maps.event.trigger(t,"idle")},100):t=i(e),t.inUse=!0,t},p=function(e){e.inUse=!1},c=function(){for(var e=0;e<o.length;e++)o[e]=null;o=[]},u=function(i,a,r){return t=i[0],e=a,n=r,{mapInstances:o,resetMapInstances:c,getMapInstance:s,returnMapInstance:p}};u.$inject=["$document","$window","$timeout"],angular.module("ngMap").factory("NgMapPool",u)}(),function(){"use strict";var e,t,n,o,i,a,r,s={},p=function(n,o){var i;return n.currentStyle?i=n.currentStyle[o]:e.getComputedStyle&&(i=t.defaultView.getComputedStyle(n,null).getPropertyValue(o)),i},c=function(e){var t=s[e||0];return t.map instanceof google.maps.Map?void 0:(t.initializeMap(),t.map)},u=function(t){function o(n){s[t]?i.resolve(s[t].map):n>a?i.reject("could not find map"):e.setTimeout(function(){o(n+100)},100)}t="object"==typeof t?t.id:t,t=t||0;var i=n.defer(),a=2e3;return o(0),i.promise},l=function(e){if(e.map){var t=Object.keys(s).length;s[e.map.id||t]=e}},g=function(e){var t=Object.keys(s).length-1,n=e.map.id||t;if(e.map){for(var o in e.eventListeners){var i=e.eventListeners[o];google.maps.event.removeListener(i)}e.map.controls&&e.map.controls.forEach(function(e){e.clear()})}e.map.heatmapLayers&&Object.keys(e.map.heatmapLayers).forEach(function(t){e.deleteObject("heatmapLayers",e.map.heatmapLayers[t])}),delete s[n]},d=function(e,t){var i=n.defer();return!e||e.match(/^current/i)?o.getCurrentPosition(t).then(function(e){var t=e.coords.latitude,n=e.coords.longitude,o=new google.maps.LatLng(t,n);i.resolve(o)},function(e){i.reject(e)}):a.geocode({address:e}).then(function(e){i.resolve(e[0].geometry.location)},function(e){i.reject(e)}),i.promise},m=function(e,t){return function(n){if(n){var o=r("set-"+e),a=i.toOptionValue(n,{key:e});t[o]&&(e.match(/center|position/)&&"string"==typeof a?d(a).then(function(e){t[o](e)}):t[o](a))}}},f=function(e){var t=e.getAttribute("default-style");"true"==t?(e.style.display="block",e.style.height="300px"):("block"!=p(e,"display")&&(e.style.display="block"),p(e,"height").match(/^(0|auto)/)&&(e.style.height="300px"))};angular.module("ngMap").provider("NgMap",function(){var s={};this.setDefaultOptions=function(e){s=e};var p=function(p,v,y,h,M,b,O){return e=p,t=v[0],n=y,o=h,i=M,a=b,r=O,{defaultOptions:s,addMap:l,deleteMap:g,getMap:u,initMap:c,setStyle:f,getGeoLocation:d,observeAndSet:m}};p.$inject=["$window","$document","$q","NavigatorGeolocation","Attr2MapOptions","GeoCoder","camelCaseFilter"],this.$get=p})}(),function(){"use strict";var e,t=function(t,n){n=n||t.getCenter();var o=e.defer(),i=new google.maps.StreetViewService;return i.getPanoramaByLocation(n||t.getCenter,100,function(e,t){t===google.maps.StreetViewStatus.OK?o.resolve(e.location.pano):o.resolve(!1)
}),o.promise},n=function(e,t){var n=new google.maps.StreetViewPanorama(e.getDiv(),{enableCloseButton:!0});n.setPano(t)},o=function(o){return e=o,{getPanorama:t,setPanorama:n}};o.$inject=["$q"],angular.module("ngMap").service("StreetView",o)}(),"ngMap"});
/*! ng-dialog - v0.6.3 (https://github.com/likeastore/ngDialog) */
!function(a,b){"undefined"!=typeof module&&module.exports?(b("undefined"==typeof angular?require("angular"):angular),module.exports="ngDialog"):"function"==typeof define&&define.amd?define(["angular"],b):b(a.angular)}(this,function(a){"use strict";var b=a.module("ngDialog",[]),c=a.element,d=a.isDefined,e=(document.body||document.documentElement).style,f=d(e.animation)||d(e.WebkitAnimation)||d(e.MozAnimation)||d(e.MsAnimation)||d(e.OAnimation),g="animationend webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend",h="a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, *[tabindex], *[contenteditable]",i="ngdialog-disabled-animation",j={html:!1,body:!1},k={},l=[],m=!1,n=!1;return b.provider("ngDialog",function(){var b=this.defaults={className:"ngdialog-theme-default",appendClassName:"",disableAnimation:!1,plain:!1,showClose:!0,closeByDocument:!0,closeByEscape:!0,closeByNavigation:!1,appendTo:!1,preCloseCallback:!1,overlay:!0,cache:!0,trapFocus:!0,preserveFocus:!0,ariaAuto:!0,ariaRole:null,ariaLabelledById:null,ariaLabelledBySelector:null,ariaDescribedById:null,ariaDescribedBySelector:null,bodyClassName:"ngdialog-open",width:null,height:null};this.setForceHtmlReload=function(a){j.html=a||!1},this.setForceBodyReload=function(a){j.body=a||!1},this.setDefaults=function(c){a.extend(b,c)},this.setOpenOnePerName=function(a){n=a||!1};var d,e=0,o=0,p={};this.$get=["$document","$templateCache","$compile","$q","$http","$rootScope","$timeout","$window","$controller","$injector",function(q,r,s,t,u,v,w,x,y,z){var A=[],B={onDocumentKeydown:function(a){27===a.keyCode&&C.close("$escape")},activate:function(a){var b=a.data("$ngDialogOptions");b.trapFocus&&(a.on("keydown",B.onTrapFocusKeydown),A.body.on("keydown",B.onTrapFocusKeydown))},deactivate:function(a){a.off("keydown",B.onTrapFocusKeydown),A.body.off("keydown",B.onTrapFocusKeydown)},deactivateAll:function(b){a.forEach(b,function(b){var c=a.element(b);B.deactivate(c)})},setBodyPadding:function(a){var b=parseInt(A.body.css("padding-right")||0,10);A.body.css("padding-right",b+a+"px"),A.body.data("ng-dialog-original-padding",b),v.$broadcast("ngDialog.setPadding",a)},resetBodyPadding:function(){var a=A.body.data("ng-dialog-original-padding");a?A.body.css("padding-right",a+"px"):A.body.css("padding-right",""),v.$broadcast("ngDialog.setPadding",0)},performCloseDialog:function(a,b){var c=a.data("$ngDialogOptions"),e=a.attr("id"),h=k[e];if(h){if("undefined"!=typeof x.Hammer){var i=h.hammerTime;i.off("tap",d),i.destroy&&i.destroy(),delete h.hammerTime}else a.unbind("click");1===o&&A.body.unbind("keydown",B.onDocumentKeydown),a.hasClass("ngdialog-closing")||(o-=1);var j=a.data("$ngDialogPreviousFocus");j&&j.focus&&j.focus(),v.$broadcast("ngDialog.closing",a,b),o=o<0?0:o,f&&!c.disableAnimation?(h.$destroy(),a.unbind(g).bind(g,function(){B.closeDialogElement(a,b)}).addClass("ngdialog-closing")):(h.$destroy(),B.closeDialogElement(a,b)),p[e]&&(p[e].resolve({id:e,value:b,$dialog:a,remainingDialogs:o}),delete p[e]),k[e]&&delete k[e],l.splice(l.indexOf(e),1),l.length||(A.body.unbind("keydown",B.onDocumentKeydown),m=!1)}},closeDialogElement:function(a,b){var c=a.data("$ngDialogOptions");a.remove(),0===o&&(A.html.removeClass(c.bodyClassName),A.body.removeClass(c.bodyClassName),B.resetBodyPadding()),v.$broadcast("ngDialog.closed",a,b)},closeDialog:function(b,c){var d=b.data("$ngDialogPreCloseCallback");if(d&&a.isFunction(d)){var e=d.call(b,c);if(a.isObject(e))e.closePromise?e.closePromise.then(function(){B.performCloseDialog(b,c)},function(){return!1}):e.then(function(){B.performCloseDialog(b,c)},function(){return!1});else{if(e===!1)return!1;B.performCloseDialog(b,c)}}else B.performCloseDialog(b,c)},onTrapFocusKeydown:function(b){var c,d=a.element(b.currentTarget);if(d.hasClass("ngdialog"))c=d;else if(c=B.getActiveDialog(),null===c)return;var e=9===b.keyCode,f=b.shiftKey===!0;e&&B.handleTab(c,b,f)},handleTab:function(a,b,c){var d=B.getFocusableElements(a);if(0===d.length)return void(document.activeElement&&document.activeElement.blur&&document.activeElement.blur());var e=document.activeElement,f=Array.prototype.indexOf.call(d,e),g=f===-1,h=0===f,i=f===d.length-1,j=!1;c?(g||h)&&(d[d.length-1].focus(),j=!0):(g||i)&&(d[0].focus(),j=!0),j&&(b.preventDefault(),b.stopPropagation())},autoFocus:function(a){var b=a[0],d=b.querySelector("*[autofocus]");if(null===d||(d.focus(),document.activeElement!==d)){var e=B.getFocusableElements(a);if(e.length>0)return void e[0].focus();var f=B.filterVisibleElements(b.querySelectorAll("h1,h2,h3,h4,h5,h6,p,span"));if(f.length>0){var g=f[0];c(g).attr("tabindex","-1").css("outline","0"),g.focus()}}},getFocusableElements:function(a){var b=a[0],c=b.querySelectorAll(h),d=B.filterTabbableElements(c);return B.filterVisibleElements(d)},filterTabbableElements:function(a){for(var b=[],d=0;d<a.length;d++){var e=a[d];"-1"!==c(e).attr("tabindex")&&b.push(e)}return b},filterVisibleElements:function(a){for(var b=[],c=0;c<a.length;c++){var d=a[c];(d.offsetWidth>0||d.offsetHeight>0)&&b.push(d)}return b},getActiveDialog:function(){var a=document.querySelectorAll(".ngdialog");return 0===a.length?null:c(a[a.length-1])},applyAriaAttributes:function(a,b){if(b.ariaAuto){if(!b.ariaRole){var c=B.getFocusableElements(a).length>0?"dialog":"alertdialog";b.ariaRole=c}b.ariaLabelledBySelector||(b.ariaLabelledBySelector="h1,h2,h3,h4,h5,h6"),b.ariaDescribedBySelector||(b.ariaDescribedBySelector="article,section,p")}b.ariaRole&&a.attr("role",b.ariaRole),B.applyAriaAttribute(a,"aria-labelledby",b.ariaLabelledById,b.ariaLabelledBySelector),B.applyAriaAttribute(a,"aria-describedby",b.ariaDescribedById,b.ariaDescribedBySelector)},applyAriaAttribute:function(a,b,d,e){if(d&&a.attr(b,d),e){var f=a.attr("id"),g=a[0].querySelector(e);if(!g)return;var h=f+"-"+b;return c(g).attr("id",h),a.attr(b,h),h}},detectUIRouter:function(){try{return a.module("ui.router"),!0}catch(b){return!1}},getRouterLocationEventName:function(){return B.detectUIRouter()?"$stateChangeStart":"$locationChangeStart"}},C={__PRIVATE__:B,open:function(f){function g(a,b){return v.$broadcast("ngDialog.templateLoading",a),u.get(a,b||{}).then(function(b){return v.$broadcast("ngDialog.templateLoaded",a),b.data||""})}function h(b){return b?a.isString(b)&&q.plain?b:"boolean"!=typeof q.cache||q.cache?g(b,{cache:r}):g(b,{cache:!1}):"Empty template"}var j=null;if(f=f||{},!(n&&f.name&&(j=f.name.toLowerCase().replace(/\s/g,"-")+"-dialog",this.isOpen(j)))){var q=a.copy(b),D=++e;j=j||"ngdialog"+D,l.push(j),"undefined"!=typeof q.data&&("undefined"==typeof f.data&&(f.data={}),f.data=a.merge(a.copy(q.data),f.data)),a.extend(q,f);var E;p[j]=E=t.defer();var F;k[j]=F=a.isObject(q.scope)?q.scope.$new():v.$new();var G,H,I,J=a.extend({},q.resolve);return a.forEach(J,function(b,c){J[c]=a.isString(b)?z.get(b):z.invoke(b,null,null,c)}),t.all({template:h(q.template||q.templateUrl),locals:t.all(J)}).then(function(b){var e=b.template,f=b.locals;q.showClose&&(e+='<div class="ngdialog-close"></div>');var g=q.overlay?"":" ngdialog-no-overlay";if(G=c('<div id="'+j+'" class="ngdialog'+g+'"></div>'),G.html(q.overlay?'<div class="ngdialog-overlay"></div><div class="ngdialog-content" role="document">'+e+"</div>":'<div class="ngdialog-content" role="document">'+e+"</div>"),G.data("$ngDialogOptions",q),F.ngDialogId=j,q.data&&a.isString(q.data)){var h=q.data.replace(/^\s*/,"")[0];F.ngDialogData="{"===h||"["===h?a.fromJson(q.data):new String(q.data),F.ngDialogData.ngDialogId=j}else q.data&&a.isObject(q.data)&&(F.ngDialogData=q.data,F.ngDialogData.ngDialogId=j);if(q.className&&G.addClass(q.className),q.appendClassName&&G.addClass(q.appendClassName),q.width&&(I=G[0].querySelector(".ngdialog-content"),a.isString(q.width)?I.style.width=q.width:I.style.width=q.width+"px"),q.height&&(I=G[0].querySelector(".ngdialog-content"),a.isString(q.height)?I.style.height=q.height:I.style.height=q.height+"px"),q.disableAnimation&&G.addClass(i),H=q.appendTo&&a.isString(q.appendTo)?a.element(document.querySelector(q.appendTo)):A.body,B.applyAriaAttributes(G,q),q.preCloseCallback){var k;a.isFunction(q.preCloseCallback)?k=q.preCloseCallback:a.isString(q.preCloseCallback)&&F&&(a.isFunction(F[q.preCloseCallback])?k=F[q.preCloseCallback]:F.$parent&&a.isFunction(F.$parent[q.preCloseCallback])?k=F.$parent[q.preCloseCallback]:v&&a.isFunction(v[q.preCloseCallback])&&(k=v[q.preCloseCallback])),k&&G.data("$ngDialogPreCloseCallback",k)}if(F.closeThisDialog=function(a){B.closeDialog(G,a)},q.controller&&(a.isString(q.controller)||a.isArray(q.controller)||a.isFunction(q.controller))){var l;q.controllerAs&&a.isString(q.controllerAs)&&(l=q.controllerAs);var n=y(q.controller,a.extend(f,{$scope:F,$element:G}),!0,l);q.bindToController&&a.extend(n.instance,{ngDialogId:F.ngDialogId,ngDialogData:F.ngDialogData,closeThisDialog:F.closeThisDialog,confirm:F.confirm}),"function"==typeof n?G.data("$ngDialogControllerController",n()):G.data("$ngDialogControllerController",n)}if(w(function(){var a=document.querySelectorAll(".ngdialog");B.deactivateAll(a),s(G)(F);var b=x.innerWidth-A.body.prop("clientWidth");A.html.addClass(q.bodyClassName),A.body.addClass(q.bodyClassName);var c=b-(x.innerWidth-A.body.prop("clientWidth"));c>0&&B.setBodyPadding(c),H.append(G),B.activate(G),q.trapFocus&&B.autoFocus(G),q.name?v.$broadcast("ngDialog.opened",{dialog:G,name:q.name}):v.$broadcast("ngDialog.opened",G)}),m||(A.body.bind("keydown",B.onDocumentKeydown),m=!0),q.closeByNavigation){var p=B.getRouterLocationEventName();v.$on(p,function(a){B.closeDialog(G)===!1&&a.preventDefault()})}if(q.preserveFocus&&G.data("$ngDialogPreviousFocus",document.activeElement),d=function(a){var b=!!q.closeByDocument&&c(a.target).hasClass("ngdialog-overlay"),d=c(a.target).hasClass("ngdialog-close");(b||d)&&C.close(G.attr("id"),d?"$closeButton":"$document")},"undefined"!=typeof x.Hammer){var r=F.hammerTime=x.Hammer(G[0]);r.on("tap",d)}else G.bind("click",d);return o+=1,C}),{id:j,closePromise:E.promise,close:function(a){B.closeDialog(G,a)}}}},openConfirm:function(d){var e=t.defer(),f=a.copy(b);d=d||{},"undefined"!=typeof f.data&&("undefined"==typeof d.data&&(d.data={}),d.data=a.merge(a.copy(f.data),d.data)),a.extend(f,d),f.scope=a.isObject(f.scope)?f.scope.$new():v.$new(),f.scope.confirm=function(a){e.resolve(a);var b=c(document.getElementById(g.id));B.performCloseDialog(b,a)};var g=C.open(f);if(g)return g.closePromise.then(function(a){return a?e.reject(a.value):e.reject()}),e.promise},isOpen:function(a){var b=c(document.getElementById(a));return b.length>0},close:function(a,b){var d=c(document.getElementById(a));if(d.length)B.closeDialog(d,b);else if("$escape"===a){var e=l[l.length-1];d=c(document.getElementById(e)),d.data("$ngDialogOptions").closeByEscape&&B.closeDialog(d,"$escape")}else C.closeAll(b);return C},closeAll:function(a){for(var b=document.querySelectorAll(".ngdialog"),d=b.length-1;d>=0;d--){var e=b[d];B.closeDialog(c(e),a)}},getOpenDialogs:function(){return l},getDefaults:function(){return b}};return a.forEach(["html","body"],function(a){if(A[a]=q.find(a),j[a]){var b=B.getRouterLocationEventName();v.$on(b,function(){A[a]=q.find(a)})}}),C}]}),b.directive("ngDialog",["ngDialog",function(b){return{restrict:"A",scope:{ngDialogScope:"="},link:function(c,d,e){d.on("click",function(d){d.preventDefault();var f=a.isDefined(c.ngDialogScope)?c.ngDialogScope:"noScope";a.isDefined(e.ngDialogClosePrevious)&&b.close(e.ngDialogClosePrevious);var g=b.getDefaults();b.open({template:e.ngDialog,className:e.ngDialogClass||g.className,appendClassName:e.ngDialogAppendClass,controller:e.ngDialogController,controllerAs:e.ngDialogControllerAs,bindToController:e.ngDialogBindToController,scope:f,data:e.ngDialogData,showClose:"false"!==e.ngDialogShowClose&&("true"===e.ngDialogShowClose||g.showClose),closeByDocument:"false"!==e.ngDialogCloseByDocument&&("true"===e.ngDialogCloseByDocument||g.closeByDocument),closeByEscape:"false"!==e.ngDialogCloseByEscape&&("true"===e.ngDialogCloseByEscape||g.closeByEscape),overlay:"false"!==e.ngDialogOverlay&&("true"===e.ngDialogOverlay||g.overlay),preCloseCallback:e.ngDialogPreCloseCallback||g.preCloseCallback,bodyClassName:e.ngDialogBodyClass||g.bodyClassName})})}}}]),b});
/**
 * Satellizer 0.14.0
 * (c) 2016 Sahat Yalkabov
 * License: MIT
 */

// CommonJS package manager support.
if (typeof module !== 'undefined' && typeof exports !== 'undefined' && module.exports === exports) {
  module.exports = 'satellizer';
}

(function(window, angular, undefined) {
  'use strict';

  if (!window.location.origin) {
    window.location.origin = window.location.protocol + '//' + window.location.hostname + (window.location.port ? (':' + window.location.port) : '');
  }

  angular.module('satellizer', [])
    .constant('SatellizerConfig', {
      httpInterceptor: function() { return true; },
      withCredentials: false,
      tokenRoot: null,
      baseUrl: '/',
      loginUrl: '/auth/login',
      signupUrl: '/auth/signup',
      unlinkUrl: '/auth/unlink/',
      tokenName: 'token',
      tokenPrefix: 'satellizer',
      authHeader: 'Authorization',
      authToken: 'Bearer',
      storageType: 'localStorage',
      providers: {
        facebook: {
          name: 'facebook',
          url: '/auth/facebook',
          authorizationEndpoint: 'https://www.facebook.com/v2.5/dialog/oauth',
          redirectUri: window.location.origin + '/',
          requiredUrlParams: ['display', 'scope'],
          scope: ['email'],
          scopeDelimiter: ',',
          display: 'popup',
          oauthType: '2.0',
          popupOptions: { width: 580, height: 400 }
        },
        google: {
          name: 'google',
          url: '/auth/google',
          authorizationEndpoint: 'https://accounts.google.com/o/oauth2/auth',
          redirectUri: window.location.origin,
          requiredUrlParams: ['scope'],
          optionalUrlParams: ['display'],
          scope: ['profile', 'email'],
          scopePrefix: 'openid',
          scopeDelimiter: ' ',
          display: 'popup',
          oauthType: '2.0',
          popupOptions: { width: 452, height: 633 }
        },
        github: {
          name: 'github',
          url: '/auth/github',
          authorizationEndpoint: 'https://github.com/login/oauth/authorize',
          redirectUri: window.location.origin,
          optionalUrlParams: ['scope'],
          scope: ['user:email'],
          scopeDelimiter: ' ',
          oauthType: '2.0',
          popupOptions: { width: 1020, height: 618 }
        },
        instagram: {
          name: 'instagram',
          url: '/auth/instagram',
          authorizationEndpoint: 'https://api.instagram.com/oauth/authorize',
          redirectUri: window.location.origin,
          requiredUrlParams: ['scope'],
          scope: ['basic'],
          scopeDelimiter: '+',
          oauthType: '2.0'
        },
        linkedin: {
          name: 'linkedin',
          url: '/auth/linkedin',
          authorizationEndpoint: 'https://www.linkedin.com/uas/oauth2/authorization',
          redirectUri: window.location.origin,
          requiredUrlParams: ['state'],
          scope: ['r_emailaddress'],
          scopeDelimiter: ' ',
          state: 'STATE',
          oauthType: '2.0',
          popupOptions: { width: 527, height: 582 }
        },
        twitter: {
          name: 'twitter',
          url: '/auth/twitter',
          authorizationEndpoint: 'https://api.twitter.com/oauth/authenticate',
          redirectUri: window.location.origin,
          oauthType: '1.0',
          popupOptions: { width: 495, height: 645 }
        },
        twitch: {
          name: 'twitch',
          url: '/auth/twitch',
          authorizationEndpoint: 'https://api.twitch.tv/kraken/oauth2/authorize',
          redirectUri: window.location.origin,
          requiredUrlParams: ['scope'],
          scope: ['user_read'],
          scopeDelimiter: ' ',
          display: 'popup',
          oauthType: '2.0',
          popupOptions: { width: 500, height: 560 }
        },
        live: {
          name: 'live',
          url: '/auth/live',
          authorizationEndpoint: 'https://login.live.com/oauth20_authorize.srf',
          redirectUri: window.location.origin,
          requiredUrlParams: ['display', 'scope'],
          scope: ['wl.emails'],
          scopeDelimiter: ' ',
          display: 'popup',
          oauthType: '2.0',
          popupOptions: { width: 500, height: 560 }
        },
        yahoo: {
          name: 'yahoo',
          url: '/auth/yahoo',
          authorizationEndpoint: 'https://api.login.yahoo.com/oauth2/request_auth',
          redirectUri: window.location.origin,
          scope: [],
          scopeDelimiter: ',',
          oauthType: '2.0',
          popupOptions: { width: 559, height: 519 }
        },
        bitbucket: {
          name: 'bitbucket',
          url: '/auth/bitbucket',
          authorizationEndpoint: 'https://bitbucket.org/site/oauth2/authorize',
          redirectUri: window.location.origin + '/',
          requiredUrlParams: ['scope'],
          scope: ['email'],
          scopeDelimiter: ' ',
          oauthType: '2.0',
          popupOptions: { width: 1028, height: 529 }
        }
      }
    })
    .provider('$auth', ['SatellizerConfig', function(config) {
      Object.defineProperties(this, {
        httpInterceptor: {
          get: function() { return config.httpInterceptor; },
          set: function(value) {
            if (typeof value === 'function') {
              config.httpInterceptor = value;
            } else {
              config.httpInterceptor = function() {
                return value;
              };
            }
          }
        },
        baseUrl: {
          get: function() { return config.baseUrl; },
          set: function(value) { config.baseUrl = value; }
        },
        loginUrl: {
          get: function() { return config.loginUrl; },
          set: function(value) { config.loginUrl = value; }
        },
        signupUrl: {
          get: function() { return config.signupUrl; },
          set: function(value) { config.signupUrl = value; }
        },
        tokenRoot: {
          get: function() { return config.tokenRoot; },
          set: function(value) { config.tokenRoot = value; }
        },
        tokenName: {
          get: function() { return config.tokenName; },
          set: function(value) { config.tokenName = value; }
        },
        tokenPrefix: {
          get: function() { return config.tokenPrefix; },
          set: function(value) { config.tokenPrefix = value; }
        },
        unlinkUrl: {
          get: function() { return config.unlinkUrl; },
          set: function(value) { config.unlinkUrl = value; }
        },
        authHeader: {
          get: function() { return config.authHeader; },
          set: function(value) { config.authHeader = value; }
        },
        authToken: {
          get: function() { return config.authToken; },
          set: function(value) { config.authToken = value; }
        },
        withCredentials: {
          get: function() { return config.withCredentials; },
          set: function(value) { config.withCredentials = value; }
        },
        storageType: {
          get: function() { return config.storageType; },
          set: function(value) { config.storageType = value; }
        }
      });

      angular.forEach(Object.keys(config.providers), function(provider) {
        this[provider] = function(params) {
          return angular.extend(config.providers[provider], params);
        };
      }, this);

      var oauth = function(params) {
        config.providers[params.name] = config.providers[params.name] || {};
        angular.extend(config.providers[params.name], params);
      };

      this.oauth1 = function(params) {
        oauth(params);
        config.providers[params.name].oauthType = '1.0';
      };

      this.oauth2 = function(params) {
        oauth(params);
        config.providers[params.name].oauthType = '2.0';
      };

      this.$get = [
        '$q',
        'SatellizerShared',
        'SatellizerLocal',
        'SatellizerOauth',
        function($q, shared, local, oauth) {
          var $auth = {};

          $auth.login = function(user, opts) {
            return local.login(user, opts);
          };

          $auth.signup = function(user, options) {
            return local.signup(user, options);
          };

          $auth.logout = function() {
            return shared.logout();
          };

          $auth.authenticate = function(name, userData) {
            return oauth.authenticate(name, userData);
          };

          $auth.link = function(name, userData) {
            return oauth.authenticate(name, userData);
          };

          $auth.unlink = function(provider, opts) {
            return oauth.unlink(provider, opts);
          };

          $auth.isAuthenticated = function() {
            return shared.isAuthenticated();
          };

          $auth.getToken = function() {
            return shared.getToken();
          };

          $auth.setToken = function(token) {
            shared.setToken({ access_token: token });
          };

          $auth.removeToken = function() {
            return shared.removeToken();
          };

          $auth.getPayload = function() {
            return shared.getPayload();
          };

          $auth.setStorageType = function(type) {
            return shared.setStorageType(type);
          };

          return $auth;
        }];
    }])
    .factory('SatellizerShared', [
      '$q',
      '$window',
      '$log',
      'SatellizerConfig',
      'SatellizerStorage',
      function($q, $window, $log, config, storage) {
        var Shared = {};

        var tokenName = config.tokenPrefix ? [config.tokenPrefix, config.tokenName].join('_') : config.tokenName;

        Shared.getToken = function() {
          return storage.get(tokenName);
        };

        Shared.getPayload = function() {
          var token = storage.get(tokenName);

          if (token && token.split('.').length === 3) {
            try {
              var base64Url = token.split('.')[1];
              var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
              return JSON.parse(decodeURIComponent(escape(window.atob(base64))));
            } catch(e) {
              return undefined;
            }
          }
        };

        Shared.setToken = function(response) {
          if (!response) {
            return $log.warn('Can\'t set token without passing a value');
          }

          var accessToken = response && response.access_token;
          var token;

          if (accessToken) {
            if (angular.isObject(accessToken) && angular.isObject(accessToken.data)) {
              response = accessToken;
            } else if (angular.isString(accessToken)) {
              token = accessToken;
            }
          }

          if (!token && response) {
            var tokenRootData = config.tokenRoot && config.tokenRoot.split('.').reduce(function(o, x) { return o[x]; }, response.data);
            token = tokenRootData ? tokenRootData[config.tokenName] : response.data && response.data[config.tokenName];
          }

          if (!token) {
            var tokenPath = config.tokenRoot ? config.tokenRoot + '.' + config.tokenName : config.tokenName;
            return $log.warn('Expecting a token named "' + tokenPath);
          }

          storage.set(tokenName, token);
        };

        Shared.removeToken = function() {
          storage.remove(tokenName);
        };

        /**
         * @returns {boolean}
         */
        Shared.isAuthenticated = function() {
          var token = storage.get(tokenName);
          // A token is present
          if (token) {
            // Token with a valid JWT format XXX.YYY.ZZZ
            if (token.split('.').length === 3) {
              // Could be a valid JWT or an access token with the same format
              try {
                var base64Url = token.split('.')[1];
                var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                var exp = JSON.parse($window.atob(base64)).exp;
                // JWT with an optonal expiration claims
                if (exp) {
                  var isExpired = Math.round(new Date().getTime() / 1000) >= exp;
                  if (isExpired) {
                    // FAIL: Expired token
                    return false;
                  } else {
                    // PASS: Non-expired token
                    return true;
                  }
                }
              } catch(e) {
                // PASS: Non-JWT token that looks like JWT
                return true;
              }
            }
            // PASS: All other tokens
            return true;
          }
          // FAIL: No token at all
          return false;
        };

        Shared.logout = function() {
          storage.remove(tokenName);
          return $q.when();
        };

        Shared.setStorageType = function(type) {
          config.storageType = type;
        };

        return Shared;
      }])
    .factory('SatellizerOauth', [
      '$q',
      '$http',
      'SatellizerConfig',
      'SatellizerUtils',
      'SatellizerShared',
      'SatellizerOauth1',
      'SatellizerOauth2',
      function($q, $http, config, utils, shared, Oauth1, Oauth2) {
        var Oauth = {};

        Oauth.authenticate = function(name, userData) {
          var provider = config.providers[name].oauthType === '1.0' ? new Oauth1() : new Oauth2();
          var deferred = $q.defer();

          provider.open(config.providers[name], userData || {})
            .then(function(response) {
              // This is for a scenario when someone wishes to opt out from
              // Satellizer's magic by doing authorization code exchange and
              // saving a token manually.
              if (config.providers[name].url) {
                shared.setToken(response, false);
              }
              deferred.resolve(response);
            })
            .catch(function(error) {
              deferred.reject(error);
            });

          return deferred.promise;
        };

        Oauth.unlink = function(provider, opts) {
          opts = opts || {};
          opts.url = opts.url ? opts.url : utils.joinUrl(config.baseUrl, config.unlinkUrl);
          opts.data = { provider: provider } || opts.data;
          opts.method = opts.method || 'POST';
          opts.withCredentials = opts.withCredentials || config.withCredentials;

          return $http(opts);
        };

        return Oauth;
      }])
    .factory('SatellizerLocal', [
      '$http',
      'SatellizerUtils',
      'SatellizerShared',
      'SatellizerConfig',
      function($http, utils, shared, config) {
        var Local = {};

        Local.login = function(user, opts) {
          opts = opts || {};
          opts.url = opts.url ? opts.url : utils.joinUrl(config.baseUrl, config.loginUrl);
          opts.data = user || opts.data;
          opts.method = opts.method || 'POST';
          opts.withCredentials = opts.withCredentials || config.withCredentials;

          return $http(opts).then(function(response) {
            shared.setToken(response);
            return response;
          });
        };

        Local.signup = function(user, opts) {
          opts = opts || {};
          opts.url = opts.url ? opts.url : utils.joinUrl(config.baseUrl, config.signupUrl);
          opts.data = user || opts.data;
          opts.method = opts.method || 'POST';
          opts.withCredentials = opts.withCredentials || config.withCredentials;

          return $http(opts);
        };

        return Local;
      }])
    .factory('SatellizerOauth2', [
      '$q',
      '$http',
      '$window',
      '$timeout',
      'SatellizerPopup',
      'SatellizerUtils',
      'SatellizerConfig',
      'SatellizerStorage',
      function($q, $http, $window, $timeout, popup, utils, config, storage) {
        return function() {
          var Oauth2 = {};

          var defaults = {
            defaultUrlParams: ['response_type', 'client_id', 'redirect_uri'],
            responseType: 'code',
            responseParams: {
              code: 'code',
              clientId: 'clientId',
              redirectUri: 'redirectUri'
            }
          };

          Oauth2.open = function(options, userData) {
            defaults = utils.merge(options, defaults);
            var defer = $q.defer();

            $timeout(function () {
              var url;
              var openPopup;
              var stateName = defaults.name + '_state';

              if (angular.isFunction(defaults.state)) {
                storage.set(stateName, defaults.state());
              } else if (angular.isString(defaults.state)) {
                storage.set(stateName, defaults.state);
              }

              url = [defaults.authorizationEndpoint, Oauth2.buildQueryString()].join('?');

              if (window.cordova) {
                openPopup = popup.open(url, defaults.name, defaults.popupOptions, defaults.redirectUri).eventListener(defaults.redirectUri);
              } else {
                openPopup = popup.open(url, defaults.name, defaults.popupOptions, defaults.redirectUri).pollPopup(defaults.redirectUri);
              }

              return openPopup
                .then(function(oauthData) {
                  // When no server URL provided, return popup params as-is.
                  // This is for a scenario when someone wishes to opt out from
                  // Satellizer's magic by doing authorization code exchange and
                  // saving a token manually.
                  if (defaults.responseType === 'token' || !defaults.url) {
                    defer.resolve(oauthData);
                  }

                if (oauthData.state && oauthData.state !== storage.get(stateName)) {
                  return defer.reject(
                    'The value returned in the state parameter does not match the state value from your original ' +
                    'authorization code request.'
                  );
                }

                  defer.resolve(Oauth2.exchangeForToken(oauthData, userData));
                });
            });

            return defer.promise;
          };

          Oauth2.exchangeForToken = function(oauthData, userData) {
            var data = angular.extend({}, userData);

            angular.forEach(defaults.responseParams, function(value, key) {
              switch (key) {
                case 'code':
                  data[value] = oauthData.code;
                  break;
                case 'clientId':
                  data[value] = defaults.clientId;
                  break;
                case 'redirectUri':
                  data[value] = defaults.redirectUri;
                  break;
                default:
                  data[value] = oauthData[key];
              }
            });

            if (oauthData.state) {
              data.state = oauthData.state;
            }

            var exchangeForTokenUrl = config.baseUrl ? utils.joinUrl(config.baseUrl, defaults.url) : defaults.url;

            return $http.post(exchangeForTokenUrl, data, { withCredentials: config.withCredentials });
          };

          Oauth2.buildQueryString = function() {
            var keyValuePairs = [];
            var urlParamsCategories = ['defaultUrlParams', 'requiredUrlParams', 'optionalUrlParams'];

            angular.forEach(urlParamsCategories, function(paramsCategory) {
              angular.forEach(defaults[paramsCategory], function(paramName) {
                var camelizedName = utils.camelCase(paramName);
                var paramValue = angular.isFunction(defaults[paramName]) ? defaults[paramName]() : defaults[camelizedName];

                if (paramName === 'redirect_uri' && !paramValue) {
                    return;
                }

                if (paramName === 'state') {
                  var stateName = defaults.name + '_state';
                  paramValue = encodeURIComponent(storage.get(stateName));
                }

                if (paramName === 'scope' && Array.isArray(paramValue)) {
                  paramValue = paramValue.join(defaults.scopeDelimiter);

                  if (defaults.scopePrefix) {
                    paramValue = [defaults.scopePrefix, paramValue].join(defaults.scopeDelimiter);
                  }
                }

                keyValuePairs.push([paramName, paramValue]);
              });
            });

            return keyValuePairs.map(function(pair) {
              return pair.join('=');
            }).join('&');
          };

          return Oauth2;
        };
      }])
    .factory('SatellizerOauth1', [
      '$q',
      '$http',
      'SatellizerPopup',
      'SatellizerConfig',
      'SatellizerUtils',
      function($q, $http, popup, config, utils) {
        return function() {
          var Oauth1 = {};

          var defaults = {
            url: null,
            name: null,
            popupOptions: null,
            redirectUri: null,
            authorizationEndpoint: null
          };

          Oauth1.open = function(options, userData) {
            angular.extend(defaults, options);
            var popupWindow;
            var serverUrl = config.baseUrl ? utils.joinUrl(config.baseUrl, defaults.url) : defaults.url;

            if (!window.cordova) {
                popupWindow = popup.open('', defaults.name, defaults.popupOptions, defaults.redirectUri);
            }

            return $http.post(serverUrl, defaults)
              .then(function(response) {
                var url = [defaults.authorizationEndpoint, Oauth1.buildQueryString(response.data)].join('?');

                if (window.cordova) {
                  popupWindow = popup.open(url, defaults.name, defaults.popupOptions, defaults.redirectUri);
                } else {
                  popupWindow.popupWindow.location = url;
                }

                var popupListener;

                if (window.cordova) {
                  popupListener = popupWindow.eventListener(defaults.redirectUri);
                } else {
                  popupListener = popupWindow.pollPopup(defaults.redirectUri);
                }

                return popupListener
                  .then(function(response) {
                    return Oauth1.exchangeForToken(response, userData);
                  });
              });

          };

          Oauth1.exchangeForToken = function(oauthData, userData) {
            var data = angular.extend({}, userData, oauthData);
            var exchangeForTokenUrl = config.baseUrl ? utils.joinUrl(config.baseUrl, defaults.url) : defaults.url;
            return $http.post(exchangeForTokenUrl, data, { withCredentials: config.withCredentials });
          };

          Oauth1.buildQueryString = function(obj) {
            var str = [];

            angular.forEach(obj, function(value, key) {
              str.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
            });

            return str.join('&');
          };

          return Oauth1;
        };
      }])
    .factory('SatellizerPopup', [
      '$q',
      '$interval',
      '$window',
      'SatellizerConfig',
      'SatellizerUtils',
      function($q, $interval, $window, config, utils) {
        var Popup = {};

        Popup.url = '';
        Popup.popupWindow = null;

        Popup.open = function(url, name, options) {
          Popup.url = url;

          var stringifiedOptions = Popup.stringifyOptions(Popup.prepareOptions(options));
          var UA = $window.navigator.userAgent;
          var windowName = (window.cordova || UA.indexOf('CriOS') > -1) ? '_blank' : name;

          Popup.popupWindow = $window.open(url, windowName, stringifiedOptions);

          $window.popup = Popup.popupWindow;

          if (Popup.popupWindow && Popup.popupWindow.focus) {
            Popup.popupWindow.focus();
          }

          return Popup;
        };

        Popup.eventListener = function(redirectUri) {
          var deferred = $q.defer();

          Popup.popupWindow.addEventListener('loadstart', function(event) {
            if (event.url.indexOf(redirectUri) !== 0) {
              return;
            }

            var parser = document.createElement('a');
            parser.href = event.url;

            if (parser.search || parser.hash) {
              var queryParams = parser.search.substring(1).replace(/\/$/, '');
              var hashParams = parser.hash.substring(1).replace(/\/$/, '');
              var hash = utils.parseQueryString(hashParams);
              var qs = utils.parseQueryString(queryParams);

              angular.extend(qs, hash);

              if (!qs.error) {
                deferred.resolve(qs);
              }

              Popup.popupWindow.close();
            }
          });

          Popup.popupWindow.addEventListener('loaderror', function() {
            deferred.reject('Authorization Failed');
          });

          return deferred.promise;
        };

        Popup.pollPopup = function(redirectUri) {
          var deferred = $q.defer();

          var redirectUriParser = document.createElement('a');
          redirectUriParser.href = redirectUri;

          var redirectUriPath = utils.getFullUrlPath(redirectUriParser);

          var polling = $interval(function() {
            if (!Popup.popupWindow || Popup.popupWindow.closed || Popup.popupWindow.closed === undefined) {
              deferred.reject('The popup window was closed.');
              $interval.cancel(polling);
            }

            try {
              var popupWindowPath = utils.getFullUrlPath(Popup.popupWindow.location);

              // Redirect has occurred.
              if (popupWindowPath === redirectUriPath) {
                // Contains query/hash parameters as expected.
                if (Popup.popupWindow.location.search || Popup.popupWindow.location.hash) {
                  var queryParams = Popup.popupWindow.location.search.substring(1).replace(/\/$/, '');
                  var hashParams = Popup.popupWindow.location.hash.substring(1).replace(/[\/$]/, '');
                  var hash = utils.parseQueryString(hashParams);
                  var qs = utils.parseQueryString(queryParams);

                  angular.extend(qs, hash);

                  if (qs.error) {
                    deferred.reject(qs);
                  } else {
                    deferred.resolve(qs);
                  }
                } else {
                  // Does not contain query/hash parameters, can't do anything at this point.
                  deferred.reject(
                    'Redirect has occurred but no query or hash parameters were found. ' +
                    'They were either not set during the redirect, or were removed before Satellizer ' +
                    'could read them, e.g. AngularJS routing mechanism.'
                  );
                }

                $interval.cancel(polling);
                Popup.popupWindow.close();
              }
            } catch (error) {
              // Ignore DOMException: Blocked a frame with origin from accessing a cross-origin frame.
              // A hack to get around same-origin security policy errors in IE.
            }
          }, 20);

          return deferred.promise;
        };

        Popup.prepareOptions = function(options) {
          options = options || {};
          var width = options.width || 500;
          var height = options.height || 500;

          return angular.extend({
            width: width,
            height: height,
            left: $window.screenX + (($window.outerWidth - width) / 2),
            top: $window.screenY + (($window.outerHeight - height) / 2.5)
          }, options);
        };

        Popup.stringifyOptions = function(options) {
          var parts = [];
          angular.forEach(options, function(value, key) {
            parts.push(key + '=' + value);
          });
          return parts.join(',');
        };

        return Popup;
      }])
    .service('SatellizerUtils', function() {
      this.getFullUrlPath = function(location) {
        return location.protocol + '//' + location.hostname +
        (location.port ? ':' + location.port : '') + location.pathname;
      };

      this.camelCase = function(name) {
        return name.replace(/([\:\-\_]+(.))/g, function(_, separator, letter, offset) {
          return offset ? letter.toUpperCase() : letter;
        });
      };

      this.parseQueryString = function(keyValue) {
        var obj = {}, key, value;
        angular.forEach((keyValue || '').split('&'), function(keyValue) {
          if (keyValue) {
            value = keyValue.split('=');
            key = decodeURIComponent(value[0]);
            obj[key] = angular.isDefined(value[1]) ? decodeURIComponent(value[1]) : true;
          }
        });
        return obj;
      };

      this.joinUrl = function(baseUrl, url) {
        if (/^(?:[a-z]+:)?\/\//i.test(url)) {
          return url;
        }

        var joined = [baseUrl, url].join('/');

        var normalize = function(str) {
          return str
            .replace(/[\/]+/g, '/')
            .replace(/\/\?/g, '?')
            .replace(/\/\#/g, '#')
            .replace(/\:\//g, '://');
        };

        return normalize(joined);
      };

      this.merge = function(obj1, obj2) {
        var result = {};
        for (var i in obj1) {
          if (obj1.hasOwnProperty(i)) {
            if ((i in obj2) && (typeof obj1[i] === 'object') && (i !== null)) {
              result[i] = this.merge(obj1[i], obj2[i]);
            } else {
              result[i] = obj1[i];
            }
          }
        }
        for (i in obj2) {
          if (obj2.hasOwnProperty(i)) {
            if (i in result) {
              continue;
            }
            result[i] = obj2[i];
          }

        }
        return result;
      };
    })
    .factory('SatellizerStorage', ['$window', '$log', 'SatellizerConfig', function($window, $log, config) {

      var store = {};

      // Check if localStorage or sessionStorage is available or enabled
      var isStorageAvailable = (function() {
        try {
          var supported = config.storageType in $window && $window[config.storageType] !== null;

          if (supported) {
            var key = Math.random().toString(36).substring(7);
            $window[config.storageType].setItem(key, '');
            $window[config.storageType].removeItem(key);
          }

          return supported;
        } catch (e) {
          return false;
        }
      })();

      if (!isStorageAvailable) {
        $log.warn(config.storageType + ' is not available.');
      }

      return {
        get: function(key) {
          return isStorageAvailable ? $window[config.storageType].getItem(key) : store[key];
        },
        set: function(key, value) {
          return isStorageAvailable ? $window[config.storageType].setItem(key, value) : store[key] = value;
        },
        remove: function(key) {
          return isStorageAvailable ? $window[config.storageType].removeItem(key): delete store[key];
        }
      };

    }])
    .factory('SatellizerInterceptor', [
      '$q',
      'SatellizerConfig',
      'SatellizerStorage',
      'SatellizerShared',
      function($q, config, storage, shared) {
        return {
          request: function(request) {
            if (request.skipAuthorization) {
              return request;
            }

            if (shared.isAuthenticated() && config.httpInterceptor(request)) {
              var tokenName = config.tokenPrefix ? config.tokenPrefix + '_' + config.tokenName : config.tokenName;
              var token = storage.get(tokenName);

              if (config.authHeader && config.authToken) {
                token = config.authToken + ' ' + token;
              }

              request.headers[config.authHeader] = token;
            }

            return request;
          },
          responseError: function(response) {
            return $q.reject(response);
          }
        };
      }])
    .config(['$httpProvider', function($httpProvider) {
      $httpProvider.interceptors.push('SatellizerInterceptor');
    }]);

})(window, window.angular);
