import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function pngSize(name) {
  const bytes = readFileSync(new URL(`../public/bento/${name}`, import.meta.url));
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test('every rotating bento overlay uses its image intrinsic dimensions', () => {
  const expected = {
    'macbook.png': [268, 207],
    'cooler.png': [191, 154],
    'weekender.png': [225, 180],
    'backpack.png': [152, 216],
  };
  for (const [name, dimensions] of Object.entries(expected)) {
    assert.deepEqual(pngSize(name), dimensions);
    assert.match(
      html,
      new RegExp(`img:'bento/${name.replace('.', '\\.')}',vb:\\[${dimensions[0]},${dimensions[1]}\\]`),
    );
  }
  assert.match(html, /\.fb-stage>img\{[^}]*width:auto;height:auto/);
  assert.match(html, /itemSvg\.style\.width=imageBox\.width\+'px';itemSvg\.style\.height=imageBox\.height\+'px'/);
  assert.match(html, /function splitBentoGrid\(surface,n\)/);
  assert.match(html, /surface:\[18,18,232,154\][^}]*n:6/);
  assert.match(html, /surface:\[54,55,117,65\][^}]*n:2/);
  assert.match(html, /surface:\[30,52,162,119\][^}]*n:2/);
  assert.match(html, /surface:\[29,44,91,140\][^}]*n:2/);
  assert.match(html, /items\.forEach\(function\(item\)\{item\.spots=splitBentoGrid\(item\.surface,item\.n\)\}\)/);
  assert.match(html, /itemSvg\.setAttribute\('preserveAspectRatio','none'\)/);
});

test('price surface and labels share the exact product coordinate space', () => {
  assert.deepEqual(pngSize('phone.png'), [68, 149]);
  const priceTile = html.match(/<article class="fb-tile fb-price"[\s\S]*?<\/article>/)?.[0];
  assert.ok(priceTile);
  assert.match(priceTile, /class="fb-price-visual"[\s\S]*class="fb-price-phone"[\s\S]*class="fb-price-map" viewBox="0 0 68 149"/);
  assert.equal((priceTile.match(/class="fb-ps"/g) || []).length, 3);
  assert.equal((priceTile.match(/class="fb-label"/g) || []).length, 3);
  assert.match(html, /\.fb-price\{padding:26px 140px 22px 28px\}/);
  assert.match(html, /\.fb-price h3\{[^}]*max-width:9ch/);
  assert.match(html, /\.fb-price-visual\{[^}]*height:130px;width:calc\(130px \* \(68 \/ 149\)\)/);
  assert.match(priceTile, /x="12" y="71" width="42" height="14\.667"/);
  assert.match(priceTile, /33⅓% · \$183/);
  assert.match(html, /parts=\[183,183,183\]/);
});

test('all bento artwork is contained away from copy on narrow screens', () => {
  assert.match(html, /@media\(max-width:600px\)\{/);
  assert.match(html, /\.fb-bagwrap\{right:22px;top:210px;height:200px\}/);
  assert.match(html, /\.fb-stage\{left:16px;right:16px;top:205px;bottom:64px\}/);
  assert.match(html, /\.fb-shot\{left:auto;right:-22px;bottom:-62px;height:190px\}/);
  assert.match(html, /\.fb-price\{padding:26px 132px 22px 28px;min-height:260px\}/);
  assert.match(html, /\.fb-term \.fb-suit\{right:18px;top:34px;height:96px\}/);
});

test('bento placement outlines are solid and never covered by the funded badge', () => {
  const bentoCss = html.match(/\.feature-bento\{[\s\S]*?\/\* --- APPLE-STYLE ITEM PAGE --- \*\//)?.[0];
  assert.ok(bentoCss);
  assert.doesNotMatch(bentoCss, /stroke-dasharray/);
  assert.match(bentoCss, /\.fb-stage \.fb-spot\{[^}]*stroke-width:2;vector-effect:non-scaling-stroke;visibility:hidden/);
  assert.match(bentoCss, /\.fb-mac\[data-phase="1"\] \.fb-spot,.feature-bento \.fb-mac\[data-phase="2"\] \.fb-spot\{visibility:visible\}/);
  assert.match(bentoCss, /\.fb-done\{[^}]*bottom:54px/);
  assert.match(html, /<rect class="fb-spot" vector-effect="non-scaling-stroke"/);
});

test('the direct bento anchor remains on the home view', () => {
  assert.match(html, /var anchorId=h==='homeFeatureBento'\?h:''/);
  assert.match(html, /if\(h\.indexOf\('home-'\)===0\|\|anchorId\)h='home'/);
  assert.match(html, /target\.scrollIntoView\(\{behavior:'auto',block:'start'\}\)/);
});

test('every bento claim matches the actual marketplace rules', () => {
  assert.doesNotMatch(html, /One photo a month|That's it|A real MacBook, bought|Refunded automatically, never held|3 of 5 spots claimed|September verified/);
  assert.match(html, /one current photo on the locked weekly, biweekly, or monthly cadence/);
  assert.match(html, /If every spot isn't purchased by day 60, refunds are initiated to the original payment method within 5 business days/);
  assert.match(html, /applies every sponsor mark, and delivers it to the Owner within 60 days/);
  assert.match(html, /spot prices = retail<br>\+30% fees at checkout/);
  assert.match(html, /<h3>Spot price = surface share\.<\/h3>/);
  assert.match(html, /\.fb-math\{[^}]*top:116px/);
  assert.match(html, /Example: first spot sold/);
  assert.match(html, /dayUnit\.textContent=day===1\?'day':'days'/);
  assert.match(html, /Not funded by day 60\. Refunds initiated\./);
});