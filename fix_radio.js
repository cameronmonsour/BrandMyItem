const fs = require('fs');
let html = fs.readFileSync('artifacts/brandmyitem/index.html', 'utf8');

html = html.replace(
  /\.ios-radio\s*\{\s*display:\s*none;\s*\}/,
  `.ios-radio {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.ios-radio:focus-visible ~ .ios-label {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
  border-radius: 2px;
}`
);

fs.writeFileSync('artifacts/brandmyitem/index.html', html);
