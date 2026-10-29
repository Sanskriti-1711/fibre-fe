const fs = require('fs');
const content = fs.readFileSync('js/dashboard.js', 'utf8');

// Find template literals with parens
const templateLiterals = content.match(/`[^`]*`/g) || [];
templateLiterals.forEach((t, i) => {
  if (t.includes('(') || t.includes(')')) {
    console.log('Template literal ' + i + ':', t.substring(0, 100));
  }
});

// Find regular strings with parens
const strings = content.match(/(['"])([^"\\]|\\.)*\1/g) || [];
strings.forEach((s, i) => {
  if (s.includes('(') || s.includes(')')) {
    console.log('String ' + i + ':', s.substring(0, 100));
  }
});
