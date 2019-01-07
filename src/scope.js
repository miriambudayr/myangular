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
      try {
        var asyncTask = this.$$asyncQueue.shift();
        asyncTask.scope.$eval(asyncTask.expression);
      } catch(e) {
        console.log(e);
      }
    }
    dirty = this.$$digestOnce();
    if ((dirty || this.$$asyncQueue.length) && !(ttl--)) {
      throw '10 digest iterations reached.';
    }
  } while (dirty || this.$$asyncQueue.length);

  while (this.$$postDigestQueue.length) {
    try {
      this.$$postDigestQueue.shift()();
    } catch(e) {
      console.log(e);
    }
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
    try {
      this.$$applyAsyncQueue.shift()();
    } catch(e) {
      console.log(e);
    }
  }
  this.$$applyAsyncId = null;
};


Scope.prototype.$watchGroup = function(arrayOfWatchFns, listenerFn) {
  var self = this;
  var oldValues = new Array(arrayOfWatchFns.length);
  var newValues = new Array(arrayOfWatchFns.length);
  var arrayOfRemovalFns = [];
  var changeReactionScheduled = false;
  var firstInvocation = true;

  if (arrayOfWatchFns.length === 0) {
    var shouldCall = true;
    self.$evalAsync(function() {
      if (shouldCall) {
        listenerFn(newValues, newValues, self);
      }
    });
    return function() {
      shouldCall = false;
    };
  }

  function watchGroupListener()  {
    if (firstInvocation) {
      firstInvocation = false;
      listenerFn(newValues, newValues, self);
    } else {
      listenerFn(newValues, oldValues, self);
    }
    changeReactionScheduled = false;
  }

  _.forEach(arrayOfWatchFns, function(watchFn, i) {
    var removalFn = self.$watch(watchFn, function(newValue, oldValue, scope) {
      oldValues[i] = oldValue;
      newValues[i] = newValue;
      if (!changeReactionScheduled) {
        changeReactionScheduled = true;
        self.$evalAsync(watchGroupListener);
      }
    });

    arrayOfRemovalFns.push(removalFn);
  });

  return function() {
    _.forEach(arrayOfRemovalFns, function(removalFn) {
      removalFn();
    });
  };
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

Scope.prototype.$new = function() {
  var ChildScope = function() {
    this.$$watchers = [];
  };
  ChildScope.prototype = this;
  var child = new ChildScope();
  return child;
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
