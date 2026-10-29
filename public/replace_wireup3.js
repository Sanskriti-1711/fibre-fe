const fs = require('fs');
let content = fs.readFileSync('dashboard.html', 'utf8');

// Use regex to find the exact section
const oldRegex =
  /\/\* wire up [\s\S]*?\*\/[\r\n]+  \$\('btnRefresh'\)\.addEventListener\('click', loadAll\);[\r\n]+  \$\('queueSearch'\)\.addEventListener\('input', function \(\) \{\r\n    renderQueueTable\(this\.value\.trim\(\)\);[\r\n]+\s+\}\);/;

const newSection = `/* wire up \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n  $('btnRefresh').addEventListener('click', loadAll);\r\n\r\n  // Debounced queue search (300ms)\r\n  var debouncedQueueSearch = FtthUI.debounce(function (value) {\r\n    renderQueueTable(value.trim());\r\n  }, 300);\r\n  $('queueSearch').addEventListener('input', function () {\r\n    debouncedQueueSearch(this.value);\r\n  });\r\n\r\n  // Keyboard shortcuts\r\n  document.addEventListener('keydown', function (e) {\r\n    // Ignore if typing in an input/textarea/select\r\n    var tag = e.target.tagName.toLowerCase();\r\n    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;\r\n\r\n    switch (e.key.toLowerCase()) {\r\n      case 'r': // Refresh\r\n        if (!loading) loadAll();\r\n        break;\r\n      case '/': // Focus search\r\n        e.preventDefault();\r\n        $('queueSearch').focus();\r\n        break;\r\n      case 'escape': // Clear search\r\n        if ($('queueSearch').value) { $('queueSearch').value = ''; renderQueueTable(''); }\r\n        break;\r\n      case '1': // Jump to HLD\r\n        location.href = 'ftth-hld-projects.html';\r\n        break;\r\n      case '2': // Jump to Survey\r\n        location.href = 'ftth-survey-changes.html';\r\n        break;\r\n      case '3': // Jump to LLD\r\n        location.href = 'ftth-lld-outputs.html';\r\n        break;\r\n    }\r\n  });`;

const newContent = content.replace(oldRegex, newSection);
if (newContent !== content) {
  fs.writeFileSync('dashboard.html', newContent, 'utf8');
  console.log('Replaced successfully');
} else {
  console.log('OLD SECTION NOT FOUND');
}
