const fs = require('fs');
const content = fs.readFileSync('js/dashboard.js', 'utf8');

// Count parens excluding string literals and comments
let openParen = 0;
let inString = false;
let stringChar = '';
let inComment = false;

for (let i = 0; i < content.length; i++) {
  const c = content[i];
  const next = content[i + 1];

  if (!inString && !inComment) {
    if (c === '"' || c === "'") {
      inString = true;
      stringChar = c;
    } else if (c === '/' && next === '/') {
      inComment = true;
    } else if (c === '(') openParen++;
    else if (c === ')') openParen--;
  } else if (inString) {
    if (c === stringChar && content[i - 1] !== '\\') inString = false;
  } else if (inComment) {
    if (c === '\r' || c === '\n') inComment = false;
  }

  if (openParen < 0) {
    console.log('Negative at', i, 'context:', content.substring(Math.max(0, i - 20), i + 20));
    break;
  }
}
console.log('Final:', openParen);
