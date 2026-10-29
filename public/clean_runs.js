const fs = require('fs');
const content = fs.readFileSync('dashboard.html', 'utf8');

// Remove the remaining runs references in renderDonuts
let newContent = content
  .replace(/\s*\$\('lldChartHint'\)\.textContent = runs\.length \+ ' runs';\s*/g, '')
  .replace(
    /\s*if \(!runs\.length\) \{\s*barEl\.innerHTML = '<div class="dash-bar-empty">No LLD runs yet â€” run LLD after survey approval\.<\/div>';\s*return;\s*\}/g,
    ''
  )
  .replace(
    /\s*var byProject = \{\};[\s\S]*?runs\.forEach\(function \(r\) \{[\s\S]*?byProject\[key\]\.n\+\+;\s*\}\);/g,
    ''
  )
  .replace(
    /\s*var rows = Object\.keys\(byProject\)\.map\(function \(k\) \{ return byProject\[k\]; \}\)[\s\S]*?requestAnimationFrame\(function \(\) \{[\s\S]*?\}\);/g,
    ''
  );

// Remove state.runs in renderTimeline
newContent = newContent.replace(
  /\(state\.runs \|\| \[\]\)\.forEach\(function \(r\) \{[\s\S]*?\}\);/g,
  ''
);

// Remove state.runs check in renderTimeline
newContent = newContent.replace(
  /if \(state\.hld === null \&\& state\.runs === null\) \{/g,
  'if (state.hld === null) {'
);

fs.writeFileSync('dashboard.html', newContent, 'utf8');
console.log('Cleaned all runs references');
