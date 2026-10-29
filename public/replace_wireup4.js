const fs = require('fs');
let content = fs.readFileSync('dashboard.html', 'utf8');

// Use the exact section we found
const oldSection =
  "/* wire up \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n  $('btnRefresh').addEventListener('click', loadAll);\n  $('queueSearch').addEventListener('input', function () {\n    renderQueueTable(this.value.trim());\n  });";

const newSection =
  "/* wire up \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n  $('btnRefresh').addEventListener('click', loadAll);\n\n  // Debounced queue search (300ms)\n  var debouncedQueueSearch = FtthUI.debounce(function (value) {\n    renderQueueTable(value.trim());\n  }, 300);\n  $('queueSearch').addEventListener('input', function () {\n    debouncedQueueSearch(this.value);\n  });\n\n  // Keyboard shortcuts\n  document.addEventListener('keydown', function (e) {\n    // Ignore if typing in an input/textarea/select\n    var tag = e.target.tagName.toLowerCase();\n    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;\n\n    switch (e.key.toLowerCase()) {\n      case 'r': // Refresh\n        if (!loading) loadAll();\n        break;\n      case '/': // Focus search\n        e.preventDefault();\n        $('queueSearch').focus();\n        break;\n      case 'escape': // Clear search\n        if ($('queueSearch').value) { $('queueSearch').value = ''; renderQueueTable(''); }\n        break;\n      case '1': // Jump to HLD\n        location.href = 'ftth-hld-projects.html';\n        break;\n      case '2': // Jump to Survey\n        location.href = 'ftth-survey-changes.html';\n        break;\n      case '3': // Jump to LLD\n        location.href = 'ftth-lld-outputs.html';\n        break;\n    }\n  });";

if (content.includes(oldSection)) {
  content = content.replace(oldSection, newSection);
  fs.writeFileSync('dashboard.html', content, 'utf8');
  console.log('Replaced successfully');
} else {
  console.log('OLD SECTION NOT FOUND');
  console.log('Looking for first 100 chars:', oldSection.substring(0, 100));
}
