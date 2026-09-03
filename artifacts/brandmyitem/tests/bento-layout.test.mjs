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
});

test('all bento artwork is contained away from copy on narrow screens', () => {
  assert.match(html, /@media\(max-width:600px\)\{/);
  assert.match(html, /\.fb-bagwrap\{right:22px;top:210px;height:200px\}/);
  assert.match(html, /\.fb-stage\{left:16px;right:16px;top:205px;bottom:64px\}/);
  assert.match(html, /\.fb-shot\{left:auto;right:-22px;bottom:-62px;height:190px\}/);
  assert.match(html, /\.fb-price\{padding:26px 132px 22px 28px;min-height:260px\}/);
  assert.match(html, /\.fb-term \.fb-suit\{right:18px;top:34px;height:96px\}/);
});