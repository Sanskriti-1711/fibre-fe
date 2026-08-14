/**
 * FTTH LLD — API Client (Django Backend Proxy)
 *
 * Communicates with the Django backend which serves the LLD review workflow
 * from real survey data:
 *
 *   GET  /api/ftth/lld/projects/<project_id>/review/   → review payload
 *   POST /api/ftth/lld/projects/<project_id>/changes/<change_id>/action/
 *                                                    {action, comment}
 *   POST /api/ftth/lld/projects/<project_id>/approved-version/
 *   POST /api/ftth/lld/projects/<project_id>/runs/
 *   GET  /api/ftth/lld/projects/<project_id>/versions/
 *
 * Auth: JWT from FiberAuth (localStorage key "fiber_auth").
 */

(function () {
  'use strict';

  var BASE_URL =
    (window.FTTH_BASE_URL || window.location.origin).replace(/\/+$/, '');
  var API_PREFIX = '/api/ftth/lld';

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

  function authFetch(url, options) {
    options = options || {};
    var headers = new Headers(options.headers || {});
    var token = getAuthToken();
    if (token) headers.set('Authorization', 'Bearer ' + token);
    if (!(options.body instanceof FormData)) {
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
    }
    return fetch(url, Object.assign({}, options, { headers: headers }));
  }

  function parseBody(response) {
    var ct = (response.headers.get('content-type') || '').toLowerCase();
    if (ct.indexOf('application/json') !== -1) {
      return response.json().catch(function () { return null; });
    }
    return response.text().catch(function () { return null; });
  }

  // ==================================================================
  // Real API
  // ==================================================================

  async function apiLoadReview(projectId) {
    var url = buildUrl(API_PREFIX + '/projects/' + encodeURIComponent(projectId) + '/review/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  async function apiSubmitAction(projectId, changeId, action, comment) {
    var url = buildUrl(API_PREFIX + '/projects/' + encodeURIComponent(projectId) + '/changes/' + encodeURIComponent(changeId) + '/action/');
    var response = await authFetch(url, {
      method: 'POST',
      body: JSON.stringify({ action: action, comment: comment || '' }),
    });
    var body = await parseBody(response);
    if (!response.ok) throw new Error((body && body.detail) || response.statusText);
    return body;
  }

  async function apiCreateApprovedVersion(projectId) {
    var url = buildUrl(API_PREFIX + '/projects/' + encodeURIComponent(projectId) + '/approved-version/');
    var response = await authFetch(url, { method: 'POST', body: JSON.stringify({}) });
    var body = await parseBody(response);
    if (!response.ok) throw new Error((body && body.detail) || response.statusText);
    return body;
  }

  async function apiRunLld(projectId) {
    var url = buildUrl(API_PREFIX + '/projects/' + encodeURIComponent(projectId) + '/runs/');
    var response = await authFetch(url, { method: 'POST', body: JSON.stringify({}) });
    var body = await parseBody(response);
    if (!response.ok) throw new Error((body && body.detail) || response.statusText);
    return body;
  }

  async function apiListVersions(projectId) {
    var url = buildUrl(API_PREFIX + '/projects/' + encodeURIComponent(projectId) + '/versions/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  async function apiGetRunStatus(projectId, lldVersion) {
    var url = buildUrl(API_PREFIX + '/projects/' + encodeURIComponent(projectId) + '/runs/' + encodeURIComponent(lldVersion) + '/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  async function apiGetRunLayer(projectId, lldVersion, layer) {
    var url = buildUrl(API_PREFIX + '/projects/' + encodeURIComponent(projectId) + '/runs/' + encodeURIComponent(lldVersion) + '/layers/' + encodeURIComponent(layer) + '/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  function downloadBlob(url, defaultFileName) {
    authFetch(url, { method: 'GET' })
      .then(function (response) {
        if (!response.ok) {
          return response.json().then(function (err) {
            throw new Error((err && err.detail) || 'Download failed (' + response.status + ')');
          }).catch(function () {
            throw new Error('Download failed (' + response.status + ')');
          });
        }
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

  function apiDownloadRunZip(projectId, lldVersion) {
    var url = buildUrl(API_PREFIX + '/projects/' + encodeURIComponent(projectId) + '/runs/' + encodeURIComponent(lldVersion) + '/download/');
    downloadBlob(url, projectId + '_' + lldVersion + '_lld.zip');
  }

  // ==================================================================
  // Project resolution — pick the latest completed HLD run so the LLD
  // pages work out of the box when no ?project_id= is supplied.
  // ==================================================================

  async function resolveDefaultProject() {
    var url = buildUrl('/api/ftth/hld/projects/?limit=20');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) return null;
    var list = Array.isArray(body) ? body : (body && body.results) || [];
    var completed = list.filter(function (p) { return p.status === 'completed'; });
    var pick = completed[0] || list[0];
    return pick ? { project_id: pick.project_id, name: pick.name } : null;
  }

  async function apiListProjects() {
    var url = buildUrl(API_PREFIX + '/projects/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  async function apiListRuns() {
    var url = buildUrl(API_PREFIX + '/runs/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  async function apiGetFeatureLineage(projectId, featureId) {
    var url = buildUrl(API_PREFIX + '/projects/' + encodeURIComponent(projectId) + '/features/' + encodeURIComponent(featureId) + '/lineage/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  async function apiGetProjectOverview(projectId) {
    var url = buildUrl(API_PREFIX + '/projects/' + encodeURIComponent(projectId) + '/overview/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  async function apiListUsers() {
    var url = buildUrl('/api/users/all/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  async function apiListMembers(projectId) {
    var url = buildUrl(API_PREFIX + '/projects/' + encodeURIComponent(projectId) + '/members/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  async function apiAddMember(projectId, userId, role) {
    var url = buildUrl(API_PREFIX + '/projects/' + encodeURIComponent(projectId) + '/members/');
    var response = await authFetch(url, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, role: role }),
    });
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  async function apiRemoveMember(projectId, memberId) {
    var url = buildUrl(API_PREFIX + '/projects/' + encodeURIComponent(projectId) + '/members/' + encodeURIComponent(memberId) + '/');
    var response = await authFetch(url, { method: 'DELETE' });
    if (response.status === 204) return null;
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  // ==================================================================
  // Permits (Phase 1 — /api/ftth/permits/*)
  // ==================================================================

  async function apiGetProjectPermits(projectId) {
    var url = buildUrl('/api/ftth/permits/projects/' + encodeURIComponent(projectId) + '/permits/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  async function apiListAllPermits(params) {
    params = params || {};
    var qs = Object.keys(params)
      .filter(function (k) { return params[k]; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');
    var url = buildUrl('/api/ftth/permits/' + (qs ? '?' + qs : ''));
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  async function apiRunPermitAnalysis(projectId) {
    var url = buildUrl('/api/ftth/permits/projects/' + encodeURIComponent(projectId) + '/permits/analyze/');
    var response = await authFetch(url, { method: 'POST', body: JSON.stringify({}) });
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  // ==================================================================
  // Public API
  // ==================================================================

  function loadReview(projectId) { return apiLoadReview(projectId); }
  function submitAction(projectId, changeId, action, comment) { return apiSubmitAction(projectId, changeId, action, comment); }
  function createApprovedVersion(projectId) { return apiCreateApprovedVersion(projectId); }
  function runLld(projectId) { return apiRunLld(projectId); }
  function listVersions(projectId) { return apiListVersions(projectId); }
  function getRunStatus(projectId, lldVersion) { return apiGetRunStatus(projectId, lldVersion); }
  function getRunLayer(projectId, lldVersion, layer) { return apiGetRunLayer(projectId, lldVersion, layer); }
  function downloadRunZip(projectId, lldVersion) { apiDownloadRunZip(projectId, lldVersion); }

  function getProject(projectId) {
    return apiLoadReview(projectId).then(function (r) { return r.project; });
  }

  function listProjects() { return apiListProjects(); }
  function listRuns() { return apiListRuns(); }
  function getFeatureLineage(projectId, featureId) { return apiGetFeatureLineage(projectId, featureId); }
  function getProjectOverview(projectId) { return apiGetProjectOverview(projectId); }
  function listUsers() { return apiListUsers(); }
  function listMembers(projectId) { return apiListMembers(projectId); }
  function addMember(projectId, userId, role) { return apiAddMember(projectId, userId, role); }
  function removeMember(projectId, memberId) { return apiRemoveMember(projectId, memberId); }

  window.FtthLldApi = {
    loadReview: loadReview,
    submitAction: submitAction,
    createApprovedVersion: createApprovedVersion,
    runLld: runLld,
    listVersions: listVersions,
    getRunStatus: getRunStatus,
    getRunLayer: getRunLayer,
    downloadRunZip: downloadRunZip,
    getProject: getProject,
    resolveDefaultProject: resolveDefaultProject,
    listProjects: listProjects,
    listRuns: listRuns,
    getFeatureLineage: getFeatureLineage,
    getProjectOverview: getProjectOverview,
    getProjectPermits: apiGetProjectPermits,
    listAllPermits: apiListAllPermits,
    runPermitAnalysis: apiRunPermitAnalysis,
    listUsers: listUsers,
    listMembers: listMembers,
    addMember: addMember,
    removeMember: removeMember,
  };
})();
