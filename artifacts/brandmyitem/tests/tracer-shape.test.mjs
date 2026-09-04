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
  assert.match(html, /cv\.focus\(\);\s*\/\* Boxes first: invisible corner hit areas, then body\. \*\//);
});

test('the custom item photo can be panned with a hand drag', () => {
  assert.match(html, /\.cu-viewport canvas\{[^}]*cursor:grab/);
  assert.match(html, /\.cu-viewport canvas\.is-panning\{cursor:grabbing\}/);
  assert.match(html, /var DRAG=null,PAN=null/);
  assert.match(html, /PAN=\{x:e\.clientX,y:e\.clientY,ox:CU\.panX\|\|0,oy:CU\.panY\|\|0\}/);
  assert.match(html, /CU\.panX=PAN\.ox\+e\.clientX-PAN\.x;\s*CU\.panY=PAN\.oy\+e\.clientY-PAN\.y/);
  assert.match(html, /cuZoomReset'\)\.onclick=function\(\)\{CU\.panX=0;CU\.panY=0;cuSetZoom\(1\)\}/);
});

test('finish and size choices update the details card', () => {
  assert.match(html, /B\.color=c\[0\];\s*sel\.textContent=c\[0\];\s*renderBuildSpecs\(k\)/);
  assert.match(html, /B\.variantSize=s\[0\]/);
  assert.match(html, /B\.variantModel=model\[0\];drawSizes\(\)/);
  assert.match(html, /function syncVariantPricing\(\)\{\s*var retail=variantRetail\(k,B\.variantSize\);[\s\S]*?CU\.prices=CU\.tiles\.length\?boxPrices\(\):\[\];\s*B\.prices=CU\.prices\.slice\(\);\s*cuPricingUI\(\);cuDraw\(\);totals\(\)/);
  assert.match(html, /B\.variantSize=s\[0\];\s*syncVariantPricing\(\);\s*renderBuildSpecs\(k\)/);
  assert.match(html, /B\.variantModel=model\[0\];drawSizes\(\);\s*syncVariantPricing\(\);\s*renderBuildSpecs\(k\)/);
  const variants = html.match(/function renderVariants\(k\)\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.doesNotMatch(variants, /cuApplyTemplate\(\)/);
  assert.match(html, /var selectedRetail=variantRetail\(k,selectedSize\)/);
  assert.match(html, /if\(r\[0\]==='Color'\)value=selectedColor/);
  assert.match(html, /if\(option&&option\[2\]&&Object\.prototype\.hasOwnProperty\.call\(option\[2\],r\[0\]\)\)value=option\[2\]\[r\[0\]\]/);
  assert.match(html, /if\(model&&model\[1\]&&Object\.prototype\.hasOwnProperty\.call\(model\[1\],r\[0\]\)\)value=model\[1\]\[r\[0\]\]/);
});

test('official catalog data stores sources, verification dates, and exact option prices', () => {
  assert.match(html, /case:\{label:'Original Cabin',brand:'RIMOWA'.*retail:1550/);
  assert.match(html, /paddle:\{label:'Pro V Paddle',brand:'JOOLA'.*retail:299\.95/);
  assert.match(html, /\['Perseus Pro V'.*\['Kosmos Pro V'.*\['Scorpeus Pro V'.*\['Hyperion Pro V'.*\['Agassi Pro V'.*\['Graf Pro V'/s);
  assert.match(html, /\['Graf Pro V',\{Model:'Graf Pro V',Shape:'Elongated'\},\['16mm'\]\]/);
  assert.match(html, /'Blaze Red \(Ben Johns\)'.*'Breeze Blue \(Simone Jardim\)'.*'Seaside Green'/s);
  assert.match(html, /suit:\{label:'Luxury Twill O’Connor Tuxedo',brand:'Tom Ford'.*retail:7490/);
  assert.match(html, /source:'https:\/\/www\.tomfordfashion\.com\/en-us\/luxury-twill-oconnor-tuxedo\/2EYPT1-WOS09X5N\.html'/);
  assert.match(html, /suit:\{colors:\[\['Black','#1D1D1F'\]\],sizeLabel:'Size',sizeQ:'Select an available Tom Ford jacket size\.',sizes:\[\s*\['44',0,\{'Size':'44','Availability':'Available'\},true\],\s*\['46',0,\{'Size':'46','Availability':'Out of stock'\},false\],\s*\['48',0,\{'Size':'48','Availability':'Available'\},true\],\s*\['50',0,\{'Size':'50','Availability':'Available'\},true\],\s*\['52',0,\{'Size':'52','Availability':'Out of stock'\},false\]\s*\]\}/);
  assert.match(html, /var unavailable=s\[3\]===false/);
  assert.match(html, /b\.disabled=unavailable/);
  assert.match(html, /backpack:\{label:'Search Backpack',brand:'TUMI'.*retail:850/);
  assert.match(html, /source:'https:\/\/www\.tumi\.com\/p\/search-backpack-01470531041\//);
  assert.match(html, /weekender:\{label:'Keepall Bandoulière',brand:'Louis Vuitton'/);
  assert.match(html, /weekender:\{colors:\[\['Monogram Canvas'/);
  assert.match(html, /'Monogram Eclipse'.*'Monogram Macassar'.*'Damier Graphite'.*'Damier Azur'/);
  assert.match(html, /'Keepall 45',-500/);
  assert.match(html, /'Keepall 50',-250/);
  assert.match(html, /'Keepall 55',0/);
  assert.match(html, /'Keepall 60',300/);
  assert.match(html, /verified:'2026-08-29',source:'https:\/\//);
  assert.match(html, /\['16"',900,\{Model:'16-inch MacBook Pro \(M5 Pro\)'/);
  assert.match(html, /retail:variantRetail\(B\.type,B\.variantSize\)/);
  assert.match(html, /return '\$'\+Math\.round\(Number\(n\)\|\|0\)\.toLocaleString\('en-US'\)/);
  assert.doesNotMatch(html, /parseInt\(document\.getElementById\('cuRetail'\)/);
});