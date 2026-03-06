/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "../modules/interactions/assets/js/interactions-utils.js":
/*!***************************************************************!*\
  !*** ../modules/interactions/assets/js/interactions-utils.js ***!
  \***************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.config = void 0;
exports.extractAnimationId = extractAnimationId;
exports.extractInteractionId = extractInteractionId;
exports.getAnimateFunction = getAnimateFunction;
exports.getInViewFunction = getInViewFunction;
exports.getKeyframes = getKeyframes;
exports.parseAnimationName = parseAnimationName;
exports.parseInteractionsData = parseInteractionsData;
exports.waitForAnimateFunction = waitForAnimateFunction;
var _slicedToArray2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/slicedToArray */ "../node_modules/@babel/runtime/helpers/slicedToArray.js"));
var _window$ElementorInte;
var config = exports.config = ((_window$ElementorInte = window.ElementorInteractionsConfig) === null || _window$ElementorInte === void 0 ? void 0 : _window$ElementorInte.constants) || {
  defaultDuration: 300,
  defaultDelay: 0,
  slideDistance: 100,
  scaleStart: 0,
  ease: 'easeIn'
};
function getKeyframes(effect, type, direction) {
  var isIn = 'in' === type;
  var keyframes = {};
  if ('fade' === effect) {
    keyframes.opacity = isIn ? [0, 1] : [1, 0];
  }
  if ('scale' === effect) {
    keyframes.scale = isIn ? [config.scaleStart, 1] : [1, config.scaleStart];
  }
  if (direction) {
    var distance = config.slideDistance;
    var movement = {
      left: {
        x: isIn ? [-distance, 0] : [0, -distance]
      },
      right: {
        x: isIn ? [distance, 0] : [0, distance]
      },
      top: {
        y: isIn ? [-distance, 0] : [0, -distance]
      },
      bottom: {
        y: isIn ? [distance, 0] : [0, distance]
      }
    };
    Object.assign(keyframes, movement[direction]);
  }
  return keyframes;
}
function parseAnimationName(name) {
  var _name$split = name.split('-'),
    _name$split2 = (0, _slicedToArray2.default)(_name$split, 6),
    trigger = _name$split2[0],
    effect = _name$split2[1],
    type = _name$split2[2],
    direction = _name$split2[3],
    duration = _name$split2[4],
    delay = _name$split2[5];
  return {
    trigger: trigger,
    effect: effect,
    type: type,
    direction: direction || null,
    duration: duration ? parseInt(duration, 10) : config.defaultDuration,
    delay: delay ? parseInt(delay, 10) : config.defaultDelay
  };
}
function extractAnimationId(interaction) {
  var _interaction$animatio;
  if ('string' === typeof interaction) {
    return interaction;
  }
  if ('interaction-item' === (interaction === null || interaction === void 0 ? void 0 : interaction.$$type) && interaction !== null && interaction !== void 0 && interaction.value) {
    var _interaction$value = interaction.value,
      trigger = _interaction$value.trigger,
      animation = _interaction$value.animation;
    if ('animation-preset-props' === (animation === null || animation === void 0 ? void 0 : animation.$$type) && animation !== null && animation !== void 0 && animation.value) {
      var _timingConfig$value$d, _timingConfig$value, _timingConfig$value$d2, _timingConfig$value2;
      var _animation$value = animation.value,
        effect = _animation$value.effect,
        type = _animation$value.type,
        direction = _animation$value.direction,
        timingConfig = _animation$value.timing_config;
      var triggerVal = (trigger === null || trigger === void 0 ? void 0 : trigger.value) || 'load';
      var effectVal = (effect === null || effect === void 0 ? void 0 : effect.value) || 'fade';
      var typeVal = (type === null || type === void 0 ? void 0 : type.value) || 'in';
      var directionVal = (direction === null || direction === void 0 ? void 0 : direction.value) || '';
      var duration = (_timingConfig$value$d = timingConfig === null || timingConfig === void 0 || (_timingConfig$value = timingConfig.value) === null || _timingConfig$value === void 0 || (_timingConfig$value = _timingConfig$value.duration) === null || _timingConfig$value === void 0 ? void 0 : _timingConfig$value.value) !== null && _timingConfig$value$d !== void 0 ? _timingConfig$value$d : 300;
      var delay = (_timingConfig$value$d2 = timingConfig === null || timingConfig === void 0 || (_timingConfig$value2 = timingConfig.value) === null || _timingConfig$value2 === void 0 || (_timingConfig$value2 = _timingConfig$value2.delay) === null || _timingConfig$value2 === void 0 ? void 0 : _timingConfig$value2.value) !== null && _timingConfig$value$d2 !== void 0 ? _timingConfig$value$d2 : 0;
      return "".concat(triggerVal, "-").concat(effectVal, "-").concat(typeVal, "-").concat(directionVal, "-").concat(duration, "-").concat(delay);
    }
  }
  if (interaction !== null && interaction !== void 0 && (_interaction$animatio = interaction.animation) !== null && _interaction$animatio !== void 0 && _interaction$animatio.animation_id) {
    return interaction.animation.animation_id;
  }
  return null;
}
function extractInteractionId(interaction) {
  if ('interaction-item' === (interaction === null || interaction === void 0 ? void 0 : interaction.$$type) && interaction !== null && interaction !== void 0 && interaction.value) {
    var _interaction$value$in;
    return ((_interaction$value$in = interaction.value.interaction_id) === null || _interaction$value$in === void 0 ? void 0 : _interaction$value$in.value) || null;
  }
  return null;
}
function getAnimateFunction() {
  var _window$Motion;
  return 'undefined' !== typeof animate ? animate : (_window$Motion = window.Motion) === null || _window$Motion === void 0 ? void 0 : _window$Motion.animate;
}
function getInViewFunction() {
  var _window$Motion2;
  return 'undefined' !== typeof inView ? inView : (_window$Motion2 = window.Motion) === null || _window$Motion2 === void 0 ? void 0 : _window$Motion2.inView;
}
function waitForAnimateFunction(callback) {
  var maxAttempts = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 10;
  if (getAnimateFunction()) {
    callback();
    return;
  }
  if (maxAttempts > 0) {
    setTimeout(function () {
      return waitForAnimateFunction(callback, maxAttempts - 1);
    }, 100);
  }
}
function parseInteractionsData(data) {
  if ('string' === typeof data) {
    try {
      return JSON.parse(data);
    } catch (_unused) {
      return null;
    }
  }
  return data;
}

/***/ }),

/***/ "../node_modules/@babel/runtime/helpers/arrayLikeToArray.js":
/*!******************************************************************!*\
  !*** ../node_modules/@babel/runtime/helpers/arrayLikeToArray.js ***!
  \******************************************************************/
/***/ ((module) => {

function _arrayLikeToArray(r, a) {
  (null == a || a > r.length) && (a = r.length);
  for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];
  return n;
}
module.exports = _arrayLikeToArray, module.exports.__esModule = true, module.exports["default"] = module.exports;

/***/ }),

/***/ "../node_modules/@babel/runtime/helpers/arrayWithHoles.js":
/*!****************************************************************!*\
  !*** ../node_modules/@babel/runtime/helpers/arrayWithHoles.js ***!
  \****************************************************************/
/***/ ((module) => {

function _arrayWithHoles(r) {
  if (Array.isArray(r)) return r;
}
module.exports = _arrayWithHoles, module.exports.__esModule = true, module.exports["default"] = module.exports;

/***/ }),

/***/ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js":
/*!***********************************************************************!*\
  !*** ../node_modules/@babel/runtime/helpers/interopRequireDefault.js ***!
  \***********************************************************************/
/***/ ((module) => {

function _interopRequireDefault(e) {
  return e && e.__esModule ? e : {
    "default": e
  };
}
module.exports = _interopRequireDefault, module.exports.__esModule = true, module.exports["default"] = module.exports;

/***/ }),

/***/ "../node_modules/@babel/runtime/helpers/iterableToArrayLimit.js":
/*!**********************************************************************!*\
  !*** ../node_modules/@babel/runtime/helpers/iterableToArrayLimit.js ***!
  \**********************************************************************/
/***/ ((module) => {

function _iterableToArrayLimit(r, l) {
  var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
  if (null != t) {
    var e,
      n,
      i,
      u,
      a = [],
      f = !0,
      o = !1;
    try {
      if (i = (t = t.call(r)).next, 0 === l) {
        if (Object(t) !== t) return;
        f = !1;
      } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0);
    } catch (r) {
      o = !0, n = r;
    } finally {
      try {
        if (!f && null != t["return"] && (u = t["return"](), Object(u) !== u)) return;
      } finally {
        if (o) throw n;
      }
    }
    return a;
  }
}
module.exports = _iterableToArrayLimit, module.exports.__esModule = true, module.exports["default"] = module.exports;

/***/ }),

/***/ "../node_modules/@babel/runtime/helpers/nonIterableRest.js":
/*!*****************************************************************!*\
  !*** ../node_modules/@babel/runtime/helpers/nonIterableRest.js ***!
  \*****************************************************************/
/***/ ((module) => {

function _nonIterableRest() {
  throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
module.exports = _nonIterableRest, module.exports.__esModule = true, module.exports["default"] = module.exports;

/***/ }),

/***/ "../node_modules/@babel/runtime/helpers/slicedToArray.js":
/*!***************************************************************!*\
  !*** ../node_modules/@babel/runtime/helpers/slicedToArray.js ***!
  \***************************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var arrayWithHoles = __webpack_require__(/*! ./arrayWithHoles.js */ "../node_modules/@babel/runtime/helpers/arrayWithHoles.js");
var iterableToArrayLimit = __webpack_require__(/*! ./iterableToArrayLimit.js */ "../node_modules/@babel/runtime/helpers/iterableToArrayLimit.js");
var unsupportedIterableToArray = __webpack_require__(/*! ./unsupportedIterableToArray.js */ "../node_modules/@babel/runtime/helpers/unsupportedIterableToArray.js");
var nonIterableRest = __webpack_require__(/*! ./nonIterableRest.js */ "../node_modules/@babel/runtime/helpers/nonIterableRest.js");
function _slicedToArray(r, e) {
  return arrayWithHoles(r) || iterableToArrayLimit(r, e) || unsupportedIterableToArray(r, e) || nonIterableRest();
}
module.exports = _slicedToArray, module.exports.__esModule = true, module.exports["default"] = module.exports;

/***/ }),

/***/ "../node_modules/@babel/runtime/helpers/unsupportedIterableToArray.js":
/*!****************************************************************************!*\
  !*** ../node_modules/@babel/runtime/helpers/unsupportedIterableToArray.js ***!
  \****************************************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var arrayLikeToArray = __webpack_require__(/*! ./arrayLikeToArray.js */ "../node_modules/@babel/runtime/helpers/arrayLikeToArray.js");
function _unsupportedIterableToArray(r, a) {
  if (r) {
    if ("string" == typeof r) return arrayLikeToArray(r, a);
    var t = {}.toString.call(r).slice(8, -1);
    return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? arrayLikeToArray(r, a) : void 0;
  }
}
module.exports = _unsupportedIterableToArray, module.exports.__esModule = true, module.exports["default"] = module.exports;

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be in strict mode.
(() => {
"use strict";
/*!*********************************************************!*\
  !*** ../modules/interactions/assets/js/interactions.js ***!
  \*********************************************************/


var _interactionsUtils = __webpack_require__(/*! ./interactions-utils.js */ "../modules/interactions/assets/js/interactions-utils.js");
function scrollOutAnimation(element, transition, animConfig, keyframes, options, animateFunc, inViewFunc) {
  var viewOptions = {
    amount: 0.85,
    root: null
  };
  var resetKeyframes = (0, _interactionsUtils.getKeyframes)(animConfig.effect, 'in', animConfig.direction);
  animateFunc(element, resetKeyframes, {
    duration: 0
  });
  var stop = inViewFunc(element, function () {
    return function () {
      animateFunc(element, keyframes, options).then(function () {
        element.style.transition = transition;
      });
      if (false === animConfig.replay) {
        stop();
      }
    };
  }, viewOptions);
}
function scrollInAnimation(element, transition, animConfig, keyframes, options, animateFunc, inViewFunc) {
  var viewOptions = {
    amount: 0,
    root: null
  };
  var stop = inViewFunc(element, function () {
    animateFunc(element, keyframes, options).then(function () {
      element.style.transition = transition;
    });
    if (false === animConfig.replay) {
      stop();
    }
  }, viewOptions);
}
function defaultAnimation(element, transition, keyframes, options, animateFunc) {
  animateFunc(element, keyframes, options).then(function () {
    element.style.transition = transition;
  });
}
function applyAnimation(element, animConfig, animateFunc, inViewFunc) {
  var keyframes = (0, _interactionsUtils.getKeyframes)(animConfig.effect, animConfig.type, animConfig.direction);
  var options = {
    duration: animConfig.duration / 1000,
    delay: animConfig.delay / 1000,
    ease: _interactionsUtils.config.ease
  };

  // WHY - Transition can be set on elements but once it sets it destroys all animations, so we basically put it aside.
  var transition = element.style.transition;
  element.style.transition = 'none';
  if ('scrollOut' === animConfig.trigger) {
    scrollOutAnimation(element, transition, animConfig, keyframes, options, animateFunc, inViewFunc);
  } else if ('scrollIn' === animConfig.trigger) {
    scrollInAnimation(element, transition, animConfig, keyframes, options, animateFunc, inViewFunc);
  } else {
    defaultAnimation(element, transition, keyframes, options, animateFunc);
  }
}
function initInteractions() {
  (0, _interactionsUtils.waitForAnimateFunction)(function () {
    var animateFunc = (0, _interactionsUtils.getAnimateFunction)();
    var inViewFunc = (0, _interactionsUtils.getInViewFunction)();
    if (!inViewFunc || !animateFunc) {
      return;
    }
    var elements = document.querySelectorAll('[data-interactions]');
    elements.forEach(function (element) {
      var interactionsData = element.getAttribute('data-interactions');
      var parsedData = (0, _interactionsUtils.parseInteractionsData)(interactionsData);
      if (!parsedData || !Array.isArray(parsedData)) {
        return;
      }
      parsedData.forEach(function (interaction) {
        var animationName = (0, _interactionsUtils.extractAnimationId)(interaction);
        var animConfig = animationName && (0, _interactionsUtils.parseAnimationName)(animationName);
        if (animConfig) {
          applyAnimation(element, animConfig, animateFunc, inViewFunc);
        }
      });
    });
  });
}
if ('loading' === document.readyState) {
  document.addEventListener('DOMContentLoaded', initInteractions);
} else {
  initInteractions();
}
})();

/******/ })()
;
//# sourceMappingURL=interactions.js.map