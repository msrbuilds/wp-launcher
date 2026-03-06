/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/*!************************************************!*\
  !*** ../modules/editor-one/assets/js/admin.js ***!
  \************************************************/


document.addEventListener('DOMContentLoaded', function () {
  var urlParams = new URLSearchParams(window.location.search);
  if ('elementor-element-manager' === urlParams.get('page')) {
    var links = document.querySelectorAll('link[href*="/wp-admin/css/forms.css"]');
    links.forEach(function (link) {
      return link.remove();
    });
  }
});
/******/ })()
;
//# sourceMappingURL=editor-one-admin.js.map