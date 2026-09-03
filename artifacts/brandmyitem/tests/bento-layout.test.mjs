import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function pngSize(name) {
  const bytes = readFileSync(new URL(`../public/bento/${name}`, import.meta.url));
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test('every rotating bento item uses its source photo without an overlay', () => {
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
      new RegExp(`img:'bento/${name.replace('.', '\\.')}'`),
    );
  }
  assert.match(html, /\.fb-stage>img\{[^}]*width:auto;height:auto/);
  assert.doesNotMatch(html, /itemSvg|splitBentoGrid|sizeItemOverlay/);
  assert.match(html, /itemMeta\.textContent='\$'\+item\.price\.toLocaleString\(\)\+' retail · '\+item\.n\+' spots'/);
});

test('price tile uses a clean product photo without traced labels', () => {
  assert.deepEqual(pngSize('phone.png'), [68, 149]);
  const priceTile = html.match(/<article class="fb-tile fb-price"[\s\S]*?<\/article>/)?.[0];
  assert.ok(priceTile);
  assert.match(priceTile, /class="fb-price-visual"[\s\S]*class="fb-price-phone"/);
  assert.doesNotMatch(priceTile, /<svg|fb-ps|fb-label|33⅓%/);
  assert.match(html, /\.fb-price\{padding:26px 140px 22px 28px\}/);
  assert.match(html, /\.fb-price h3\{[^}]*max-width:9ch/);
  assert.match(html, /\.fb-price-visual\{[^}]*height:130px;width:calc\(130px \* \(68 \/ 149\)\)/);
  assert.match(html, /parts=\[257,256,256\]/);
});

test('all bento artwork is contained away from copy on narrow screens', () => {
  assert.match(html, /@media\(max-width:600px\)\{/);
  assert.match(html, /\.fb-bagwrap\{right:22px;top:210px;height:200px\}/);
  assert.match(html, /\.fb-stage\{left:16px;right:16px;top:205px;bottom:64px\}/);
  assert.match(html, /\.fb-shot\{left:auto;right:-22px;bottom:-62px;height:190px\}/);
  assert.match(html, /\.fb-price\{padding:26px 132px 22px 28px;min-height:260px\}/);
  assert.match(html, /\.fb-term \.fb-suit\{right:18px;top:34px;height:96px\}/);
});

test('bento product photos contain no placement outlines or sponsor stamps', () => {
  const bentoCss = html.match(/\.feature-bento\{[\s\S]*?\/\* --- APPLE-STYLE ITEM PAGE --- \*\//)?.[0];
  assert.ok(bentoCss);
  assert.doesNotMatch(bentoCss, /fb-spot|fb-stamp|fb-price-map|fb-spotline/);
  assert.match(bentoCss, /\.fb-done\{[^}]*bottom:54px/);
  assert.doesNotMatch(html, /class="fb-spot"|class="fb-stamp"|class="fb-spotline"/);
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
  assert.match(html, /combined spot total<br>includes 40%/);
  assert.match(html, /<h3>One clear price per spot\.<\/h3>/);
  assert.doesNotMatch(html, /class="fb-price-map"/);
  assert.doesNotMatch(html, /id="fbItemSvg"/);
  assert.match(html, /Example: first spot sold/);
  assert.match(html, /dayUnit\.textContent=day===1\?'day':'days'/);
  assert.match(html, /Not funded by day 60\. Refunds initiated\./);
});