import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = html.match(/function cuCreateTracedShape\(\)\{[\s\S]*?\n\}/)?.[0];

assert.ok(source, 'cuCreateTracedShape should exist in index.html');

test('closing a trace creates one polygon shape instead of rectangular partitions', () => {
  const sandbox = {
    CU: {
      poly: [[0.1, 0.1], [0.8, 0.1], [0.7, 0.7], [0.2, 0.8]],
      tiles: [],
      prices: [],
      color: '#1D1D1F',
      sel: -1,
      closed: false,
    },
    B: { prices: [] },
    boxPrices: () => [100],
  };

  vm.runInNewContext(`${source}; result = cuCreateTracedShape()`, sandbox);

  assert.equal(sandbox.result, true);
  assert.equal(sandbox.CU.tiles.length, 1);
  assert.equal(sandbox.CU.tiles[0].shape, 'poly');
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.CU.tiles[0].pts)),
    sandbox.CU.poly,
  );
  assert.equal(sandbox.CU.closed, true);
});

test('the tracer no longer partitions a completed outline into boxes', () => {
  assert.doesNotMatch(html, /function cuPartition\(/);
  assert.match(html, /toast\('Custom shape created'\)/);
  assert.match(html, /if\(!CU\.customized&&CU\.tiles\.length\)\{\s*CU\.tiles=\[\]/);
});

test('Delete and Backspace remove a selected shape when not tracing', () => {
  assert.match(
    html,
    /else if\(\(e\.key==='Backspace'\|\|e\.key==='Delete'\)&&!CU\.tracing&&CU\.sel>=0\)\{\s*e\.preventDefault\(\);deleteSelectedShape\(true\);/,
  );
  assert.match(html, /cv\.focus\(\);\s*\/\* boxes first: resize handle, then body \*\//);
});

test('finish and size choices update the details card', () => {
  assert.match(html, /B\.color=c\[0\];\s*sel\.textContent=c\[0\];\s*renderBuildSpecs\(k\)/);
  assert.match(html, /B\.variantSize=s\[0\]/);
  assert.match(html, /var selectedRetail=variantRetail\(k,selectedSize\)/);
  assert.match(html, /if\(r\[0\]==='Color'\)value=selectedColor/);
  assert.match(html, /if\(option&&option\[2\]&&Object\.prototype\.hasOwnProperty\.call\(option\[2\],r\[0\]\)\)value=option\[2\]\[r\[0\]\]/);
});

test('official catalog data stores sources, verification dates, and exact option prices', () => {
  assert.match(html, /case:\{label:'Original Cabin',brand:'RIMOWA'.*retail:1550/);
  assert.match(html, /paddle:\{label:'Perseus Pro V Pickleball Paddle'.*retail:299\.95/);
  assert.match(html, /suit:\{label:'Black Merino Wool Tuxedo Suit',brand:'StudioSuits'.*retail:303/);
  assert.match(html, /backpack:\{label:'The Commuter Backpack',brand:'Away'.*retail:228/);
  assert.match(html, /verified:'2026-08-29',source:'https:\/\//);
  assert.match(html, /\['16"',900,\{Model:'16-inch MacBook Pro \(M5 Pro\)'/);
  assert.match(html, /retail:variantRetail\(B\.type,B\.variantSize\)/);
  assert.match(html, /minimumFractionDigits:hasCents\?2:0/);
  assert.doesNotMatch(html, /parseInt\(document\.getElementById\('cuRetail'\)/);
});