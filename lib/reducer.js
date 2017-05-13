'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

exports.default = undoable;

var _debug = require('./debug');

var debug = _interopRequireWildcard(_debug);

var _actions = require('./actions');

var _helpers = require('./helpers');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

// lengthWithoutFuture: get length of history
function lengthWithoutFuture(history) {
  return history.past.length + 1;
}

// mix in state with metadata about the action that produced it
function wrap(state, metadata) {
  return { state: state, metadata: metadata };
}

// helper for readability.
function unwrap(state) {
  return state;
}

// insert: insert `state` into history, which means adding the current state
//         into `past`, setting the new `state` as `present` and erasing
//         the `future`.
function insert(history, state, newMeta, limit) {
  debug.log('inserting', state);
  debug.log('new free: ', limit - lengthWithoutFuture(history));

  var past = history.past,
      _latestUnfiltered = history._latestUnfiltered,
      oldMeta = history.metadata;

  var historyOverflow = limit && lengthWithoutFuture(history) >= limit;

  var pastSliced = past.slice(historyOverflow ? 1 : 0);
  var newPast = _latestUnfiltered != null ? [].concat(_toConsumableArray(pastSliced), [wrap(_latestUnfiltered, oldMeta)]) : pastSliced;

  return {
    past: newPast,
    present: state,
    _latestUnfiltered: state,
    metadata: newMeta,
    redoMeta: null,
    future: []
  };
}

// undo: go back to the previous point in history
function undo(history) {
  var past = history.past,
      future = history.future,
      metadata = history.metadata,
      _latestUnfiltered = history._latestUnfiltered;


  if (past.length <= 0) return history;

  var newFuture = _latestUnfiltered != null ? [wrap(_latestUnfiltered, metadata)].concat(_toConsumableArray(future)) : future;

  var _unwrap = unwrap(past[past.length - 1]),
      newPresent = _unwrap.state,
      pastMeta = _unwrap.metadata;

  return {
    past: past.slice(0, past.length - 1), // remove last element from past
    present: newPresent, // set element as new present
    metadata: pastMeta,
    _latestUnfiltered: newPresent,
    redoMeta: null,
    future: newFuture
  };
}

// redo: go to the next point in history
function redo(history) {
  var past = history.past,
      future = history.future,
      presentMeta = history.metadata,
      _latestUnfiltered = history._latestUnfiltered;


  if (future.length <= 0) return history;

  var newPast = _latestUnfiltered != null ? [].concat(_toConsumableArray(past), [wrap(_latestUnfiltered, presentMeta)]) : past;

  var _unwrap2 = unwrap(future[0]),
      newPresent = _unwrap2.state,
      futureMeta = _unwrap2.metadata;

  return {
    future: future.slice(1, future.length), // remove element from future
    present: newPresent, // set element as new present
    metadata: futureMeta,
    redoMeta: futureMeta,
    _latestUnfiltered: newPresent,
    past: newPast
  };
}

// jumpToFuture: jump to requested index in future history
function jumpToFuture(history, index) {
  if (index === 0) return redo(history);
  if (index < 0 || index >= history.future.length) return history;

  var past = history.past,
      future = history.future,
      _latestUnfiltered = history._latestUnfiltered,
      metadata = history.metadata;

  var _unwrap3 = unwrap(future[index]),
      newPresent = _unwrap3.state,
      newMeta = _unwrap3.metadata;

  return {
    future: future.slice(index + 1),
    present: newPresent,
    _latestUnfiltered: newPresent,
    metadata: newMeta,
    redoMeta: null,
    past: past.concat([wrap(_latestUnfiltered, metadata)]).concat(future.slice(0, index))
  };
}

// jumpToPast: jump to requested index in past history
function jumpToPast(history, index) {
  if (index === history.past.length - 1) return undo(history);
  if (index < 0 || index >= history.past.length) return history;

  var past = history.past,
      future = history.future,
      _latestUnfiltered = history._latestUnfiltered,
      metadata = history.metadata;

  var _unwrap4 = unwrap(past[index]),
      newPresent = _unwrap4.state,
      newMeta = _unwrap4.metadata;

  return {
    future: past.slice(index + 1).concat([wrap(_latestUnfiltered, metadata)]).concat(future),
    present: newPresent,
    _latestUnfiltered: newPresent,
    metadata: newMeta,
    redoMeta: null,
    past: past.slice(0, index)
  };
}

// jump: jump n steps in the past or forward
function jump(history, n) {
  if (n > 0) return jumpToFuture(history, n - 1);
  if (n < 0) return jumpToPast(history, history.past.length + n);
  return history;
}

// createHistory
function createHistory(state, ignoreInitialState) {
  // ignoreInitialState essentially prevents the user from undoing to the
  // beginning, in the case that the undoable reducer handles initialization
  // in a way that can't be redone simply
  return ignoreInitialState ? {
    past: [],
    present: state,
    metadata: null,
    redoMeta: null,
    future: []
  } : {
    past: [],
    present: state,
    _latestUnfiltered: state,
    redoMeta: null,
    metadata: null,
    future: []
  };
}

// helper to dynamically match in the reducer's switch-case
function actionTypeAmongClearHistoryType(actionType, clearHistoryType) {
  return clearHistoryType.indexOf(actionType) > -1 ? actionType : !actionType;
}

// redux-undo higher order reducer
function undoable(reducer) {
  var rawConfig = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

  debug.set(rawConfig.debug);

  var config = {
    initTypes: (0, _helpers.parseActions)(rawConfig.initTypes, ['@@redux-undo/INIT']),
    limit: rawConfig.limit,
    filter: rawConfig.filter || function () {
      return true;
    },
    describe: rawConfig.describe || function () {
      return null;
    },
    collapse: rawConfig.collapse || false,
    undoType: rawConfig.undoType || _actions.ActionTypes.UNDO,
    redoType: rawConfig.redoType || _actions.ActionTypes.REDO,
    jumpToPastType: rawConfig.jumpToPastType || _actions.ActionTypes.JUMP_TO_PAST,
    jumpToFutureType: rawConfig.jumpToFutureType || _actions.ActionTypes.JUMP_TO_FUTURE,
    jumpType: rawConfig.jumpType || _actions.ActionTypes.JUMP,
    clearHistoryType: Array.isArray(rawConfig.clearHistoryType) ? rawConfig.clearHistoryType : [rawConfig.clearHistoryType || _actions.ActionTypes.CLEAR_HISTORY],
    neverSkipReducer: rawConfig.neverSkipReducer || false,
    ignoreInitialState: rawConfig.ignoreInitialState || false
  };

  return function () {
    for (var _len = arguments.length, slices = Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
      slices[_key - 2] = arguments[_key];
    }

    var state = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : config.history;
    var action = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

    debug.start(action, state);

    var history = state;
    if (!config.history) {
      debug.log('history is uninitialized');

      if (state === undefined) {
        history = config.history = createHistory.apply(undefined, [reducer(state, { type: '@@redux-undo/CREATE_HISTORY' }), config.ignoreInitialState].concat(slices));
        debug.log('do not initialize on probe actions');
      } else if ((0, _helpers.isHistory)(state)) {
        history = config.history = config.ignoreInitialState ? state : _extends({}, state, {
          _latestUnfiltered: state.present
        });
        debug.log('initialHistory initialized: initialState is a history', config.history);
      } else {
        history = config.history = createHistory(state);
        debug.log('initialHistory initialized: initialState is not a history', config.history);
      }
    }

    var skipReducer = function skipReducer(res) {
      return config.neverSkipReducer ? _extends({}, res, {
        present: reducer.apply(undefined, [res.present, action].concat(slices))
      }) : res;
    };

    var res = void 0;
    switch (action.type) {
      case undefined:
        return history;

      case config.undoType:
        res = undo(history);
        debug.log('perform undo');
        debug.end(res);
        return skipReducer(res);

      case config.redoType:
        res = redo(history);
        debug.log('perform redo');
        debug.end(res);
        return skipReducer(res);

      case config.jumpToPastType:
        res = jumpToPast(history, action.index);
        debug.log('perform jumpToPast to ' + action.index);
        debug.end(res);
        return skipReducer(res);

      case config.jumpToFutureType:
        res = jumpToFuture(history, action.index);
        debug.log('perform jumpToFuture to ' + action.index);
        debug.end(res);
        return skipReducer(res);

      case config.jumpType:
        res = jump(history, action.index);
        debug.log('perform jump to ' + action.index);
        debug.end(res);
        return skipReducer(res);

      case actionTypeAmongClearHistoryType(action.type, config.clearHistoryType):
        res = createHistory(history.present);
        debug.log('perform clearHistory');
        debug.end(res);
        return skipReducer(res);

      default:
        res = reducer.apply(undefined, [history.present, action].concat(slices));

        if (config.initTypes.some(function (actionType) {
          return actionType === action.type;
        })) {
          debug.log('reset history due to init action');
          debug.end(config.history);
          return config.history;
        }

        if (history.present === res) {
          // Don't handle this action. Do not call debug.end here,
          // because this action should not produce side effects to the console
          return history;
        }

        if (typeof config.filter === 'function' && !config.filter(action, res, history)) {
          // if filtering an action, merely update the present
          var nextState = _extends({}, history, {
            present: res,
            _latestUnfiltered: config.collapse ? res : history._latestUnfiltered
          });
          debug.log('filter prevented action, not storing it');
          debug.end(nextState);
          return nextState;
        } else {
          // If the action wasn't filtered, insert normally
          history = insert(history, res, config.describe(action), config.limit);

          debug.log('inserted new state into history');
          debug.end(history);
          return history;
        }
    }
  };
}