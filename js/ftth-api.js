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
 *   GET  /api/ftth/hld/results/{id}/survey-package/  — field-survey subset (ZIP)
 *   GET  /api/ftth/hld/results/{id}/design-package/  — full design package (ZIP)
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
  async function downloadBlob(url, defaultFileName) {
    var response = await authFetch(url, { method: 'GET' });
    if (!response.ok) {
      var detail = 'Download failed (' + response.status + ')';
      try {
        var errorBody = await response.json();
        detail = errorBody.detail || detail;
      } catch (_) { /* keep HTTP fallback */ }
      throw new Error(detail);
    }
    var disposition = response.headers.get('Content-Disposition') || '';
    var match = disposition.match(/filename="?([^";]+)"?/);
    var fileName = match ? match[1] : defaultFileName;
    var blob = await response.blob();
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
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------



  async function runPipeline(excelFile, roadsFile, name, polyMethod, brownfieldFile, osmLayers) {
    var fd = new FormData();
    fd.append('excel', excelFile);
    fd.append('roads', roadsFile);
    if (brownfieldFile) fd.append('brownfield', brownfieldFile);
    if (name) fd.append('name', name);
    if (polyMethod !== undefined) fd.append('poly_method', String(polyMethod));

    // Optional OSM reference layers (railways / waterways / water / landuse /
    // natural). Stored with the project for future routing-constraint use.
    osmLayers = osmLayers || {};
    var layerFields = [
      ['railways', osmLayers.railwaysFile],
      ['waterways', osmLayers.waterwaysFile],
      ['water', osmLayers.waterFile],
      ['landuse', osmLayers.landuseFile],
      ['natural', osmLayers.naturalFile]
    ];
    for (var i = 0; i < layerFields.length; i++) {
      if (layerFields[i][1]) fd.append(layerFields[i][0], layerFields[i][1]);
    }

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
    // Keep polling on the canonical Django route; the trailing slash is
    // required by Django's URL resolver and prevents redirect/404 noise.
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

  /**
   * Permit matrix for a project (used by the HLD results map colouring).
   * Rows carry { layer, route_section, status } keyed against the layer
   * feature ids the GeoJSON endpoints serve.
   */
  async function getProjectPermits(projectId) {
    var id = encodeURIComponent(projectId);
    var url = buildUrl('/api/ftth/permits/projects/' + id + '/permits/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
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
    return downloadBlob(url, projectId + '_survey_package.zip').catch(function (err) {
      console.error('Download error:', err);
      alert('Download failed: ' + err.message);
    });
  }

  function getDesignPackageUrl(projectId) {
    var id = encodeURIComponent(projectId);
    return buildUrl(API_PREFIX + '/results/' + id + '/design-package/');
  }

  /**
   * Download the full HLD design package zip with JWT auth.
   */
  function downloadDesignPackage(projectId) {
    var url = getDesignPackageUrl(projectId);
    return downloadBlob(url, projectId + '_design_package.zip').catch(function (err) {
      console.error('Download error:', err);
      alert('Download failed: ' + err.message);
    });
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
  // BOQ / BOM (computed from the HLD layers, priced by the rate card)
  // ------------------------------------------------------------------

  /**
   * Fetch the computed BOQ/BOM for a completed HLD run.
   * Endpoint: GET /api/ftth/hld/results/<id>/boq/
   */
  async function getBoq(projectId) {
    var id = encodeURIComponent(projectId);
    var url = buildUrl(API_PREFIX + '/results/' + id + '/boq/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      throw new Error((body && body.detail) || response.statusText);
    }
    return body;
  }

  /**
   * Force-recompute the BOQ/BOM snapshot for a project.
   * Endpoint: POST /api/ftth/hld/results/<id>/boq/regenerate/
   */
  async function regenerateBoq(projectId) {
    var id = encodeURIComponent(projectId);
    var url = buildUrl(API_PREFIX + '/results/' + id + '/boq/regenerate/');
    var response = await authFetch(url, { method: 'POST' });
    var body = await parseBody(response);
    if (!response.ok) {
      throw new Error((body && body.detail) || response.statusText);
    }
    return body;
  }

  /**
   * Download the BOQ/BOM workbook (XLSX) with JWT auth.
   * Endpoint: GET /api/ftth/hld/results/<id>/boq/download/
   */
  function downloadBoq(projectId) {
    var id = encodeURIComponent(projectId);
    var url = buildUrl(API_PREFIX + '/results/' + id + '/boq/download/');
    return downloadBlob(url, projectId + '_BOQ.xlsx').catch(function (err) {
      console.error('Download error:', err);
      alert('Download failed: ' + err.message);
    });
  }



  // ------------------------------------------------------------------
  // Delete a project
  // ------------------------------------------------------------------

  /**
   * Delete a pipeline project and all its associated data.
   * Endpoint: DELETE /api/ftth/hld/projects/<project_id>/
   *
   * @param {string} projectId
   * @returns {Promise<Object>}  { deleted: bool, project_id: string }
   */
  async function deleteProject(projectId) {
    var id = encodeURIComponent(projectId);
    var url = buildUrl(API_PREFIX + '/projects/' + id + '/');
    var response = await authFetch(url, { method: 'DELETE' });
    var body = await parseBody(response);
    if (!response.ok) {
      throw new Error((body && body.detail) || response.statusText);
    }
    return body;
  }

  /**
   * Trench design (Phase A of TRENCH_DESIGN.md).
   *
   * The designed civil network for a project: status + report + one
   * FeatureCollection per design layer (trench spans, structural nodes, HDD
   * crossings, aerial drops, aerial zones).
   *
   * @param {string} projectId
   * @param {boolean} [includeLayers=true]
   */
  async function getTrenchDesign(projectId, includeLayers) {
    var id = encodeURIComponent(projectId);
    var suffix = includeLayers === false ? '?layers=false' : '';
    var url = buildUrl(API_PREFIX + '/results/' + id + '/trench-design/' + suffix);
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      throw new Error((body && body.detail) || response.statusText);
    }
    return body;
  }

  /**
   * Start (or re-run) the trench designer for a project. Returns immediately
   * with the queued status; poll ``getTrenchDesign`` for progress.
   */
  async function runTrenchDesign(projectId, force) {
    var id = encodeURIComponent(projectId);
    var url = buildUrl(API_PREFIX + '/results/' + id + '/trench-design/run/');
    var response = await authFetch(url, {
      method: 'POST',
      body: JSON.stringify({ force: !!force }),
    });
    var body = await parseBody(response);
    if (!response.ok) {
      throw new Error((body && body.detail) || response.statusText);
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
    runPipeline: runPipeline,
    getPipelineStatus: getPipelineStatus,
    getPipelineLayer: getPipelineLayer,
    getProjectPermits: getProjectPermits,
    getDownloadUrl: getDownloadUrl,
    downloadFile: downloadFile,
    getSurveyPackageUrl: getSurveyPackageUrl,
    downloadSurveyPackage: downloadSurveyPackage,
    getDesignPackageUrl: getDesignPackageUrl,
    downloadDesignPackage: downloadDesignPackage,
    listProjects: listProjects,
    deleteProject: deleteProject,
    getBoq: getBoq,
    regenerateBoq: regenerateBoq,
    downloadBoq: downloadBoq,
    getTrenchDesign: getTrenchDesign,
    runTrenchDesign: runTrenchDesign,
  };
})();
