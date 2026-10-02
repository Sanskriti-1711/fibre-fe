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
  /**
   * Renew the access token through whichever auth module is loaded.
   * Resolves to the new token, or null when renewal is not possible.
   *
   * `refreshAccessToken` lives on `FiberApi` (fiber-api.js), not on
   * `FiberAuth` — the latter only exposes `getAccess`/`getRefresh`/`clear`.
   * Both are checked so the page's script order does not matter.
   */
  async function refreshAccessToken() {
    var modules = [window.FiberApi, window.FiberAuth];
    for (var i = 0; i < modules.length; i++) {
      var mod = modules[i];
      if (mod && typeof mod.refreshAccessToken === 'function') {
        try {
          return await mod.refreshAccessToken();
        } catch (_) {
          return null;
        }
      }
    }
    return null;
  }

  /**
   * `fetch` with JWT auth, renewing the access token once on 401.
   *
   * The access token lives 12 hours; the refresh token 30 days. Without the
   * renewal below an expired access token made every FTTH call fail with a bare
   * 401 until the user logged out and back in — which is what made the pipeline
   * look like it would not start: the multipart upload was rejected before it
   * ever reached the engine, so no run appeared anywhere. The legacy
   * `fiber-api.js` client has always renewed on 401; these FTTH clients did not.
   */
  /**
   * Drop a session whose access token can no longer be renewed, so the app does
   * not keep sending a dead token and prompting nothing but a 401.
   */
  function expireSession() {
    try {
      if (window.FiberAuth && typeof window.FiberAuth.clear === 'function') {
        window.FiberAuth.clear();
      }
    } catch (_) { /* ignore */ }
  }

  async function authFetch(url, options, _retried) {
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
    var response = await fetch(url, { ...options, headers: headers });
    if (response.status === 401 && !_retried) {
      var renewed = await refreshAccessToken();
      if (renewed) return authFetch(url, options, true);
      // Renewal is impossible: localStorage holds a token whose refresh
      // credential is missing or has itself expired, so no amount of retrying
      // will help. Drop it and say so, rather than surfacing the raw
      // "Given token not valid for any token type" the backend returns.
      expireSession();
      throw new Error('Session expired. Please login again.');
    }
    return response;
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
    // Through `authFetch` (which leaves Content-Type unset for FormData) so an
    // expired access token is renewed and the upload retried, instead of the
    // run dying on a bare 401 that never reaches the engine.
    var response = await authFetch(url, { method: 'POST', body: fd });
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

  async function getSurfaceAIReview(projectId) {
    var id = encodeURIComponent(projectId);
    var url = buildUrl(API_PREFIX + '/results/' + id + '/surface-ai-review/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error((body && body.detail) || response.statusText);
    }
    return body;
  }

  /**
   * Classify the surface at one clicked map coordinate (advisory only).
   *
   * `coordinates` is `{lng, lat}` in WGS84. Resolves to a single review item
   * shaped like the batch report's suggestions. The engine fetches fresh
   * imagery and runs the vision model, so a slow local model can make this
   * request take a while.
   */
  async function classifySurfaceAt(projectId, coordinates, options) {
    var id = encodeURIComponent(projectId);
    var url = buildUrl(API_PREFIX + '/results/' + id + '/surface-ai-review/classify/');
    var opts = options || {};
    var payload = {
      coordinates: [Number(coordinates.lng), Number(coordinates.lat)],
      crs: opts.crs || 'EPSG:4326',
    };
    if (opts.length_m != null) payload.length_m = Number(opts.length_m);
    if (opts.bearing != null) payload.bearing = Number(opts.bearing);
    if (opts.include_imagery) payload.include_imagery = true;
    var response = await authFetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    var body = await parseBody(response);
    if (!response.ok) {
      throw new Error((body && body.detail) || response.statusText);
    }
    return body;
  }

  /**
   * Classify the surface along ONE uncertain span the reader opted into.
   *
   * Sends the span's own route geometry, so exactly one model call is spent per
   * choice and no batch is ever started. The response also carries the imagery
   * patch the model saw (base64) unless `include_imagery` is turned off, so the
   * page can show it next to the answer.
   */
  async function classifySurfaceSpan(projectId, span, options) {
    var id = encodeURIComponent(projectId);
    var url = buildUrl(API_PREFIX + '/results/' + id + '/surface-ai-review/classify/');
    var opts = options || {};
    var payload = {
      coordinates: span.coordinates,
      coordinates_crs: span.coordinates_crs || 'EPSG:4326',
      span_id: span.span_id,
      include_imagery: opts.include_imagery !== false,
    };
    if (span.claimed_surface != null) payload.claimed_surface = span.claimed_surface;
    if (span.geometry_reason != null) payload.geometry_reason = span.geometry_reason;
    if (span.geometry_confidence != null) payload.geometry_confidence = span.geometry_confidence;
    if (span.known_share != null) payload.known_share = span.known_share;
    var response = await authFetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    var body = await parseBody(response);
    if (!response.ok) {
      throw new Error((body && body.detail) || response.statusText);
    }
    return body;
  }

  /**
   * Fetch the imagery patch a detect would send, without calling the model.
   *
   * `request` carries either a clicked point ({lng, lat, crs}) or a span's route
   * ({coordinates, coordinates_crs, span_id}). Imagery-only, so it spends no
   * vision-model quota; this is how the page shows the patch before a detect.
   */
  async function previewSurfaceImagery(projectId, request) {
    var id = encodeURIComponent(projectId);
    var url = buildUrl(API_PREFIX + '/results/' + id + '/surface-ai-review/imagery/');
    var payload;
    if (request && request.coordinates) {
      payload = {
        coordinates: request.coordinates,
        coordinates_crs: request.coordinates_crs || 'EPSG:4326',
      };
      if (request.span_id) payload.span_id = request.span_id;
    } else {
      payload = {
        coordinates: [Number(request.lng), Number(request.lat)],
        crs: request.crs || 'EPSG:4326',
      };
    }
    var response = await authFetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
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
      alert('Download failed: ' + FtthUI.humanize(err));
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
      alert('Download failed: ' + FtthUI.humanize(err));
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
      alert('Download failed: ' + FtthUI.humanize(err));
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
  // Area-driven runs
  // ------------------------------------------------------------------

  /**
   * Attach the HTTP status to an Error so callers can tell the honest
   * failure modes apart. "Area not found" (404), "OSM services
   * unreachable" (502), "too many premises" (422) and "PostGIS down"
   * (503) need four different messages — collapsing them into one string
   * tells the user the wrong thing.
   */
  function areaError(body, response) {
    var msg = body && typeof body === 'object' && body.detail
      ? body.detail
      : response.status + ' ' + response.statusText;
    var err = new Error(msg);
    err.status = response.status;
    err.body = body;
    return err;
  }

  /**
   * Normalize an area request to the structured field set the API expects.
   *
   * Accepts either a plain string (an area name or postcode, the older form) or
   * an object of {country, city, postcode, area_name}. The country is sent as
   * chosen and is never inferred — the server used to assume Germany for any
   * five-digit code, which read a US ZIP as a German one.
   */
  function areaFields(request) {
    if (request && typeof request === 'object') {
      var out = {};
      ['country', 'city', 'postcode', 'area_name', 'area'].forEach(function (key) {
        var value = request[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          out[key] = String(value).trim();
        }
      });
      return out;
    }
    var text = String(request === undefined || request === null ? '' : request).trim();
    return text ? { area: text } : {};
  }

  /**
   * Resolve an area to its boundary, premises and households.
   *
   * ``boundaryOnly`` returns as soon as Nominatim resolves the area, so the
   * map can draw the boundary right away. The full call additionally needs
   * the area's OpenStreetMap data, which is fetched and cached on first use
   * (minutes on a cold area, instant afterwards).
   */
  async function resolveArea(request, boundaryOnly) {
    var url = buildUrl(API_PREFIX + '/resolve-area/');
    var payload = areaFields(request);
    payload.boundary_only = !!boundaryOnly;
    var response = await authFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    var body = await parseBody(response);
    if (!response.ok) throw areaError(body, response);
    return body;
  }

  /**
   * Progress of the engine's OSM download for an area.
   *
   * A cold area takes 10-16 minutes to download; the page polls this while it
   * waits so the wait says what it is doing instead of looking like a hang.
   * Best-effort: an unreachable engine reports ``unavailable`` rather than
   * throwing, because a failed progress poll must not fail the preview.
   */
  async function getAreaFetch(area, bbox) {
    var params = [];
    if (area) params.push('area=' + encodeURIComponent(area));
    if (bbox && bbox.length === 4) {
      params.push('bbox=' + encodeURIComponent(bbox.join(',')));
    }
    if (!params.length) return { state: 'unknown', fetching: false, label: '' };
    var url = buildUrl(API_PREFIX + '/area-fetch/?' + params.join('&'));
    try {
      var response = await authFetch(url);
      var body = await parseBody(response);
      if (!response.ok) return { state: 'unavailable', fetching: false, label: '' };
      return body;
    } catch (_) {
      return { state: 'unavailable', fetching: false, label: '' };
    }
  }

  /** Return one complete OSM/HLD input layer for the pre-run review. */
  async function getInputLayer(request, layer) {
    var url = buildUrl(API_PREFIX + '/input-layers/');
    var payload = areaFields(request);
    payload.layer = layer;
    var response = await authFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    var body = await parseBody(response);
    if (!response.ok) throw areaError(body, response);
    return body;
  }

  /**
   * Start a full HLD run from an area. The engine fetches the area's OSM data,
   * writes the same two input files a manual upload would, and runs the
   * unchanged pipeline on them. Returns the new project id.
   */
  async function runFromArea(request, name, polyMethod) {
    var url = buildUrl(API_PREFIX + '/run-from-area/');
    var payload = areaFields(request);
    if (name) payload.name = name;
    if (polyMethod !== undefined) payload.poly_method = polyMethod;
    var response = await authFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    var body = await parseBody(response);
    if (!response.ok) throw areaError(body, response);
    return body;
  }

  /** Country options for the area input's country dropdown. */
  async function getCountries() {
    var url = buildUrl(API_PREFIX + '/countries/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) throw areaError(body, response);
    return body.countries || [];
  }

  /**
   * City/town suggestions for the city combobox, filtered by country.
   *
   * Best-effort: an empty list is a normal answer while someone is typing.
   */
  async function suggestPlaces(query, countryCode, limit) {
    var params = ['q=' + encodeURIComponent(query)];
    if (countryCode) params.push('country=' + encodeURIComponent(countryCode));
    params.push('limit=' + encodeURIComponent(limit || 8));
    var url = buildUrl(API_PREFIX + '/places/?' + params.join('&'));
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) return { places: [], reason: 'unavailable' };
    return body;
  }

  /** What the engine's local OSM store holds (empty is normal). */
  async function getOsmStatus() {
    var url = buildUrl(API_PREFIX + '/osm-status/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) throw areaError(body, response);
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
    getSurfaceAIReview: getSurfaceAIReview,
    classifySurfaceAt: classifySurfaceAt,
    classifySurfaceSpan: classifySurfaceSpan,
    previewSurfaceImagery: previewSurfaceImagery,
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
    resolveArea: resolveArea,
    getAreaFetch: getAreaFetch,
    getInputLayer: getInputLayer,
    runFromArea: runFromArea,
    getCountries: getCountries,
    suggestPlaces: suggestPlaces,
    getOsmStatus: getOsmStatus,
  };
})();
