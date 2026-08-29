const fs = require('fs');
let html = fs.readFileSync('artifacts/brandmyitem/index.html', 'utf8');

html = html.replace(
  /\.ios-input-box:focus\s*\{\s*border-color:\s*#1D1D1F;\s*\}/,
  `.ios-input-box:focus,
.ios-input-box:focus-visible {
  outline: none;
  border-color: #1D1D1F;
}`
);

fs.writeFileSync('artifacts/brandmyitem/index.html', html);
