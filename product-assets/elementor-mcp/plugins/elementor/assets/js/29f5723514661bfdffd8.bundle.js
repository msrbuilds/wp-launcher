"use strict";
(self["webpackChunkelementor"] = self["webpackChunkelementor"] || []).push([["app_modules_onboarding_assets_js_utils_modules_post-onboarding-tracker_js"],{

/***/ "../app/modules/onboarding/assets/js/utils/modules/click-tracker.js":
/*!**************************************************************************!*\
  !*** ../app/modules/onboarding/assets/js/utils/modules/click-tracker.js ***!
  \**************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
var _typeof = __webpack_require__(/*! @babel/runtime/helpers/typeof */ "../node_modules/@babel/runtime/helpers/typeof.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
var _defineProperty2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/defineProperty */ "../node_modules/@babel/runtime/helpers/defineProperty.js"));
var _classCallCheck2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/classCallCheck */ "../node_modules/@babel/runtime/helpers/classCallCheck.js"));
var _createClass2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/createClass */ "../node_modules/@babel/runtime/helpers/createClass.js"));
var _storageManager = _interopRequireWildcard(__webpack_require__(/*! ./storage-manager.js */ "../app/modules/onboarding/assets/js/utils/modules/storage-manager.js"));
var _eventDispatcher = _interopRequireDefault(__webpack_require__(/*! ./event-dispatcher.js */ "../app/modules/onboarding/assets/js/utils/modules/event-dispatcher.js"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (var _t in e) "default" !== _t && {}.hasOwnProperty.call(e, _t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t)) && (i.get || i.set) ? o(f, _t, i) : f[_t] = e[_t]); return f; })(e, t); }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { (0, _defineProperty2.default)(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
var ClickTracker = /*#__PURE__*/function () {
  function ClickTracker() {
    (0, _classCallCheck2.default)(this, ClickTracker);
    this.DEDUPLICATION_WINDOW_MS = 150;
    this.MAX_CLICKS = 3;
    this.lastClickTime = 0;
    this.lastClickElement = null;
    this.clickHandler = null;
    this.selectTimeoutWindow = 100;
    this.lastSelectClickTime = 0;
  }
  return (0, _createClass2.default)(ClickTracker, [{
    key: "setupClickTracking",
    value: function setupClickTracking() {
      var _this = this;
      if ('undefined' === typeof document) {
        return;
      }
      if (this.clickHandler) {
        return;
      }
      this.clickHandler = function (event) {
        _this.trackClick(event);
      };
      document.addEventListener('click', this.clickHandler, true);
    }
  }, {
    key: "trackClick",
    value: function trackClick(event) {
      var _target$tagName;
      var currentCount = _storageManager.default.getNumber(_storageManager.ONBOARDING_STORAGE_KEYS.POST_ONBOARDING_CLICK_COUNT);
      if (currentCount >= this.MAX_CLICKS) {
        return;
      }
      var target = event.target;
      if (!this.shouldTrackClick(target)) {
        return;
      }
      var currentTime = Date.now();
      var timeSinceLastClick = currentTime - this.lastClickTime;
      if (this.isDuplicateClick(target, timeSinceLastClick)) {
        return;
      }
      this.lastClickTime = currentTime;
      this.lastClickElement = target;
      if ('select' === ((_target$tagName = target.tagName) === null || _target$tagName === void 0 ? void 0 : _target$tagName.toLowerCase())) {
        this.lastSelectClickTime = currentTime;
      }
      var newCount = _storageManager.default.incrementNumber(_storageManager.ONBOARDING_STORAGE_KEYS.POST_ONBOARDING_CLICK_COUNT);
      var clickData = this.extractClickData(target);
      this.storeClickData(newCount, clickData);
      this.dispatchClickEvent(newCount);
      if (newCount >= this.MAX_CLICKS) {
        this.cleanup();
      }
    }
  }, {
    key: "shouldTrackClick",
    value: function shouldTrackClick(element) {
      var _element$tagName, _element$tagName2;
      if ('option' === ((_element$tagName = element.tagName) === null || _element$tagName === void 0 ? void 0 : _element$tagName.toLowerCase())) {
        return false;
      }
      if (element.closest('select') && 'select' !== ((_element$tagName2 = element.tagName) === null || _element$tagName2 === void 0 ? void 0 : _element$tagName2.toLowerCase())) {
        return false;
      }
      if (this.isWithinSelectTimeout(element)) {
        return false;
      }
      if (this.isSelectRelatedRecentClick(element)) {
        return false;
      }
      var excludedSelectors = ['.announcements-container', '.announcements-screen-overlay', '.announcements-screen', '.notifications-container', '.notifications-overlay', '.close-button'];
      for (var _i = 0, _excludedSelectors = excludedSelectors; _i < _excludedSelectors.length; _i++) {
        var selector = _excludedSelectors[_i];
        if (element.closest(selector)) {
          return false;
        }
      }
      return true;
    }
  }, {
    key: "isWithinSelectTimeout",
    value: function isWithinSelectTimeout(element) {
      if (!this.lastSelectClickTime) {
        return false;
      }
      var currentTime = Date.now();
      var timeSinceLastSelect = currentTime - this.lastSelectClickTime;
      if (timeSinceLastSelect <= this.selectTimeoutWindow) {
        var _element$tagName3;
        var isSelectElement = 'select' === ((_element$tagName3 = element.tagName) === null || _element$tagName3 === void 0 ? void 0 : _element$tagName3.toLowerCase());
        var isInSelectControl = !!element.closest('.elementor-control-input-wrapper select');
        if (isSelectElement || isInSelectControl) {
          return true;
        }
      }
      return false;
    }
  }, {
    key: "isSelectRelatedRecentClick",
    value: function isSelectRelatedRecentClick(element) {
      var _this$lastClickElemen, _element$tagName4;
      if (!this.lastClickElement || !this.lastClickTime) {
        return false;
      }
      var timeSinceLastClick = Date.now() - this.lastClickTime;
      if (timeSinceLastClick > 500) {
        return false;
      }
      var wasLastClickSelect = 'select' === ((_this$lastClickElemen = this.lastClickElement.tagName) === null || _this$lastClickElemen === void 0 ? void 0 : _this$lastClickElemen.toLowerCase());
      var isCurrentClickSelect = 'select' === ((_element$tagName4 = element.tagName) === null || _element$tagName4 === void 0 ? void 0 : _element$tagName4.toLowerCase());
      if (wasLastClickSelect && isCurrentClickSelect) {
        var lastSelectControl = this.lastClickElement.closest('.elementor-control');
        var currentSelectControl = element.closest('.elementor-control');
        if (lastSelectControl && currentSelectControl && lastSelectControl === currentSelectControl) {
          return true;
        }
      }
      return false;
    }
  }, {
    key: "isDuplicateClick",
    value: function isDuplicateClick(target, timeSinceLastClick) {
      var extendedWindow = this.shouldUseExtendedWindow(this.lastClickElement, target);
      var windowToUse = extendedWindow ? this.DEDUPLICATION_WINDOW_MS * 3 : this.DEDUPLICATION_WINDOW_MS;
      if (timeSinceLastClick > windowToUse) {
        return false;
      }
      if (!this.lastClickElement) {
        return false;
      }
      var isSameElement = this.lastClickElement === target;
      var isRelatedElement = this.areElementsRelated(this.lastClickElement, target);
      return isSameElement || isRelatedElement;
    }
  }, {
    key: "shouldUseExtendedWindow",
    value: function shouldUseExtendedWindow(element1, element2) {
      var _element1$tagName, _element2$tagName;
      if (!element1 || !element2) {
        return false;
      }
      var isElement1Select = 'select' === ((_element1$tagName = element1.tagName) === null || _element1$tagName === void 0 ? void 0 : _element1$tagName.toLowerCase());
      var isElement2Select = 'select' === ((_element2$tagName = element2.tagName) === null || _element2$tagName === void 0 ? void 0 : _element2$tagName.toLowerCase());
      return isElement1Select || isElement2Select;
    }
  }, {
    key: "areElementsRelated",
    value: function areElementsRelated(element1, element2) {
      if (!element1 || !element2) {
        return false;
      }
      var isSelectRelated = this.areSelectRelated(element1, element2);
      var isParentChild = element1.contains(element2) || element2.contains(element1);
      var shareCommonParent = element1.parentElement === element2.parentElement;
      var bothInSameControl = element1.closest('.elementor-control') === element2.closest('.elementor-control');
      return isSelectRelated || isParentChild || shareCommonParent || bothInSameControl;
    }
  }, {
    key: "areSelectRelated",
    value: function areSelectRelated(element1, element2) {
      var _element1$tagName2, _element2$tagName2, _element1$tagName3, _element2$tagName3;
      var isElement1Select = 'select' === ((_element1$tagName2 = element1.tagName) === null || _element1$tagName2 === void 0 ? void 0 : _element1$tagName2.toLowerCase());
      var isElement2Select = 'select' === ((_element2$tagName2 = element2.tagName) === null || _element2$tagName2 === void 0 ? void 0 : _element2$tagName2.toLowerCase());
      var isElement1Option = 'option' === ((_element1$tagName3 = element1.tagName) === null || _element1$tagName3 === void 0 ? void 0 : _element1$tagName3.toLowerCase());
      var isElement2Option = 'option' === ((_element2$tagName3 = element2.tagName) === null || _element2$tagName3 === void 0 ? void 0 : _element2$tagName3.toLowerCase());
      if (isElement1Select && isElement2Select && element1 === element2) {
        return true;
      }
      if (isElement1Select && isElement2Option || isElement1Option && isElement2Select) {
        return true;
      }
      var element1SelectParent = element1.closest('select');
      var element2SelectParent = element2.closest('select');
      if (element1SelectParent && element2SelectParent && element1SelectParent === element2SelectParent) {
        return true;
      }
      if (element1SelectParent && element1SelectParent === element2) {
        return true;
      }
      if (element2SelectParent && element2SelectParent === element1) {
        return true;
      }
      return false;
    }
  }, {
    key: "extractClickData",
    value: function extractClickData(element) {
      var title = this.findMeaningfulTitle(element);
      var selector = this.generateSelector(element);
      return {
        title: title.substring(0, 100),
        selector: selector
      };
    }
  }, {
    key: "findMeaningfulTitle",
    value: function findMeaningfulTitle(element) {
      var directTitle = this.extractTitleFromElement(element);
      if (directTitle && directTitle.trim().length > 0) {
        return directTitle.trim();
      }
      var currentElement = element.parentElement;
      var attempts = 0;
      var maxAttempts = 3;
      while (currentElement && attempts < maxAttempts) {
        var title = this.extractTitleFromElement(currentElement);
        if (title && title.trim().length > 0) {
          return title.trim();
        }
        currentElement = currentElement.parentElement;
        attempts++;
      }
      return this.generateFallbackTitle(element);
    }
  }, {
    key: "extractTitleFromElement",
    value: function extractTitleFromElement(element) {
      var _element$tagName5, _element$textContent, _element$tagName6, _element$innerText, _element$querySelecto, _element$querySelecto2, _element$querySelecto3;
      var controlFieldContainer = element.closest('.elementor-control-field');
      if (controlFieldContainer) {
        var labelElement = controlFieldContainer.querySelector('label');
        if (labelElement && labelElement.textContent) {
          return labelElement.textContent.trim();
        }
      }
      var sources = [element.getAttribute('placeholder'), element.getAttribute('aria-label'), element.title, element.getAttribute('data-title'), 'select' === ((_element$tagName5 = element.tagName) === null || _element$tagName5 === void 0 ? void 0 : _element$tagName5.toLowerCase()) ? '' : (_element$textContent = element.textContent) === null || _element$textContent === void 0 ? void 0 : _element$textContent.trim(), 'select' === ((_element$tagName6 = element.tagName) === null || _element$tagName6 === void 0 ? void 0 : _element$tagName6.toLowerCase()) ? '' : (_element$innerText = element.innerText) === null || _element$innerText === void 0 ? void 0 : _element$innerText.trim(), (_element$querySelecto = element.querySelector('.elementor-widget-title')) === null || _element$querySelecto === void 0 || (_element$querySelecto = _element$querySelecto.textContent) === null || _element$querySelecto === void 0 ? void 0 : _element$querySelecto.trim(), (_element$querySelecto2 = element.querySelector('.elementor-heading-title')) === null || _element$querySelecto2 === void 0 || (_element$querySelecto2 = _element$querySelecto2.textContent) === null || _element$querySelecto2 === void 0 ? void 0 : _element$querySelecto2.trim(), (_element$querySelecto3 = element.querySelector('.elementor-button-text')) === null || _element$querySelecto3 === void 0 || (_element$querySelecto3 = _element$querySelecto3.textContent) === null || _element$querySelecto3 === void 0 ? void 0 : _element$querySelecto3.trim()];
      for (var _i2 = 0, _sources = sources; _i2 < _sources.length; _i2++) {
        var source = _sources[_i2];
        if (source && source.length > 0 && source !== 'undefined') {
          return source;
        }
      }
      return '';
    }
  }, {
    key: "generateFallbackTitle",
    value: function generateFallbackTitle(element) {
      var _element$tagName7;
      var tagName = ((_element$tagName7 = element.tagName) === null || _element$tagName7 === void 0 ? void 0 : _element$tagName7.toLowerCase()) || 'element';
      var className = element.className || '';
      if (className.includes('eicon-')) {
        var iconClass = className.split(' ').find(function (cls) {
          return cls.startsWith('eicon-');
        });
        if (iconClass) {
          return iconClass.replace('eicon-', '').replace('-', ' ');
        }
      }
      if (className.includes('elementor-button')) {
        return 'Elementor Button';
      }
      if (className.includes('elementor-widget')) {
        return 'Elementor Widget';
      }
      return "".concat(tagName, " element");
    }
  }, {
    key: "generateSelector",
    value: function generateSelector(element) {
      var selectorParts = [];
      var currentElement = element;
      for (var i = 0; i < 4 && currentElement && currentElement !== document.body; i++) {
        var selector = currentElement.tagName.toLowerCase();
        if (0 === i && currentElement.id) {
          selector += "#".concat(currentElement.id);
        } else if (currentElement.classList.length > 0) {
          var classes = Array.from(currentElement.classList).slice(0, 3);
          selector += ".".concat(classes.join('.'));
        }
        selectorParts.unshift(selector);
        currentElement = currentElement.parentElement;
      }
      return selectorParts.join(' > ');
    }
  }, {
    key: "storeClickData",
    value: function storeClickData(clickCount, clickData) {
      var dataKey = "elementor_onboarding_click_".concat(clickCount, "_data");
      var dataToStore = _objectSpread(_objectSpread({}, clickData), {}, {
        timestamp: Date.now(),
        clickCount: clickCount
      });
      _storageManager.default.setObject(dataKey, dataToStore);
    }
  }, {
    key: "getStoredClickData",
    value: function getStoredClickData(clickCount) {
      var dataKey = "elementor_onboarding_click_".concat(clickCount, "_data");
      return _storageManager.default.getObject(dataKey);
    }
  }, {
    key: "dispatchClickEvent",
    value: function dispatchClickEvent(clickCount) {
      var storedClickData = this.getStoredClickData(clickCount);
      if (!storedClickData) {
        return;
      }
      var siteStarterChoiceString = _storageManager.default.getString(_storageManager.ONBOARDING_STORAGE_KEYS.STEP4_SITE_STARTER_CHOICE);
      var siteStarterChoice = null;
      if (siteStarterChoiceString) {
        var choiceData = _storageManager.default.getObject(_storageManager.ONBOARDING_STORAGE_KEYS.STEP4_SITE_STARTER_CHOICE);
        siteStarterChoice = (choiceData === null || choiceData === void 0 ? void 0 : choiceData.site_starter) || null;
      }
      _eventDispatcher.default.dispatchClickEvent(clickCount, storedClickData, siteStarterChoice);
    }
  }, {
    key: "cleanup",
    value: function cleanup() {
      if (this.clickHandler) {
        document.removeEventListener('click', this.clickHandler, true);
        this.clickHandler = null;
      }
      this.lastSelectClickTime = 0;
      _storageManager.default.clearAllOnboardingData();
      _storageManager.default.clearExperimentData();
    }
  }]);
}();
var clickTracker = new ClickTracker();
var _default = exports["default"] = clickTracker;

/***/ }),

/***/ "../app/modules/onboarding/assets/js/utils/modules/event-dispatcher.js":
/*!*****************************************************************************!*\
  !*** ../app/modules/onboarding/assets/js/utils/modules/event-dispatcher.js ***!
  \*****************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.ONBOARDING_STEP_NAMES = exports.ONBOARDING_EVENTS_MAP = void 0;
exports.addTimeSpentToPayload = addTimeSpentToPayload;
exports.canSendEvents = canSendEvents;
exports.createEditorEventPayload = createEditorEventPayload;
exports.createEventPayload = createEventPayload;
exports.createStepEventPayload = createStepEventPayload;
exports["default"] = void 0;
exports.dispatch = dispatch;
exports.dispatchClickEvent = dispatchClickEvent;
exports.dispatchEditorEvent = dispatchEditorEvent;
exports.dispatchIfAllowed = dispatchIfAllowed;
exports.dispatchStepEvent = dispatchStepEvent;
exports.dispatchVariantAwareEvent = dispatchVariantAwareEvent;
exports.formatClickAction = formatClickAction;
exports.getClickEventName = getClickEventName;
exports.getClickNumber = getClickNumber;
exports.initializeAndEnableTracking = initializeAndEnableTracking;
exports.isEventsManagerAvailable = isEventsManagerAvailable;
var _defineProperty2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/defineProperty */ "../node_modules/@babel/runtime/helpers/defineProperty.js"));
var _mixpanelBrowser = _interopRequireDefault(__webpack_require__(/*! mixpanel-browser */ "../node_modules/mixpanel-browser/dist/mixpanel.module.js"));
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { (0, _defineProperty2.default)(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
var ONBOARDING_EVENTS_MAP = exports.ONBOARDING_EVENTS_MAP = {
  UPGRADE_NOW_S3: 'core_onboarding_s3_upgrade_now',
  THEME_INSTALLED: 'core_onboarding_s2_theme_installed',
  THEME_MARKED: 'core_onboarding_s2_theme_marked',
  CORE_ONBOARDING: 'core_onboarding',
  CONNECT_STATUS: 'core_onboarding_connect_status',
  STEP1_END_STATE: 'core_onboarding_s1_end_state',
  STEP2_END_STATE: 'core_onboarding_s2_end_state',
  STEP2_THEMES_LOADED: 'core_onboarding_s2_themes_loaded',
  STEP3_END_STATE: 'core_onboarding_s3_end_state',
  STEP4_END_STATE: 'core_onboarding_s4_end_state',
  STEP4_LOADED: 'core_onboarding_s4_loaded',
  STEP4_SITE_STARTER: 'core_onboarding_s4_site_starter',
  STEP4_RETURN_STEP4: 'core_onboarding_s4_return',
  EDITOR_LOADED_FROM_ONBOARDING: 'editor_loaded_from_onboarding',
  POST_ONBOARDING_1ST_CLICK: 'post_onboarding_1st_click',
  POST_ONBOARDING_2ND_CLICK: 'post_onboarding_2nd_click',
  POST_ONBOARDING_3RD_CLICK: 'post_onboarding_3rd_click',
  EXIT: 'core_onboarding_exit',
  SKIP: 'core_onboarding_skip',
  TOP_UPGRADE: 'core_onboarding_top_upgrade',
  CREATE_MY_ACCOUNT: 'core_onboarding_s1_create_my_account',
  CREATE_ACCOUNT_STATUS: 'core_onboarding_create_account_status',
  STEP1_CLICKED_CONNECT: 'core_onboarding_s1_clicked_connect',
  AB_101_START_AS_FREE_USER: 'ab_101_start_as_free_user',
  SESSION_REPLAY_START: 'onboarding_session_replay_start'
};
var ONBOARDING_STEP_NAMES = exports.ONBOARDING_STEP_NAMES = {
  CONNECT: 'connect',
  HELLO_BIZ: 'hello_biz',
  PRO_FEATURES: 'pro_features',
  SITE_STARTER: 'site_starter',
  SITE_NAME: 'site_name',
  SITE_LOGO: 'site_logo',
  ONBOARDING_START: 'onboarding_start'
};
function canSendEvents() {
  var _elementorCommon;
  return ((_elementorCommon = elementorCommon) === null || _elementorCommon === void 0 || (_elementorCommon = _elementorCommon.config) === null || _elementorCommon === void 0 || (_elementorCommon = _elementorCommon.editor_events) === null || _elementorCommon === void 0 ? void 0 : _elementorCommon.can_send_events) || false;
}
function isEventsManagerAvailable() {
  var _elementorCommon2;
  return ((_elementorCommon2 = elementorCommon) === null || _elementorCommon2 === void 0 ? void 0 : _elementorCommon2.eventsManager) && 'function' === typeof elementorCommon.eventsManager.dispatchEvent;
}
function isMixpanelInitialized() {
  if ('undefined' === typeof _mixpanelBrowser.default || !_mixpanelBrowser.default) {
    return false;
  }
  try {
    var distinctId = _mixpanelBrowser.default.get_distinct_id();
    return distinctId !== undefined && distinctId !== null;
  } catch (error) {
    return false;
  }
}
function initializeAndEnableTracking() {
  if (!isEventsManagerAvailable()) {
    return;
  }
  if (!isMixpanelInitialized()) {
    elementorCommon.eventsManager.initializeMixpanel();
  }
  if (!elementorCommon.eventsManager.trackingEnabled) {
    elementorCommon.eventsManager.enableTracking();
  }
}
function dispatch(eventName) {
  var payload = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  if (!isEventsManagerAvailable()) {
    return false;
  }
  if (!canSendEvents()) {
    return false;
  }
  try {
    var result = elementorCommon.eventsManager.dispatchEvent(eventName, payload);
    return result;
  } catch (error) {
    return false;
  }
}
function dispatchIfAllowed(eventName) {
  var payload = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  if (canSendEvents()) {
    return dispatch(eventName, payload);
  }
  return false;
}
function createEventPayload() {
  var basePayload = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  return _objectSpread({
    location: 'plugin_onboarding'
  }, basePayload);
}
function createStepEventPayload(stepNumber, stepName) {
  var additionalData = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  var basePayload = _objectSpread({
    step_number: stepNumber,
    step_name: stepName
  }, additionalData);
  return createEventPayload(basePayload);
}
function createEditorEventPayload() {
  var additionalData = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var basePayload = _objectSpread({
    location: 'editor'
  }, additionalData);
  return basePayload;
}
function dispatchStepEvent(eventName, stepNumber, stepName) {
  var additionalData = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
  var payload = createStepEventPayload(stepNumber, stepName, additionalData);
  return dispatch(eventName, payload);
}
function dispatchVariantAwareEvent(eventName, payload) {
  return dispatch(eventName, payload);
}
function dispatchEditorEvent(eventName) {
  var additionalData = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  var payload = createEditorEventPayload(additionalData);
  return dispatch(eventName, payload);
}
function getClickEventName(clickCount) {
  var eventMap = {
    1: ONBOARDING_EVENTS_MAP.POST_ONBOARDING_1ST_CLICK,
    2: ONBOARDING_EVENTS_MAP.POST_ONBOARDING_2ND_CLICK,
    3: ONBOARDING_EVENTS_MAP.POST_ONBOARDING_3RD_CLICK
  };
  return eventMap[clickCount] || null;
}
function formatClickAction(title, selector) {
  if (!title && !selector) {
    return '';
  }
  if (!title) {
    return selector;
  }
  if (!selector) {
    return title;
  }
  return "".concat(title, " / ").concat(selector);
}
function dispatchClickEvent(clickCount, clickData) {
  var siteStarterChoice = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
  var eventName = getClickEventName(clickCount);
  if (!eventName) {
    return false;
  }
  var clickNumber = getClickNumber(clickCount);
  var eventData = createEditorEventPayload({
    editor_loaded_from_onboarding_source: siteStarterChoice
  });
  var formattedAction = formatClickAction(clickData.title, clickData.selector);
  eventData["post_onboarding_".concat(clickNumber, "_click_action")] = formattedAction;
  return dispatch(eventName, eventData);
}
function getClickNumber(clickCount) {
  var clickNumbers = {
    1: 'first',
    2: 'second',
    3: 'third'
  };
  return clickNumbers[clickCount] || 'unknown';
}
function addTimeSpentToPayload(payload, totalTimeSpent) {
  var stepTimeSpent = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
  if (totalTimeSpent !== null && totalTimeSpent !== undefined) {
    payload.time_spent = "".concat(totalTimeSpent, "s");
  }
  if (stepTimeSpent !== null && stepTimeSpent !== undefined) {
    payload.step_time_spent = "".concat(stepTimeSpent, "s");
  }
  return payload;
}
var EventDispatcher = {
  canSendEvents: canSendEvents,
  isEventsManagerAvailable: isEventsManagerAvailable,
  initializeAndEnableTracking: initializeAndEnableTracking,
  dispatch: dispatch,
  dispatchIfAllowed: dispatchIfAllowed,
  createEventPayload: createEventPayload,
  createStepEventPayload: createStepEventPayload,
  createEditorEventPayload: createEditorEventPayload,
  dispatchStepEvent: dispatchStepEvent,
  dispatchVariantAwareEvent: dispatchVariantAwareEvent,
  dispatchEditorEvent: dispatchEditorEvent,
  getClickEventName: getClickEventName,
  dispatchClickEvent: dispatchClickEvent,
  getClickNumber: getClickNumber,
  addTimeSpentToPayload: addTimeSpentToPayload
};
var _default = exports["default"] = EventDispatcher;

/***/ }),

/***/ "../app/modules/onboarding/assets/js/utils/modules/post-onboarding-tracker.js":
/*!************************************************************************************!*\
  !*** ../app/modules/onboarding/assets/js/utils/modules/post-onboarding-tracker.js ***!
  \************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
var _typeof = __webpack_require__(/*! @babel/runtime/helpers/typeof */ "../node_modules/@babel/runtime/helpers/typeof.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
var _classCallCheck2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/classCallCheck */ "../node_modules/@babel/runtime/helpers/classCallCheck.js"));
var _createClass2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/createClass */ "../node_modules/@babel/runtime/helpers/createClass.js"));
var _storageManager = _interopRequireWildcard(__webpack_require__(/*! ./storage-manager.js */ "../app/modules/onboarding/assets/js/utils/modules/storage-manager.js"));
var _eventDispatcher = _interopRequireDefault(__webpack_require__(/*! ./event-dispatcher.js */ "../app/modules/onboarding/assets/js/utils/modules/event-dispatcher.js"));
var _clickTracker = _interopRequireDefault(__webpack_require__(/*! ./click-tracker.js */ "../app/modules/onboarding/assets/js/utils/modules/click-tracker.js"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (var _t in e) "default" !== _t && {}.hasOwnProperty.call(e, _t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t)) && (i.get || i.set) ? o(f, _t, i) : f[_t] = e[_t]); return f; })(e, t); }
var PostOnboardingTracker = /*#__PURE__*/function () {
  function PostOnboardingTracker() {
    (0, _classCallCheck2.default)(this, PostOnboardingTracker);
  }
  return (0, _createClass2.default)(PostOnboardingTracker, [{
    key: "checkAndSendEditorLoadedFromOnboarding",
    value: function checkAndSendEditorLoadedFromOnboarding() {
      var siteStarterChoiceString = _storageManager.default.getString(_storageManager.ONBOARDING_STORAGE_KEYS.STEP4_SITE_STARTER_CHOICE);
      if (!siteStarterChoiceString) {
        return;
      }
      var alreadyTracked = _storageManager.default.exists(_storageManager.ONBOARDING_STORAGE_KEYS.EDITOR_LOAD_TRACKED);
      if (alreadyTracked) {
        this.setupPostOnboardingClickTracking();
        return;
      }
      this.sendEditorLoadedEvent();
      _storageManager.default.setString(_storageManager.ONBOARDING_STORAGE_KEYS.EDITOR_LOAD_TRACKED, 'true');
      this.setupPostOnboardingClickTracking();
    }
  }, {
    key: "sendEditorLoadedEvent",
    value: function sendEditorLoadedEvent() {
      var choiceData = _storageManager.default.getObject(_storageManager.ONBOARDING_STORAGE_KEYS.STEP4_SITE_STARTER_CHOICE);
      var siteStarterChoice = choiceData === null || choiceData === void 0 ? void 0 : choiceData.site_starter;
      if (!siteStarterChoice) {
        return;
      }
      var canDispatch = _eventDispatcher.default.canSendEvents();
      if (canDispatch) {
        _eventDispatcher.default.dispatchEditorEvent('editor_loaded_from_onboarding', {
          editor_loaded_from_onboarding_source: siteStarterChoice
        });
      }
    }
  }, {
    key: "setupPostOnboardingClickTracking",
    value: function setupPostOnboardingClickTracking() {
      var hasOnboardingData = _storageManager.default.exists(_storageManager.ONBOARDING_STORAGE_KEYS.STEP4_SITE_STARTER_CHOICE);
      if (!hasOnboardingData) {
        return;
      }
      var currentCount = _storageManager.default.getNumber(_storageManager.ONBOARDING_STORAGE_KEYS.POST_ONBOARDING_CLICK_COUNT);
      if (currentCount >= _clickTracker.default.MAX_CLICKS) {
        return;
      }
      _clickTracker.default.setupClickTracking();
    }
  }, {
    key: "cleanupPostOnboardingTracking",
    value: function cleanupPostOnboardingTracking() {
      _clickTracker.default.cleanup();
    }
  }, {
    key: "clearAllOnboardingStorage",
    value: function clearAllOnboardingStorage() {
      _storageManager.default.clearAllOnboardingData();
      _storageManager.default.clearExperimentData();
    }
  }]);
}();
var postOnboardingTracker = new PostOnboardingTracker();
var _default = exports["default"] = postOnboardingTracker;

/***/ }),

/***/ "../app/modules/onboarding/assets/js/utils/modules/storage-manager.js":
/*!****************************************************************************!*\
  !*** ../app/modules/onboarding/assets/js/utils/modules/storage-manager.js ***!
  \****************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.ONBOARDING_STORAGE_KEYS = void 0;
exports.appendToArray = appendToArray;
exports.clearAllOnboardingData = clearAllOnboardingData;
exports.clearExperimentData = clearExperimentData;
exports.clearMultiple = clearMultiple;
exports.clearStepStartTime = clearStepStartTime;
exports["default"] = void 0;
exports.exists = exists;
exports.getArray = getArray;
exports.getNumber = getNumber;
exports.getObject = getObject;
exports.getStepStartTime = getStepStartTime;
exports.getString = getString;
exports.incrementNumber = incrementNumber;
exports.remove = remove;
exports.setNumber = setNumber;
exports.setObject = setObject;
exports.setStepStartTime = setStepStartTime;
exports.setString = setString;
var _typeof2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/typeof */ "../node_modules/@babel/runtime/helpers/typeof.js"));
var ONBOARDING_STORAGE_KEYS = exports.ONBOARDING_STORAGE_KEYS = {
  START_TIME: 'elementor_onboarding_start_time',
  INITIATED: 'elementor_onboarding_initiated',
  STEP1_ACTIONS: 'elementor_onboarding_step1_actions',
  STEP2_ACTIONS: 'elementor_onboarding_step2_actions',
  STEP3_ACTIONS: 'elementor_onboarding_step3_actions',
  STEP4_ACTIONS: 'elementor_onboarding_step4_actions',
  STEP1_START_TIME: 'elementor_onboarding_s1_start_time',
  STEP2_START_TIME: 'elementor_onboarding_s2_start_time',
  STEP3_START_TIME: 'elementor_onboarding_s3_start_time',
  STEP4_START_TIME: 'elementor_onboarding_s4_start_time',
  STEP4_SITE_STARTER_CHOICE: 'elementor_onboarding_s4_site_starter_choice',
  STEP4_HAS_PREVIOUS_CLICK: 'elementor_onboarding_s4_has_previous_click',
  EDITOR_LOAD_TRACKED: 'elementor_onboarding_editor_load_tracked',
  POST_ONBOARDING_CLICK_COUNT: 'elementor_onboarding_click_count',
  PENDING_SKIP: 'elementor_onboarding_pending_skip',
  PENDING_CONNECT_STATUS: 'elementor_onboarding_pending_connect_status',
  PENDING_CREATE_ACCOUNT_STATUS: 'elementor_onboarding_pending_create_account_status',
  PENDING_CREATE_MY_ACCOUNT: 'elementor_onboarding_pending_create_my_account',
  PENDING_TOP_UPGRADE: 'elementor_onboarding_pending_top_upgrade',
  PENDING_TOP_UPGRADE_NO_CLICK: 'elementor_onboarding_pending_top_upgrade_no_click',
  PENDING_STEP1_CLICKED_CONNECT: 'elementor_onboarding_pending_step1_clicked_connect',
  PENDING_STEP1_END_STATE: 'elementor_onboarding_pending_step1_end_state',
  PENDING_EXIT: 'elementor_onboarding_pending_exit',
  PENDING_AB_101_START_AS_FREE_USER: 'elementor_onboarding_pending_ab_101_start_as_free_user',
  PENDING_TOP_UPGRADE_MOUSEOVER: 'elementor_onboarding_pending_top_upgrade_mouseover',
  EXPERIMENT101_VARIANT: 'elementor_onboarding_experiment101_variant',
  EXPERIMENT101_STARTED: 'elementor_onboarding_experiment101_started',
  EXPERIMENT202_VARIANT: 'elementor_onboarding_experiment202_variant',
  EXPERIMENT202_STARTED: 'elementor_onboarding_experiment202_started',
  EXPERIMENT401_VARIANT: 'elementor_onboarding_experiment401_variant',
  EXPERIMENT401_STARTED: 'elementor_onboarding_experiment401_started',
  EXPERIMENT402_VARIANT: 'elementor_onboarding_experiment402_variant',
  EXPERIMENT402_STARTED: 'elementor_onboarding_experiment402_started',
  PENDING_EXPERIMENT_DATA: 'elementor_onboarding_pending_experiment_data',
  STEP1_END_STATE_SENT: 'elementor_onboarding_step1_end_state_sent',
  STEP2_END_STATE_SENT: 'elementor_onboarding_step2_end_state_sent',
  STEP3_END_STATE_SENT: 'elementor_onboarding_step3_end_state_sent',
  STEP4_END_STATE_SENT: 'elementor_onboarding_step4_end_state_sent',
  STEP2_THEMES_LOADED_SENT: 'elementor_onboarding_step2_themes_loaded_sent'
};
function getString(key) {
  return localStorage.getItem(key);
}
function setString(key, value) {
  localStorage.setItem(key, value);
}
function remove(key) {
  localStorage.removeItem(key);
}
function getObject(key) {
  var storedString = getString(key);
  if (!storedString) {
    return null;
  }
  try {
    var parsed = JSON.parse(storedString);
    if (parsed && 'object' === (0, _typeof2.default)(parsed)) {
      return parsed;
    }
    return null;
  } catch (error) {
    remove(key);
    return null;
  }
}
function setObject(key, value) {
  try {
    var jsonString = JSON.stringify(value);
    setString(key, jsonString);
    return true;
  } catch (error) {
    return false;
  }
}
function getArray(key) {
  var storedArray = getObject(key);
  return Array.isArray(storedArray) ? storedArray : [];
}
function appendToArray(key, item) {
  var existingArray = getArray(key);
  existingArray.push(item);
  return setObject(key, existingArray);
}
function getNumber(key) {
  var defaultValue = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
  var storedString = getString(key);
  if (!storedString) {
    return defaultValue;
  }
  var parsed = parseInt(storedString, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}
function setNumber(key, value) {
  setString(key, value.toString());
}
function incrementNumber(key) {
  var increment = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;
  var currentValue = getNumber(key);
  var newValue = currentValue + increment;
  setNumber(key, newValue);
  return newValue;
}
function exists(key) {
  return getString(key) !== null;
}
function clearMultiple(keys) {
  keys.forEach(function (key) {
    return remove(key);
  });
}
function clearAllOnboardingData() {
  var keysToRemove = [ONBOARDING_STORAGE_KEYS.START_TIME, ONBOARDING_STORAGE_KEYS.INITIATED, ONBOARDING_STORAGE_KEYS.STEP1_ACTIONS, ONBOARDING_STORAGE_KEYS.STEP2_ACTIONS, ONBOARDING_STORAGE_KEYS.STEP3_ACTIONS, ONBOARDING_STORAGE_KEYS.STEP4_ACTIONS, ONBOARDING_STORAGE_KEYS.STEP4_SITE_STARTER_CHOICE, ONBOARDING_STORAGE_KEYS.STEP4_HAS_PREVIOUS_CLICK, ONBOARDING_STORAGE_KEYS.EDITOR_LOAD_TRACKED, ONBOARDING_STORAGE_KEYS.POST_ONBOARDING_CLICK_COUNT, ONBOARDING_STORAGE_KEYS.PENDING_SKIP, ONBOARDING_STORAGE_KEYS.PENDING_CREATE_ACCOUNT_STATUS, ONBOARDING_STORAGE_KEYS.PENDING_CREATE_MY_ACCOUNT, ONBOARDING_STORAGE_KEYS.PENDING_TOP_UPGRADE, ONBOARDING_STORAGE_KEYS.PENDING_TOP_UPGRADE_NO_CLICK, ONBOARDING_STORAGE_KEYS.PENDING_CONNECT_STATUS, ONBOARDING_STORAGE_KEYS.PENDING_STEP1_CLICKED_CONNECT, ONBOARDING_STORAGE_KEYS.PENDING_STEP1_END_STATE, ONBOARDING_STORAGE_KEYS.PENDING_EXIT, ONBOARDING_STORAGE_KEYS.PENDING_AB_101_START_AS_FREE_USER, ONBOARDING_STORAGE_KEYS.PENDING_TOP_UPGRADE_MOUSEOVER, ONBOARDING_STORAGE_KEYS.STEP1_START_TIME, ONBOARDING_STORAGE_KEYS.STEP2_START_TIME, ONBOARDING_STORAGE_KEYS.STEP3_START_TIME, ONBOARDING_STORAGE_KEYS.STEP4_START_TIME];
  clearMultiple(keysToRemove);
  for (var i = 1; i <= 4; i++) {
    var clickDataKey = "elementor_onboarding_click_".concat(i, "_data");
    remove(clickDataKey);
  }
  remove(ONBOARDING_STORAGE_KEYS.STEP1_END_STATE_SENT);
  remove(ONBOARDING_STORAGE_KEYS.STEP2_END_STATE_SENT);
  remove(ONBOARDING_STORAGE_KEYS.STEP3_END_STATE_SENT);
  remove(ONBOARDING_STORAGE_KEYS.STEP4_END_STATE_SENT);
  remove(ONBOARDING_STORAGE_KEYS.STEP2_THEMES_LOADED_SENT);
}
function clearExperimentData() {
  var experimentKeys = [ONBOARDING_STORAGE_KEYS.EXPERIMENT101_VARIANT, ONBOARDING_STORAGE_KEYS.EXPERIMENT101_STARTED, ONBOARDING_STORAGE_KEYS.EXPERIMENT202_VARIANT, ONBOARDING_STORAGE_KEYS.EXPERIMENT202_STARTED, ONBOARDING_STORAGE_KEYS.EXPERIMENT401_VARIANT, ONBOARDING_STORAGE_KEYS.EXPERIMENT401_STARTED, ONBOARDING_STORAGE_KEYS.EXPERIMENT402_VARIANT, ONBOARDING_STORAGE_KEYS.EXPERIMENT402_STARTED, ONBOARDING_STORAGE_KEYS.PENDING_EXPERIMENT_DATA];
  clearMultiple(experimentKeys);
}
function getStepStartTime(stepNumber) {
  var stepStartTimeKeys = {
    1: ONBOARDING_STORAGE_KEYS.STEP1_START_TIME,
    2: ONBOARDING_STORAGE_KEYS.STEP2_START_TIME,
    3: ONBOARDING_STORAGE_KEYS.STEP3_START_TIME,
    4: ONBOARDING_STORAGE_KEYS.STEP4_START_TIME
  };
  var key = stepStartTimeKeys[stepNumber];
  return key ? getNumber(key) : null;
}
function setStepStartTime(stepNumber, timestamp) {
  var stepStartTimeKeys = {
    1: ONBOARDING_STORAGE_KEYS.STEP1_START_TIME,
    2: ONBOARDING_STORAGE_KEYS.STEP2_START_TIME,
    3: ONBOARDING_STORAGE_KEYS.STEP3_START_TIME,
    4: ONBOARDING_STORAGE_KEYS.STEP4_START_TIME
  };
  var key = stepStartTimeKeys[stepNumber];
  if (key) {
    setNumber(key, timestamp);
    return true;
  }
  return false;
}
function clearStepStartTime(stepNumber) {
  var stepStartTimeKeys = {
    1: ONBOARDING_STORAGE_KEYS.STEP1_START_TIME,
    2: ONBOARDING_STORAGE_KEYS.STEP2_START_TIME,
    3: ONBOARDING_STORAGE_KEYS.STEP3_START_TIME,
    4: ONBOARDING_STORAGE_KEYS.STEP4_START_TIME
  };
  var key = stepStartTimeKeys[stepNumber];
  if (key) {
    remove(key);
  }
}
var StorageManager = {
  getString: getString,
  setString: setString,
  remove: remove,
  getObject: getObject,
  setObject: setObject,
  getArray: getArray,
  appendToArray: appendToArray,
  getNumber: getNumber,
  setNumber: setNumber,
  incrementNumber: incrementNumber,
  exists: exists,
  clearMultiple: clearMultiple,
  clearAllOnboardingData: clearAllOnboardingData,
  clearExperimentData: clearExperimentData,
  getStepStartTime: getStepStartTime,
  setStepStartTime: setStepStartTime,
  clearStepStartTime: clearStepStartTime
};
var _default = exports["default"] = StorageManager;

/***/ })

}]);
//# sourceMappingURL=29f5723514661bfdffd8.bundle.js.map