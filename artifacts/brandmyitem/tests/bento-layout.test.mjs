import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function pngSize(name) {
  const bytes = readFileSync(new URL(`../public/${name}`, import.meta.url));
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test('every rotating bento item uses an exact-dimension transparent cutout with tracker geometry', () => {
  const expected = {
    'bento/cutout-macbook.png': [1275, 952],
    'bento/cutout-iphone.png': [952, 1275],
    'bento/cutout-headphones.png': [952, 1275],
    'bento/cutout-case.png': [952, 1275],
  };
  for (const [name, dimensions] of Object.entries(expected)) {
    assert.deepEqual(pngSize(name), dimensions);
    assert.match(
      html,
      new RegExp(`img:'${name.replace('.', '\\.')}'`)
    );
  }
  assert.match(html, /\.fb-stage-inner>svg\{position:absolute;inset:0/);
  assert.match(html, /lockedCatalogPlacements\(\{width:d\.size\[0\], height:d\.size\[1\]\}, type, n\)/);
  assert.match(html, /img:'bento\/cutout-macbook\.png',n:10,type:'macbook'/);
  assert.match(html, /img:'bento\/cutout-iphone\.png',n:5,type:'iphone'/);
  assert.match(html, /img:'bento\/cutout-headphones\.png',n:2,type:'headphones'/);
  assert.match(html, /img:'bento\/cutout-case\.png',n:4,type:'case'/);
  assert.match(html, /'case':\{\s*4:\[\s*\{x:0\.3585,y:0\.4425,w:0\.2770,h:0\.2650,round:18\}/);
  assert.match(html, /'case':\{size:\[952,1275\],surface:\[209,395,534,682\]/);
  assert.match(html, /\.fb-stage \.fb-spot\{fill:none;stroke:#000;stroke-width:1;stroke-linecap:butt;stroke-linejoin:miter;vector-effect:non-scaling-stroke;visibility:visible\}/);
  assert.match(html, /boundarySegments=\[\],segmentKeys=\{\}/);
  assert.match(html, /if\(segmentKeys\[key\]\)return/);
  assert.match(html, /roundedSvg \+= '<rect x="'/);
  assert.match(html, /if\(t\.round\)out\.round=t\.round/);
  assert.match(html, /class="fb-spot-price"/);
  assert.match(html, /class="fb-spot-logo"/);
  assert.doesNotMatch(html, /class="fb-logo-cover"/);
  assert.match(html, /unit\.classList\.toggle\('is-bought',index<boughtCount\)/);
  assert.match(html, /itemMeta\.textContent='\$'\+item\.price\.toLocaleString\(\)\+' retail, '\+item\.n\+' spots'/);
  assert.match(html, /\.fb-stage\{position:absolute;left:20px;right:20px;top:var\(--fb-stage-top,210px\);bottom:58px;[^}]*overflow:hidden\}/);
  assert.match(html, /itemStage\.style\.aspectRatio=frame\.size\[0\]\+'\/'\+frame\.size\[1\]/);
  assert.match(html, /itemStage\.style\.height=frame\.size\[0\]>=frame\.size\[1\]\?'auto':'88%'/);
  assert.match(html, /itemTile\.style\.setProperty\('--fb-stage-top',Math\.ceil\(itemLine\.offsetTop\+itemLine\.offsetHeight\+16\)\+'px'\)/);
  assert.match(html, /requestAnimationFrame\(syncItemStageTop\)/);
});

test('lead suitcase uses four rounded silver-shell boxes that avoid the halo and wheels', () => {
  assert.deepEqual(pngSize('bento/bag.png'), [187, 324]);
  assert.match(html, /<img src="bento\/bag\.png" alt="">\s*<svg viewBox="0 0 187 324">/);
  assert.match(html, /<rect class="fb-spotline" x="15" y="92" width="77\.5" height="90\.5" rx="6"\/>/);
  assert.match(html, /<rect class="fb-spotline" x="94\.5" y="184\.5" width="77\.5" height="90\.5" rx="6"\/>/);
  assert.match(html, /\.fb-spotline\{fill:none;stroke:#000;stroke-width:1;vector-effect:non-scaling-stroke;visibility:visible\}/);
  assert.match(html, /class="fb-lead-price"><text[^>]*>\$543<\/text><text[^>]*>\$543<\/text><text[^>]*>\$542<\/text><text[^>]*>\$542<\/text>/);
  assert.match(html, /class="fb-lead-logo"(?:[\s\S]*?<use href="#fbLidMark"){4}/);
  assert.doesNotMatch(html, /class="fb-lead-(?:price|logo)"><rect/);
});

test('price tile uses the transparent iPhone cutout with black priced tracker spots', () => {
  assert.deepEqual(pngSize('bento/cutout-iphone.png'), [952, 1275]);
  const priceTile = html.match(/<article class="fb-tile fb-price"[\s\S]*?<\/article>/)?.[0];
  assert.ok(priceTile);
  assert.match(priceTile, /class="fb-price-visual"[\s\S]*class="fb-price-phone"/);
  assert.match(html, /\.fb-price\{padding:24px 140px 48px 28px\}/);
  assert.match(html, /\.fb-price h3\{[^}]*max-width:10ch/);
  assert.match(html, /\.fb-price-visual\{[^}]*height:130px;width:calc\(130px \* \(952 \/ 1275\)\)/);
  assert.match(html, /\.fb-price-map \.fb-ps\{fill:none;stroke:#000;stroke-width:1;stroke-linecap:butt;stroke-linejoin:miter/);
  assert.match(html, /parts=\[307,308,308,308,308\]/);
  assert.match(html, /buildOverlaySvg\('iphone', 5, 'fb-ps', 'fb-price-map', parts\)/);
  assert.match(html, /priceUnits\[index\]\.classList\.toggle\('is-bought',fraction>\.92\)/);
});

test('all bento artwork is contained away from copy on narrow screens', () => {
  assert.match(html, /@media\(max-width:600px\)\{/);
  assert.match(html, /\.fb-bagwrap\{right:22px;top:210px;height:200px\}/);
  assert.match(html, /\.fb-stage\{left:16px;right:16px;bottom:64px\}/);
  assert.match(html, /\.fb-shot\{left:-22px;right:auto;height:190px\}/);
  assert.match(html, /\.fb-shot\{position:absolute;left:-30px;right:auto;top:var\(--fb-shot-top,250px\);height:236px;z-index:1/);
  assert.match(html, /checkinTile\.style\.setProperty\('--fb-shot-top',Math\.ceil\(proofRect\.bottom-tileRect\.top\+16\)\+'px'\)/);
  assert.match(html, /\.fb-price\{padding:26px 132px 48px 28px;min-height:260px\}/);
  assert.match(html, /\.fb-term \.fb-suit\{right:18px;top:34px;height:96px\}/);
});

test('the direct bento anchor remains on the home view', () => {
  assert.match(html, /var anchorId=h==='homeFeatureBento'\?h:''/);
  assert.match(html, /if\(h\.indexOf\('home-'\)===0\|\|anchorId\)h='home'/);
  assert.match(html, /target\.scrollIntoView\(\{behavior:'auto',block:'start'\}\)/);
  assert.match(html, /if\(location\.hash==='#homeFeatureBento'\)\{\s*root\.classList\.add\('in'\)/);
});

test('every bento claim matches the actual marketplace rules', () => {
  assert.doesNotMatch(html, /One photo a month|That's it|A real MacBook, bought|Refunded automatically, never held|3 of 5 spots claimed|September verified/);
  assert.match(html, /<h3>Your logo, actually on something\.<\/h3>/);
  assert.match(html, /Sticker, patch, embroidery, or engraving\. Applied to a real item, carried in public for the whole term\./);
  assert.match(html, /<h3>Not funded\? Refunded\.<\/h3>/);
  assert.match(html, /Not fully funded by day 60, every buyer is refunded automatically\./);
  assert.match(html, /<h3>Real items, not points\.<\/h3>/);
  assert.match(html, /When the last spot sells, BrandMyItem buys the item new at retail and ships it straight to the owner\./);
  assert.match(html, /<h3>Proof, on a schedule\.<\/h3>/);
  assert.match(html, /One photo each cycle, weekly, biweekly, or monthly, showing the item and its placements in use\./);
  assert.match(html, /combined all-in<br>spot total/);
  assert.match(html, /<h3>Priced by surface\.<\/h3>/);
  assert.match(html, /<h3>Pick the term\.<\/h3>/);
  assert.match(html, /Locked from the moment it's live\./);
  assert.match(html, /\.feature-bento \.fb-tile h3\{[^}]*text-align:left;margin:0 0 10px;max-width:17ch/);
  assert.match(html, /\.feature-bento \.fb-tile p\{[^}]*text-align:left;margin:0 0 16px/);
  assert.doesNotMatch(html, /\.feature-bento \.fb-tile (?:h3|p)\{[^}]*text-align:center/);
  assert.match(html, /Example: first spot sold/);
  assert.match(html, /\.feature-bento \.fb-row\{[^}]*background:var\(--fg\);color:#fff;[^}]*border-radius:999px/);
  assert.match(html, /\.feature-bento \.fb-due,\.feature-bento \.fb-verified\{background:var\(--fg\);color:#fff;border:1px solid var\(--fg\)\}/);
  assert.match(html, /\.feature-bento \.fb-term-status\{[^}]*background:var\(--fg\);color:#fff;[^}]*border-radius:999px/);
  assert.doesNotMatch(html, /[·・]|&middot;/);
  assert.match(html, /dayUnit\.textContent=day===1\?'day':'days'/);
  assert.match(html, /Not funded by day 60\. Refunds initiated\./);
});

test('FAQ and footer use the supplied complete structure without legacy duplicates', () => {
  assert.doesNotMatch(html, /<h2>Asked and answered\.<\/h2>/);
  assert.doesNotMatch(html, /Everything owners and brands ask before they use BrandMyItem, in plain language\. BrandMyItem is operated by IRLi LLC\./);
  assert.doesNotMatch(html, /class="faq-grid legacy-faq-grid"/);
  assert.match(html, /The term is locked from the moment the listing goes live and cannot be changed\./);
  assert.match(html, /both are locked from the moment the listing is published\./);
});

test('check-in proofs use a clean transparent four-column structure', () => {
  assert.match(html, /\.feature-bento \.fb-proof\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\);gap:10px;width:min\(100%,300px\)/);
  assert.match(html, /\.feature-bento \.fb-proof img,\.feature-bento \.fb-proof \.fb-next-proof\{[^}]*aspect-ratio:4\/3;[^}]*border:2px solid #000/);
  assert.deepEqual(pngSize('bento/checkin-cycle-1.png'), [1536, 2752]);
  assert.deepEqual(pngSize('bento/checkin-cycle-2.png'), [1536, 2752]);
  assert.deepEqual(pngSize('bento/checkin-cycle-3.png'), [1536, 2752]);
  assert.match(html, /<figure><img src="bento\/checkin-cycle-1\.png" alt=""><figcaption>Cycle 1<\/figcaption><\/figure>/);
  assert.match(html, /<figure><img src="bento\/checkin-cycle-2\.png" alt=""><figcaption>Cycle 2<\/figcaption><\/figure>/);
  assert.match(html, /<figure><img src="bento\/checkin-cycle-3\.png" alt=""><figcaption>Cycle 3<\/figcaption><\/figure>/);
  assert.match(html, /\.fb-checkin\[data-phase="3"\] \.fb-proof-flight:nth-child\(1\)\{animation:fbProofFly/);
  assert.match(html, /@keyframes fbProofFly/);
  assert.match(html, /var startX=shotRect\.left-tileRect\.left\+shotRect\.width\*\.096/);
  assert.match(html, /flight\.style\.setProperty\('--flight-dx'/);
  assert.match(html, /flight\.style\.setProperty\('--flight-dy'/);
  assert.match(html, /\.feature-bento \.fb-next-proof\{position:relative;background:transparent;overflow:hidden\}/);
  assert.doesNotMatch(html, /\.feature-bento \.fb-next-proof\{[^}]*background:#fff/);
});