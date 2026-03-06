"use strict";
(self["webpackChunkelementorFrontend"] = self["webpackChunkelementorFrontend"] || []).push([["shared-editor-handlers"],{

/***/ "../assets/dev/js/frontend/handlers/handles-position.js":
/*!**************************************************************!*\
  !*** ../assets/dev/js/frontend/handlers/handles-position.js ***!
  \**************************************************************/
/***/ ((__unused_webpack_module, exports) => {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports["default"] = void 0;
const handlesInsideClass = 'e-handles-inside';
const handlesHeight = 100;
class HandlesPosition extends elementorModules.frontend.handlers.Base {
  onInit() {
    this.$element.on('mouseenter', this.setHandlesPosition.bind(this));
  }
  isSectionScrollSnapEnabled() {
    return elementor.settings.page.model.attributes.scroll_snap;
  }
  isFirstElement() {
    return this.$element[0] === document.querySelector('.elementor-section-wrap > .elementor-element:first-child');
  }
  isOverflowHidden() {
    return 'hidden' === this.$element.css('overflow');
  }
  getOffset() {
    if ('body' === elementor.config.document.container) {
      return this.$element.offset().top;
    }
    const $container = jQuery(elementor.config.document.container);
    return this.$element.offset().top - $container.offset().top;
  }
  setHandlesPosition() {
    const document = elementor.documents.getCurrent();
    if (!document?.container.isEditable()) {
      return;
    }
    if (this.isSectionScrollSnapEnabled()) {
      this.$element.addClass(handlesInsideClass);
      return;
    }
    const {
      top
    } = this.$element[0].getBoundingClientRect();
    if (top < handlesHeight || this.isOverflowHidden()) {
      this.$element.addClass(handlesInsideClass);
    } else {
      this.$element.removeClass(handlesInsideClass);
    }
  }
}
exports["default"] = HandlesPosition;

/***/ })

}]);
//# sourceMappingURL=shared-editor-handlers.3023894100138e442ab0.bundle.js.map