import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const pointInPolygonSource = html.match(/function pointInPolygon\(x,y,pts\)\{[\s\S]*?\n\}/)?.[0];
const tileContainsPointSource = html.match(/function tileContainsPoint\(t,x,y\)\{[\s\S]*?\n\}/)?.[0];

assert.ok(pointInPolygonSource, 'pointInPolygon should exist in index.html');
assert.ok(tileContainsPointSource, 'tileContainsPoint should exist in index.html');

const sandbox = {};
vm.runInNewContext(`${pointInPolygonSource};${tileContainsPointSource}`, sandbox);

const upper = {
  shape: 'poly',
  x: 0.5,
  y: 0.3,
  w: 0.6,
  h: 0.4,
  pts: [[0.2, 0.4], [0.3, 0.1], [0.7, 0.1], [0.8, 0.4]],
};
const lower = {
  shape: 'poly',
  x: 0.5,
  y: 0.6,
  w: 0.6,
  h: 0.4,
  pts: [[0.2, 0.4], [0.8, 0.4], [0.7, 0.8], [0.3, 0.8]],
};

test('polygon placements hit inside their visible contour', () => {
  assert.equal(sandbox.tileContainsPoint(upper, 0.5, 0.2), true);
  assert.equal(sandbox.tileContainsPoint(lower, 0.5, 0.65), true);
});

test('polygon placements miss points inside their bounds but outside curved corners', () => {
  assert.equal(sandbox.tileContainsPoint(upper, 0.21, 0.11), false);
  assert.equal(sandbox.tileContainsPoint(lower, 0.79, 0.79), false);
});

test('shared polygon edges are selectable by either adjoining placement', () => {
  assert.equal(sandbox.tileContainsPoint(upper, 0.5, 0.4), true);
  assert.equal(sandbox.tileContainsPoint(lower, 0.5, 0.4), true);
});

test('rectangle placement hit testing remains bounds-based', () => {
  const rectangle = { shape: 'rect', x: 0.5, y: 0.5, w: 0.4, h: 0.2 };
  assert.equal(sandbox.tileContainsPoint(rectangle, 0.3, 0.4), true);
  assert.equal(sandbox.tileContainsPoint(rectangle, 0.29, 0.4), false);
});

test('the custom editor uses shape-aware body selection after rectangle corner handles', () => {
  assert.match(
    html,
    /if\(t\.shape!=='poly'&&i===CU\.sel\)[\s\S]*?if\(tileContainsPoint\(t,x,y\)\)\{/,
  );
});