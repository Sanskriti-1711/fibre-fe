// Project Details Module
// Handles map rendering and project data fetching

window.FiberAuth.requireLogin();

const map = L.map('map').setView([51.5074, -0.1278], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

const featureList = document.getElementById('featureList');
// const layerList = document.getElementById('layerList');
// const layerCount = document.getElementById('layerCount');
// const featureCount = document.getElementById('featureCount');
const projectTitle = document.getElementById('projectTitle');
const detailName = document.getElementById('detailName');
const detailStatus = document.getElementById('detailStatus');
const detailEngineer = document.getElementById('detailEngineer');
const detailCompletion = document.getElementById('detailCompletion');
const layerBasicsBody = document.getElementById('layerBasicsBody');
const layerControl = L.control.layers(null, null, { collapsed: false }).addTo(map);

const layerPalette = ['#0EA5E9', '#10B981', '#F59E0B', '#6366F1', '#EF4444', '#14B8A6'];

// Define EPSG:25833 projection for coordinate transformation
proj4.defs('EPSG:25833', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');

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

// Transform coordinates from EPSG:25833 to WGS84 (EPSG:4326)
function transformCoords(x, y) {
  const transformed = proj4('EPSG:25833', 'WGS84', [x, y]);
  return [transformed[1], transformed[0]]; // Return as [lat, lng] for Leaflet
}

// Show/hide loader
function setLoading(isLoading) {
  const loader = document.getElementById('mapLoader');
  const kpiSection = document.getElementById('kpiSection');
  if (loader) loader.style.display = isLoading ? 'block' : 'none';
  if (kpiSection) kpiSection.style.display = isLoading ? 'none' : 'grid';
}

// Fetch project details from API using FiberApi (handles JWT auth)
async function fetchProjectDetails(projectId) {
  return window.FiberApi.getProject(projectId);
}

// Fetch project map data from API
async function fetchProjectMapData(projectId) {
  const url = `https://fiber-import.zeabur.app/geo/projects/${projectId}/map-data`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch map data: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// Convert completion percentage to integer
function formatCompletionPercentage(completionValue) {
  if (!completionValue) return '--';
  const num = parseFloat(completionValue);
  if (isNaN(num)) return '--';
  return Math.round(num);
}

// Render GeoJSON feature on map
function renderGeoJSONFeature(feature, layerInfo, layerGroup, allLayers) {
  const geometry = feature.geometry;
  const properties = feature.properties || {};
  const color = layerInfo.color;

  if (!geometry) return null;

  let layer = null;

  if (geometry.type === 'Point') {
    const coords = geometry.coordinates;
    const latLng = transformCoords(coords[0], coords[1]);
    layer = L.circleMarker(latLng, {
      radius: 6,
      color: color,
      fillColor: color,
      fillOpacity: 0.85
    });
    layer.featureData = {
      id: properties.ID || feature.id,
      name: properties.ID || properties.NAME || `Feature #${feature.id}`,
      status: properties.status || 'Pending',
      engineer: properties.engineer || '--',
      completion: properties.completion || '--',
      layer: layerInfo.name
    };
    layer.bindPopup(`<strong>${layer.featureData.name}</strong><br/>Type: ${properties.Type || layerInfo.name}<br/>Status: ${layer.featureData.status}`);
  } else if (geometry.type === 'MultiLineString' || geometry.type === 'LineString') {
    const coords = geometry.type === 'MultiLineString' ? geometry.coordinates[0] : geometry.coordinates;
    const latLngs = coords.map(coord => transformCoords(coord[0], coord[1]));
    layer = L.polyline(latLngs, {
      color: color,
      weight: 3,
      opacity: 0.8
    });
    layer.featureData = {
      id: properties.ID || feature.id,
      name: properties.ID || properties.NAME || `Feature #${feature.id}`,
      status: properties.status || 'Pending',
      engineer: properties.engineer || '--',
      completion: properties.completion || '--',
      layer: layerInfo.name
    };
    layer.bindPopup(`<strong>${layer.featureData.name}</strong><br/>Type: ${properties.Type || layerInfo.name}<br/>Length: ${properties.Length || properties['Length(m)'] || '--'}m<br/>Status: ${layer.featureData.status}`);
  }

  if (layer) {
    layer.on('click', function () {
      highlightFeature(layer, color);
      setFeatureDetails(layer.featureData);
    });
    layer.addTo(layerGroup);
    allLayers.push(layer);
  }

  return layer;
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
    const allMapLayers = [];

    layers.forEach(function (layerInfo, index) {
      const color = layerPalette[index % layerPalette.length];
      layerInfo.color = color;

      // addLayerPill(layerInfo.name);
      const group = L.layerGroup();

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

      // Render GeoJSON features for this layer and build feature list
      const layerGeoJSON = geojsonData[layerInfo.name];
      if (layerGeoJSON && layerGeoJSON.features) {
        layerGeoJSON.features.forEach(function (geoFeature) {
          const layer = renderGeoJSONFeature(geoFeature, layerInfo, group, allMapLayers);
          
          // Add to feature list if layer was created
          if (layer && layer.featureData) {
            const label = `${layerInfo.name} #${layer.featureData.id} • ${geoFeature.geometry.type}`;
            addFeatureListItem(label, layer, color, {
              id: layer.featureData.id,
              type: geoFeature.geometry.type,
              layer: layerInfo.name,
              status: 'Pending'
            });
          }
        });
      }

      group.addTo(map);
      layerControl.addOverlay(group, layerInfo.name);
      overlayGroups.push(group);
    });

    // Setup checkbox listeners
    layerBasicsBody.querySelectorAll('input[type="checkbox"]').forEach(function (checkbox, index) {
      checkbox.addEventListener('change', function () {
        const group = overlayGroups[index];
        if (!group) return;
        if (checkbox.checked) {
          group.addTo(map);
        } else {
          map.removeLayer(group);
        }
      });
    });

    // layerCount.textContent = layers.length;
    // featureCount.textContent = totalFeatures;

    // Fit map to all features
    if (allMapLayers.length) {
      const groupBounds = L.featureGroup(allMapLayers).getBounds();
      if (groupBounds.isValid()) {
        map.fitBounds(groupBounds, { padding: [20, 20] });
      }
    }

  } catch (error) {
    console.error('Error loading project data:', error);
    document.getElementById('projectDescription').textContent = 'Error loading project data: ' + error.message;
  } finally {
    setLoading(false);
  }
}

function highlightFeature(layer, baseColor) {
  if (!layer || !layer.setStyle) return;
  layer.setStyle({ color: '#E31837', weight: 3, fillOpacity: 0.35 });
  setTimeout(function () {
    layer.setStyle({ color: baseColor || '#0EA5E9', weight: 2, fillOpacity: 0.25 });
  }, 1200);
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

function addFeatureListItem(label, layer, baseColor, feature) {
  const item = document.createElement('div');
  item.className = 'feature-item';
  item.textContent = label;
  item.addEventListener('click', function () {
    if (!layer) return;
    
    // Zoom to feature - handle both Points (getLatLng) and Lines (getBounds)
    if (layer.getLatLng) {
      map.setView(layer.getLatLng(), 18);
    } else if (layer.getBounds) {
      map.fitBounds(layer.getBounds(), { padding: [50, 50] });
    }
    
    if (layer.openPopup) layer.openPopup();
    highlightFeature(layer, baseColor);
    setFeatureDetails(feature);
  });
  featureList.appendChild(item);
}

function addLayerPill(label) {
  // const pill = document.createElement('span');
  // pill.className = 'layer-pill';
  // pill.textContent = label;
  // layerList.appendChild(pill);
}

let overlayGroups = [];

function clearView() {
  overlayGroups.forEach(function (group) {
    map.removeLayer(group);
  });
  overlayGroups = [];
  featureList.innerHTML = '';
  // layerList.innerHTML = '';
  layerBasicsBody.innerHTML = '';
  // layerCount.textContent = '0';
  // featureCount.textContent = '0';
}

// Initialize on page load
loadAndRenderProject();
