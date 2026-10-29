const fs = require('fs');
let content = fs.readFileSync('js/dashboard.js', 'utf8');

// Fix loadAll to remove loadRuns
content = content.replace(
  'await Promise.all([loadHld(), loadQueue(), loadRuns(), loadPermits(), loadTotal()]);',
  'await Promise.all([loadHld(), loadQueue(), loadPermits(), loadTotal()]);'
);

// Fix renderDonuts to remove LLD runs bars
const start = content.indexOf('    // LLD runs bars');
if (start >= 0) {
  let bc = 0;
  let foundOpen = false;
  let endIdx = -1;
  for (let i = start; i < content.length; i++) {
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
    content = content.substring(0, start) + content.substring(endIdx);
    console.log('Removed LLD runs bars from dashboard.js');
  }
}

// Remove state.runs references in renderTimeline
content = content.replace(
  /\(state\.runs \|\| \[\]\)\.forEach\(function \(r\) \{[\s\S]*?\}\);/g,
  ''
);

// Fix state.runs check in renderTimeline
content = content.replace(
  /if \(state\.hld === null \&\& state\.runs === null\) \{/g,
  'if (state.hld === null) {'
);

// Fix renderKpis to use trend instead of spark - using simple string replace
content = content.replace(
  "kpiValue('hld', 'kpiHld', 'kpiHldNote', hld.length, hldDone + ' completed',\n      'sparkHld', '#6366F1', dailySeries(hld, function (p) { return p.created_at; }));",
  "// kpiValue('hld', 'kpiHld', 'kpiHldNote', hld.length, hldDone + ' completed',\n      'trendHld', { higherIsBetter: true }, dailySeries(hld, function (p) { return p.created_at; }));"
);

content = content.replace(
  "kpiValue('queue', 'kpiPending', 'kpiPendingNote', pending, readyCount + ' projects LLD-ready',\n      'sparkPending', '#047857', queue.map(function (p) { return p.pending || 0; }));",
  "kpiValue('queue', 'kpiPending', 'kpiPendingNote', pending, readyCount + ' projects LLD-ready',\n      'trendPending', { higherIsBetter: false }, queue.map(function (p) { return p.pending || 0; }));"
);

content = content.replace(
  "kpiValue('total', 'kpiTotal', 'kpiTotalNote', state.total, 'across all stage flags',\n      'sparkTotal', '#E31837', dailySeries(state.allProjects || [], function (p) { return p.created_at; }));",
  "kpiValue('total', 'kpiTotal', 'kpiTotalNote', state.total, 'across all stage flags',\n      'trendTotal', { higherIsBetter: true }, dailySeries(state.allProjects || [], function (p) { return p.created_at; }));"
);

content = content.replace(
  "kpiValue('permits', 'kpiPermit', 'kpiPermitNote', 0, '', 'sparkPermit', '#92400E', []);",
  "kpiValue('permits', 'kpiPermit', 'kpiPermitNote', 0, '', 'trendPermit', { higherIsBetter: true }, []);"
);

content = content.replace(
  "kpiValue('permits', 'kpiPermit', 'kpiPermitNote', groups,\n        readyN + ' ready \u00B7 ' + identN + ' identified \u00B7 ' + (pm.projects_with_permits || 0) + ' project(s) \u00B7 ' + pm.total + ' sections',\n        'sparkPermit', '#92400E', (pm.projects || []).map(function (p) { return p.groups || p.permits || 0; }));",
  "var permitSeries = (pm.projects || []).map(function (p) { return p.groups || p.permits || 0; });\n      kpiValue('permits', 'kpiPermit', 'kpiPermitNote', groups,\n        readyN + ' ready \u00B7 ' + identN + ' identified \u00B7 ' + (pm.projects_with_permits || 0) + ' project(s) \u00B7 ' + pm.total + ' sections',\n        'trendPermit', { higherIsBetter: true }, permitSeries);"
);

content = content.replace(
  "kpiValue('permits', 'kpiPermit', 'kpiPermitNote', 0, 'no analysis run yet', 'sparkPermit', '#92400E', [0]);",
  "kpiValue('permits', 'kpiPermit', 'kpiPermitNote', 0, 'no analysis run yet', 'trendPermit', { higherIsBetter: true }, [0]);"
);

// Fix describeCharts to use trend instead of spark
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

fs.writeFileSync('js/dashboard.js', content, 'utf8');
console.log('Fixed dashboard.js');
