import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('photo placement migration includes the surface scanner geometry', () => {
  assert.match(html, /var PHOTO_PLACEMENT_VERSION=8/);
  assert.match(html, /function scanPhotoPlacements\(img,type,n\)/);
  assert.match(html, /edgeDistance=new Uint16Array\(W\*H\)/);
  assert.match(html, /Math\.min\(W,H\)\*0\.045/);
  assert.match(html, /if\(type!=='headphones'\)/);
  assert.match(html, /getImageData\(0,0,W,H\)/);
  assert.match(html, /var hi=Math\.max\(r,gr,b\),lo=Math\.min\(r,gr,b\),neutral=hi-lo<68/);
  assert.match(html, /if\(type==='headphones'\)visible=a>24&&neutral&&dist>3&&hi<253/);
  assert.match(html, /rowWidths\[trimY\]>=widest\*0\.45/);
  assert.match(html, /while\(qh<qt\)/);
  assert.match(html, /shape:'poly',pts:points/);
});

test('headphones always use two full-width polygon placements', () => {
  const headphones = html.match(/headphones:\{\s*2:\[([\s\S]*?)\]\s*\}\s*\};/)?.[1];
  assert.ok(headphones, 'headphone reference geometry should exist');
  assert.equal((headphones.match(/shape:'poly'/g) || []).length, 2);
  assert.equal((headphones.match(/w:0\.478/g) || []).length, 2);
  assert.match(html, /headphones:\{x0:0\.25,x1:0\.75,y0:0\.43,y1:0\.91,cols:1\}/);
  assert.match(html, /n=type==='headphones'\?2:/);
  assert.match(html, /if\(t==='headphones'\)B\.slots=2/);
  assert.match(html, /Headphones use exactly two full ear-cup placements/);
  assert.match(html, /if\(CU\.template==='headphones'\)\{\s*B\.slots=2;/);
});

test('polygon points and catalog identity survive template and detail rendering', () => {
  assert.match(html, /if\(tt\.pts\)out\.pts=tt\.pts\.map/);
  assert.match(html, /sourceType:CU\.template\|\|null/);
  assert.match(html, /sourceType:CUR\.sourceType/);
  assert.match(html, /var scanType=l\.sourceType\|\|l\.type/);
});

test('posting and rendering preserve adjusted polygon placement geometry', () => {
  const copySource = html.match(/function copyPhotoTile\(t\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(copySource, 'copyPhotoTile should exist in index.html');

  const sandbox = {};
  vm.runInNewContext(copySource, sandbox);
  const adjusted = {
    x: 0.48,
    y: 0.56,
    w: 0.42,
    h: 0.19,
    shape: 'poly',
    pts: [[0.29, 0.5], [0.42, 0.44], [0.68, 0.51], [0.63, 0.65], [0.34, 0.64]],
  };
  const saved = sandbox.copyPhotoTile(adjusted);

  assert.deepEqual(JSON.parse(JSON.stringify(saved.pts)), adjusted.pts);
  assert.notEqual(saved.pts, adjusted.pts);
  assert.match(html, /if\(!l\.tiles\|\|!l\.tiles\.length\)\{\s*var scanType=l\.sourceType\|\|l\.type;/);
  assert.doesNotMatch(
    html,
    /if\(CU\.template==='headphones'\)\{[\s\S]*?scanPhotoPlacements\(CU\.img,'headphones',2\)/,
  );
  assert.match(
    html,
    /if\(CU\.template==='headphones'\)\{\s*B\.slots=2;\s*var headphoneTiles=CU\.tiles;/,
  );
});