const fs = require('fs');
let html = fs.readFileSync('artifacts/brandmyitem/index.html', 'utf8');

// The block to replace
const targetBlock = `<label class="ios-item">
              <span class="ios-label">All items</span>
              <input type="radio" name="fst" value="all" class="ios-radio" checked>
              <svg class="ios-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            </label>
            <label class="ios-item">
              <span class="ios-label">Open spots</span>
              <input type="radio" name="fst" value="open" class="ios-radio">
              <svg class="ios-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            </label>
            <label class="ios-item">
              <span class="ios-label">Fully branded</span>
              <input type="radio" name="fst" value="done" class="ios-radio">
              <svg class="ios-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            </label>`;

const newBlock = `<label class="ios-item">
              <input type="radio" name="fst" value="all" class="ios-radio" checked>
              <span class="ios-label">All items</span>
              <svg class="ios-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            </label>
            <label class="ios-item">
              <input type="radio" name="fst" value="open" class="ios-radio">
              <span class="ios-label">Open spots</span>
              <svg class="ios-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            </label>
            <label class="ios-item">
              <input type="radio" name="fst" value="done" class="ios-radio">
              <span class="ios-label">Fully branded</span>
              <svg class="ios-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            </label>`;

html = html.replace(targetBlock, newBlock);
fs.writeFileSync('artifacts/brandmyitem/index.html', html);
