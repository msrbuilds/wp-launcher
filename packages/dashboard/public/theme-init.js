/*
 * Applies the theme class before first paint so loading in dark mode does not
 * flash white.
 *
 * This lives in an external file rather than inline in index.html because the
 * dashboard's CSP sets `script-src 'self'`, which blocks inline scripts. An
 * inline version is silently dropped in production while still working in dev.
 *
 * The storage key is asserted against THEME_STORAGE_KEY in src/lib/theme.test.ts.
 */
(function () {
  try {
    var stored = localStorage.getItem('wpl-theme');
    var choice = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    var dark = choice === 'dark'
      || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {
    /* private mode or storage disabled — fall back to light */
  }
})();
