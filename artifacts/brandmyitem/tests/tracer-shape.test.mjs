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