/**
 * FTTH LLD — Review Page Logic
 *
 * Renders the LLD Review workspace: map comparison of HLD (blue) / Survey
 * (orange) / Approved (green) datasets, the survey-change queue, a detail
 * drawer for each change (geometry + attribute comparison), review actions
 * (Approve / Reject / Request Correction + comments), LLD readiness
 * validation, immutable Approved Survey Version creation, and the Run LLD
 * trigger.
 *
 * Requires: ftth-lld-api.js, ftth-map.js (for basemap switching helpers),
 *           MapLibre GL 4.7.1 (CDN).
 */
(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const requestedProject = params.get('project_id');
  let projectId = requestedProject || '';   // resolved to a real project in boot()

  // Colors for the three states + difference highlight.
  const COLORS = {
    hld: { line: '#3B82F6', fill: '#2563EB', label: 'HLD' },
    survey: { line: '#F97316', fill: '#EA580C', label: 'Survey' },
    approved: { line: '#10B981', fill: '#059669', label: 'Approved' },
    diff: { line: '#EF4444', fill: '#DC2626', label: 'Difference' },
  };

  // State
  let review = null;            // full review payload
  let changes = [];             // survey changes
  let map = null;
  let selectedChange = null;
  let filter = 'all';
  let searchTerm = '';
  let geomMode = 'difference';  // original | survey | difference (drawer SVG)
  let viewMode = 'difference';  // map focus emphasis
  let approvedVersion = null;

  // Layer visibility (legend toggles)
  const layerVis = { hld: true, survey: true, approved: true };

  // DOM refs
  const $ = (id) => document.getElementById(id);
  const mapEl = $('map');
  const mapLoading = $('mapLoading');
  const projectNameEl = $('projectName');
  const projectIdEl = $('projectId');
  const hldVersionEl = $('hldVersion');
  const readinessStatusEl = $('readinessStatus');
  const countTotal = $('countTotal');
  const countApproved = $('countApproved');
  const countRejected = $('countRejected');
  const countCorrection = $('countCorrection');
  const countPending = $('countPending');
  const resolveLabel = $('resolveLabel');
  const resolveFill = $('resolveFill');
  const createAsBtn = $('createAsBtn');
  const runLldBtn = $('runLldBtn');
  const replanLldBtn = $('replanLldBtn');
  const asChip = $('asChip');
  const asChipId = $('asChipId');
  const readinessNote = $('readinessNote');
  const changeListEl = $('changeList');
  const searchInput = $('searchInput');
  const filterTabs = $('filterTabs');
  const detailDrawer = $('detailDrawer');
  const drawerBody = $('drawerBody');
  const legendEl = $('mapLegend');
  const viewModeEl = $('viewMode');

  // ==================================================================
  // Boot
  // ==================================================================
  async function boot() {
    if (typeof window.FiberAuth !== 'undefined' &&
        typeof window.FiberAuth.requireLogin === 'function') {
      window.FiberAuth.requireLogin();
    }

    // No explicit project? Resolve the latest completed HLD run from the
    // real backend so the page opens with real data.
    if (!projectId && typeof window.FtthLldApi.resolveDefaultProject === 'function') {
      try {
        const resolved = await window.FtthLldApi.resolveDefaultProject();
        if (resolved && resolved.project_id) projectId = resolved.project_id;
      } catch (_) { /* fall through */ }
    }
    if (!projectId) {
      projectIdEl.textContent = '—';
      mapLoading.innerHTML = '<div style="text-align:center;"><p style="color:#DC2626;font-size:14px;">No project selected. Open this page from a project\'s LLD Review link.</p></div>';
      return;
    }

    projectIdEl.textContent = projectId;
    renderFilterTabs();
    bindLegend();
    bindViewMode();
    bindSearch();

    try {
      review = await window.FtthLldApi.loadReview(projectId);
    } catch (err) {
      mapLoading.innerHTML = '<div style="text-align:center;"><p style="color:#DC2626;font-size:14px;margin-bottom:12px;">Failed to load review: ' + esc(err.message || err) + '</p><button onclick="location.reload()" style="padding:8px 16px;border-radius:8px;border:1px solid #D1D5DB;background:#FFF;cursor:pointer;font-size:13px;">Retry</button></div>';
      return;
    }

    changes = review.changes || [];
    approvedVersion = review.approved_survey_version || null;

    projectNameEl.textContent = review.project && review.project.name ? review.project.name : projectId;
    hldVersionEl.textContent = (review.project && review.project.hld_version) || '—';

    try {
      initMap();
    } catch (err) {
      console.error('Map init failed:', err);
      mapLoading.innerHTML = '<p style="color:#DC2626;font-size:14px;">Failed to initialize map: ' + esc(err.message || err) + '</p>';
      return;
    }

    renderReadiness();
    renderFilterTabs(); // counts are computed from the loaded changes
    renderChangeList();
    initBasemapSwitcher();
  }

  // ==================================================================
  // Map
  // ==================================================================
  function initMap() {
    if (typeof maplibregl === 'undefined') throw new Error('MapLibre GL not loaded');

    map = new maplibregl.Map({
      container: mapEl,
      style: { version: 8, sources: {}, layers: [] },
      center: [13.402, 52.512],
      zoom: 14,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-left');
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');

    map.on('load', () => {
      addBaseLayers();
      addDatasetLayer('hld', review.layers.hld);
      addDatasetLayer('survey', review.layers.survey);
      renderApprovedLayer();
      wireLayerClicks();
      fitProject();
      mapLoading.style.display = 'none';
    });
    if (map.loaded()) map.fire('load');
  }

  function addBaseLayers() {
    const defs = [
      ['streets', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', '© OpenStreetMap'],
      ['light', 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png', '© OSM © CARTO'],
      ['satellite', 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', '© Esri, Maxar'],
      ['dark', 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png', '© OSM © CARTO'],
    ];
    defs.forEach((d, i) => {
      map.addSource('base-' + d[0], { type: 'raster', tiles: [d[1]], tileSize: 256, attribution: d[2] });
      map.addLayer({ id: 'base-layer-' + d[0], type: 'raster', source: 'base-' + d[0], layout: { visibility: i === 0 ? 'visible' : 'none' } });
    });
  }

  function setBasemap(name) {
    ['streets', 'light', 'satellite', 'dark'].forEach((k) => {
      const layer = map.getLayer('base-layer-' + k);
      if (layer) map.setLayoutProperty('base-layer-' + k, 'visibility', k === name ? 'visible' : 'none');
    });
  }

  /**
   * Add one dataset (hld | survey) as a colored map layer.
   * Features carrying a change_id become clickable → open the detail drawer.
   */
  function addDatasetLayer(key, geojson) {
    if (!geojson || !geojson.features || !geojson.features.length) return;
    const c = COLORS[key];
    const sourceId = 'src-' + key;
    if (map.getSource(sourceId)) return;

    map.addSource(sourceId, { type: 'geojson', data: geojson });

    const hasLine = geojson.features.some((f) => /line/i.test(f.geometry && f.geometry.type || ''));
    const hasPoint = geojson.features.some((f) => /point/i.test(f.geometry && f.geometry.type || ''));

    if (hasLine) {
      const paint = {
        'line-color': c.line,
        'line-width': key === 'survey' ? 4 : 3.2,
        'line-opacity': key === 'survey' ? 0.95 : 0.85,
        'line-dasharray': key === 'survey' ? [4, 2.4] : undefined,
        'line-gap-width': key === 'approved' ? 0 : 1,
      };
      if (key === 'survey') {
        // Proposed removals are shown in red to distinguish them from edits.
        paint['line-color'] = ['case', ['get', 'survey_removal'], '#EF4444', c.line];
      }
      map.addLayer({
        id: 'layer-' + key,
        type: 'line',
        source: sourceId,
        layout: { visibility: layerVis[key] ? 'visible' : 'none' },
        paint: paint,
      });
    }
    if (hasPoint) {
      const paint = {
        'circle-color': c.fill,
        'circle-radius': key === 'survey' ? 7 : 6,
        'circle-stroke-color': '#FFFFFF',
        'circle-stroke-width': 2,
        'circle-opacity': 0.95,
      };
      if (key === 'survey') {
        paint['circle-color'] = ['case', ['get', 'survey_removal'], '#EF4444', c.fill];
      }
      map.addLayer({
        id: 'layer-' + key + '-pts',
        type: 'circle',
        source: sourceId,
        layout: { visibility: layerVis[key] ? 'visible' : 'none' },
        paint: paint,
      });
    }
  }

  function renderApprovedLayer() {
    const layer = map.getLayer('layer-approved');
    if (layer) {
      map.removeLayer('layer-approved');
      map.removeLayer('layer-approved-pts');
      map.removeSource('src-approved');
    }
    if (!review.approved || !review.approved.features || !review.approved.features.length) return;

    map.addSource('src-approved', { type: 'geojson', data: review.approved });

    const hasLine = review.approved.features.some((f) => /line/i.test(f.geometry && f.geometry.type || ''));
    const hasPoint = review.approved.features.some((f) => /point/i.test(f.geometry && f.geometry.type || ''));

    if (hasLine) {
      map.addLayer({
        id: 'layer-approved',
        type: 'line',
        source: 'src-approved',
        layout: { visibility: layerVis.approved ? 'visible' : 'none' },
        paint: {
          'line-color': COLORS.approved.line,
          'line-width': 3.6,
          'line-opacity': 0.9,
          'line-gap-width': 0,
        },
      });
    }
    if (hasPoint) {
      map.addLayer({
        id: 'layer-approved-pts',
        type: 'circle',
        source: 'src-approved',
        layout: { visibility: layerVis.approved ? 'visible' : 'none' },
        paint: {
          'circle-color': COLORS.approved.fill,
          'circle-radius': 6.5,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2,
          'circle-opacity': 0.95,
        },
      });
    }

    // Keep the selected change's focus highlights above the refreshed layer.
    ['layer-focus-diff', 'layer-focus-survey', 'layer-focus-original',
     'layer-focus-original-pts', 'layer-focus-survey-pts', 'layer-focus-diff-pts']
      .forEach((id) => {
        if (map.getLayer(id)) { try { map.moveLayer(id); } catch (_) { /* ignore */ } }
      });
  }

  function setLayerVisible(key, visible) {
    layerVis[key] = visible;
    ['layer-' + key, 'layer-' + key + '-pts'].forEach((id) => {
      const l = map.getLayer(id);
      if (l) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    });
    const chip = legendEl.querySelector('[data-layer="' + key + '"]');
    if (chip) chip.classList.toggle('off', !visible);
  }

  function wireLayerClicks() {
    ['hld', 'survey'].forEach((key) => {
      ['layer-' + key, 'layer-' + key + '-pts'].forEach((id) => {
        if (!map.getLayer(id)) return;
        map.on('click', id, (e) => {
          const f = e.features && e.features[0];
          if (!f) return;
          const cid = f.properties && f.properties.change_id;
          if (cid) selectChange(cid);
          else showFeaturePopup(e, f);
        });
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
      });
    });
  }

  function showFeaturePopup(e, feature) {
    const props = feature.properties || {};
    let html = '<div style="font-size:12.5px;line-height:1.6;min-width:150px;">';
    ['feature_id', 'layer'].forEach((k) => {
      if (props[k] !== undefined && props[k] !== null) {
        html += '<div><strong>' + esc(k) + ':</strong> ' + esc(String(props[k])) + '</div>';
      }
    });
    html += '</div>';
    new maplibregl.Popup({ closeButton: true, maxWidth: '260px' })
      .setLngLat(e.lngLat).setHTML(html).addTo(map);
  }

  // Highlight the selected change's geometry on the map per view mode.
  function renderFocusOnMap() {
    ['focus-original', 'focus-survey', 'focus-diff'].forEach((k) => {
      ['layer-' + k, 'layer-' + k + '-pts'].forEach((id) => {
        if (map.getLayer(id)) { map.removeLayer(id); }
      });
      if (map.getSource('src-' + k)) map.removeSource('src-' + k);
    });

    if (!selectedChange) { viewModeEl.classList.remove('show'); return; }

    const orig = selectedChange.original_geometry;
    const surv = selectedChange.survey_geometry;

    if (orig || surv) viewModeEl.classList.add('show');
    else viewModeEl.classList.remove('show');

    if (viewMode === 'original' && orig) addFocusLayer('focus-original', orig, COLORS.hld, true);
    if (viewMode === 'survey' && surv) addFocusLayer('focus-survey', surv, COLORS.survey, true);

    if (viewMode === 'difference') {
      if (orig) addFocusLayer('focus-original', orig, COLORS.hld, false);
      if (surv) addFocusLayer('focus-survey', surv, COLORS.survey, false);
      const diff = differenceSegments(orig, surv);
      if (diff) addFocusLayer('focus-diff', diff, COLORS.diff, true, true);
      if (!diff && !orig && !surv) viewModeEl.classList.remove('show');
    }

    // Zoom to the change geometry.
    const geom = surv || orig;
    if (geom) fitToGeometry(geom, 200);
  }

  function addFocusLayer(key, geometry, color, thick, dashed) {
    const geojson = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: geometry, properties: {} }] };
    map.addSource('src-' + key, { type: 'geojson', data: geojson });
    const isLine = /line/i.test(geometry.type);
    const isPoint = /point/i.test(geometry.type);
    if (isLine) {
      const paint = {
        'line-color': color.line,
        'line-width': thick ? 7 : 5,
        'line-opacity': 0.95,
      };
      if (dashed) paint['line-dasharray'] = [6, 3];
      map.addLayer({ id: 'layer-' + key, type: 'line', source: 'src-' + key, paint: paint });
    } else if (isPoint) {
      map.addLayer({
        id: 'layer-' + key + '-pts',
        type: 'circle',
        source: 'src-' + key,
        paint: {
          'circle-color': color.fill,
          'circle-radius': thick ? 11 : 9,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2.5,
          'circle-opacity': 1,
        },
      });
    }
  }

  /**
   * Segments that differ between original and survey polylines, as a
   * MultiLineString. A segment "differs" when its midpoint is farther than
   * `tol` degrees from the other polyline.
   */
  function differenceSegments(orig, surv) {
    if (!orig || !surv) return null;
    const tol = 0.00012;
    const origCoords = flattenCoords(orig);
    const survCoords = flattenCoords(surv);
    if (!origCoords.length || !survCoords.length) return null;

    const diff = [];
    const collect = (coords, other) => {
      for (let i = 0; i < coords.length - 1; i++) {
        const a = coords[i], b = coords[i + 1];
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        let minDist = Infinity;
        for (let j = 0; j < other.length - 1; j++) {
          minDist = Math.min(minDist, pointSegDist(mid, other[j], other[j + 1]));
        }
        if (minDist > tol) diff.push([a, b]);
      }
    };
    collect(origCoords, survCoords);
    collect(survCoords, origCoords);
    if (!diff.length) return null;
    return { type: 'MultiLineString', coordinates: diff };
  }

  function flattenCoords(geom) {
    const t = geom.type;
    if (t === 'LineString') return geom.coordinates;
    if (t === 'MultiLineString') return geom.coordinates.reduce((a, c) => a.concat(c), []);
    if (t === 'Point') return [geom.coordinates];
    return [];
  }

  function pointSegDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const x = a[0] + t * dx, y = a[1] + t * dy;
    return Math.hypot(p[0] - x, p[1] - y);
  }

  function fitToGeometry(geom, padding) {
    const coords = flattenCoords(geom);
    if (!coords.length) return;
    const bounds = new maplibregl.LngLatBounds();
    coords.forEach((c) => bounds.extend(c));
    try { map.fitBounds(bounds, { padding: padding || 100, maxZoom: 17 }); } catch (_) { /* ignore */ }
  }

  function fitProject() {
    const all = [];
    ['hld', 'survey'].forEach((k) => {
      const gj = review.layers[k];
      if (!gj || !gj.features) return;
      gj.features.forEach((f) => {
        flattenCoords(f.geometry).forEach((c) => all.push(c));
      });
    });
    if (!all.length) return;
    const bounds = new maplibregl.LngLatBounds();
    all.forEach((c) => bounds.extend(c));
    try { map.fitBounds(bounds, { padding: 50, maxZoom: 15 }); } catch (_) { /* ignore */ }
  }

  // ==================================================================
  // Readiness
  // ==================================================================
  function computeCounts() {
    const c = { total: changes.length, approved: 0, rejected: 0, correction: 0, pending: 0 };
    changes.forEach((ch) => {
      if (ch.status === 'approved') c.approved++;
      else if (ch.status === 'rejected') c.rejected++;
      else if (ch.status === 'needs_correction') c.correction++;
      else c.pending++;
    });
    return c;
  }

  function renderReadiness() {
    const c = computeCounts();
    countTotal.textContent = c.total;
    countApproved.textContent = c.approved;
    countRejected.textContent = c.rejected;
    countCorrection.textContent = c.correction;
    countPending.textContent = c.pending;

    const resolved = c.total - c.pending;
    const pct = c.total ? Math.round((resolved / c.total) * 100) : 0;
    resolveLabel.textContent = resolved + ' of ' + c.total + ' changes resolved';
    resolveFill.style.width = pct + '%';
    const pctEl = $('resolvePct');
    if (pctEl) pctEl.textContent = pct + '%';
    const qb = $('queueBadge');
    if (qb) qb.textContent = c.total;

    const ready = c.pending === 0;
    readinessStatusEl.className = 'lld-readiness-status ' + (ready ? 'ready' : 'not-ready');
    readinessStatusEl.innerHTML = '<span class="dot"></span>' + (ready ? 'LLD READY' : 'NOT READY');

    // Approved Survey Version button
    const canCreateAs = ready && !approvedVersion;
    createAsBtn.disabled = !canCreateAs;
    createAsBtn.querySelector('.btn-label').textContent =
      approvedVersion ? 'Approved Survey Created' : 'Create Approved Survey Version';

    // Run LLD buttons (verify + full re-plan)
    const canRun = ready && !!approvedVersion;
    runLldBtn.disabled = !canRun;
    replanLldBtn.disabled = !canRun;
    runLldBtn.querySelector('.btn-label').textContent = approvedVersion
      ? 'Run LLD on ' + approvedVersion
      : 'Run LLD';
    replanLldBtn.querySelector('.btn-label').textContent = approvedVersion
      ? 'Re-plan on ' + approvedVersion
      : 'Full re-plan';

    // Approved version chip
    asChip.classList.toggle('show', !!approvedVersion);
    if (approvedVersion) {
      asChipId.textContent = approvedVersion + ' (immutable)';
    }

    // Note text
    if (!ready) {
      const remaining = c.pending;
      readinessNote.innerHTML = '<strong>LLD cannot run</strong> while <strong>' + remaining + '</strong> change' + (remaining === 1 ? ' is' : 's are') + ' pending review. Review the queue below — every change must be <strong>Approved</strong>, <strong>Rejected</strong>, or sent back for <strong>Correction</strong>.';
    } else if (!approvedVersion) {
      readinessNote.innerHTML = 'All changes resolved. Create the immutable <strong>Approved Survey Version</strong> (HLD + approved changes) before running LLD.';
    } else {
      readinessNote.innerHTML = 'Ready to generate the detailed network design from ' + approvedVersion + '. The approved survey is immutable — new corrections will require a new version.';
    }
  }

  // ==================================================================
  // Change list
  // ==================================================================
  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'pending_review', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'needs_correction', label: 'Correction' },
  ];

  function renderFilterTabs() {
    const c = computeCounts();
    filterTabs.innerHTML = '';
    FILTERS.forEach((f) => {
      const btn = document.createElement('button');
      btn.className = 'lld-filter-tab' + (filter === f.key ? ' active' : '');
      btn.type = 'button';
      const count = f.key === 'all' ? c.total
        : f.key === 'pending_review' ? c.pending
        : c[f.key] || 0;
      btn.innerHTML = esc(f.label) + ' <span class="cnt">' + count + '</span>';
      btn.addEventListener('click', () => { filter = f.key; renderFilterTabs(); renderChangeList(); });
      filterTabs.appendChild(btn);
    });
  }

  function bindSearch() {
    searchInput.addEventListener('input', () => {
      searchTerm = searchInput.value.trim().toLowerCase();
      renderChangeList();
    });
  }

  function visibleChanges() {
    let list = changes;
    if (filter !== 'all') list = list.filter((c) => c.status === filter);
    if (searchTerm) {
      list = list.filter((c) =>
        (c.change_id || '').toLowerCase().includes(searchTerm) ||
        (c.feature_id || '').toLowerCase().includes(searchTerm) ||
        (c.layer || '').toLowerCase().includes(searchTerm) ||
        (c.reason || '').toLowerCase().includes(searchTerm)
      );
    }
    return list;
  }

  function renderChangeList() {
    const list = visibleChanges();
    changeListEl.innerHTML = '';

    if (!list.length) {
      changeListEl.innerHTML = '<div class="ftth-empty-state"><div class="ftth-empty-state-icon">🗂️</div><div class="ftth-empty-state-text">No changes match this filter.</div></div>';
      return;
    }

    list.forEach((ch) => {
      const row = document.createElement('div');
      row.className = 'lld-change-row' + (selectedChange && selectedChange.change_id === ch.change_id ? ' active' : '');
      row.appendChild(statusBadge(ch.status));
      row.appendChild(typeBadge(ch.change_type));
      row.appendChild(riskBadge(ch));

      const main = document.createElement('div');
      main.className = 'lld-change-row-main';
      const title = document.createElement('div');
      title.className = 'lld-change-row-title';
      title.innerHTML = '<span>' + esc(ch.feature_id || '—') + '</span><span class="chg-id">' + esc(ch.change_id || '') + '</span>';
      const sub = document.createElement('div');
      sub.className = 'lld-change-row-sub';
      sub.textContent = (ch.layer || '') + ' · ' + (ch.engineer || '') + ' · ' + (ch.timestamp || '');
      main.appendChild(title);
      main.appendChild(sub);
      row.appendChild(main);

      const chevron = document.createElement('span');
      chevron.className = 'chevron';
      chevron.textContent = '›';
      row.appendChild(chevron);

      row.addEventListener('click', () => selectChange(ch.change_id));
      changeListEl.appendChild(row);
    });
  }

  // ==================================================================
  // Detail drawer
  // ==================================================================
  function selectChange(changeId) {
    const ch = changes.filter((c) => c.change_id === changeId)[0];
    if (!ch) return;
    selectedChange = ch;
    renderChangeList();
    renderDetail();
    detailDrawer.classList.add('open');
    renderFocusOnMap();
  }

  function closeDrawer() {
    detailDrawer.classList.remove('open');
    selectedChange = null;
    renderChangeList();
    renderFocusOnMap();
  }

  function renderDetail() {
    const ch = selectedChange;
    if (!ch) return;

    const resolved = ch.status !== 'pending_review';
    const locked = !!approvedVersion;
    const isRemoval = ch.change_type === 'removed_feature';
    const isNew = ch.change_type === 'new_feature';
    const hasAttrs = ch.attributes && ch.attributes.length;

    let html = '';

    // Header
    html += '<div class="top-row">'
      + '<h3>' + statusBadge(ch.status).outerHTML + '</h3>'
      + '<button type="button" class="lld-close-btn" id="closeDrawerBtn" aria-label="Close">✕</button>'
      + '</div>';

    // Meta grid
    html += '<div class="lld-meta-grid">'
      + meta('Feature ID', ch.feature_id || '—')
      + meta('Layer', ch.layer || '—')
      + meta('Change ID', ch.change_id || '—')
      + meta('Change Type', typeLabel(ch.change_type))
      + meta('Risk', ch.risk && ch.risk.band
          ? ch.risk.band + ' · ' + Number(ch.risk.score || 0) + '/25'
          : '—')
      + meta('Engineer', ch.engineer || '—')
      + meta('Timestamp', ch.timestamp || '—')
      + '</div>';

    // Risk factors (Tier-1 A5 — deterministic rules, shown so the reviewer
    // can see exactly why a change was ranked).
    if (ch.risk && (ch.risk.factors || []).length) {
      html += '<div class="lld-section-title">Risk Factors</div>'
        + '<ul style="margin:0;padding-left:18px;font-size:12px;color:#6B7280;">';
      ch.risk.factors.forEach(function(f) {
        html += '<li>' + esc(f) + '</li>';
      });
      html += '</ul>';
    }

    // Reason
    if (ch.reason) {
      html += '<div class="lld-section-title">Survey Engineer Note</div>'
        + '<div class="lld-reason">' + esc(ch.reason) + '</div>';
    }

    // Attribute comparison
    if (hasAttrs) {
      html += '<div class="lld-section-title">Attribute Change</div>'
        + '<table class="lld-diff-table"><thead><tr>'
        + '<th>Field</th><th>HLD Value</th><th></th><th>Survey Value</th>'
        + '</tr></thead><tbody>';
      ch.attributes.forEach((a) => {
        html += '<tr>'
          + '<td class="field">' + esc(a.field) + '</td>'
          + '<td class="old-val">' + esc(a.hld_value) + '</td>'
          + '<td class="arrow">→</td>'
          + '<td class="new-val">' + esc(a.survey_value)
          + (a.reason ? '<span class="attr-reason">' + esc(a.reason) + '</span>' : '')
          + '</td></tr>';
      });
      html += '</tbody></table>';
    }

    // Geometry comparison (line/point changes with a survey geometry)
    const showGeom = (ch.original_geometry && ch.survey_geometry) || (isNew && ch.survey_geometry) || (isRemoval && ch.original_geometry);
    if (showGeom) {
      html += '<div class="lld-geom-compare">'
        + '<div class="lld-section-title">' + (isNew ? 'New Feature Geometry' : isRemoval ? 'Feature to Remove' : 'Geometry Change') + '</div>'
        + '<div class="lld-geom-mode-tabs" id="geomTabs">'
        + '<button type="button" class="lld-geom-mode-tab" data-mode="original">Original</button>'
        + '<button type="button" class="lld-geom-mode-tab" data-mode="survey">Survey</button>'
        + '<button type="button" class="lld-geom-mode-tab active" data-mode="difference">Difference</button>'
        + '</div>'
        + '<div class="lld-geom-legend">'
        + '<span><span class="sw" style="background:#3B82F6;"></span>HLD</span>'
        + '<span><span class="sw" style="background:#F97316;"></span>Survey</span>'
        + '<span><span class="sw" style="background:repeating-linear-gradient(90deg,#EF4444 0 4px,transparent 4px 7px);"></span>Difference</span>'
        + '</div>'
        + '<svg class="lld-svg-compare" id="geomSvg" viewBox="0 0 320 120" preserveAspectRatio="xMidYMid meet"></svg>'
        + '</div>';
    }

    // Evidence
    if (ch.evidence && (ch.evidence.photos || ch.evidence.notes)) {
      html += '<div class="lld-section-title">Survey Evidence</div><div class="lld-evidence">';
      if (ch.evidence.photos) {
        html += '<span class="lld-evidence-chip">📷 ' + ch.evidence.photos + ' photo' + (ch.evidence.photos > 1 ? 's' : '') + '</span>';
      }
      if (ch.evidence.notes) {
        html += '<span class="lld-evidence-chip">📝 ' + esc(ch.evidence.notes) + '</span>';
      }
      html += '</div>';
    }

    // Review comments
    if (ch.comments && ch.comments.length) {
      html += '<div class="lld-section-title">Review History</div><div class="lld-comment-list">';
      ch.comments.forEach((c) => {
        html += '<div class="lld-comment">'
          + '<span class="avatar">' + esc((c.by || '?').charAt(0)) + '</span>'
          + '<div class="body"><div class="who">' + esc(c.by || 'Reviewer') + '<span class="when">' + esc(c.timestamp || '') + '</span></div>'
          + '<div class="text">' + esc(c.text) + '</div></div></div>';
      });
      html += '</div>';
    }

    // Actions
    if (resolved) {
      const noteClass = ch.status === 'approved' ? 'approved' : ch.status === 'rejected' ? 'rejected' : 'correction';
      const noteText = ch.status === 'approved'
        ? '✓ Approved — this change is part of the Approved Survey dataset.'
        : ch.status === 'rejected'
          ? '✕ Rejected — this change will NOT be part of the Approved Survey.'
          : '↻ Needs Correction — survey engineer must revise this change.';
      html += '<div class="lld-resolved-note ' + noteClass + '">' + noteText + '</div>';
    } else if (locked) {
      html += '<div class="lld-resolved-note locked">🔒 Review locked — Approved Survey ' + esc(approvedVersion) + ' is immutable. Further changes require a new review cycle (new version).</div>';
    } else {
      html += '<div class="lld-action-area">'
        + '<div class="lld-section-title">Review Decision</div>'
        + '<textarea class="lld-comment-input" id="reviewComment" placeholder="Add a review comment (required for reject / correction)…"></textarea>'
        + '<div class="lld-action-btns">'
        + '<button type="button" class="lld-action-btn lld-action-approve" data-action="approve">✓ Approve</button>'
        + '<button type="button" class="lld-action-btn lld-action-reject" data-action="reject">✕ Reject</button>'
        + '<button type="button" class="lld-action-btn lld-action-correction" data-action="correction">↻ Correction</button>'
        + '</div></div>';
    }

    drawerBody.innerHTML = html;

    const closeBtn = $('closeDrawerBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

    // Geom tabs + SVG
    const geomTabs = $('geomTabs');
    if (geomTabs) {
      geomTabs.querySelectorAll('.lld-geom-mode-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          geomTabs.querySelectorAll('.lld-geom-mode-tab').forEach((t) => t.classList.remove('active'));
          tab.classList.add('active');
          geomMode = tab.dataset.mode;
          renderGeomSvg();
        });
      });
      renderGeomSvg();
    }

    // Action buttons
    drawerBody.querySelectorAll('.lld-action-btn').forEach((btn) => {
      btn.addEventListener('click', () => submitAction(btn.dataset.action));
    });
  }

  function meta(k, v) {
    return '<div class="lld-meta-item"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>';
  }

  function typeLabel(t) {
    return {
      geometry: 'Geometry',
      attribute: 'Attribute',
      new_feature: 'New Feature',
      removed_feature: 'Removed Feature',
    }[t] || t;
  }

  // SVG sketch comparing original vs survey geometry.
  function renderGeomSvg() {
    const svg = $('geomSvg');
    if (!svg) return;
    const ch = selectedChange;
    const W = 320, H = 120, pad = 16;
    const orig = ch.original_geometry;
    const surv = ch.survey_geometry;

    const allCoords = [];
    if (orig) flattenCoords(orig).forEach((c) => allCoords.push(c));
    if (surv) flattenCoords(surv).forEach((c) => allCoords.push(c));
    if (!allCoords.length) return;

    const lngs = allCoords.map((c) => c[0]);
    const lats = allCoords.map((c) => c[1]);
    const minLng = Math.min.apply(null, lngs), maxLng = Math.max.apply(null, lngs);
    const minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
    const spanX = (maxLng - minLng) || 0.0001;
    const spanY = (maxLat - minLat) || 0.0001;
    const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
    const ox = (W - spanX * scale) / 2, oy = (H + spanY * scale) / 2;

    const proj = (c) => [ox + (c[0] - minLng) * scale, oy - (c[1] - minLat) * scale];

    const pathFor = (geom) => {
      const coords = flattenCoords(geom);
      if (!coords.length) return '';
      const pts = coords.map(proj);
      if (coords.length === 1) return '';
      return pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    };
    const circleFor = (geom, color) => {
      const coords = flattenCoords(geom);
      if (!coords.length) return '';
      const p = proj(coords[0]);
      return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="6" fill="' + color + '" stroke="#FFF" stroke-width="2"/>';
    };

    let inner = '<rect x="1" y="1" width="' + (W - 2) + '" height="' + (H - 2) + '" fill="#0B1020"/>';

    // Grid lines
    for (let gx = pad; gx < W - pad; gx += 32) {
      inner += '<line x1="' + gx + '" y1="' + pad + '" x2="' + gx + '" y2="' + (H - pad) + '" stroke="#1F2937" stroke-width="1"/>';
    }
    for (let gy = pad; gy < H - pad; gy += 32) {
      inner += '<line x1="' + pad + '" y1="' + gy + '" x2="' + (W - pad) + '" y2="' + gy + '" stroke="#1F2937" stroke-width="1"/>';
    }

    const showOrig = geomMode === 'original' || geomMode === 'difference';
    const showSurv = geomMode === 'survey' || geomMode === 'difference';

    if (showSurv && surv) {
      const p = pathFor(surv);
      if (p) inner += '<path d="' + p + '" fill="none" stroke="#F97316" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>';
      inner += circleFor(surv, '#F97316');
    }
    if (showOrig && orig) {
      const p = pathFor(orig);
      if (p) inner += '<path d="' + p + '" fill="none" stroke="#3B82F6" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>';
      inner += circleFor(orig, '#3B82F6');
    }

    // Difference segments
    if (geomMode === 'difference') {
      const diff = differenceSegments(orig, surv);
      if (diff && diff.coordinates) {
        diff.coordinates.forEach((seg) => {
          const a = proj(seg[0]), b = proj(seg[1]);
          inner += '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" stroke="#EF4444" stroke-width="3" stroke-dasharray="5,3" stroke-linecap="round"/>';
        });
      }
      // Point relocation: connect the two positions with a red dashed line.
      const oc = orig ? flattenCoords(orig) : [];
      const sc = surv ? flattenCoords(surv) : [];
      if (oc.length === 1 && sc.length === 1) {
        const a = proj(oc[0]), b = proj(sc[0]);
        inner += '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" stroke="#EF4444" stroke-width="2" stroke-dasharray="4,3" stroke-linecap="round"/>';
      }
    }

    svg.innerHTML = inner;
  }

  // ==================================================================
  // Review actions
  // ==================================================================
  async function submitAction(action) {
    if (!selectedChange) return;
    const commentEl = $('reviewComment');
    const comment = commentEl ? commentEl.value : '';

    if ((action === 'reject' || action === 'correction') && !comment.trim()) {
      alert('Please add a review comment so the survey engineer understands why.');
      return;
    }

    const btns = drawerBody.querySelectorAll('.lld-action-btn');
    btns.forEach((b) => { b.disabled = true; });

    try {
      await window.FtthLldApi.submitAction(projectId, selectedChange.change_id, action, comment);

      // Always refetch so the page reflects the persisted review state.
      review = await window.FtthLldApi.loadReview(projectId);
      changes = review.changes || [];
      if (selectedChange) {
        selectedChange = changes.filter((c) => c.change_id === selectedChange.change_id)[0] || null;
      }

      renderApprovedLayer();
      renderReadiness();
      renderFilterTabs();
      renderChangeList();
      renderDetail();
    } catch (err) {
      alert('Action failed: ' + (err.message || err));
      btns.forEach((b) => { b.disabled = false; });
    }
  }

  // ==================================================================
  // Approved Survey Version + Run LLD
  // ==================================================================
  createAsBtn.addEventListener('click', async () => {
    const c = computeCounts();
    if (c.pending > 0 || c.correction > 0) return;
    createAsBtn.disabled = true;
    createAsBtn.classList.add('loading');

    try {
      const res = await window.FtthLldApi.createApprovedVersion(projectId);
      approvedVersion = res.approved_survey_version || res.id || 'AS-V01';
      if (res.features) review.approved = res.features;
      renderApprovedLayer();
      renderReadiness();
      renderDetail(); // shows the locked state in the drawer
      mapLoading.style.display = 'flex';
      mapLoading.innerHTML = '<p style="color:#059669;font-size:15px;font-weight:600;">✅ Approved Survey ' + esc(approvedVersion) + ' created — ' + esc(review.approved ? review.approved.features.length : 0) + ' features. Run LLD when ready.</p>';
      setTimeout(() => { mapLoading.style.display = 'none'; }, 2600);
    } catch (err) {
      alert('Could not create Approved Survey Version: ' + (err.message || err));
      createAsBtn.disabled = false;
    } finally {
      createAsBtn.classList.remove('loading');
    }
  });

  function startLld(mode) {
    if (!approvedVersion) return;
    const btn = mode === 'replan' ? replanLldBtn : runLldBtn;
    const other = mode === 'replan' ? runLldBtn : replanLldBtn;
    const verb = mode === 'replan' ? 'Full re-plan' : 'LLD';
    const confirmMsg = mode === 'replan'
      ? 'Run a FULL RE-PLAN? This re-runs the routing algorithm with the approved survey as brownfield and takes 10–40 minutes. Only needed for structural changes (moved PDP, re-zoning, aerial conversion).'
      : 'Run LLD on ' + approvedVersion + '? (applies survey changes to the HLD design — fast)';
    if (!confirm(confirmMsg)) return;
    btn.disabled = true;
    other.disabled = true;
    btn.classList.add('loading');
    btn.querySelector('.btn-label').textContent = mode === 'replan' ? 'Re-planning…' : 'Starting LLD…';

    (async () => {
      try {
        const res = await window.FtthLldApi.runLld(projectId, mode);
        const ver = res.lld_version || 'LLD-V01';
        const label = mode === 'replan' ? 're-plan' : 'LLD';
        mapLoading.style.display = 'flex';
        mapLoading.innerHTML = '<div style="text-align:center;"><p style="color:#059669;font-size:15px;font-weight:600;margin-bottom:8px;">🚀 ' + (mode === 'replan' ? 'Full re-plan' : 'LLD') + ' ' + esc(ver) + ' started on ' + esc(approvedVersion) + '</p>'
          + '<a href="ftth-lld-versions.html?project_id=' + encodeURIComponent(projectId) + '" style="display:inline-block;padding:9px 18px;background:#059669;color:#FFF;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;">View LLD Versions →</a></div>';
        btn.querySelector('.btn-label').textContent = label;
      } catch (err) {
        alert('Run ' + verb + ' failed: ' + (err.message || err));
        btn.querySelector('.btn-label').textContent = mode === 'replan' ? 'Full re-plan' : 'Run LLD on ' + approvedVersion;
      } finally {
        btn.classList.remove('loading');
        const canRun = ready && !!approvedVersion;
        btn.disabled = !canRun;
        other.disabled = !canRun;
      }
    })();
  }

  runLldBtn.addEventListener('click', () => startLld('verify'));
  replanLldBtn.addEventListener('click', () => startLld('replan'));

  // ==================================================================
  // Legend + view mode + basemap
  // ==================================================================
  function bindLegend() {
    legendEl.innerHTML = '';
    [
      { key: 'hld', label: 'HLD', color: COLORS.hld.line, dot: false },
      { key: 'survey', label: 'Survey', color: COLORS.survey.line, dot: false },
      { key: 'approved', label: 'Approved', color: COLORS.approved.line, dot: false },
      { key: 'diff', label: 'Difference', color: null, dot: false, dash: true },
    ].forEach((item) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'lld-legend-chip';
      chip.dataset.layer = item.key;
      chip.title = 'Toggle ' + item.label;
      if (item.dash) {
        chip.innerHTML = '<span class="sw dash"></span>' + item.label;
      } else {
        chip.innerHTML = '<span class="sw" style="background:' + item.color + ';"></span>' + item.label;
      }
      chip.addEventListener('click', () => {
        if (item.key === 'diff') return; // informational only
        setLayerVisible(item.key, !layerVis[item.key]);
      });
      legendEl.appendChild(chip);
    });
  }

  function bindViewMode() {
    viewModeEl.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        viewMode = btn.dataset.mode;
        viewModeEl.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        renderFocusOnMap();
      });
    });
  }

  function initBasemapSwitcher() {
    const switcher = $('basemapSwitcher');
    if (!switcher) return;
    switcher.querySelectorAll('.ftth-basemap-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        switcher.querySelectorAll('.ftth-basemap-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        setBasemap(btn.dataset.basemap);
      });
    });
  }

  // ==================================================================
  // Helpers
  // ==================================================================
  function statusBadge(status) {
    const s = status || 'pending_review';
    const map = {
      pending_review: { label: 'Pending Review', cls: 'lld-badge-pending' },
      approved: { label: 'Approved', cls: 'lld-badge-approved' },
      rejected: { label: 'Rejected', cls: 'lld-badge-rejected' },
      needs_correction: { label: 'Needs Correction', cls: 'lld-badge-correction' },
    };
    const m = map[s] || map.pending_review;
    const el = document.createElement('span');
    el.className = 'lld-badge ' + m.cls;
    el.innerHTML = '<span class="dot"></span>' + m.label;
    return el;
  }

  function typeBadge(t) {
    const map = {
      geometry: 'lld-type-geometry',
      attribute: 'lld-type-attribute',
      new_feature: 'lld-type-new',
      removed_feature: 'lld-type-removed',
    };
    const el = document.createElement('span');
    el.className = 'lld-type-badge ' + (map[t] || 'lld-type-geometry');
    el.textContent = typeLabel(t);
    return el;
  }

  // Tier-1 A5 — change risk badge (deterministic severity × likelihood × LLD impact).
  function riskBadge(ch) {
    const r = ch && ch.risk;
    const el = document.createElement('span');
    if (!r || (!r.band && !r.score)) {
      el.className = 'lld-risk-badge lld-risk-unknown';
      el.textContent = 'RISK —';
      return el;
    }
    const band = r.band || 'low';
    el.className = 'lld-risk-badge lld-risk-' + band;
    el.textContent = 'RISK ' + band + ' · ' + Number(r.score || 0);
    const factors = (r.factors || []).join(' · ');
    el.title = factors || ('severity=' + (r.severity || '?')
      + ' × likelihood=' + (r.likelihood || 0)
      + ' × lld_impact=' + (r.lld_impact || 0));
    return el;
  }

  function esc(str) {
    return String(str === undefined || str === null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  boot();
})();
