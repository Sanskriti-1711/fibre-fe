const fs = require('fs');
let content = fs.readFileSync('js/dashboard.js', 'utf8');

// Remove leading whitespace
content = content.trimStart();

// Fix the extra closing braces in renderKpis
content = content.replace(
  /\}\s*\}\s*\}\s*\n\s*\/\* A chart whose data failed/,
  '}\n\n/* A chart whose data failed'
);

fs.writeFileSync('js/dashboard.js', content, 'utf8');
console.log('Fixed');

// Verify syntax
try {
  new Function(fs.readFileSync('js/dashboard.js', 'utf8'));
  console.log('Syntax OK');
} catch (e) {
  console.log('Syntax Error:', e.message);
}
