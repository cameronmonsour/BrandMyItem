const fs = require('fs');
let html = fs.readFileSync('artifacts/brandmyitem/index.html', 'utf8');

html = html.replace(
  /\.ios-item-col\s*\{[\s\S]*?gap:\s*2px;/,
  `.ios-item-col {
  flex-direction: column;
  align-items: stretch;
  padding: 10px 16px;
  gap: 2px;`
);

fs.writeFileSync('artifacts/brandmyitem/index.html', html);
