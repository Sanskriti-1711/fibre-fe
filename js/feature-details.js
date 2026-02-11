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

  // Detected/as-built not available from this endpoint in the provided payload
  setText('detectedLength', '--');
  setText('detectedDiameter', '--');
  setText('detectedStart', '--');
  setText('detectedEnd', '--');
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
      getFeatureDetails(params.projectId, params.featureId)
    ]);

    const project = results[0];
    const featureDetails = results[1];

    console.log('[feature-details] Feature Details response:', featureDetails);

    bindFeatureDetails(params, featureDetails);
    bindBreadcrumb(params, project, featureDetails);

    if (map && featureDetails && featureDetails.geojson) {
      const rendered = renderGeojsonFeature(map, featureDetails.geojson);
      const feature = featureDetails && featureDetails.feature ? featureDetails.feature : null;
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
