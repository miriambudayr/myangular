'use strict';
var _ = require('lodash');

function Scope() {
  this.$$watchers = [];
  this.$$lastDirtyWatch = null;
}

Scope.prototype.$watch = function(watchFn, listenerFn, valueEq) {
  var watcher = {
    watchFn: watchFn,
    listenerFn: listenerFn || function() {},
    valueEq: !!valueEq
  };

  this.$$watchers.push(watcher);
  //Reset the $$lastDirtyWatch property so no watches that are added during $digest cycles
  //are run.
  this.$$lastDirtyWatch = null;
};

Scope.prototype.$$digestOnce = function() {
  var self = this;
  var newValue, oldValue, areEqual, dirty;

  _.forEach(self.$$watchers, function(watcher) {
    newValue = watcher.watchFn(self);
    oldValue = watcher.last;
    areEqual = self.$$areEqual(newValue, oldValue, watcher.valueEq);
    if (!areEqual || !watcher.hasOwnProperty('last')) {
      watcher.listenerFn(newValue,
        ((!watcher.hasOwnProperty('last')) ? newValue : oldValue), self);
      watcher.last = watcher.valueEq ? _.cloneDeep(newValue) : newValue;
      self.$$lastDirtyWatch = watcher;
      dirty = true;
    } else {
      if (self.$$lastDirtyWatch === watcher) {
        return false;
      }
    }
  });

  return dirty;
};

Scope.prototype.$digest = function() {
  var ttl = 10;
  var dirty;
  this.$$lastDirtyWatch = null;

  do {
    dirty = this.$$digestOnce();
    if (dirty && !(ttl--)) {
      throw '10 digest iterations reached.';
    }
  } while (dirty);
};

Scope.prototype.$$areEqual = function(newValue, oldValue, valueEq) {
  if (valueEq) {
    return _.isEqual(newValue, oldValue);
  } else {
    return newValue === oldValue;
  }
};


module.exports = Scope;
