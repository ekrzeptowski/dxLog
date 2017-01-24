angular.module('dxLog').directive('chooseFile', function() {
    return {
        link: function(scope, elem, attrs) {
            var button = elem.find('button');
            var input = angular.element(elem[0].querySelector('input#fileInput'));

            button.bind('click', function() {
                input[0].click();
            });
        }
    };
});
