const fs = require('fs');
let content = fs.readFileSync('dashboard.html', 'utf8');

// Get the exact section using a more precise approach
const idx = content.indexOf('/* wire up');
const endIdx = content.indexOf('});\n\n// subtle stagger', idx);
const oldSection = content.substring(idx, endIdx);

console.log('Old section length:', oldSection.length);
console.log('Old section:');
console.log(JSON.stringify(oldSection));

const newSection = `/* wire up \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n  $('btnRefresh').addEventListener('click', loadAll);\n\n  // Debounced queue search (300ms)\n  var debouncedQueueSearch = FtthUI.debounce(function (value) {\n    renderQueueTable(value.trim());\n  }, 300);\n  $('queueSearch').addEventListener('input', function () {\n    debouncedQueueSearch(this.value);\n  });\n\n  // Keyboard shortcuts\n  document.addEventListener('keydown', function (e) {\n    // Ignore if typing in an input/textarea/select\n    var tag = e.target.tagName.toLowerCase();\n    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;\n\n    switch (e.key.toLowerCase()) {\n      case 'r': // Refresh\n        if (!loading) loadAll();\n        break;\n      case '/': // Focus search\n        e.preventDefault();\n        $('queueSearch').focus();\n        break;\n      case 'escape': // Clear search\n        if ($('queueSearch').value) { $('queueSearch').value = ''; renderQueueTable(''); }\n        break;\n      case '1': // Jump to HLD\n        location.href = 'ftth-hld-projects.html';\n        break;\n      case '2': // Jump to Survey\n        location.href = 'ftth-survey-changes.html';\n        break;\n      case '3': // Jump to LLD\n        location.href = 'ftth-lld-outputs.html';\n        break;\n    }\n  });`;

const newContent = content.substring(0, idx) + newSection + content.substring(endIdx);
if (newContent !== content) {
  fs.writeFileSync('dashboard.html', newContent, 'utf8');
  console.log('Replaced successfully');
} else {
  console.log('Replacement failed');
}
