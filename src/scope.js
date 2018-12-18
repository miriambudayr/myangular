'use strict';
var _ = require('lodash');

function Scope() {
  this.$$watchers = [];
}

Scope.prototype.$watch = function(watchFn, listenerFn) {
  var watcher = {
    watchFn: watchFn,
    listenerFn: listenerFn
  };

  this.$$watchers.push(watcher);
};

Scope.prototype.$digest = function() {
  var self = this;
  var newValue, oldValue;

  _.forEach(this.$$watchers, function(watcher) {
    newValue = watcher.watchFn(self);
    oldValue = watcher.last;
    if (newValue !== oldValue || !watcher.hasOwnProperty('last')) {
      watcher.listenerFn(newValue,
        ((!watcher.hasOwnProperty('last')) ? newValue : oldValue), self);
      watcher.last = newValue;
    }
  });
};


module.exports = Scope;
