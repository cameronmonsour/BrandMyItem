import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('removes the screenshot-only homepage and page headers', () => {
  assert.doesNotMatch(html, />From post to proof\.</);
  assert.doesNotMatch(html, /<div class="eyebrow">How it works<\/div>/);
  assert.doesNotMatch(html, />Get your item paid for by brands</);
  assert.doesNotMatch(html, />See live items &rarr;</);
  assert.doesNotMatch(html, /<h2>Live items<\/h2>/);
  assert.doesNotMatch(html, /font-size:clamp\(28px,4vw,40px\)[^>]*>Track my item</);
  assert.match(html, /class="home-bento"/);
  assert.match(html, /id="home-faq"/);
  assert.match(html, />Asked and answered\.</);
  assert.match(html, /home-flow-index">5<\/span><h3>Monthly check-in<\/h3>/);
  assert.match(html, /how-it-works-monthly-check-in\.png/);
  assert.match(html, /\.home-flow-icon\.photo\.monthly img\{object-fit:contain\}/);
});

test('uses transparent outline product art for category and item picker thumbnails', () => {
  assert.match(html, /var catPhoto=c\.item&&\(\(typeof HERO_SOURCE_FILES!=='undefined'&&HERO_SOURCE_FILES\[c\.item\]\)\|\|ITEM_PHOTOS\[c\.item\]\)/);
  assert.match(html, /var photo=\(typeof HERO_SOURCE_FILES!=='undefined'&&HERO_SOURCE_FILES\[k\]\)\?HERO_SOURCE_FILES\[k\]/);
  assert.match(html, /\.cat \.ic img\{[^}]*border:0;outline:0;background:transparent;box-shadow:none\}/);
  assert.match(html, /\.itemcard img\{[^}]*border:0;outline:0;box-shadow:none/);
});