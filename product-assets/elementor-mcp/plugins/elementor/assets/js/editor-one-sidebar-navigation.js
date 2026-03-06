/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "../assets/dev/js/utils/react.js":
/*!***************************************!*\
  !*** ../assets/dev/js/utils/react.js ***!
  \***************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _typeof = __webpack_require__(/*! @babel/runtime/helpers/typeof */ "../node_modules/@babel/runtime/helpers/typeof.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
var React = _interopRequireWildcard(__webpack_require__(/*! react */ "react"));
var ReactDOM = _interopRequireWildcard(__webpack_require__(/*! react-dom */ "react-dom"));
var _client = __webpack_require__(/*! react-dom/client */ "../node_modules/react-dom/client.js");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (var _t in e) "default" !== _t && {}.hasOwnProperty.call(e, _t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t)) && (i.get || i.set) ? o(f, _t, i) : f[_t] = e[_t]); return f; })(e, t); }
/**
 * Support conditional rendering of a React App to the DOM, based on the React version.
 * We use `createRoot` when available, but fallback to `ReactDOM.render` for older versions.
 *
 * @param { React.ReactElement } app        The app to render.
 * @param { HTMLElement }        domElement The DOM element to render the app into.
 *
 * @return {{ unmount: () => void }} The unmount function.
 */
function render(app, domElement) {
  var unmountFunction;
  try {
    var root = (0, _client.createRoot)(domElement);
    root.render(app);
    unmountFunction = function unmountFunction() {
      root.unmount();
    };
  } catch (e) {
    // eslint-disable-next-line react/no-deprecated
    ReactDOM.render(app, domElement);
    unmountFunction = function unmountFunction() {
      // eslint-disable-next-line react/no-deprecated
      ReactDOM.unmountComponentAtNode(domElement);
    };
  }
  return {
    unmount: unmountFunction
  };
}
var _default = exports["default"] = {
  render: render
};

/***/ }),

/***/ "../modules/editor-one/assets/js/shared/is-rtl.js":
/*!********************************************************!*\
  !*** ../modules/editor-one/assets/js/shared/is-rtl.js ***!
  \********************************************************/
/***/ ((__unused_webpack_module, exports) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = isRTL;
function isRTL() {
  var _elementorCommon$conf, _elementorCommon;
  return (_elementorCommon$conf = (_elementorCommon = elementorCommon) === null || _elementorCommon === void 0 || (_elementorCommon = _elementorCommon.config) === null || _elementorCommon === void 0 ? void 0 : _elementorCommon.isRTL) !== null && _elementorCommon$conf !== void 0 ? _elementorCommon$conf : false;
}

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/classes/menu-active-state-resolver.js":
/*!************************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/classes/menu-active-state-resolver.js ***!
  \************************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
var _classCallCheck2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/classCallCheck */ "../node_modules/@babel/runtime/helpers/classCallCheck.js"));
var _createClass2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/createClass */ "../node_modules/@babel/runtime/helpers/createClass.js"));
var MenuActiveStateResolver = /*#__PURE__*/function () {
  function MenuActiveStateResolver(activeMenuSlug, activeChildSlug) {
    (0, _classCallCheck2.default)(this, MenuActiveStateResolver);
    this.activeMenuSlug = activeMenuSlug;
    this.activeChildSlug = activeChildSlug;
  }
  return (0, _createClass2.default)(MenuActiveStateResolver, [{
    key: "isMenuActive",
    value: function isMenuActive(item) {
      return item.slug === this.activeMenuSlug;
    }
  }, {
    key: "isChildActive",
    value: function isChildActive(childItem) {
      return childItem.slug === this.activeChildSlug;
    }
  }]);
}();
var _default = exports["default"] = MenuActiveStateResolver;

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/collapsed-menu/collapsed-menu-item-popover.js":
/*!*******************************************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/collapsed-menu/collapsed-menu-item-popover.js ***!
  \*******************************************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
var _react = _interopRequireDefault(__webpack_require__(/*! react */ "react"));
var _ui = __webpack_require__(/*! @elementor/ui */ "@elementor/ui");
var _propTypes = _interopRequireDefault(__webpack_require__(/*! prop-types */ "../node_modules/prop-types/index.js"));
var _shared = __webpack_require__(/*! ../shared */ "../modules/editor-one/assets/js/sidebar-navigation/components/shared/index.js");
var CollapsedMenuItemPopover = function CollapsedMenuItemPopover(_ref) {
  var item = _ref.item,
    children = _ref.children,
    activeChildSlug = _ref.activeChildSlug,
    isPopoverOpen = _ref.isPopoverOpen,
    anchorEl = _ref.anchorEl,
    onClose = _ref.onClose,
    IconComponent = _ref.IconComponent,
    isActive = _ref.isActive,
    onMouseEnter = _ref.onMouseEnter,
    anchorRef = _ref.anchorRef;
  return /*#__PURE__*/_react.default.createElement(_ui.ListItem, {
    disablePadding: true,
    dense: true,
    disableGutters: true,
    onMouseEnter: onMouseEnter,
    ref: anchorRef
  }, /*#__PURE__*/_react.default.createElement(_shared.MenuItemButton, {
    selected: isActive || isPopoverOpen,
    sx: {
      height: 36
    }
  }, /*#__PURE__*/_react.default.createElement(_shared.MenuIcon, null, /*#__PURE__*/_react.default.createElement(IconComponent, null))), /*#__PURE__*/_react.default.createElement(_shared.StyledPopover, {
    open: isPopoverOpen,
    anchorEl: anchorEl,
    onClose: onClose,
    anchorOrigin: {
      vertical: 'top',
      horizontal: 'right'
    },
    transformOrigin: {
      vertical: 'top',
      horizontal: 'left'
    },
    slotProps: {
      paper: {
        onMouseLeave: onClose
      }
    },
    disableRestoreFocus: true,
    hideBackdrop: true
  }, /*#__PURE__*/_react.default.createElement(_shared.PopoverContent, null, /*#__PURE__*/_react.default.createElement(_ui.List, {
    disablePadding: true,
    dense: true
  }, /*#__PURE__*/_react.default.createElement(_shared.PopoverTitle, null, item.label), children.map(function (childItem) {
    return /*#__PURE__*/_react.default.createElement(_ui.ListItem, {
      key: childItem.slug,
      disablePadding: true,
      disableGutters: true,
      dense: true,
      sx: {
        height: 28
      }
    }, /*#__PURE__*/_react.default.createElement(_shared.PopoverListItemButton, {
      component: "a",
      href: childItem.url,
      selected: childItem.slug === activeChildSlug
    }, /*#__PURE__*/_react.default.createElement(_ui.ListItemText, {
      primary: childItem.label,
      primaryTypographyProps: {
        variant: 'body2'
      }
    })));
  })))));
};
CollapsedMenuItemPopover.propTypes = {
  item: _propTypes.default.object.isRequired,
  children: _propTypes.default.array.isRequired,
  activeChildSlug: _propTypes.default.string.isRequired,
  isPopoverOpen: _propTypes.default.bool.isRequired,
  anchorEl: _propTypes.default.object,
  onClose: _propTypes.default.func.isRequired,
  IconComponent: _propTypes.default.elementType.isRequired,
  isActive: _propTypes.default.bool.isRequired,
  onMouseEnter: _propTypes.default.func.isRequired,
  anchorRef: _propTypes.default.oneOfType([_propTypes.default.func, _propTypes.default.object]).isRequired
};
var _default = exports["default"] = CollapsedMenuItemPopover;

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/collapsed-menu/collapsed-menu-item-tooltip.js":
/*!*******************************************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/collapsed-menu/collapsed-menu-item-tooltip.js ***!
  \*******************************************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
var _react = _interopRequireDefault(__webpack_require__(/*! react */ "react"));
var _ui = __webpack_require__(/*! @elementor/ui */ "@elementor/ui");
var _propTypes = _interopRequireDefault(__webpack_require__(/*! prop-types */ "../node_modules/prop-types/index.js"));
var _shared = __webpack_require__(/*! ../shared */ "../modules/editor-one/assets/js/sidebar-navigation/components/shared/index.js");
var _isRtl = _interopRequireDefault(__webpack_require__(/*! ../../../shared/is-rtl */ "../modules/editor-one/assets/js/shared/is-rtl.js"));
var CollapsedMenuItemTooltip = function CollapsedMenuItemTooltip(_ref) {
  var item = _ref.item,
    isActive = _ref.isActive,
    onClick = _ref.onClick,
    IconComponent = _ref.IconComponent,
    onMouseEnter = _ref.onMouseEnter;
  var isRtlLanguage = (0, _isRtl.default)();
  return /*#__PURE__*/_react.default.createElement(_ui.ListItem, {
    disablePadding: true,
    dense: true,
    disableGutters: true,
    onMouseEnter: onMouseEnter
  }, /*#__PURE__*/_react.default.createElement(_ui.Tooltip, {
    title: item.label,
    placement: isRtlLanguage ? 'left' : 'right'
  }, /*#__PURE__*/_react.default.createElement(_shared.MenuItemButton, {
    onClick: onClick,
    selected: isActive,
    sx: {
      height: 36
    }
  }, /*#__PURE__*/_react.default.createElement(_shared.MenuIcon, null, /*#__PURE__*/_react.default.createElement(IconComponent, null)))));
};
CollapsedMenuItemTooltip.propTypes = {
  item: _propTypes.default.object.isRequired,
  isActive: _propTypes.default.bool.isRequired,
  onClick: _propTypes.default.func.isRequired,
  IconComponent: _propTypes.default.elementType.isRequired,
  onMouseEnter: _propTypes.default.func.isRequired
};
var _default = exports["default"] = CollapsedMenuItemTooltip;

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/collapsed-menu/index.js":
/*!*********************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/collapsed-menu/index.js ***!
  \*********************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
Object.defineProperty(exports, "SidebarCollapsedMenu", ({
  enumerable: true,
  get: function get() {
    return _sidebarCollapsedMenu.default;
  }
}));
Object.defineProperty(exports, "SidebarCollapsedMenuItem", ({
  enumerable: true,
  get: function get() {
    return _sidebarCollapsedMenuItem.default;
  }
}));
var _sidebarCollapsedMenu = _interopRequireDefault(__webpack_require__(/*! ./sidebar-collapsed-menu */ "../modules/editor-one/assets/js/sidebar-navigation/components/collapsed-menu/sidebar-collapsed-menu.js"));
var _sidebarCollapsedMenuItem = _interopRequireDefault(__webpack_require__(/*! ./sidebar-collapsed-menu-item */ "../modules/editor-one/assets/js/sidebar-navigation/components/collapsed-menu/sidebar-collapsed-menu-item.js"));

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/collapsed-menu/sidebar-collapsed-menu-item.js":
/*!*******************************************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/collapsed-menu/sidebar-collapsed-menu-item.js ***!
  \*******************************************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
var _react = _interopRequireDefault(__webpack_require__(/*! react */ "react"));
var _slicedToArray2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/slicedToArray */ "../node_modules/@babel/runtime/helpers/slicedToArray.js"));
var _element = __webpack_require__(/*! @wordpress/element */ "../node_modules/@wordpress/element/build-module/index.js");
var _propTypes = _interopRequireDefault(__webpack_require__(/*! prop-types */ "../node_modules/prop-types/index.js"));
var _shared = __webpack_require__(/*! ../shared */ "../modules/editor-one/assets/js/sidebar-navigation/components/shared/index.js");
var _collapsedMenuItemPopover = _interopRequireDefault(__webpack_require__(/*! ./collapsed-menu-item-popover */ "../modules/editor-one/assets/js/sidebar-navigation/components/collapsed-menu/collapsed-menu-item-popover.js"));
var _collapsedMenuItemTooltip = _interopRequireDefault(__webpack_require__(/*! ./collapsed-menu-item-tooltip */ "../modules/editor-one/assets/js/sidebar-navigation/components/collapsed-menu/collapsed-menu-item-tooltip.js"));
var SidebarCollapsedMenuItem = function SidebarCollapsedMenuItem(_ref) {
  var item = _ref.item,
    isActive = _ref.isActive,
    _ref$children = _ref.children,
    children = _ref$children === void 0 ? null : _ref$children,
    activeChildSlug = _ref.activeChildSlug,
    isPopoverOpen = _ref.isPopoverOpen,
    onOpenPopover = _ref.onOpenPopover,
    onClosePopover = _ref.onClosePopover;
  var _useState = (0, _element.useState)(null),
    _useState2 = (0, _slicedToArray2.default)(_useState, 2),
    anchorEl = _useState2[0],
    setAnchorEl = _useState2[1];
  var hasChildren = !!(children !== null && children !== void 0 && children.length);
  var IconComponent = _shared.ICON_MAP[item.icon] || _shared.DEFAULT_ICON;
  var handleMouseEnter = function handleMouseEnter() {
    if (hasChildren) {
      onOpenPopover(item.slug);
    } else {
      onClosePopover();
    }
  };
  var handleClick = function handleClick() {
    if (!hasChildren) {
      window.location.href = item.url;
    }
  };
  return /*#__PURE__*/_react.default.createElement(_react.default.Fragment, null, hasChildren ? /*#__PURE__*/_react.default.createElement(_collapsedMenuItemPopover.default, {
    item: item,
    children: children,
    activeChildSlug: activeChildSlug,
    isPopoverOpen: isPopoverOpen,
    anchorEl: anchorEl,
    onClose: onClosePopover,
    IconComponent: IconComponent,
    isActive: isActive,
    onMouseEnter: handleMouseEnter,
    anchorRef: setAnchorEl
  }) : /*#__PURE__*/_react.default.createElement(_collapsedMenuItemTooltip.default, {
    item: item,
    isActive: isActive,
    onClick: handleClick,
    IconComponent: IconComponent,
    onMouseEnter: handleMouseEnter
  }));
};
SidebarCollapsedMenuItem.propTypes = {
  item: _propTypes.default.object.isRequired,
  isActive: _propTypes.default.bool.isRequired,
  children: _propTypes.default.array,
  activeChildSlug: _propTypes.default.string.isRequired,
  isPopoverOpen: _propTypes.default.bool.isRequired,
  onOpenPopover: _propTypes.default.func.isRequired,
  onClosePopover: _propTypes.default.func.isRequired
};
var _default = exports["default"] = SidebarCollapsedMenuItem;

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/collapsed-menu/sidebar-collapsed-menu.js":
/*!**************************************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/collapsed-menu/sidebar-collapsed-menu.js ***!
  \**************************************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
var _react = _interopRequireDefault(__webpack_require__(/*! react */ "react"));
var _slicedToArray2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/slicedToArray */ "../node_modules/@babel/runtime/helpers/slicedToArray.js"));
var _element = __webpack_require__(/*! @wordpress/element */ "../node_modules/@wordpress/element/build-module/index.js");
var _ui = __webpack_require__(/*! @elementor/ui */ "@elementor/ui");
var _propTypes = _interopRequireDefault(__webpack_require__(/*! prop-types */ "../node_modules/prop-types/index.js"));
var _menuActiveStateResolver = _interopRequireDefault(__webpack_require__(/*! ../../classes/menu-active-state-resolver */ "../modules/editor-one/assets/js/sidebar-navigation/classes/menu-active-state-resolver.js"));
var _sidebarCollapsedMenuItem = _interopRequireDefault(__webpack_require__(/*! ./sidebar-collapsed-menu-item */ "../modules/editor-one/assets/js/sidebar-navigation/components/collapsed-menu/sidebar-collapsed-menu-item.js"));
var _shared = __webpack_require__(/*! ../shared */ "../modules/editor-one/assets/js/sidebar-navigation/components/shared/index.js");
var SidebarCollapsedMenu = function SidebarCollapsedMenu(_ref) {
  var menuItems = _ref.menuItems,
    level4Groups = _ref.level4Groups,
    activeMenuSlug = _ref.activeMenuSlug,
    activeChildSlug = _ref.activeChildSlug;
  var _useState = (0, _element.useState)(null),
    _useState2 = (0, _slicedToArray2.default)(_useState, 2),
    openPopoverSlug = _useState2[0],
    setOpenPopoverSlug = _useState2[1];
  var activeStateResolver = (0, _element.useMemo)(function () {
    return new _menuActiveStateResolver.default(activeMenuSlug, activeChildSlug);
  }, [activeMenuSlug, activeChildSlug]);
  var getChildren = function getChildren(item) {
    if (!item.group_id) {
      return null;
    }
    var group = level4Groups[item.group_id];
    if (!group || !group.items || !group.items.length) {
      return null;
    }
    return group.items;
  };
  var handleOpenPopover = (0, _element.useCallback)(function (slug) {
    setOpenPopoverSlug(slug);
  }, []);
  var handleClosePopover = (0, _element.useCallback)(function () {
    setOpenPopoverSlug(null);
  }, []);
  return /*#__PURE__*/_react.default.createElement(_shared.MenuList, {
    isCollapsed: true,
    onMouseLeave: handleClosePopover
  }, menuItems.map(function (item) {
    return /*#__PURE__*/_react.default.createElement(_react.default.Fragment, null, item.has_divider_before && /*#__PURE__*/_react.default.createElement(_ui.Divider, {
      key: "divider-".concat(item.slug),
      sx: {
        my: 1
      }
    }), /*#__PURE__*/_react.default.createElement(_sidebarCollapsedMenuItem.default, {
      key: item.slug,
      item: item,
      isActive: activeStateResolver.isMenuActive(item),
      children: getChildren(item),
      activeChildSlug: activeChildSlug,
      isPopoverOpen: openPopoverSlug === item.slug,
      onOpenPopover: handleOpenPopover,
      onClosePopover: handleClosePopover
    }));
  }));
};
SidebarCollapsedMenu.propTypes = {
  menuItems: _propTypes.default.array.isRequired,
  level4Groups: _propTypes.default.object.isRequired,
  activeMenuSlug: _propTypes.default.string.isRequired,
  activeChildSlug: _propTypes.default.string.isRequired
};
var _default = exports["default"] = SidebarCollapsedMenu;

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/cta/index.js":
/*!**********************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/cta/index.js ***!
  \**********************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
var _exportNames = {
  SidebarUpgradeCta: true
};
Object.defineProperty(exports, "SidebarUpgradeCta", ({
  enumerable: true,
  get: function get() {
    return _sidebarUpgradeCta.default;
  }
}));
var _sidebarUpgradeCta = _interopRequireDefault(__webpack_require__(/*! ./sidebar-upgrade-cta */ "../modules/editor-one/assets/js/sidebar-navigation/components/cta/sidebar-upgrade-cta.js"));
var _styledComponents = __webpack_require__(/*! ./styled-components */ "../modules/editor-one/assets/js/sidebar-navigation/components/cta/styled-components.js");
Object.keys(_styledComponents).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _styledComponents[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function get() {
      return _styledComponents[key];
    }
  });
});

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/cta/sidebar-upgrade-cta.js":
/*!************************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/cta/sidebar-upgrade-cta.js ***!
  \************************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
var _react = _interopRequireDefault(__webpack_require__(/*! react */ "react"));
var _icons = __webpack_require__(/*! @elementor/icons */ "@elementor/icons");
var _propTypes = _interopRequireDefault(__webpack_require__(/*! prop-types */ "../node_modules/prop-types/index.js"));
var _styledComponents = __webpack_require__(/*! ./styled-components */ "../modules/editor-one/assets/js/sidebar-navigation/components/cta/styled-components.js");
var SidebarUpgradeCta = function SidebarUpgradeCta(_ref) {
  var upgradeUrl = _ref.upgradeUrl,
    upgradeText = _ref.upgradeText,
    hasPro = _ref.hasPro,
    collapsed = _ref.collapsed;
  var isPro = true === hasPro || '1' === hasPro || 'true' === hasPro;
  if (isPro) {
    return null;
  }
  var handleUpgradeClick = function handleUpgradeClick() {
    window.open(upgradeUrl, '_blank');
  };
  if (collapsed) {
    return /*#__PURE__*/_react.default.createElement(_styledComponents.CollapsedCtaContainer, null, /*#__PURE__*/_react.default.createElement(_styledComponents.CollapsedCtaButton, {
      onClick: handleUpgradeClick
    }, /*#__PURE__*/_react.default.createElement(_icons.CrownFilledIcon, null)));
  }
  return /*#__PURE__*/_react.default.createElement(_styledComponents.CtaContainer, null, /*#__PURE__*/_react.default.createElement(_styledComponents.CtaButton, {
    startIcon: /*#__PURE__*/_react.default.createElement(_icons.CrownFilledIcon, null),
    onClick: handleUpgradeClick,
    variant: "outlined",
    color: "promotion",
    fullWidth: true
  }, upgradeText));
};
SidebarUpgradeCta.propTypes = {
  upgradeUrl: _propTypes.default.string.isRequired,
  upgradeText: _propTypes.default.string.isRequired,
  hasPro: _propTypes.default.oneOfType([_propTypes.default.bool, _propTypes.default.string]).isRequired,
  collapsed: _propTypes.default.bool
};
var _default = exports["default"] = SidebarUpgradeCta;

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/cta/styled-components.js":
/*!**********************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/cta/styled-components.js ***!
  \**********************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.CtaContainer = exports.CtaButton = exports.CollapsedCtaContainer = exports.CollapsedCtaButton = void 0;
var _ui = __webpack_require__(/*! @elementor/ui */ "@elementor/ui");
var CtaContainer = exports.CtaContainer = (0, _ui.styled)(_ui.Box)(function (_ref) {
  var theme = _ref.theme;
  return {
    padding: theme.spacing(2)
  };
});
var CtaButton = exports.CtaButton = (0, _ui.styled)(_ui.Button)({
  justifyContent: 'center',
  whiteSpace: 'nowrap'
});
var CollapsedCtaContainer = exports.CollapsedCtaContainer = (0, _ui.styled)(_ui.Box)(function (_ref2) {
  var theme = _ref2.theme;
  return {
    padding: theme.spacing(2),
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center'
  };
});
var CollapsedCtaButton = exports.CollapsedCtaButton = (0, _ui.styled)('button')(function (_ref3) {
  var theme = _ref3.theme;
  return {
    border: "1px solid ".concat(theme.palette.promotion.main),
    borderRadius: 999,
    width: 24,
    height: 24,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    cursor: 'pointer',
    color: theme.palette.promotion.main,
    transition: 'all 0.2s ease-in-out',
    whiteSpace: 'nowrap',
    '&:hover': {
      background: theme.palette.promotion.hover
    },
    '& svg': {
      width: 18,
      height: 18,
      fill: theme.palette.promotion.main
    }
  };
});

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/header/index.js":
/*!*************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/header/index.js ***!
  \*************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
var _exportNames = {
  SidebarHeader: true
};
Object.defineProperty(exports, "SidebarHeader", ({
  enumerable: true,
  get: function get() {
    return _sidebarHeader.default;
  }
}));
var _sidebarHeader = _interopRequireDefault(__webpack_require__(/*! ./sidebar-header */ "../modules/editor-one/assets/js/sidebar-navigation/components/header/sidebar-header.js"));
var _styledComponents = __webpack_require__(/*! ./styled-components */ "../modules/editor-one/assets/js/sidebar-navigation/components/header/styled-components.js");
Object.keys(_styledComponents).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _styledComponents[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function get() {
      return _styledComponents[key];
    }
  });
});

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/header/sidebar-header.js":
/*!**********************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/header/sidebar-header.js ***!
  \**********************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
var _react = _interopRequireDefault(__webpack_require__(/*! react */ "react"));
var _ChevronRightIcon = _interopRequireDefault(__webpack_require__(/*! @elementor/icons/ChevronRightIcon */ "@elementor/icons/ChevronRightIcon"));
var _SearchIcon = _interopRequireDefault(__webpack_require__(/*! @elementor/icons/SearchIcon */ "@elementor/icons/SearchIcon"));
var _editor = _interopRequireDefault(__webpack_require__(/*! ../icons/editor */ "../modules/editor-one/assets/js/sidebar-navigation/components/icons/editor.js"));
var _propTypes = _interopRequireDefault(__webpack_require__(/*! prop-types */ "../node_modules/prop-types/index.js"));
var _shared = __webpack_require__(/*! ../shared */ "../modules/editor-one/assets/js/sidebar-navigation/components/shared/index.js");
var _styledComponents = __webpack_require__(/*! ./styled-components */ "../modules/editor-one/assets/js/sidebar-navigation/components/header/styled-components.js");
var SidebarHeader = function SidebarHeader(_ref) {
  var siteTitle = _ref.siteTitle,
    onCollapse = _ref.onCollapse;
  var finderAction = function finderAction() {
    $e.route('finder');
  };
  return /*#__PURE__*/_react.default.createElement(_styledComponents.HeaderContainer, null, /*#__PURE__*/_react.default.createElement(_styledComponents.HeaderContent, null, /*#__PURE__*/_react.default.createElement(_shared.SiteIconBox, null, /*#__PURE__*/_react.default.createElement(_editor.default, null)), /*#__PURE__*/_react.default.createElement(_styledComponents.SiteTitle, {
    variant: "subtitle1"
  }, siteTitle), /*#__PURE__*/_react.default.createElement(_styledComponents.SearchButton, {
    onClick: finderAction
  }, /*#__PURE__*/_react.default.createElement(_SearchIcon.default, null))), /*#__PURE__*/_react.default.createElement(_shared.CollapseButton, {
    onClick: onCollapse,
    size: "small",
    expanded: true
  }, /*#__PURE__*/_react.default.createElement(_ChevronRightIcon.default, null)));
};
SidebarHeader.propTypes = {
  siteTitle: _propTypes.default.string.isRequired,
  onCollapse: _propTypes.default.func.isRequired
};
var _default = exports["default"] = SidebarHeader;

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/header/styled-components.js":
/*!*************************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/header/styled-components.js ***!
  \*************************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.SiteTitle = exports.SearchButton = exports.HeaderContent = exports.HeaderContainer = void 0;
var _ui = __webpack_require__(/*! @elementor/ui */ "@elementor/ui");
var HeaderContainer = exports.HeaderContainer = (0, _ui.styled)(_ui.Box)(function (_ref) {
  var theme = _ref.theme;
  return {
    position: 'relative',
    marginLeft: theme.spacing(2),
    marginRight: theme.spacing(2),
    height: 80,
    borderBottom: "1px solid ".concat(theme.palette.divider),
    display: 'flex',
    alignItems: 'center'
  };
});
var HeaderContent = exports.HeaderContent = (0, _ui.styled)(_ui.Box)(function (_ref2) {
  var theme = _ref2.theme;
  return {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    flex: 1
  };
});
var SiteTitle = exports.SiteTitle = (0, _ui.styled)(_ui.Typography)({
  fontWeight: 500,
  flex: 1
});
var SearchButton = exports.SearchButton = (0, _ui.styled)(_ui.IconButton)(function (_ref3) {
  var theme = _ref3.theme;
  return {
    fontSize: 20,
    color: theme.palette.action.active
  };
});

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/hooks/use-admin-menu-offset.js":
/*!****************************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/hooks/use-admin-menu-offset.js ***!
  \****************************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.useAdminMenuOffset = void 0;
var _element = __webpack_require__(/*! @wordpress/element */ "../node_modules/@wordpress/element/build-module/index.js");
var _isRtl = _interopRequireDefault(__webpack_require__(/*! ../../../shared/is-rtl */ "../modules/editor-one/assets/js/shared/is-rtl.js"));
var ADMIN_MENU_WRAP_ID = 'adminmenuwrap';
var WPCONTENT_ID = 'wpcontent';
var INITIALIZED_DATA_ATTR = 'data-editor-one-offset-initialized';
var useAdminMenuOffset = exports.useAdminMenuOffset = function useAdminMenuOffset() {
  var cleanupRef = (0, _element.useRef)(null);
  (0, _element.useEffect)(function () {
    var adminMenuWrap = document.getElementById(ADMIN_MENU_WRAP_ID);
    var wpcontent = document.getElementById(WPCONTENT_ID);
    if (!adminMenuWrap || !wpcontent || wpcontent.hasAttribute(INITIALIZED_DATA_ATTR)) {
      return;
    }
    var updateOffset = function updateOffset() {
      var isRtlLanguage = (0, _isRtl.default)();
      var rect = adminMenuWrap.getBoundingClientRect();
      var offset = isRtlLanguage ? document.documentElement.clientWidth - rect.left : rect.right;
      wpcontent.style.setProperty('--editor-one-sidebar-left-offset', "".concat(offset, "px"));
    };
    updateOffset();
    var resizeObserver = new ResizeObserver(updateOffset);
    resizeObserver.observe(wpcontent);
    window.addEventListener('resize', updateOffset);
    wpcontent.setAttribute(INITIALIZED_DATA_ATTR, 'true');
    cleanupRef.current = function () {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateOffset);
      wpcontent.removeAttribute(INITIALIZED_DATA_ATTR);
    };
    return function () {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);
};

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/hooks/use-sidebar-collapse.js":
/*!***************************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/hooks/use-sidebar-collapse.js ***!
  \***************************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.useSidebarCollapse = void 0;
var _slicedToArray2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/slicedToArray */ "../node_modules/@babel/runtime/helpers/slicedToArray.js"));
var _element = __webpack_require__(/*! @wordpress/element */ "../node_modules/@wordpress/element/build-module/index.js");
var STORAGE_KEY = 'elementor_sidebar_collapsed';
var AUTO_COLLAPSE_BREAKPOINT = 960;
var TRANSITION_DURATION = 300;
var useSidebarCollapse = exports.useSidebarCollapse = function useSidebarCollapse() {
  var _useState = (0, _element.useState)(function () {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (null !== stored) {
        return 'true' === stored;
      }
      return window.innerWidth <= AUTO_COLLAPSE_BREAKPOINT;
    }),
    _useState2 = (0, _slicedToArray2.default)(_useState, 2),
    isCollapsed = _useState2[0],
    setIsCollapsed = _useState2[1];
  (0, _element.useEffect)(function () {
    var mediaQuery = window.matchMedia("(max-width: ".concat(AUTO_COLLAPSE_BREAKPOINT, "px)"));
    var handleResize = function handleResize(e) {
      if (e.matches) {
        setIsCollapsed(true);
      } else {
        var stored = localStorage.getItem(STORAGE_KEY);
        setIsCollapsed('true' === stored);
      }
    };
    mediaQuery.addEventListener('change', handleResize);
    return function () {
      return mediaQuery.removeEventListener('change', handleResize);
    };
  }, []);
  var toggleCollapse = (0, _element.useCallback)(function () {
    var newState = !isCollapsed;
    var body = document.body;
    body.classList.add('e-sidebar-transitioning');
    setIsCollapsed(newState);
    localStorage.setItem(STORAGE_KEY, String(newState));
    setTimeout(function () {
      body.classList.remove('e-sidebar-transitioning');
    }, TRANSITION_DURATION);
  }, [isCollapsed]);
  (0, _element.useEffect)(function () {
    var container = document.getElementById('editor-one-sidebar-navigation');
    var body = document.body;
    if (isCollapsed) {
      container === null || container === void 0 || container.classList.add('e-sidebar-collapsed');
      body.classList.add('e-sidebar-is-collapsed');
    } else {
      container === null || container === void 0 || container.classList.remove('e-sidebar-collapsed');
      body.classList.remove('e-sidebar-is-collapsed');
    }
  }, [isCollapsed]);
  return {
    isCollapsed: isCollapsed,
    toggleCollapse: toggleCollapse
  };
};

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/icons/editor.js":
/*!*************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/icons/editor.js ***!
  \*************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
var _react = _interopRequireDefault(__webpack_require__(/*! react */ "react"));
var _extends2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/extends */ "../node_modules/@babel/runtime/helpers/extends.js"));
var _ui = __webpack_require__(/*! @elementor/ui */ "@elementor/ui");
var EditorIcon = function EditorIcon(props) {
  return /*#__PURE__*/_react.default.createElement(_ui.SvgIcon, (0, _extends2.default)({
    width: "22",
    height: "22",
    viewBox: "0 0 22 22",
    fill: "none"
  }, props), /*#__PURE__*/_react.default.createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg"
  }, /*#__PURE__*/_react.default.createElement("path", {
    d: "M16.8622 12.1197V4.74246C16.8621 2.70533 15.2107 1.05396 13.1735 1.05396H4.74246C2.70535 1.05398 1.05398 2.70535 1.05396 4.74246V14.2274C1.05396 16.2645 2.70533 17.916 4.74246 17.916H12.1197C12.4107 17.916 12.6466 18.152 12.6466 18.443C12.6465 18.734 12.4107 18.9698 12.1197 18.9698H4.74246C2.12329 18.9698 0 16.8465 0 14.2274V4.74246C2.28646e-05 2.1233 2.1233 2.21612e-05 4.74246 0H13.1735C15.7927 2.60738e-07 17.916 2.12329 17.916 4.74246V12.1197C17.916 12.4107 17.68 12.6466 17.389 12.6466C17.098 12.6465 16.8622 12.4107 16.8622 12.1197Z",
    fill: "black",
    fillOpacity: "0.56"
  }), /*#__PURE__*/_react.default.createElement("path", {
    d: "M9.29598 11.3878C8.81835 10.0982 10.1012 8.85589 11.3748 9.3747L21.0159 13.3025C22.3228 13.835 22.3301 15.6829 21.0275 16.2257L17.4478 17.7172C17.3249 17.7684 17.2259 17.8644 17.1708 17.9856L15.7665 21.0751C15.1824 22.36 13.3351 22.2935 12.8449 20.9699L9.29598 11.3878ZM10.9772 10.3507C10.5527 10.1778 10.125 10.5919 10.2842 11.0217L13.8332 20.604C13.9966 21.0451 14.6124 21.0672 14.8071 20.6389L16.2113 17.5495C16.3767 17.1858 16.6737 16.8981 17.0425 16.7444L20.6222 15.2529C21.0563 15.0719 21.0538 14.456 20.6182 14.2786L10.9772 10.3507Z",
    fill: "black",
    fillOpacity: "0.56"
  })));
};
var _default = exports["default"] = EditorIcon;

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/icons/tool.js":
/*!***********************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/icons/tool.js ***!
  \***********************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
var _react = _interopRequireDefault(__webpack_require__(/*! react */ "react"));
var _extends2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/extends */ "../node_modules/@babel/runtime/helpers/extends.js"));
var _ui = __webpack_require__(/*! @elementor/ui */ "@elementor/ui");
var ToolIcon = function ToolIcon(props) {
  return /*#__PURE__*/_react.default.createElement(_ui.SvgIcon, (0, _extends2.default)({
    width: "20",
    height: "20",
    viewBox: "0 0 20 20",
    fill: "none"
  }, props), /*#__PURE__*/_react.default.createElement("path", {
    d: "M5.83329 8.33354H8.33329V5.83354L5.41663 2.91687C6.34965 2.47127 7.39788 2.32588 8.41696 2.50072C9.43604 2.67557 10.3759 3.16205 11.107 3.89318C11.8381 4.62431 12.3246 5.56412 12.4994 6.58321C12.6743 7.60229 12.5289 8.65051 12.0833 9.58354L17.0833 14.5835C17.4148 14.9151 17.6011 15.3647 17.6011 15.8335C17.6011 16.3024 17.4148 16.752 17.0833 17.0835C16.7518 17.4151 16.3021 17.6013 15.8333 17.6013C15.3645 17.6013 14.9148 17.4151 14.5833 17.0835L9.58329 12.0835C8.65027 12.5291 7.60204 12.6745 6.58296 12.4997C5.56388 12.3248 4.62407 11.8384 3.89294 11.1072C3.16181 10.3761 2.67533 9.43628 2.50048 8.4172C2.32563 7.39812 2.47102 6.3499 2.91663 5.41687L5.83329 8.33354Z",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
};
var _default = exports["default"] = ToolIcon;

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/index.js":
/*!******************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/index.js ***!
  \******************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
var _exportNames = {};
Object.defineProperty(exports, "default", ({
  enumerable: true,
  get: function get() {
    return _sidebarNavigation.default;
  }
}));
var _sidebarNavigation = _interopRequireDefault(__webpack_require__(/*! ./sidebar-navigation */ "../modules/editor-one/assets/js/sidebar-navigation/components/sidebar-navigation.js"));
var _shared = __webpack_require__(/*! ./shared */ "../modules/editor-one/assets/js/sidebar-navigation/components/shared/index.js");
Object.keys(_shared).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _shared[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function get() {
      return _shared[key];
    }
  });
});
var _header = __webpack_require__(/*! ./header */ "../modules/editor-one/assets/js/sidebar-navigation/components/header/index.js");
Object.keys(_header).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _header[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function get() {
      return _header[key];
    }
  });
});
var _menu = __webpack_require__(/*! ./menu */ "../modules/editor-one/assets/js/sidebar-navigation/components/menu/index.js");
Object.keys(_menu).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _menu[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function get() {
      return _menu[key];
    }
  });
});
var _collapsedMenu = __webpack_require__(/*! ./collapsed-menu */ "../modules/editor-one/assets/js/sidebar-navigation/components/collapsed-menu/index.js");
Object.keys(_collapsedMenu).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _collapsedMenu[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function get() {
      return _collapsedMenu[key];
    }
  });
});
var _cta = __webpack_require__(/*! ./cta */ "../modules/editor-one/assets/js/sidebar-navigation/components/cta/index.js");
Object.keys(_cta).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _cta[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function get() {
      return _cta[key];
    }
  });
});

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/menu/index.js":
/*!***********************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/menu/index.js ***!
  \***********************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
Object.defineProperty(exports, "SidebarMenu", ({
  enumerable: true,
  get: function get() {
    return _sidebarMenu.default;
  }
}));
Object.defineProperty(exports, "SidebarMenuItem", ({
  enumerable: true,
  get: function get() {
    return _sidebarMenuItem.default;
  }
}));
var _sidebarMenu = _interopRequireDefault(__webpack_require__(/*! ./sidebar-menu */ "../modules/editor-one/assets/js/sidebar-navigation/components/menu/sidebar-menu.js"));
var _sidebarMenuItem = _interopRequireDefault(__webpack_require__(/*! ./sidebar-menu-item */ "../modules/editor-one/assets/js/sidebar-navigation/components/menu/sidebar-menu-item.js"));

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/menu/sidebar-menu-item.js":
/*!***********************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/menu/sidebar-menu-item.js ***!
  \***********************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
var _react = _interopRequireDefault(__webpack_require__(/*! react */ "react"));
var _slicedToArray2 = _interopRequireDefault(__webpack_require__(/*! @babel/runtime/helpers/slicedToArray */ "../node_modules/@babel/runtime/helpers/slicedToArray.js"));
var _element = __webpack_require__(/*! @wordpress/element */ "../node_modules/@wordpress/element/build-module/index.js");
var _ui = __webpack_require__(/*! @elementor/ui */ "@elementor/ui");
var _propTypes = _interopRequireDefault(__webpack_require__(/*! prop-types */ "../node_modules/prop-types/index.js"));
var _shared = __webpack_require__(/*! ../shared */ "../modules/editor-one/assets/js/sidebar-navigation/components/shared/index.js");
var STORAGE_KEY_PREFIX = 'elementor_sidebar_menu_expanded_v2_';
var SidebarMenuItem = function SidebarMenuItem(_ref) {
  var item = _ref.item,
    isActive = _ref.isActive,
    children = _ref.children,
    activeChildSlug = _ref.activeChildSlug;
  var hasChildren = !!(children !== null && children !== void 0 && children.length);
  var IconComponent = _shared.ICON_MAP[item.icon] || _shared.DEFAULT_ICON;
  var _useState = (0, _element.useState)(function () {
      if (!hasChildren) {
        return false;
      }
      var storageKey = "".concat(STORAGE_KEY_PREFIX).concat(item.slug);
      var shouldExpand = children.some(function (child) {
        return child.slug === activeChildSlug;
      });
      if (shouldExpand) {
        localStorage.setItem(storageKey, 'true');
        return true;
      }
      var stored = localStorage.getItem(storageKey);
      if (null === stored) {
        return true;
      }
      return 'true' === stored;
    }),
    _useState2 = (0, _slicedToArray2.default)(_useState, 2),
    isExpanded = _useState2[0],
    setIsExpanded = _useState2[1];
  var handleClick = (0, _element.useCallback)(function () {
    if (hasChildren) {
      setIsExpanded(function (prev) {
        var newState = !prev;
        localStorage.setItem("".concat(STORAGE_KEY_PREFIX).concat(item.slug), String(newState));
        return newState;
      });
    } else {
      window.location.href = item.url;
    }
  }, [hasChildren, item.slug, item.url]);
  return /*#__PURE__*/_react.default.createElement(_react.default.Fragment, null, /*#__PURE__*/_react.default.createElement(_ui.ListItem, {
    disablePadding: true,
    dense: true,
    disableGutters: true
  }, /*#__PURE__*/_react.default.createElement(_shared.MenuItemButton, {
    onClick: handleClick,
    selected: isActive && !hasChildren
  }, /*#__PURE__*/_react.default.createElement(_shared.MenuIcon, null, /*#__PURE__*/_react.default.createElement(IconComponent, null)), /*#__PURE__*/_react.default.createElement(_ui.ListItemText, {
    primary: item.label,
    primaryTypographyProps: {
      variant: 'body2'
    }
  }), hasChildren && /*#__PURE__*/_react.default.createElement(_shared.ExpandIcon, {
    expanded: isExpanded
  }))), hasChildren && /*#__PURE__*/_react.default.createElement(_ui.Collapse, {
    in: isExpanded,
    timeout: "auto",
    unmountOnExit: true
  }, /*#__PURE__*/_react.default.createElement(_ui.List, {
    disablePadding: true
  }, children.map(function (childItem) {
    return /*#__PURE__*/_react.default.createElement(_shared.ChildListItem, {
      key: childItem.slug,
      disablePadding: true,
      dense: true,
      disableGutters: true
    }, /*#__PURE__*/_react.default.createElement(_shared.ChildMenuItemButton, {
      component: "a",
      href: childItem.url,
      selected: childItem.slug === activeChildSlug
    }, /*#__PURE__*/_react.default.createElement(_ui.ListItemText, {
      primary: childItem.label,
      primaryTypographyProps: {
        variant: 'body2',
        color: 'text.secondary'
      }
    })));
  }))));
};
SidebarMenuItem.propTypes = {
  item: _propTypes.default.object.isRequired,
  isActive: _propTypes.default.bool.isRequired,
  children: _propTypes.default.array,
  activeChildSlug: _propTypes.default.string.isRequired
};
var _default = exports["default"] = SidebarMenuItem;

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/menu/sidebar-menu.js":
/*!******************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/menu/sidebar-menu.js ***!
  \******************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
var _typeof = __webpack_require__(/*! @babel/runtime/helpers/typeof */ "../node_modules/@babel/runtime/helpers/typeof.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
var _react = _interopRequireWildcard(__webpack_require__(/*! react */ "react"));
var _element = __webpack_require__(/*! @wordpress/element */ "../node_modules/@wordpress/element/build-module/index.js");
var _ui = __webpack_require__(/*! @elementor/ui */ "@elementor/ui");
var _propTypes = _interopRequireDefault(__webpack_require__(/*! prop-types */ "../node_modules/prop-types/index.js"));
var _menuActiveStateResolver = _interopRequireDefault(__webpack_require__(/*! ../../classes/menu-active-state-resolver */ "../modules/editor-one/assets/js/sidebar-navigation/classes/menu-active-state-resolver.js"));
var _sidebarMenuItem = _interopRequireDefault(__webpack_require__(/*! ./sidebar-menu-item */ "../modules/editor-one/assets/js/sidebar-navigation/components/menu/sidebar-menu-item.js"));
var _shared = __webpack_require__(/*! ../shared */ "../modules/editor-one/assets/js/sidebar-navigation/components/shared/index.js");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (var _t in e) "default" !== _t && {}.hasOwnProperty.call(e, _t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t)) && (i.get || i.set) ? o(f, _t, i) : f[_t] = e[_t]); return f; })(e, t); }
var SidebarMenu = function SidebarMenu(_ref) {
  var menuItems = _ref.menuItems,
    level4Groups = _ref.level4Groups,
    activeMenuSlug = _ref.activeMenuSlug,
    activeChildSlug = _ref.activeChildSlug;
  var activeStateResolver = (0, _element.useMemo)(function () {
    return new _menuActiveStateResolver.default(activeMenuSlug, activeChildSlug);
  }, [activeMenuSlug, activeChildSlug]);
  var getChildren = function getChildren(item) {
    if (!item.group_id) {
      return null;
    }
    var group = level4Groups[item.group_id];
    if (!group || !group.items || !group.items.length) {
      return null;
    }
    return group.items;
  };
  return /*#__PURE__*/_react.default.createElement(_shared.MenuList, null, menuItems.map(function (item) {
    return /*#__PURE__*/_react.default.createElement(_react.Fragment, {
      key: item.slug
    }, item.has_divider_before && /*#__PURE__*/_react.default.createElement(_ui.Divider, {
      sx: {
        my: 1
      }
    }), /*#__PURE__*/_react.default.createElement(_sidebarMenuItem.default, {
      item: item,
      isActive: activeStateResolver.isMenuActive(item),
      activeChildSlug: activeChildSlug
    }, getChildren(item)));
  }));
};
SidebarMenu.propTypes = {
  menuItems: _propTypes.default.array.isRequired,
  level4Groups: _propTypes.default.object.isRequired,
  activeMenuSlug: _propTypes.default.string.isRequired,
  activeChildSlug: _propTypes.default.string.isRequired
};
var _default = exports["default"] = SidebarMenu;

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/shared/icon-map.js":
/*!****************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/shared/icon-map.js ***!
  \****************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.ICON_MAP = exports.DEFAULT_ICON = void 0;
var _AdjustmentsIcon = _interopRequireDefault(__webpack_require__(/*! @elementor/icons/AdjustmentsIcon */ "@elementor/icons/AdjustmentsIcon"));
var _FolderIcon = _interopRequireDefault(__webpack_require__(/*! @elementor/icons/FolderIcon */ "@elementor/icons/FolderIcon"));
var _RocketIcon = _interopRequireDefault(__webpack_require__(/*! @elementor/icons/RocketIcon */ "@elementor/icons/RocketIcon"));
var _HomeIcon = _interopRequireDefault(__webpack_require__(/*! @elementor/icons/HomeIcon */ "@elementor/icons/HomeIcon"));
var _SendIcon = _interopRequireDefault(__webpack_require__(/*! @elementor/icons/SendIcon */ "@elementor/icons/SendIcon"));
var _SettingsIcon = _interopRequireDefault(__webpack_require__(/*! @elementor/icons/SettingsIcon */ "@elementor/icons/SettingsIcon"));
var _UsersIcon = _interopRequireDefault(__webpack_require__(/*! @elementor/icons/UsersIcon */ "@elementor/icons/UsersIcon"));
var _PlugIcon = _interopRequireDefault(__webpack_require__(/*! @elementor/icons/PlugIcon */ "@elementor/icons/PlugIcon"));
var _tool = _interopRequireDefault(__webpack_require__(/*! ../icons/tool */ "../modules/editor-one/assets/js/sidebar-navigation/components/icons/tool.js"));
var _FileSettingsIcon = _interopRequireDefault(__webpack_require__(/*! @elementor/icons/FileSettingsIcon */ "@elementor/icons/FileSettingsIcon"));
var ICON_MAP = exports.ICON_MAP = {
  adjustments: _AdjustmentsIcon.default,
  folder: _FolderIcon.default,
  home: _RocketIcon.default,
  send: _SendIcon.default,
  settings: _SettingsIcon.default,
  tool: _tool.default,
  users: _UsersIcon.default,
  extension: _PlugIcon.default,
  'file-settings': _FileSettingsIcon.default
};
var DEFAULT_ICON = exports.DEFAULT_ICON = _HomeIcon.default;

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/shared/index.js":
/*!*************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/shared/index.js ***!
  \*************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
var _iconMap = __webpack_require__(/*! ./icon-map */ "../modules/editor-one/assets/js/sidebar-navigation/components/shared/icon-map.js");
Object.keys(_iconMap).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _iconMap[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function get() {
      return _iconMap[key];
    }
  });
});
var _styledComponents = __webpack_require__(/*! ./styled-components */ "../modules/editor-one/assets/js/sidebar-navigation/components/shared/styled-components.js");
Object.keys(_styledComponents).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _styledComponents[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function get() {
      return _styledComponents[key];
    }
  });
});

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/shared/styled-components.js":
/*!*************************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/shared/styled-components.js ***!
  \*************************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.StyledPopover = exports.SiteIconBox = exports.ScrollableContent = exports.PopoverTitle = exports.PopoverListItemButton = exports.PopoverContent = exports.NavContainer = exports.MenuList = exports.MenuItemButton = exports.MenuIcon = exports.ExpandIcon = exports.CollapsedMenuItemContainer = exports.CollapsedIconButton = exports.CollapsedHeaderContainer = exports.CollapseButton = exports.ChildMenuItemButton = exports.ChildListItem = void 0;
var _ui = __webpack_require__(/*! @elementor/ui */ "@elementor/ui");
var _ChevronDownSmallIcon = _interopRequireDefault(__webpack_require__(/*! @elementor/icons/ChevronDownSmallIcon */ "@elementor/icons/ChevronDownSmallIcon"));
var _isRtl = _interopRequireDefault(__webpack_require__(/*! ../../../shared/is-rtl */ "../modules/editor-one/assets/js/shared/is-rtl.js"));
var NavContainer = exports.NavContainer = (0, _ui.styled)(_ui.Box)(function (_ref) {
  var theme = _ref.theme;
  return {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: theme.palette.background.paper,
    borderInlineEnd: "1px solid ".concat(theme.palette.divider)
  };
});
var SiteIconBox = exports.SiteIconBox = (0, _ui.styled)(_ui.Box)(function (_ref2) {
  var theme = _ref2.theme;
  return {
    width: 40,
    height: 40,
    borderRadius: theme.shape.borderRadius * 2,
    border: "1px solid ".concat(theme.palette.divider),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.palette.background.paper,
    color: theme.palette.action.active,
    '& svg': {
      fontSize: 24
    }
  };
});
var CollapseButton = exports.CollapseButton = (0, _ui.styled)(_ui.IconButton, {
  shouldForwardProp: function shouldForwardProp(prop) {
    return prop !== 'expanded';
  }
})(function (_ref3) {
  var theme = _ref3.theme,
    expanded = _ref3.expanded;
  var isRtlLanguage = (0, _isRtl.default)();
  var transform = 'none';
  if (expanded && isRtlLanguage) {
    transform = 'rotate(180deg) scaleX(-1)';
  } else if (expanded) {
    transform = 'rotate(180deg)';
  } else if (isRtlLanguage) {
    transform = 'scaleX(-1)';
  }
  return {
    position: 'absolute',
    insetInlineEnd: -28,
    bottom: -12,
    width: 24,
    height: 24,
    backgroundColor: theme.palette.background.paper,
    border: "1px solid ".concat(theme.palette.divider),
    color: theme.palette.action.active,
    zIndex: 1,
    '&:hover': {
      backgroundColor: theme.palette.background.paper
    },
    '& svg': {
      fontSize: 16,
      transform: transform
    }
  };
});
var ScrollableContent = exports.ScrollableContent = (0, _ui.styled)(_ui.Box)({
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden'
});
var MenuList = exports.MenuList = (0, _ui.styled)(_ui.List)(function (_ref4) {
  var theme = _ref4.theme;
  return {
    padding: theme.spacing(2)
  };
});
var MenuItemButton = exports.MenuItemButton = (0, _ui.styled)(_ui.ListItemButton)(function (_ref5) {
  var theme = _ref5.theme;
  return {
    paddingLeft: theme.spacing(1),
    paddingRight: theme.spacing(1),
    marginBottom: 0,
    paddingBottom: theme.spacing(0.5),
    whiteSpace: 'nowrap',
    justifyContent: 'center',
    borderRadius: 4
  };
});
var MenuIcon = exports.MenuIcon = (0, _ui.styled)(_ui.ListItemIcon)(function (_ref6) {
  var theme = _ref6.theme;
  return {
    minWidth: 'auto',
    color: theme.palette.text.primary,
    margin: 0,
    display: 'flex',
    justifyContent: 'center',
    '& svg': {
      fontSize: 20
    }
  };
});
var ChildMenuItemButton = exports.ChildMenuItemButton = (0, _ui.styled)(_ui.ListItemButton)(function (_ref7) {
  var theme = _ref7.theme;
  return {
    paddingLeft: theme.spacing(6),
    paddingRight: theme.spacing(2),
    minHeight: 32,
    whiteSpace: 'nowrap',
    borderRadius: 4
  };
});
var ChildListItem = exports.ChildListItem = (0, _ui.styled)(_ui.ListItem)({
  maxHeight: 32
});
var ExpandIcon = exports.ExpandIcon = (0, _ui.styled)(_ChevronDownSmallIcon.default, {
  shouldForwardProp: function shouldForwardProp(prop) {
    return prop !== 'expanded';
  }
})(function (_ref8) {
  var expanded = _ref8.expanded;
  return {
    fontSize: 20,
    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
    transition: 'transform 0.2s'
  };
});
var CollapsedMenuItemContainer = exports.CollapsedMenuItemContainer = (0, _ui.styled)(_ui.Box)(function (_ref9) {
  var theme = _ref9.theme;
  return {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: theme.spacing(0.5)
  };
});
var CollapsedIconButton = exports.CollapsedIconButton = (0, _ui.styled)(_ui.IconButton, {
  shouldForwardProp: function shouldForwardProp(prop) {
    return prop !== 'isHighlighted';
  }
})(function (_ref0) {
  var theme = _ref0.theme,
    isHighlighted = _ref0.isHighlighted;
  return {
    width: 36,
    height: 36,
    borderRadius: theme.shape.borderRadius,
    backgroundColor: isHighlighted ? theme.palette.action.selected : 'transparent',
    color: theme.palette.text.primary,
    '&:hover': {
      backgroundColor: theme.palette.action.hover
    },
    '& svg': {
      fontSize: 20
    }
  };
});
var PopoverTitle = exports.PopoverTitle = (0, _ui.styled)(_ui.ListSubheader)(function (_ref1) {
  var theme = _ref1.theme;
  return {
    color: theme.palette.text.tertiary,
    fontSize: 12,
    fontWeight: 400,
    height: 28
  };
});
var PopoverContent = exports.PopoverContent = (0, _ui.styled)(_ui.Box)(function (_ref10) {
  var theme = _ref10.theme;
  return {
    paddingTop: theme.spacing(1),
    paddingBottom: theme.spacing(1)
  };
});
var CollapsedHeaderContainer = exports.CollapsedHeaderContainer = (0, _ui.styled)(_ui.Box)(function (_ref11) {
  var theme = _ref11.theme;
  return {
    position: 'relative',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: 80,
    marginLeft: theme.spacing(2),
    marginRight: theme.spacing(2),
    borderBottom: "1px solid ".concat(theme.palette.divider)
  };
});
var PopoverListItemButton = exports.PopoverListItemButton = (0, _ui.styled)(_ui.ListItemButton)(function (_ref12) {
  var theme = _ref12.theme;
  return {
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
    paddingTop: theme.spacing(0.5),
    paddingBottom: theme.spacing(0.5),
    borderRadius: 4
  };
});
var StyledPopover = exports.StyledPopover = (0, _ui.styled)(_ui.Popover)(function (_ref13) {
  var theme = _ref13.theme;
  return {
    pointerEvents: 'none',
    '& .MuiPaper-root': {
      marginLeft: theme.spacing(1),
      minWidth: 180,
      borderRadius: theme.shape.borderRadius,
      pointerEvents: 'auto'
    }
  };
});

/***/ }),

/***/ "../modules/editor-one/assets/js/sidebar-navigation/components/sidebar-navigation.js":
/*!*******************************************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/components/sidebar-navigation.js ***!
  \*******************************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
var _react = _interopRequireDefault(__webpack_require__(/*! react */ "react"));
var _ui = __webpack_require__(/*! @elementor/ui */ "@elementor/ui");
var _ChevronRightIcon = _interopRequireDefault(__webpack_require__(/*! @elementor/icons/ChevronRightIcon */ "@elementor/icons/ChevronRightIcon"));
var _editor = _interopRequireDefault(__webpack_require__(/*! ./icons/editor */ "../modules/editor-one/assets/js/sidebar-navigation/components/icons/editor.js"));
var _propTypes = _interopRequireDefault(__webpack_require__(/*! prop-types */ "../node_modules/prop-types/index.js"));
var _collapsedMenu = __webpack_require__(/*! ./collapsed-menu */ "../modules/editor-one/assets/js/sidebar-navigation/components/collapsed-menu/index.js");
var _cta = __webpack_require__(/*! ./cta */ "../modules/editor-one/assets/js/sidebar-navigation/components/cta/index.js");
var _header = __webpack_require__(/*! ./header */ "../modules/editor-one/assets/js/sidebar-navigation/components/header/index.js");
var _menu = __webpack_require__(/*! ./menu */ "../modules/editor-one/assets/js/sidebar-navigation/components/menu/index.js");
var _shared = __webpack_require__(/*! ./shared */ "../modules/editor-one/assets/js/sidebar-navigation/components/shared/index.js");
var _useSidebarCollapse2 = __webpack_require__(/*! ./hooks/use-sidebar-collapse */ "../modules/editor-one/assets/js/sidebar-navigation/components/hooks/use-sidebar-collapse.js");
var _useAdminMenuOffset = __webpack_require__(/*! ./hooks/use-admin-menu-offset */ "../modules/editor-one/assets/js/sidebar-navigation/components/hooks/use-admin-menu-offset.js");
var SidebarNavigation = function SidebarNavigation(_ref) {
  var config = _ref.config;
  var _useSidebarCollapse = (0, _useSidebarCollapse2.useSidebarCollapse)(),
    isCollapsed = _useSidebarCollapse.isCollapsed,
    toggleCollapse = _useSidebarCollapse.toggleCollapse;
  (0, _useAdminMenuOffset.useAdminMenuOffset)();
  if (isCollapsed) {
    return /*#__PURE__*/_react.default.createElement(_shared.NavContainer, {
      component: "nav",
      collapsed: true
    }, /*#__PURE__*/_react.default.createElement(_shared.CollapsedHeaderContainer, null, /*#__PURE__*/_react.default.createElement(_shared.SiteIconBox, null, /*#__PURE__*/_react.default.createElement(_editor.default, null)), /*#__PURE__*/_react.default.createElement(_shared.CollapseButton, {
      onClick: toggleCollapse,
      size: "small"
    }, /*#__PURE__*/_react.default.createElement(_ChevronRightIcon.default, null))), /*#__PURE__*/_react.default.createElement(_shared.ScrollableContent, null, /*#__PURE__*/_react.default.createElement(_collapsedMenu.SidebarCollapsedMenu, {
      menuItems: config.menuItems,
      level4Groups: config.level4Groups,
      activeMenuSlug: config.activeMenuSlug,
      activeChildSlug: config.activeChildSlug
    })), /*#__PURE__*/_react.default.createElement(_ui.Divider, null), /*#__PURE__*/_react.default.createElement(_cta.SidebarUpgradeCta, {
      upgradeUrl: config.upgradeUrl,
      upgradeText: config.upgradeText,
      hasPro: config.hasPro,
      collapsed: true
    }));
  }
  return /*#__PURE__*/_react.default.createElement(_shared.NavContainer, {
    component: "nav"
  }, /*#__PURE__*/_react.default.createElement(_header.SidebarHeader, {
    siteTitle: config.siteTitle,
    onCollapse: toggleCollapse
  }), /*#__PURE__*/_react.default.createElement(_shared.ScrollableContent, null, /*#__PURE__*/_react.default.createElement(_menu.SidebarMenu, {
    menuItems: config.menuItems,
    level4Groups: config.level4Groups,
    activeMenuSlug: config.activeMenuSlug,
    activeChildSlug: config.activeChildSlug
  })), /*#__PURE__*/_react.default.createElement(_ui.Divider, null), /*#__PURE__*/_react.default.createElement(_cta.SidebarUpgradeCta, {
    upgradeUrl: config.upgradeUrl,
    upgradeText: config.upgradeText,
    hasPro: config.hasPro
  }));
};
SidebarNavigation.propTypes = {
  config: _propTypes.default.object.isRequired
};
var _default = exports["default"] = SidebarNavigation;

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

/***/ "../node_modules/@babel/runtime/helpers/extends.js":
/*!*********************************************************!*\
  !*** ../node_modules/@babel/runtime/helpers/extends.js ***!
  \*********************************************************/
/***/ ((module) => {

function _extends() {
  return module.exports = _extends = Object.assign ? Object.assign.bind() : function (n) {
    for (var e = 1; e < arguments.length; e++) {
      var t = arguments[e];
      for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
    }
    return n;
  }, module.exports.__esModule = true, module.exports["default"] = module.exports, _extends.apply(null, arguments);
}
module.exports = _extends, module.exports.__esModule = true, module.exports["default"] = module.exports;

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

/***/ }),

/***/ "../node_modules/@wordpress/element/build-module/create-interpolate-element.js":
/*!*************************************************************************************!*\
  !*** ../node_modules/@wordpress/element/build-module/create-interpolate-element.js ***!
  \*************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./react */ "react");
/* harmony import */ var _react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_react__WEBPACK_IMPORTED_MODULE_0__);
/**
 * Internal dependencies
 */


/**
 * Object containing a React element.
 *
 * @typedef {import('react').ReactElement} Element
 */

let indoc, offset, output, stack;

/**
 * Matches tags in the localized string
 *
 * This is used for extracting the tag pattern groups for parsing the localized
 * string and along with the map converting it to a react element.
 *
 * There are four references extracted using this tokenizer:
 *
 * match: Full match of the tag (i.e. <strong>, </strong>, <br/>)
 * isClosing: The closing slash, if it exists.
 * name: The name portion of the tag (strong, br) (if )
 * isSelfClosed: The slash on a self closing tag, if it exists.
 *
 * @type {RegExp}
 */
const tokenizer = /<(\/)?(\w+)\s*(\/)?>/g;

/**
 * The stack frame tracking parse progress.
 *
 * @typedef Frame
 *
 * @property {Element}   element            A parent element which may still have
 * @property {number}    tokenStart         Offset at which parent element first
 *                                          appears.
 * @property {number}    tokenLength        Length of string marking start of parent
 *                                          element.
 * @property {number}    [prevOffset]       Running offset at which parsing should
 *                                          continue.
 * @property {number}    [leadingTextStart] Offset at which last closing element
 *                                          finished, used for finding text between
 *                                          elements.
 * @property {Element[]} children           Children.
 */

/**
 * Tracks recursive-descent parse state.
 *
 * This is a Stack frame holding parent elements until all children have been
 * parsed.
 *
 * @private
 * @param {Element} element            A parent element which may still have
 *                                     nested children not yet parsed.
 * @param {number}  tokenStart         Offset at which parent element first
 *                                     appears.
 * @param {number}  tokenLength        Length of string marking start of parent
 *                                     element.
 * @param {number}  [prevOffset]       Running offset at which parsing should
 *                                     continue.
 * @param {number}  [leadingTextStart] Offset at which last closing element
 *                                     finished, used for finding text between
 *                                     elements.
 *
 * @return {Frame} The stack frame tracking parse progress.
 */
function createFrame(element, tokenStart, tokenLength, prevOffset, leadingTextStart) {
  return {
    element,
    tokenStart,
    tokenLength,
    prevOffset,
    leadingTextStart,
    children: []
  };
}

/**
 * This function creates an interpolated element from a passed in string with
 * specific tags matching how the string should be converted to an element via
 * the conversion map value.
 *
 * @example
 * For example, for the given string:
 *
 * "This is a <span>string</span> with <a>a link</a> and a self-closing
 * <CustomComponentB/> tag"
 *
 * You would have something like this as the conversionMap value:
 *
 * ```js
 * {
 *     span: <span />,
 *     a: <a href={ 'https://github.com' } />,
 *     CustomComponentB: <CustomComponent />,
 * }
 * ```
 *
 * @param {string}                  interpolatedString The interpolation string to be parsed.
 * @param {Record<string, Element>} conversionMap      The map used to convert the string to
 *                                                     a react element.
 * @throws {TypeError}
 * @return {Element}  A wp element.
 */
const createInterpolateElement = (interpolatedString, conversionMap) => {
  indoc = interpolatedString;
  offset = 0;
  output = [];
  stack = [];
  tokenizer.lastIndex = 0;
  if (!isValidConversionMap(conversionMap)) {
    throw new TypeError('The conversionMap provided is not valid. It must be an object with values that are React Elements');
  }
  do {
    // twiddle our thumbs
  } while (proceed(conversionMap));
  return (0,_react__WEBPACK_IMPORTED_MODULE_0__.createElement)(_react__WEBPACK_IMPORTED_MODULE_0__.Fragment, null, ...output);
};

/**
 * Validate conversion map.
 *
 * A map is considered valid if it's an object and every value in the object
 * is a React Element
 *
 * @private
 *
 * @param {Object} conversionMap The map being validated.
 *
 * @return {boolean}  True means the map is valid.
 */
const isValidConversionMap = conversionMap => {
  const isObject = typeof conversionMap === 'object';
  const values = isObject && Object.values(conversionMap);
  return isObject && values.length && values.every(element => (0,_react__WEBPACK_IMPORTED_MODULE_0__.isValidElement)(element));
};

/**
 * This is the iterator over the matches in the string.
 *
 * @private
 *
 * @param {Object} conversionMap The conversion map for the string.
 *
 * @return {boolean} true for continuing to iterate, false for finished.
 */
function proceed(conversionMap) {
  const next = nextToken();
  const [tokenType, name, startOffset, tokenLength] = next;
  const stackDepth = stack.length;
  const leadingTextStart = startOffset > offset ? offset : null;
  if (!conversionMap[name]) {
    addText();
    return false;
  }
  switch (tokenType) {
    case 'no-more-tokens':
      if (stackDepth !== 0) {
        const {
          leadingTextStart: stackLeadingText,
          tokenStart
        } = stack.pop();
        output.push(indoc.substr(stackLeadingText, tokenStart));
      }
      addText();
      return false;
    case 'self-closed':
      if (0 === stackDepth) {
        if (null !== leadingTextStart) {
          output.push(indoc.substr(leadingTextStart, startOffset - leadingTextStart));
        }
        output.push(conversionMap[name]);
        offset = startOffset + tokenLength;
        return true;
      }

      // Otherwise we found an inner element.
      addChild(createFrame(conversionMap[name], startOffset, tokenLength));
      offset = startOffset + tokenLength;
      return true;
    case 'opener':
      stack.push(createFrame(conversionMap[name], startOffset, tokenLength, startOffset + tokenLength, leadingTextStart));
      offset = startOffset + tokenLength;
      return true;
    case 'closer':
      // If we're not nesting then this is easy - close the block.
      if (1 === stackDepth) {
        closeOuterElement(startOffset);
        offset = startOffset + tokenLength;
        return true;
      }

      // Otherwise we're nested and we have to close out the current
      // block and add it as a innerBlock to the parent.
      const stackTop = stack.pop();
      const text = indoc.substr(stackTop.prevOffset, startOffset - stackTop.prevOffset);
      stackTop.children.push(text);
      stackTop.prevOffset = startOffset + tokenLength;
      const frame = createFrame(stackTop.element, stackTop.tokenStart, stackTop.tokenLength, startOffset + tokenLength);
      frame.children = stackTop.children;
      addChild(frame);
      offset = startOffset + tokenLength;
      return true;
    default:
      addText();
      return false;
  }
}

/**
 * Grabs the next token match in the string and returns it's details.
 *
 * @private
 *
 * @return {Array}  An array of details for the token matched.
 */
function nextToken() {
  const matches = tokenizer.exec(indoc);
  // We have no more tokens.
  if (null === matches) {
    return ['no-more-tokens'];
  }
  const startedAt = matches.index;
  const [match, isClosing, name, isSelfClosed] = matches;
  const length = match.length;
  if (isSelfClosed) {
    return ['self-closed', name, startedAt, length];
  }
  if (isClosing) {
    return ['closer', name, startedAt, length];
  }
  return ['opener', name, startedAt, length];
}

/**
 * Pushes text extracted from the indoc string to the output stack given the
 * current rawLength value and offset (if rawLength is provided ) or the
 * indoc.length and offset.
 *
 * @private
 */
function addText() {
  const length = indoc.length - offset;
  if (0 === length) {
    return;
  }
  output.push(indoc.substr(offset, length));
}

/**
 * Pushes a child element to the associated parent element's children for the
 * parent currently active in the stack.
 *
 * @private
 *
 * @param {Frame} frame The Frame containing the child element and it's
 *                      token information.
 */
function addChild(frame) {
  const {
    element,
    tokenStart,
    tokenLength,
    prevOffset,
    children
  } = frame;
  const parent = stack[stack.length - 1];
  const text = indoc.substr(parent.prevOffset, tokenStart - parent.prevOffset);
  if (text) {
    parent.children.push(text);
  }
  parent.children.push((0,_react__WEBPACK_IMPORTED_MODULE_0__.cloneElement)(element, null, ...children));
  parent.prevOffset = prevOffset ? prevOffset : tokenStart + tokenLength;
}

/**
 * This is called for closing tags. It creates the element currently active in
 * the stack.
 *
 * @private
 *
 * @param {number} endOffset Offset at which the closing tag for the element
 *                           begins in the string. If this is greater than the
 *                           prevOffset attached to the element, then this
 *                           helps capture any remaining nested text nodes in
 *                           the element.
 */
function closeOuterElement(endOffset) {
  const {
    element,
    leadingTextStart,
    prevOffset,
    tokenStart,
    children
  } = stack.pop();
  const text = endOffset ? indoc.substr(prevOffset, endOffset - prevOffset) : indoc.substr(prevOffset);
  if (text) {
    children.push(text);
  }
  if (null !== leadingTextStart) {
    output.push(indoc.substr(leadingTextStart, tokenStart - leadingTextStart));
  }
  output.push((0,_react__WEBPACK_IMPORTED_MODULE_0__.cloneElement)(element, null, ...children));
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (createInterpolateElement);
//# sourceMappingURL=create-interpolate-element.js.map

/***/ }),

/***/ "../node_modules/@wordpress/element/build-module/index.js":
/*!****************************************************************!*\
  !*** ../node_modules/@wordpress/element/build-module/index.js ***!
  \****************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Children: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.Children),
/* harmony export */   Component: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.Component),
/* harmony export */   Fragment: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.Fragment),
/* harmony export */   Platform: () => (/* reexport safe */ _platform__WEBPACK_IMPORTED_MODULE_4__["default"]),
/* harmony export */   PureComponent: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.PureComponent),
/* harmony export */   RawHTML: () => (/* reexport safe */ _raw_html__WEBPACK_IMPORTED_MODULE_6__["default"]),
/* harmony export */   StrictMode: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.StrictMode),
/* harmony export */   Suspense: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.Suspense),
/* harmony export */   cloneElement: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.cloneElement),
/* harmony export */   concatChildren: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.concatChildren),
/* harmony export */   createContext: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.createContext),
/* harmony export */   createElement: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.createElement),
/* harmony export */   createInterpolateElement: () => (/* reexport safe */ _create_interpolate_element__WEBPACK_IMPORTED_MODULE_0__["default"]),
/* harmony export */   createPortal: () => (/* reexport safe */ _react_platform__WEBPACK_IMPORTED_MODULE_2__.createPortal),
/* harmony export */   createRef: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.createRef),
/* harmony export */   createRoot: () => (/* reexport safe */ _react_platform__WEBPACK_IMPORTED_MODULE_2__.createRoot),
/* harmony export */   findDOMNode: () => (/* reexport safe */ _react_platform__WEBPACK_IMPORTED_MODULE_2__.findDOMNode),
/* harmony export */   flushSync: () => (/* reexport safe */ _react_platform__WEBPACK_IMPORTED_MODULE_2__.flushSync),
/* harmony export */   forwardRef: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.forwardRef),
/* harmony export */   hydrate: () => (/* reexport safe */ _react_platform__WEBPACK_IMPORTED_MODULE_2__.hydrate),
/* harmony export */   hydrateRoot: () => (/* reexport safe */ _react_platform__WEBPACK_IMPORTED_MODULE_2__.hydrateRoot),
/* harmony export */   isEmptyElement: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_3__.isEmptyElement),
/* harmony export */   isValidElement: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.isValidElement),
/* harmony export */   lazy: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.lazy),
/* harmony export */   memo: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.memo),
/* harmony export */   render: () => (/* reexport safe */ _react_platform__WEBPACK_IMPORTED_MODULE_2__.render),
/* harmony export */   renderToString: () => (/* reexport safe */ _serialize__WEBPACK_IMPORTED_MODULE_5__["default"]),
/* harmony export */   startTransition: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.startTransition),
/* harmony export */   switchChildrenNodeName: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.switchChildrenNodeName),
/* harmony export */   unmountComponentAtNode: () => (/* reexport safe */ _react_platform__WEBPACK_IMPORTED_MODULE_2__.unmountComponentAtNode),
/* harmony export */   useCallback: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.useCallback),
/* harmony export */   useContext: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.useContext),
/* harmony export */   useDebugValue: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.useDebugValue),
/* harmony export */   useDeferredValue: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.useDeferredValue),
/* harmony export */   useEffect: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.useEffect),
/* harmony export */   useId: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.useId),
/* harmony export */   useImperativeHandle: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.useImperativeHandle),
/* harmony export */   useInsertionEffect: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.useInsertionEffect),
/* harmony export */   useLayoutEffect: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.useLayoutEffect),
/* harmony export */   useMemo: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.useMemo),
/* harmony export */   useReducer: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.useReducer),
/* harmony export */   useRef: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.useRef),
/* harmony export */   useState: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.useState),
/* harmony export */   useSyncExternalStore: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.useSyncExternalStore),
/* harmony export */   useTransition: () => (/* reexport safe */ _react__WEBPACK_IMPORTED_MODULE_1__.useTransition)
/* harmony export */ });
/* harmony import */ var _create_interpolate_element__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./create-interpolate-element */ "../node_modules/@wordpress/element/build-module/create-interpolate-element.js");
/* harmony import */ var _react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./react */ "../node_modules/@wordpress/element/build-module/react.js");
/* harmony import */ var _react_platform__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./react-platform */ "../node_modules/@wordpress/element/build-module/react-platform.js");
/* harmony import */ var _utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./utils */ "../node_modules/@wordpress/element/build-module/utils.js");
/* harmony import */ var _platform__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./platform */ "../node_modules/@wordpress/element/build-module/platform.js");
/* harmony import */ var _serialize__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./serialize */ "../node_modules/@wordpress/element/build-module/serialize.js");
/* harmony import */ var _raw_html__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./raw-html */ "../node_modules/@wordpress/element/build-module/raw-html.js");







//# sourceMappingURL=index.js.map

/***/ }),

/***/ "../node_modules/@wordpress/element/build-module/platform.js":
/*!*******************************************************************!*\
  !*** ../node_modules/@wordpress/element/build-module/platform.js ***!
  \*******************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/**
 * Parts of this source were derived and modified from react-native-web,
 * released under the MIT license.
 *
 * Copyright (c) 2016-present, Nicolas Gallagher.
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 */
const Platform = {
  OS: 'web',
  select: spec => 'web' in spec ? spec.web : spec.default,
  isWeb: true
};
/**
 * Component used to detect the current Platform being used.
 * Use Platform.OS === 'web' to detect if running on web enviroment.
 *
 * This is the same concept as the React Native implementation.
 *
 * @see https://reactnative.dev/docs/platform-specific-code#platform-module
 *
 * Here is an example of how to use the select method:
 * @example
 * ```js
 * import { Platform } from '@wordpress/element';
 *
 * const placeholderLabel = Platform.select( {
 *   native: __( 'Add media' ),
 *   web: __( 'Drag images, upload new ones or select files from your library.' ),
 * } );
 * ```
 */
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (Platform);
//# sourceMappingURL=platform.js.map

/***/ }),

/***/ "../node_modules/@wordpress/element/build-module/raw-html.js":
/*!*******************************************************************!*\
  !*** ../node_modules/@wordpress/element/build-module/raw-html.js ***!
  \*******************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ RawHTML)
/* harmony export */ });
/* harmony import */ var _react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./react */ "react");
/* harmony import */ var _react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_react__WEBPACK_IMPORTED_MODULE_0__);
/**
 * Internal dependencies
 */


/** @typedef {{children: string} & import('react').ComponentPropsWithoutRef<'div'>} RawHTMLProps */

/**
 * Component used as equivalent of Fragment with unescaped HTML, in cases where
 * it is desirable to render dangerous HTML without needing a wrapper element.
 * To preserve additional props, a `div` wrapper _will_ be created if any props
 * aside from `children` are passed.
 *
 * @param {RawHTMLProps} props Children should be a string of HTML or an array
 *                             of strings. Other props will be passed through
 *                             to the div wrapper.
 *
 * @return {JSX.Element} Dangerously-rendering component.
 */
function RawHTML({
  children,
  ...props
}) {
  let rawHtml = '';

  // Cast children as an array, and concatenate each element if it is a string.
  _react__WEBPACK_IMPORTED_MODULE_0__.Children.toArray(children).forEach(child => {
    if (typeof child === 'string' && child.trim() !== '') {
      rawHtml += child;
    }
  });

  // The `div` wrapper will be stripped by the `renderElement` serializer in
  // `./serialize.js` unless there are non-children props present.
  return (0,_react__WEBPACK_IMPORTED_MODULE_0__.createElement)('div', {
    dangerouslySetInnerHTML: {
      __html: rawHtml
    },
    ...props
  });
}
//# sourceMappingURL=raw-html.js.map

/***/ }),

/***/ "../node_modules/@wordpress/element/build-module/react-platform.js":
/*!*************************************************************************!*\
  !*** ../node_modules/@wordpress/element/build-module/react-platform.js ***!
  \*************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createPortal: () => (/* reexport safe */ react_dom__WEBPACK_IMPORTED_MODULE_0__.createPortal),
/* harmony export */   createRoot: () => (/* reexport safe */ react_dom_client__WEBPACK_IMPORTED_MODULE_1__.createRoot),
/* harmony export */   findDOMNode: () => (/* reexport safe */ react_dom__WEBPACK_IMPORTED_MODULE_0__.findDOMNode),
/* harmony export */   flushSync: () => (/* reexport safe */ react_dom__WEBPACK_IMPORTED_MODULE_0__.flushSync),
/* harmony export */   hydrate: () => (/* reexport safe */ react_dom__WEBPACK_IMPORTED_MODULE_0__.hydrate),
/* harmony export */   hydrateRoot: () => (/* reexport safe */ react_dom_client__WEBPACK_IMPORTED_MODULE_1__.hydrateRoot),
/* harmony export */   render: () => (/* reexport safe */ react_dom__WEBPACK_IMPORTED_MODULE_0__.render),
/* harmony export */   unmountComponentAtNode: () => (/* reexport safe */ react_dom__WEBPACK_IMPORTED_MODULE_0__.unmountComponentAtNode)
/* harmony export */ });
/* harmony import */ var react_dom__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react-dom */ "react-dom");
/* harmony import */ var react_dom__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react_dom__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react-dom/client */ "../node_modules/react-dom/client.js");
/**
 * External dependencies
 */



/**
 * Creates a portal into which a component can be rendered.
 *
 * @see https://github.com/facebook/react/issues/10309#issuecomment-318433235
 *
 * @param {import('react').ReactElement} child     Any renderable child, such as an element,
 *                                                 string, or fragment.
 * @param {HTMLElement}                  container DOM node into which element should be rendered.
 */


/**
 * Finds the dom node of a React component.
 *
 * @param {import('react').ComponentType} component Component's instance.
 */


/**
 * Forces React to flush any updates inside the provided callback synchronously.
 *
 * @param {Function} callback Callback to run synchronously.
 */


/**
 * Renders a given element into the target DOM node.
 *
 * @deprecated since WordPress 6.2.0. Use `createRoot` instead.
 * @see https://react.dev/reference/react-dom/render
 */


/**
 * Hydrates a given element into the target DOM node.
 *
 * @deprecated since WordPress 6.2.0. Use `hydrateRoot` instead.
 * @see https://react.dev/reference/react-dom/hydrate
 */


/**
 * Creates a new React root for the target DOM node.
 *
 * @since 6.2.0 Introduced in WordPress core.
 * @see https://react.dev/reference/react-dom/client/createRoot
 */


/**
 * Creates a new React root for the target DOM node and hydrates it with a pre-generated markup.
 *
 * @since 6.2.0 Introduced in WordPress core.
 * @see https://react.dev/reference/react-dom/client/hydrateRoot
 */


/**
 * Removes any mounted element from the target DOM node.
 *
 * @deprecated since WordPress 6.2.0. Use `root.unmount()` instead.
 * @see https://react.dev/reference/react-dom/unmountComponentAtNode
 */

//# sourceMappingURL=react-platform.js.map

/***/ }),

/***/ "../node_modules/@wordpress/element/build-module/react.js":
/*!****************************************************************!*\
  !*** ../node_modules/@wordpress/element/build-module/react.js ***!
  \****************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Children: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.Children),
/* harmony export */   Component: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.Component),
/* harmony export */   Fragment: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.Fragment),
/* harmony export */   PureComponent: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.PureComponent),
/* harmony export */   StrictMode: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.StrictMode),
/* harmony export */   Suspense: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.Suspense),
/* harmony export */   cloneElement: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.cloneElement),
/* harmony export */   concatChildren: () => (/* binding */ concatChildren),
/* harmony export */   createContext: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.createContext),
/* harmony export */   createElement: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.createElement),
/* harmony export */   createRef: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.createRef),
/* harmony export */   forwardRef: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.forwardRef),
/* harmony export */   isValidElement: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.isValidElement),
/* harmony export */   lazy: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.lazy),
/* harmony export */   memo: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.memo),
/* harmony export */   startTransition: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.startTransition),
/* harmony export */   switchChildrenNodeName: () => (/* binding */ switchChildrenNodeName),
/* harmony export */   useCallback: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.useCallback),
/* harmony export */   useContext: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.useContext),
/* harmony export */   useDebugValue: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.useDebugValue),
/* harmony export */   useDeferredValue: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.useDeferredValue),
/* harmony export */   useEffect: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.useEffect),
/* harmony export */   useId: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.useId),
/* harmony export */   useImperativeHandle: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.useImperativeHandle),
/* harmony export */   useInsertionEffect: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.useInsertionEffect),
/* harmony export */   useLayoutEffect: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.useLayoutEffect),
/* harmony export */   useMemo: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.useMemo),
/* harmony export */   useReducer: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.useReducer),
/* harmony export */   useRef: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.useRef),
/* harmony export */   useState: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.useState),
/* harmony export */   useSyncExternalStore: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.useSyncExternalStore),
/* harmony export */   useTransition: () => (/* reexport safe */ react__WEBPACK_IMPORTED_MODULE_0__.useTransition)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "react");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
/**
 * External dependencies
 */
// eslint-disable-next-line @typescript-eslint/no-restricted-imports


/**
 * Object containing a React element.
 *
 * @typedef {import('react').ReactElement} Element
 */

/**
 * Object containing a React component.
 *
 * @typedef {import('react').ComponentType} ComponentType
 */

/**
 * Object containing a React synthetic event.
 *
 * @typedef {import('react').SyntheticEvent} SyntheticEvent
 */

/**
 * Object containing a React synthetic event.
 *
 * @template T
 * @typedef {import('react').RefObject<T>} RefObject<T>
 */

/**
 * Object that provides utilities for dealing with React children.
 */


/**
 * Creates a copy of an element with extended props.
 *
 * @param {Element} element Element
 * @param {?Object} props   Props to apply to cloned element
 *
 * @return {Element} Cloned element.
 */


/**
 * A base class to create WordPress Components (Refs, state and lifecycle hooks)
 */


/**
 * Creates a context object containing two components: a provider and consumer.
 *
 * @param {Object} defaultValue A default data stored in the context.
 *
 * @return {Object} Context object.
 */


/**
 * Returns a new element of given type. Type can be either a string tag name or
 * another function which itself returns an element.
 *
 * @param {?(string|Function)} type     Tag name or element creator
 * @param {Object}             props    Element properties, either attribute
 *                                      set to apply to DOM node or values to
 *                                      pass through to element creator
 * @param {...Element}         children Descendant elements
 *
 * @return {Element} Element.
 */


/**
 * Returns an object tracking a reference to a rendered element via its
 * `current` property as either a DOMElement or Element, dependent upon the
 * type of element rendered with the ref attribute.
 *
 * @return {Object} Ref object.
 */


/**
 * Component enhancer used to enable passing a ref to its wrapped component.
 * Pass a function argument which receives `props` and `ref` as its arguments,
 * returning an element using the forwarded ref. The return value is a new
 * component which forwards its ref.
 *
 * @param {Function} forwarder Function passed `props` and `ref`, expected to
 *                             return an element.
 *
 * @return {Component} Enhanced component.
 */


/**
 * A component which renders its children without any wrapping element.
 */


/**
 * Checks if an object is a valid React Element.
 *
 * @param {Object} objectToCheck The object to be checked.
 *
 * @return {boolean} true if objectToTest is a valid React Element and false otherwise.
 */


/**
 * @see https://reactjs.org/docs/react-api.html#reactmemo
 */


/**
 * Component that activates additional checks and warnings for its descendants.
 */


/**
 * @see https://reactjs.org/docs/hooks-reference.html#usecallback
 */


/**
 * @see https://reactjs.org/docs/hooks-reference.html#usecontext
 */


/**
 * @see https://reactjs.org/docs/hooks-reference.html#usedebugvalue
 */


/**
 * @see https://reactjs.org/docs/hooks-reference.html#usedeferredvalue
 */


/**
 * @see https://reactjs.org/docs/hooks-reference.html#useeffect
 */


/**
 * @see https://reactjs.org/docs/hooks-reference.html#useid
 */


/**
 * @see https://reactjs.org/docs/hooks-reference.html#useimperativehandle
 */


/**
 * @see https://reactjs.org/docs/hooks-reference.html#useinsertioneffect
 */


/**
 * @see https://reactjs.org/docs/hooks-reference.html#uselayouteffect
 */


/**
 * @see https://reactjs.org/docs/hooks-reference.html#usememo
 */


/**
 * @see https://reactjs.org/docs/hooks-reference.html#usereducer
 */


/**
 * @see https://reactjs.org/docs/hooks-reference.html#useref
 */


/**
 * @see https://reactjs.org/docs/hooks-reference.html#usestate
 */


/**
 * @see https://reactjs.org/docs/hooks-reference.html#usesyncexternalstore
 */


/**
 * @see https://reactjs.org/docs/hooks-reference.html#usetransition
 */


/**
 * @see https://reactjs.org/docs/react-api.html#starttransition
 */


/**
 * @see https://reactjs.org/docs/react-api.html#reactlazy
 */


/**
 * @see https://reactjs.org/docs/react-api.html#reactsuspense
 */


/**
 * @see https://reactjs.org/docs/react-api.html#reactpurecomponent
 */


/**
 * Concatenate two or more React children objects.
 *
 * @param {...?Object} childrenArguments Array of children arguments (array of arrays/strings/objects) to concatenate.
 *
 * @return {Array} The concatenated value.
 */
function concatChildren(...childrenArguments) {
  return childrenArguments.reduce((accumulator, children, i) => {
    react__WEBPACK_IMPORTED_MODULE_0__.Children.forEach(children, (child, j) => {
      if (child && 'string' !== typeof child) {
        child = (0,react__WEBPACK_IMPORTED_MODULE_0__.cloneElement)(child, {
          key: [i, j].join()
        });
      }
      accumulator.push(child);
    });
    return accumulator;
  }, []);
}

/**
 * Switches the nodeName of all the elements in the children object.
 *
 * @param {?Object} children Children object.
 * @param {string}  nodeName Node name.
 *
 * @return {?Object} The updated children object.
 */
function switchChildrenNodeName(children, nodeName) {
  return children && react__WEBPACK_IMPORTED_MODULE_0__.Children.map(children, (elt, index) => {
    if (typeof elt?.valueOf() === 'string') {
      return (0,react__WEBPACK_IMPORTED_MODULE_0__.createElement)(nodeName, {
        key: index
      }, elt);
    }
    const {
      children: childrenProp,
      ...props
    } = elt.props;
    return (0,react__WEBPACK_IMPORTED_MODULE_0__.createElement)(nodeName, {
      key: index,
      ...props
    }, childrenProp);
  });
}
//# sourceMappingURL=react.js.map

/***/ }),

/***/ "../node_modules/@wordpress/element/build-module/serialize.js":
/*!********************************************************************!*\
  !*** ../node_modules/@wordpress/element/build-module/serialize.js ***!
  \********************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   hasPrefix: () => (/* binding */ hasPrefix),
/* harmony export */   renderAttributes: () => (/* binding */ renderAttributes),
/* harmony export */   renderComponent: () => (/* binding */ renderComponent),
/* harmony export */   renderElement: () => (/* binding */ renderElement),
/* harmony export */   renderNativeComponent: () => (/* binding */ renderNativeComponent),
/* harmony export */   renderStyle: () => (/* binding */ renderStyle)
/* harmony export */ });
/* harmony import */ var is_plain_object__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! is-plain-object */ "../node_modules/is-plain-object/dist/is-plain-object.mjs");
/* harmony import */ var change_case__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! change-case */ "../node_modules/param-case/dist.es2015/index.js");
/* harmony import */ var _wordpress_escape_html__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @wordpress/escape-html */ "../node_modules/@wordpress/escape-html/build-module/index.js");
/* harmony import */ var _react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./react */ "react");
/* harmony import */ var _react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(_react__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var _raw_html__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./raw-html */ "../node_modules/@wordpress/element/build-module/raw-html.js");
/**
 * Parts of this source were derived and modified from fast-react-render,
 * released under the MIT license.
 *
 * https://github.com/alt-j/fast-react-render
 *
 * Copyright (c) 2016 Andrey Morozov
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/**
 * External dependencies
 */



/**
 * WordPress dependencies
 */


/**
 * Internal dependencies
 */



/** @typedef {import('react').ReactElement} ReactElement */

const {
  Provider,
  Consumer
} = (0,_react__WEBPACK_IMPORTED_MODULE_3__.createContext)(undefined);
const ForwardRef = (0,_react__WEBPACK_IMPORTED_MODULE_3__.forwardRef)(() => {
  return null;
});

/**
 * Valid attribute types.
 *
 * @type {Set<string>}
 */
const ATTRIBUTES_TYPES = new Set(['string', 'boolean', 'number']);

/**
 * Element tags which can be self-closing.
 *
 * @type {Set<string>}
 */
const SELF_CLOSING_TAGS = new Set(['area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

/**
 * Boolean attributes are attributes whose presence as being assigned is
 * meaningful, even if only empty.
 *
 * See: https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#boolean-attributes
 * Extracted from: https://html.spec.whatwg.org/multipage/indices.html#attributes-3
 *
 * Object.keys( [ ...document.querySelectorAll( '#attributes-1 > tbody > tr' ) ]
 *     .filter( ( tr ) => tr.lastChild.textContent.indexOf( 'Boolean attribute' ) !== -1 )
 *     .reduce( ( result, tr ) => Object.assign( result, {
 *         [ tr.firstChild.textContent.trim() ]: true
 *     } ), {} ) ).sort();
 *
 * @type {Set<string>}
 */
const BOOLEAN_ATTRIBUTES = new Set(['allowfullscreen', 'allowpaymentrequest', 'allowusermedia', 'async', 'autofocus', 'autoplay', 'checked', 'controls', 'default', 'defer', 'disabled', 'download', 'formnovalidate', 'hidden', 'ismap', 'itemscope', 'loop', 'multiple', 'muted', 'nomodule', 'novalidate', 'open', 'playsinline', 'readonly', 'required', 'reversed', 'selected', 'typemustmatch']);

/**
 * Enumerated attributes are attributes which must be of a specific value form.
 * Like boolean attributes, these are meaningful if specified, even if not of a
 * valid enumerated value.
 *
 * See: https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#enumerated-attribute
 * Extracted from: https://html.spec.whatwg.org/multipage/indices.html#attributes-3
 *
 * Object.keys( [ ...document.querySelectorAll( '#attributes-1 > tbody > tr' ) ]
 *     .filter( ( tr ) => /^("(.+?)";?\s*)+/.test( tr.lastChild.textContent.trim() ) )
 *     .reduce( ( result, tr ) => Object.assign( result, {
 *         [ tr.firstChild.textContent.trim() ]: true
 *     } ), {} ) ).sort();
 *
 * Some notable omissions:
 *
 *  - `alt`: https://blog.whatwg.org/omit-alt
 *
 * @type {Set<string>}
 */
const ENUMERATED_ATTRIBUTES = new Set(['autocapitalize', 'autocomplete', 'charset', 'contenteditable', 'crossorigin', 'decoding', 'dir', 'draggable', 'enctype', 'formenctype', 'formmethod', 'http-equiv', 'inputmode', 'kind', 'method', 'preload', 'scope', 'shape', 'spellcheck', 'translate', 'type', 'wrap']);

/**
 * Set of CSS style properties which support assignment of unitless numbers.
 * Used in rendering of style properties, where `px` unit is assumed unless
 * property is included in this set or value is zero.
 *
 * Generated via:
 *
 * Object.entries( document.createElement( 'div' ).style )
 *     .filter( ( [ key ] ) => (
 *         ! /^(webkit|ms|moz)/.test( key ) &&
 *         ( e.style[ key ] = 10 ) &&
 *         e.style[ key ] === '10'
 *     ) )
 *     .map( ( [ key ] ) => key )
 *     .sort();
 *
 * @type {Set<string>}
 */
const CSS_PROPERTIES_SUPPORTS_UNITLESS = new Set(['animation', 'animationIterationCount', 'baselineShift', 'borderImageOutset', 'borderImageSlice', 'borderImageWidth', 'columnCount', 'cx', 'cy', 'fillOpacity', 'flexGrow', 'flexShrink', 'floodOpacity', 'fontWeight', 'gridColumnEnd', 'gridColumnStart', 'gridRowEnd', 'gridRowStart', 'lineHeight', 'opacity', 'order', 'orphans', 'r', 'rx', 'ry', 'shapeImageThreshold', 'stopOpacity', 'strokeDasharray', 'strokeDashoffset', 'strokeMiterlimit', 'strokeOpacity', 'strokeWidth', 'tabSize', 'widows', 'x', 'y', 'zIndex', 'zoom']);

/**
 * Returns true if the specified string is prefixed by one of an array of
 * possible prefixes.
 *
 * @param {string}   string   String to check.
 * @param {string[]} prefixes Possible prefixes.
 *
 * @return {boolean} Whether string has prefix.
 */
function hasPrefix(string, prefixes) {
  return prefixes.some(prefix => string.indexOf(prefix) === 0);
}

/**
 * Returns true if the given prop name should be ignored in attributes
 * serialization, or false otherwise.
 *
 * @param {string} attribute Attribute to check.
 *
 * @return {boolean} Whether attribute should be ignored.
 */
function isInternalAttribute(attribute) {
  return 'key' === attribute || 'children' === attribute;
}

/**
 * Returns the normal form of the element's attribute value for HTML.
 *
 * @param {string} attribute Attribute name.
 * @param {*}      value     Non-normalized attribute value.
 *
 * @return {*} Normalized attribute value.
 */
function getNormalAttributeValue(attribute, value) {
  switch (attribute) {
    case 'style':
      return renderStyle(value);
  }
  return value;
}
/**
 * This is a map of all SVG attributes that have dashes. Map(lower case prop => dashed lower case attribute).
 * We need this to render e.g strokeWidth as stroke-width.
 *
 * List from: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute.
 */
const SVG_ATTRIBUTE_WITH_DASHES_LIST = ['accentHeight', 'alignmentBaseline', 'arabicForm', 'baselineShift', 'capHeight', 'clipPath', 'clipRule', 'colorInterpolation', 'colorInterpolationFilters', 'colorProfile', 'colorRendering', 'dominantBaseline', 'enableBackground', 'fillOpacity', 'fillRule', 'floodColor', 'floodOpacity', 'fontFamily', 'fontSize', 'fontSizeAdjust', 'fontStretch', 'fontStyle', 'fontVariant', 'fontWeight', 'glyphName', 'glyphOrientationHorizontal', 'glyphOrientationVertical', 'horizAdvX', 'horizOriginX', 'imageRendering', 'letterSpacing', 'lightingColor', 'markerEnd', 'markerMid', 'markerStart', 'overlinePosition', 'overlineThickness', 'paintOrder', 'panose1', 'pointerEvents', 'renderingIntent', 'shapeRendering', 'stopColor', 'stopOpacity', 'strikethroughPosition', 'strikethroughThickness', 'strokeDasharray', 'strokeDashoffset', 'strokeLinecap', 'strokeLinejoin', 'strokeMiterlimit', 'strokeOpacity', 'strokeWidth', 'textAnchor', 'textDecoration', 'textRendering', 'underlinePosition', 'underlineThickness', 'unicodeBidi', 'unicodeRange', 'unitsPerEm', 'vAlphabetic', 'vHanging', 'vIdeographic', 'vMathematical', 'vectorEffect', 'vertAdvY', 'vertOriginX', 'vertOriginY', 'wordSpacing', 'writingMode', 'xmlnsXlink', 'xHeight'].reduce((map, attribute) => {
  // The keys are lower-cased for more robust lookup.
  map[attribute.toLowerCase()] = attribute;
  return map;
}, {});

/**
 * This is a map of all case-sensitive SVG attributes. Map(lowercase key => proper case attribute).
 * The keys are lower-cased for more robust lookup.
 * Note that this list only contains attributes that contain at least one capital letter.
 * Lowercase attributes don't need mapping, since we lowercase all attributes by default.
 */
const CASE_SENSITIVE_SVG_ATTRIBUTES = ['allowReorder', 'attributeName', 'attributeType', 'autoReverse', 'baseFrequency', 'baseProfile', 'calcMode', 'clipPathUnits', 'contentScriptType', 'contentStyleType', 'diffuseConstant', 'edgeMode', 'externalResourcesRequired', 'filterRes', 'filterUnits', 'glyphRef', 'gradientTransform', 'gradientUnits', 'kernelMatrix', 'kernelUnitLength', 'keyPoints', 'keySplines', 'keyTimes', 'lengthAdjust', 'limitingConeAngle', 'markerHeight', 'markerUnits', 'markerWidth', 'maskContentUnits', 'maskUnits', 'numOctaves', 'pathLength', 'patternContentUnits', 'patternTransform', 'patternUnits', 'pointsAtX', 'pointsAtY', 'pointsAtZ', 'preserveAlpha', 'preserveAspectRatio', 'primitiveUnits', 'refX', 'refY', 'repeatCount', 'repeatDur', 'requiredExtensions', 'requiredFeatures', 'specularConstant', 'specularExponent', 'spreadMethod', 'startOffset', 'stdDeviation', 'stitchTiles', 'suppressContentEditableWarning', 'suppressHydrationWarning', 'surfaceScale', 'systemLanguage', 'tableValues', 'targetX', 'targetY', 'textLength', 'viewBox', 'viewTarget', 'xChannelSelector', 'yChannelSelector'].reduce((map, attribute) => {
  // The keys are lower-cased for more robust lookup.
  map[attribute.toLowerCase()] = attribute;
  return map;
}, {});

/**
 * This is a map of all SVG attributes that have colons.
 * Keys are lower-cased and stripped of their colons for more robust lookup.
 */
const SVG_ATTRIBUTES_WITH_COLONS = ['xlink:actuate', 'xlink:arcrole', 'xlink:href', 'xlink:role', 'xlink:show', 'xlink:title', 'xlink:type', 'xml:base', 'xml:lang', 'xml:space', 'xmlns:xlink'].reduce((map, attribute) => {
  map[attribute.replace(':', '').toLowerCase()] = attribute;
  return map;
}, {});

/**
 * Returns the normal form of the element's attribute name for HTML.
 *
 * @param {string} attribute Non-normalized attribute name.
 *
 * @return {string} Normalized attribute name.
 */
function getNormalAttributeName(attribute) {
  switch (attribute) {
    case 'htmlFor':
      return 'for';
    case 'className':
      return 'class';
  }
  const attributeLowerCase = attribute.toLowerCase();
  if (CASE_SENSITIVE_SVG_ATTRIBUTES[attributeLowerCase]) {
    return CASE_SENSITIVE_SVG_ATTRIBUTES[attributeLowerCase];
  } else if (SVG_ATTRIBUTE_WITH_DASHES_LIST[attributeLowerCase]) {
    return (0,change_case__WEBPACK_IMPORTED_MODULE_1__.paramCase)(SVG_ATTRIBUTE_WITH_DASHES_LIST[attributeLowerCase]);
  } else if (SVG_ATTRIBUTES_WITH_COLONS[attributeLowerCase]) {
    return SVG_ATTRIBUTES_WITH_COLONS[attributeLowerCase];
  }
  return attributeLowerCase;
}

/**
 * Returns the normal form of the style property name for HTML.
 *
 * - Converts property names to kebab-case, e.g. 'backgroundColor' → 'background-color'
 * - Leaves custom attributes alone, e.g. '--myBackgroundColor' → '--myBackgroundColor'
 * - Converts vendor-prefixed property names to -kebab-case, e.g. 'MozTransform' → '-moz-transform'
 *
 * @param {string} property Property name.
 *
 * @return {string} Normalized property name.
 */
function getNormalStylePropertyName(property) {
  if (property.startsWith('--')) {
    return property;
  }
  if (hasPrefix(property, ['ms', 'O', 'Moz', 'Webkit'])) {
    return '-' + (0,change_case__WEBPACK_IMPORTED_MODULE_1__.paramCase)(property);
  }
  return (0,change_case__WEBPACK_IMPORTED_MODULE_1__.paramCase)(property);
}

/**
 * Returns the normal form of the style property value for HTML. Appends a
 * default pixel unit if numeric, not a unitless property, and not zero.
 *
 * @param {string} property Property name.
 * @param {*}      value    Non-normalized property value.
 *
 * @return {*} Normalized property value.
 */
function getNormalStylePropertyValue(property, value) {
  if (typeof value === 'number' && 0 !== value && !CSS_PROPERTIES_SUPPORTS_UNITLESS.has(property)) {
    return value + 'px';
  }
  return value;
}

/**
 * Serializes a React element to string.
 *
 * @param {import('react').ReactNode} element         Element to serialize.
 * @param {Object}                    [context]       Context object.
 * @param {Object}                    [legacyContext] Legacy context object.
 *
 * @return {string} Serialized element.
 */
function renderElement(element, context, legacyContext = {}) {
  if (null === element || undefined === element || false === element) {
    return '';
  }
  if (Array.isArray(element)) {
    return renderChildren(element, context, legacyContext);
  }
  switch (typeof element) {
    case 'string':
      return (0,_wordpress_escape_html__WEBPACK_IMPORTED_MODULE_2__.escapeHTML)(element);
    case 'number':
      return element.toString();
  }
  const {
    type,
    props
  } = /** @type {{type?: any, props?: any}} */
  element;
  switch (type) {
    case _react__WEBPACK_IMPORTED_MODULE_3__.StrictMode:
    case _react__WEBPACK_IMPORTED_MODULE_3__.Fragment:
      return renderChildren(props.children, context, legacyContext);
    case _raw_html__WEBPACK_IMPORTED_MODULE_4__["default"]:
      const {
        children,
        ...wrapperProps
      } = props;
      return renderNativeComponent(!Object.keys(wrapperProps).length ? null : 'div', {
        ...wrapperProps,
        dangerouslySetInnerHTML: {
          __html: children
        }
      }, context, legacyContext);
  }
  switch (typeof type) {
    case 'string':
      return renderNativeComponent(type, props, context, legacyContext);
    case 'function':
      if (type.prototype && typeof type.prototype.render === 'function') {
        return renderComponent(type, props, context, legacyContext);
      }
      return renderElement(type(props, legacyContext), context, legacyContext);
  }
  switch (type && type.$$typeof) {
    case Provider.$$typeof:
      return renderChildren(props.children, props.value, legacyContext);
    case Consumer.$$typeof:
      return renderElement(props.children(context || type._currentValue), context, legacyContext);
    case ForwardRef.$$typeof:
      return renderElement(type.render(props), context, legacyContext);
  }
  return '';
}

/**
 * Serializes a native component type to string.
 *
 * @param {?string} type            Native component type to serialize, or null if
 *                                  rendering as fragment of children content.
 * @param {Object}  props           Props object.
 * @param {Object}  [context]       Context object.
 * @param {Object}  [legacyContext] Legacy context object.
 *
 * @return {string} Serialized element.
 */
function renderNativeComponent(type, props, context, legacyContext = {}) {
  let content = '';
  if (type === 'textarea' && props.hasOwnProperty('value')) {
    // Textarea children can be assigned as value prop. If it is, render in
    // place of children. Ensure to omit so it is not assigned as attribute
    // as well.
    content = renderChildren(props.value, context, legacyContext);
    const {
      value,
      ...restProps
    } = props;
    props = restProps;
  } else if (props.dangerouslySetInnerHTML && typeof props.dangerouslySetInnerHTML.__html === 'string') {
    // Dangerous content is left unescaped.
    content = props.dangerouslySetInnerHTML.__html;
  } else if (typeof props.children !== 'undefined') {
    content = renderChildren(props.children, context, legacyContext);
  }
  if (!type) {
    return content;
  }
  const attributes = renderAttributes(props);
  if (SELF_CLOSING_TAGS.has(type)) {
    return '<' + type + attributes + '/>';
  }
  return '<' + type + attributes + '>' + content + '</' + type + '>';
}

/** @typedef {import('react').ComponentType} ComponentType */

/**
 * Serializes a non-native component type to string.
 *
 * @param {ComponentType} Component       Component type to serialize.
 * @param {Object}        props           Props object.
 * @param {Object}        [context]       Context object.
 * @param {Object}        [legacyContext] Legacy context object.
 *
 * @return {string} Serialized element
 */
function renderComponent(Component, props, context, legacyContext = {}) {
  const instance = new ( /** @type {import('react').ComponentClass} */
  Component)(props, legacyContext);
  if (typeof
  // Ignore reason: Current prettier reformats parens and mangles type assertion
  // prettier-ignore
  /** @type {{getChildContext?: () => unknown}} */
  instance.getChildContext === 'function') {
    Object.assign(legacyContext, /** @type {{getChildContext?: () => unknown}} */instance.getChildContext());
  }
  const html = renderElement(instance.render(), context, legacyContext);
  return html;
}

/**
 * Serializes an array of children to string.
 *
 * @param {import('react').ReactNodeArray} children        Children to serialize.
 * @param {Object}                         [context]       Context object.
 * @param {Object}                         [legacyContext] Legacy context object.
 *
 * @return {string} Serialized children.
 */
function renderChildren(children, context, legacyContext = {}) {
  let result = '';
  children = Array.isArray(children) ? children : [children];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    result += renderElement(child, context, legacyContext);
  }
  return result;
}

/**
 * Renders a props object as a string of HTML attributes.
 *
 * @param {Object} props Props object.
 *
 * @return {string} Attributes string.
 */
function renderAttributes(props) {
  let result = '';
  for (const key in props) {
    const attribute = getNormalAttributeName(key);
    if (!(0,_wordpress_escape_html__WEBPACK_IMPORTED_MODULE_2__.isValidAttributeName)(attribute)) {
      continue;
    }
    let value = getNormalAttributeValue(key, props[key]);

    // If value is not of serializable type, skip.
    if (!ATTRIBUTES_TYPES.has(typeof value)) {
      continue;
    }

    // Don't render internal attribute names.
    if (isInternalAttribute(key)) {
      continue;
    }
    const isBooleanAttribute = BOOLEAN_ATTRIBUTES.has(attribute);

    // Boolean attribute should be omitted outright if its value is false.
    if (isBooleanAttribute && value === false) {
      continue;
    }
    const isMeaningfulAttribute = isBooleanAttribute || hasPrefix(key, ['data-', 'aria-']) || ENUMERATED_ATTRIBUTES.has(attribute);

    // Only write boolean value as attribute if meaningful.
    if (typeof value === 'boolean' && !isMeaningfulAttribute) {
      continue;
    }
    result += ' ' + attribute;

    // Boolean attributes should write attribute name, but without value.
    // Mere presence of attribute name is effective truthiness.
    if (isBooleanAttribute) {
      continue;
    }
    if (typeof value === 'string') {
      value = (0,_wordpress_escape_html__WEBPACK_IMPORTED_MODULE_2__.escapeAttribute)(value);
    }
    result += '="' + value + '"';
  }
  return result;
}

/**
 * Renders a style object as a string attribute value.
 *
 * @param {Object} style Style object.
 *
 * @return {string} Style attribute value.
 */
function renderStyle(style) {
  // Only generate from object, e.g. tolerate string value.
  if (!(0,is_plain_object__WEBPACK_IMPORTED_MODULE_0__.isPlainObject)(style)) {
    return style;
  }
  let result;
  for (const property in style) {
    const value = style[property];
    if (null === value || undefined === value) {
      continue;
    }
    if (result) {
      result += ';';
    } else {
      result = '';
    }
    const normalName = getNormalStylePropertyName(property);
    const normalValue = getNormalStylePropertyValue(property, value);
    result += normalName + ':' + normalValue;
  }
  return result;
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (renderElement);
//# sourceMappingURL=serialize.js.map

/***/ }),

/***/ "../node_modules/@wordpress/element/build-module/utils.js":
/*!****************************************************************!*\
  !*** ../node_modules/@wordpress/element/build-module/utils.js ***!
  \****************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   isEmptyElement: () => (/* binding */ isEmptyElement)
/* harmony export */ });
/**
 * Checks if the provided WP element is empty.
 *
 * @param {*} element WP element to check.
 * @return {boolean} True when an element is considered empty.
 */
const isEmptyElement = element => {
  if (typeof element === 'number') {
    return false;
  }
  if (typeof element?.valueOf() === 'string' || Array.isArray(element)) {
    return !element.length;
  }
  return !element;
};
//# sourceMappingURL=utils.js.map

/***/ }),

/***/ "../node_modules/@wordpress/escape-html/build-module/escape-greater.js":
/*!*****************************************************************************!*\
  !*** ../node_modules/@wordpress/escape-html/build-module/escape-greater.js ***!
  \*****************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ __unstableEscapeGreaterThan)
/* harmony export */ });
/**
 * Returns a string with greater-than sign replaced.
 *
 * Note that if a resolution for Trac#45387 comes to fruition, it is no longer
 * necessary for `__unstableEscapeGreaterThan` to exist.
 *
 * See: https://core.trac.wordpress.org/ticket/45387
 *
 * @param {string} value Original string.
 *
 * @return {string} Escaped string.
 */
function __unstableEscapeGreaterThan(value) {
  return value.replace(/>/g, '&gt;');
}
//# sourceMappingURL=escape-greater.js.map

/***/ }),

/***/ "../node_modules/@wordpress/escape-html/build-module/index.js":
/*!********************************************************************!*\
  !*** ../node_modules/@wordpress/escape-html/build-module/index.js ***!
  \********************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   escapeAmpersand: () => (/* binding */ escapeAmpersand),
/* harmony export */   escapeAttribute: () => (/* binding */ escapeAttribute),
/* harmony export */   escapeEditableHTML: () => (/* binding */ escapeEditableHTML),
/* harmony export */   escapeHTML: () => (/* binding */ escapeHTML),
/* harmony export */   escapeLessThan: () => (/* binding */ escapeLessThan),
/* harmony export */   escapeQuotationMark: () => (/* binding */ escapeQuotationMark),
/* harmony export */   isValidAttributeName: () => (/* binding */ isValidAttributeName)
/* harmony export */ });
/* harmony import */ var _escape_greater__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./escape-greater */ "../node_modules/@wordpress/escape-html/build-module/escape-greater.js");
/**
 * Internal dependencies
 */


/**
 * Regular expression matching invalid attribute names.
 *
 * "Attribute names must consist of one or more characters other than controls,
 * U+0020 SPACE, U+0022 ("), U+0027 ('), U+003E (>), U+002F (/), U+003D (=),
 * and noncharacters."
 *
 * @see https://html.spec.whatwg.org/multipage/syntax.html#attributes-2
 *
 * @type {RegExp}
 */
const REGEXP_INVALID_ATTRIBUTE_NAME = /[\u007F-\u009F "'>/="\uFDD0-\uFDEF]/;

/**
 * Returns a string with ampersands escaped. Note that this is an imperfect
 * implementation, where only ampersands which do not appear as a pattern of
 * named, decimal, or hexadecimal character references are escaped. Invalid
 * named references (i.e. ambiguous ampersand) are still permitted.
 *
 * @see https://w3c.github.io/html/syntax.html#character-references
 * @see https://w3c.github.io/html/syntax.html#ambiguous-ampersand
 * @see https://w3c.github.io/html/syntax.html#named-character-references
 *
 * @param {string} value Original string.
 *
 * @return {string} Escaped string.
 */
function escapeAmpersand(value) {
  return value.replace(/&(?!([a-z0-9]+|#[0-9]+|#x[a-f0-9]+);)/gi, '&amp;');
}

/**
 * Returns a string with quotation marks replaced.
 *
 * @param {string} value Original string.
 *
 * @return {string} Escaped string.
 */
function escapeQuotationMark(value) {
  return value.replace(/"/g, '&quot;');
}

/**
 * Returns a string with less-than sign replaced.
 *
 * @param {string} value Original string.
 *
 * @return {string} Escaped string.
 */
function escapeLessThan(value) {
  return value.replace(/</g, '&lt;');
}

/**
 * Returns an escaped attribute value.
 *
 * @see https://w3c.github.io/html/syntax.html#elements-attributes
 *
 * "[...] the text cannot contain an ambiguous ampersand [...] must not contain
 * any literal U+0022 QUOTATION MARK characters (")"
 *
 * Note we also escape the greater than symbol, as this is used by wptexturize to
 * split HTML strings. This is a WordPress specific fix
 *
 * Note that if a resolution for Trac#45387 comes to fruition, it is no longer
 * necessary for `__unstableEscapeGreaterThan` to be used.
 *
 * See: https://core.trac.wordpress.org/ticket/45387
 *
 * @param {string} value Attribute value.
 *
 * @return {string} Escaped attribute value.
 */
function escapeAttribute(value) {
  return (0,_escape_greater__WEBPACK_IMPORTED_MODULE_0__["default"])(escapeQuotationMark(escapeAmpersand(value)));
}

/**
 * Returns an escaped HTML element value.
 *
 * @see https://w3c.github.io/html/syntax.html#writing-html-documents-elements
 *
 * "the text must not contain the character U+003C LESS-THAN SIGN (<) or an
 * ambiguous ampersand."
 *
 * @param {string} value Element value.
 *
 * @return {string} Escaped HTML element value.
 */
function escapeHTML(value) {
  return escapeLessThan(escapeAmpersand(value));
}

/**
 * Returns an escaped Editable HTML element value. This is different from
 * `escapeHTML`, because for editable HTML, ALL ampersands must be escaped in
 * order to render the content correctly on the page.
 *
 * @param {string} value Element value.
 *
 * @return {string} Escaped HTML element value.
 */
function escapeEditableHTML(value) {
  return escapeLessThan(value.replace(/&/g, '&amp;'));
}

/**
 * Returns true if the given attribute name is valid, or false otherwise.
 *
 * @param {string} name Attribute name to test.
 *
 * @return {boolean} Whether attribute is valid.
 */
function isValidAttributeName(name) {
  return !REGEXP_INVALID_ATTRIBUTE_NAME.test(name);
}
//# sourceMappingURL=index.js.map

/***/ }),

/***/ "../node_modules/dot-case/dist.es2015/index.js":
/*!*****************************************************!*\
  !*** ../node_modules/dot-case/dist.es2015/index.js ***!
  \*****************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   dotCase: () => (/* binding */ dotCase)
/* harmony export */ });
/* harmony import */ var tslib__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! tslib */ "../node_modules/tslib/tslib.es6.mjs");
/* harmony import */ var no_case__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! no-case */ "../node_modules/no-case/dist.es2015/index.js");


function dotCase(input, options) {
    if (options === void 0) { options = {}; }
    return (0,no_case__WEBPACK_IMPORTED_MODULE_1__.noCase)(input, (0,tslib__WEBPACK_IMPORTED_MODULE_0__.__assign)({ delimiter: "." }, options));
}
//# sourceMappingURL=index.js.map

/***/ }),

/***/ "../node_modules/is-plain-object/dist/is-plain-object.mjs":
/*!****************************************************************!*\
  !*** ../node_modules/is-plain-object/dist/is-plain-object.mjs ***!
  \****************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   isPlainObject: () => (/* binding */ isPlainObject)
/* harmony export */ });
/*!
 * is-plain-object <https://github.com/jonschlinkert/is-plain-object>
 *
 * Copyright (c) 2014-2017, Jon Schlinkert.
 * Released under the MIT License.
 */

function isObject(o) {
  return Object.prototype.toString.call(o) === '[object Object]';
}

function isPlainObject(o) {
  var ctor,prot;

  if (isObject(o) === false) return false;

  // If has modified constructor
  ctor = o.constructor;
  if (ctor === undefined) return true;

  // If has modified prototype
  prot = ctor.prototype;
  if (isObject(prot) === false) return false;

  // If constructor does not have an Object-specific method
  if (prot.hasOwnProperty('isPrototypeOf') === false) {
    return false;
  }

  // Most likely a plain Object
  return true;
}




/***/ }),

/***/ "../node_modules/lower-case/dist.es2015/index.js":
/*!*******************************************************!*\
  !*** ../node_modules/lower-case/dist.es2015/index.js ***!
  \*******************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   localeLowerCase: () => (/* binding */ localeLowerCase),
/* harmony export */   lowerCase: () => (/* binding */ lowerCase)
/* harmony export */ });
/**
 * Source: ftp://ftp.unicode.org/Public/UCD/latest/ucd/SpecialCasing.txt
 */
var SUPPORTED_LOCALE = {
    tr: {
        regexp: /\u0130|\u0049|\u0049\u0307/g,
        map: {
            İ: "\u0069",
            I: "\u0131",
            İ: "\u0069",
        },
    },
    az: {
        regexp: /\u0130/g,
        map: {
            İ: "\u0069",
            I: "\u0131",
            İ: "\u0069",
        },
    },
    lt: {
        regexp: /\u0049|\u004A|\u012E|\u00CC|\u00CD|\u0128/g,
        map: {
            I: "\u0069\u0307",
            J: "\u006A\u0307",
            Į: "\u012F\u0307",
            Ì: "\u0069\u0307\u0300",
            Í: "\u0069\u0307\u0301",
            Ĩ: "\u0069\u0307\u0303",
        },
    },
};
/**
 * Localized lower case.
 */
function localeLowerCase(str, locale) {
    var lang = SUPPORTED_LOCALE[locale.toLowerCase()];
    if (lang)
        return lowerCase(str.replace(lang.regexp, function (m) { return lang.map[m]; }));
    return lowerCase(str);
}
/**
 * Lower case as a function.
 */
function lowerCase(str) {
    return str.toLowerCase();
}
//# sourceMappingURL=index.js.map

/***/ }),

/***/ "../node_modules/no-case/dist.es2015/index.js":
/*!****************************************************!*\
  !*** ../node_modules/no-case/dist.es2015/index.js ***!
  \****************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   noCase: () => (/* binding */ noCase)
/* harmony export */ });
/* harmony import */ var lower_case__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! lower-case */ "../node_modules/lower-case/dist.es2015/index.js");

// Support camel case ("camelCase" -> "camel Case" and "CAMELCase" -> "CAMEL Case").
var DEFAULT_SPLIT_REGEXP = [/([a-z0-9])([A-Z])/g, /([A-Z])([A-Z][a-z])/g];
// Remove all non-word characters.
var DEFAULT_STRIP_REGEXP = /[^A-Z0-9]+/gi;
/**
 * Normalize the string into something other libraries can manipulate easier.
 */
function noCase(input, options) {
    if (options === void 0) { options = {}; }
    var _a = options.splitRegexp, splitRegexp = _a === void 0 ? DEFAULT_SPLIT_REGEXP : _a, _b = options.stripRegexp, stripRegexp = _b === void 0 ? DEFAULT_STRIP_REGEXP : _b, _c = options.transform, transform = _c === void 0 ? lower_case__WEBPACK_IMPORTED_MODULE_0__.lowerCase : _c, _d = options.delimiter, delimiter = _d === void 0 ? " " : _d;
    var result = replace(replace(input, splitRegexp, "$1\0$2"), stripRegexp, "\0");
    var start = 0;
    var end = result.length;
    // Trim the delimiter from around the output string.
    while (result.charAt(start) === "\0")
        start++;
    while (result.charAt(end - 1) === "\0")
        end--;
    // Transform each token independently.
    return result.slice(start, end).split("\0").map(transform).join(delimiter);
}
/**
 * Replace `re` in the input string with the replacement value.
 */
function replace(input, re, value) {
    if (re instanceof RegExp)
        return input.replace(re, value);
    return re.reduce(function (input, re) { return input.replace(re, value); }, input);
}
//# sourceMappingURL=index.js.map

/***/ }),

/***/ "../node_modules/object-assign/index.js":
/*!**********************************************!*\
  !*** ../node_modules/object-assign/index.js ***!
  \**********************************************/
/***/ ((module) => {

"use strict";
/*
object-assign
(c) Sindre Sorhus
@license MIT
*/


/* eslint-disable no-unused-vars */
var getOwnPropertySymbols = Object.getOwnPropertySymbols;
var hasOwnProperty = Object.prototype.hasOwnProperty;
var propIsEnumerable = Object.prototype.propertyIsEnumerable;

function toObject(val) {
	if (val === null || val === undefined) {
		throw new TypeError('Object.assign cannot be called with null or undefined');
	}

	return Object(val);
}

function shouldUseNative() {
	try {
		if (!Object.assign) {
			return false;
		}

		// Detect buggy property enumeration order in older V8 versions.

		// https://bugs.chromium.org/p/v8/issues/detail?id=4118
		var test1 = new String('abc');  // eslint-disable-line no-new-wrappers
		test1[5] = 'de';
		if (Object.getOwnPropertyNames(test1)[0] === '5') {
			return false;
		}

		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
		var test2 = {};
		for (var i = 0; i < 10; i++) {
			test2['_' + String.fromCharCode(i)] = i;
		}
		var order2 = Object.getOwnPropertyNames(test2).map(function (n) {
			return test2[n];
		});
		if (order2.join('') !== '0123456789') {
			return false;
		}

		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
		var test3 = {};
		'abcdefghijklmnopqrst'.split('').forEach(function (letter) {
			test3[letter] = letter;
		});
		if (Object.keys(Object.assign({}, test3)).join('') !==
				'abcdefghijklmnopqrst') {
			return false;
		}

		return true;
	} catch (err) {
		// We don't expect any of the above to throw, but better to be safe.
		return false;
	}
}

module.exports = shouldUseNative() ? Object.assign : function (target, source) {
	var from;
	var to = toObject(target);
	var symbols;

	for (var s = 1; s < arguments.length; s++) {
		from = Object(arguments[s]);

		for (var key in from) {
			if (hasOwnProperty.call(from, key)) {
				to[key] = from[key];
			}
		}

		if (getOwnPropertySymbols) {
			symbols = getOwnPropertySymbols(from);
			for (var i = 0; i < symbols.length; i++) {
				if (propIsEnumerable.call(from, symbols[i])) {
					to[symbols[i]] = from[symbols[i]];
				}
			}
		}
	}

	return to;
};


/***/ }),

/***/ "../node_modules/param-case/dist.es2015/index.js":
/*!*******************************************************!*\
  !*** ../node_modules/param-case/dist.es2015/index.js ***!
  \*******************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   paramCase: () => (/* binding */ paramCase)
/* harmony export */ });
/* harmony import */ var tslib__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! tslib */ "../node_modules/tslib/tslib.es6.mjs");
/* harmony import */ var dot_case__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! dot-case */ "../node_modules/dot-case/dist.es2015/index.js");


function paramCase(input, options) {
    if (options === void 0) { options = {}; }
    return (0,dot_case__WEBPACK_IMPORTED_MODULE_1__.dotCase)(input, (0,tslib__WEBPACK_IMPORTED_MODULE_0__.__assign)({ delimiter: "-" }, options));
}
//# sourceMappingURL=index.js.map

/***/ }),

/***/ "../node_modules/prop-types/checkPropTypes.js":
/*!****************************************************!*\
  !*** ../node_modules/prop-types/checkPropTypes.js ***!
  \****************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */



var printWarning = function() {};

if (true) {
  var ReactPropTypesSecret = __webpack_require__(/*! ./lib/ReactPropTypesSecret */ "../node_modules/prop-types/lib/ReactPropTypesSecret.js");
  var loggedTypeFailures = {};
  var has = __webpack_require__(/*! ./lib/has */ "../node_modules/prop-types/lib/has.js");

  printWarning = function(text) {
    var message = 'Warning: ' + text;
    if (typeof console !== 'undefined') {
      console.error(message);
    }
    try {
      // --- Welcome to debugging React ---
      // This error was thrown as a convenience so that you can use this stack
      // to find the callsite that caused this warning to fire.
      throw new Error(message);
    } catch (x) { /**/ }
  };
}

/**
 * Assert that the values match with the type specs.
 * Error messages are memorized and will only be shown once.
 *
 * @param {object} typeSpecs Map of name to a ReactPropType
 * @param {object} values Runtime values that need to be type-checked
 * @param {string} location e.g. "prop", "context", "child context"
 * @param {string} componentName Name of the component for error messages.
 * @param {?Function} getStack Returns the component stack.
 * @private
 */
function checkPropTypes(typeSpecs, values, location, componentName, getStack) {
  if (true) {
    for (var typeSpecName in typeSpecs) {
      if (has(typeSpecs, typeSpecName)) {
        var error;
        // Prop type validation may throw. In case they do, we don't want to
        // fail the render phase where it didn't fail before. So we log it.
        // After these have been cleaned up, we'll let them throw.
        try {
          // This is intentionally an invariant that gets caught. It's the same
          // behavior as without this statement except with a better message.
          if (typeof typeSpecs[typeSpecName] !== 'function') {
            var err = Error(
              (componentName || 'React class') + ': ' + location + ' type `' + typeSpecName + '` is invalid; ' +
              'it must be a function, usually from the `prop-types` package, but received `' + typeof typeSpecs[typeSpecName] + '`.' +
              'This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`.'
            );
            err.name = 'Invariant Violation';
            throw err;
          }
          error = typeSpecs[typeSpecName](values, typeSpecName, componentName, location, null, ReactPropTypesSecret);
        } catch (ex) {
          error = ex;
        }
        if (error && !(error instanceof Error)) {
          printWarning(
            (componentName || 'React class') + ': type specification of ' +
            location + ' `' + typeSpecName + '` is invalid; the type checker ' +
            'function must return `null` or an `Error` but returned a ' + typeof error + '. ' +
            'You may have forgotten to pass an argument to the type checker ' +
            'creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and ' +
            'shape all require an argument).'
          );
        }
        if (error instanceof Error && !(error.message in loggedTypeFailures)) {
          // Only monitor this failure once because there tends to be a lot of the
          // same error.
          loggedTypeFailures[error.message] = true;

          var stack = getStack ? getStack() : '';

          printWarning(
            'Failed ' + location + ' type: ' + error.message + (stack != null ? stack : '')
          );
        }
      }
    }
  }
}

/**
 * Resets warning cache when testing.
 *
 * @private
 */
checkPropTypes.resetWarningCache = function() {
  if (true) {
    loggedTypeFailures = {};
  }
}

module.exports = checkPropTypes;


/***/ }),

/***/ "../node_modules/prop-types/factoryWithTypeCheckers.js":
/*!*************************************************************!*\
  !*** ../node_modules/prop-types/factoryWithTypeCheckers.js ***!
  \*************************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */



var ReactIs = __webpack_require__(/*! react-is */ "../node_modules/prop-types/node_modules/react-is/index.js");
var assign = __webpack_require__(/*! object-assign */ "../node_modules/object-assign/index.js");

var ReactPropTypesSecret = __webpack_require__(/*! ./lib/ReactPropTypesSecret */ "../node_modules/prop-types/lib/ReactPropTypesSecret.js");
var has = __webpack_require__(/*! ./lib/has */ "../node_modules/prop-types/lib/has.js");
var checkPropTypes = __webpack_require__(/*! ./checkPropTypes */ "../node_modules/prop-types/checkPropTypes.js");

var printWarning = function() {};

if (true) {
  printWarning = function(text) {
    var message = 'Warning: ' + text;
    if (typeof console !== 'undefined') {
      console.error(message);
    }
    try {
      // --- Welcome to debugging React ---
      // This error was thrown as a convenience so that you can use this stack
      // to find the callsite that caused this warning to fire.
      throw new Error(message);
    } catch (x) {}
  };
}

function emptyFunctionThatReturnsNull() {
  return null;
}

module.exports = function(isValidElement, throwOnDirectAccess) {
  /* global Symbol */
  var ITERATOR_SYMBOL = typeof Symbol === 'function' && Symbol.iterator;
  var FAUX_ITERATOR_SYMBOL = '@@iterator'; // Before Symbol spec.

  /**
   * Returns the iterator method function contained on the iterable object.
   *
   * Be sure to invoke the function with the iterable as context:
   *
   *     var iteratorFn = getIteratorFn(myIterable);
   *     if (iteratorFn) {
   *       var iterator = iteratorFn.call(myIterable);
   *       ...
   *     }
   *
   * @param {?object} maybeIterable
   * @return {?function}
   */
  function getIteratorFn(maybeIterable) {
    var iteratorFn = maybeIterable && (ITERATOR_SYMBOL && maybeIterable[ITERATOR_SYMBOL] || maybeIterable[FAUX_ITERATOR_SYMBOL]);
    if (typeof iteratorFn === 'function') {
      return iteratorFn;
    }
  }

  /**
   * Collection of methods that allow declaration and validation of props that are
   * supplied to React components. Example usage:
   *
   *   var Props = require('ReactPropTypes');
   *   var MyArticle = React.createClass({
   *     propTypes: {
   *       // An optional string prop named "description".
   *       description: Props.string,
   *
   *       // A required enum prop named "category".
   *       category: Props.oneOf(['News','Photos']).isRequired,
   *
   *       // A prop named "dialog" that requires an instance of Dialog.
   *       dialog: Props.instanceOf(Dialog).isRequired
   *     },
   *     render: function() { ... }
   *   });
   *
   * A more formal specification of how these methods are used:
   *
   *   type := array|bool|func|object|number|string|oneOf([...])|instanceOf(...)
   *   decl := ReactPropTypes.{type}(.isRequired)?
   *
   * Each and every declaration produces a function with the same signature. This
   * allows the creation of custom validation functions. For example:
   *
   *  var MyLink = React.createClass({
   *    propTypes: {
   *      // An optional string or URI prop named "href".
   *      href: function(props, propName, componentName) {
   *        var propValue = props[propName];
   *        if (propValue != null && typeof propValue !== 'string' &&
   *            !(propValue instanceof URI)) {
   *          return new Error(
   *            'Expected a string or an URI for ' + propName + ' in ' +
   *            componentName
   *          );
   *        }
   *      }
   *    },
   *    render: function() {...}
   *  });
   *
   * @internal
   */

  var ANONYMOUS = '<<anonymous>>';

  // Important!
  // Keep this list in sync with production version in `./factoryWithThrowingShims.js`.
  var ReactPropTypes = {
    array: createPrimitiveTypeChecker('array'),
    bigint: createPrimitiveTypeChecker('bigint'),
    bool: createPrimitiveTypeChecker('boolean'),
    func: createPrimitiveTypeChecker('function'),
    number: createPrimitiveTypeChecker('number'),
    object: createPrimitiveTypeChecker('object'),
    string: createPrimitiveTypeChecker('string'),
    symbol: createPrimitiveTypeChecker('symbol'),

    any: createAnyTypeChecker(),
    arrayOf: createArrayOfTypeChecker,
    element: createElementTypeChecker(),
    elementType: createElementTypeTypeChecker(),
    instanceOf: createInstanceTypeChecker,
    node: createNodeChecker(),
    objectOf: createObjectOfTypeChecker,
    oneOf: createEnumTypeChecker,
    oneOfType: createUnionTypeChecker,
    shape: createShapeTypeChecker,
    exact: createStrictShapeTypeChecker,
  };

  /**
   * inlined Object.is polyfill to avoid requiring consumers ship their own
   * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is
   */
  /*eslint-disable no-self-compare*/
  function is(x, y) {
    // SameValue algorithm
    if (x === y) {
      // Steps 1-5, 7-10
      // Steps 6.b-6.e: +0 != -0
      return x !== 0 || 1 / x === 1 / y;
    } else {
      // Step 6.a: NaN == NaN
      return x !== x && y !== y;
    }
  }
  /*eslint-enable no-self-compare*/

  /**
   * We use an Error-like object for backward compatibility as people may call
   * PropTypes directly and inspect their output. However, we don't use real
   * Errors anymore. We don't inspect their stack anyway, and creating them
   * is prohibitively expensive if they are created too often, such as what
   * happens in oneOfType() for any type before the one that matched.
   */
  function PropTypeError(message, data) {
    this.message = message;
    this.data = data && typeof data === 'object' ? data: {};
    this.stack = '';
  }
  // Make `instanceof Error` still work for returned errors.
  PropTypeError.prototype = Error.prototype;

  function createChainableTypeChecker(validate) {
    if (true) {
      var manualPropTypeCallCache = {};
      var manualPropTypeWarningCount = 0;
    }
    function checkType(isRequired, props, propName, componentName, location, propFullName, secret) {
      componentName = componentName || ANONYMOUS;
      propFullName = propFullName || propName;

      if (secret !== ReactPropTypesSecret) {
        if (throwOnDirectAccess) {
          // New behavior only for users of `prop-types` package
          var err = new Error(
            'Calling PropTypes validators directly is not supported by the `prop-types` package. ' +
            'Use `PropTypes.checkPropTypes()` to call them. ' +
            'Read more at http://fb.me/use-check-prop-types'
          );
          err.name = 'Invariant Violation';
          throw err;
        } else if ( true && typeof console !== 'undefined') {
          // Old behavior for people using React.PropTypes
          var cacheKey = componentName + ':' + propName;
          if (
            !manualPropTypeCallCache[cacheKey] &&
            // Avoid spamming the console because they are often not actionable except for lib authors
            manualPropTypeWarningCount < 3
          ) {
            printWarning(
              'You are manually calling a React.PropTypes validation ' +
              'function for the `' + propFullName + '` prop on `' + componentName + '`. This is deprecated ' +
              'and will throw in the standalone `prop-types` package. ' +
              'You may be seeing this warning due to a third-party PropTypes ' +
              'library. See https://fb.me/react-warning-dont-call-proptypes ' + 'for details.'
            );
            manualPropTypeCallCache[cacheKey] = true;
            manualPropTypeWarningCount++;
          }
        }
      }
      if (props[propName] == null) {
        if (isRequired) {
          if (props[propName] === null) {
            return new PropTypeError('The ' + location + ' `' + propFullName + '` is marked as required ' + ('in `' + componentName + '`, but its value is `null`.'));
          }
          return new PropTypeError('The ' + location + ' `' + propFullName + '` is marked as required in ' + ('`' + componentName + '`, but its value is `undefined`.'));
        }
        return null;
      } else {
        return validate(props, propName, componentName, location, propFullName);
      }
    }

    var chainedCheckType = checkType.bind(null, false);
    chainedCheckType.isRequired = checkType.bind(null, true);

    return chainedCheckType;
  }

  function createPrimitiveTypeChecker(expectedType) {
    function validate(props, propName, componentName, location, propFullName, secret) {
      var propValue = props[propName];
      var propType = getPropType(propValue);
      if (propType !== expectedType) {
        // `propValue` being instance of, say, date/regexp, pass the 'object'
        // check, but we can offer a more precise error message here rather than
        // 'of type `object`'.
        var preciseType = getPreciseType(propValue);

        return new PropTypeError(
          'Invalid ' + location + ' `' + propFullName + '` of type ' + ('`' + preciseType + '` supplied to `' + componentName + '`, expected ') + ('`' + expectedType + '`.'),
          {expectedType: expectedType}
        );
      }
      return null;
    }
    return createChainableTypeChecker(validate);
  }

  function createAnyTypeChecker() {
    return createChainableTypeChecker(emptyFunctionThatReturnsNull);
  }

  function createArrayOfTypeChecker(typeChecker) {
    function validate(props, propName, componentName, location, propFullName) {
      if (typeof typeChecker !== 'function') {
        return new PropTypeError('Property `' + propFullName + '` of component `' + componentName + '` has invalid PropType notation inside arrayOf.');
      }
      var propValue = props[propName];
      if (!Array.isArray(propValue)) {
        var propType = getPropType(propValue);
        return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` of type ' + ('`' + propType + '` supplied to `' + componentName + '`, expected an array.'));
      }
      for (var i = 0; i < propValue.length; i++) {
        var error = typeChecker(propValue, i, componentName, location, propFullName + '[' + i + ']', ReactPropTypesSecret);
        if (error instanceof Error) {
          return error;
        }
      }
      return null;
    }
    return createChainableTypeChecker(validate);
  }

  function createElementTypeChecker() {
    function validate(props, propName, componentName, location, propFullName) {
      var propValue = props[propName];
      if (!isValidElement(propValue)) {
        var propType = getPropType(propValue);
        return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` of type ' + ('`' + propType + '` supplied to `' + componentName + '`, expected a single ReactElement.'));
      }
      return null;
    }
    return createChainableTypeChecker(validate);
  }

  function createElementTypeTypeChecker() {
    function validate(props, propName, componentName, location, propFullName) {
      var propValue = props[propName];
      if (!ReactIs.isValidElementType(propValue)) {
        var propType = getPropType(propValue);
        return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` of type ' + ('`' + propType + '` supplied to `' + componentName + '`, expected a single ReactElement type.'));
      }
      return null;
    }
    return createChainableTypeChecker(validate);
  }

  function createInstanceTypeChecker(expectedClass) {
    function validate(props, propName, componentName, location, propFullName) {
      if (!(props[propName] instanceof expectedClass)) {
        var expectedClassName = expectedClass.name || ANONYMOUS;
        var actualClassName = getClassName(props[propName]);
        return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` of type ' + ('`' + actualClassName + '` supplied to `' + componentName + '`, expected ') + ('instance of `' + expectedClassName + '`.'));
      }
      return null;
    }
    return createChainableTypeChecker(validate);
  }

  function createEnumTypeChecker(expectedValues) {
    if (!Array.isArray(expectedValues)) {
      if (true) {
        if (arguments.length > 1) {
          printWarning(
            'Invalid arguments supplied to oneOf, expected an array, got ' + arguments.length + ' arguments. ' +
            'A common mistake is to write oneOf(x, y, z) instead of oneOf([x, y, z]).'
          );
        } else {
          printWarning('Invalid argument supplied to oneOf, expected an array.');
        }
      }
      return emptyFunctionThatReturnsNull;
    }

    function validate(props, propName, componentName, location, propFullName) {
      var propValue = props[propName];
      for (var i = 0; i < expectedValues.length; i++) {
        if (is(propValue, expectedValues[i])) {
          return null;
        }
      }

      var valuesString = JSON.stringify(expectedValues, function replacer(key, value) {
        var type = getPreciseType(value);
        if (type === 'symbol') {
          return String(value);
        }
        return value;
      });
      return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` of value `' + String(propValue) + '` ' + ('supplied to `' + componentName + '`, expected one of ' + valuesString + '.'));
    }
    return createChainableTypeChecker(validate);
  }

  function createObjectOfTypeChecker(typeChecker) {
    function validate(props, propName, componentName, location, propFullName) {
      if (typeof typeChecker !== 'function') {
        return new PropTypeError('Property `' + propFullName + '` of component `' + componentName + '` has invalid PropType notation inside objectOf.');
      }
      var propValue = props[propName];
      var propType = getPropType(propValue);
      if (propType !== 'object') {
        return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` of type ' + ('`' + propType + '` supplied to `' + componentName + '`, expected an object.'));
      }
      for (var key in propValue) {
        if (has(propValue, key)) {
          var error = typeChecker(propValue, key, componentName, location, propFullName + '.' + key, ReactPropTypesSecret);
          if (error instanceof Error) {
            return error;
          }
        }
      }
      return null;
    }
    return createChainableTypeChecker(validate);
  }

  function createUnionTypeChecker(arrayOfTypeCheckers) {
    if (!Array.isArray(arrayOfTypeCheckers)) {
       true ? printWarning('Invalid argument supplied to oneOfType, expected an instance of array.') : 0;
      return emptyFunctionThatReturnsNull;
    }

    for (var i = 0; i < arrayOfTypeCheckers.length; i++) {
      var checker = arrayOfTypeCheckers[i];
      if (typeof checker !== 'function') {
        printWarning(
          'Invalid argument supplied to oneOfType. Expected an array of check functions, but ' +
          'received ' + getPostfixForTypeWarning(checker) + ' at index ' + i + '.'
        );
        return emptyFunctionThatReturnsNull;
      }
    }

    function validate(props, propName, componentName, location, propFullName) {
      var expectedTypes = [];
      for (var i = 0; i < arrayOfTypeCheckers.length; i++) {
        var checker = arrayOfTypeCheckers[i];
        var checkerResult = checker(props, propName, componentName, location, propFullName, ReactPropTypesSecret);
        if (checkerResult == null) {
          return null;
        }
        if (checkerResult.data && has(checkerResult.data, 'expectedType')) {
          expectedTypes.push(checkerResult.data.expectedType);
        }
      }
      var expectedTypesMessage = (expectedTypes.length > 0) ? ', expected one of type [' + expectedTypes.join(', ') + ']': '';
      return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` supplied to ' + ('`' + componentName + '`' + expectedTypesMessage + '.'));
    }
    return createChainableTypeChecker(validate);
  }

  function createNodeChecker() {
    function validate(props, propName, componentName, location, propFullName) {
      if (!isNode(props[propName])) {
        return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` supplied to ' + ('`' + componentName + '`, expected a ReactNode.'));
      }
      return null;
    }
    return createChainableTypeChecker(validate);
  }

  function invalidValidatorError(componentName, location, propFullName, key, type) {
    return new PropTypeError(
      (componentName || 'React class') + ': ' + location + ' type `' + propFullName + '.' + key + '` is invalid; ' +
      'it must be a function, usually from the `prop-types` package, but received `' + type + '`.'
    );
  }

  function createShapeTypeChecker(shapeTypes) {
    function validate(props, propName, componentName, location, propFullName) {
      var propValue = props[propName];
      var propType = getPropType(propValue);
      if (propType !== 'object') {
        return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` of type `' + propType + '` ' + ('supplied to `' + componentName + '`, expected `object`.'));
      }
      for (var key in shapeTypes) {
        var checker = shapeTypes[key];
        if (typeof checker !== 'function') {
          return invalidValidatorError(componentName, location, propFullName, key, getPreciseType(checker));
        }
        var error = checker(propValue, key, componentName, location, propFullName + '.' + key, ReactPropTypesSecret);
        if (error) {
          return error;
        }
      }
      return null;
    }
    return createChainableTypeChecker(validate);
  }

  function createStrictShapeTypeChecker(shapeTypes) {
    function validate(props, propName, componentName, location, propFullName) {
      var propValue = props[propName];
      var propType = getPropType(propValue);
      if (propType !== 'object') {
        return new PropTypeError('Invalid ' + location + ' `' + propFullName + '` of type `' + propType + '` ' + ('supplied to `' + componentName + '`, expected `object`.'));
      }
      // We need to check all keys in case some are required but missing from props.
      var allKeys = assign({}, props[propName], shapeTypes);
      for (var key in allKeys) {
        var checker = shapeTypes[key];
        if (has(shapeTypes, key) && typeof checker !== 'function') {
          return invalidValidatorError(componentName, location, propFullName, key, getPreciseType(checker));
        }
        if (!checker) {
          return new PropTypeError(
            'Invalid ' + location + ' `' + propFullName + '` key `' + key + '` supplied to `' + componentName + '`.' +
            '\nBad object: ' + JSON.stringify(props[propName], null, '  ') +
            '\nValid keys: ' + JSON.stringify(Object.keys(shapeTypes), null, '  ')
          );
        }
        var error = checker(propValue, key, componentName, location, propFullName + '.' + key, ReactPropTypesSecret);
        if (error) {
          return error;
        }
      }
      return null;
    }

    return createChainableTypeChecker(validate);
  }

  function isNode(propValue) {
    switch (typeof propValue) {
      case 'number':
      case 'string':
      case 'undefined':
        return true;
      case 'boolean':
        return !propValue;
      case 'object':
        if (Array.isArray(propValue)) {
          return propValue.every(isNode);
        }
        if (propValue === null || isValidElement(propValue)) {
          return true;
        }

        var iteratorFn = getIteratorFn(propValue);
        if (iteratorFn) {
          var iterator = iteratorFn.call(propValue);
          var step;
          if (iteratorFn !== propValue.entries) {
            while (!(step = iterator.next()).done) {
              if (!isNode(step.value)) {
                return false;
              }
            }
          } else {
            // Iterator will provide entry [k,v] tuples rather than values.
            while (!(step = iterator.next()).done) {
              var entry = step.value;
              if (entry) {
                if (!isNode(entry[1])) {
                  return false;
                }
              }
            }
          }
        } else {
          return false;
        }

        return true;
      default:
        return false;
    }
  }

  function isSymbol(propType, propValue) {
    // Native Symbol.
    if (propType === 'symbol') {
      return true;
    }

    // falsy value can't be a Symbol
    if (!propValue) {
      return false;
    }

    // 19.4.3.5 Symbol.prototype[@@toStringTag] === 'Symbol'
    if (propValue['@@toStringTag'] === 'Symbol') {
      return true;
    }

    // Fallback for non-spec compliant Symbols which are polyfilled.
    if (typeof Symbol === 'function' && propValue instanceof Symbol) {
      return true;
    }

    return false;
  }

  // Equivalent of `typeof` but with special handling for array and regexp.
  function getPropType(propValue) {
    var propType = typeof propValue;
    if (Array.isArray(propValue)) {
      return 'array';
    }
    if (propValue instanceof RegExp) {
      // Old webkits (at least until Android 4.0) return 'function' rather than
      // 'object' for typeof a RegExp. We'll normalize this here so that /bla/
      // passes PropTypes.object.
      return 'object';
    }
    if (isSymbol(propType, propValue)) {
      return 'symbol';
    }
    return propType;
  }

  // This handles more types than `getPropType`. Only used for error messages.
  // See `createPrimitiveTypeChecker`.
  function getPreciseType(propValue) {
    if (typeof propValue === 'undefined' || propValue === null) {
      return '' + propValue;
    }
    var propType = getPropType(propValue);
    if (propType === 'object') {
      if (propValue instanceof Date) {
        return 'date';
      } else if (propValue instanceof RegExp) {
        return 'regexp';
      }
    }
    return propType;
  }

  // Returns a string that is postfixed to a warning about an invalid type.
  // For example, "undefined" or "of type array"
  function getPostfixForTypeWarning(value) {
    var type = getPreciseType(value);
    switch (type) {
      case 'array':
      case 'object':
        return 'an ' + type;
      case 'boolean':
      case 'date':
      case 'regexp':
        return 'a ' + type;
      default:
        return type;
    }
  }

  // Returns class name of the object, if any.
  function getClassName(propValue) {
    if (!propValue.constructor || !propValue.constructor.name) {
      return ANONYMOUS;
    }
    return propValue.constructor.name;
  }

  ReactPropTypes.checkPropTypes = checkPropTypes;
  ReactPropTypes.resetWarningCache = checkPropTypes.resetWarningCache;
  ReactPropTypes.PropTypes = ReactPropTypes;

  return ReactPropTypes;
};


/***/ }),

/***/ "../node_modules/prop-types/index.js":
/*!*******************************************!*\
  !*** ../node_modules/prop-types/index.js ***!
  \*******************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

if (true) {
  var ReactIs = __webpack_require__(/*! react-is */ "../node_modules/prop-types/node_modules/react-is/index.js");

  // By explicitly using `prop-types` you are opting into new development behavior.
  // http://fb.me/prop-types-in-prod
  var throwOnDirectAccess = true;
  module.exports = __webpack_require__(/*! ./factoryWithTypeCheckers */ "../node_modules/prop-types/factoryWithTypeCheckers.js")(ReactIs.isElement, throwOnDirectAccess);
} else // removed by dead control flow
{}


/***/ }),

/***/ "../node_modules/prop-types/lib/ReactPropTypesSecret.js":
/*!**************************************************************!*\
  !*** ../node_modules/prop-types/lib/ReactPropTypesSecret.js ***!
  \**************************************************************/
/***/ ((module) => {

"use strict";
/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */



var ReactPropTypesSecret = 'SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED';

module.exports = ReactPropTypesSecret;


/***/ }),

/***/ "../node_modules/prop-types/lib/has.js":
/*!*********************************************!*\
  !*** ../node_modules/prop-types/lib/has.js ***!
  \*********************************************/
/***/ ((module) => {

module.exports = Function.call.bind(Object.prototype.hasOwnProperty);


/***/ }),

/***/ "../node_modules/prop-types/node_modules/react-is/cjs/react-is.development.js":
/*!************************************************************************************!*\
  !*** ../node_modules/prop-types/node_modules/react-is/cjs/react-is.development.js ***!
  \************************************************************************************/
/***/ ((__unused_webpack_module, exports) => {

"use strict";
/** @license React v16.13.1
 * react-is.development.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */





if (true) {
  (function() {
'use strict';

// The Symbol used to tag the ReactElement-like types. If there is no native Symbol
// nor polyfill, then a plain number is used for performance.
var hasSymbol = typeof Symbol === 'function' && Symbol.for;
var REACT_ELEMENT_TYPE = hasSymbol ? Symbol.for('react.element') : 0xeac7;
var REACT_PORTAL_TYPE = hasSymbol ? Symbol.for('react.portal') : 0xeaca;
var REACT_FRAGMENT_TYPE = hasSymbol ? Symbol.for('react.fragment') : 0xeacb;
var REACT_STRICT_MODE_TYPE = hasSymbol ? Symbol.for('react.strict_mode') : 0xeacc;
var REACT_PROFILER_TYPE = hasSymbol ? Symbol.for('react.profiler') : 0xead2;
var REACT_PROVIDER_TYPE = hasSymbol ? Symbol.for('react.provider') : 0xeacd;
var REACT_CONTEXT_TYPE = hasSymbol ? Symbol.for('react.context') : 0xeace; // TODO: We don't use AsyncMode or ConcurrentMode anymore. They were temporary
// (unstable) APIs that have been removed. Can we remove the symbols?

var REACT_ASYNC_MODE_TYPE = hasSymbol ? Symbol.for('react.async_mode') : 0xeacf;
var REACT_CONCURRENT_MODE_TYPE = hasSymbol ? Symbol.for('react.concurrent_mode') : 0xeacf;
var REACT_FORWARD_REF_TYPE = hasSymbol ? Symbol.for('react.forward_ref') : 0xead0;
var REACT_SUSPENSE_TYPE = hasSymbol ? Symbol.for('react.suspense') : 0xead1;
var REACT_SUSPENSE_LIST_TYPE = hasSymbol ? Symbol.for('react.suspense_list') : 0xead8;
var REACT_MEMO_TYPE = hasSymbol ? Symbol.for('react.memo') : 0xead3;
var REACT_LAZY_TYPE = hasSymbol ? Symbol.for('react.lazy') : 0xead4;
var REACT_BLOCK_TYPE = hasSymbol ? Symbol.for('react.block') : 0xead9;
var REACT_FUNDAMENTAL_TYPE = hasSymbol ? Symbol.for('react.fundamental') : 0xead5;
var REACT_RESPONDER_TYPE = hasSymbol ? Symbol.for('react.responder') : 0xead6;
var REACT_SCOPE_TYPE = hasSymbol ? Symbol.for('react.scope') : 0xead7;

function isValidElementType(type) {
  return typeof type === 'string' || typeof type === 'function' || // Note: its typeof might be other than 'symbol' or 'number' if it's a polyfill.
  type === REACT_FRAGMENT_TYPE || type === REACT_CONCURRENT_MODE_TYPE || type === REACT_PROFILER_TYPE || type === REACT_STRICT_MODE_TYPE || type === REACT_SUSPENSE_TYPE || type === REACT_SUSPENSE_LIST_TYPE || typeof type === 'object' && type !== null && (type.$$typeof === REACT_LAZY_TYPE || type.$$typeof === REACT_MEMO_TYPE || type.$$typeof === REACT_PROVIDER_TYPE || type.$$typeof === REACT_CONTEXT_TYPE || type.$$typeof === REACT_FORWARD_REF_TYPE || type.$$typeof === REACT_FUNDAMENTAL_TYPE || type.$$typeof === REACT_RESPONDER_TYPE || type.$$typeof === REACT_SCOPE_TYPE || type.$$typeof === REACT_BLOCK_TYPE);
}

function typeOf(object) {
  if (typeof object === 'object' && object !== null) {
    var $$typeof = object.$$typeof;

    switch ($$typeof) {
      case REACT_ELEMENT_TYPE:
        var type = object.type;

        switch (type) {
          case REACT_ASYNC_MODE_TYPE:
          case REACT_CONCURRENT_MODE_TYPE:
          case REACT_FRAGMENT_TYPE:
          case REACT_PROFILER_TYPE:
          case REACT_STRICT_MODE_TYPE:
          case REACT_SUSPENSE_TYPE:
            return type;

          default:
            var $$typeofType = type && type.$$typeof;

            switch ($$typeofType) {
              case REACT_CONTEXT_TYPE:
              case REACT_FORWARD_REF_TYPE:
              case REACT_LAZY_TYPE:
              case REACT_MEMO_TYPE:
              case REACT_PROVIDER_TYPE:
                return $$typeofType;

              default:
                return $$typeof;
            }

        }

      case REACT_PORTAL_TYPE:
        return $$typeof;
    }
  }

  return undefined;
} // AsyncMode is deprecated along with isAsyncMode

var AsyncMode = REACT_ASYNC_MODE_TYPE;
var ConcurrentMode = REACT_CONCURRENT_MODE_TYPE;
var ContextConsumer = REACT_CONTEXT_TYPE;
var ContextProvider = REACT_PROVIDER_TYPE;
var Element = REACT_ELEMENT_TYPE;
var ForwardRef = REACT_FORWARD_REF_TYPE;
var Fragment = REACT_FRAGMENT_TYPE;
var Lazy = REACT_LAZY_TYPE;
var Memo = REACT_MEMO_TYPE;
var Portal = REACT_PORTAL_TYPE;
var Profiler = REACT_PROFILER_TYPE;
var StrictMode = REACT_STRICT_MODE_TYPE;
var Suspense = REACT_SUSPENSE_TYPE;
var hasWarnedAboutDeprecatedIsAsyncMode = false; // AsyncMode should be deprecated

function isAsyncMode(object) {
  {
    if (!hasWarnedAboutDeprecatedIsAsyncMode) {
      hasWarnedAboutDeprecatedIsAsyncMode = true; // Using console['warn'] to evade Babel and ESLint

      console['warn']('The ReactIs.isAsyncMode() alias has been deprecated, ' + 'and will be removed in React 17+. Update your code to use ' + 'ReactIs.isConcurrentMode() instead. It has the exact same API.');
    }
  }

  return isConcurrentMode(object) || typeOf(object) === REACT_ASYNC_MODE_TYPE;
}
function isConcurrentMode(object) {
  return typeOf(object) === REACT_CONCURRENT_MODE_TYPE;
}
function isContextConsumer(object) {
  return typeOf(object) === REACT_CONTEXT_TYPE;
}
function isContextProvider(object) {
  return typeOf(object) === REACT_PROVIDER_TYPE;
}
function isElement(object) {
  return typeof object === 'object' && object !== null && object.$$typeof === REACT_ELEMENT_TYPE;
}
function isForwardRef(object) {
  return typeOf(object) === REACT_FORWARD_REF_TYPE;
}
function isFragment(object) {
  return typeOf(object) === REACT_FRAGMENT_TYPE;
}
function isLazy(object) {
  return typeOf(object) === REACT_LAZY_TYPE;
}
function isMemo(object) {
  return typeOf(object) === REACT_MEMO_TYPE;
}
function isPortal(object) {
  return typeOf(object) === REACT_PORTAL_TYPE;
}
function isProfiler(object) {
  return typeOf(object) === REACT_PROFILER_TYPE;
}
function isStrictMode(object) {
  return typeOf(object) === REACT_STRICT_MODE_TYPE;
}
function isSuspense(object) {
  return typeOf(object) === REACT_SUSPENSE_TYPE;
}

exports.AsyncMode = AsyncMode;
exports.ConcurrentMode = ConcurrentMode;
exports.ContextConsumer = ContextConsumer;
exports.ContextProvider = ContextProvider;
exports.Element = Element;
exports.ForwardRef = ForwardRef;
exports.Fragment = Fragment;
exports.Lazy = Lazy;
exports.Memo = Memo;
exports.Portal = Portal;
exports.Profiler = Profiler;
exports.StrictMode = StrictMode;
exports.Suspense = Suspense;
exports.isAsyncMode = isAsyncMode;
exports.isConcurrentMode = isConcurrentMode;
exports.isContextConsumer = isContextConsumer;
exports.isContextProvider = isContextProvider;
exports.isElement = isElement;
exports.isForwardRef = isForwardRef;
exports.isFragment = isFragment;
exports.isLazy = isLazy;
exports.isMemo = isMemo;
exports.isPortal = isPortal;
exports.isProfiler = isProfiler;
exports.isStrictMode = isStrictMode;
exports.isSuspense = isSuspense;
exports.isValidElementType = isValidElementType;
exports.typeOf = typeOf;
  })();
}


/***/ }),

/***/ "../node_modules/prop-types/node_modules/react-is/index.js":
/*!*****************************************************************!*\
  !*** ../node_modules/prop-types/node_modules/react-is/index.js ***!
  \*****************************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


if (false) // removed by dead control flow
{} else {
  module.exports = __webpack_require__(/*! ./cjs/react-is.development.js */ "../node_modules/prop-types/node_modules/react-is/cjs/react-is.development.js");
}


/***/ }),

/***/ "../node_modules/react-dom/client.js":
/*!*******************************************!*\
  !*** ../node_modules/react-dom/client.js ***!
  \*******************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var m = __webpack_require__(/*! react-dom */ "react-dom");
if (false) // removed by dead control flow
{} else {
  var i = m.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  exports.createRoot = function(c, o) {
    i.usingClientEntryPoint = true;
    try {
      return m.createRoot(c, o);
    } finally {
      i.usingClientEntryPoint = false;
    }
  };
  exports.hydrateRoot = function(c, h, o) {
    i.usingClientEntryPoint = true;
    try {
      return m.hydrateRoot(c, h, o);
    } finally {
      i.usingClientEntryPoint = false;
    }
  };
}


/***/ }),

/***/ "../node_modules/tslib/tslib.es6.mjs":
/*!*******************************************!*\
  !*** ../node_modules/tslib/tslib.es6.mjs ***!
  \*******************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   __addDisposableResource: () => (/* binding */ __addDisposableResource),
/* harmony export */   __assign: () => (/* binding */ __assign),
/* harmony export */   __asyncDelegator: () => (/* binding */ __asyncDelegator),
/* harmony export */   __asyncGenerator: () => (/* binding */ __asyncGenerator),
/* harmony export */   __asyncValues: () => (/* binding */ __asyncValues),
/* harmony export */   __await: () => (/* binding */ __await),
/* harmony export */   __awaiter: () => (/* binding */ __awaiter),
/* harmony export */   __classPrivateFieldGet: () => (/* binding */ __classPrivateFieldGet),
/* harmony export */   __classPrivateFieldIn: () => (/* binding */ __classPrivateFieldIn),
/* harmony export */   __classPrivateFieldSet: () => (/* binding */ __classPrivateFieldSet),
/* harmony export */   __createBinding: () => (/* binding */ __createBinding),
/* harmony export */   __decorate: () => (/* binding */ __decorate),
/* harmony export */   __disposeResources: () => (/* binding */ __disposeResources),
/* harmony export */   __esDecorate: () => (/* binding */ __esDecorate),
/* harmony export */   __exportStar: () => (/* binding */ __exportStar),
/* harmony export */   __extends: () => (/* binding */ __extends),
/* harmony export */   __generator: () => (/* binding */ __generator),
/* harmony export */   __importDefault: () => (/* binding */ __importDefault),
/* harmony export */   __importStar: () => (/* binding */ __importStar),
/* harmony export */   __makeTemplateObject: () => (/* binding */ __makeTemplateObject),
/* harmony export */   __metadata: () => (/* binding */ __metadata),
/* harmony export */   __param: () => (/* binding */ __param),
/* harmony export */   __propKey: () => (/* binding */ __propKey),
/* harmony export */   __read: () => (/* binding */ __read),
/* harmony export */   __rest: () => (/* binding */ __rest),
/* harmony export */   __rewriteRelativeImportExtension: () => (/* binding */ __rewriteRelativeImportExtension),
/* harmony export */   __runInitializers: () => (/* binding */ __runInitializers),
/* harmony export */   __setFunctionName: () => (/* binding */ __setFunctionName),
/* harmony export */   __spread: () => (/* binding */ __spread),
/* harmony export */   __spreadArray: () => (/* binding */ __spreadArray),
/* harmony export */   __spreadArrays: () => (/* binding */ __spreadArrays),
/* harmony export */   __values: () => (/* binding */ __values),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */

var extendStatics = function(d, b) {
  extendStatics = Object.setPrototypeOf ||
      ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
      function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
  return extendStatics(d, b);
};

function __extends(d, b) {
  if (typeof b !== "function" && b !== null)
      throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
  extendStatics(d, b);
  function __() { this.constructor = d; }
  d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

var __assign = function() {
  __assign = Object.assign || function __assign(t) {
      for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
      }
      return t;
  }
  return __assign.apply(this, arguments);
}

function __rest(s, e) {
  var t = {};
  for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
      t[p] = s[p];
  if (s != null && typeof Object.getOwnPropertySymbols === "function")
      for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
          if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
              t[p[i]] = s[p[i]];
      }
  return t;
}

function __decorate(decorators, target, key, desc) {
  var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
  else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
  return c > 3 && r && Object.defineProperty(target, key, r), r;
}

function __param(paramIndex, decorator) {
  return function (target, key) { decorator(target, key, paramIndex); }
}

function __esDecorate(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
  function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
  var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
  var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
  var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
  var _, done = false;
  for (var i = decorators.length - 1; i >= 0; i--) {
      var context = {};
      for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
      for (var p in contextIn.access) context.access[p] = contextIn.access[p];
      context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
      var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
      if (kind === "accessor") {
          if (result === void 0) continue;
          if (result === null || typeof result !== "object") throw new TypeError("Object expected");
          if (_ = accept(result.get)) descriptor.get = _;
          if (_ = accept(result.set)) descriptor.set = _;
          if (_ = accept(result.init)) initializers.unshift(_);
      }
      else if (_ = accept(result)) {
          if (kind === "field") initializers.unshift(_);
          else descriptor[key] = _;
      }
  }
  if (target) Object.defineProperty(target, contextIn.name, descriptor);
  done = true;
};

function __runInitializers(thisArg, initializers, value) {
  var useValue = arguments.length > 2;
  for (var i = 0; i < initializers.length; i++) {
      value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
  }
  return useValue ? value : void 0;
};

function __propKey(x) {
  return typeof x === "symbol" ? x : "".concat(x);
};

function __setFunctionName(f, name, prefix) {
  if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
  return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};

function __metadata(metadataKey, metadataValue) {
  if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}

function __awaiter(thisArg, _arguments, P, generator) {
  function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
  return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
      function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
      function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
}

function __generator(thisArg, body) {
  var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
  function verb(n) { return function (v) { return step([n, v]); }; }
  function step(op) {
      if (f) throw new TypeError("Generator is already executing.");
      while (g && (g = 0, op[0] && (_ = 0)), _) try {
          if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
          if (y = 0, t) op = [op[0] & 2, t.value];
          switch (op[0]) {
              case 0: case 1: t = op; break;
              case 4: _.label++; return { value: op[1], done: false };
              case 5: _.label++; y = op[1]; op = [0]; continue;
              case 7: op = _.ops.pop(); _.trys.pop(); continue;
              default:
                  if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                  if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                  if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                  if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                  if (t[2]) _.ops.pop();
                  _.trys.pop(); continue;
          }
          op = body.call(thisArg, _);
      } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
      if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
  }
}

var __createBinding = Object.create ? (function(o, m, k, k2) {
  if (k2 === undefined) k2 = k;
  var desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
  }
  Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
  if (k2 === undefined) k2 = k;
  o[k2] = m[k];
});

function __exportStar(m, o) {
  for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(o, p)) __createBinding(o, m, p);
}

function __values(o) {
  var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
  if (m) return m.call(o);
  if (o && typeof o.length === "number") return {
      next: function () {
          if (o && i >= o.length) o = void 0;
          return { value: o && o[i++], done: !o };
      }
  };
  throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}

function __read(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
      while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  }
  catch (error) { e = { error: error }; }
  finally {
      try {
          if (r && !r.done && (m = i["return"])) m.call(i);
      }
      finally { if (e) throw e.error; }
  }
  return ar;
}

/** @deprecated */
function __spread() {
  for (var ar = [], i = 0; i < arguments.length; i++)
      ar = ar.concat(__read(arguments[i]));
  return ar;
}

/** @deprecated */
function __spreadArrays() {
  for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
  for (var r = Array(s), k = 0, i = 0; i < il; i++)
      for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
          r[k] = a[j];
  return r;
}

function __spreadArray(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
      if (ar || !(i in from)) {
          if (!ar) ar = Array.prototype.slice.call(from, 0, i);
          ar[i] = from[i];
      }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
}

function __await(v) {
  return this instanceof __await ? (this.v = v, this) : new __await(v);
}

function __asyncGenerator(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var g = generator.apply(thisArg, _arguments || []), i, q = [];
  return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
  function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
  function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
  function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
  function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
  function fulfill(value) { resume("next", value); }
  function reject(value) { resume("throw", value); }
  function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
}

function __asyncDelegator(o) {
  var i, p;
  return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
  function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await(o[n](v)), done: false } : f ? f(v) : v; } : f; }
}

function __asyncValues(o) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var m = o[Symbol.asyncIterator], i;
  return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
  function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
  function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
}

function __makeTemplateObject(cooked, raw) {
  if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
  return cooked;
};

var __setModuleDefault = Object.create ? (function(o, v) {
  Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
  o["default"] = v;
};

var ownKeys = function(o) {
  ownKeys = Object.getOwnPropertyNames || function (o) {
    var ar = [];
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
    return ar;
  };
  return ownKeys(o);
};

function __importStar(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
  __setModuleDefault(result, mod);
  return result;
}

function __importDefault(mod) {
  return (mod && mod.__esModule) ? mod : { default: mod };
}

function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}

function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
}

function __classPrivateFieldIn(state, receiver) {
  if (receiver === null || (typeof receiver !== "object" && typeof receiver !== "function")) throw new TypeError("Cannot use 'in' operator on non-object");
  return typeof state === "function" ? receiver === state : state.has(receiver);
}

function __addDisposableResource(env, value, async) {
  if (value !== null && value !== void 0) {
    if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
    var dispose, inner;
    if (async) {
      if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
      dispose = value[Symbol.asyncDispose];
    }
    if (dispose === void 0) {
      if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
      dispose = value[Symbol.dispose];
      if (async) inner = dispose;
    }
    if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
    if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
    env.stack.push({ value: value, dispose: dispose, async: async });
  }
  else if (async) {
    env.stack.push({ async: true });
  }
  return value;
}

var _SuppressedError = typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
  var e = new Error(message);
  return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

function __disposeResources(env) {
  function fail(e) {
    env.error = env.hasError ? new _SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
    env.hasError = true;
  }
  var r, s = 0;
  function next() {
    while (r = env.stack.pop()) {
      try {
        if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
        if (r.dispose) {
          var result = r.dispose.call(r.value);
          if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
        }
        else s |= 1;
      }
      catch (e) {
        fail(e);
      }
    }
    if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
    if (env.hasError) throw env.error;
  }
  return next();
}

function __rewriteRelativeImportExtension(path, preserveJsx) {
  if (typeof path === "string" && /^\.\.?\//.test(path)) {
      return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
          return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
      });
  }
  return path;
}

/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({
  __extends,
  __assign,
  __rest,
  __decorate,
  __param,
  __esDecorate,
  __runInitializers,
  __propKey,
  __setFunctionName,
  __metadata,
  __awaiter,
  __generator,
  __createBinding,
  __exportStar,
  __values,
  __read,
  __spread,
  __spreadArrays,
  __spreadArray,
  __await,
  __asyncGenerator,
  __asyncDelegator,
  __asyncValues,
  __makeTemplateObject,
  __importStar,
  __importDefault,
  __classPrivateFieldGet,
  __classPrivateFieldSet,
  __classPrivateFieldIn,
  __addDisposableResource,
  __disposeResources,
  __rewriteRelativeImportExtension,
});


/***/ }),

/***/ "@elementor/icons":
/*!************************************!*\
  !*** external "elementorV2.icons" ***!
  \************************************/
/***/ ((module) => {

"use strict";
module.exports = elementorV2.icons;

/***/ }),

/***/ "@elementor/icons/AdjustmentsIcon":
/*!*******************************************************!*\
  !*** external "elementorV2.icons['AdjustmentsIcon']" ***!
  \*******************************************************/
/***/ ((module) => {

"use strict";
module.exports = elementorV2.icons['AdjustmentsIcon'];

/***/ }),

/***/ "@elementor/icons/ChevronDownSmallIcon":
/*!************************************************************!*\
  !*** external "elementorV2.icons['ChevronDownSmallIcon']" ***!
  \************************************************************/
/***/ ((module) => {

"use strict";
module.exports = elementorV2.icons['ChevronDownSmallIcon'];

/***/ }),

/***/ "@elementor/icons/ChevronRightIcon":
/*!********************************************************!*\
  !*** external "elementorV2.icons['ChevronRightIcon']" ***!
  \********************************************************/
/***/ ((module) => {

"use strict";
module.exports = elementorV2.icons['ChevronRightIcon'];

/***/ }),

/***/ "@elementor/icons/FileSettingsIcon":
/*!********************************************************!*\
  !*** external "elementorV2.icons['FileSettingsIcon']" ***!
  \********************************************************/
/***/ ((module) => {

"use strict";
module.exports = elementorV2.icons['FileSettingsIcon'];

/***/ }),

/***/ "@elementor/icons/FolderIcon":
/*!**************************************************!*\
  !*** external "elementorV2.icons['FolderIcon']" ***!
  \**************************************************/
/***/ ((module) => {

"use strict";
module.exports = elementorV2.icons['FolderIcon'];

/***/ }),

/***/ "@elementor/icons/HomeIcon":
/*!************************************************!*\
  !*** external "elementorV2.icons['HomeIcon']" ***!
  \************************************************/
/***/ ((module) => {

"use strict";
module.exports = elementorV2.icons['HomeIcon'];

/***/ }),

/***/ "@elementor/icons/PlugIcon":
/*!************************************************!*\
  !*** external "elementorV2.icons['PlugIcon']" ***!
  \************************************************/
/***/ ((module) => {

"use strict";
module.exports = elementorV2.icons['PlugIcon'];

/***/ }),

/***/ "@elementor/icons/RocketIcon":
/*!**************************************************!*\
  !*** external "elementorV2.icons['RocketIcon']" ***!
  \**************************************************/
/***/ ((module) => {

"use strict";
module.exports = elementorV2.icons['RocketIcon'];

/***/ }),

/***/ "@elementor/icons/SearchIcon":
/*!**************************************************!*\
  !*** external "elementorV2.icons['SearchIcon']" ***!
  \**************************************************/
/***/ ((module) => {

"use strict";
module.exports = elementorV2.icons['SearchIcon'];

/***/ }),

/***/ "@elementor/icons/SendIcon":
/*!************************************************!*\
  !*** external "elementorV2.icons['SendIcon']" ***!
  \************************************************/
/***/ ((module) => {

"use strict";
module.exports = elementorV2.icons['SendIcon'];

/***/ }),

/***/ "@elementor/icons/SettingsIcon":
/*!****************************************************!*\
  !*** external "elementorV2.icons['SettingsIcon']" ***!
  \****************************************************/
/***/ ((module) => {

"use strict";
module.exports = elementorV2.icons['SettingsIcon'];

/***/ }),

/***/ "@elementor/icons/UsersIcon":
/*!*************************************************!*\
  !*** external "elementorV2.icons['UsersIcon']" ***!
  \*************************************************/
/***/ ((module) => {

"use strict";
module.exports = elementorV2.icons['UsersIcon'];

/***/ }),

/***/ "@elementor/ui":
/*!*********************************!*\
  !*** external "elementorV2.ui" ***!
  \*********************************/
/***/ ((module) => {

"use strict";
module.exports = elementorV2.ui;

/***/ }),

/***/ "react":
/*!************************!*\
  !*** external "React" ***!
  \************************/
/***/ ((module) => {

"use strict";
module.exports = React;

/***/ }),

/***/ "react-dom":
/*!***************************!*\
  !*** external "ReactDOM" ***!
  \***************************/
/***/ ((module) => {

"use strict";
module.exports = ReactDOM;

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
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be in strict mode.
(() => {
"use strict";
/*!*****************************************************************!*\
  !*** ../modules/editor-one/assets/js/sidebar-navigation/app.js ***!
  \*****************************************************************/


var _interopRequireDefault = __webpack_require__(/*! @babel/runtime/helpers/interopRequireDefault */ "../node_modules/@babel/runtime/helpers/interopRequireDefault.js");
var _react = _interopRequireDefault(__webpack_require__(/*! react */ "react"));
var _react2 = _interopRequireDefault(__webpack_require__(/*! elementor-utils/react */ "../assets/dev/js/utils/react.js"));
var _ui = __webpack_require__(/*! @elementor/ui */ "@elementor/ui");
var _index = _interopRequireDefault(__webpack_require__(/*! ./components/index */ "../modules/editor-one/assets/js/sidebar-navigation/components/index.js"));
var _propTypes = _interopRequireDefault(__webpack_require__(/*! prop-types */ "../node_modules/prop-types/index.js"));
var _isRtl = _interopRequireDefault(__webpack_require__(/*! ../shared/is-rtl */ "../modules/editor-one/assets/js/shared/is-rtl.js"));
var App = function App(_ref) {
  var config = _ref.config;
  var isRtlLanguage = (0, _isRtl.default)();
  return /*#__PURE__*/_react.default.createElement(_ui.DirectionProvider, {
    rtl: isRtlLanguage
  }, /*#__PURE__*/_react.default.createElement(_ui.LocalizationProvider, null, /*#__PURE__*/_react.default.createElement(_ui.ThemeProvider, {
    colorScheme: "light"
  }, /*#__PURE__*/_react.default.createElement(_index.default, {
    config: config
  }))));
};
App.propTypes = {
  config: _propTypes.default.object.isRequired
};
var rootElement = document.getElementById('editor-one-sidebar-navigation');
if (rootElement && window.editorOneSidebarConfig) {
  _react2.default.render(/*#__PURE__*/_react.default.createElement(App, {
    config: window.editorOneSidebarConfig
  }), rootElement);
}
})();

/******/ })()
;
//# sourceMappingURL=editor-one-sidebar-navigation.js.map