/**
 * FTTH HLD — MapLibre GL Map Integration
 *
 * Handles map initialization, adding GeoJSON sources/layers from the
 * pipeline results, layer visibility toggling, and base map switching.
 *
 * Requires: maplibregl from MapLibre CDN
 *   <script src="vendor/maplibre/maplibre-gl.js"></script>
 *   <link href="vendor/maplibre/maplibre-gl.css" rel="stylesheet" />
 */

(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Base map style definitions
  // ------------------------------------------------------------------
  const BASE_STYLES = {
    streets: {
      name: 'Streets',
      icon: '🗺️',
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
    },
    light: {
      name: 'Light', icon: '🌙',
      style: {
        version: 8, sources: { 'carto-light': { type: 'raster', tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png'], tileSize: 256, attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/">CARTO</a>' } },
        layers: [{ id: 'basemap-raster', type: 'raster', source: 'carto-light', minzoom: 0, maxzoom: 20 }],
      },
    },
    satellite: {
      name: 'Satellite', icon: '🛰️',
      style: {
        version: 8, sources: { 'esri-satellite': { type: 'raster', tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: '© <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics' } },
        layers: [{ id: 'basemap-raster', type: 'raster', source: 'esri-satellite', minzoom: 0, maxzoom: 19 }],
      },
    },
    dark: {
      name: 'Dark', icon: '🌑',
      style: {
        version: 8, sources: { 'carto-dark': { type: 'raster', tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'], tileSize: 256, attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/">CARTO</a>' } },
        layers: [{ id: 'basemap-raster', type: 'raster', source: 'carto-dark', minzoom: 0, maxzoom: 20 }],
      },
    },
  };

  // ------------------------------------------------------------------
  // Color palette for pipeline output layers
  // lineDash: [] = solid, [a,b] = dashed (a=stroke len, b=gap len)
  // ------------------------------------------------------------------
  const LAYER_COLORS = {
    polygons: {
      fill: '#00aa88', fillFlagged: '#ff4444', outline: '#006644', opacity: 0.3, label: 'Coverage Areas',
    },
    trenches: {
      fill: '#3B82F6', outline: '#1D4ED8', opacity: 0.6, lineWidth: 3, lineDash: [], label: 'Trench Routes',
    },
    feeder_cable: {
      fill: '#EF4444', outline: '#B91C1C', opacity: 0.7, lineWidth: 4.5, lineDash: [], label: 'Feeder Cable',
    },
    distribution_cable: {
      fill: '#F97316', outline: '#C2410C', opacity: 0.7, lineWidth: 3, lineDash: [5, 3], label: 'Distribution Cable',
    },
    feeder_ducts: {
      fill: '#F59E0B', outline: '#B45309', opacity: 0.6, lineWidth: 4.5, lineDash: [], label: 'Feeder Ducts',
    },
    distribution_ducts: {
      fill: '#EAB308', outline: '#A16207', opacity: 0.6, lineWidth: 3, lineDash: [7, 3], label: 'Distribution Ducts',
    },
    drop_ducts: {
      fill: '#EC4899', outline: '#9D174D', opacity: 0.6, lineWidth: 2.5, lineDash: [2, 2], label: 'Drop Ducts',
    },
    objects: {
      fill: '#8B5CF6', outline: '#5B21B6', opacity: 0.4, label: 'Objects',
    },
    pdps: {
      fill: '#06B6D4', outline: '#0891B2', opacity: 0.7, lineWidth: 5, lineDash: [], label: 'PDPs',
    },
    mfg: {
      fill: '#10B981', outline: '#047857', opacity: 0.7, lineWidth: 5, lineDash: [], label: 'MFG',
    },
    buildings: {
      fill: '#8B5CF6', outline: '#5B21B6', opacity: 0.4, label: 'Buildings',
    },
    brownfield: {
      fill: '#64748B', outline: '#94A3B8', opacity: 0.7, lineWidth: 2.5, lineDash: [], pointRadius: 7, label: 'Existing Infrastructure',
    },
    default: {
      fill: '#6B7280', outline: '#374151', opacity: 0.4, label: 'Layer',
    },
    // Sub-layer color map used when a group GeoJSON is tagged per-feature with
    // a `sublayer` property (merged feeder/distribution/drop ducts, etc.)
    SUBLAYER_COLORS: {
      'Feeder_Ducts': '#F59E0B',
      'Distribution_Ducts': '#EAB308',
      'Drop_Ducts': '#EC4899',
      'Feeder_Cable': '#EF4444',
      'Distribution_Cable': '#F97316',
    },
    // Shades of the same base colour: used to differentiate asset types
    // inside the merged brownfield layer (all pre-existing infra, one toggle).
    ASSET_TYPE_COLORS: {
      'duct': '#64748B',
      'trench': '#94A3B8',
      'fibre': '#7D8BA6',
      'feeder_trench': '#9AA7B8',
      'distribution_trench': '#8A99AD',
      'chamber': '#475569',
      'pole': '#A8B4C4',
      'cabinet': '#5B6B7E',
      'pdp': '#3F4D61',
      'mfg': '#334155',
    },
  };

  // ------------------------------------------------------------------
  // Map instance registry
  // ------------------------------------------------------------------
  const _maps = {};

  // Identify/highlight mode. When active, layer clicks highlight the clicked
  // feature on a dedicated highlight layer and hand it to the page callback
  // (full attribute table) instead of showing the small default popup.
  let _identifyActive = false;
  let _identifyCallback = null;

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  function _addAllBaseLayers(map, active) {
    var keys = Object.keys(BASE_STYLES);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var bs = BASE_STYLES[key];
      var srcKey = Object.keys(bs.style.sources)[0];
      var src = bs.style.sources[srcKey];
      var sourceId = 'basemap-src-' + key;
      var layerId = 'basemap-layer-' + key;
      map.addSource(sourceId, { type: 'raster', tiles: src.tiles, tileSize: src.tileSize || 256, attribution: src.attribution || '' });
      map.addLayer({ id: layerId, type: 'raster', source: sourceId, minzoom: 0, maxzoom: 22, layout: { visibility: key === active ? 'visible' : 'none' } });
    }
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  function getBaseStyles() {
    var result = {};
    var keys = Object.keys(BASE_STYLES);
    for (var i = 0; i < keys.length; i++) { var key = keys[i]; result[key] = { name: BASE_STYLES[key].name, icon: BASE_STYLES[key].icon }; }
    return result;
  }

  function initMap(container, opts) {
    if (typeof maplibregl === 'undefined') { throw new Error('MapLibre GL JS is not loaded. Include the CDN script.'); }
    var id = (opts && opts.id) || 'main';
    var center = (opts && opts.center) || [13.405, 52.52];
    var zoom = (opts && opts.zoom) || 11;
    var basemap = (opts && opts.basemap) || 'streets';
    var onLoad = opts && opts.onLoad;
    if (!BASE_STYLES[basemap]) basemap = 'streets';
    var el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) throw new Error('Map container element not found: ' + container);
    var map = new maplibregl.Map({ container: el, style: { version: 8, sources: {}, layers: [] }, center: center, zoom: zoom });
    map.addControl(new maplibregl.NavigationControl(), 'top-left');
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    map.on('load', function () { _addAllBaseLayers(map, basemap); if (typeof onLoad === 'function') { onLoad(map); } });
    if (map.loaded()) { _addAllBaseLayers(map, basemap); if (typeof onLoad === 'function') { onLoad(map); } }
    _maps[id] = map;
    return map;
  }

  function getMap(id) { return _maps[id || 'main']; }

  function setBaseStyle(map, styleName) {
    if (!map || !BASE_STYLES[styleName]) return;
    var keys = Object.keys(BASE_STYLES);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var layerId = 'basemap-layer-' + key;
      if (map.getLayer(layerId)) { map.setLayoutProperty(layerId, 'visibility', key === styleName ? 'visible' : 'none'); }
    }
  }

  function addGeoJSONLayer(map, layerId, geojson, opts) {
    if (!map || !layerId || !geojson) return null;

    opts = opts || {};
    var palette = LAYER_COLORS[layerId] || LAYER_COLORS.default;

    var fillColor = opts.fillColor || palette.fill;
    var fillFlagged = opts.fillFlagged || palette.fillFlagged || fillColor;
    var outlineColor = opts.outlineColor || palette.outline;
    var fillOpacity = opts.fillOpacity !== undefined ? opts.fillOpacity : palette.opacity;
    var visible = opts.visible !== false;
    var flagField = opts.flagField;
    var flagValue = opts.flagValue;

    var sourceId = 'ftth-source-' + layerId;
    var fillLayerId = 'ftth-fill-' + layerId;
    var outlineLayerId = 'ftth-outline-' + layerId;
    var pointsLayerId = 'ftth-points-' + layerId;

    if (map.getSource(sourceId)) return { sourceId: sourceId, fillLayerId: fillLayerId, outlineLayerId: outlineLayerId, pointsLayerId: pointsLayerId };

    // Scan ALL features: a merged group (e.g. brownfield lines + points) can
    // mix geometry types — MapLibre only renders features matching the layer
    // type, so we must add one layer per geometry type present.
    var hasPolygon = false, hasLine = false, hasPoint = false;
    (geojson.features || []).forEach(function (feat) {
      var t = feat && feat.geometry && feat.geometry.type;
      if (!t) return;
      if (t.toLowerCase().indexOf('polygon') !== -1) { hasPolygon = true; return; }
      if (t === 'LineString' || t === 'MultiLineString' || t.toLowerCase().indexOf('line') !== -1) { hasLine = true; return; }
      if (t === 'Point' || t === 'MultiPoint') { hasPoint = true; }
    });

    // If features carry an ASSET_TYPE field, build a per-type colour map using
    // shades of the group colour (e.g. all brownfield assets in one hue family).
    // A MapLibre `match` expression needs at least one value/output pair — when
    // no feature has the field, keep the plain group colour instead of building
    // an invalid expression (MapLibre throws and the whole layer is dropped).
    var typeMatch = null;
    if (opts.assetTypeField) {
      var tm = ['match', ['get', opts.assetTypeField]];
      var usedTypes = {};
      (geojson.features || []).forEach(function (feat) {
        var val = feat.properties && feat.properties[opts.assetTypeField];
        if (!val) return;
        var c = LAYER_COLORS.ASSET_TYPE_COLORS[val] || fillColor;
        if (!usedTypes[val]) { tm.push(val, c); usedTypes[val] = true; }
      });
      if (Object.keys(usedTypes).length > 0) {
        tm.push(fillColor);
        typeMatch = tm;
      }
    }

    // Permit-status colouring: per-feature colours keyed by a property that
    // the caller injects (e.g. 'permit_status'). Takes precedence over the
    // asset-type/sublayer matches since it is the most specific signal.
    var permitMatch = null;
    if (opts.permitField && opts.permitColors) {
      var pm = ['match', ['get', opts.permitField]];
      var usedPermit = {};
      (geojson.features || []).forEach(function (feat) {
        var val = feat.properties && feat.properties[opts.permitField];
        if (!val) return;
        var c = opts.permitColors[val] || fillColor;
        if (!usedPermit[val]) { pm.push(val, c); usedPermit[val] = true; }
      });
      if (Object.keys(usedPermit).length > 0) {
        pm.push(fillColor);
        permitMatch = pm;
      }
    }

    map.addSource(sourceId, { type: 'geojson', data: geojson });
    var renderedLayers = [];

    if (hasPolygon) {
      var fillPaint = { 'fill-opacity': fillOpacity };
      if (flagField) { fillPaint['fill-color'] = ['match', ['get', flagField], flagValue, fillFlagged, fillColor]; }
      else if (permitMatch) { fillPaint['fill-color'] = permitMatch; }
      else if (typeMatch) { fillPaint['fill-color'] = typeMatch; }
      else { fillPaint['fill-color'] = fillColor; }
      map.addLayer({ id: fillLayerId, type: 'fill', source: sourceId, paint: fillPaint, layout: { visibility: visible ? 'visible' : 'none' } });
      map.addLayer({ id: outlineLayerId, type: 'line', source: sourceId, paint: { 'line-color': outlineColor, 'line-width': 2 }, layout: { visibility: visible ? 'visible' : 'none' } });
      renderedLayers.push(fillLayerId, outlineLayerId);
    }

    if (hasLine) {
      var linePaint = {
        'line-color': fillColor,
        'line-width': palette.lineWidth !== undefined ? palette.lineWidth : 3,
        'line-opacity': fillOpacity + 0.2,
      };
      if (permitMatch) {
        linePaint['line-color'] = permitMatch;
      } else if (typeMatch) {
        linePaint['line-color'] = typeMatch;
      } else if (opts.sublayerField) {
        // If the GeoJSON features carry a `sublayer` property (merged group
        // layer), color each sub-layer differently using a match expression.
        // Only build the expression when at least one feature actually has a
        // value — data served from PostGIS has no sublayer property, and an
        // empty `match` makes MapLibre drop the layer entirely.
        var matchColor = ['match', ['get', opts.sublayerField]];
        var used = {};
        (geojson.features || []).forEach(function (feat) {
          var val = feat.properties && feat.properties[opts.sublayerField];
          if (!val) return;
          var subColor = LAYER_COLORS.SUBLAYER_COLORS[val] || fillColor;
          if (!used[val]) { matchColor.push(val, subColor); used[val] = true; }
        });
        if (Object.keys(used).length > 0) {
          matchColor.push(fillColor);
          linePaint['line-color'] = matchColor;
        }
      }
      if (palette.lineDash && palette.lineDash.length > 0) {
        linePaint['line-dasharray'] = palette.lineDash;
      }
      map.addLayer({ id: fillLayerId, type: 'line', source: sourceId, paint: linePaint, layout: { visibility: visible ? 'visible' : 'none' } });
      renderedLayers.push(fillLayerId);
    }

    if (hasPoint) {
      var pointRadius = palette.pointRadius !== undefined ? palette.pointRadius : 5;
      var circlePaint = { 'circle-color': typeMatch || fillColor, 'circle-radius': pointRadius, 'circle-opacity': 0.85, 'circle-stroke-color': outlineColor, 'circle-stroke-width': 1 };
      map.addLayer({ id: pointsLayerId, type: 'circle', source: sourceId, paint: circlePaint, layout: { visibility: visible ? 'visible' : 'none' } });
      renderedLayers.push(pointsLayerId);
    }

    renderedLayers.forEach(function (lid) {
      map.on('click', lid, function (e) {
        if (!e.features || !e.features[0]) return;
        var feature = e.features[0];
        var props = feature.properties || {};
        var coords = e.lngLat;

        // Identify mode: highlight the feature on the dedicated highlight
        // layer and let the page render the full attribute table. Only the
        // fill/points layer of a geometry group does the highlight so the
        // outline layer (same source) does not re-fire it.
        if (_identifyActive) {
          var publicLayerId = lid.replace(/^ftth-(fill|outline|points)-/, '');
          if (lid.indexOf('ftth-fill-') === 0 || lid.indexOf('ftth-points-') === 0) {
            highlightFeatureData(map, feature);
            if (typeof _identifyCallback === 'function') {
              _identifyCallback(feature, publicLayerId, coords);
            }
          }
          return;
        }

        var html = '<div style="font-size:13px;line-height:1.5;max-width:280px;">';
        var keys = Object.keys(props).slice(0, 12);
        keys.forEach(function (k) {
          if (props[k] === null || props[k] === undefined) return;
          html += '<div><strong>' + escapeHtmlProp(k) + ':</strong> ' + escapeHtmlProp(String(props[k])) + '</div>';
        });
        html += '</div>';
        new maplibregl.Popup({ closeButton: true, maxWidth: '320px' }).setLngLat(coords).setHTML(html).addTo(map);
      });
      map.on('mouseenter', lid, function () { map.getCanvas().style.cursor = _identifyActive ? 'crosshair' : 'pointer'; });
      map.on('mouseleave', lid, function () { map.getCanvas().style.cursor = ''; });
    });

    return { sourceId: sourceId, fillLayerId: fillLayerId, outlineLayerId: outlineLayerId, pointsLayerId: pointsLayerId };
  }

  function setLayerVisible(map, layerId, visible) {
    if (!map) return;
    var visibility = visible ? 'visible' : 'none';
    var fillLayer = 'ftth-fill-' + layerId;
    var outlineLayer = 'ftth-outline-' + layerId;
    var pointsLayer = 'ftth-points-' + layerId;
    if (map.getLayer(fillLayer)) { map.setLayoutProperty(fillLayer, 'visibility', visibility); }
    if (map.getLayer(outlineLayer)) { map.setLayoutProperty(outlineLayer, 'visibility', visibility); }
    if (map.getLayer(pointsLayer)) { map.setLayoutProperty(pointsLayer, 'visibility', visibility); }
  }

  /**
   * Toggle identify/highlight mode. While active, clicking a design feature
   * paints it on a bright highlight layer above everything and calls
   * onSelect(feature, layerName, lngLat) instead of the small popup.
   */
  function setIdentifyActive(map, active, onSelect) {
    _identifyActive = !!active;
    _identifyCallback = typeof onSelect === 'function' ? onSelect : null;
    if (map) {
      map.getCanvas().style.cursor = active ? 'crosshair' : '';
      if (!active) { clearHighlightLayer(map); }
    }
  }

  function isIdentifyActive() { return _identifyActive; }

  /** Idempotent: create the bright highlight source + layers above the data. */
  function ensureHighlightLayer(map) {
    if (!map || map.getSource('ftth-highlight-src')) return;
    map.addSource('ftth-highlight-src', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addLayer({
      id: 'ftth-highlight-fill', type: 'fill', source: 'ftth-highlight-src',
      paint: { 'fill-color': '#FDE047', 'fill-opacity': 0.40 },
    });
    map.addLayer({
      id: 'ftth-highlight-line', type: 'line', source: 'ftth-highlight-src',
      paint: { 'line-color': '#FFD600', 'line-width': 6, 'line-opacity': 0.95 },
    });
    map.addLayer({
      id: 'ftth-highlight-points', type: 'circle', source: 'ftth-highlight-src',
      paint: {
        'circle-color': '#FFD600', 'circle-radius': 10, 'circle-opacity': 0.95,
        'circle-stroke-color': '#000000', 'circle-stroke-width': 1.5,
      },
    });
  }

  /** Paint the clicked feature on the highlight layer. */
  function highlightFeatureData(map, feature) {
    if (!map || !feature || !feature.geometry) return;
    ensureHighlightLayer(map);
    var src = map.getSource('ftth-highlight-src');
    if (src) {
      src.setData({ type: 'FeatureCollection', features: [feature] });
    }
  }

  /** Clear the highlight layer (kept around, just emptied). */
  function clearHighlightLayer(map) {
    if (!map || !map.getSource || !map.getSource('ftth-highlight-src')) return;
    map.getSource('ftth-highlight-src').setData({ type: 'FeatureCollection', features: [] });
  }

  function fitToLayers(map, padding) {
    if (!map) return;
    var bounds = new maplibregl.LngLatBounds();
    var hasBounds = false;
    map.getStyle().layers.forEach(function (layer) {
      if (layer.id.indexOf('ftth-') !== 0) return;
      var source = map.getSource(layer.source);
      if (!source || !source._data) return;
      var data = source._data;
      if (data.features) {
        data.features.forEach(function (f) {
          if (f.geometry && f.geometry.coordinates) {
            var bbox = featureBounds(f);
            if (bbox) { bounds.extend(bbox.getSouthWest()); bounds.extend(bbox.getNorthEast()); hasBounds = true; }
          }
        });
      }
    });
    if (hasBounds) { map.fitBounds(bounds, { padding: padding || 40, maxZoom: 18 }); }
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  function escapeHtmlProp(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function featureBounds(feature) {
    if (!feature || !feature.geometry) return null;
    var coords = feature.geometry.coordinates;
    if (!coords || !coords.length) return null;
    var type = feature.geometry.type;
    var points = [];
    if (type === 'Point') { points = [coords]; }
    else if (type === 'MultiPoint' || type === 'LineString') { points = coords; }
    else if (type === 'MultiLineString' || type === 'Polygon') { points = coords[0] || []; }
    else if (type === 'MultiPolygon') { points = (coords[0] && coords[0][0]) || []; }
    if (!points.length) return null;
    var fBounds = new maplibregl.LngLatBounds();
    points.forEach(function (p) { if (p.length >= 2) fBounds.extend(p); });
    return fBounds;
  }

  // ------------------------------------------------------------------
  // Exports
  // ------------------------------------------------------------------

  window.FtthMap = {
    initMap: initMap, getMap: getMap, addGeoJSONLayer: addGeoJSONLayer,
    setLayerVisible: setLayerVisible, fitToLayers: fitToLayers,
    getBaseStyles: getBaseStyles, setBaseStyle: setBaseStyle,
    SUBLAYER_COLORS: LAYER_COLORS.SUBLAYER_COLORS,
    setIdentifyActive: setIdentifyActive, isIdentifyActive: isIdentifyActive,
    highlightFeature: highlightFeatureData, clearHighlight: clearHighlightLayer,
  };
})();
