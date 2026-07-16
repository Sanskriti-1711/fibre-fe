/**
 * FTTH HLD — API Client (Django Backend Proxy)
 *
 * Communicates with the Django backend, which proxies FTTH pipeline
 * requests to the FastAPI engine running qgis_process inside Docker.
 *
 * Auth:  Uses JWT from FiberAuth (localStorage key "fiber_auth").
 *
 * Endpoints (all under /api/ftth/hld/):
 *   POST /api/ftth/hld/run/                         — Start pipeline (multipart)
 *   GET  /api/ftth/hld/results/{id}/                 — Poll status + messages
 *   GET  /api/ftth/hld/results/{id}/layers/{name}/   — GeoJSON for a layer
 *   GET  /api/ftth/hld/download/{id}/{file}           — Download output file
 *   GET  /api/ftth/hld/results/{id}/survey-package/  — ZIP of all GPKGs + BOQ + BOM
 *   GET  /api/ftth/hld/projects/                     — List recent projects
 */

(function () {
  'use strict';

  var BASE_URL =
    (window.FTTH_BASE_URL || window.location.origin).replace(/\/+$/, '');

  var API_PREFIX = '/api/ftth/hld';

  function getAuthToken() {
    try {
      if (typeof window.FiberAuth !== 'undefined' &&
          typeof window.FiberAuth.getAccess === 'function') {
        return window.FiberAuth.getAccess();
      }
    } catch (_) { /* ignore */ }
    return null;
  }

  function buildUrl(path) {
    if (!path) return BASE_URL;
    if (path.indexOf('http://') === 0 || path.indexOf('https://') === 0) return path;
    var prefix = path.indexOf('/') === 0 ? '' : '/';
    return BASE_URL + prefix + path;
  }

  /**
   * Internal helper: perform a fetch with JWT auth headers and return
   * the raw Response object (for blob downloads) or parsed body.
   */
  function authFetch(url, options) {
    options = options || {};
    var headers = new Headers(options.headers || {});
    var token = getAuthToken();
    if (token) {
      headers.set('Authorization', 'Bearer ' + token);
    }
    if (!(options.body instanceof FormData)) {
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
    }
    return fetch(url, { ...options, headers: headers });
  }

  /**
   * Download a file by fetching it as a blob with JWT auth, then
   * creating a temporary anchor to trigger the browser download.
   * This is necessary because <a href="..."> cannot send custom headers.
   */
  function downloadBlob(url, defaultFileName) {
    // Show a brief "downloading" indicator if available
    authFetch(url, { method: 'GET' })
      .then(function (response) {
        if (!response.ok) {
          // Try to get error detail
          return response.json().then(function (err) {
            throw new Error(err.detail || 'Download failed (' + response.status + ')');
          }).catch(function () {
            throw new Error('Download failed (' + response.status + ')');
          });
        }
        // Determine filename from Content-Disposition or fallback
        var disposition = response.headers.get('Content-Disposition') || '';
        var match = disposition.match(/filename="?([^"]+)"?/);
        var fileName = match ? match[1] : defaultFileName;
        return response.blob().then(function (blob) {
          var blobUrl = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = blobUrl;
          a.download = fileName;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          setTimeout(function () {
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
          }, 200);
        });
      })
      .catch(function (err) {
        console.error('Download error:', err);
        alert('Download failed: ' + err.message);
      });
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  // ------------------------------------------------------------------
  // Pre-flight validation
  // ------------------------------------------------------------------

  /**
   * Upload files to the validation endpoint for quick pre-checks.
   * Returns { valid, checks, summary, pass_count, warn_count, fail_count }.
   * Endpoint: POST /api/ftth/hld/validate/
   */
  async function validatePipeline(excelFile, roadsFile) {
    var fd = new FormData();
    fd.append('excel', excelFile);
    fd.append('roads', roadsFile);

    var url = buildUrl(API_PREFIX + '/validate/');
    var headers = new Headers();
    var token = getAuthToken();
    if (token) headers.set('Authorization', 'Bearer ' + token);

    var response = await fetch(url, { method: 'POST', body: fd, headers: headers });
    var body = await parseBody(response);
    if (!response.ok) {
      var msg = body && typeof body === 'object' && body.detail
        ? body.detail
        : response.status + ' ' + response.statusText;
      throw new Error(msg);
    }
    return body;
  }

  async function runPipeline(excelFile, roadsFile, name, polyMethod) {
    var fd = new FormData();
    fd.append('excel', excelFile);
    fd.append('roads', roadsFile);
    if (name) fd.append('name', name);
    if (polyMethod !== undefined) fd.append('poly_method', String(polyMethod));

    var url = buildUrl(API_PREFIX + '/run/');
    var headers = new Headers();
    var token = getAuthToken();
    if (token) headers.set('Authorization', 'Bearer ' + token);
    // Don't set Content-Type for FormData

    var response = await fetch(url, { method: 'POST', body: fd, headers: headers });
    var body = await parseBody(response);

    if (!response.ok) {
      var msg = body && typeof body === 'object' && body.detail
        ? body.detail
        : body && typeof body === 'object' && body.message
          ? body.message
          : response.status + ' ' + response.statusText;
      throw new Error(msg);
    }
    return body;
  }

  async function getPipelineStatus(projectId) {
    var id = encodeURIComponent(projectId);
    var url = buildUrl(API_PREFIX + '/results/' + id + '/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      throw new Error((body && body.detail) || response.statusText);
    }
    return body;
  }

  async function getPipelineLayer(projectId, layerName) {
    var id = encodeURIComponent(projectId);
    var name = encodeURIComponent(layerName);
    var url = buildUrl(API_PREFIX + '/results/' + id + '/layers/' + name + '/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      throw new Error((body && body.detail) || response.statusText);
    }
    return body;
  }

  function getDownloadUrl(projectId, fileName) {
    var id = encodeURIComponent(projectId);
    var fn = encodeURIComponent(fileName);
    return buildUrl(API_PREFIX + '/download/' + id + '/' + fn);
  }

  /**
   * Download a pipeline output file with JWT auth.
   * Uses fetch + blob to include the Authorization header.
   */
  function downloadFile(projectId, fileName) {
    var url = getDownloadUrl(projectId, fileName);
    downloadBlob(url, fileName);
  }

  function getSurveyPackageUrl(projectId) {
    var id = encodeURIComponent(projectId);
    return buildUrl(API_PREFIX + '/results/' + id + '/survey-package/');
  }

  /**
   * Download the survey package zip with JWT auth.
   */
  function downloadSurveyPackage(projectId) {
    var url = getSurveyPackageUrl(projectId);
    downloadBlob(url, projectId + '_survey_package.zip');
  }

  async function listProjects(limit) {
    var qs = limit ? '?limit=' + encodeURIComponent(limit) : '';
    var url = buildUrl(API_PREFIX + '/projects/' + qs);
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      throw new Error((body && body.detail) || response.statusText);
    }
    return body;
  }

  // ------------------------------------------------------------------
  // Step-by-step pipeline execution
  // ------------------------------------------------------------------

  /**
   * Get step-by-step progress for a pipeline run.
   * Returns the pipeline_state with per-step status, outputs, and errors.
   * Endpoint: GET /api/ftth/hld/progress/<project_id>/
   */
  async function getPipelineProgress(projectId) {
    var id = encodeURIComponent(projectId);
    var url = buildUrl(API_PREFIX + '/progress/' + id + '/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      throw new Error((body && body.detail) || response.statusText);
    }
    return body;
  }

  /**
   * Run a single pipeline step.
   * Endpoint: POST /api/ftth/hld/run/step/<step_name>/
   *
   * @param {string} projectId
   * @param {string} stepName  - e.g., "object", "polygon", "network", "trench", "cable", "duct"
   * @param {Object} [fileMap] - Optional dict of form field name -> File reference
   * @returns {Promise<Object>}
   */
  async function runPipelineStep(projectId, stepName, fileMap) {
    var id = encodeURIComponent(projectId);
    var name = encodeURIComponent(stepName);
    var url = buildUrl(API_PREFIX + '/run/step/' + name + '/');

    var fd = new FormData();
    fd.append('project_id', projectId);

    // Add optional files (uploaded GPKGs from previous steps)
    if (fileMap) {
      Object.keys(fileMap).forEach(function (fieldName) {
        var file = fileMap[fieldName];
        fd.append(fieldName, file);
      });
    }

    var headers = new Headers();
    var token = getAuthToken();
    if (token) headers.set('Authorization', 'Bearer ' + token);

    var response = await fetch(url, { method: 'POST', body: fd, headers: headers });
    var body = await parseBody(response);
    if (!response.ok) {
      var msg = body && typeof body === 'object' && body.detail
        ? body.detail
        : body && typeof body === 'object' && body.message
          ? body.message
          : response.status + ' ' + response.statusText;
      throw new Error(msg);
    }
    return body;
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  async function parseBody(response) {
    var ct = (response.headers.get('content-type') || '').toLowerCase();
    if (ct.indexOf('application/json') !== -1) {
      try { return await response.json(); } catch (_) { return null; }
    }
    try { return await response.text(); } catch (_) { return null; }
  }

  // ------------------------------------------------------------------
  // Module exports
  // ------------------------------------------------------------------

  window.FtthApi = {
    BASE_URL: BASE_URL,
    validatePipeline: validatePipeline,
    runPipeline: runPipeline,
    getPipelineStatus: getPipelineStatus,
    getPipelineLayer: getPipelineLayer,
    getDownloadUrl: getDownloadUrl,
    downloadFile: downloadFile,
    getSurveyPackageUrl: getSurveyPackageUrl,
    downloadSurveyPackage: downloadSurveyPackage,
    listProjects: listProjects,
    getPipelineProgress: getPipelineProgress,
    runPipelineStep: runPipelineStep,
  };
})();
