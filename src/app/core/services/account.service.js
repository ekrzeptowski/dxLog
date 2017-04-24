'use strict';

export default function(app) {

    class AccountService {

        constructor($http) {
            'ngInject';

            this.$http = $http;
        }

        updateProfile(data) {
            return this.$http.put('/account', data);
        }
        changePassword(data) {
            return this.$http.put('/account', data);
        }
        deleteAccount() {
            return this.$http.delete('/account');
        }
        forgotPassword(data) {
            return this.$http.post('/forgot', data);
        }
        resetPassword(data) {
            return this.$http.post('/reset', data);
        }
    }

    app
        .service('Account', AccountService);
}
