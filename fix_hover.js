const fs = require('fs');
let html = fs.readFileSync('artifacts/brandmyitem/index.html', 'utf8');

html = html.replace(
  /\.ios-btn:active\s*\{\s*background:\s*#F9F9F9;\s*\}/,
  `.ios-btn:hover {
  background: #FAFAFA;
}
.ios-btn:active {
  background: #F0F0F0;
}`
);

fs.writeFileSync('artifacts/brandmyitem/index.html', html);
