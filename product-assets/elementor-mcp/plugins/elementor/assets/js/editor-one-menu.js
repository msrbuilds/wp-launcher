/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "../modules/editor-one/assets/js/admin-menu/classes/flyout-interaction-handler.js":
/*!****************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/admin-menu/classes/flyout-interaction-handler.js ***!
  \****************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.FlyoutInteractionHandler = void 0;
var _classCallCheck2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/classCallCheck */ "../node_modules/@babel/runtime/helpers/classCallCheck.js"));
var _createClass2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/createClass */ "../node_modules/@babel/runtime/helpers/createClass.js"));
var FlyoutInteractionHandler = exports.FlyoutInteractionHandler = /*#__PURE__*/function () {
  function FlyoutInteractionHandler() {
    (0, _classCallCheck2.default)(this, FlyoutInteractionHandler);
    this.activeMenu = null;
    this.activeParent = null;
    this.closeTimeout = null;
    this.lastMousePos = null;
    this.exitPoint = null;
    this.mouseMoveHandler = null;
  }
  return (0, _createClass2.default)(FlyoutInteractionHandler, [{
    key: "handle",
    value: function handle() {
      this.setupFlyoutMenus();
      this.setupMobileSupport();
    }
  }, {
    key: "setupFlyoutMenus",
    value: function setupFlyoutMenus() {
      var _this = this;
      var menuItems = document.querySelectorAll('#adminmenu li.elementor-has-flyout');
      menuItems.forEach(function (parentLi) {
        var flyoutMenu = parentLi.querySelector('.elementor-submenu-flyout');
        if (!flyoutMenu) {
          return;
        }
        _this.attachHoverEvents(parentLi, flyoutMenu);
        _this.attachFocusEvents(parentLi, flyoutMenu);
        _this.attachKeyboardEvents(parentLi, flyoutMenu);
      });
    }
  }, {
    key: "attachHoverEvents",
    value: function attachHoverEvents(parentLi, flyoutMenu) {
      var _this2 = this;
      parentLi.addEventListener('mouseenter', function () {
        // If moving to a new parent that is NOT part of the current active tree
        if (_this2.activeMenu && !_this2.activeMenu.contains(parentLi) && _this2.activeMenu !== flyoutMenu) {
          // If we are moving to a sibling or unrelated menu, close the current one immediately
          // UNLESS we are in the safe zone triangle of the parent
          if (!_this2.isCursorInSafeZone()) {
            _this2.hideFlyout(_this2.activeMenu);
          }
        }
        _this2.clearCloseTimeout();
        _this2.showFlyout(parentLi, flyoutMenu);
      });
      parentLi.addEventListener('mouseleave', function (event) {
        _this2.exitPoint = {
          x: event.clientX,
          y: event.clientY
        };
        _this2.scheduleClose(parentLi, flyoutMenu);
      });
      flyoutMenu.addEventListener('mouseenter', function () {
        _this2.clearCloseTimeout();
        _this2.stopMouseTracking();
      });
      flyoutMenu.addEventListener('mouseleave', function (event) {
        _this2.exitPoint = {
          x: event.clientX,
          y: event.clientY
        };
        _this2.scheduleClose(parentLi, flyoutMenu);
      });
    }
  }, {
    key: "attachFocusEvents",
    value: function attachFocusEvents(parentLi, flyoutMenu) {
      var _this3 = this;
      var parentLink = parentLi.querySelector(':scope > a');
      if (parentLink) {
        parentLink.addEventListener('focus', function () {
          _this3.showFlyout(parentLi, flyoutMenu);
        });
      }
      flyoutMenu.addEventListener('focusout', function (event) {
        if (!parentLi.contains(event.relatedTarget)) {
          _this3.hideFlyout(flyoutMenu);
        }
      });
    }
  }, {
    key: "attachKeyboardEvents",
    value: function attachKeyboardEvents(parentLi, flyoutMenu) {
      var _this4 = this;
      parentLi.addEventListener('keydown', function (event) {
        _this4.handleKeyNavigation(event, parentLi, flyoutMenu);
      });
    }
  }, {
    key: "showFlyout",
    value: function showFlyout(parentLi, flyoutMenu) {
      if (this.activeMenu && this.activeMenu !== flyoutMenu) {
        this.hideFlyout(this.activeMenu);
      }
      this.exitPoint = null;
      this.positionFlyout(parentLi, flyoutMenu);
      flyoutMenu.classList.add('elementor-submenu-flyout-visible');
      this.activeMenu = flyoutMenu;
      this.activeParent = parentLi;
    }
  }, {
    key: "hideFlyout",
    value: function hideFlyout(flyoutMenu) {
      flyoutMenu.classList.remove('elementor-submenu-flyout-visible');
      if (this.activeMenu === flyoutMenu) {
        this.activeMenu = null;
        this.activeParent = null;
        this.exitPoint = null;
        this.stopMouseTracking();
      }
    }
  }, {
    key: "scheduleClose",
    value: function scheduleClose(parentLi, flyoutMenu) {
      var _this5 = this;
      this.clearCloseTimeout();
      this.startMouseTracking(parentLi, flyoutMenu);
      this.closeTimeout = setTimeout(function () {
        _this5.checkAndClose(flyoutMenu);
      }, 300);
    }
  }, {
    key: "checkAndClose",
    value: function checkAndClose(flyoutMenu) {
      var _this6 = this;
      if (!this.activeMenu) {
        return;
      }
      if (!this.isCursorInSafeZone()) {
        this.hideFlyout(flyoutMenu);
      } else {
        this.closeTimeout = setTimeout(function () {
          _this6.checkAndClose(flyoutMenu);
        }, 300);
      }
    }
  }, {
    key: "clearCloseTimeout",
    value: function clearCloseTimeout() {
      if (this.closeTimeout) {
        clearTimeout(this.closeTimeout);
        this.closeTimeout = null;
      }
    }
  }, {
    key: "startMouseTracking",
    value: function startMouseTracking() {
      var _this7 = this;
      this.stopMouseTracking();
      this.mouseMoveHandler = function (event) {
        _this7.lastMousePos = {
          x: event.clientX,
          y: event.clientY
        };
      };
      document.addEventListener('mousemove', this.mouseMoveHandler);
    }
  }, {
    key: "stopMouseTracking",
    value: function stopMouseTracking() {
      if (this.mouseMoveHandler) {
        document.removeEventListener('mousemove', this.mouseMoveHandler);
        this.mouseMoveHandler = null;
      }
      this.lastMousePos = null;
    }
  }, {
    key: "isCursorInSafeZone",
    value: function isCursorInSafeZone() {
      if (!this.lastMousePos || !this.activeMenu || !this.activeParent) {
        return false;
      }
      var cursor = this.lastMousePos;
      var parentRect = this.activeParent.getBoundingClientRect();
      if (this.isPointInRect(cursor, parentRect)) {
        return true;
      }
      var flyoutRect = this.activeMenu.getBoundingClientRect();
      if (this.isPointInRect(cursor, flyoutRect)) {
        return true;
      }
      return this.isPointInTriangle(cursor, parentRect, flyoutRect);
    }
  }, {
    key: "isPointInRect",
    value: function isPointInRect(point, rect) {
      return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
    }
  }, {
    key: "isPointInTriangle",
    value: function isPointInTriangle(cursor, parentRect, flyoutRect) {
      var exitX = this.exitPoint ? this.exitPoint.x : parentRect.right;
      var distParent = Math.abs(exitX - parentRect.right);
      var distFlyout = Math.abs(exitX - flyoutRect.left);
      var triangleApex, baseTop, baseBottom;

      // Determine direction: Moving towards Flyout (default) or towards Parent (backwards)
      if (distParent < distFlyout) {
        // Moving towards Flyout
        triangleApex = this.exitPoint || {
          x: parentRect.right,
          y: parentRect.top + parentRect.height / 2
        };
        baseTop = {
          x: flyoutRect.left,
          y: flyoutRect.top - 100
        };
        baseBottom = {
          x: flyoutRect.left,
          y: flyoutRect.bottom + 100
        };
      } else {
        // Moving towards Parent
        triangleApex = this.exitPoint || {
          x: flyoutRect.left,
          y: flyoutRect.top + flyoutRect.height / 2
        };
        baseTop = {
          x: parentRect.right,
          y: parentRect.top - 100
        };
        baseBottom = {
          x: parentRect.right,
          y: parentRect.bottom + 100
        };
      }
      return this.pointInTriangle(cursor, triangleApex, baseTop, baseBottom);
    }
  }, {
    key: "pointInTriangle",
    value: function pointInTriangle(p, v1, v2, v3) {
      var sign = function sign(p1, p2, p3) {
        return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
      };
      var d1 = sign(p, v1, v2);
      var d2 = sign(p, v2, v3);
      var d3 = sign(p, v3, v1);
      var hasNeg = 0 > d1 || 0 > d2 || 0 > d3;
      var hasPos = 0 < d1 || 0 < d2 || 0 < d3;
      return !(hasNeg && hasPos);
    }
  }, {
    key: "positionFlyout",
    value: function positionFlyout(parentLi, flyoutMenu) {
      var windowHeight = window.innerHeight;
      var flyoutHeight = flyoutMenu.offsetHeight;
      var parentRect = parentLi.getBoundingClientRect();
      var relativeTop = parentRect.top;
      if (relativeTop + flyoutHeight > windowHeight) {
        var newTop = windowHeight - flyoutHeight - relativeTop;
        if (newTop < -relativeTop) {
          newTop = -relativeTop + 10;
        }
        flyoutMenu.style.top = newTop + 'px';
      } else {
        delete flyoutMenu.style.top;
      }
    }
  }, {
    key: "handleKeyNavigation",
    value: function handleKeyNavigation(event, parentLi, flyoutMenu) {
      var allLinks = flyoutMenu.querySelectorAll('a');
      var focusedLink = flyoutMenu.querySelector('a:focus');
      var currentIndex = Array.from(allLinks).indexOf(focusedLink);
      var isVisible = flyoutMenu.classList.contains('elementor-submenu-flyout-visible');
      switch (event.key) {
        case 'ArrowRight':
          if (!isVisible) {
            var _allLinks$;
            event.preventDefault();
            this.showFlyout(parentLi, flyoutMenu);
            (_allLinks$ = allLinks[0]) === null || _allLinks$ === void 0 || _allLinks$.focus();
          }
          break;
        case 'ArrowLeft':
          if (isVisible) {
            var _parentLi$querySelect;
            event.preventDefault();
            this.hideFlyout(flyoutMenu);
            (_parentLi$querySelect = parentLi.querySelector(':scope > a')) === null || _parentLi$querySelect === void 0 || _parentLi$querySelect.focus();
          }
          break;
        case 'ArrowDown':
          if (isVisible && currentIndex >= 0) {
            var _allLinks$nextIndex;
            event.preventDefault();
            var nextIndex = (currentIndex + 1) % allLinks.length;
            (_allLinks$nextIndex = allLinks[nextIndex]) === null || _allLinks$nextIndex === void 0 || _allLinks$nextIndex.focus();
          }
          break;
        case 'ArrowUp':
          if (isVisible && currentIndex >= 0) {
            var _allLinks$prevIndex;
            event.preventDefault();
            var prevIndex = (currentIndex - 1 + allLinks.length) % allLinks.length;
            (_allLinks$prevIndex = allLinks[prevIndex]) === null || _allLinks$prevIndex === void 0 || _allLinks$prevIndex.focus();
          }
          break;
        case 'Escape':
          if (isVisible) {
            var _parentLi$querySelect2;
            event.preventDefault();
            this.hideFlyout(flyoutMenu);
            (_parentLi$querySelect2 = parentLi.querySelector(':scope > a')) === null || _parentLi$querySelect2 === void 0 || _parentLi$querySelect2.focus();
          }
          break;
      }
    }
  }, {
    key: "setupMobileSupport",
    value: function setupMobileSupport() {
      var _this8 = this;
      if (window.innerWidth > 782) {
        return;
      }
      var menuLinks = document.querySelectorAll('#adminmenu li.elementor-has-flyout > a');
      menuLinks.forEach(function (link) {
        link.addEventListener('click', function (event) {
          _this8.handleMobileClick(event, link);
        });
      });
      document.addEventListener('click', function (event) {
        _this8.handleDocumentClick(event);
      });
    }
  }, {
    key: "handleMobileClick",
    value: function handleMobileClick(event, link) {
      var parentLi = link.parentElement;
      var flyoutMenu = parentLi.querySelector('.elementor-submenu-flyout');
      if (!flyoutMenu) {
        return;
      }
      if (parentLi.classList.contains('elementor-flyout-open')) {
        return;
      }
      event.preventDefault();
      document.querySelectorAll('#adminmenu li.elementor-has-flyout').forEach(function (item) {
        item.classList.remove('elementor-flyout-open');
      });
      parentLi.classList.add('elementor-flyout-open');
    }
  }, {
    key: "handleDocumentClick",
    value: function handleDocumentClick(event) {
      if (!event.target.closest('#adminmenu li.elementor-has-flyout')) {
        document.querySelectorAll('#adminmenu li.elementor-has-flyout').forEach(function (item) {
          item.classList.remove('elementor-flyout-open');
        });
      }
    }
  }]);
}();

/***/ }),

/***/ "../modules/editor-one/assets/js/admin-menu/classes/flyout-menu-renderer.js":
/*!**********************************************************************************!*\
  !*** ../modules/editor-one/assets/js/admin-menu/classes/flyout-menu-renderer.js ***!
  \**********************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.FlyoutMenuRenderer = void 0;
var _classCallCheck2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/classCallCheck */ "../node_modules/@babel/runtime/helpers/classCallCheck.js"));
var _createClass2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/createClass */ "../node_modules/@babel/runtime/helpers/createClass.js"));
var FlyoutMenuRenderer = exports.FlyoutMenuRenderer = /*#__PURE__*/function () {
  function FlyoutMenuRenderer(config) {
    (0, _classCallCheck2.default)(this, FlyoutMenuRenderer);
    this.config = config;
  }
  return (0, _createClass2.default)(FlyoutMenuRenderer, [{
    key: "render",
    value: function render() {
      var editorFlyout = this.config.editorFlyout;
      if (!editorFlyout || !editorFlyout.items || !editorFlyout.items.length) {
        return false;
      }
      var editorLi = this.findEditorInMenu("#toplevel_page_elementor-home");
      if (!editorLi) {
        return false;
      }
      editorLi.classList.add('elementor-has-flyout');
      var editorFlyoutUl = document.createElement('ul');
      editorFlyoutUl.className = 'elementor-submenu-flyout elementor-level-3';
      editorFlyout.items.forEach(function (item) {
        if (item.has_divider_before) {
          var dividerLi = document.createElement('li');
          dividerLi.className = 'elementor-flyout-divider';
          dividerLi.setAttribute('role', 'separator');
          editorFlyoutUl.appendChild(dividerLi);
        }
        var li = document.createElement('li');
        li.setAttribute('data-group-id', item.group_id || '');
        var a = document.createElement('a');
        a.href = item.url;
        a.textContent = item.label;
        li.appendChild(a);
        editorFlyoutUl.appendChild(li);
      });
      editorLi.appendChild(editorFlyoutUl);
      return true;
    }
  }, {
    key: "findEditorInMenu",
    value: function findEditorInMenu(menuSelector) {
      var menuItem = document.querySelector(menuSelector);
      if (!menuItem) {
        return null;
      }
      var submenu = menuItem.querySelector('.wp-submenu');
      if (!submenu) {
        return null;
      }
      var editorItem = submenu.querySelector('a[href$="page=elementor"]');
      if (!editorItem) {
        return null;
      }
      return editorItem.closest('li');
    }
  }]);
}();

/***/ }),

/***/ "../modules/editor-one/assets/js/admin-menu/classes/sidebar-menu-handler.js":
/*!**********************************************************************************!*\
  !*** ../modules/editor-one/assets/js/admin-menu/classes/sidebar-menu-handler.js ***!
  \**********************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.SidebarMenuHandler = void 0;
var _classCallCheck2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/classCallCheck */ "../node_modules/@babel/runtime/helpers/classCallCheck.js"));
var _createClass2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/createClass */ "../node_modules/@babel/runtime/helpers/createClass.js"));
var SidebarMenuHandler = exports.SidebarMenuHandler = /*#__PURE__*/function () {
  function SidebarMenuHandler() {
    (0, _classCallCheck2.default)(this, SidebarMenuHandler);
    this.elementorHomeMenu = this.findElementorHomeMenu();
    if (this.elementorHomeMenu) {
      this.deactivateOtherMenus();
      this.activateElementorMenu();
      this.highlightSubmenu();
    }
  }
  return (0, _createClass2.default)(SidebarMenuHandler, [{
    key: "findElementorHomeMenu",
    value: function findElementorHomeMenu() {
      return document.querySelector('#toplevel_page_elementor-home');
    }
  }, {
    key: "deactivateOtherMenus",
    value: function deactivateOtherMenus() {
      var _this = this;
      document.querySelectorAll('#adminmenu li.wp-has-current-submenu').forEach(function (item) {
        if (item !== _this.elementorHomeMenu) {
          item.classList.remove('wp-has-current-submenu', 'wp-menu-open', 'selected');
          item.classList.add('wp-not-current-submenu');
          var link = item.querySelector(':scope > a');
          if (link) {
            link.classList.remove('wp-has-current-submenu', 'wp-menu-open', 'current');
          }
        }
      });
    }
  }, {
    key: "activateElementorMenu",
    value: function activateElementorMenu() {
      this.elementorHomeMenu.classList.remove('wp-not-current-submenu');
      this.elementorHomeMenu.classList.add('wp-has-current-submenu', 'wp-menu-open', 'selected');
      var elementorLink = this.elementorHomeMenu.querySelector(':scope > a.menu-top');
      if (elementorLink) {
        elementorLink.classList.add('wp-has-current-submenu', 'wp-menu-open');
      }
    }
  }, {
    key: "highlightSubmenu",
    value: function highlightSubmenu() {
      var currentUrl = new URL(window.location.href);
      var searchParams = currentUrl.searchParams;
      var page = searchParams.get('page');
      var targetSlug = 'elementor';
      if ('elementor' === page || 'elementor-home' === page) {
        targetSlug = 'elementor';
      } else if ('e-form-submissions' === page) {
        targetSlug = 'e-form-submissions';
      } else if ('elementor-theme-builder' === page) {
        targetSlug = 'elementor-theme-builder';
      }
      var submenuItems = this.elementorHomeMenu.querySelectorAll('.wp-submenu li');
      submenuItems.forEach(function (item) {
        var link = item.querySelector('a');
        if (!link) {
          return;
        }
        item.classList.remove('current');
        link.classList.remove('current');
        link.setAttribute('aria-current', '');
        var linkUrl = new URL(link.href, window.location.origin);
        var linkPage = linkUrl.searchParams.get('page');
        if (linkPage === targetSlug) {
          item.classList.add('current');
          link.classList.add('current');
          link.setAttribute('aria-current', 'page');
        }
      });
    }
  }]);
}();

/***/ }),

/***/ "../node_modules/@babel/runtime/helpers/classCallCheck.js":
/*!****************************************************************!*\
  !*** ../node_modules/@babel/runtime/helpers/classCallCheck.js ***!
  \****************************************************************/
/***/ ((module) => {

function _classCallCheck(a, n) {
  if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function");
}
module.exports = _classCallCheck, module.exports.__esModule = true, module.exports["default"] = module.exports;

/***/ }),

/***/ "../node_modules/@babel/runtime/helpers/createClass.js":
/*!*************************************************************!*\
  !*** ../node_modules/@babel/runtime/helpers/createClass.js ***!
  \*************************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var toPropertyKey = __webpack_require__(/*! ./toPropertyKey.js */ "../node_modules/@babel/runtime/helpers/toPropertyKey.js");
function _defineProperties(e, r) {
  for (var t = 0; t < r.length; t++) {
    var o = r[t];
    o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, toPropertyKey(o.key), o);
  }
}
function _createClass(e, r, t) {
  return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", {
    writable: !1
  }), e;
}
module.exports = _createClass, module.exports.__esModule = true, module.exports["default"] = module.exports;

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

/***/ "../node_modules/@babel/runtime/helpers/toPrimitive.js":
/*!*************************************************************!*\
  !*** ../node_modules/@babel/runtime/helpers/toPrimitive.js ***!
  \*************************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var _typeof = (__webpack_require__(/*! ./typeof.js */ "../node_modules/@babel/runtime/helpers/typeof.js")["default"]);
function toPrimitive(t, r) {
  if ("object" != _typeof(t) || !t) return t;
  var e = t[Symbol.toPrimitive];
  if (void 0 !== e) {
    var i = e.call(t, r || "default");
    if ("object" != _typeof(i)) return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return ("string" === r ? String : Number)(t);
}
module.exports = toPrimitive, module.exports.__esModule = true, module.exports["default"] = module.exports;

/***/ }),

/***/ "../node_modules/@babel/runtime/helpers/toPropertyKey.js":
/*!***************************************************************!*\
  !*** ../node_modules/@babel/runtime/helpers/toPropertyKey.js ***!
  \***************************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var _typeof = (__webpack_require__(/*! ./typeof.js */ "../node_modules/@babel/runtime/helpers/typeof.js")["default"]);
var toPrimitive = __webpack_require__(/*! ./toPrimitive.js */ "../node_modules/@babel/runtime/helpers/toPrimitive.js");
function toPropertyKey(t) {
  var i = toPrimitive(t, "string");
  return "symbol" == _typeof(i) ? i : i + "";
}
module.exports = toPropertyKey, module.exports.__esModule = true, module.exports["default"] = module.exports;

/***/ }),

/***/ "../node_modules/@babel/runtime/helpers/typeof.js":
/*!********************************************************!*\
  !*** ../node_modules/@babel/runtime/helpers/typeof.js ***!
  \********************************************************/
/***/ ((module) => {

function _typeof(o) {
  "@babel/helpers - typeof";

  return module.exports = _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) {
    return typeof o;
  } : function (o) {
    return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
  }, module.exports.__esModule = true, module.exports["default"] = module.exports, _typeof(o);
}
module.exports = _typeof, module.exports.__esModule = true, module.exports["default"] = module.exports;

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
  !*** ../modules/editor-one/assets/js/admin-menu/app.js ***!
  \*********************************************************/


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
var _classCallCheck2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/classCallCheck */ "../node_modules/@babel/runtime/helpers/classCallCheck.js"));
var _createClass2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/createClass */ "../node_modules/@babel/runtime/helpers/createClass.js"));
var _flyoutMenuRenderer = __webpack_require__(/*! ./classes/flyout-menu-renderer */ "../modules/editor-one/assets/js/admin-menu/classes/flyout-menu-renderer.js");
var _sidebarMenuHandler = __webpack_require__(/*! ./classes/sidebar-menu-handler */ "../modules/editor-one/assets/js/admin-menu/classes/sidebar-menu-handler.js");
var _flyoutInteractionHandler = __webpack_require__(/*! ./classes/flyout-interaction-handler */ "../modules/editor-one/assets/js/admin-menu/classes/flyout-interaction-handler.js");
var EditorOneMenu = /*#__PURE__*/function () {
  function EditorOneMenu() {
    var _window;
    (0, _classCallCheck2.default)(this, EditorOneMenu);
    this.config = ((_window = window) === null || _window === void 0 ? void 0 : _window.editorOneMenuConfig) || {};
  }
  return (0, _createClass2.default)(EditorOneMenu, [{
    key: "init",
    value: function init() {
      if (this.isSidebarNavigationActive()) {
        new _sidebarMenuHandler.SidebarMenuHandler();
        return;
      }
      this.buildFlyoutMenus();
    }
  }, {
    key: "isSidebarNavigationActive",
    value: function isSidebarNavigationActive() {
      return document.body.classList.contains('e-has-sidebar-navigation');
    }
  }, {
    key: "buildFlyoutMenus",
    value: function buildFlyoutMenus() {
      var renderer = new _flyoutMenuRenderer.FlyoutMenuRenderer(this.config);
      if (renderer.render()) {
        new _flyoutInteractionHandler.FlyoutInteractionHandler().handle();
      }
    }
  }]);
}();
var initEditorOneMenu = function initEditorOneMenu() {
  var editorOneMenu = new EditorOneMenu();
  editorOneMenu.init();
};
if ('loading' === document.readyState) {
  document.addEventListener('DOMContentLoaded', initEditorOneMenu);
} else {
  initEditorOneMenu();
}
})();

/******/ })()
;
//# sourceMappingURL=editor-one-menu.js.map