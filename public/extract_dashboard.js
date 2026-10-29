const fs = require('fs');
const content = fs.readFileSync('dashboard.html', 'utf8');

// Find the main inline script (after the library scripts)
const idx = content.indexOf('<script src="js/ftth-lld-api.js"></script>');
if (idx >= 0) {
  const after = content.substring(idx + 39);
  const scriptStart = after.indexOf('<script>');
  const scriptEnd = after.indexOf('</script>');
  if (scriptStart >= 0 && scriptEnd >= 0) {
    const script = after.substring(scriptStart + 8, scriptEnd);
    fs.writeFileSync('js/dashboard.js', script, 'utf8');
    console.log('Extracted dashboard.js, length:', script.length);
  }
}
