const fs = require('fs');
let content = fs.readFileSync('js/dashboard.js', 'utf8');

// 1. Fix loadAll to remove loadRuns
content = content.replace(
  'await Promise.all([loadHld(), loadQueue(), loadRuns(), loadPermits(), loadTotal()]);',
  'await Promise.all([loadHld(), loadQueue(), loadPermits(), loadTotal()]);'
);

// 2. Remove LLD runs bars section from renderDonuts
const lldBarsStart = content.indexOf('    // LLD runs bars');
if (lldBarsStart >= 0) {
  let bc = 0;
  let foundOpen = false;
  let endIdx = -1;
  for (let i = lldBarsStart; i < content.length; i++) {
    if (content[i] === '{') {
      bc++;
      foundOpen = true;
    } else if (content[i] === '}') {
      bc--;
      if (bc === 0 && foundOpen) {
        endIdx = i + 1;
        break;
      }
    }
  }
  if (endIdx > 0) {
    content = content.substring(0, lldBarsStart) + content.substring(endIdx);
    console.log('Removed LLD runs bars');
  }
}

// 3. Remove state.runs references in renderTimeline
content = content.replace(
  /\(state\.runs \|\| \[\]\)\.forEach\(function \(r\) \{[\s\S]*?\}\);/g,
  ''
);
content = content.replace(
  /if \(state\.hld === null \&\& state\.runs === null\) \{/g,
  'if (state.hld === null) {'
);

// 4. Replace kpiValue function using regex
const kpiValueRegex =
  /function kpiValue\(healthKey, id, noteId, value, note, spark, sparkColor, series\) \{[\s\S]*?drawSpark\(\$\('spark'\), series, sparkColor\);\s*\}\s*\n/;
const kpiValueNew = `function kpiValue(healthKey, id, noteId, value, note, trendId, trendConfig, series) {
    if (health[healthKey] === 'fail') {
      var v = $(id);
      if (v) { v.textContent = '—'; v.classList.add('value-unknown'); v.setAttribute('title', 'Could not load'); }
      if ($(noteId)) { $(noteId).textContent = 'unavailable'; }
      if (trendId) renderTrend(trendId, 0, trendConfig, []);
      return;
    }
    var el = $(id);
    if (el) el.classList.remove('value-unknown');
    countUp(el, value);
    if ($(noteId)) $(noteId).textContent = note;
    if (trendId) renderTrend(trendId, value, trendConfig, series);
  }

  // Render a trend chip: compares last value vs 7 days ago
  function renderTrend(trendId, currentValue, config, series) {
    var el = $(trendId);
    if (!el) return;
    config = config || {};
    var higherIsBetter = config.higherIsBetter !== false;
    var seriesArr = (series || []).filter(function (v) { return v != null; });
    if (seriesArr.length < 8) { el.innerHTML = ''; return; }
    var lastIdx = seriesArr.length - 1;
    var prevIdx = Math.max(0, lastIdx - 7);
    var current = seriesArr[lastIdx] || 0;
    var previous = seriesArr[prevIdx] || 0;
    if (previous === 0) {
      el.innerHTML = '<span class="kpi-trend-chip flat"><span class="trend-icon">→</span><span class="trend-value">—</span></span>';
      return;
    }
    var diff = current - previous;
    var pct = Math.round((diff / previous) * 100);
    var absPct = Math.abs(pct);
    var isUp = diff > 0;
    var isDown = diff < 0;
    var isGood = isUp ? higherIsBetter : !higherIsBetter;
    var cls = isGood ? 'down' : (isUp || isDown ? 'up' : 'flat');
    var icon = isUp ? '↑' : (isDown ? '↓' : '→');
    var label = isGood ? '+' + absPct + '%' : (isUp || isDown ? absPct + '%' : '—');
    el.innerHTML = '<span class="kpi-trend-chip ' + cls + '"><span class="trend-icon">' + icon + '</span><span class="trend-value">' + label + '</span></span>';
  }`;

if (
  content.match(
    /function kpiValue\(healthKey, id, noteId, value, note, spark, sparkColor, series\) \{[\s\S]*?drawSpark\(\$\('spark'\), series, sparkColor\);\s*\}\s*\n/
  )
) {
  content = content.replace(kpiValueRegex, kpiValueNew);
  console.log('Replaced kpiValue function');
} else {
  console.log('kpiValue pattern not found, skipping');
}

// 5. Replace renderKpis function
const renderKpisRegex = /function renderKpis\(\) \{[\s\S]*?^\s*\}\s*$/m;
const renderKpisNew = `function renderKpis() {
    var hld = state.hld || [], queue = state.queue || [];

    var hldDone = hld.filter(function (p) { return String(p.status || '').indexOf('complete') !== -1; }).length;
    // kpiValue('hld', 'kpiHld', 'kpiHldNote', hld.length, hldDone + ' completed',
    //   'trendHld', { higherIsBetter: true }, dailySeries(hld, function (p) { return p.created_at; }));

    var pending = queue.reduce(function (s, p) { return s + (p.pending || 0); }, 0);
    var readyCount = queue.filter(function (p) { return p.ready; }).length;
    kpiValue('queue', 'kpiPending', 'kpiPendingNote', pending, readyCount + ' projects LLD-ready',
      'trendPending', { higherIsBetter: false }, queue.map(function (p) { return p.pending || 0; }));

    kpiValue('total', 'kpiTotal', 'kpiTotalNote', state.total, 'across all stage flags',
      'trendTotal', { higherIsBetter: true }, dailySeries(state.allProjects || [], function (p) { return p.created_at; }));

    var pm = state.permits;
    if (health.permits === 'fail') {
      kpiValue('permits', 'kpiPermit', 'kpiPermitNote', 0, '', 'trendPermit', { higherIsBetter: true }, []);
    } else if (pm && (pm.total || pm.total_groups)) {
      var groups = pm.total_groups || pm.total;
      var readyN = pm.ready || 0;
      var identN = (pm.group_by_status && pm.group_by_status.identified) || 0;
      var permitSeries = (pm.projects || []).map(function (p) { return p.groups || p.permits || 0; });
      kpiValue('permits', 'kpiPermit', 'kpiPermitNote', groups,
        readyN + ' ready · ' + identN + ' identified · ' + (pm.projects_with_permits || 0) + ' project(s) · ' + pm.total + ' sections',
        'trendPermit', { higherIsBetter: true }, permitSeries);
    } else {
      kpiValue('permits', 'kpiPermit', 'kpiPermitNote', 0, 'no analysis run yet', 'trendPermit', { higherIsBetter: true }, [0]);
    }
  }`;

content = content.replace(renderKpisRegex, renderKpisNew);
console.log('Replaced renderKpis function');

// 5. Fix describeCharts
content = content.replace(
  "FtthUI.describeCanvas($('sparkHld'), 'Fourteen-day trend of HLD runs created.');\n",
  ''
);
content = content.replace(
  "FtthUI.describeCanvas($('sparkPending'), 'Pending review count per project.');\n",
  "FtthUI.describeCanvas($('trendPending'), 'Pending review count trend. Compare current to 7 days ago.');\n"
);
content = content.replace(
  "FtthUI.describeCanvas($('sparkLld'), 'Fourteen-day trend of LLD runs started.');\n",
  ''
);
content = content.replace(
  "FtthUI.describeCanvas($('sparkTotal'), 'Fourteen-day trend of projects created.');\n",
  "FtthUI.describeCanvas($('trendTotal'), 'Project creation trend. Compare current to 7 days ago.');\n"
);
content = content.replace(
  "FtthUI.describeCanvas($('sparkPermit'), 'Permit groups per project.');\n",
  "FtthUI.describeCanvas($('trendPermit'), 'Permit groups trend. Compare current to 7 days ago.');\n"
);

// 6. Fix loadAll to remove loadRuns
content = content.replace(
  'await Promise.all([loadHld(), loadQueue(), loadRuns(), loadPermits(), loadTotal()]);',
  'await Promise.all([loadHld(), loadQueue(), loadPermits(), loadTotal()]);'
);

// 7. Remove state.runs references in renderTimeline
content = content.replace(
  /\(state\.runs \|\| \[\]\)\.forEach\(function \(r\) \{[\s\S]*?\}\);/g,
  ''
);
content = content.replace(
  /if \(state\.hld === null \&\& state\.runs === null\) \{/g,
  'if (state.hld === null) {'
);

// 8. Remove LLD runs bars from renderDonuts (second pass)
const lldBarsStart2 = content.indexOf('    // LLD runs bars');
if (lldBarsStart2 >= 0) {
  let bc = 0;
  let foundOpen = false;
  let endIdx = -1;
  for (let i = lldBarsStart2; i < content.length; i++) {
    if (content[i] === '{') {
      bc++;
      foundOpen = true;
    } else if (content[i] === '}') {
      bc--;
      if (bc === 0 && foundOpen) {
        endIdx = i + 1;
        break;
      }
    }
  }
  if (endIdx > 0) {
    content = content.substring(0, lldBarsStart2) + content.substring(endIdx);
    console.log('Removed LLD runs bars (second pass)');
  }
}

// Remove state.runs references in renderTimeline (second pass)
content = content.replace(
  /\(state\.runs \|\| \[\]\)\.forEach\(function \(r\) \{[\s\S]*?\}\);/g,
  ''
);
content = content.replace(
  /if \(state\.hld === null \&\& state\.runs === null\) \{/g,
  'if (state.hld === null) {'
);

fs.writeFileSync('js/dashboard.js', content, 'utf8');
console.log('Fixed dashboard.js');

// Verify syntax
try {
  new Function(fs.readFileSync('js/dashboard.js', 'utf8'));
  console.log('Syntax OK');
} catch (e) {
  console.log('Syntax Error:', e.message);
  console.log('Stack:', e.stack);
}
