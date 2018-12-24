'use strict';
var _ = require('lodash');

function Scope() {
  this.$$watchers = [];
  this.$$lastDirtyWatch = null;
}

Scope.prototype.$watch = function(watchFn, listenerFn, valueEq) {
  var self = this;
  var watcher = {
    watchFn: watchFn,
    listenerFn: listenerFn || function() {},
    valueEq: !!valueEq
  };

  self.$$watchers.unshift(watcher);
  self.$$lastDirtyWatch = null;

  return function() {
    //Get index of watcher.
    var i = self.$$watchers.indexOf(watcher);
    if (i >= 0) {
      self.$$watchers.splice(i, 1);
    }
    self.$$lastDirtyWatch = null;
  };
};

Scope.prototype.$$digestOnce = function() {
  var self = this;
  var newValue, oldValue, areEqual, dirty;

  _.forEachRight(self.$$watchers, function(watcher, i) {
    try {
      if (watcher) {
        newValue = watcher.watchFn(self);
        oldValue = watcher.last;
        areEqual = self.$$areEqual(newValue, oldValue, watcher.valueEq);
        if (!areEqual || !watcher.hasOwnProperty('last')) {
          self.$$lastDirtyWatch = watcher;
          watcher.listenerFn(newValue,
            ((!watcher.hasOwnProperty('last')) ? newValue : oldValue), self);
          watcher.last = watcher.valueEq ? _.cloneDeep(newValue) : newValue;
          dirty = true;
        } else {
          if (self.$$lastDirtyWatch === watcher) {
            return false;
          }
        }
      }
    } catch(e) {
      console.log(e);
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

Scope.prototype.$apply = function(expr) {
  try {
    this.$eval(expr);
  } finally {
    this.$digest();
  }
};

Scope.prototype.$eval = function(expr, locals) {
  return expr(this, locals);
};

Scope.prototype.$$areEqual = function(newValue, oldValue, valueEq) {
  if (valueEq) {
    return _.isEqual(newValue, oldValue);
  } else {
    return newValue === oldValue ||
      (newValue + '' === 'NaN' && oldValue + '' === 'NaN');
  }
};


module.exports = Scope;
