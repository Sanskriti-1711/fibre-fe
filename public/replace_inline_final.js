const fs = require('fs');
const content = fs.readFileSync('dashboard.html', 'utf8');

// Find the main inline script (after the library scripts)
const libEnd = content.indexOf('<script src="js/ftth-lld-api.js"></script>') + 39;
const after = content.substring(libEnd);
const scriptStart = after.indexOf('<script>');
const scriptEnd = after.indexOf('</script>');

if (scriptStart >= 0 && scriptEnd >= 0) {
  const newScript = '\n<script src="js/dashboard.js"></script>';
  const newContent =
    content.substring(0, libEnd + scriptStart) +
    newScript +
    content.substring(libEnd + scriptEnd + 9);
  fs.writeFileSync('dashboard.html', newContent, 'utf8');
  console.log('Replaced inline script with external reference');
} else {
  console.log('Could not find inline script boundaries');
}
