'use strict';

const shared = angular.module('core.shared', []);

import chooseFileDirective from './directives/choose-file/choose-file.directive';
import TransmitterMapDirective from './directives/transmitter-map/transmitter-map.directive';
import validationTestDirective from './directives/validation-test/validation-test.directive';

import round from './filters/round.filter';
import startFrom from './filters/startFrom.filter';

import constants from './services/constants';
import AccountService from './services/account.service';
import AudioService from './services/audio.service';
import ColorService from './services/color.service';
import PagingService from './services/paging.service';
import StationsService from './services/stations.service';
import storeFactory from './services/store.factory';
import resolverProvider from './services/resolver.provider';

chooseFileDirective(shared);
TransmitterMapDirective(shared);
validationTestDirective(shared);

round(shared);
startFrom(shared);

constants(shared);
AccountService(shared);
AudioService(shared);
ColorService(shared);
PagingService(shared);
StationsService(shared);
storeFactory(shared);
resolverProvider(shared);

export default shared;
