// Project Details Module
// Handles map rendering and project data fetching (MapLibre GL)

window.FiberAuth.requireLogin();

let map = null;
let overlayGroups = []; // layer group refs: { name, sourceId, layerIds: [] }

const featureList = document.getElementById('featureList');
const projectTitle = document.getElementById('projectTitle');
const detailName = document.getElementById('detailName');
const detailStatus = document.getElementById('detailStatus');
const detailEngineer = document.getElementById('detailEngineer');
const detailCompletion = document.getElementById('detailCompletion');
const layerBasicsBody = document.getElementById('layerBasicsBody');

const layerPalette = ['#0369A1', '#047857', '#B45309', '#6366F1', '#EF4444', '#14B8A6'];

function pickProjectId(p) {
  return (p && (p.uuid || p.id || p.project_uuid || p.pk)) || null;
}

function pickProjectName(p) {
  return (p && (p.name || p.title || p.project_name)) || '';
}

// Get project_id from URL query parameters
function getProjectIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('project_id');
}

// Show/hide loader
function setLoading(isLoading) {
  const loader = document.getElementById('mapLoader');
  const kpiSection = document.getElementById('kpiSection');
  if (loader) loader.style.display = isLoading ? 'block' : 'none';
  if (kpiSection) kpiSection.style.display = isLoading ? 'none' : 'grid';
}

// Initialize the MapLibre map (OSM raster basemap)
function initMap() {
  if (typeof maplibregl === 'undefined' || !document.getElementById('map')) return null;

  const m = new maplibregl.Map({
    container: 'map',
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
    zoom: 12,
  });
  m.addControl(new maplibregl.NavigationControl(), 'top-left');
  m.addControl(new maplibregl.ScaleControl(), 'bottom-left');
  m.addControl(new maplibregl.AttributionControl({ compact: true }));
  return m;
}

// Fetch project details from API using FiberApi (handles JWT auth)
async function fetchProjectDetails(projectId) {
  return window.FiberApi.getProject(projectId);
}

// Fetch project map data from API (Django-backed; survey packages live in
// the Django DB, not in the external import microservice).
async function fetchProjectMapData(projectId) {
  const response = await window.FiberApi.rawFetch(
    `/api/projects/${encodeURIComponent(projectId)}/map-data/`,
    { method: "GET" }
  );
  return response;
}

// Convert completion percentage to integer
function formatCompletionPercentage(completionValue) {
  if (!completionValue) return '--';
  const num = parseFloat(completionValue);
  if (isNaN(num)) return '--';
  return Math.round(num);
}

// Compute the LngLatBounds covering an array of features
function boundsOfFeatures(features) {
  const b = new maplibregl.LngLatBounds();
  let any = false;
  (features || []).forEach(function (f) {
    if (!f || !f.geometry || !f.geometry.coordinates) return;
    const coords = f.geometry.coordinates;
    const type = f.geometry.type;
    const points = [];
    if (type === 'Point') { points.push(coords); }
    else if (type === 'MultiPoint' || type === 'LineString') { points.push(...coords); }
    else if (type === 'MultiLineString' || type === 'Polygon') { points.push(...(coords[0] || [])); }
    else if (type === 'MultiPolygon') { points.push(...((coords[0] && coords[0][0]) || [])); }
    points.forEach(function (p) { if (p && p.length >= 2) { b.extend(p); any = true; } });
  });
  return any ? b : null;
}

// Render GeoJSON features for a layer as a MapLibre source + layers
function renderGeoJSONFeature(featureListData, layerInfo, index) {
  const group = {
    name: layerInfo.name,
    sourceId: 'layer-source-' + index,
    layerIds: [],
  };

  const features = (featureListData && featureListData.features) || [];
  if (!features.length) return group;

  const color = layerInfo.color;
  const sourceId = group.sourceId;

  // MapLibre renders only matching geometry per layer, so split by type
  const lineFeatures = [];
  const pointFeatures = [];
  const polygonFeatures = [];
  features.forEach(function (f) {
    if (!f || !f.geometry) return;
    const t = f.geometry.type;
    if (t === 'Point' || t === 'MultiPoint') { pointFeatures.push(f); }
    else if (t === 'LineString' || t === 'MultiLineString' || String(t).toLowerCase().indexOf('line') !== -1) { lineFeatures.push(f); }
    else { polygonFeatures.push(f); }
  });

  const addLayers = function () {
    if (!map || map.getSource(sourceId)) return;

    const fc = { type: 'FeatureCollection', features: features };
    map.addSource(sourceId, { type: 'geojson', data: fc });

    if (lineFeatures.length) {
      const lineLayerId = sourceId + '-line';
      map.addLayer({ id: lineLayerId, type: 'line', source: sourceId, paint: { 'line-color': color, 'line-width': 3, 'line-opacity': 0.8 } });
      group.layerIds.push(lineLayerId);
    }
    if (pointFeatures.length) {
      const pointLayerId = sourceId + '-point';
      map.addLayer({ id: pointLayerId, type: 'circle', source: sourceId, paint: { 'circle-radius': 6, 'circle-color': color, 'circle-opacity': 0.85, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1 } });
      group.layerIds.push(pointLayerId);
    }
    if (polygonFeatures.length) {
      const fillLayerId = sourceId + '-fill';
      const outlineLayerId = sourceId + '-outline';
      map.addLayer({ id: fillLayerId, type: 'fill', source: sourceId, paint: { 'fill-color': color, 'fill-opacity': 0.3 } });
      map.addLayer({ id: outlineLayerId, type: 'line', source: sourceId, paint: { 'line-color': color, 'line-width': 2 } });
      group.layerIds.push(fillLayerId, outlineLayerId);
    }

    // Click handler → popup + highlight + details
    group.layerIds.forEach(function (lid) {
      map.on('click', lid, function (e) {
        if (!e.features || !e.features[0]) return;
        const props = e.features[0].properties || {};
        const featureData = {
          id: props.ID || e.features[0].id,
          name: props.ID || props.NAME || 'Feature',
          status: props.status || 'Pending',
          engineer: props.engineer || '--',
          completion: props.completion || '--',
          layer: layerInfo.name
        };
        highlightLayer(lid, color);
        setFeatureDetails(featureData);
        new maplibregl.Popup({ closeButton: true, maxWidth: '260px' })
          .setLngLat(e.lngLat)
          .setHTML('<strong>' + esc(props.ID || props.NAME || 'Feature') + '</strong><br/>Type: ' + esc(props.Type || layerInfo.name) + '<br/>Status: ' + esc(featureData.status))
          .addTo(map);
      });
      map.on('mouseenter', lid, function () { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', lid, function () { map.getCanvas().style.cursor = ''; });
    });
  };

  // MapLibre requires the style to be loaded before adding sources/layers
  if (map.isStyleLoaded()) {
    addLayers();
  } else {
    map.once('load', addLayers);
  }

  // Feature list entries (independent of layer render timing)
  features.forEach(function (geoFeature) {
    const props = geoFeature.properties || {};
    const id = props.ID || geoFeature.id;
    const label = layerInfo.name + ' #' + id + ' • ' + (geoFeature.geometry ? geoFeature.geometry.type : '?');
    const fBounds = boundsOfFeatures([geoFeature]);
    const fCenter = featureCenter(geoFeature);
    addFeatureListItem(label, {
      layerId: group.layerIds[0],
      color: color,
      bounds: fBounds,
      center: fCenter,
      data: {
        id: id,
        type: geoFeature.geometry ? geoFeature.geometry.type : '',
        layer: layerInfo.name,
        status: 'Pending'
      }
    }, color);
  });

  return group;
}

function featureCenter(feature) {
  if (!feature || !feature.geometry || !feature.geometry.coordinates) return null;
  const c = feature.geometry.coordinates;
  if (feature.geometry.type === 'Point') return [c[0], c[1]];
  if (Array.isArray(c[0])) return [c[0][0], c[0][1]];
  return [c[0], c[1]];
}

function esc(str) {
  return String(str === undefined || str === null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Load and render project data
async function loadAndRenderProject() {
  const projectId = getProjectIdFromUrl();

  if (!projectId) {
    document.getElementById('projectTitle').textContent = 'No Project Selected';
    document.getElementById('projectDescription').textContent = 'Please provide a project_id in the URL (e.g., ?project_id=123)';
    setLoading(false);
    return;
  }

  setLoading(true);

  if (!map) {
    document.getElementById('projectDescription').textContent = 'Map library failed to load — please refresh the page.';
    setLoading(false);
    return;
  }

  try {
    // Fetch both project details and map data in parallel
    const [projectDetails, mapData] = await Promise.all([
      fetchProjectDetails(projectId),
      fetchProjectMapData(projectId)
    ]);

    let apiLayers = null;
    try {
      apiLayers = await window.FiberApi.listProjectLayers(projectId);
      console.log('listProjectLayers response:', apiLayers);
    } catch (e) {
      console.log('listProjectLayers failed:', e);
      apiLayers = null;
    }

    const apiLayerList = (apiLayers && Array.isArray(apiLayers.layers)) ? apiLayers.layers : [];
    const apiLayerIdByName = {};
    const apiLayerIdByNameNormalized = {};
    apiLayerList.forEach(function (l) {
      if (!l) return;
      const lname = l.layer_name;
      const lid = l.layer_id;
      if (lname && lid) {
        if (apiLayerIdByName[lname] === undefined) {
          apiLayerIdByName[lname] = lid;
        }
        // Also store normalized version (lowercase, underscores to spaces) for fuzzy matching
        const normalized = lname.toLowerCase().replace(/_/g, ' ').trim();
        if (normalized && apiLayerIdByNameNormalized[normalized] === undefined) {
          apiLayerIdByNameNormalized[normalized] = lid;
        }
      }
    });

    clearView();

    // Update project header with details from API
    document.getElementById('projectTitle').textContent = projectDetails.name || `Project ${projectId}`;
    document.getElementById('projectDescription').textContent = projectDetails.description || 'Layer and feature management for the selected project';

    // Update KPI section with project details
    const totalFeatures = mapData.features ? mapData.features.length : 0;
    const totalLayers = mapData.layers ? mapData.layers.length : 0;
    document.getElementById('projectTotalFeatures').textContent = totalFeatures;
    document.getElementById('projectTotalLayers').textContent = totalLayers;
    document.getElementById('projectRegion').textContent = projectDetails.region || '--';
    document.getElementById('projectCompletion').textContent = formatCompletionPercentage(projectDetails.completion_percentage) + '%';

    // Render layers
    const layers = mapData.layers || [];
    const geojsonData = mapData.geojson || {};
    const allLayerBounds = [];

    layers.forEach(function (layerInfo, index) {
      const color = layerPalette[index % layerPalette.length];
      layerInfo.color = color;

      // Add layer basics row
      const row = document.createElement('tr');

      // Try exact match first, then normalized match
      let layerId = apiLayerIdByName[layerInfo.name] || '';
      if (!layerId) {
        const normalizedMapName = (layerInfo.name || '').toLowerCase().replace(/_/g, ' ').trim();
        layerId = apiLayerIdByNameNormalized[normalizedMapName] || '';
      }

      console.log('Layer mapping:', { mapName: layerInfo.name, resolvedId: layerId });

      row.innerHTML = ''
        + '<td>' + layerInfo.name + '</td>'
        + '<td>' + (layerInfo.type || '--') + '</td>'
        + '<td><input type="checkbox" checked data-layer="' + layerInfo.name + '" /></td>'
        + '<td><a href="layer-details.html?project_id=' + encodeURIComponent(projectId) + '&layer_id=' + encodeURIComponent(layerId) + '" class="btn btn-details">View</a></td>';
      layerBasicsBody.appendChild(row);

      // Render GeoJSON features for this layer
      const layerGeoJSON = geojsonData[layerInfo.name];
      const group = renderGeoJSONFeature(layerGeoJSON, layerInfo, index);
      overlayGroups.push(group);

      const b = boundsOfFeatures((layerGeoJSON && layerGeoJSON.features) || []);
      if (b) allLayerBounds.push(b);
    });

    // Setup checkbox listeners
    layerBasicsBody.querySelectorAll('input[type="checkbox"]').forEach(function (checkbox, index) {
      checkbox.addEventListener('change', function () {
        const group = overlayGroups[index];
        if (!group) return;
        const visibility = checkbox.checked ? 'visible' : 'none';
        group.layerIds.forEach(function (lid) {
          if (map.getLayer(lid)) map.setLayoutProperty(lid, 'visibility', visibility);
        });
      });
    });

    // Fit map to all features
    if (allLayerBounds.length && map) {
      const combined = new maplibregl.LngLatBounds();
      allLayerBounds.forEach(function (b) { combined.extend(b); });
      map.fitBounds(combined, { padding: 40, maxZoom: 16 });
    }

  } catch (error) {
    console.error('Error loading project data:', error);
    document.getElementById('projectDescription').textContent = 'Error loading project data: ' + FtthUI.humanize(error);
  } finally {
    setLoading(false);
  }
}

function highlightLayer(layerId, baseColor) {
  if (!map || !map.getLayer(layerId)) return;
  const type = map.getLayer(layerId).type;
  const paintKey = type === 'circle' ? 'circle-color' : (type === 'fill' ? 'fill-color' : 'line-color');
  try {
    map.setPaintProperty(layerId, paintKey, '#E31837');
    setTimeout(function () {
      try { map.setPaintProperty(layerId, paintKey, baseColor || '#0369A1'); } catch (_) {}
    }, 1200);
  } catch (_) {}
}

function setFeatureDetails(feature) {
  if (!feature) return;
  // Build display name from id, type, layer since name field was removed from API
  const displayName = feature.id ? `${feature.layer || ''} #${feature.id}` : (feature.name || '--');
  detailName.textContent = displayName;
  detailStatus.textContent = feature.status || '--';
  detailEngineer.textContent = feature.engineer || '--';
  detailCompletion.textContent = feature.completion || '--';
}

function addFeatureListItem(label, target, baseColor) {
  const item = document.createElement('div');
  item.className = 'feature-item';
  item.textContent = label;
  item.addEventListener('click', function () {
    if (!map || !target) return;

    // Zoom to feature
    if (target.bounds) {
      map.fitBounds(target.bounds, { padding: 50, maxZoom: 18 });
    } else if (target.center) {
      map.jumpTo({ center: target.center, zoom: 18 });
    }

    if (target.layerId) highlightLayer(target.layerId, target.color || baseColor);
    setFeatureDetails(target.data);
  });
  featureList.appendChild(item);
}

function clearView() {
  overlayGroups.forEach(function (group) {
    if (!map) return;
    group.layerIds.forEach(function (lid) {
      if (map.getLayer(lid)) map.removeLayer(lid);
    });
    if (map.getSource(group.sourceId)) map.removeSource(group.sourceId);
  });
  overlayGroups = [];
  featureList.innerHTML = '';
  layerBasicsBody.innerHTML = '';
}

// Initialize on page load
map = initMap();
loadAndRenderProject();
