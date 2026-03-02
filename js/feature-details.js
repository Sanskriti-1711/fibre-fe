window.FiberAuth.requireLogin();

// Define EPSG:25833 projection for coordinate transformation
proj4.defs('EPSG:25833', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');

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
  let dotBg = '#6B7280';
  let icon = '';

  if (s === 'approved') {
    label = 'Approved';
    bg = '#ECFDF5';
    color = '#065F46';
    border = '1px solid rgba(6,95,70,0.18)';
    dotBg = '#10B981';
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
    dotBg = '#F59E0B';
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
        + '<div style="font-size:12px; color:#6B7280; font-weight:700; text-transform:uppercase; letter-spacing:0.06em;">Job Assigned</div>'
        + '<div style="font-size:14px; font-weight:800; color:#111827; margin-top:2px;">' + escapeHtml(name) + '</div>'
        + (email ? ('<div style="font-size:13px; color:#6B7280; margin-top:2px;">' + escapeHtml(email) + '</div>') : '')
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

function transformCoords(x, y) {
  const transformed = proj4('EPSG:25833', 'WGS84', [x, y]);
  return [transformed[1], transformed[0]];
}

function latLngsFromGeoJsonGeometry(geometry) {
  if (!geometry) return null;

  if (geometry.type === 'Point') {
    const c = geometry.coordinates;
    return transformCoords(c[0], c[1]);
  }

  if (geometry.type === 'LineString') {
    return geometry.coordinates.map((c) => transformCoords(c[0], c[1]));
  }

  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates.map((line) => line.map((c) => transformCoords(c[0], c[1])));
  }

  return null;
}

function initMap() {
  if (!window.L) return null;
  const el = qs('auditMap');
  if (!el) return null;

  const map = L.map('auditMap', { zoomControl: true }).setView([51.5074, -0.1278], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  // In grids/flex layouts Leaflet may compute a wrong size on first paint.
  // This ensures tiles/layers render and fitBounds works reliably.
  setTimeout(function () {
    try {
      map.invalidateSize();
    } catch (_) {}
  }, 0);

  return map;
}

function renderGeojsonFeature(map, geojson) {
  if (!map || !geojson || !geojson.geometry) return null;

  // Use Leaflet's GeoJSON renderer with a coordinate transformer (EPSG:25833 -> WGS84)
  // so MultiLineString/LineString/Point are handled consistently.
  const layer = L.geoJSON(geojson, {
    coordsToLatLng: function (coords) {
      if (!Array.isArray(coords) || coords.length < 2) {
        return L.latLng(0, 0);
      }

      const ll = transformCoords(coords[0], coords[1]);
      return L.latLng(ll[0], ll[1]);
    },
    style: function () {
      return {
        color: '#E31837',
        weight: 6,
        opacity: 0.95,
      };
    },
    pointToLayer: function (_feature, latlng) {
      return L.circleMarker(latlng, {
        radius: 7,
        color: '#E31837',
        fillColor: '#E31837',
        fillOpacity: 0.9,
        weight: 3,
      });
    }
  });

  layer.addTo(map);

  const bounds = layer.getBounds && layer.getBounds();
  if (bounds && bounds.isValid && bounds.isValid()) {
    setTimeout(function () {
      try {
        map.invalidateSize();
        map.fitBounds(bounds, { padding: [20, 20] });
      } catch (_) {}
    }, 0);
  } else {
    console.warn('[feature-details] GeoJSON bounds invalid; geometry may be empty/unsupported:', geojson && geojson.geometry);
  }

  return layer;
}

function addFeatureZoomControl(map, label, targetLayer) {
  if (!map || !window.L) return;

  if (map._featureZoomControl) {
    try {
      map.removeControl(map._featureZoomControl);
    } catch (_) {}
    map._featureZoomControl = null;
  }

  const text = label ? String(label) : 'Zoom to Feature';

  const ctl = L.control({ position: 'topright' });
  ctl.onAdd = function () {
    const div = L.DomUtil.create('div');
    div.style.background = '#FFFFFF';
    div.style.border = '1px solid rgba(0,0,0,0.12)';
    div.style.borderRadius = '8px';
    div.style.padding = '8px 10px';
    div.style.fontSize = '13px';
    div.style.color = '#111827';
    div.style.boxShadow = '0 4px 10px rgba(0,0,0,0.08)';
    div.style.cursor = 'pointer';
    div.style.userSelect = 'none';
    div.innerHTML = '<span style="font-weight:600;">' + escapeHtml(text) + '</span>';

    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.on(div, 'click', function () {
      if (!targetLayer || !targetLayer.getBounds) return;
      const b = targetLayer.getBounds();
      if (b && b.isValid && b.isValid()) {
        try {
          map.invalidateSize();
          map.fitBounds(b, { padding: [20, 20] });
        } catch (_) {}
      }
    });

    return div;
  };

  ctl.addTo(map);
  map._featureZoomControl = ctl;
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

  // Display detected/as-built from field_measurements if available
  const fm = feature && feature.field_measurements ? feature.field_measurements : {};
  setText('detectedLength', fm.length ? `${fm.length.value || fm.length} ${fm.length.unit || 'm'}` : '--');
  setText('detectedDiameter', fm.diameter ? `${fm.diameter.value || fm.diameter} ${fm.diameter.unit || 'mm'}` : '--');
  setText('detectedStart', '--');
  setText('detectedEnd', '--');

  // Display uploaded photo if available
  const photoUrl = feature && feature.photo_url ? feature.photo_url : null;
  renderFieldPhoto(photoUrl, feature && feature.updated_at);
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
