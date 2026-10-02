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
    // Weight ladder, so the three tiers read as a hierarchy at any zoom:
    //   trench  (heaviest, what is dug)  >  duct (medium, laid in it)
    //   >  cable (thin, pulled through the duct)
    // and the colour says which part of the tree a line belongs to:
    //   trunk / backbone      amber or red
    //   branch / distribution violet or orange
    //   drop / last leg       pink or green
    trenches: {
      fill: '#3B82F6', outline: '#1D4ED8', opacity: 0.6, lineWidth: 6, lineDash: [], label: 'Trench Routes',
    },
    feeder_cable: {
      fill: '#B91C1C', outline: '#7F1D1D', opacity: 0.85, lineWidth: 1.8, lineDash: [], label: 'Feeder Cable',
    },
    distribution_cable: {
      fill: '#F97316', outline: '#C2410C', opacity: 0.85, lineWidth: 1.3, lineDash: [], label: 'Distribution Cable',
    },
    drop_cable: {
      fill: '#22C55E', outline: '#15803D', opacity: 0.85, lineWidth: 1, lineDash: [], label: 'Drop Cable',
    },
    // Aerial spans carry fibre on poles instead of in a duct: same thin
    // weight as a cable, amber so it reads as "not underground".
    aerial_cable: {
      fill: '#B45309', outline: '#B45309', opacity: 0.85, lineWidth: 1.6, lineDash: [], label: 'Aerial Cable',
    },
    feeder_ducts: {
      fill: '#B45309', outline: '#B45309', opacity: 0.75, lineWidth: 3.6, lineDash: [], label: 'Feeder Ducts (trunk)',
    },
    distribution_ducts: {
      fill: '#8B5CF6', outline: '#6D28D9', opacity: 0.75, lineWidth: 3, lineDash: [], label: 'Distribution Ducts (branch)',
    },
    drop_ducts: {
      fill: '#EC4899', outline: '#9D174D', opacity: 0.75, lineWidth: 2.2, lineDash: [], label: 'Drop Ducts',
    },
    coupleurs: {
      // Couplers at pseudo → object duct connections: distinct diamond-ish
      // teal point so they never read as a chamber or PDP.
      fill: '#14B8A6', outline: '#0F766E', opacity: 0.95, lineWidth: 2, lineDash: [], pointRadius: 6, label: 'Couplers',
    },
    objects: {
      fill: '#8B5CF6', outline: '#5B21B6', opacity: 0.4, label: 'Objects',
    },
    pdps: {
      fill: '#06B6D4', outline: '#0891B2', opacity: 0.7, lineWidth: 5, lineDash: [], label: 'PDPs',
    },
    mfg: {
      fill: '#047857', outline: '#047857', opacity: 0.7, lineWidth: 5, lineDash: [], label: 'MFG',
    },
    mfg_service_areas: {
      fill: '#65A30D', outline: '#3F6212', opacity: 0.18, lineWidth: 2, lineDash: [4, 2], label: 'MFG Service Areas',
    },
    buildings: {
      fill: '#8B5CF6', outline: '#5B21B6', opacity: 0.4, label: 'Buildings',
    },
    brownfield: {
      fill: '#64748B', outline: '#94A3B8', opacity: 0.7, lineWidth: 2.5, lineDash: [], pointRadius: 7, label: 'Existing Infrastructure',
    },
    default: {
      fill: '#616A75', outline: '#374151', opacity: 0.4, label: 'Layer',
    },
    // Sub-layer color map used when a group GeoJSON is tagged per-feature with
    // a `sublayer` property (merged feeder/distribution/drop ducts, etc.)
    SUBLAYER_COLORS: {
      'Feeder_Ducts': '#B45309',
      'Distribution_Ducts': '#8B5CF6',
      'Drop_Ducts': '#EC4899',
      'Feeder_Cable': '#B91C1C',
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
      // Structural node types from the trench designer (uppercase NODE_TYPE).
      'HDD_PIT': '#B91C1C',
      'PDP': '#06B6D4',
      'BEND': '#616A75',
      'JUNCTION': '#7C3AED',
      'PULL': '#B45309',
    },
  };

  // ------------------------------------------------------------------
  // Visual language — one distinguishable shape/line style per component
  //
  // A map that draws every layer as a coloured line or a circle is
  // unreadable: a trench, a duct and a cable along the same street are
  // three overlaid lines, and a PDP, a chamber and a premise are three
  // identical dots. Every component therefore gets a FIXED shape (points)
  // and a FIXED stroke pattern (lines), so the legend alone explains the
  // whole network:
  //
  //   MFG        hexagon (green)   @1.0    Trench Open Cut  solid, thick
  //   PDP        triangle (cyan)   @0.9    Trench HDD       long dash
  //   Chamber    Bore    diamond            Trench Garden    solid, thin
  //              Handhole circle    @0.7
  //              Manhole  square
  //   Coupler    diamond (teal)   @0.55
  //   Pole       cross (brown)    @0.6
  //   Premise    dot              @1.35
  //   Existing   circle (grey shades)
  //
  // Furniture stays LIGHT: only the network landmarks (MFG, PDP, chamber
  // subtype) carry a shaped glyph, everything else is a dot at reduced size —
  // thousands of premises pins buried the trench network they sit on.
  // ------------------------------------------------------------------
  const SHAPE_PATHS = {
    hexagon: 'M12 2.6 L20.1 7.3 V16.7 L12 21.4 L3.9 16.7 V7.3 Z',
    triangle: 'M12 3.2 L21.2 20.2 H2.8 Z',
    square: 'M4.4 4.4 H19.6 V19.6 H4.4 Z',
    diamond: 'M12 2.4 L21.6 12 L12 21.6 L2.4 12 Z',
    circle: '<circle cx="12" cy="12" r="8.2"/>',
    // The plain-dot body: premises/objects are the most numerous layer by far,
    // so their size is the whole visibility decision. At r=6.4 with icon-size
    // 1.15 the dot rendered ~13 CSS px and read as noise until you zoomed in.
    // The body is now 15.2 units of the 24-unit box (1 unit ≈ 0.92 CSS px at
    // pixelRatio 2) and the layer size is 1.35 → ~19 CSS px, legible at project
    // zoom without burying the trench/duct strokes underneath.
    dot: '<circle cx="12" cy="12" r="7.6"/>',
    pin: 'M12 2.4 C17.2 2.4 21.2 6.5 21.2 11.7 C21.2 17.1 12 21.8 12 21.8 C12 21.8 2.8 17.1 2.8 11.7 C2.8 6.5 6.8 2.4 12 2.4 Z',
    cross: 'M12 2.8 V21.2 M2.8 12 H21.2',
  };

  // Point symbol per component. ``field`` + ``values`` picks the shape from a
  // feature property (chambers by SUBTYPE, existing infra by ASSET_TYPE).
  // ``size`` scales the 22 px glyph (default 1). Only the network landmarks
  // keep a full-size glyph; furniture is shrunk so it never buries the lines.
  const SYMBOL_SPEC = {
    // Colours are the ones the palette already used for these layers.
    // Keep the dense premise/object layer visually subordinate to the network
    // landmarks, while making the two primary source markers easy to find.
    mfg: { shape: 'hexagon', color: '#047857', size: 1.15 },
    pdps: { shape: 'triangle', color: '#06B6D4', size: 1.1 },
    // One symbol per chamber SUBTYPE: a Bore is the HDD entry/exit opening,
    // a Handhole is a small lid, a Manhole is a walk-in shaft. Same size, so
    // the silhouette — not the scale — says which structure it is.
    chambers: {
      shape: 'circle', color: '#64748B', size: 0.7, field: 'SUBTYPE',
      values: {
        Bore: { shape: 'diamond', color: '#B91C1C' },
        Manhole: { shape: 'square', color: '#1E293B' },
        Handhole: { shape: 'circle', color: '#64748B' },
      },
    },
    coupleurs: { shape: 'diamond', color: '#14B8A6', size: 0.55 },
    // Poles carry the aerial spans, so they take the SAME amber as the aerial
    // trench and cable (`LINE_SPEC`) — the overhead route reads as one thing.
    // A pole is a POINT, so it cannot be dashed the way a span is; the cross
    // glyph is what marks it, and 0.6 was too small to see at project zoom
    // (Berlin has only a handful of poles, so they were easy to miss).
    poles: { shape: 'cross', color: '#B45309', size: 1.1 },
    // Object/premise points are the densest layer. Keep them deliberately small
    // so they do not visually outrank the PDP and MFG landmarks.
    objects: { shape: 'dot', color: '#8B5CF6', size: 0.72 },
    premises: { shape: 'dot', color: '#8B5CF6', size: 0.72 },
    brownfield: {
      shape: 'dot', color: '#64748B', size: 0.85, field: 'ASSET_TYPE',
      values: {
        pdp: { shape: 'triangle', color: '#0E7490' },
        mfg: { shape: 'hexagon', color: '#047857' },
        chamber: { shape: 'square', color: '#334155' },
        cabinet: { shape: 'square', color: '#475569' },
        pole: { shape: 'cross', color: '#92400E' },
        duct: { shape: 'dot', color: '#64748B' },
        trench: { shape: 'dot', color: '#94A3B8' },
        fibre: { shape: 'dot', color: '#7D8BA6' },
      },
    },
    // Trench-designer structural nodes (Trench_Nodes.gpkg): the same shapes as
    // the chamber subtypes, keyed off NODE_TYPE.
    // Keys are the designer's own NODE_TYPE values (Trench_Nodes.gpkg), so the
    // symbol says what the structure IS: a drill opening, the point where the
    // network changes tier, a splitter location, a direction change or a pull
    // point on a long run.
    trench_nodes: {
      shape: 'dot', color: '#475569', size: 0.6, field: 'NODE_TYPE',
      values: {
        HDD_PIT: { shape: 'diamond', color: '#B91C1C' },
        JUNCTION: { shape: 'square', color: '#334155' },
        PDP: { shape: 'triangle', color: '#0E7490' },
        BEND: { shape: 'dot', color: '#616A75' },
        PULL: { shape: 'cross', color: '#B45309' },
      },
    },
  };

  // Trench stroke pattern by construction class — the one line layer that
  // needed a representation, because Final_Trenches publishes Open Cut, HDD and
  // Garden in a single layer. Same blue as before: the class is carried by the
  // PATTERN, not by a new colour. Every other layer (ducts, cables, existing
  // infra) keeps its own palette colour, width and dash untouched.
  const LINE_SPEC = {
    // One colour AND one stroke per CONSTRUCTION TYPE — a trench is not one
    // thing: Open Cut is excavated, HDD is drilled under a carriageway, a
    // Garden leg is hand-dug to one house, and an Aerial leg is never dug at
    // all (it is a span on a pole). The designer classifies every span into
    // exactly these four, so the map can too.
    // Aerial legs: the trench designer's `Aerial_Drops` (classified, never dug)
    // and the pole stage's `Aerial_Spans` (the span it BUILDS for them). The
    // old name was `Aerial_Drop_Trenches`, which had to be tested BEFORE
    // `trenches` because the word "trench" made it match the excavated-span
    // rule; the rename to `Aerial_Spans` removes that ordering trap, and the
    // alias entry below keeps older stored projects rendering correctly.
    aerial_drops: {
      field: 'TRENCH_TYPE',
      useBucketColor: true,
      buckets: [
        // The classified leg (`Aerial_Drops`) and the span the pole stage
        // BUILDS for it (`Aerial_Spans`, TRENCH_TYPE `Aerial_Drop`)
        // carry different values for the same construction class, and the
        // bucket matcher is an exact compare — with only `Aerial` listed the
        // spans matched no bucket at all and fell through to a plain
        // undashed line, which is why the aerial routes read as ordinary
        // trench on the map.
        { value: 'Aerial', color: '#B45309', width: 3.5, dash: [6, 3, 1.5, 3], aliases: ['aerial'] },
        { value: 'Aerial_Drop', color: '#B45309', width: 3.5, dash: [6, 3, 1.5, 3], aliases: ['aerial'] },
      ],
    },
    trenches: {
      field: 'trench_type',
      buckets: [
        { value: 'Open Cut', color: '#2563EB', width: 6, dash: null, aliases: ['opencut'] },
        { value: 'HDD', color: '#7C3AED', width: 5.5, dash: [10, 4], aliases: ['hdd', 'drill', 'bore'] },
        // Garden legs are REAL dug trench (hand-dug from the open cut to one
        // house), so they are drawn solid like the open cut. They were dotted,
        // which read as "not a trench" — only HDD keeps a stroke pattern, and
        // that is because it is drilled rather than dug.
        { value: 'Garden', color: '#16A34A', width: 4, dash: null, aliases: ['garden'] },
        { value: 'Aerial', color: '#B45309', width: 3.5, dash: [6, 3, 1.5, 3], aliases: ['aerial'] },
      ],
      useBucketColor: true,
    },
    // Ducts sit BETWEEN the trench and the cable in weight and are coloured by
    // the part of the tree they belong to: the feeder trunk, the distribution
    // branch, or the one-premise drop. The bucket colour WINS over the palette
    // here (``useBucketColor``) — that is the point of the spec — so a merged
    // ducts layer is colourful on its own instead of one flat yellow.
    ducts: {
      field: 'DUCT_TYPE',
      useBucketColor: true,
      buckets: [
        { value: '4-Way HDPE', color: '#B45309', width: 3.6, dash: null, aliases: ['feeder'] },
        { value: '2-Way HDPE', color: '#8B5CF6', width: 3, dash: null, aliases: ['distribution'] },
        { value: '1-Way HDPE', color: '#EC4899', width: 2.2, dash: null, aliases: ['drop'] },
      ],
    },
    // Cables are the thinnest thing on the map: they are pulled through a duct
    // that is already drawn on the same alignment. Coloured by tier.
    cables: {
      field: 'CABLE_TYPE',
      useBucketColor: true,
      buckets: [
        { value: 'Feeder', color: '#B91C1C', width: 1.8, dash: null, aliases: ['feeder'] },
        { value: 'Distribution', color: '#F97316', width: 1.3, dash: null, aliases: ['distribution'] },
        { value: 'Drop', color: '#22C55E', width: 1, dash: null, aliases: ['drop'] },
        // `Aerial_Cable` is the span the drop hangs from, not a duct-pulled
        // cable: same amber as the aerial trench, dashed, so it reads as the
        // overhead route instead of falling back to a flat default stroke.
        { value: 'Aerial', color: '#B45309', width: 1.6, dash: [6, 3], aliases: ['aerial'] },
      ],
    },
  };

  // Draw order, bottom → top: areas, existing infra, trenches, ducts, cables,
  // furniture. Keywords are matched against the layer key so both the HLD
  // (`trenches`, `cables`) and the LLD (`distribution_cable`, `drop_ducts`)
  // naming schemes land in the same stack.
  var Z_KEYWORDS = [
    ['polygon', 'coverage'],
    ['building'],
    ['object', 'premise'],
    ['brownfield', 'existing'],
    ['trench'],
    ['duct'],
    ['cable', 'fibre', 'fiber'],
    ['coupl', 'coupler'],
    ['chamber', 'handhole', 'manhole'],
    ['pole'],
    ['pdp', 'splitter'],
    ['mfg', 'mainframe'],
  ];

  /** Strip the render-prefix and sublayer suffix from a map layer id. */
  function _layerKey(id) {
    var k = String(id || '').replace(/^ftth-(fill|outline|points|halo)-/, '');
    var b = k.indexOf('__b');
    if (b >= 0) k = k.slice(0, b);
    var s = k.indexOf('::');
    if (s >= 0) k = k.slice(0, s);
    return k.toLowerCase();
  }

  /** First Z_KEYWORDS row whose keyword appears in the layer key. */
  function _zRank(key) {
    for (var i = 0; i < Z_KEYWORDS.length; i++) {
      for (var j = 0; j < Z_KEYWORDS[i].length; j++) {
        if (key.indexOf(Z_KEYWORDS[i][j]) !== -1) return i;
      }
    }
    return Z_KEYWORDS.length;
  }

  /** Resolve the SYMBOL_SPEC / LINE_SPEC entry for an arbitrary layer key. */
  function _specFor(spec, key) {
    if (spec[key]) return spec[key];
    var stripped = key.replace(/^lld-/, '');
    if (spec[stripped]) return spec[stripped];
    var order = Object.keys(spec);
    for (var i = 0; i < order.length; i++) {
      var probe = order[i];
      var stem = probe.replace(/s$/, '');   // pdps -> pdp, cables -> cable
      if (stripped.indexOf(stem) !== -1) return spec[probe];
    }
    return null;
  }

  // Icons are SVG data URIs rasterised once per (shape, colour) pair. MapLibre
  // renders a symbol layer only once the image exists, so a spec'd layer is
  // given a circle halo underneath: the halo is visible immediately and the
  // glyph appears as soon as `addImage` lands (which triggers a repaint).
  var _iconPending = {};

  function _iconId(shape, color) {
    return 'ftth-ic-' + shape + '-' + String(color).replace('#', '').toLowerCase();
  }

  function _iconSvg(shape, color) {
    var body = SHAPE_PATHS[shape] || SHAPE_PATHS.circle;
    var ring = shape === 'ringSquare';
    var bare = shape === 'cross';
    var geom = ring ? SHAPE_PATHS.square : body;
    // `circle` / `dot` are SVG ELEMENTS, not path data. Wrapping them in
    // <path d="..."> produced invalid path data and the glyph rendered as
    // nothing at all (premises and brownfield points disappeared), so an
    // element body is emitted as-is with the fill/stroke applied to a <g>.
    if (geom.charAt(0) === '<') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24">'
        + '<g fill="' + color + '" stroke="#FFFFFF" stroke-width="2.2">'
        + geom + '</g></svg>';
    }
    if (bare) {
      // Two strokes so the cross keeps a white halo on any basemap.
      return '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24">'
        + '<path d="' + geom + '" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round"/>'
        + '<path d="' + geom + '" fill="none" stroke="' + color + '" stroke-width="3.2" stroke-linecap="round"/></svg>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24">'
      + '<path d="' + geom + '" fill="' + (ring ? '#FFFFFF' : color) + '" stroke="' + (ring ? color : '#FFFFFF') + '" stroke-width="' + (ring ? 3.6 : 2.2) + '" stroke-linejoin="round"/>'
      + '</svg>';
  }

  /**
   * Register every glyph the symbol table can ask for, once, at map init.
   * The images are inline SVG data URIs (a few hundred bytes), so this costs
   * one frame and removes the async-load placeholder entirely: a symbol layer
   * added later always finds its image already registered.
   */
  function _installAllIcons(map) {
    if (!map || !map.addImage) return;
    Object.keys(SYMBOL_SPEC).forEach(function (key) {
      var s = SYMBOL_SPEC[key];
      _installIcon(map, s.shape, s.color);
      if (s.values) {
        Object.keys(s.values).forEach(function (v) {
          _installIcon(map, s.values[v].shape, s.values[v].color);
        });
      }
    });
  }

  function _installIcon(map, shape, color) {
    var id = _iconId(shape, color);
    if (!map || !map.addImage) return id;
    if (map.hasImage && map.hasImage(id)) return id;
    if (_iconPending[id]) return id;
    _iconPending[id] = true;
    try {
      var img = new Image(44, 44);
      img.onload = function () {
        delete _iconPending[id];
        try { if (!map.hasImage(id)) map.addImage(id, img, { pixelRatio: 2 }); } catch (_e) {}
      };
      img.onerror = function () { delete _iconPending[id]; };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(_iconSvg(shape, color));
    } catch (_e) { delete _iconPending[id]; }
    return id;
  }

  // ------------------------------------------------------------------
  // Map instance registry
  // ------------------------------------------------------------------
  const _maps = {};

  // Every map layer id created for one logical layer key (halo, buckets,
  // symbol, outline...). Visibility toggling and identify both work off this,
  // so adding a style never silently leaves a part of the layer switched on.
  var _layerParts = {};

  // Identify/highlight mode. When active, layer clicks highlight the clicked
  // feature on a dedicated highlight layer and hand it to the page callback
  // (full attribute table) instead of showing the small default popup.
  let _identifyActive = false;
  let _identifyCallback = null;
  let _identifyClickHandler = null;

  // ------------------------------------------------------------------
  // Source registry — every GeoJSON source we add keeps its full feature
  // list here so a click can be expanded back to the COMPLETE feature it
  // belongs to. MapLibre answers queries from its internal tiles, so the
  // geometry it hands back is clipped to the tile the click landed in: a
  // grouped trench (e.g. "Open Cut" with hundreds of parts) or a long duct
  // would otherwise highlight only the fragment under the cursor instead of
  // the whole run.
  // ------------------------------------------------------------------
  var _sourceFeatures = {};
  var _sourceKeyIndex = {};

  // Attribute names that carry a stable per-feature identity. Layers written
  // by the pipeline stamp `feature_id`; grouped layers that omit it (the
  // trench layer) fall back to a fingerprint of their attributes below.
  var _ID_FIELDS = ['feature_id', 'FEATURE_ID', 'id', 'SRC_ID', 'ASSET_ID', 'DUCT_ID', 'CABLE_ID', 'PDP_ID', 'MFG_ID', 'STRUCT_ID',
    // Trench-designer outputs (design.trench_design): spans, structural nodes,
    // HDD drills and aerial drops each carry their own stable id.
    'TRENCH_ID', 'SPAN_ID', 'NODE_ID', 'DRILL_ID', 'DROP_ID'];

  function _featureIdentity(props) {
    if (!props) return null;
    for (var i = 0; i < _ID_FIELDS.length; i++) {
      var f = _ID_FIELDS[i];
      if (props[f] !== undefined && props[f] !== null && props[f] !== '') { return f + '=' + String(props[f]); }
    }
    var keys = Object.keys(props).sort(), parts = [];
    for (var k = 0; k < keys.length; k++) {
      var v = props[keys[k]];
      if (v === undefined || v === null || v === '') continue;
      parts.push(keys[k] + '=' + String(v));
    }
    return parts.length ? 'fp:' + parts.join('|') : null;
  }

  function _registerSourceFeatures(sourceId, geojson) {
    var feats = (geojson && geojson.features) || [];
    _sourceFeatures[sourceId] = feats;
    var idx = {};
    for (var i = 0; i < feats.length; i++) {
      var key = _featureIdentity(feats[i] && feats[i].properties);
      if (!key) continue;
      if (!idx[key]) idx[key] = [];
      idx[key].push(feats[i]);
    }
    _sourceKeyIndex[sourceId] = idx;
  }

  /** First coordinate of any (multi) geometry, used for locality tests. */
  function _firstCoord(feature) {
    var g = feature && feature.geometry;
    var c = g && g.coordinates;
    while (c && c.length && typeof c[0] !== 'number') { c = c[0]; }
    return (c && c.length >= 2) ? c : null;
  }

  /** True when any vertex of `feature` sits within `eps` degrees of `pt`. */
  function _hasVertexNear(feature, pt, eps) {
    var found = false;
    function walk(c) {
      if (found || !c || !c.length) return;
      if (typeof c[0] === 'number') {
        if (Math.abs(c[0] - pt[0]) <= eps && Math.abs(c[1] - pt[1]) <= eps) { found = true; }
        return;
      }
      for (var i = 0; i < c.length && !found; i++) { walk(c[i]); }
    }
    walk(feature && feature.geometry && feature.geometry.coordinates);
    return found;
  }

  /**
   * Expand a clicked (possibly tile-clipped) query result back to every source
   * feature that belongs to the same logical asset. Returns an array of
   * features — usually one complete feature, or the several parts of it.
   */
  function resolveFullFeatures(sourceId, clicked) {
    var idx = _sourceKeyIndex[sourceId];
    if (!clicked) return [];
    if (!idx) return [clicked];
    var key = _featureIdentity(clicked.properties);
    var cands = (key && idx[key]) ? idx[key].slice() : [];
    if (!cands.length) return [clicked];
    // A fingerprint can collide between genuinely separate features; keep only
    // the candidates that actually touch the clicked geometry.
    if (cands.length > 1) {
      var pt = _firstCoord(clicked);
      if (pt) {
        var local = cands.filter(function (f) { return _hasVertexNear(f, pt, 1e-6); });
        if (local.length) cands = local;
      }
    }
    return cands;
  }

  /** Collapse the parts of one asset into a single Feature (for the inspector). */
  function combineFeatureParts(list) {
    if (!list || !list.length) return null;
    if (list.length === 1) return list[0];
    var lines = [], polys = [], pts = [], fam = null, mixed = false;
    list.forEach(function (f) {
      var g = f && f.geometry;
      if (!g || !g.coordinates) return;
      var t = g.type;
      if (t === 'LineString') { lines.push(g.coordinates); fam = fam || 'line'; if (fam !== 'line') mixed = true; return; }
      if (t === 'MultiLineString') { fam = fam || 'line'; if (fam !== 'line') mixed = true; g.coordinates.forEach(function (l) { lines.push(l); }); return; }
      if (t === 'Polygon') { fam = fam || 'poly'; if (fam !== 'poly') mixed = true; polys.push(g.coordinates); return; }
      if (t === 'MultiPolygon') { fam = fam || 'poly'; if (fam !== 'poly') mixed = true; g.coordinates.forEach(function (p) { polys.push(p); }); return; }
      if (t === 'Point') { fam = fam || 'point'; if (fam !== 'point') mixed = true; pts.push(g.coordinates); return; }
      if (t === 'MultiPoint') { fam = fam || 'point'; if (fam !== 'point') mixed = true; g.coordinates.forEach(function (p) { pts.push(p); }); return; }
    });
    var geometry = null;
    if (!mixed && lines.length) geometry = { type: 'MultiLineString', coordinates: lines };
    else if (!mixed && polys.length) geometry = { type: 'MultiPolygon', coordinates: polys };
    else if (!mixed && pts.length) geometry = { type: 'MultiPoint', coordinates: pts };
    if (!geometry) geometry = list[0].geometry;
    return { type: 'Feature', id: list[0].id, properties: list[0].properties, geometry: geometry };
  }

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
    function onReady() {
      _addAllBaseLayers(map, basemap);
      _installAllIcons(map);
      if (typeof onLoad === 'function') { onLoad(map); }
    }
    map.on('load', onReady);
    if (map.loaded()) { onReady(); }
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
    // MapLibre rejects out-of-range paint values and then DROPS the layer
    // (it only fires an error event), so clamp: a line derived opacity of
    // fillOpacity + 0.2 above 1 would silently lose the whole layer.
    function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
    var visible = opts.visible !== false;
    var flagField = opts.flagField;
    var flagValue = opts.flagValue;
    // How many properties a click popup lists.  Kept configurable because the
    // objects layer exists to show ALL of an OSM building's attributes, while
    // the design layers only want their top handful.
    var popupMaxFields = Number(opts.popupMaxFields) > 0 ? Number(opts.popupMaxFields) : 12;

    var sourceId = 'ftth-source-' + layerId;
    var fillLayerId = 'ftth-fill-' + layerId;
    var outlineLayerId = 'ftth-outline-' + layerId;
    var pointsLayerId = 'ftth-points-' + layerId;

    // Keep the complete feature list for this source so identify clicks can be
    // expanded from a tile-clipped fragment back to the whole feature.
    _registerSourceFeatures(sourceId, geojson);

    // A source that already exists must be REPLACED, not skipped. The same page
    // resolves several areas in a row, and returning early here left the
    // PREVIOUS area's features on the map while the boundary moved to the new
    // one — so after trying one area and then another, the premises points were
    // simply not in view and the layer looked empty. The old layers are removed
    // and re-added (rather than setData'd) because a re-resolve can change the
    // geometry mix, which would leave the old layer types behind.
    if (map.getSource(sourceId)) {
      (_layerParts[layerId] || []).forEach(function (lid) {
        if (map.getLayer(lid)) { try { map.removeLayer(lid); } catch (_) {} }
      });
      try { map.removeSource(sourceId); } catch (_) {}
      delete _layerParts[layerId];
    }

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
      var fillPaint = { 'fill-opacity': clamp01(fillOpacity) };
      if (flagField) { fillPaint['fill-color'] = ['match', ['get', flagField], flagValue, fillFlagged, fillColor]; }
      else if (permitMatch) { fillPaint['fill-color'] = permitMatch; }
      else if (typeMatch) { fillPaint['fill-color'] = typeMatch; }
      else { fillPaint['fill-color'] = fillColor; }
      map.addLayer({ id: fillLayerId, type: 'fill', source: sourceId, paint: fillPaint, layout: { visibility: visible ? 'visible' : 'none' } });
      map.addLayer({ id: outlineLayerId, type: 'line', source: sourceId, paint: { 'line-color': outlineColor, 'line-width': 2 }, layout: { visibility: visible ? 'visible' : 'none' } });
      renderedLayers.push(fillLayerId, outlineLayerId);
    }

    // Line style per component/tier: when a LINE_SPEC matches, the layer is
    // drawn as one line layer PER bucket (construction class / tier) so the
    // stroke pattern carries the meaning — a solid line and a long dash can be
    // told apart at a glance where two solid colours cannot: Open Cut and
    // Garden are both dug (solid), HDD is drilled (long dash). `line-dasharray`
    // is not data-driven in MapLibre, hence a layer per bucket with a filter
    // instead of one layer with an expression.
    var lineBuckets = null;
    if (hasLine) {
      var lineKey = _layerKey(layerId);
      var lineSpec = _specFor(LINE_SPEC, lineKey);
      if (lineSpec && lineSpec.field) {
        var found = {};
        (geojson.features || []).forEach(function (feat) {
          var v = feat.properties && feat.properties[lineSpec.field];
          if (v === null || v === undefined || String(v).trim() === '') return;
          found[String(v).trim()] = true;
        });
        // A tier that is already split into its own layer upstream (the LLD
        // publishes `distribution_cable`, `drop_ducts`, ...) carries no tier
        // field on the feature. Derive it from the layer name so the stroke
        // pattern still says which tier the line is.
        if (!Object.keys(found).length) {
          var hint = null;
          lineSpec.buckets.forEach(function (b) {
            if (hint) return;
            var aliases = b.aliases || [];
            for (var ai = 0; ai < aliases.length; ai++) {
              if (lineKey.indexOf(aliases[ai]) !== -1) { hint = b.value; return; }
            }
          });
          if (hint) {
            (geojson.features || []).forEach(function (feat) {
              var p = feat.properties || (feat.properties = {});
              if (!p[lineSpec.field]) p[lineSpec.field] = hint;
            });
            found[hint] = true;
          }
        }
        var built = [];
        lineSpec.buckets.forEach(function (b, bi) {
          var match = null;
          Object.keys(found).forEach(function (v) {
            if (!match && v.toLowerCase() === String(b.value).toLowerCase()) match = v;
          });
          if (!match) return;
          built.push({
            id: fillLayerId + '__b' + bi,
            filter: ['==', ['get', lineSpec.field], match],
            color: b.color, width: b.width, dash: b.dash || null,
          });
        });
        if (built.length) lineBuckets = built;
      }
    }

    if (lineBuckets) {
      lineBuckets.forEach(function (b) {
        // A caller that supplied its own colour keeps it (the LLD viewer has
        // its own trench palette); the bucket only contributes the pattern, so
        // adding a class distinction never recolours an existing map.
        var bPaint = {
          'line-color': permitMatch
            || (lineSpec.useBucketColor ? b.color : (opts.fillColor || b.color)),
          'line-width': b.width,
          'line-opacity': clamp01(fillOpacity + 0.2),
        };
        if (b.dash && b.dash.length) bPaint['line-dasharray'] = b.dash;
        map.addLayer({
          id: b.id, type: 'line', source: sourceId, filter: b.filter, paint: bPaint,
          layout: { visibility: visible ? 'visible' : 'none' },
        });
        renderedLayers.push(b.id);
      });
      fillLayerId = lineBuckets[0].id;   // the primary id for click handling
    } else if (hasLine) {
      var linePaint = {
        'line-color': fillColor,
        'line-width': palette.lineWidth !== undefined ? palette.lineWidth : 3,
        'line-opacity': clamp01(fillOpacity + 0.2),
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
      // Point symbol: a fixed glyph per component (hexagon = MFG, triangle =
      // PDP, square = chamber...) so a dot is never ambiguous. The images are
      // registered at map init (see _installAllIcons), so the glyph is there on
      // the first frame and no placeholder is needed.
      var symSpec = _specFor(SYMBOL_SPEC, _layerKey(layerId));
      if (symSpec) {
        var defaultIcon = _installIcon(map, symSpec.shape, symSpec.color);
        var iconImage = defaultIcon;
        if (symSpec.field && symSpec.values) {
          var perValue = {};
          var valueKeys = Object.keys(symSpec.values);
          (geojson.features || []).forEach(function (feat) {
            var v = feat.properties && feat.properties[symSpec.field];
            if (v === null || v === undefined || String(v).trim() === '') return;
            var raw = String(v).trim();
            if (perValue[raw]) return;
            for (var vi = 0; vi < valueKeys.length; vi++) {
              if (valueKeys[vi].toLowerCase() === raw.toLowerCase()) {
                var vs = symSpec.values[valueKeys[vi]];
                perValue[raw] = _installIcon(map, vs.shape, vs.color);
                break;
              }
            }
          });
          var usedValues = Object.keys(perValue);
          if (usedValues.length) {
            iconImage = ['match', ['get', symSpec.field]];
            usedValues.forEach(function (raw) { iconImage.push(raw, perValue[raw]); });
            iconImage.push(defaultIcon);
          }
        }
        map.addLayer({
          id: pointsLayerId, type: 'symbol', source: sourceId,
          layout: {
            'icon-image': iconImage,
            'icon-size': symSpec.size !== undefined ? symSpec.size : 1,
            'icon-allow-overlap': true, 'icon-ignore-placement': true,
            visibility: visible ? 'visible' : 'none',
          },
        });
        renderedLayers.push(pointsLayerId);
      } else {
        var pointRadius = palette.pointRadius !== undefined ? palette.pointRadius : 5;
        var circlePaint = { 'circle-color': typeMatch || fillColor, 'circle-radius': pointRadius, 'circle-opacity': 0.85, 'circle-stroke-color': outlineColor, 'circle-stroke-width': 1 };
        map.addLayer({ id: pointsLayerId, type: 'circle', source: sourceId, paint: circlePaint, layout: { visibility: visible ? 'visible' : 'none' } });
        renderedLayers.push(pointsLayerId);
      }
    }

    renderedLayers.forEach(function (lid) {
      map.on('click', lid, function (e) {
        if (!e.features || !e.features[0]) return;
        var feature = e.features[0];
        var props = feature.properties || {};
        var coords = e.lngLat;

        // Identify mode is served by one map-level click handler (see
        // handleIdentifyClick) so the TOP-MOST rendered feature wins. Every
        // layer stacked under the cursor fires its own click listener, which
        // made the selection depend on style order — clicking a trench that
        // carries a duct inside it could select the duct instead.
        if (_identifyActive) { return; }

        var allKeys = Object.keys(props).filter(function (k) {
          return props[k] !== null && props[k] !== undefined;
        });
        var keys = allKeys.slice(0, popupMaxFields);
        var html = '<div style="font-size:13px;line-height:1.5;max-width:300px;' +
          'max-height:320px;overflow-y:auto;">';
        keys.forEach(function (k) {
          html += '<div><strong>' + escapeHtmlProp(k) + ':</strong> ' + escapeHtmlProp(String(props[k])) + '</div>';
        });
        if (allKeys.length > keys.length) {
          html += '<div style="margin-top:6px;color:#616A75;">… and ' +
            (allKeys.length - keys.length) + ' more attribute(s)</div>';
        }
        html += '</div>';
        new maplibregl.Popup({ closeButton: true, maxWidth: '320px' }).setLngLat(coords).setHTML(html).addTo(map);
      });
      map.on('mouseenter', lid, function () { map.getCanvas().style.cursor = _identifyActive ? 'crosshair' : 'pointer'; });
      map.on('mouseleave', lid, function () { map.getCanvas().style.cursor = ''; });
    });

    _layerParts[layerId] = renderedLayers.slice();
    return {
      sourceId: sourceId, fillLayerId: fillLayerId, outlineLayerId: outlineLayerId,
      pointsLayerId: pointsLayerId, parts: renderedLayers.slice(),
    };
  }

  /**
   * Push every design layer into the canonical draw order (map.paintOrder has
   * no effect on data layers): areas at the bottom, then existing infra,
   * trenches, ducts, cables and finally the point furniture on top. Without
   * this the stack depends on which HTTP response arrived first, so a duct
   * can end up hidden under its own trench.
   */
  function applyZOrder(map) {
    if (!map || !map.getStyle) return;
    var layers = ((map.getStyle() || {}).layers || []).map(function (l) { return l.id; })
      .filter(function (id) {
        return id.indexOf('ftth-') === 0 && id.indexOf('ftth-highlight-') !== 0;
      });
    function rank(id) {
      var bottom = _zRank(_layerKey(id)) * 10;
      var kind = 0;
      if (id.indexOf('-outline-') !== -1) kind = 1;
      else if (id.indexOf('-halo-') !== -1) kind = 3;
      else if (id.indexOf('__b') !== -1) kind = 4;
      else if (id.indexOf('-points-') !== -1) kind = 5;
      return bottom + kind;
    }
    layers.sort(function (a, b) { return rank(a) - rank(b); });
    layers.forEach(function (id) { try { map.moveLayer(id); } catch (_e) {} });
  }

  function setLayerVisible(map, layerId, visible) {
    if (!map) return;
    var visibility = visible ? 'visible' : 'none';
    var parts = _layerParts[layerId];
    if (parts && parts.length) {
      parts.forEach(function (lid) {
        if (map.getLayer(lid)) { map.setLayoutProperty(lid, 'visibility', visibility); }
      });
      return;
    }
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
      if (_identifyClickHandler) {
        map.off('click', _identifyClickHandler);
        _identifyClickHandler = null;
      }
      if (active) {
        _identifyClickHandler = function (e) { handleIdentifyClick(map, e); };
        map.on('click', _identifyClickHandler);
      }
      map.getCanvas().style.cursor = active ? 'crosshair' : '';
      if (!active) { clearHighlightLayer(map); }
    }
  }

  function isIdentifyActive() { return _identifyActive; }

  /**
   * One identify click for the whole map: resolve the top-most design feature
   * under the cursor, expand it to its complete geometry and hand it to the
   * page. Returns the picked feature (for tests / callers).
   */
  function handleIdentifyClick(map, e) {
    if (!_identifyActive || !map) return null;
    var feats = [];
    try { feats = map.queryRenderedFeatures(e.point) || []; } catch (_) { return null; }
    var styleLayers = (map.getStyle() && map.getStyle().layers) || [];
    var rank = {};
    for (var i = 0; i < styleLayers.length; i++) { rank[styleLayers[i].id] = i; }
    var pick = null, pickRank = -1;
    for (var j = 0; j < feats.length; j++) {
      var f = feats[j];
      var lid = f && f.layer && f.layer.id;
      if (!lid || lid.indexOf('ftth-highlight-') === 0) continue;
      if (lid.indexOf('ftth-fill-') !== 0 && lid.indexOf('ftth-points-') !== 0) continue;
      var r = rank[lid] === undefined ? 0 : rank[lid];
      if (r >= pickRank) { pickRank = r; pick = f; }
    }
    if (!pick) return null;

    var publicLayerId = pick.layer.id
      .replace(/^ftth-(fill|outline|points)-/, '')
      .replace(/^lld-/, '');
    var sourceId = 'ftth-source-' + pick.layer.id.replace(/^ftth-(fill|points)-/, '');
    var parts = resolveFullFeatures(sourceId, pick);
    highlightFeatureData(map, parts);
    if (typeof _identifyCallback === 'function') {
      _identifyCallback(combineFeatureParts(parts) || pick, publicLayerId, e.lngLat);
    }
    return pick;
  }

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

  /**
   * Paint a feature (or every part of one asset) on the highlight layer.
   * Accepts a single Feature or an array of them.
   */
  function highlightFeatureData(map, feature) {
    if (!map || !feature) return;
    var list = Array.isArray(feature) ? feature : [feature];
    list = list.filter(function (f) { return f && f.geometry; });
    if (!list.length) return;
    ensureHighlightLayer(map);
    var src = map.getSource('ftth-highlight-src');
    if (src) {
      src.setData({ type: 'FeatureCollection', features: list });
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
  // Legend — generated from the same tables the renderer uses, so it can
  // never drift from what is actually on the map.
  // ------------------------------------------------------------------

  function _legendGlyph(shape, color, size) {
    var geom = shape === 'ringSquare' ? SHAPE_PATHS.square : (SHAPE_PATHS[shape] || SHAPE_PATHS.circle);
    // Same rule as _iconSvg: `circle` and `dot` are SVG elements, not path
    // data. Without this guard the legend emitted <path d="<circle cx=...">
    // — invalid path data, so those legend swatches rendered as nothing
    // while the map markers themselves were fine.
    if (geom.charAt(0) === '<') {
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24">'
        + '<g fill="' + color + '" stroke="#FFFFFF" stroke-width="2.2">'
        + geom + '</g></svg>';
    }
    if (shape === 'cross') {
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24">'
        + '<path d="' + geom + '" fill="none" stroke="' + color + '" stroke-width="4" stroke-linecap="round"/></svg>';
    }
    var ring = shape === 'ringSquare';
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24">'
      + '<path d="' + geom + '" fill="' + (ring ? '#FFFFFF' : color) + '" stroke="' + (ring ? color : '#FFFFFF') + '" stroke-width="' + (ring ? 3.6 : 2.4) + '" stroke-linejoin="round"/></svg>';
  }

  var LEGEND_LABELS = {
    mfg: 'MFG (exchange)', pdps: 'PDP (splitter)', chambers: 'Chamber',
    coupleurs: 'Coupler', poles: 'Pole (aerial)', objects: 'Premise / object',
    premises: 'Premise / object',    trench_nodes: 'Trench node',
    'aerial_drops': 'Aerial drop', aerial_spans: 'Aerial drop',
    aerial_drop_trenches: 'Aerial drop',
    brownfield: 'Existing infra', trenches: 'Trench', ducts: 'Duct', cables: 'Cable',
    // Only meaningful for a layer that is SPLIT per tier upstream; the legend
    // lists one row per bucket so the tier colours are explained.
    feeder_ducts: 'Duct', distribution_ducts: 'Duct', drop_ducts: 'Duct',
    feeder_cable: 'Cable', distribution_cable: 'Cable', drop_cable: 'Cable',
  };
  // Only the trench line rows are worth legend space: ducts and cables keep the
  // colours their layer toggles already show a dot for.
  var LEGEND_LINE_KEYS = ['trenches', 'ducts', 'cables'];

  function legendSpec() {
    var icons = [], lines = [];
    var seenLabel = {};
    Object.keys(SYMBOL_SPEC).forEach(function (key) {
      var s = SYMBOL_SPEC[key];
      if (s.values) {
        Object.keys(s.values).forEach(function (v) {
          icons.push({ label: (LEGEND_LABELS[key] || key) + ' — ' + v, shape: s.values[v].shape, color: s.values[v].color });
        });
      }
      // One row per component, not per spec alias: `objects` and `premises`
      // are the same dot under two names upstream.
      var label = LEGEND_LABELS[key] || key;
      if (seenLabel[label]) return;
      seenLabel[label] = true;
      icons.push({ label: label, shape: s.shape, color: s.color });
    });
    LEGEND_LINE_KEYS.forEach(function (key) {
      if (!LINE_SPEC[key]) return;
      LINE_SPEC[key].buckets.forEach(function (b) {
        lines.push({ label: (LEGEND_LABELS[key] || key) + ' — ' + b.value, color: b.color, width: b.width, dash: b.dash });
      });
    });
    return { icons: icons, lines: lines };
  }

  /** Legend markup for a side pane (styles come from the page's CSS). */
  function legendHTML() {
    var spec = legendSpec();
    var html = '<div class="ftth-legend-group"><div class="ftth-legend-title">Components</div>';
    spec.icons.forEach(function (it) {
      html += '<div class="ftth-legend-row"><span class="ftth-legend-swatch">'
        + _legendGlyph(it.shape, it.color, 18) + '</span><span class="ftth-legend-label">'
        + escapeHtmlProp(it.label) + '</span></div>';
    });
    html += '</div><div class="ftth-legend-group"><div class="ftth-legend-title">Trench class (stroke pattern)</div>';
    spec.lines.forEach(function (it) {
      var dash = (it.dash && it.dash.length) ? ' stroke-dasharray="' + it.dash.join(' ') + '"' : '';
      var w = Math.max(3, Math.min(7, it.width));
      html += '<div class="ftth-legend-row"><span class="ftth-legend-swatch">'
        + '<svg width="26" height="10" viewBox="0 0 26 10"><line x1="1" y1="5" x2="25" y2="5" stroke="'
        + it.color + '" stroke-width="' + w + '" stroke-linecap="round"' + dash + '/></svg>'
        + '</span><span class="ftth-legend-label">' + escapeHtmlProp(it.label) + '</span></div>';
    });
    return html + '</div>';
  }

  // ------------------------------------------------------------------
  // Projected coordinates (UTM)
  // ------------------------------------------------------------------

  // The design is stored in a projected metre CRS — EPSG:2583x (ETRS89 / UTM
  // zone 3xN) or EPSG:3263x (WGS84 / UTM) — while MapLibre speaks WGS84
  // degrees.  A degrees-only readout therefore cannot be compared against a
  // coordinate in the design or in an exported GeoJSON, so the hover pill
  // prints easting/northing as well.  The forward transverse-Mercator series
  // below is the standard USGS one and is good to about a millimetre inside
  // the zone and still under a metre even 13 degrees outside it (checked
  // against pyproj), far finer than a pointer pixel.
  var UTM_ELLIPSOIDS = {
    etrs89: { a: 6378137, f: 1 / 298.257222101 },
    wgs84: { a: 6378137, f: 1 / 298.257223563 },
  };

  function _utmParams(crs) {
    var code = String(crs == null || crs === '' ? 'EPSG:25833' : crs).replace(/[^0-9]/g, '');
    var params = { zone: 33, ellipsoid: UTM_ELLIPSOIDS.etrs89, south: false };
    if (code.length === 5 && code.indexOf('258') === 0) {
      params.zone = Number(code.slice(3));
    } else if (code.length === 5 && code.indexOf('326') === 0) {
      params.zone = Number(code.slice(3));
      params.ellipsoid = UTM_ELLIPSOIDS.wgs84;
    } else if (code.length === 5 && code.indexOf('327') === 0) {
      params.zone = Number(code.slice(3));
      params.ellipsoid = UTM_ELLIPSOIDS.wgs84;
      params.south = true;
    }
    if (!(params.zone >= 1 && params.zone <= 60)) { params.zone = 33; params.ellipsoid = UTM_ELLIPSOIDS.etrs89; params.south = false; }
    return params;
  }

  /**
   * Convert WGS84 lng/lat to UTM easting/northing for the given CRS.
   *
   * ETRS89 and WGS84 differ by centimetres in Europe, so a 2583x coordinate
   * computed from WGS84 input is well inside the tolerance a pointer implies.
   */
  function utmForward(lng, lat, crs) {
    var p = _utmParams(crs);
    var a = p.ellipsoid.a, f = p.ellipsoid.f;
    var e2 = f * (2 - f);
    var ep2 = e2 / (1 - e2);
    var k0 = 0.9996;
    var rad = Math.PI / 180;
    var lon0 = (p.zone * 6 - 183) * rad;
    var phi = Number(lat) * rad, lam = Number(lng) * rad;
    var sinPhi = Math.sin(phi), cosPhi = Math.cos(phi), tanPhi = Math.tan(phi);
    var n = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
    var t = tanPhi * tanPhi;
    var c = ep2 * cosPhi * cosPhi;
    var A = cosPhi * (lam - lon0);
    var A2 = A * A;
    var M = a * ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * phi
      - ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) * Math.sin(2 * phi)
      + ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) * Math.sin(4 * phi)
      - ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * phi));
    var prefix = p.south ? 32700 : (p.ellipsoid === UTM_ELLIPSOIDS.etrs89 ? 25800 : 32600);
    return {
      easting: 500000 + k0 * n * (A + ((1 - t + c) * A2 * A) / 6
        + ((5 - 18 * t + t * t + 72 * c - 58 * ep2) * A2 * A2 * A) / 120),
      northing: (p.south ? 10000000 : 0) + k0 * (M + n * tanPhi * (A2 / 2
        + ((5 - t + 9 * c + 4 * c * c) * A2 * A2) / 24
        + ((61 - 58 * t + t * t + 600 * c - 330 * ep2) * A2 * A2 * A2) / 720)),
      crs: 'EPSG:' + (prefix + p.zone),
    };
  }

  // ------------------------------------------------------------------
  // Hover coordinate readout
  // ------------------------------------------------------------------

  /**
   * Print the pointer's position into a small readout element as the cursor
   * moves across the map.
   *
   * MapLibre hands back WGS84 lng/lat, which are the map's own x/y, so they
   * are written straight out at the same 5-decimal precision the surface
   * review card uses for the point it classified, with the project's projected
   * easting/northing on a second line.  The handler only sets text on `el` and
   * never touches the canvas cursor, so it cannot fight the crosshair the
   * inspect / surface-pick modes install.
   *
   * opts: { crs, decimals, projected, labels, emptyText, clearOnLeave, onMove }
   * Returns { el, lastLngLat, setActive, detach }, so a page can feed the very
   * coordinate it just displayed into whatever a click does.
   */
  function attachCoordinateReadout(map, el, opts) {
    if (!map || !el) return null;
    opts = opts || {};
    var decimals = Number(opts.decimals) >= 0 ? Number(opts.decimals) : 5;
    var emptyText = opts.emptyText || 'Hover the map for coordinates';
    var last = null;
    function fmt(v) { return Number(v).toFixed(decimals); }
    function describe(ll) {
      var lines = [];
      lines.push(opts.labels === false
        ? fmt(ll.lng) + ', ' + fmt(ll.lat)
        : 'x ' + fmt(ll.lng) + '  \u00b7  y ' + fmt(ll.lat));
      if (opts.projected !== false) {
        var p = utmForward(ll.lng, ll.lat, opts.crs);
        lines.push('E ' + p.easting.toFixed(2) + '  \u00b7  N ' + p.northing.toFixed(2));
      }
      return lines.join('\n');
    }
    function onMove(e) {
      var ll = e && e.lngLat;
      if (!ll) return;
      last = { lng: Number(ll.lng), lat: Number(ll.lat) };
      el.textContent = describe(last);
      if (typeof opts.onMove === 'function') { opts.onMove(last); }
    }
    function onLeave() {
      if (opts.clearOnLeave !== false) { el.textContent = emptyText; }
    }
    map.on('mousemove', onMove);
    map.on('mouseout', onLeave);
    el.textContent = emptyText;
    return {
      el: el,
      lastLngLat: function () { return last; },
      setActive: function (active) { el.classList.toggle('ftth-coord-readout-active', !!active); },
      detach: function () {
        map.off('mousemove', onMove);
        map.off('mouseout', onLeave);
      },
    };
  }

  /**
   * Create the readout pill inside the map's own container and attach the
   * handler to it.  MapLibre's container already carries position:relative, so
   * this lands in the map's bottom-right corner on every page without each page
   * having to add markup or positioning CSS of its own.
   */
  function mountCoordinateReadout(map, opts) {
    if (!map || typeof map.getContainer !== 'function') return null;
    opts = opts || {};
    var host = map.getContainer();
    if (!host) return null;
    // A page that rebuilds its map (feature review does) would otherwise stack
    // one pill per rebuild inside the same reused container.
    var stale = host.getElementsByClassName('ftth-coord-readout');
    while (stale.length) { stale[0].parentNode.removeChild(stale[0]); }
    var el = document.createElement('div');
    el.className = 'ftth-coord-readout';
    el.id = opts.id || 'coordReadout';
    el.title = opts.title || ('Pointer position \u2014 WGS84 longitude (x) / latitude (y)'
      + (opts.projected === false ? '' : ' and ' + (opts.crs || 'EPSG:25833') + ' easting (E) / northing (N)'));
    host.appendChild(el);
    return attachCoordinateReadout(map, el, opts);
  }

  // ------------------------------------------------------------------
  // Exports
  // ------------------------------------------------------------------

  window.FtthMap = {
    initMap: initMap, getMap: getMap, addGeoJSONLayer: addGeoJSONLayer,
    attachCoordinateReadout: attachCoordinateReadout, mountCoordinateReadout: mountCoordinateReadout,
    utmForward: utmForward,
    setLayerVisible: setLayerVisible, fitToLayers: fitToLayers,
    getBaseStyles: getBaseStyles, setBaseStyle: setBaseStyle,
    SUBLAYER_COLORS: LAYER_COLORS.SUBLAYER_COLORS,
    setIdentifyActive: setIdentifyActive, isIdentifyActive: isIdentifyActive,
    highlightFeature: highlightFeatureData, clearHighlight: clearHighlightLayer,
    resolveFullFeatures: resolveFullFeatures, identifyClick: handleIdentifyClick,
    applyZOrder: applyZOrder, legendHTML: legendHTML, legendSpec: legendSpec,
    SYMBOL_SPEC: SYMBOL_SPEC, LINE_SPEC: LINE_SPEC,
  };
})();
