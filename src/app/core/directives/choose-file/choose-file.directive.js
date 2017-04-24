'use strict';

export default function(app) {

    app.directive('chooseFile', chooseFileDirective);

    function chooseFileDirective() {
        'ngInject';

        return {
            link: linkFn
        };

        function linkFn(scope, elem, attrs) {
            var button = elem.find('button');
            var input = angular.element(elem[0].querySelector('input#fileInput'));

            button.bind('click', function() {
                input[0].click();
            });
        }
    }
}
