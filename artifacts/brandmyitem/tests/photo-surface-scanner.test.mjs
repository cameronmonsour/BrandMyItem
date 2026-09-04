import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('photo placement migration includes the surface scanner geometry', () => {
  assert.match(html, /var PHOTO_PLACEMENT_VERSION=11/);
  assert.match(html, /function scanPhotoPlacements\(img,type,n\)/);
  assert.match(html, /var CATALOG_SURFACES=\{/);
  assert.match(html, /function lockedCatalogPlacements\(img,type,n\)/);
  assert.match(html, /if\(iw!==d\.size\[0\]\|\|ih!==d\.size\[1\]\)return null/);
  assert.match(html, /var locked=lockedCatalogPlacements\(img,type,n\)/);
  assert.match(html, /gap=Math\.max\(3,Math\.round\(Math\.min\(w,h\)\*0\.035\)\)/);
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

test('iPhone placements fill the usable back panel below the camera', () => {
  assert.match(
    html,
    /iphone:\{size:\[952,1275\],surface:\[230,400,492,720\],cols:2,source:'campaign\/product-iphone\.png'\}/,
  );
  assert.match(html, /iphone:\{x0:0\.242,x1:0\.758,y0:0\.314,y1:0\.878,cols:2\}/);
  assert.doesNotMatch(html, /iphone:\{size:\[952,1275\],surface:\[381,625,190,421\]/);
  const iphone = html.match(/iphone:\{\s*5:\[([\s\S]*?)\]\s*\},\s*headphones:/)?.[1];
  assert.ok(iphone, 'iPhone five-placement reference geometry should exist');
  assert.equal((iphone.match(/\{x:/g) || []).length, 5);
  assert.match(iphone, /\{x:0\.6355,y:0\.1804,w:0\.2416,h:0\.2039\}/);
  assert.match(html, /iphone:\{label:'iPhone 17 Pro'[^}]*maxSlots:5/);
  assert.match(html, /type:'iphone'[^}]*slots:5,\s*prices:\[167,233,233,233,233\]/);
  assert.match(html, /if\(isDemo&&l\.type==='iphone'&&l\.slots!==5\)/);
  assert.match(html, /l\.claims=\[iphoneClaim,null,null,null,null\]/);
});

test('customer-facing campaign surfaces use photo-aligned placement outlines and logos', () => {
  assert.match(html, /function renderFinal\(el,st\)\{[\s\S]*?var l=normalizeListingPhoto\(st\);[\s\S]*?renderCustomStage\(el,l,null\);return/);
  assert.match(html, /var placementStroke=\(compactCard\?1\.25:2\)\*cv\.width\/cssWidth/);
  assert.match(html, /drawPricePlacement\(g,t,frame,price,c\?logoImages\[i\]:null,c&&c\.brand,placementStroke\)/);
  assert.match(html, /renderCustomStage\(host,\{type:CUR\.type,sourceType:CUR\.sourceType,slots:CUR\.slots,photo:faces\[fi\]\.photo,tiles:faces\[fi\]\.tiles,[\s\S]*?claims:CUR\.claims\.slice\(faces\[fi\]\.off\),prices:CUR\.prices\.slice\(faces\[fi\]\.off\)\},[\s\S]*?function\(si\)\{openBid\(faces\[fi\]\.off\+si\)\}\)/);
  assert.match(html, /renderCustomStage\(el,\{type:CUR\.type,sourceType:CUR\.sourceType,slots:CUR\.slots,photo:faces2\[0\]\.photo,tiles:faces2\[0\]\.tiles,[\s\S]*?claims:CUR\.claims,prices:CUR\.prices\},null\)/);
  assert.match(html, /Choose an open spot from the list to buy it for your brand/);
});

test('headphones always use two full-width polygon placements', () => {
  const headphones = html.match(/headphones:\{\s*2:\[([\s\S]*?)\]\s*\}\s*\};/)?.[1];
  assert.ok(headphones, 'headphone reference geometry should exist');
  assert.equal((headphones.match(/shape:'poly'/g) || []).length, 2);
  assert.equal((headphones.match(/w:0\.478/g) || []).length, 2);
  assert.match(html, /headphones:\{x0:0\.25,x1:0\.75,y0:0\.43,y1:0\.91,cols:1\}/);
  assert.match(html, /n=type==='headphones'\?2:/);
  assert.match(html, /if\(t==='headphones'\)B\.slots=2/);
  assert.match(html, /Headphones use exactly two placements on each side/);
  assert.match(html, /if\(CU\.template==='headphones'\)\{\s*B\.slots=2;/);
  assert.match(html, /var base=\(t==='headphones'&&REFERENCE_PHOTO_TILES\.headphones&&REFERENCE_PHOTO_TILES\.headphones\[2\]\?/);
});

test('headphone builder includes right and left product faces', () => {
  assert.match(html, /var PRODUCT_ANGLE_PHOTOS=\{\s*headphones:\[\s*\['Right','campaign\/product-headphones\.png'\],\s*\['Left','campaign\/product-headphones-left\.png'\]/);
  assert.match(html, /CU\.angles=\(PRODUCT_ANGLE_PHOTOS\[t\]\|\|\[\['Front',ITEM_PHOTOS\[t\]\]\]\)/);
  assert.match(html, /CU\.img=CU\.angleImgs\[i\]/);
  assert.match(html, /sideButton\.onclick=function\(\)\{cuShowAngle\(i\)\}/);
  assert.match(html, /el\.style\.display='none'/);
  assert.match(html, /id="cuSideTools" role="group" aria-label="Edit item side"/);
  assert.match(html, /className='cu-side-button'/);
  assert.match(html, /var rx=\(t\.x-t\.w\/2\)\*iw,ry=\(t\.y-t\.h\/2\)\*ih,rw=t\.w\*iw/);
  assert.match(html, /visibleTiles\.forEach\(function\(viewTile,viewIndex\)\{/);
  assert.match(html, /g\.fillText\(String\(viewIndex\+1\),t\.x\*iw,t\.y\*ih\)/);
  assert.match(html, /Math\.max\(12,Math\.min\(48,iw\*\.018\)\)/);
  assert.match(html, /cuWriteEditorTile\(DRAG\.i,t\)/);
  assert.match(html, /if\(count<2\)\{\s*if\(stored===local\)return;/);
  assert.match(html, /split the composite editor coordinates back into each photographed face/);
});

test('golf bag builder includes back, left, and right product faces', () => {
  assert.match(
    html,
    /golfbag:\[\s*\['Front','campaign\/product-golfbag\.png'\],\s*\['Back','campaign\/product-golfbag-back\.png'\],\s*\['Left','campaign\/product-golfbag-left\.png'\],\s*\['Right','campaign\/product-golfbag-right\.png'\]\s*\]/,
  );
  assert.match(html, /id="cuSideTools" role="group" aria-label="Edit item side"/);
});

test('Stanley builder keeps the original image as Front and adds the supplied Back view', () => {
  assert.match(
    html,
    /bottle:\[\s*\['Front','campaign\/product-bottle\.png'\],\s*\['Back','campaign\/product-bottle-back\.png'\]\s*\]/,
  );
});

test('Rimowa builder keeps the original image as Front and adds Back, Left, and Right views', () => {
  assert.match(
    html,
    /case:\[\s*\['Front','campaign\/product-case\.png'\],\s*\['Back','campaign\/product-case-back\.png'\],\s*\['Left','campaign\/product-case-left\.png'\],\s*\['Right','campaign\/product-case-right\.png'\]\s*\]/,
  );
});

test('suit builder keeps the original image as Front and adds Back, Left, and Right views', () => {
  assert.match(
    html,
    /suit:\[\s*\['Front','campaign\/product-suit\.png\?v=locked-tuxedo-20260904'\],\s*\['Back','campaign\/product-suit-right\.png'\],\s*\['Left','campaign\/product-suit-back\.png'\],\s*\['Right','campaign\/product-suit-left\.png'\]\s*\]/,
  );
});

test('cooler builder keeps the original image as Front and provides Back, Top, and duplicated side views', () => {
  assert.match(
    html,
    /cooler:\[\s*\['Front','campaign\/product-cooler\.png'\],\s*\['Back','campaign\/product-cooler-back\.png'\],\s*\['Top','campaign\/product-cooler-top\.png'\],\s*\['Left','campaign\/product-cooler-side\.png'\],\s*\['Right','campaign\/product-cooler-side\.png'\]\s*\]/,
  );
});

test('backpack builder keeps the original image as Front and maps the supplied views Left, Right, and Back', () => {
  assert.match(
    html,
    /backpack:\[\s*\['Front','campaign\/product-backpack\.png\?v=tumi-search-147053'\],\s*\['Left','campaign\/product-backpack-left\.png'\],\s*\['Right','campaign\/product-backpack-right\.png'\],\s*\['Back','campaign\/product-backpack-back\.png'\]\s*\]/,
  );
});

test('pickleball paddle builder keeps the original image as Front and adds the supplied Back view', () => {
  assert.match(
    html,
    /paddle:\[\s*\['Front','campaign\/product-paddle\.png'\],\s*\['Back','campaign\/product-paddle-back\.png'\]\s*\]/,
  );
});

test('Louis Vuitton bag builder keeps the original image as Front and reuses the narrow side view for Left, Right, and Back', () => {
  assert.match(
    html,
    /weekender:\[\s*\['Front','campaign\/product-weekender\.png'\],\s*\['Left','campaign\/product-weekender-side\.png'\],\s*\['Right','campaign\/product-weekender-side\.png'\],\s*\['Back','campaign\/product-weekender-side\.png'\]\s*\]/,
  );
});

test('polygon points and catalog identity survive template and detail rendering', () => {
  assert.match(html, /if\(tt\.pts\)out\.pts=tt\.pts\.map/);
  assert.match(html, /sourceType:CU\.template\|\|null/);
  assert.match(html, /sourceType:CUR\.sourceType/);
  assert.match(html, /var scanType=l\.sourceType\|\|l\.type/);
});

test('builder placement outlines use the locked 1.25px stroke', () => {
  assert.match(html, /var visibleTiles=cuVisibleEditorTiles\(\);[\s\S]*?visibleTiles\.forEach\(function\(viewTile,viewIndex\)\{[\s\S]*?g\.strokeStyle=outlineColor;\s*g\.lineWidth=1\.25\/viewScale;/);
  assert.match(html, /g\.strokeStyle=outlineColor;[\s\S]*?g\.fillStyle=outlineColor;[\s\S]*?g\.fillText\(String\(viewIndex\+1\),t\.x\*iw,t\.y\*ih\)/);
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