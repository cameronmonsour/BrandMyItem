import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const builderHtml = html.split('<!-- ITEM -->')[0];

test('removes the screenshot-only homepage and page headers', () => {
  assert.doesNotMatch(html, />From post to proof\.</);
  assert.match(html, /class="herotag"/);
  assert.match(html, /class="heroword"/);
  assert.doesNotMatch(html, /<div class="eyebrow">How it works<\/div>/);
  assert.doesNotMatch(html, />Get your item paid for by brands</);
  assert.doesNotMatch(html, />See live items &rarr;</);
  assert.doesNotMatch(html, /<h2>Live items<\/h2>/);
  assert.doesNotMatch(html, /font-size:clamp\(28px,4vw,40px\)[^>]*>Track my item</);
  assert.match(html, /class="home-bento"/);
  assert.match(html, /id="home-faq"/);
  assert.match(html, /class="faq-grid"/);
  assert.match(html, /\.faq-grid\{[^}]*grid-template-rows:repeat\(5,auto\)[^}]*grid-auto-flow:column/);
  assert.match(html, /@media\(max-width:640px\)\{\.faq-grid\{grid-template-columns:1fr;grid-template-rows:none;grid-auto-flow:row\}/);
  assert.doesNotMatch(html, />Questions</);
  assert.doesNotMatch(html, />Asked and answered\.</);
  assert.match(html, /home-flow-index">5<\/span><h3>Monthly check-in<\/h3>/);
  assert.match(html, /how-it-works-monthly-check-in\.png/);
  assert.match(html, /\.home-flow-icon\.photo\.monthly img\{object-fit:contain\}/);
  assert.match(html, /\.home-flow\{position:relative;margin:0 auto 48px/);
  assert.match(html, /\.home-flow-step:nth-child\(3\)\{transform:translateY\(10px\)\}/);
  assert.match(html, /Choose the item, the ad spots, and the term\. Pick whether BrandMyItem brands it for you \(\+10%\) or you handle it yourself\./);
  assert.match(html, /They claim a placement and submit the logo file for the approved branding method, then pay in full upfront\./);
  assert.match(html, /Once fully funded, BrandMyItem buys the item and ships it straight to you\./);
  assert.match(html, /<h3>Shows up as you chose<\/h3><p>Pre-branded if you picked that option, or clean and ready for you to apply yourself\./);
  assert.match(html, /One photo a month keeps the whole thing verified and current\./);
});

test('keeps outlined hero art while referenced suit and backpack photos remain in the picker', () => {
  assert.match(html, /var catPhoto=c\.item&&\(\(typeof HERO_SOURCE_FILES!=='undefined'&&HERO_SOURCE_FILES\[c\.item\]\)\|\|ITEM_PHOTOS\[c\.item\]\)/);
  assert.match(html, /var productPhoto=\(typeof ITEM_PHOTOS!=='undefined'&&ITEM_PHOTOS\[k\]\)\?ITEM_PHOTOS\[k\]:''/);
  assert.match(html, /var photo=\(\(k==='suit'\|\|k==='backpack'\)&&productPhoto\)\?productPhoto/);
  assert.match(html, /suit:'hero\/apple-suit\.png\?v=tomford-oconnor-outline'/);
  assert.match(html, /backpack:'hero\/apple-backpack\.png\?v=tumi-search-147053-outline'/);
  assert.match(html, /\.cat \.ic img\{[^}]*border:0;outline:0;background:transparent;box-shadow:none\}/);
  assert.match(html, /\.itemcard img\{[^}]*border:0;outline:0;box-shadow:none/);
  assert.match(html, /\.cat\{display:flex;flex-direction:row;[^}]*border-radius:10px/);
  assert.match(html, /\.cat\.on\{background:var\(--bg\);color:var\(--fg\);border-color:var\(--border\);outline:none;box-shadow:none\}/);
  assert.match(html, /b\.innerHTML=catPhoto\?/);
});

test('dashboard filters use listing metadata and compose with displayed spot prices', () => {
  assert.match(html, /\{id:'Event',item:'cooler'\}/);
  assert.doesNotMatch(html, /\{id:'Custom',item:null\}/);
  assert.match(html, /function listingCategory\(l\)\{\s+if\(l&&l\.type&&ITEMS\[l\.type\]\)return ITEMS\[l\.type\]\.cat;\s+return 'Custom';/);
  assert.match(html, /var it=\{label:LBLL\(l\),cat:listingCategory\(l\)\}/);
  assert.match(html, /function syncDashboardFilterState\(\)/);
  assert.match(html, /function renderDash\(\)\{\s+syncDashboardFilterState\(\);/);
  assert.match(html, /var mo=listingSpotPrice\(l\)/);
  assert.match(html, /if\(F\.sort==='cheap'\)list\.sort\(function\(a,b\)\{return listingSpotPrice\(a\)-listingSpotPrice\(b\)\}\)/);
});

test('dashboard activity uses the same live ticker as the homepage', () => {
  assert.match(html, /id="dashLiveFeed"/);
  assert.match(html, /function renderLiveFeed\(feedId\)/);
  assert.match(html, /function renderHomeLiveFeed\(\)\{renderLiveFeed\('homeLiveFeed'\)\}/);
  assert.match(html, /function renderDashboardLiveFeed\(\)\{renderLiveFeed\('dashLiveFeed'\)\}/);
  assert.match(html, /renderDashboardLiveFeed\(\);/);
  assert.match(html, /function postActivityRows\(\)/);
  assert.match(html, /\{kind:'post',listingId:l\.id,owner:name,label:LBLL\(l\),spots:l\.slots\}/);
  assert.match(html, /\(DB\.activity\|\|\[\]\)\.forEach\(function\(a\)\{\s+if\(!a\.txt\)return;/);
});

test('dashboard keeps compact tracker cards without a duplicate left category box', () => {
  assert.doesNotMatch(html, /id="railCats"/);
  assert.doesNotMatch(html, /<h5>Category<\/h5>/);
  assert.doesNotMatch(html, /id="statRow"/);
  assert.doesNotMatch(html, /Items live<\/span>/);
  assert.doesNotMatch(html, /Avg open spot<\/span>/);
  assert.doesNotMatch(html, /<h1>Live items<\/h1>/);
  assert.doesNotMatch(html, /Live sponsorship inventory/);
  assert.doesNotMatch(html, /class="dash-live-panel"/);
  assert.doesNotMatch(html, /dashLiveTitle/);
  assert.doesNotMatch(html, /<div class="eyebrow">Live activity<\/div>/);
  assert.doesNotMatch(html, /class="dash-live-badge"/);
  assert.match(html, /class="home-live-feed" id="dashLiveFeed"/);
  assert.match(html, /class="brand-deal-section"/);
  assert.doesNotMatch(builderHtml, /<div class="card-t">The deal<\/div>/);
  assert.match(builderHtml, /id="termChoices"/);
  assert.match(builderHtml, /id="brandingChoices"/);
  assert.match(builderHtml, /id="termConfidenceOut"/);
  assert.match(builderHtml, /class="card details-card"/);
  assert.match(builderHtml, /<div class="card-t">Details<\/div>/);
  assert.match(builderHtml, /id="totalOut"/);
  assert.match(builderHtml, /Choose your character/);
  assert.doesNotMatch(builderHtml, /avatarPickStatus/);
  assert.doesNotMatch(builderHtml, /Memoji selected/);
  assert.match(builderHtml, /\.avatar-option\.on\{border:1px solid var\(--fg\);box-shadow:none\}/);
  assert.match(html, /\.dash-results\{min-width:0;display:flex;flex-direction:column;gap:18px\}/);
  assert.match(html, /\.rail\{position:sticky;top:76px;align-self:start;display:flex;flex-direction:column;gap:16px\}/);
  assert.match(html, /\.grid\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(236px,1fr\)\);gap:20px\}/);
  assert.match(html, /\.habs button\.on\{background:#fff;border:1px solid #1D1D1F;color:#1D1D1F\}/);
  assert.doesNotMatch(html, /function listingBrandFitHtml\(l\)/);
  assert.doesNotMatch(html, /class="listing-why"/);
  assert.match(html, /id="fSocial"/);
  assert.match(html, /id="fFreq"/);
  assert.match(html, /id="fLocation"/);
  assert.match(html, /id="fUniversity"/);
  assert.match(html, /id="fItemMin"/);
  assert.match(html, /id="fOpenMin"/);
  assert.match(html, /id="fMethod"/);
  assert.match(html, /id="fFulfillment"/);
  assert.match(html, /id="fTerm"/);
  assert.match(html, /id="fCadence"/);
  assert.match(html, /listingContextHtml\(l\)\+'<div class="iname">/);
  assert.match(html, /<span class="chipg sold-count">/);
});

test('fulfillment copy states the delivery and branding windows', () => {
  assert.match(html, /\+10% fulfillment fee · 60-day delivery window/);
  assert.match(html, /Delivered in under 23 days · 7-day branding window/);
  assert.match(html, /Once fully funded, the item is delivered in under 23 days/);
  assert.match(html, /IRLi-applied branding has a 60-day delivery window/);
});

test('every catalog item has an item-specific branding method', () => {
  const itemsBlock = html.match(/var ITEMS=\{([\s\S]*?)\n\};/)?.[1];
  const methodsBlock = html.match(/var BRANDING_METHODS=\{([\s\S]*?)\n\};/)?.[1];
  assert.ok(itemsBlock, 'catalog items should be defined');
  assert.ok(methodsBlock, 'branding methods should be defined');
  const itemKeys = [...itemsBlock.matchAll(/^\s{2}([a-z]+):\{/gm)].map((match) => match[1]).sort();
  const methodKeys = [...methodsBlock.matchAll(/^\s{2}([a-z]+):'[^']+'/gm)].map((match) => match[1]).sort();
  assert.deepEqual(methodKeys, itemKeys);
  assert.match(methodsBlock, /macbook:'adhesive sticker\/decal'/);
  assert.match(methodsBlock, /bottle:'laser-engraved logo'/);
  assert.match(methodsBlock, /golfbag:'embroidered logo'/);
  assert.match(methodsBlock, /suit:'embroidered patch'/);
  assert.match(methodsBlock, /paddle:'printed decal'/);
  assert.match(methodsBlock, /weekender:'leather patch or debossed logo'/);
  assert.match(html, /brandingMaterial\(B\.type,B\.brandingMode\)/);
  assert.match(html, /<span>Branding method<\/span><b>'\+safeCardText\(brandingMaterial\(l\.type,l\.brandingMode\)\)/);
  assert.match(html, /Branding method: '\+safeCardText\(brandingMethod\(CUR\.type\)\)/);
});

test('sold and price pills keep the same compact height', () => {
  assert.match(html, /\.lcard \.chips\{display:flex;align-items:flex-end;gap:5px/);
  assert.match(html, /\.lcard \.chipg\.sold-count\{padding:4px 8px\}/);
});