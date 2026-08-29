const fs = require('fs');
let html = fs.readFileSync('artifacts/brandmyitem/index.html', 'utf8');

// The old rail CSS block to replace
const oldCSSRegex = /\.rail\s*\{[\s\S]*?\.filter-clear:hover\s*\{[\s\S]*?\}/;

const newCSS = `/* Native Apple-like Filter Rail */
.rail {
  position: sticky;
  top: 76px;
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
}
.ios-group {
  display: flex;
  flex-direction: column;
}
.ios-group-head {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--mfg);
  margin-bottom: 6px;
  padding-left: 16px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ios-box {
  background: #FFFFFF;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);
}
.ios-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 16px;
  position: relative;
  background: #FFFFFF;
  min-height: 40px;
  cursor: pointer;
}
.ios-item + .ios-item::before {
  content: "";
  position: absolute;
  top: 0;
  left: 16px;
  right: 0;
  height: 1px;
  background: var(--border);
}
.ios-item:active {
  background: #F9F9F9;
}
.ios-item-col {
  flex-direction: column;
  align-items: flex-start;
  padding: 10px 16px;
  gap: 2px;
  cursor: default;
}
.ios-item-col:active {
  background: #FFFFFF;
}
.ios-label {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--fg);
  white-space: nowrap;
  flex-shrink: 0;
}
.ios-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 1;
  min-width: 0;
  margin-left: 12px;
}
.ios-select {
  appearance: none;
  background: transparent;
  border: none;
  font-size: 13.5px;
  font-weight: 400;
  color: var(--mfg);
  text-align: right;
  width: 100%;
  outline: none;
  cursor: pointer;
  padding: 0;
}
.ios-select option {
  direction: ltr;
}
.ios-chevron {
  width: 14px;
  height: 14px;
  color: #C7C7CC;
  margin-left: 4px;
  flex-shrink: 0;
  display: block;
}
.ios-input-right {
  appearance: none;
  background: transparent;
  border: none;
  font-size: 13.5px;
  font-weight: 400;
  color: var(--fg);
  text-align: right;
  width: 100%;
  outline: none;
  padding: 0;
}
.ios-input-right::placeholder {
  color: #C7C7CC;
}
.ios-input-col {
  appearance: none;
  background: transparent;
  border: none;
  font-size: 13.5px;
  font-weight: 400;
  color: var(--fg);
  width: 100%;
  outline: none;
  padding: 4px 0 2px;
}
.ios-input-col::placeholder {
  color: #C7C7CC;
}
.ios-pricerow {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-top: 6px;
}
.ios-input-box {
  flex: 1;
  min-width: 0;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--wash2);
  padding: 0 10px;
  font-size: 13.5px;
  color: var(--fg);
  outline: none;
  transition: border-color 0.15s;
}
.ios-input-box:focus {
  border-color: #1D1D1F;
}
.ios-radio {
  display: none;
}
.ios-check {
  width: 16px;
  height: 16px;
  color: #1D1D1F;
  display: none;
}
.ios-radio:checked ~ .ios-check {
  display: block;
}
.ios-btn {
  width: 100%;
  background: #FFFFFF;
  border: 1px solid var(--border);
  border-radius: 12px;
  color: #FF3B30;
  font-size: 14px;
  font-weight: 500;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);
  transition: background 0.1s;
}
.ios-btn:active {
  background: #F9F9F9;
}`;

html = html.replace(oldCSSRegex, newCSS);

// Also replace the mobile `.rail` media query updates
const mediaRegex = /\.rail\{position:static;flex-direction:row;flex-wrap:wrap\}[\s\S]*?\.rail \.card\{flex:1;min-width:230px\}/;
html = html.replace(mediaRegex, `.rail{position:static;flex-direction:column;gap:16px}`);

fs.writeFileSync('artifacts/brandmyitem/index.html', html);
