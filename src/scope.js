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
  this.$$children = [];
  this.$$root = this;
}

Scope.prototype.$watch = function(watchFn, listenerFn, valueEq) {
  var self = this;
  var watcher = {
    watchFn: watchFn,
    listenerFn: listenerFn || function() {},
    valueEq: !!valueEq
  };

  this.$$watchers.unshift(watcher);
  this.$$root.$$lastDirtyWatch = null;

  return function() {
    //Get index of watcher.
    var i = self.$$watchers.indexOf(watcher);
    if (i >= 0) {
      self.$$watchers.splice(i, 1);
    }
    self.$$root.$$lastDirtyWatch = null;
  };
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

Scope.prototype.$watchCollection = function(watchFn, listenerFn) {
  var self = this;
  var newValue;
  var oldValue;
  var changeCount = 0;

  var internalWatchFn = function(scope) {
    newValue = watchFn(scope);

    if (_.isObject(newValue)) {
      if (isArrayLike(newValue)) {
        if (!_.isArray(oldValue)) {
          changeCount++;
          oldValue = [];
        }
        if (oldValue.length !== newValue.length) {
          changeCount++;
          oldValue.length = newValue.length;
        }
        _.forEach(newValue, function(newItem, i) {
          if (!self.$$areEqual(newItem, oldValue[i], false)) {
            changeCount++;
            oldValue[i] = newItem;
          }
        });
      } else {
        if (!_.isObject(oldValue) || isArrayLike(oldValue)) {
          changeCount++;
          oldValue = {};
        }

        if (_.keys(oldValue).length !== _.keys(newValue).length) {
          changeCount++;
        }

        _.forOwn(newValue, function(value, key) {
          if (!self.$$areEqual(value, oldValue[key], false)) {
            changeCount++;
            oldValue[key] = value;
          }
        });
      }
    } else {
      if (!self.$$areEqual(newValue, oldValue, false)) {
        changeCount++;
      }
      oldValue = newValue;
    }
    return changeCount;
  };

  var internalListenerFn = function() {
    listenerFn(newValue, oldValue, self);
  };

  return this.$watch(internalWatchFn, internalListenerFn);
};

Scope.prototype.$$digestOnce = function() {
  var self = this;
  var continueRecursing = true;
  var newValue, oldValue, areEqual, dirty;

  this.$$everyScope(function(scope) {
    _.forEachRight(scope.$$watchers, function(watcher) {
      try {
        if (watcher) {
          newValue = watcher.watchFn(scope);
          oldValue = watcher.last;
          areEqual = scope.$$areEqual(newValue, oldValue, watcher.valueEq);
          if (!areEqual || !watcher.hasOwnProperty('last')) {
            self.$$root.$$lastDirtyWatch = watcher;
            watcher.listenerFn(newValue,
              ((!watcher.hasOwnProperty('last')) ? newValue : oldValue), scope);
            watcher.last = watcher.valueEq ? _.cloneDeep(newValue) : newValue;
            dirty = true;
          } else if (self.$$lastDirtyWatch === watcher) {
            continueRecursing = false;
            return false;
          }
        }
      } catch (e) {
        console.error(e);
      }
    });
    return continueRecursing;
  });
  return dirty;
};

Scope.prototype.$digest = function() {
  var ttl = 10;
  var dirty;
  this.$$root.$$lastDirtyWatch = null;

  this.$beginPhase('$digest');

  if (this.$$root.$$applyAsyncId) {
    clearTimeout(this.$$root.$$applyAsyncId);
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
    this.$$root.$digest();
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
        self.$$root.$digest();
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

  if (self.$$root.$$applyAsyncId === null) {
    self.$$root.$$applyAsyncId = setTimeout(function() {
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
  this.$$root.$$applyAsyncId = null;
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

Scope.prototype.$new = function(isolated, parent) {
  var child;
  var parent = parent || this;
  if (isolated) {
    child = new Scope();
    child.$$root = parent.$$root;
    child.$$asyncQueue = parent.$$asyncQueue;
    child.$$applyAsyncQueue = parent.$$applyAsyncQueue;
    // child.$$applyAsyncId = parent.$$applyAsyncId;
    child.$$postDigestQueue = parent.$$postDigestQueue;
  } else {
    var ChildScope = function() {};
    ChildScope.prototype = this;
    child = new ChildScope();
  }

  parent.$$children.push(child);
  child.$$watchers = [];
  child.$$children = [];
  child.$parent = parent;
  return child;
};

Scope.prototype.$destroy = function() {
  var self = this;

  if (self.$parent) {
    var siblings = self.$parent.$$children;
    var index = siblings.indexOf(this);
    if (index >= 0) {
      siblings.splice(index, 1);
    }
  }

  delete self.$$watchers;
};

Scope.prototype.$$areEqual = function(newValue, oldValue, valueEq) {
  if (valueEq) {
    return _.isEqual(newValue, oldValue);
  } else {
    return newValue === oldValue ||
      (newValue + '' === 'NaN' && oldValue + '' === 'NaN');
  }
};

function isArrayLike(obj) {
  var length;

  if (_.isNull(obj) || _.isUndefined(obj)) {
    return false;
  }
  length = obj.length;
  return _.isNumber(length);
}

Scope.prototype.$$everyScope = function(fn) {
  var result;
  if (fn(this)) {
    return this.$$children.every(function(child) {
      return child.$$everyScope(fn);
    });
  } else {
    return false;
  }
};

module.exports = Scope;
