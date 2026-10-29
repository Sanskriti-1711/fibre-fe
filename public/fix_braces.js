const fs = require('fs');
let content = fs.readFileSync('js/dashboard.js', 'utf8');

// Fix the extra closing braces in renderKpis
content = content.replace(
  /\}\s*\}\s*\}\s*\n\s*\/\* A chart whose data failed/,
  '}\n\n/* A chart whose data failed'
);
console.log('Fixed extra braces');

fs.writeFileSync('js/dashboard.js', content, 'utf8');
console.log('Fixed extra braces');

// Verify syntax
try {
  new Function(fs.readFileSync('js/dashboard.js', 'utf8'));
  console.log('Syntax OK');
} catch (e) {
  console.log('Syntax Error:', e.message);
}
