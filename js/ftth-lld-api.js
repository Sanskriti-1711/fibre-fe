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
   * Same 12-hour access token as the HLD client: without this, reviewing a
   * change or starting an LLD run failed with a bare 401 until the user logged
   * out and back in. The legacy `fiber-api.js` client has always renewed on
   * 401; this one did not.
   */
  /**
   * Drop a session whose access token can no longer be renewed.
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
    if (token) headers.set('Authorization', 'Bearer ' + token);
    if (!(options.body instanceof FormData)) {
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
    }
    var response = await fetch(url, Object.assign({}, options, { headers: headers }));
    if (response.status === 401 && !_retried) {
      var renewed = await refreshAccessToken();
      if (renewed) return authFetch(url, options, true);
      // Unrenewable session — drop it and say so (see ftth-api.js).
      expireSession();
      throw new Error('Session expired. Please login again.');
    }
    return response;
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

  async function apiRunLld(projectId, mode) {
    var url = buildUrl(API_PREFIX + '/projects/' + encodeURIComponent(projectId) + '/runs/');
    var body = JSON.stringify(mode ? { mode: mode } : {});
    var response = await authFetch(url, { method: 'POST', body: body });
    var bodyParsed = await parseBody(response);
    if (!response.ok) throw new Error((bodyParsed && bodyParsed.detail) || response.statusText);
    return bodyParsed;
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

  // Tier-1 A24 — cross-run diff ("what changed between LLD-V05 and V06").
  async function apiDiffVersions(projectId, fromVersion, toVersion) {
    var qs = '';
    if (fromVersion) qs += '?from=' + encodeURIComponent(fromVersion);
    if (toVersion) qs += (qs ? '&' : '?') + 'to=' + encodeURIComponent(toVersion);
    var url = buildUrl(API_PREFIX + '/projects/' + encodeURIComponent(projectId) + '/versions/diff/' + qs);
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

  async function apiGetPermitSummary() {
    var url = buildUrl('/api/ftth/permits/summary/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  async function apiGeneratePermitPackage(projectId) {
    var url = buildUrl('/api/ftth/permits/projects/' + encodeURIComponent(projectId) + '/package/');
    var response = await authFetch(url, { method: 'POST', body: JSON.stringify({}) });
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  async function apiGetPermitPackage(projectId) {
    var url = buildUrl('/api/ftth/permits/projects/' + encodeURIComponent(projectId) + '/package/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  function getPermitPackageDownloadUrl(projectId) {
    return buildUrl('/api/ftth/permits/projects/' + encodeURIComponent(projectId) + '/package/download/');
  }

  // ==================================================================
  // Permit submissions (Phase 3 — /api/ftth/permits/submissions/*)
  // ==================================================================

  async function apiListSubmissions(params) {
    params = params || {};
    var qs = Object.keys(params)
      .filter(function (k) { return params[k]; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');
    var url = buildUrl('/api/ftth/permits/submissions/' + (qs ? '?' + qs : ''));
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  async function apiCreateSubmission(payload) {
    var url = buildUrl('/api/ftth/permits/submissions/');
    var response = await authFetch(url, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  async function apiTransitionSubmission(submissionId, payload) {
    var url = buildUrl('/api/ftth/permits/submissions/' + encodeURIComponent(submissionId) + '/transition/');
    var response = await authFetch(url, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    var body = await parseBody(response);
    if (!response.ok) {
      var err = new Error((body && body.detail) || response.statusText);
      err.status = response.status;
      throw err;
    }
    return body;
  }

  // Permit AI copilot (advisory-only; deterministic completeness/risk/timeline never overwritten)
  async function apiDraftPermit(projectId, payload) {
    var url = buildUrl('/api/ftth/permits/projects/' + encodeURIComponent(projectId) + '/ai/draft/');
    var response = await authFetch(url, { method: 'POST', body: JSON.stringify(payload || {}) });
    var body = await parseBody(response);
    if (!response.ok) {
      var msg = (body && (body.detail || body.hint)) ? ((body.detail||'') + (body.hint ? ' — ' + body.hint : '')) : (response.statusText || 'Draft failed');
      var err = new Error(msg.trim());
      err.status = response.status;
      err.detail = body && body.detail;
      err.hint = body && body.hint;
      err.body = body;
      throw err;
    }
    return body;
  }
  async function apiPermitRequirements(projectId, permitType, permitId) {
    var qs = permitType ? '?permit_type=' + encodeURIComponent(permitType) + (permitId ? '&permit_id=' + encodeURIComponent(permitId) : '')
      : permitId ? '?permit_id=' + encodeURIComponent(permitId) : '';
    var url = buildUrl('/api/ftth/permits/projects/' + encodeURIComponent(projectId) + '/ai/requirements/' + qs);
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) { var err = new Error((body && body.detail) || response.statusText); err.status = response.status; throw err; }
    return body;
  }
  async function apiExtractRequirements(projectId, rawText) {
    var url = buildUrl('/api/ftth/permits/projects/' + encodeURIComponent(projectId) + '/ai/requirements/');
    var response = await authFetch(url, { method: 'POST', body: JSON.stringify({ raw_text: rawText }) });
    var body = await parseBody(response);
    if (!response.ok) { var err = new Error((body && body.detail) || response.statusText); err.status = response.status; throw err; }
    return body;
  }
  async function apiPermitCompleteness(permitId) {
    var url = buildUrl('/api/ftth/permits/permits/' + encodeURIComponent(permitId) + '/ai/completeness/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) { var err = new Error((body && body.detail) || response.statusText); err.status = response.status; throw err; }
    return body;
  }
  async function apiPermitRisk(projectId, permitId) {
    var url = buildUrl('/api/ftth/permits/projects/' + encodeURIComponent(projectId) + '/ai/risk/' + (permitId ? '?permit_id=' + encodeURIComponent(permitId) : ''));
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) { var err = new Error((body && body.detail) || response.statusText); err.status = response.status; throw err; }
    return body;
  }
  async function apiPermitTimeline(projectId) {
    var url = buildUrl('/api/ftth/permits/projects/' + encodeURIComponent(projectId) + '/ai/timeline/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) { var err = new Error((body && body.detail) || response.statusText); err.status = response.status; throw err; }
    return body;
  }
  async function apiListDrafts(params) {
    params = params || {};
    var qs = Object.keys(params).filter(function(k){ return params[k]; }).map(function(k){ return encodeURIComponent(k)+'='+encodeURIComponent(params[k]); }).join('&');
    var url = buildUrl('/api/ftth/permits/ai/drafts/' + (qs ? '?' + qs : ''));
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) { var err = new Error((body && body.detail) || response.statusText); err.status = response.status; throw err; }
    return body;
  }
  async function apiReviewDraft(draftId) {
    var url = buildUrl('/api/ftth/permits/ai/drafts/' + encodeURIComponent(draftId) + '/review/');
    var response = await authFetch(url, { method: 'POST', body: JSON.stringify({}) });
    var body = await parseBody(response);
    if (!response.ok) { var err = new Error((body && body.detail) || response.statusText); err.status = response.status; throw err; }
    return body;
  }
  async function apiGetExpiries(projectId, params) {
    params = params || {};
    var qs = Object.keys(params).filter(function(k){ return params[k] != null && String(params[k]) !== ''; }).map(function(k){ return encodeURIComponent(k)+'='+encodeURIComponent(params[k]); }).join('&');
    var base = projectId ? '/api/ftth/permits/projects/' + encodeURIComponent(projectId) + '/expiries/' : '/api/ftth/permits/expiries/';
    var url = buildUrl(base + (qs ? '?' + qs : ''));
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) { var err = new Error((body && body.detail) || response.statusText); err.status = response.status; throw err; }
    return body;
  }
  // Package QA (P19b) — cross-project with ?project_id= filter, like expiries
  async function apiGetQa(projectId) {
    var base = projectId ? '/api/ftth/permits/projects/' + encodeURIComponent(projectId) + '/qa/' : '/api/ftth/permits/qa/';
    var url = buildUrl(base + (projectId ? '' : ('')));
    // Also support ?project_id= on the collection route for parity with expiries
    if (!projectId) {
      var pid = '';
      try { pid = new URLSearchParams(window.location.search).get('project_id') || ''; } catch(_) {}
      if (pid) url = buildUrl('/api/ftth/permits/qa/?project_id=' + encodeURIComponent(pid));
    }
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) { var err = new Error((body && body.detail) || response.statusText); err.status = response.status; throw err; }
    return body;
  }
  async function apiGetQaForProject(projectId) {
    var url = buildUrl('/api/ftth/permits/projects/' + encodeURIComponent(projectId) + '/qa/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) { var err = new Error((body && body.detail) || response.statusText); err.status = response.status; throw err; }
    return body;
  }
  // Status-sync poller (P20b) — cross-project with ?project_id= filter
  async function apiGetSyncStatus() {
    var url = buildUrl('/api/ftth/permits/sync/status/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) { var err = new Error((body && body.detail) || response.statusText); err.status = response.status; throw err; }
    return body;
  }
  async function apiPollSync(params) {
    params = params || {};
    var url = buildUrl('/api/ftth/permits/sync/poll/');
    var response = await authFetch(url, { method: 'POST', body: JSON.stringify(params) });
    var body = await parseBody(response);
    if (!response.ok) { var err = new Error((body && body.detail) || response.statusText); err.status = response.status; throw err; }
    return body;
  }
  async function apiSyncSubmission(submissionId, payload) {
    var url = buildUrl('/api/ftth/permits/submissions/sync/' + (submissionId ? encodeURIComponent(submissionId) + '/' : ''));
    var response = await authFetch(url, { method: 'POST', body: JSON.stringify(payload || {}) });
    var body = await parseBody(response);
    if (!response.ok) { var err = new Error((body && body.detail) || response.statusText); err.status = response.status; throw err; }
    return body;
  }
  async function apiSyncSubmissionsCsv(csvText, syncSource) {
    var url = buildUrl('/api/ftth/permits/submissions/sync/csv/' + (syncSource ? '?sync_source=' + encodeURIComponent(syncSource) : ''));
    var response = await authFetch(url, { method: 'POST', body: JSON.stringify({ csv: csvText }) });
    var body = await parseBody(response);
    // 207 Multi-Status when some rows errored — still useful
    if (!response.ok && response.status !== 207) { var err = new Error((body && body.detail) || response.statusText); err.status = response.status; throw err; }
    return body;
  }
  // Auto-classify (P22b) — heuristic permit-type classifier + label feedback
  async function apiClassify(features) {
    var url = buildUrl('/api/ftth/permits/classify/');
    var payload = features && features.features ? features : { features: features };
    var response = await authFetch(url, { method: 'POST', body: JSON.stringify(payload) });
    var body = await parseBody(response);
    if (!response.ok) { var err = new Error((body && body.detail) || response.statusText); err.status = response.status; throw err; }
    return body;
  }
  async function apiClassifyFeedback(payload) {
    var url = buildUrl('/api/ftth/permits/classify/feedback/');
    var response = await authFetch(url, { method: 'POST', body: JSON.stringify(payload || {}) });
    var body = await parseBody(response);
    if (!response.ok) { var err = new Error((body && body.detail) || response.statusText); err.status = response.status; throw err; }
    return body;
  }
  async function apiClassifyStats() {
    var url = buildUrl('/api/ftth/permits/classify/stats/');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) { var err = new Error((body && body.detail) || response.statusText); err.status = response.status; throw err; }
    return body;
  }

  // ==================================================================
  // Public API
  // ==================================================================

  function loadReview(projectId) { return apiLoadReview(projectId); }
  function submitAction(projectId, changeId, action, comment) { return apiSubmitAction(projectId, changeId, action, comment); }
  function createApprovedVersion(projectId) { return apiCreateApprovedVersion(projectId); }
  function runLld(projectId, mode) { return apiRunLld(projectId, mode); }
  function listVersions(projectId) { return apiListVersions(projectId); }
  function diffVersions(projectId, fromVersion, toVersion) { return apiDiffVersions(projectId, fromVersion, toVersion); }
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
    diffVersions: diffVersions,
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
    getPermitSummary: apiGetPermitSummary,
    generatePermitPackage: apiGeneratePermitPackage,
    getPermitPackage: apiGetPermitPackage,
    getPermitPackageDownloadUrl: getPermitPackageDownloadUrl,
    listSubmissions: apiListSubmissions,
    createSubmission: apiCreateSubmission,
    transitionSubmission: apiTransitionSubmission,
    draftPermit: apiDraftPermit,
    permitRequirements: apiPermitRequirements,
    extractRequirements: apiExtractRequirements,
    permitCompleteness: apiPermitCompleteness,
    permitRisk: apiPermitRisk,
    permitTimeline: apiPermitTimeline,
    listDrafts: apiListDrafts,
    reviewDraft: apiReviewDraft,
    getExpiries: apiGetExpiries,
    getQa: apiGetQa,
    getQaForProject: apiGetQaForProject,
    getSyncStatus: apiGetSyncStatus,
    pollSync: apiPollSync,
    syncSubmission: apiSyncSubmission,
    syncSubmissionsCsv: apiSyncSubmissionsCsv,
    classify: apiClassify,
    classifyFeedback: apiClassifyFeedback,
    classifyStats: apiClassifyStats,
    listUsers: listUsers,
    listMembers: listMembers,
    addMember: addMember,
    removeMember: removeMember,
  };
})();
