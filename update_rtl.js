const fs = require('fs');
let html = fs.readFileSync('artifacts/brandmyitem/index.html', 'utf8');

html = html.replace(
  /\.ios-select\s*\{[\s\S]*?padding:\s*0;\s*\}/,
  `.ios-select {
  appearance: none;
  background: transparent;
  border: none;
  font-size: 13.5px;
  font-weight: 400;
  color: var(--mfg);
  text-align: right;
  direction: rtl;
  width: 100%;
  outline: none;
  cursor: pointer;
  padding: 0;
}`
);

html = html.replace(
  /\.ios-input-right\s*\{[\s\S]*?padding:\s*0;\s*\}/,
  `.ios-input-right {
  appearance: none;
  background: transparent;
  border: none;
  font-size: 13.5px;
  font-weight: 400;
  color: var(--fg);
  text-align: right;
  direction: rtl;
  width: 100%;
  outline: none;
  padding: 0;
}`
);

fs.writeFileSync('artifacts/brandmyitem/index.html', html);
