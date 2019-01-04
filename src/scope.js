'use strict';
var _ = require('lodash');

function Scope() {
  this.$$watchers = [];
  this.$$lastDirtyWatch = null;
  this.$$asyncQueue = [];
  this.$$phase = null;
  this.$$applyAsyncQueue = [];
  this.$$applyAsyncId = null;
  this.$$postDigestQueue = [];
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

  this.$beginPhase('$digest');

  if (this.$$applyAsyncId) {
    clearTimeout(this.$$applyAsyncId);
    this.$$flushApplyAsync();
  }

  do {
    while (this.$$asyncQueue.length) {
      var asyncTask = this.$$asyncQueue.shift();
      asyncTask.scope.$eval(asyncTask.expression);
    }
    dirty = this.$$digestOnce();
    if ((dirty || this.$$asyncQueue.length) && !(ttl--)) {
      throw '10 digest iterations reached.';
    }
  } while (dirty || this.$$asyncQueue.length);

  while (this.$$postDigestQueue.length) {
    this.$$postDigestQueue.shift()();
  }
  
  this.$clearPhase();
};

Scope.prototype.$apply = function(expr) {
  try {
    this.$beginPhase('$apply');
    this.$eval(expr);
  } finally {
    this.$clearPhase();
    this.$digest();
  }
};

Scope.prototype.$eval = function(expr, locals) {
  return expr(this, locals);
};

Scope.prototype.$evalAsync = function(expr) {
  var self = this;
  if (!self.$$phase && !self.$$asyncQueue.length) {
    setTimeout(function() {
      if (self.$$asyncQueue.length) {
        self.$digest();
      }
    }, 0);
  }
  this.$$asyncQueue.push({scope: this, expression: expr});
};

Scope.prototype.$applyAsync = function(expr) {
  var self = this;
  self.$$applyAsyncQueue.push(function() {
    self.$eval(expr);
  });

  if (self.$$applyAsyncId === null) {
    self.$$applyAsyncId = setTimeout(function() {
      self.$apply(self.$$flushApplyAsync.bind(self));
    }, 0);
  }
};

Scope.prototype.$$postDigest = function(expr) {
  var self = this;
  self.$$postDigestQueue.push(function() {
    self.$eval(expr);
  });
};

Scope.prototype.$$flushApplyAsync = function() {
  while (this.$$applyAsyncQueue.length) {
    this.$$applyAsyncQueue.shift()();
    this.$$applyAsyncId = null;
  }
};

Scope.prototype.$$areEqual = function(newValue, oldValue, valueEq) {
  if (valueEq) {
    return _.isEqual(newValue, oldValue);
  } else {
    return newValue === oldValue ||
      (newValue + '' === 'NaN' && oldValue + '' === 'NaN');
  }
};

Scope.prototype.$beginPhase = function(phase) {
  if (this.$$phase) {
    throw this.$$phase + 'already in progress.';
  }
  this.$$phase = phase;
};

Scope.prototype.$clearPhase = function() {
  this.$$phase = null;
};


module.exports = Scope;
