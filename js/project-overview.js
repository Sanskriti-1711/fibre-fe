window.FiberAuth.requireLogin();

const map = L.map('map').setView([51.5074, -0.1278], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

const layerList = document.getElementById('layerList');
const selectedLayerTitle = document.getElementById('selectedLayerTitle');
const detailLayerName = document.getElementById('detailLayerName');
const detailFeatureCount = document.getElementById('detailFeatureCount');
const detailCompleted = document.getElementById('detailCompleted');
const detailPending = document.getElementById('detailPending');
const detailFailed = document.getElementById('detailFailed');
const viewAllBtn = document.getElementById('viewAllBtn');

const layerPalette = ['#0EA5E9', '#10B981', '#F59E0B', '#6366F1', '#EF4444', '#14B8A6', '#8B5CF6', '#EC4899'];

let currentProject = null;
let currentLayers = [];
let selectedLayer = null;
let overlayGroups = [];

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function pickProjectId(p) {
  return (p && (p.uuid || p.id || p.project_uuid || p.pk)) || null;
}

function pickProjectName(p) {
  return (p && (p.name || p.title || p.project_name)) || 'Project Overview';
}

function pickProjectSubtitle(p) {
  return (p && (p.description || p.summary)) || 'Project overview powered by PostGIS';
}

function formatNumber(v) {
  const num = Number(v);
  return !isNaN(num) ? num.toLocaleString() : String(v);
}

function formatPercent(v) {
  const num = Number(v);
  return !isNaN(num) ? Math.round(num) + '%' : String(v);
}

function clearView() {
  overlayGroups.forEach(function (group) {
    map.removeLayer(group);
  });
  overlayGroups = [];
  layerList.innerHTML = '<span style="color: var(--tm-gray); font-size: 13px;">No layers available</span>';
  selectedLayer = null;
  updateLayerDetails();
}

function updateLayerDetails() {
  if (!selectedLayer) {
    selectedLayerTitle.textContent = 'Feature Details';
    detailLayerName.textContent = '--';
    detailFeatureCount.textContent = '--';
    detailCompleted.textContent = '0';
    detailPending.textContent = '0';
    detailFailed.textContent = '0';
    viewAllBtn.href = '#';
    return;
  }

  selectedLayerTitle.textContent = selectedLayer.name + ' Details';
  detailLayerName.textContent = selectedLayer.name;
  detailFeatureCount.textContent = formatNumber(selectedLayer.features ? selectedLayer.features.length : 0);

  const completed = selectedLayer.features ? selectedLayer.features.filter(f => f.status === 'Completed').length : 0;
  const pending = selectedLayer.features ? selectedLayer.features.filter(f => f.status === 'Pending').length : 0;
  const failed = selectedLayer.features ? selectedLayer.features.filter(f => f.status === 'Failed').length : 0;

  detailCompleted.textContent = formatNumber(completed);
  detailPending.textContent = formatNumber(pending);
  detailFailed.textContent = formatNumber(failed);

  if (currentProject) {
    const projectId = pickProjectId(currentProject);
    viewAllBtn.href = 'feature-management.html?project=' + encodeURIComponent(projectId || '');
  }
}

function selectLayer(layer, layerEl) {
  document.querySelectorAll('.layer-item').forEach(el => el.classList.remove('active'));
  layerEl.classList.add('active');
  selectedLayer = layer;
  updateLayerDetails();

  overlayGroups.forEach(function (group) {
    map.removeLayer(group);
  });

  const group = overlayGroups.find(g => g.layerName === layer.name);
  if (group) {
    group.addTo(map);
    if (group.markers && group.markers.length) {
      const bounds = L.featureGroup(group.markers).getBounds();
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }
}

function renderLayers(layers) {
  layerList.innerHTML = '';
  currentLayers = layers || [];

  if (!currentLayers.length) {
    layerList.innerHTML = '<span style="color: var(--tm-gray); font-size: 13px;">No layers available</span>';
    return;
  }

  const markers = [];

  currentLayers.forEach(function (layerInfo, index) {
    const color = layerPalette[index % layerPalette.length];

    const layerEl = document.createElement('div');
    layerEl.className = 'layer-item';
    layerEl.innerHTML = '<span class="layer-color" style="background: ' + color + '"></span><span>' + layerInfo.name + '</span>';
    layerEl.addEventListener('click', function () {
      selectLayer(layerInfo, layerEl);
    });
    layerList.appendChild(layerEl);

    const group = L.layerGroup();
    group.layerName = layerInfo.name;
    group.markers = [];

    if (layerInfo.features) {
      layerInfo.features.forEach(function (feature) {
        const marker = L.circleMarker(feature.coords, {
          radius: 6,
          color: color,
          fillOpacity: 0.85
        });
        marker.bindPopup('<strong>' + feature.name + '</strong><br/>Status: ' + feature.status);
        marker.addTo(group);
        group.markers.push(marker);
      });
    }

    overlayGroups.push(group);
  });

  if (currentLayers.length > 0) {
    const firstLayerEl = layerList.querySelector('.layer-item');
    if (firstLayerEl) {
      selectLayer(currentLayers[0], firstLayerEl);
    }
  }
}

async function loadProjectOverview() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) return;

  try {
    const project = await window.FiberApi.getProject(id);
    currentProject = project;

    const name = pickProjectName(project);
    const subtitle = pickProjectSubtitle(project);
    const projectId = pickProjectId(project);

    setText('projectTitle', name);
    setText('projectDescription', subtitle);
    setText('projectRegion', (project && (project.region || project.location || project.area)) || '--');

    const total = project && (project.total_features || project.feature_total || project.total);
    const completion = project && (project.completion || project.completion_percent || project.progress || project.progress_percent);

    setText('projectTotal', total !== undefined ? formatNumber(total) : '--');
    setText('projectCompletion', completion !== undefined ? formatPercent(completion) : '--');

    if (project && project.layers) {
      renderLayers(project.layers);
    } else {
      clearView();
    }
  } catch (_) {
    clearView();
  }
}

loadProjectOverview();
