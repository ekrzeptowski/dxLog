'use strict';

import footerTpl from './footer.html';

function footerComponent(AudioService, PagingService) {
    'ngInject';

    var directive = {
        restrict: 'E',
        templateUrl: footerTpl,
        controller: FooterController,
        controllerAs: 'footerCtrl',
        bindToController: true
    };

    return directive;

    function FooterController() {
        var vm = this;
        vm.file = AudioService.file;
        vm.paging = PagingService.paging;
        vm.removeAudio = function() {
            AudioService.reset();
            vm.file = AudioService.file;
        };
    }

}

export default footerComponent;
