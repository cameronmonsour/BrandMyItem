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
  assert.match(html, /\.fb-stage \.fb-spot\{fill:none;stroke:#000;stroke-width:1\.5;vector-effect:non-scaling-stroke;visibility:visible\}/);
  assert.match(html, /var rx = 6;/);
  assert.match(html, /class="fb-spot-price"/);
  assert.match(html, /class="fb-spot-logo"/);
  assert.match(html, /unit\.classList\.toggle\('is-bought',index<boughtCount\)/);
  assert.match(html, /itemMeta\.textContent='\$'\+item\.price\.toLocaleString\(\)\+' retail · '\+item\.n\+' spots'/);
});

test('lead suitcase restores the approved framing', () => {
  assert.deepEqual(pngSize('bento/bag.png'), [187, 324]);
  assert.match(html, /<img src="bento\/bag\.png" alt="">\s*<svg viewBox="0 0 187 324">/);
  assert.match(html, /<rect class="fb-spotline" x="13" y="86" width="160" height="225" rx="8"\/>/);
  assert.match(html, /\.fb-spotline\{fill:none;stroke:#000;stroke-width:1\.5;vector-effect:non-scaling-stroke;visibility:visible\}/);
  assert.match(html, /class="fb-lead-price"[\s\S]*\$2,170/);
  assert.match(html, /class="fb-lead-logo"[\s\S]*href="#fbLidMark"/);
});

test('price tile uses the transparent iPhone cutout with black priced tracker spots', () => {
  assert.deepEqual(pngSize('bento/cutout-iphone.png'), [952, 1275]);
  const priceTile = html.match(/<article class="fb-tile fb-price"[\s\S]*?<\/article>/)?.[0];
  assert.ok(priceTile);
  assert.match(priceTile, /class="fb-price-visual"[\s\S]*class="fb-price-phone"/);
  assert.match(html, /\.fb-price\{padding:24px 140px 48px 28px\}/);
  assert.match(html, /\.fb-price h3\{[^}]*max-width:10ch/);
  assert.match(html, /\.fb-price-visual\{[^}]*height:130px;width:calc\(130px \* \(952 \/ 1275\)\)/);
  assert.match(html, /\.fb-price-map \.fb-ps\{fill:none;stroke:#000;stroke-width:1\.5/);
  assert.match(html, /parts=\[307,308,308,308,308\]/);
  assert.match(html, /buildOverlaySvg\('iphone', 5, 'fb-ps', 'fb-price-map', parts\)/);
  assert.match(html, /priceUnits\[index\]\.classList\.toggle\('is-bought',fraction>\.92\)/);
});

test('all bento artwork is contained away from copy on narrow screens', () => {
  assert.match(html, /@media\(max-width:600px\)\{/);
  assert.match(html, /\.fb-bagwrap\{right:22px;top:210px;height:200px\}/);
  assert.match(html, /\.fb-stage\{left:16px;right:16px;top:205px;bottom:64px\}/);
  assert.match(html, /\.fb-shot\{left:auto;right:-22px;bottom:-62px;height:190px\}/);
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
  assert.match(html, /one current photo on the locked weekly, biweekly, or monthly cadence/);
  assert.match(html, /If every spot isn't purchased by day 60, refunds are initiated to the original payment method within 5 business days/);
  assert.match(html, /applies every sponsor mark, and delivers it to the Owner within 60 days/);
  assert.match(html, /combined spot total<br>includes 40%/);
  assert.match(html, /<h3>One clear price per spot\.<\/h3>/);
  assert.match(html, /Example: first spot sold/);
  assert.match(html, /dayUnit\.textContent=day===1\?'day':'days'/);
  assert.match(html, /Not funded by day 60\. Refunds initiated\./);
});