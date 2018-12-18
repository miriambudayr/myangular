'use strict';
var _ = require('lodash');

function Scope() {
  this.$$watchers = [];
}

Scope.prototype.$watch = function(watchFn, listenerFn) {
  var watcher = {
    watchFn: watchFn,
    listenerFn: listenerFn || function() {}
  };

  this.$$watchers.push(watcher);
};

Scope.prototype.$$digestOnce = function() {
  var self = this;
  var newValue, oldValue, dirty;

  _.forEach(this.$$watchers, function(watcher) {
    newValue = watcher.watchFn(self);
    oldValue = watcher.last;
    if (newValue !== oldValue || !watcher.hasOwnProperty('last')) {
      watcher.listenerFn(newValue,
        ((!watcher.hasOwnProperty('last')) ? newValue : oldValue), self);
      watcher.last = newValue;
      dirty = true;
    }
  });

  return dirty;
};

Scope.prototype.$digest = function() {
  var ttl = 10;
  var dirty;

  do {
    dirty = this.$$digestOnce();
    if (dirty && !(ttl--)) {
      throw '10 digest iterations reached.';
    }
  } while (dirty);
};


module.exports = Scope;
