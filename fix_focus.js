const fs = require('fs');
let html = fs.readFileSync('artifacts/brandmyitem/index.html', 'utf8');

html = html.replace(
  /\.ios-btn:active\s*\{\s*background:\s*#F9F9F9;\s*\}/,
  `.ios-btn:active {
  background: #F9F9F9;
}
.ios-select:focus-visible,
.ios-input-right:focus-visible,
.ios-input-col:focus-visible {
  outline: none;
}
.ios-item:focus-within {
  background: #F5F5F7;
}`
);

fs.writeFileSync('artifacts/brandmyitem/index.html', html);
