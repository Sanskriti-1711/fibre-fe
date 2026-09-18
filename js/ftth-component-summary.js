/**
 * ftth-component-summary.js — component KPI cards for the HLD / LLD results pages.
 *
 * Mirrors the trench-design page's summary grid, but for every component:
 * trenches by construction class, ducts (ways / material metres), cables
 * (fibres), chambers by sub-category (Bore / Manhole / Handhole), poles,
 * aerial drops. Fed from the SAME GeoJSON the map already loads — no extra
 * network calls: the results page calls FtthComponentSummary.accumulate()
 * for each layer it fetches, then render() into a container element.
 *
 * Lengths are metre-scaled from WGS84 degrees (equirectangular at 52.5°N —
 * the project's latitude); they are summary-card numbers, not BOQ figures.
 */
(function () {
  'use strict';

  var M_PER_DEG_LAT = 110574.0;
  var M_PER_DEG_LON = 111320.0; // at 52.5°N, the project latitude

  function lineParts(geom) {
    if (!geom || !geom.coordinates) return [];
    if (geom.type === 'LineString') return [geom.coordinates];
    if (geom.type === 'MultiLineString') return geom.coordinates;
    return [];
  }

  function partLenM(pts, lat) {
    var cosLat = Math.cos((lat || 52.5) * Math.PI / 180);
    var total = 0;
    for (var i = 1; i < pts.length; i++) {
      var dx = (pts[i][0] - pts[i - 1][0]) * M_PER_DEG_LON * cosLat;
      var dy = (pts[i][1] - pts[i - 1][1]) * M_PER_DEG_LAT;
      total += Math.sqrt(dx * dx + dy * dy);
    }
    return total;
  }

  function geomLenM(geom, lat) {
    var t = 0;
    lineParts(geom).forEach(function (p) { t += partLenM(p, lat); });
    return t;
  }

  function num(v, d) {
    var n = parseFloat(v);
    return isNaN(n) ? (d || 0) : n;
  }

  // Trench construction class: the closed three-value set (+ HDD alias).
  function trenchClass(p) {
    var t = String(p.trench_type || p.TRENCH_TYPE || p.CONSTRUCT || p.USAGE_TYPE || '').trim();
    if (/hdd|drill|bore/i.test(t)) return 'HDD';
    if (/garden/i.test(t)) return 'Garden';
    if (/aerial/i.test(t)) return 'Aerial';
    return 'Open Cut';
  }

  function tierOf(p) {
    var t = String(p.sublayer || p.CABLE_TYPE || p.trench_type || p.TRENCH_TYPE || p.USAGE_TYPE || '').trim();
    if (/feeder/i.test(t)) return 'Feeder';
    if (/distribution/i.test(t)) return 'Distribution';
    if (/drop|garden/i.test(t)) return 'Drop';
    return '';
  }

  function emptyState() {
    return { trenches: {}, ducts: {}, cables: {}, chambers: {}, poles: 0, aerial: 0, _lat: null };
  }

  var state = emptyState();

  var api = {
    /** Reset accumulated stats (the page calls this before loading layers). */
    reset: function () { state = emptyState(); },

    /** Accumulate one layer's GeoJSON. layerName is the public layer name. */
    accumulate: function (layerName, geojson) {
      var feats = (geojson && geojson.features) || [];
      feats.forEach(function (f) {
        var p = (f && f.properties) || {};
        var g = f && f.geometry;
        var lat = g && g.coordinates && g.coordinates.length ? g.coordinates[0][1] : null;
        if (Array.isArray(lat)) { try { lat = lat[1]; } catch (e) { lat = null; } }
        if (lat == null && state._lat != null) lat = state._lat;
        if (lat != null) state._lat = lat;
        var lenM = geomLenM(g, lat);
        var name = String(layerName || '').toLowerCase();

        if (name.indexOf('trench') !== -1) {
          var cls = trenchClass(p);
          var t = state.trenches[cls] || (state.trenches[cls] = { count: 0, len: 0 });
          t.count++; t.len += lenM;
          if (/aerial/i.test(String(p.AERIAL_REASON || p.trench_type || '')) || num(p.AERIAL) === 1) state.aerial++;
        } else if (name.indexOf('duct') !== -1) {
          var tier = tierOf(p);
          var d = state.ducts[tier || 'Ducts'] || (state.ducts[tier || 'Ducts'] = { count: 0, len: 0, ways: 0, bundle: 0 });
          d.count++; d.len += lenM;
          d.ways += num(p.WAYS_TOTAL, num(p.capacity_total, num(p.WAYS, 1)));
          d.bundle += num(p.BUNDLE_LEN_M, lenM);
        } else if (name.indexOf('cable') !== -1) {
          var ct = tierOf(p);
          var c = state.cables[ct || 'Cables'] || (state.cables[ct || 'Cables'] = { count: 0, len: 0, fibers: 0, hh: 0 });
          c.count++; c.len += lenM;
          c.fibers += num(p.FIBER_COUNT);
          c.hh += num(p.HH_COUNT, num(p.hhs));
        } else if (name.indexOf('chamber') !== -1) {
          var sub = String(p.SUBTYPE || '').trim();
          if (!sub) {
            var code = String(p.CHAMBER_TYPE || '').trim();
            sub = code === 'MH' ? 'Manhole' : code === 'DHH' ? 'Handhole' : code === 'HH' ? 'Handhole' : (String(p.REASON || '').match(/hdd|bore/i) ? 'Bore' : 'Handhole');
          }
          var ch = state.chambers[sub] || (state.chambers[sub] = { count: 0 });
          ch.count++;
        } else if (name.indexOf('pole') !== -1) {
          state.poles++;
        }
      });
    },

    /** Render the KPI cards into the element (replaces its content). */
    render: function (el) {
      if (!el) return;
      var cards = [];

      // Trenches by construction class
      var tOrder = ['Open Cut', 'HDD', 'Garden', 'Aerial'];
      var tLen = 0, tCnt = 0;
      tOrder.forEach(function (k) {
        var t = state.trenches[k];
        if (!t) return;
        tLen += t.len; tCnt += t.count;
        cards.push({ label: k + ' trench', value: fmtM(t.len), sub: t.count + ' spans' });
      });
      if (tCnt) cards.unshift({ label: 'Trench total', value: fmtM(tLen), sub: tCnt + ' spans' });

      // Ducts by tier
      Object.keys(state.ducts).sort().forEach(function (k) {
        var d = state.ducts[k];
        cards.push({
          label: k + ' duct',
          value: fmtM(d.bundle || d.len),
          sub: d.count + ' feat · ' + d.ways + ' ways' + (d.bundle ? ' (bundle)' : ''),
        });
      });

      // Cables by tier
      Object.keys(state.cables).sort().forEach(function (k) {
        var c = state.cables[k];
        cards.push({
          label: k + ' cable',
          value: fmtM(c.len),
          sub: c.count + ' runs · ' + fmtInt(c.fibers) + 'F',
        });
      });

      // Chambers by sub-category
      var cOrder = ['Bore', 'Manhole', 'Handhole'];
      cOrder.forEach(function (k) {
        var ch = state.chambers[k];
        if (ch) cards.push({ label: k, value: String(ch.count), sub: 'chambers' });
      });

      if (state.poles) cards.push({ label: 'Poles', value: String(state.poles), sub: 'aerial' });
      if (state.aerial) cards.push({ label: 'Aerial drops', value: String(state.aerial), sub: 'flagged legs' });

      if (!cards.length) {
        el.innerHTML = '<div style="font-size:12px;color:#6B7280;padding:6px 0;">No component data yet.</div>';
        return;
      }
      el.innerHTML = cards.map(function (c) {
        return '<div class="ftth-summary-item"><div class="value">' + esc(c.value) + '</div>'
          + '<div class="label">' + esc(c.label) + (c.sub ? ' <span style="font-weight:400;color:#9CA3AF;">· ' + esc(c.sub) + '</span>' : '') + '</div></div>';
      }).join('');
    },
  };

  function fmtM(m) {
    if (m >= 1000) return (m / 1000).toFixed(2) + ' km';
    return Math.round(m) + ' m';
  }
  function fmtInt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.FtthComponentSummary = api;
})();
