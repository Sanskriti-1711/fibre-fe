/**
 * FTTH HLD — MapLibre GL Map Integration
 *
 * Handles map initialization, adding GeoJSON sources/layers from the
 * pipeline results, layer visibility toggling, and base map switching.
 *
 * Requires: maplibregl from MapLibre CDN
 *   <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
 *   <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
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
    default: {
      fill: '#6B7280', outline: '#374151', opacity: 0.4, label: 'Layer',
    },
  };

  // ------------------------------------------------------------------
  // Map instance registry
  // ------------------------------------------------------------------
  const _maps = {};

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

    if (map.getSource(sourceId)) return { sourceId: sourceId, fillLayerId: fillLayerId, outlineLayerId: outlineLayerId };

    var firstFeature = geojson.features && geojson.features[0];
    var geomType = firstFeature && firstFeature.geometry && firstFeature.geometry.type;
    var isPolygon = geomType && geomType.toLowerCase().indexOf('polygon') !== -1;
    var isLine = geomType && (geomType.toLowerCase().indexOf('line') !== -1 || geomType.toLowerCase() === 'linestring' || geomType.toLowerCase() === 'multilinestring');

    map.addSource(sourceId, { type: 'geojson', data: geojson });

    if (isPolygon) {
      var fillPaint = { 'fill-opacity': fillOpacity };
      if (flagField) { fillPaint['fill-color'] = ['match', ['get', flagField], flagValue, fillFlagged, fillColor]; }
      else { fillPaint['fill-color'] = fillColor; }
      map.addLayer({ id: fillLayerId, type: 'fill', source: sourceId, paint: fillPaint, layout: { visibility: visible ? 'visible' : 'none' } });
      map.addLayer({ id: outlineLayerId, type: 'line', source: sourceId, paint: { 'line-color': outlineColor, 'line-width': 2 }, layout: { visibility: visible ? 'visible' : 'none' } });
    }

    if (isLine) {
      var linePaint = {
        'line-color': fillColor,
        'line-width': palette.lineWidth !== undefined ? palette.lineWidth : 3,
        'line-opacity': fillOpacity + 0.2,
      };
      if (palette.lineDash && palette.lineDash.length > 0) {
        linePaint['line-dasharray'] = palette.lineDash;
      }
      map.addLayer({ id: fillLayerId, type: 'line', source: sourceId, paint: linePaint, layout: { visibility: visible ? 'visible' : 'none' } });
    }

    if (!isPolygon && !isLine) {
      map.addLayer({ id: fillLayerId, type: 'circle', source: sourceId, paint: { 'circle-color': fillColor, 'circle-radius': 5, 'circle-opacity': 0.8, 'circle-stroke-color': outlineColor, 'circle-stroke-width': 1 }, layout: { visibility: visible ? 'visible' : 'none' } });
    }

    map.on('click', fillLayerId, function (e) {
      if (!e.features || !e.features[0]) return;
      var props = e.features[0].properties || {};
      var coords = e.lngLat;
      var html = '<div style="font-size:13px;line-height:1.5;max-width:280px;">';
      var keys = Object.keys(props).slice(0, 12);
      keys.forEach(function (k) {
        if (props[k] === null || props[k] === undefined) return;
        html += '<div><strong>' + escapeHtmlProp(k) + ':</strong> ' + escapeHtmlProp(String(props[k])) + '</div>';
      });
      html += '</div>';
      new maplibregl.Popup({ closeButton: true, maxWidth: '320px' }).setLngLat(coords).setHTML(html).addTo(map);
    });

    map.on('mouseenter', fillLayerId, function () { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', fillLayerId, function () { map.getCanvas().style.cursor = ''; });

    return { sourceId: sourceId, fillLayerId: fillLayerId, outlineLayerId: outlineLayerId };
  }

  function setLayerVisible(map, layerId, visible) {
    if (!map) return;
    var visibility = visible ? 'visible' : 'none';
    var fillLayer = 'ftth-fill-' + layerId;
    var outlineLayer = 'ftth-outline-' + layerId;
    if (map.getLayer(fillLayer)) { map.setLayoutProperty(fillLayer, 'visibility', visibility); }
    if (map.getLayer(outlineLayer)) { map.setLayoutProperty(outlineLayer, 'visibility', visibility); }
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
  };
})();
