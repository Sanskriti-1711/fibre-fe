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
 * Demo mode:
 *   - Force with ?demo=1 in the URL, OR
 *   - Auto-activates only when the backend is unreachable (network error),
 *     so the pages remain usable offline / before the backend ships.
 *
 * Auth: JWT from FiberAuth (localStorage key "fiber_auth").
 */

(function () {
  'use strict';

  var BASE_URL =
    (window.FTTH_BASE_URL || window.location.origin).replace(/\/+$/, '');
  var API_PREFIX = '/api/ftth/lld';
  var DEMO_KEY = 'ftth_lld_demo_v1';

  var demoMode = false;

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

  function isNetworkError(err) {
    return err && (err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(String(err && err.message || err)));
  }

  function isForceDemo() {
    try {
      return new URLSearchParams(window.location.search).get('demo') === '1';
    } catch (_) { return false; }
  }

  // ==================================================================
  // Demo dataset — FTTH-001 "Downtown Berlin"
  // ==================================================================

  function pt(lng, lat) { return { type: 'Point', coordinates: [lng, lat] }; }
  function line(coords) { return { type: 'LineString', coordinates: coords }; }

  function feat(id, layer, geometry, props) {
    var p = { feature_id: id, layer: layer };
    if (props) Object.keys(props).forEach(function (k) { p[k] = props[k]; });
    return { type: 'Feature', geometry: geometry, properties: p };
  }

  function fc(features) {
    return { type: 'FeatureCollection', features: features };
  }

  function demoHldFeatures() {
    return [
      feat('T-101', 'Trench', line([[13.398, 52.518], [13.404, 52.516], [13.410, 52.514]]), { constr_type: 'New Trench' }),
      feat('T-102', 'Trench', line([[13.410, 52.514], [13.416, 52.512]]), { constr_type: 'New Trench' }),
      feat('T-105', 'Trench', line([[13.398, 52.514], [13.392, 52.512]]), { constr_type: 'New Trench' }),
      feat('T-110', 'Trench', line([[13.384, 52.508], [13.380, 52.506]]), { constr_type: 'New Trench' }),
      feat('D-045', 'Duct', line([[13.416, 52.512], [13.420, 52.510]]), { construction_type: 'New Duct' }),
      feat('D-052', 'Duct', line([[13.392, 52.512], [13.388, 52.510]]), { construction_type: 'New Duct' }),
      feat('C-220', 'Cable', line([[13.410, 52.514], [13.420, 52.510]]), { cable_type: 'Aerial', cores: 96 }),
      feat('C-231', 'Cable', line([[13.388, 52.510], [13.384, 52.508]]), { cable_type: 'Underground', cores: 48 }),
      feat('P-118', 'PDP', pt(13.404, 52.516), { port_count: 8 }),
      feat('P-121', 'PDP', pt(13.420, 52.510), { port_count: 8 }),
      feat('PR-77', 'Premise', pt(13.398, 52.518), { service_type: 'FTTH 100M' }),
      feat('MFG-01', 'MFG', pt(13.420, 52.514), { name: 'MFG Central' }),
    ];
  }

  function demoChanges() {
    var t = function (d, h) { return d + 'T' + h; };
    return [
      {
        change_id: 'SC-001', feature_id: 'T-102', layer: 'Trench',
        change_type: 'geometry', status: 'pending_review',
        original_geometry: line([[13.410, 52.514], [13.416, 52.512]]),
        survey_geometry: line([[13.410, 52.514], [13.414, 52.511], [13.416, 52.512]]),
        reason: 'Route deviation to avoid existing storm-water drain',
        engineer: 'Aarav Mehta', timestamp: t('2026-07-22', '10:14'),
        evidence: { photos: 3, notes: 'Drain observed at 13.412, 52.513' },
        comments: []
      },
      {
        change_id: 'SC-002', feature_id: 'D-045', layer: 'Duct',
        change_type: 'attribute', status: 'pending_review',
        original_geometry: line([[13.416, 52.512], [13.420, 52.510]]),
        survey_geometry: line([[13.416, 52.512], [13.420, 52.510]]),
        attributes: [
          { field: 'Construction Type', hld_value: 'New Duct', survey_value: 'Existing Duct', reason: 'Existing duct discovered during survey' }
        ],
        reason: 'Existing duct found and proposed for reuse.',
        engineer: 'Priya Sharma', timestamp: t('2026-07-22', '11:02'),
        evidence: { photos: 5, notes: 'Duct pit #7 inspected — clear of obstructions' },
        comments: []
      },
      {
        change_id: 'SC-003', feature_id: 'P-118', layer: 'PDP',
        change_type: 'geometry', status: 'pending_review',
        original_geometry: pt(13.404, 52.516),
        survey_geometry: pt(13.405, 52.517),
        reason: 'Relocated to building facade for easier access',
        engineer: 'Rohan Gupta', timestamp: t('2026-07-22', '12:40'),
        evidence: { photos: 2, notes: 'Facade mount approved by building owner' },
        comments: []
      },
      {
        change_id: 'SC-004', feature_id: 'C-220', layer: 'Cable',
        change_type: 'attribute', status: 'pending_review',
        original_geometry: line([[13.410, 52.514], [13.420, 52.510]]),
        survey_geometry: line([[13.410, 52.514], [13.420, 52.510]]),
        attributes: [
          { field: 'Cable Type', hld_value: 'Aerial', survey_value: 'Underground', reason: 'Road-works plan requires underground route' }
        ],
        reason: 'City road-works plan requires the feeder cable to be buried.',
        engineer: 'Aarav Mehta', timestamp: t('2026-07-22', '13:25'),
        evidence: { photos: 1, notes: 'Road-works permit #RW-1182 attached' },
        comments: []
      },
      {
        change_id: 'SC-005', feature_id: 'PR-77', layer: 'Premise',
        change_type: 'attribute', status: 'pending_review',
        original_geometry: pt(13.398, 52.518),
        survey_geometry: pt(13.398, 52.518),
        attributes: [
          { field: 'Service Type', hld_value: 'FTTH 100M', survey_value: 'FTTH 1G', reason: 'Customer upgraded during site visit' }
        ],
        reason: 'Customer confirmed 1 Gbps requirement on site.',
        engineer: 'Priya Sharma', timestamp: t('2026-07-22', '14:05'),
        evidence: { photos: 2, notes: 'Service agreement signed' },
        comments: []
      },
      {
        change_id: 'SC-006', feature_id: 'T-105', layer: 'Trench',
        change_type: 'removed_feature', status: 'pending_review',
        original_geometry: line([[13.398, 52.514], [13.392, 52.512]]),
        survey_geometry: null,
        reason: 'Trench not required — existing duct D-052 already carries this route',
        engineer: 'Rohan Gupta', timestamp: t('2026-07-22', '15:18'),
        evidence: { photos: 3, notes: 'Duct confirmed continuous at both chambers' },
        comments: []
      },
      {
        change_id: 'SC-007', feature_id: 'T-140', layer: 'Trench',
        change_type: 'new_feature', status: 'pending_review',
        original_geometry: null,
        survey_geometry: line([[13.392, 52.512], [13.395, 52.509]]),
        reason: 'New trench required for last-mile connection to PR-88',
        engineer: 'Aarav Mehta', timestamp: t('2026-07-22', '16:02'),
        evidence: { photos: 4, notes: 'Route follows service lane' },
        comments: []
      },
      {
        change_id: 'SC-008', feature_id: 'D-052', layer: 'Duct',
        change_type: 'geometry', status: 'approved',
        original_geometry: line([[13.392, 52.512], [13.388, 52.510]]),
        survey_geometry: line([[13.392, 52.512], [13.387, 52.511], [13.388, 52.510]]),
        reason: 'Detour around private property boundary',
        engineer: 'Priya Sharma', timestamp: t('2026-07-21', '09:40'),
        evidence: { photos: 2, notes: '' },
        comments: [
          { by: 'LLD Reviewer', text: 'Approved — detour is clear of the property line and keeps duct gradient within spec.', timestamp: t('2026-07-21', '17:12') }
        ]
      },
      {
        change_id: 'SC-009', feature_id: 'P-121', layer: 'PDP',
        change_type: 'attribute', status: 'approved',
        original_geometry: pt(13.420, 52.510),
        survey_geometry: pt(13.420, 52.510),
        attributes: [
          { field: 'Port Count', hld_value: '8', survey_value: '16', reason: 'Cabinet upgraded to 16-port for demand forecast' }
        ],
        reason: 'Demand forecast requires a 16-port cabinet.',
        engineer: 'Rohan Gupta', timestamp: t('2026-07-21', '10:55'),
        evidence: { photos: 1, notes: '' },
        comments: [
          { by: 'LLD Reviewer', text: 'Approved — matches demand forecast for the block.', timestamp: t('2026-07-21', '17:20') }
        ]
      },
      {
        change_id: 'SC-010', feature_id: 'C-231', layer: 'Cable',
        change_type: 'geometry', status: 'rejected',
        original_geometry: line([[13.388, 52.510], [13.384, 52.508]]),
        survey_geometry: line([[13.388, 52.510], [13.383, 52.509], [13.384, 52.508]]),
        reason: 'Proposed route crosses protected green zone',
        engineer: 'Aarav Mehta', timestamp: t('2026-07-21', '11:30'),
        evidence: { photos: 2, notes: '' },
        comments: [
          { by: 'LLD Reviewer', text: 'Rejected — existing duct has insufficient capacity; reroute via D-052.', timestamp: t('2026-07-21', '18:04') }
        ]
      },
      {
        change_id: 'SC-011', feature_id: 'P-140', layer: 'PDP',
        change_type: 'new_feature', status: 'needs_correction',
        original_geometry: null,
        survey_geometry: pt(13.410, 52.517),
        reason: 'New PDP required for apartment block',
        engineer: 'Priya Sharma', timestamp: t('2026-07-21', '12:10'),
        evidence: { photos: 3, notes: 'Apartment block has 24 units' },
        comments: [
          { by: 'LLD Reviewer', text: 'Request correction — verify duct capacity before approval.', timestamp: t('2026-07-21', '18:30') }
        ]
      },
      {
        change_id: 'SC-012', feature_id: 'T-110', layer: 'Trench',
        change_type: 'geometry', status: 'rejected',
        original_geometry: line([[13.384, 52.508], [13.380, 52.506]]),
        survey_geometry: line([[13.384, 52.508], [13.379, 52.507], [13.380, 52.506]]),
        reason: 'Detour proposed to avoid gas line',
        engineer: 'Rohan Gupta', timestamp: t('2026-07-21', '13:45'),
        evidence: { photos: 2, notes: '' },
        comments: [
          { by: 'LLD Reviewer', text: 'Rejected — conflict with gas main; coordinate with utility owner first.', timestamp: t('2026-07-21', '18:45') }
        ]
      },
    ];
  }

  function demoProject() {
    return {
      id: 'ftth-001',
      name: 'FTTH-001 – Downtown Berlin',
      hld_version: 'HLD-V12',
      hld_version_date: '2026-07-15',
      approved_survey_version: null,
      created_at: '2026-07-15',
    };
  }

  function demoSeedState() {
    return {
      project: demoProject(),
      changes: demoChanges(),
      approved_survey_version: null,
      last_as_version: 'AS-V03',
      approved_survey_created_at: null,
      lld_runs: [
        {
          lld_version: 'LLD-V01', project_id: 'ftth-001',
          hld_version: 'HLD-V12', approved_survey_version: 'AS-V03',
          run_date: '2026-07-20 14:32', run_by: 'LLD Pipeline (auto)',
          algorithm_version: 'fiber-lld-2.4.1', input_dataset_version: 'AS-V03',
          status: 'completed', outputs: 6,
        },
      ],
    };
  }

  function loadDemoState() {
    try {
      var raw = localStorage.getItem(DEMO_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.changes) return parsed;
      }
    } catch (_) { /* ignore */ }
    var seed = demoSeedState();
    saveDemoState(seed);
    return seed;
  }

  function saveDemoState(state) {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(state));
    } catch (_) { /* quota — ignore */ }
  }

  function readState() { return loadDemoState(); }

  function demoSurveyGeoJSON(state) {
    var hld = demoHldFeatures();
    var byChange = {};
    state.changes.forEach(function (c) { byChange[c.feature_id] = c; });

    var surveyed = hld.map(function (f) {
      var c = byChange[f.properties.feature_id];
      if (!c) return f;
      var props = Object.assign({}, f.properties, {
        change_id: c.change_id,
        status: c.status,
        survey_removal: c.change_type === 'removed_feature' ? true : undefined,
      });
      return {
        type: 'Feature',
        geometry: c.survey_geometry || f.geometry,
        properties: props,
      };
    });

    state.changes.forEach(function (c) {
      if (c.change_type === 'new_feature' && c.survey_geometry) {
        surveyed.push(feat(c.feature_id, c.layer, c.survey_geometry, { change_id: c.change_id, status: c.status }));
      }
    });

    return fc(surveyed);
  }

  function buildApprovedGeoJSON(state) {
    var hld = demoHldFeatures();
    var keep = {};
    hld.forEach(function (f) { keep[f.properties.feature_id] = f; });

    state.changes.forEach(function (c) {
      if (c.status !== 'approved') return;
      if (c.change_type === 'removed_feature') {
        delete keep[c.feature_id];
        return;
      }
      if (c.change_type === 'new_feature') {
        if (c.survey_geometry) {
          keep[c.feature_id] = feat(c.feature_id, c.layer, c.survey_geometry, { change_id: c.change_id, approved: true });
        }
        return;
      }
      var f = keep[c.feature_id];
      if (!f) return;
      if (c.survey_geometry) f.geometry = c.survey_geometry;
      if (c.attributes) {
        c.attributes.forEach(function (a) {
          var key = a.field.toLowerCase().replace(/[^a-z0-9]+/g, '_');
          f.properties[key] = a.survey_value;
        });
      }
      f.properties.approved = true;
      f.properties.change_id = c.change_id;
    });

    return fc(Object.keys(keep).map(function (k) { return keep[k]; }));
  }

  function demoLoadReview() {
    var state = readState();
    return Promise.resolve({
      demo: true,
      project: state.project,
      changes: state.changes,
      layers: {
        hld: fc(demoHldFeatures()),
        survey: demoSurveyGeoJSON(state),
      },
      approved: buildApprovedGeoJSON(state),
      approved_survey_version: state.approved_survey_version,
      approved_survey_created_at: state.approved_survey_created_at,
      version_chain: {
        hld: { id: state.project.hld_version, date: state.project.hld_version_date, by: 'HLD Pipeline' },
        approved_survey: state.approved_survey_version ? { id: state.approved_survey_version, date: state.approved_survey_created_at, by: 'LLD Reviewer' } : null,
      },
    });
  }

  function demoSubmitAction(changeId, action, comment) {
    var state = readState();
    if (state.review_locked) {
      return Promise.reject(new Error('Review is locked — the Approved Survey Version is immutable. Start a new review cycle for further changes.'));
    }
    var change = state.changes.filter(function (c) { return c.change_id === changeId; })[0];
    if (!change) return Promise.reject(new Error('Change not found: ' + changeId));

    var statusMap = { approve: 'approved', reject: 'rejected', correction: 'needs_correction' };
    var status = statusMap[action];
    if (!status) return Promise.reject(new Error('Unknown action: ' + action));

    change.status = status;
    if (comment && comment.trim()) {
      change.comments = change.comments || [];
      change.comments.push({
        by: 'LLD Reviewer (you)',
        text: comment.trim(),
        timestamp: new Date().toLocaleString(),
      });
    }
    saveDemoState(state);

    return Promise.resolve({
      change_id: changeId,
      status: status,
      comment: comment || null,
      approved: buildApprovedGeoJSON(state),
    });
  }

  function nextAsVersion(state) {
    var n = 1;
    var re = /AS-V(\d+)/;
    var base = state.approved_survey_version || state.last_as_version || 'AS-V00';
    var m = re.exec(base);
    if (m) n = parseInt(m[1], 10) + 1;
    return 'AS-V' + String(n).padStart(2, '0');
  }

  function demoCreateApprovedVersion() {
    var state = readState();
    var pending = state.changes.filter(function (c) { return c.status === 'pending_review'; });
    if (pending.length) {
      return Promise.reject(new Error('Cannot create Approved Survey Version while ' + pending.length + ' change(s) are unresolved.'));
    }
    var version = nextAsVersion(state);
    state.approved_survey_version = version;
    state.approved_survey_created_at = new Date().toLocaleString();
    state.review_locked = true;
    saveDemoState(state);

    return Promise.resolve({
      approved_survey_version: version,
      created_at: state.approved_survey_created_at,
      features: buildApprovedGeoJSON(state),
    });
  }

  function demoRunLld() {
    var state = readState();
    if (!state.approved_survey_version) {
      return Promise.reject(new Error('Create an Approved Survey Version before running LLD.'));
    }
    var lastRun = state.lld_runs && state.lld_runs.length
      ? state.lld_runs[state.lld_runs.length - 1].lld_version : 'LLD-V00';
    var n = parseInt(lastRun.replace('LLD-V', ''), 10) + 1;
    var version = 'LLD-V' + String(n).padStart(2, '0');

    var run = {
      lld_version: version,
      project_id: state.project.id,
      hld_version: state.project.hld_version,
      approved_survey_version: state.approved_survey_version,
      run_date: new Date().toLocaleString(),
      run_by: 'LLD Reviewer (you)',
      algorithm_version: 'fiber-lld-2.4.1',
      input_dataset_version: state.approved_survey_version,
      status: 'running',
      outputs: null,
    };
    state.lld_runs = state.lld_runs || [];
    state.lld_runs.push(run);
    saveDemoState(state);

    setTimeout(function () {
      var s = readState();
      var target = s.lld_runs.filter(function (r) { return r.lld_version === version; })[0];
      if (target) {
        target.status = 'completed';
        target.outputs = 6;
        saveDemoState(s);
      }
    }, 1800);

    return Promise.resolve({
      lld_version: version,
      status: 'running',
      project_id: state.project.id,
    });
  }

  function demoListVersions() {
    var state = readState();
    return Promise.resolve({
      demo: true,
      project: state.project,
      approved_survey_version: state.approved_survey_version,
      approved_survey_created_at: state.approved_survey_created_at,
      hld_version: state.project.hld_version,
      version_chain: {
        hld: { id: state.project.hld_version, date: state.project.hld_version_date, by: 'HLD Pipeline' },
        approved_survey: state.approved_survey_version
          ? { id: state.approved_survey_version, date: state.approved_survey_created_at, by: 'LLD Reviewer' }
          : { id: 'AS-V03', date: '2026-07-20 12:00', by: 'LLD Reviewer' },
      },
      runs: state.lld_runs || [],
    });
  }

  function demoGetProject() {
    return Promise.resolve(readState().project);
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

  async  function resolveDefaultProject() {
    var url = buildUrl('/api/ftth/hld/projects/?limit=20');
    var response = await authFetch(url);
    var body = await parseBody(response);
    if (!response.ok) return null;
    var list = Array.isArray(body) ? body : (body && body.results) || [];
    var completed = list.filter(function (p) { return p.status === 'completed'; });
    var pick = completed[0] || list[0];
    return pick ? { project_id: pick.project_id, name: pick.name } : null;
  }

  async function listProjects() {
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

  // ==================================================================
  // Public API (real backend first, demo fallback on network error)
  // ==================================================================

  function loadReview(projectId) {
    if (isForceDemo()) { demoMode = true; return demoLoadReview(); }
    return apiLoadReview(projectId).catch(function (err) {
      if (isNetworkError(err) || (err && err.status === 404)) {
        // Backend unreachable, or project has no survey copy yet —
        // fall back to demo so the page remains usable.
        demoMode = true;
        return demoLoadReview();
      }
      throw err;
    });
  }

  function submitAction(projectId, changeId, action, comment) {
    if (demoMode) return demoSubmitAction(changeId, action, comment);
    return apiSubmitAction(projectId, changeId, action, comment);
  }

  function createApprovedVersion(projectId) {
    if (demoMode) return demoCreateApprovedVersion();
    return apiCreateApprovedVersion(projectId);
  }

  function runLld(projectId) {
    if (demoMode) return demoRunLld();
    return apiRunLld(projectId);
  }

  function listVersions(projectId) {
    if (isForceDemo()) { demoMode = true; return demoListVersions(); }
    return apiListVersions(projectId).catch(function (err) {
      if (isNetworkError(err) || (err && err.status === 404)) {
        demoMode = true;
        return demoListVersions();
      }
      throw err;
    });
  }

  function getRunStatus(projectId, lldVersion) {
    if (demoMode || isForceDemo()) {
      var state = readState();
      var run = (state.lld_runs || []).filter(function (r) { return r.lld_version === lldVersion; })[0];
      if (!run) return Promise.reject(new Error('Run not found: ' + lldVersion));
      return Promise.resolve({
        lld_version: run.lld_version,
        project_id: run.project_id,
        status: run.status,
        progress: run.status === 'completed' ? 100 : 50,
        outputs: run.outputs,
        validation: {},
        layers: [],
        run_date: run.run_date,
      });
    }
    return apiGetRunStatus(projectId, lldVersion);
  }

  function getRunLayer(projectId, lldVersion, layer) {
    if (demoMode || isForceDemo()) return Promise.resolve({ type: 'FeatureCollection', features: [] });
    return apiGetRunLayer(projectId, lldVersion, layer);
  }

  function downloadRunZip(projectId, lldVersion) {
    if (demoMode || isForceDemo()) { alert('Demo mode — no LLD zip available.'); return; }
    apiDownloadRunZip(projectId, lldVersion);
  }

  function getProject(projectId) {
    if (demoMode) return demoGetProject();
    return apiLoadReview(projectId).then(function (r) { return r.project; });
  }

  function listRuns() {
    return apiListRuns();
  }

  function getFeatureLineage(projectId, featureId) {
    return apiGetFeatureLineage(projectId, featureId);
  }

  function getProjectOverview(projectId) {
    return apiGetProjectOverview(projectId);
  }

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
    isDemo: function () { return demoMode; },
    buildApprovedGeoJSON: buildApprovedGeoJSON,
    readDemoState: readState,
  };
})();
