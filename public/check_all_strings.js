const fs = require('fs');
const content = fs.readFileSync('js/dashboard.js', 'utf8');

// Check template literals for paren balance
const templates = content.match(/`[^`]*`/g) || [];
templates.forEach((t, i) => {
  let open = 0;
  for (let c of t) {
    if (c === '(') open++;
    else if (c === ')') open--;
  }
  if (open !== 0) console.log('Template ' + i + ' imbalance:', open, t.substring(0, 80));
});

// Check all strings
const strings = content.match(/(['"])([^"\\]|\\.)*\1/g) || [];
strings.forEach((s, i) => {
  let open = 0;
  for (let c of s) {
    if (c === '(') open++;
    else if (c === ')') open--;
  }
  if (open !== 0) console.log('String imbalance:', open, s.substring(0, 80));
});

// Check comments
const comments = content.match(/\/\/[^\n]*/g) || [];
comments.forEach((c, i) => {
  let open = 0;
  for (let ch of c) {
    if (ch === '(') open++;
    else if (ch === ')') open--;
  }
  if (open !== 0) console.log('Comment imbalance:', open, c.substring(0, 80));
});

const blockComments = content.match(/\/\*[\s\S]*?\*\//g) || [];
blockComments.forEach((c, i) => {
  let open = 0;
  for (let ch of c) {
    if (ch === '(') open++;
    else if (ch === ')') open--;
  }
  if (open !== 0) console.log('Block comment imbalance:', open, c.substring(0, 80));
});
