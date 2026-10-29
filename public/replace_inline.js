const fs = require('fs');
const content = fs.readFileSync('dashboard.html', 'utf8');
const inlineStart = 27727;
const inlineEnd = content.indexOf('</script>', inlineStart) + 9;
const newScript = '<script src="js/dashboard.js"></script>';
const newContent = content.substring(0, inlineStart) + newScript + content.substring(inlineEnd);
fs.writeFileSync('dashboard.html', newContent, 'utf8');
console.log('Replaced inline script with external reference. New length:', newContent.length);
