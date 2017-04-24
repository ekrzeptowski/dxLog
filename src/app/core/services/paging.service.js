'use strict';

export default function(app) {

    class PagingService {
        constructor() {
            this.paging = {};
            this.paging["current"] = 1;
        }

        paging() {
            return this.paging;
        }

        newPaging(pages) {
            this.paging["pages"] = pages;
        }

        reset() {
            delete this.paging.pages;
        }
    }

    app
        .service('PagingService', PagingService);
}
