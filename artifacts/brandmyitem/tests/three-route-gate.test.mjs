import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('defers three.js and loaders until the builder route is requested', () => {
  assert.doesNotMatch(html, /<script\s+src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js/);
  assert.match(html, /<script type="text\/plain" id="threeGltfLoaderSource">/);
  assert.match(html, /<script type="text\/plain" id="threeDecalGeometrySource">/);
  assert.match(html, /function\(\)\{\s+if\(promise\)return promise;/);
  assert.match(html, /if\(h==='build'\)\{\s+showBuild\(\);\s+\/\* Network, loader parsing, and WebGL are builder-only work\./);
  assert.match(html, /core\.src='https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js'/);
});