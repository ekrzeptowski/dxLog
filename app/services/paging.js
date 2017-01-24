angular.module('dxLog').factory('PagingService', function() {
    var paging = {};
    paging["current"] = 1;

    return {
        newPaging: function(pages) {
            paging["pages"] = pages;
        },
        reset: function() {
            delete paging.pages;
        },
        paging: paging
    };
});
