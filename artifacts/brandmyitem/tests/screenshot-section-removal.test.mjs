import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('removes the screenshot-only homepage and page headers', () => {
  assert.doesNotMatch(html, /id="home-faq"/);
  assert.doesNotMatch(html, />From post to proof\.</);
  assert.doesNotMatch(html, />Asked and answered\.</);
  assert.doesNotMatch(html, />Get your item paid for by brands</);
  assert.doesNotMatch(html, />See live items &rarr;</);
  assert.doesNotMatch(html, /<h2>Live items<\/h2>/);
  assert.doesNotMatch(html, /font-size:clamp\(28px,4vw,40px\)[^>]*>Track my item</);
  assert.match(html, /home-flow-index">5<\/span><h3>Monthly check-in<\/h3>/);
  assert.match(html, /how-it-works-monthly-check-in\.png/);
  assert.match(html, /\.home-flow-icon\.photo\.monthly img\{object-fit:contain\}/);
});