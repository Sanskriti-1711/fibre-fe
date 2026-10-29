const fs = require('fs');
const content = fs.readFileSync('dashboard.html', 'utf8');
const libEnd = content.indexOf('<script src="js/ftth-lld-api.js"></script>') + 39;
const after = content.substring(libEnd);
const scriptStart = after.indexOf('<script>');
const scriptEnd = after.indexOf('</script>');
console.log('libEnd:', libEnd);
console.log('scriptStart:', scriptStart);
console.log('scriptEnd:', scriptEnd);
if (scriptStart >= 0 && scriptEnd >= 0) {
  const script = after.substring(scriptStart + 8, scriptEnd);
  fs.writeFileSync('js/dashboard.js', script, 'utf8');
  console.log('Extracted dashboard.js, length:', script.length);
  try {
    new Function(script);
    console.log('Syntax OK');
  } catch (e) {
    console.log('Syntax Error:', e.message);
  }
}
