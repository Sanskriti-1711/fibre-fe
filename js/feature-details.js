window.FiberAuth.requireLogin();

function qs(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = qs(id);
  if (!el) return;
  el.textContent = value;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) return "--";
  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toLocaleString();
  } catch (_) {}
  return String(value);
}

function getParams() {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('project_id') || params.get('proj_id') || params.get('project');
  const layerId = params.get('layer_id') || params.get('layer');
  const featureId = params.get('feature_id') || params.get('fid') || params.get('id');
  return { projectId, layerId, featureId };
}

function toDisplayStatus(status) {
  if (!status) return '--';
  return String(status)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, function (m) { return m.toUpperCase(); });
}

function normStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function setElDisplay(el, show, displayValue) {
  if (!el) return;
  el.style.display = show ? (displayValue || '') : 'none';
}

function setStatusPill(status) {
  const pill = qs('featureStatusPill');
  if (!pill) return;

  const s = normStatus(status);

  let label = '';
  let bg = '#F9FAFB';
  let color = '#374151';
  let border = '1px solid rgba(55,65,81,0.18)';
  let dotBg = '#616A75';
  let icon = '';

  if (s === 'approved') {
    label = 'Approved';
    bg = '#ECFDF5';
    color = '#065F46';
    border = '1px solid rgba(6,95,70,0.18)';
    dotBg = '#047857';
    icon = '✓';
  } else if (s === 'rejected') {
    label = 'Rejected';
    bg = '#FEF2F2';
    color = '#991B1B';
    border = '1px solid rgba(153,27,27,0.18)';
    dotBg = '#EF4444';
    icon = '!';
  } else if (s === 'assigned') {
    label = 'Assigned';
    bg = '#EFF6FF';
    color = '#1D4ED8';
    border = '1px solid rgba(29,78,216,0.18)';
    dotBg = '#3B82F6';
    icon = '↗';
  } else if (s === 'under_review') {
    label = 'Under Review';
    bg = '#F3E8FF';
    color = '#7C3AED';
    border = '1px solid rgba(124,58,237,0.18)';
    dotBg = '#8B5CF6';
    icon = '👁';
  } else {
    label = 'Pending';
    bg = '#FFFBEB';
    color = '#92400E';
    border = '1px solid rgba(146,64,14,0.18)';
    dotBg = '#B45309';
    icon = '…';
  }

  pill.style.background = bg;
  pill.style.color = color;
  pill.style.border = border;
  pill.innerHTML =
    '<span aria-hidden="true" style="display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; border-radius:999px; background:' + dotBg + '; color:#FFFFFF; font-size:12px; line-height:1;">'
    + escapeHtml(icon)
    + '</span>'
    + '<span>' + escapeHtml(label) + '</span>';
}

function ensureAssignmentCard() {
  let el = qs('assignmentCard');
  if (el) return el;

  const breadcrumb = qs('breadcrumb');
  if (!breadcrumb) return null;

  el = document.createElement('div');
  el.id = 'assignmentCard';
  el.style.margin = '10px 0 0';
  el.style.padding = '10px 12px';
  el.style.border = '1px solid rgba(0,0,0,0.10)';
  el.style.borderRadius = '10px';
  el.style.background = '#FFFFFF';
  el.style.boxShadow = '0 6px 18px rgba(0,0,0,0.06)';
  el.style.display = 'none';

  breadcrumb.parentNode.insertBefore(el, breadcrumb.nextSibling);
  return el;
}

function renderAssignmentCard(assignment) {
  const card = ensureAssignmentCard();
  if (!card) return;

  if (!assignment) {
    setElDisplay(card, false);
    card.innerHTML = '';
    return;
  }

  const assignee = assignment.assignee || {};
  const name = assignee.full_name || assignee.name || (assignee.email ? assignee.email.split('@')[0] : '') || (assignee.id ? ('Engineer ' + assignee.id) : 'Engineer');
  const email = assignee.email || '';
  const scope = assignment.scope || 'layer';

  card.innerHTML =
    '<div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">'
      + '<div style="min-width:0;">'
        + '<div style="font-size:12px; color:#616A75; font-weight:700; text-transform:uppercase; letter-spacing:0.06em;">Job Assigned</div>'
        + '<div style="font-size:14px; font-weight:800; color:#111827; margin-top:2px;">' + escapeHtml(name) + '</div>'
        + (email ? ('<div style="font-size:13px; color:#616A75; margin-top:2px;">' + escapeHtml(email) + '</div>') : '')
      + '</div>'
      + '<div style="flex-shrink:0; display:flex; align-items:center; gap:8px;">'
        + '<span style="display:inline-flex; align-items:center; padding:4px 8px; border-radius:999px; background:#F3F4F6; color:#374151; border:1px solid rgba(55,65,81,0.14); font-size:12px; font-weight:700;">' + escapeHtml(scope) + '</span>'
      + '</div>'
    + '</div>';

  setElDisplay(card, true, 'block');
}

async function getFeatureDetails(projectId, featureId) {
  const pid = encodeURIComponent(projectId);
  const fid = encodeURIComponent(featureId);
  const path = `/api/projects/${pid}/features/${fid}/`;
  console.log('[feature-details] Feature Details API:', path);
  return window.FiberApi.apiFetch(path, { method: 'GET' });
}

async function loadFeatureAssignment(projectId, featureId) {
  if (!projectId || !featureId || !window.FiberApi || !window.FiberApi.listAssignments) return null;
  const data = await window.FiberApi.listAssignments({ project: projectId, feature: featureId, scope: 'feature' });
  const list = Array.isArray(data)
    ? data
    : (data && Array.isArray(data.results) ? data.results : []);
  return list && list.length ? list[0] : null;
}

function initMap() {
  if (typeof maplibregl === 'undefined') return null;
  const el = qs('auditMap');
  if (!el) return null;

  const map = new maplibregl.Map({
    container: 'auditMap',
    style: {
      version: 8,
      sources: {
        'osm-raster': {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
      },
      layers: [
        { id: 'basemap-raster', type: 'raster', source: 'osm-raster', minzoom: 0, maxzoom: 19 },
      ],
    },
    center: [-0.1278, 51.5074],
    zoom: 15,
  });
  map.addControl(new maplibregl.NavigationControl(), 'top-left');
  return map;
}

// Compute an LngLatBounds for a single GeoJSON feature (WGS84 coords).
function featureBoundsOf(geojson) {
  if (!geojson || !geojson.geometry || !geojson.geometry.coordinates) return null;
  const coords = geojson.geometry.coordinates;
  const type = geojson.geometry.type;
  const points = [];
  if (type === 'Point') {
    points.push(coords);
  } else if (type === 'MultiPoint' || type === 'LineString') {
    points.push(...coords);
  } else if (type === 'MultiLineString' || type === 'Polygon') {
    points.push(...(coords[0] || []));
  } else if (type === 'MultiPolygon') {
    points.push(...((coords[0] && coords[0][0]) || []));
  }
  if (!points.length) return null;
  const b = new maplibregl.LngLatBounds();
  points.forEach((p) => { if (p && p.length >= 2) b.extend(p); });
  return b;
}

function renderGeojsonFeature(map, geojson) {
  if (!map || !geojson || !geojson.geometry) return null;

  const sourceId = 'feature-source';
  const lineLayerId = 'feature-line';
  const pointLayerId = 'feature-point';

  if (map.getSource(sourceId)) {
    try { map.removeLayer(lineLayerId); } catch (_) {}
    try { map.removeLayer(pointLayerId); } catch (_) {}
    map.removeSource(sourceId);
  }

  map.addSource(sourceId, { type: 'geojson', data: geojson });

  const gtype = geojson.geometry.type;
  const isLine = gtype === 'LineString' || gtype === 'MultiLineString' || gtype.toLowerCase().indexOf('line') !== -1;
  const isPoint = gtype === 'Point' || gtype === 'MultiPoint';

  if (isLine) {
    map.addLayer({
      id: lineLayerId, type: 'line', source: sourceId,
      paint: { 'line-color': '#E31837', 'line-width': 6, 'line-opacity': 0.95 },
    });
  } else if (isPoint) {
    map.addLayer({
      id: pointLayerId, type: 'circle', source: sourceId,
      paint: {
        'circle-radius': 7, 'circle-color': '#E31837', 'circle-opacity': 0.9,
        'circle-stroke-color': '#E31837', 'circle-stroke-width': 3,
      },
    });
  } else {
    // Polygon / MultiPolygon
    map.addLayer({
      id: lineLayerId, type: 'line', source: sourceId,
      paint: { 'line-color': '#E31837', 'line-width': 3, 'line-opacity': 0.95 },
    });
  }

  const bounds = featureBoundsOf(geojson);
  if (bounds) {
    setTimeout(function () {
      try { map.fitBounds(bounds, { padding: 24, maxZoom: 18 }); } catch (_) {}
    }, 0);
  } else {
    console.warn('[feature-details] GeoJSON bounds invalid; geometry may be empty/unsupported:', geojson && geojson.geometry);
  }

  return { bounds: bounds, layerId: isLine || isPoint ? (isPoint ? pointLayerId : lineLayerId) : lineLayerId };
}

function addFeatureZoomControl(map, label, targetLayer) {
  if (!map || !targetLayer || !targetLayer.bounds) return;

  const text = label ? String(label) : 'Zoom to Feature';
  const el = document.createElement('div');
  el.className = 'maplibregl-ctrl maplibregl-ctrl-group';
  el.innerHTML = '<button type="button" style="background:#FFFFFF;border:none;padding:8px 10px;font-size:13px;color:#111827;cursor:pointer;">' + escapeHtml(text) + '</button>';
  el.style.boxShadow = '0 4px 10px rgba(0,0,0,0.08)';
  el.style.borderRadius = '8px';
  el.style.overflow = 'hidden';
  el.addEventListener('click', function () {
    try { map.fitBounds(targetLayer.bounds, { padding: 24, maxZoom: 18 }); } catch (_) {}
  });

  map.addControl({
    onAdd: function () { return el; },
    onRemove: function () { if (el.parentNode) el.parentNode.removeChild(el); },
  }, 'top-right');
}

async function getFeatureDetails(projectId, featureId) {
  const pid = encodeURIComponent(projectId);
  const fid = encodeURIComponent(featureId);
  const path = `/api/projects/${pid}/features/${fid}/`;
  console.log('[feature-details] Feature Details API:', path);
  return window.FiberApi.apiFetch(path, { method: 'GET' });
}

function bindBreadcrumb(params, project, featureDetails) {
  const projectId = params.projectId;
  const layerId = params.layerId;
  const featureId = params.featureId;

  const crumbProject = qs('crumbProject');
  const crumbLayer = qs('crumbLayer');
  const crumbFeature = qs('crumbFeature');

  const projectName = (project && (project.name || project.title || project.project_name)) || 'Project';

  if (crumbProject) {
    crumbProject.textContent = projectName;
    if (projectId) {
      crumbProject.href = `project-details.html?project_id=${encodeURIComponent(projectId)}`;
    } else {
      crumbProject.href = 'projects.html';
    }
  }

  const layerName = (featureDetails && (featureDetails.layer_name || featureDetails.layer_source)) || 'Layer';

  if (crumbLayer) {
    crumbLayer.textContent = layerName;
    if (projectId && layerId) {
      crumbLayer.href = `layer-details.html?project_id=${encodeURIComponent(projectId)}&layer_id=${encodeURIComponent(layerId)}`;
    } else if (projectId) {
      crumbLayer.href = `project-details.html?project_id=${encodeURIComponent(projectId)}`;
    } else {
      crumbLayer.href = 'projects.html';
    }
  }

  if (crumbFeature) {
    const feature = featureDetails && featureDetails.feature ? featureDetails.feature : null;
    const plannedId = feature && feature.properties ? (feature.properties.id || feature.properties.ID || '') : '';
    crumbFeature.textContent = plannedId ? `Feature ${plannedId}` : (featureId ? `Feature ${featureId}` : 'Feature');
  }
}

function bindFeatureDetails(params, data) {
  const feature = data && data.feature ? data.feature : null;

  const layerName = (data && (data.layer_name || data.layer_source)) || (feature && feature.layer_name) || '--';
  const plannedId = (feature && feature.properties) ? (feature.properties.id || feature.properties.ID || '') : '';

  const title = plannedId ? `${layerName} • ${plannedId}` : 'Feature Details';
  setText('featureTitle', title);

  setText('featureUuid', feature && feature.id ? feature.id : (params.featureId || '--'));
  setText('featureStatus', toDisplayStatus(feature && feature.status));
  setText('featureCreated', formatDate(feature && feature.created_at));
  setText('featureUpdated', formatDate(feature && feature.updated_at));

  const p = (feature && feature.properties) || {};
  const fm = feature && feature.field_measurements ? feature.field_measurements : {};

  // If the layer has a field schema (auto-derived or admin-configured), render
  // the table dynamically from ALL of its fields so the reviewer sees every
  // property. Otherwise fall back to the legacy fixed layout.
  const schema = feature && Array.isArray(feature.field_schema) ? feature.field_schema : null;

  if (schema && schema.length) {
    renderSchemaMeasurements(schema, p, fm);
  } else {
    renderLegacyMeasurements(p, fm);
  }

  // Display uploaded photo if available
  const photoUrl = feature && feature.photo_url ? feature.photo_url : null;
  renderFieldPhoto(photoUrl, feature && feature.updated_at);
}

// Proper field labels from "Field Report Checklist - TechM_Final.xlsx".
// The shapefile DBF truncates column names to 10 chars, so we restore the full
// names here (keyed by the normalized schema key).
var PROPER_FIELD_LABELS = {
  // SPAN / Conduit layer (Sheet1 headers)
  name: "Name",
  altitudemo: "Altitude Mode",
  subspan: "Sub-Span",
  span: "Span",
  sno: "Sr No",
  remark: "Remark",
  length: "Length",
  fieldsurv: "Field survey completed",
  spanfrom: "Span From (Vault/MH ID)",
  spanto_v: "Span To (Vault/MH ID)",
  spanroute: "SPAN Route",
  trenchloc: "Trench location",
  conduitdi: "Conduit Distance",
  ductroute: "Duct Route ID",
  conduitty: "Conduit Type (HDPE / DI / PVC)",
  trenchlen: "Trench Length (m)",
  trenchdep: "Trench Depth (mm)",
  trenchwid: "Trench Width (mm)",
  alignment: "Alignment",
  bottomlev: "Bottom level",
  noofduc: "No. of Ducts Installed",
  conduiten: "Conduit encasement",
  conduitca: "Conduit Capping Done or not",
  conduitba: "Conduit banding correct or not",
  backfillin: "Backfilling yes or no",
  loosesoil: "Loose soil removed",
  waterint: "Water in trench",
  existingu: "Existing utilities checked",
  barricadin: "Barricading & safety",
  // Vault QAQC layer (non-colliding keys)
  layer: "Layer",
  vaultid: "Vault ID",
  location: "Location / Chainage",
  leveleluv: "Level / Elevation Check",
  concreteq: "Concrete Quality",
  cablerack: "Cable Rack / Slack",
  lidinst: "Lid Type / Count",
  reinstatem: "Reinstatement",
  qc_pf: "Overall Status (Pass / Fail)"
};

function properLabel(f) {
  return (f && PROPER_FIELD_LABELS[f.key]) || (f && (f.label || f.key)) || "";
}

function plannedDisplay(val, unit) {
  if (val === undefined || val === null || val === '') return '--';
  return unit ? `${val} ${unit}` : `${val}`;
}

// A stored field_measurements entry is either { value, unit } or a raw scalar.
function measurementDisplay(entry) {
  if (entry === undefined || entry === null) return '--';
  if (typeof entry === 'object') {
    if (entry.value === undefined || entry.value === null || entry.value === '') return '--';
    return entry.unit ? `${entry.value} ${entry.unit}` : `${entry.value}`;
  }
  return String(entry);
}

// Render the measurements table dynamically from the layer's editable fields.
function renderSchemaMeasurements(editable, properties, fm) {
  const tbody = document.getElementById('measurementsBody');
  if (!tbody) return;

  const rows = editable.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  tbody.innerHTML = '';

  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.style.padding = '12px';
    td.style.color = '#616A75';
    td.textContent = 'No engineer-entered fields configured for this layer.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((f) => {
    const tr = document.createElement('tr');
    const c1 = document.createElement('td');
    c1.textContent = properLabel(f);
    const c2 = document.createElement('td');
    c2.textContent = plannedDisplay(properties[f.key], f.unit ? 'm' : '');
    const c3 = document.createElement('td');
    c3.textContent = measurementDisplay(fm[f.key]);
    tr.appendChild(c1);
    tr.appendChild(c2);
    tr.appendChild(c3);
    tbody.appendChild(tr);
  });
}

// Legacy fixed layout for features without a field schema.
function renderLegacyMeasurements(p, fm) {
  const length = p.length !== undefined && p.length !== null ? `${p.length} m` : '--';
  const diameter = p.diameter !== undefined && p.diameter !== null ? `${p.diameter} mm` : '--';
  const sx = (p.start_x !== undefined && p.start_x !== null) ? p.start_x : null;
  const sy = (p.start_y !== undefined && p.start_y !== null) ? p.start_y : null;
  const ex = (p.end_x !== undefined && p.end_x !== null) ? p.end_x : null;
  const ey = (p.end_y !== undefined && p.end_y !== null) ? p.end_y : null;

  setText('plannedLength', length);
  setText('plannedDiameter', diameter);
  setText('plannedStart', (sx !== null && sy !== null) ? `${sx}, ${sy}` : '--');
  setText('plannedEnd', (ex !== null && ey !== null) ? `${ex}, ${ey}` : '--');

  setText('detectedLength', fm.length ? `${fm.length.value || fm.length} ${fm.length.unit || 'm'}` : '--');
  setText('detectedDiameter', fm.diameter ? `${fm.diameter.value || fm.diameter} ${fm.diameter.unit || 'mm'}` : '--');
  setText('detectedStart', '--');
  setText('detectedEnd', '--');
}

function renderFieldPhoto(photoUrl, uploadedAt) {
  const photoEl = qs('fieldPhoto');
  const placeholderEl = qs('fieldPhotoPlaceholder');
  const infoEl = qs('photoUploadInfo');

  if (!photoEl || !placeholderEl) return;

  if (photoUrl) {
    photoEl.src = photoUrl;
    photoEl.style.display = 'block';
    placeholderEl.style.display = 'none';
    if (infoEl) {
      infoEl.textContent = uploadedAt ? `Uploaded: ${formatDate(uploadedAt)}` : '';
    }
  } else {
    photoEl.style.display = 'none';
    photoEl.src = '';
    placeholderEl.style.display = '';
    if (infoEl) infoEl.textContent = '';
  }
}

function bindAssignJobLink(params) {
  const btn = qs('assignJobBtn');
  if (!btn) return;

  const projectId = params && params.projectId ? params.projectId : '';
  const layerId = params && params.layerId ? params.layerId : '';
  const featureId = params && params.featureId ? params.featureId : '';

  const qsParts = [];
  if (projectId) qsParts.push('project_id=' + encodeURIComponent(projectId));
  if (layerId) qsParts.push('layer_id=' + encodeURIComponent(layerId));
  if (featureId) qsParts.push('feature_id=' + encodeURIComponent(featureId));

  btn.href = qsParts.length ? ('project-assign.html?' + qsParts.join('&')) : 'project-assign.html';
}

async function loadPage() {
  const params = getParams();

  console.log('[feature-details] query params:', params);

  bindAssignJobLink(params);

  if (!params.projectId || !params.featureId) {
    setText('featureTitle', 'Feature Details');
    setText('featureUuid', '--');
    setText('featureStatus', '--');
    setText('featureCreated', '--');
    setText('featureUpdated', '--');
    setText('plannedLength', '--');
    setText('plannedDiameter', '--');
    setText('plannedStart', '--');
    setText('plannedEnd', '--');
    return;
  }

  const map = initMap();

  try {
    const results = await Promise.all([
      window.FiberApi.getProject(params.projectId),
      getFeatureDetails(params.projectId, params.featureId),
      params.featureId ? loadFeatureAssignment(params.projectId, params.featureId) : null
    ]);

    const project = results[0];
    const featureDetails = results[1];
    const assignment = results[2];

    console.log('[feature-details] Feature Details response:', featureDetails);

    bindFeatureDetails(params, featureDetails);
    bindBreadcrumb(params, project, featureDetails);

    const feature = featureDetails && featureDetails.feature ? featureDetails.feature : null;
    const status = feature && feature.status ? feature.status : '';

    setStatusPill(status);
    // Only show assignment card if feature is actually assigned (not pending)
    const isPending = normStatus(status) === 'pending';
    renderAssignmentCard(isPending ? null : assignment);

    const isApproved = normStatus(status) === 'approved';
    const isRejected = normStatus(status) === 'rejected';
    const isAssigned = normStatus(status) === 'assigned';
    const isUnderReview = normStatus(status) === 'under_review';
    const assignBtn = qs('assignJobBtn');
    if (assignBtn) {
      const canAssign = !isApproved && !isRejected && !isAssigned && !isUnderReview;
      setElDisplay(assignBtn, canAssign, '');
    }

    if (map && featureDetails && featureDetails.geojson) {
      const rendered = renderGeojsonFeature(map, featureDetails.geojson);
      const props = feature && feature.properties ? feature.properties : {};
      const plannedId = props.id || props.ID || '';
      const name = props.name || props.NAME || '';
      const label = name || plannedId || 'Zoom to Feature';
      addFeatureZoomControl(map, label, rendered);
    }
  } catch (e) {
    console.error('Failed to load feature details:', e);
    setText('featureTitle', 'Feature Details');
  }
}

loadPage();
