/**
 * ftth-config.js — shared API base-URL resolution for the Fiber360 frontend.
 *
 * Resolution order:
 *   1. window.FIBER_BASE_URL / window.FTTH_BASE_URL already set (explicit
 *      override injected by the deployment environment, if any).
 *   2. Local dev  (localhost / 127.0.0.1 / 0.0.0.0) -> http://localhost:8000
 *   3. Production -> https://fiberbackend.zeabur.app
 *
 * Load this BEFORE any inline config block or API client script on the page.
 */
(function () {
  var LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/;
  var isLocal = LOCAL_HOST_RE.test(window.location.hostname);
  var LOCAL_API = 'http://localhost:8000';
  var PROD_API = 'https://fiberbackend.zeabur.app';

  if (!window.FIBER_BASE_URL) {
    window.FIBER_BASE_URL = isLocal ? LOCAL_API : PROD_API;
  }
  if (!window.FTTH_BASE_URL) {
    window.FTTH_BASE_URL = isLocal ? LOCAL_API : PROD_API;
  }
})();
