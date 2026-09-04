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
  assert.match(html, /class="feature-bento"/);
  assert.match(html, /id="home-faq"/);
  assert.match(html, /class="faq-grid"/);
  assert.match(html, /\.faq-grid\{max-width:none;display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:12px 14px\}/);
  assert.match(html, /\.faq-grid\{grid-template-columns:1fr;gap:10px\}/);
  assert.doesNotMatch(html, />Questions</);
  assert.doesNotMatch(html, />Asked and answered\.</);
  assert.match(html, /home-flow-index">5<\/span><h3>Photo check-ins<\/h3>/);
  assert.match(html, /how-it-works-monthly-check-in\.png/);
  assert.match(html, /\.home-flow-icon\.photo\.monthly img\{object-fit:contain\}/);
  assert.match(html, /\.home-flow\{position:relative;margin:0;padding:0\}/);
  assert.match(html, /\.home-flow-step:nth-child\(2\),\.home-flow-step:nth-child\(3\),\.home-flow-step:nth-child\(4\)\{transform:none\}/);
  assert.match(html, /Choose the item, ad spots, term, and check-in frequency\./);
  assert.match(html, /Brands claim a spot, upload their logo, and pay in full upfront\./);
  assert.match(html, /Once fully funded, BrandMyItem buys and ships the item to you\./);
  assert.match(html, /<h3>We apply every brand<\/h3><p>BrandMyItem applies every approved sponsor mark before shipping to reduce fraud\./);
  assert.match(html, /Send weekly, biweekly, or monthly photos for your selected term\./);
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

test('launch homepage keeps AirPods, MacBook, and iPhone examples locked', () => {
  const block = html.match(/function renderHomeCampaigns\(\)\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(block, /var launchCampaignIds=\['demo6','demo1','demo5'\]/);
  assert.match(block, /launchCampaignIds\.map\(function\(id\)/);
  assert.doesNotMatch(block, /sort\(function\(a,b\)/);
  assert.doesNotMatch(block, /openSlots\(l\)>0/);
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
  assert.doesNotMatch(builderHtml, /id="brandingChoices"/);
  assert.doesNotMatch(builderHtml, /id="termConfidenceOut"/);
  assert.match(builderHtml, /class="card details-card"/);
  assert.match(builderHtml, /<div class="card-t">Details<\/div><p class="details-subheadline">Branding application, item sales tax, shipping, and handling are included\.<\/p>/);
  assert.match(builderHtml, /id="totalOut"/);
  assert.match(builderHtml, /Goal when fully claimed/);
  assert.doesNotMatch(builderHtml, /<span>Platform fee<\/span>/);
  assert.doesNotMatch(builderHtml, /<span>Branding application<\/span>/);
  assert.doesNotMatch(builderHtml, /Total fee before tax &amp; shipping/);
  assert.doesNotMatch(builderHtml, /id="buildTaxOut"/);
  assert.match(builderHtml, /Choose your character/);
  assert.match(builderHtml, /<label class="label" for="pAddress">Shipping address<\/label>/);
  assert.match(builderHtml, /<input class="input" id="pAddress" type="text" autocomplete="street-address" placeholder="Street address, city, state, ZIP">/);
  assert.doesNotMatch(builderHtml, /<textarea[^>]*id="pAddress"/);
  assert.doesNotMatch(builderHtml, /avatarPickStatus/);
  assert.doesNotMatch(builderHtml, /Memoji selected/);
  assert.match(builderHtml, /\.avatar-option\.on\{border:1px solid var\(--fg\);box-shadow:none\}/);
  assert.match(html, /\.dash-results\{min-width:0;display:flex;flex-direction:column;gap:18px\}/);
  assert.match(html, /class="ios-group-head">Audience<\/div>/);
  assert.match(html, /class="ios-box"/);
  assert.doesNotMatch(html, /class="card filter-card"/);
  assert.match(html, /\.grid\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(236px,1fr\)\);gap:20px\}/);
  assert.match(html, /#dashGrid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.match(html, /@media\(max-width:620px\)\{[\s\S]*?\.grid,#dashGrid\{grid-template-columns:1fr\}/);
  assert.match(html, /#home-onboard\{padding-bottom:0!important\}/);
  assert.match(html, /\.home-how-band\{padding:0 0 56px!important\}/);
  assert.match(html, /\.home-flow-list\{[^}]*max-width:1100px;margin:0 auto/);
  assert.match(html, /\.home-flow-step:nth-child\(2\),\.home-flow-step:nth-child\(3\),\.home-flow-step:nth-child\(4\)\{transform:none\}/);
  assert.match(html, /\.habs button\.on\{background:#1D1D1F;border:1px solid #1D1D1F;color:#fff\}/);
  assert.match(html, /\.choice-card\.on\{border:1px solid #1D1D1F;background:#1D1D1F;color:#fff;box-shadow:none\}/);
  assert.doesNotMatch(builderHtml, /class="tax-note"/);
  assert.doesNotMatch(builderHtml, /Who applies the branding\?/);
  assert.doesNotMatch(builderHtml, /You apply it/);
  assert.doesNotMatch(html, /\.term-runway\{/);
  assert.match(builderHtml, /<div class="label">Check-in term<\/div>/);
  assert.match(builderHtml, /data-value="6"[^>]*><strong>6 months<\/strong>/);
  assert.doesNotMatch(builderHtml, /This sets how long you want to send check-ins after delivery/);
  assert.match(builderHtml, /<span>Listing window<\/span><b>60 days, until completed or deleted<\/b>/);
  assert.match(html, /\.brand-profile-card \.label\{margin-top:16px;color:var\(--fg\)\}/);
  assert.doesNotMatch(html, /function listingBrandFitHtml\(l\)/);
  assert.doesNotMatch(html, /class="listing-why"/);
  assert.match(html, /id="fSocial"/);
  assert.match(html, /id="fFreq"/);
  assert.match(html, /id="fLocation"/);
  assert.match(html, /id="fUniversity"/);
  assert.match(html, /id="fItemMin"/);
  assert.match(html, /id="fOpenMin"/);
  assert.match(html, /id="fMethod"/);
  assert.doesNotMatch(html, /id="fFulfillment"/);
  assert.match(html, /id="fTerm"/);
  assert.match(html, /id="fCadence"/);
  assert.match(html, /listingContextHtml\(l\)\+'<div class="iname">/);
  assert.match(html, /if\(!parts\.length\)return '<div class="card-context card-context-empty" aria-hidden="true"><\/div>'/);
  assert.match(html, /\.lcard \.who\{[^}]*height:24px;min-width:0;margin-bottom:5px/);
  assert.match(html, /\.lcard \.who \.oname\{[^}]*overflow:hidden;text-overflow:ellipsis;white-space:nowrap/);
  assert.match(html, /\.lcard \.who \.catic\{[^}]*margin-left:auto;[^}]*width:24px;height:24px/);
  assert.match(html, /\.lcard \.iname\{[^}]*width:100%;height:19px;line-height:19px;[^}]*margin:7px 0;/);
  assert.match(html, /\.lcard \.card-context\{[^}]*width:100%;height:15px;[^}]*margin:0 0 3px/);
  assert.match(html, /\.lcard \.card-context-value\{[^}]*overflow:hidden;text-overflow:ellipsis;white-space:nowrap/);
  assert.match(html, /\.lcard \.moneyrow\{[^}]*width:100%;min-width:0;min-height:21px/);
  assert.doesNotMatch(html, /<span class="when">— /);
  assert.doesNotMatch(html, /aria-hidden="true">&mdash;<\/span>/);
  assert.match(html, /<span class="chipg sold-count">/);
});

test('fulfillment copy enforces BrandMyItem-applied branding', () => {
  assert.match(html, /purchase total includes 40% covering BrandMyItem-applied branding, item sales tax, shipping, and handling/i);
  assert.match(html, /delivers it pre-branded within 60 days/);
  assert.match(html, /function feeRateOf\(\)\{return 0\.40\}/);
  assert.match(html, /function deliveryDaysOf\(\)\{return 60\}/);
  assert.doesNotMatch(html, /self-appl/i);
  assert.doesNotMatch(html, /You apply it/);
  assert.doesNotMatch(html, /20% platform fee/);
  assert.doesNotMatch(html, /10% branding application fee/);
  assert.doesNotMatch(html, /id="mFee"/);
});

test('footer omits the legacy BrandMyMac attribution', () => {
  assert.doesNotMatch(html, /BrandMyMac by @vynsedev/);
});

test('builder and campaign goals include the complete 40% purchase amount', () => {
  assert.match(html, /function markedUpRetail\(retail\)/);
  assert.match(html, /document\.getElementById\('totalOut'\)\.textContent=money\(v\)/);
  assert.match(html, /Branding application, item sales tax, shipping, and handling are included\./);
  assert.match(html, /function goalOf\(l\)\{return l\.prices\.reduce\(function\(s,p\)\{return s\+spotPurchaseTotal\(l,p\)\},0\)\}/);
  assert.match(html, /function raisedOf\(l\)\{return \(l\.claims\|\|\[\]\)\.reduce/);
  assert.match(html, /<span>Total today<\/span>/);
  assert.match(html, /pricesIncludeMarkup:true/g);
  assert.match(html, /var price=CUR\.prices\[i\],total=spotPurchaseTotal\(CUR,price\)/);
});

test('builder separates placement sizing from per-spot pricing', () => {
  assert.match(html, /id="cuSizingPanel"/);
  assert.match(html, /id="cuCompleteSizing"[^>]*>Complete sizing<\/button>/);
  assert.match(html, /id="cuSpotPriceGrid"/);
  assert.match(html, /id="cuEditSizing"[^>]*>Edit sizing<\/button>/);
  assert.match(html, /CU\.sizingComplete=true;CU\.sel=-1;CU\.prices=boxPrices\(\);B\.prices=CU\.prices\.slice\(\)/);
  assert.match(html, /function renderPhotoOnly\(el,st\)/);
  assert.match(html, /if\(CU\.tiles\.length&&!CU\.sizingComplete\)\{toast\('Complete sizing and price every ad space before posting'\);return\}/);
  assert.match(html, /cuSpotPriceTotal\(\)!==pricingGoal/);
  assert.match(html, /Every spot must add up to the full purchase goal\./);
  assert.match(html, /matches full purchase goal/);
  assert.match(html, /prices=CU\.faces\[0\]\.prices\.slice\(\)/);
});

test('posting requires and saves the owner shipping address', () => {
  assert.match(html, /var address=document\.getElementById\('pAddress'\)\.value\.trim\(\)/);
  assert.match(html, /if\(!name\|\|!mail\|\|!address\)\{toast\('Add your name, email, and shipping address to post'\);return\}/);
  assert.equal((html.match(/shipping:\{name:name,address:address\}/g) || []).length, 2);
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
  assert.match(html, /brandingMaterial\(B\.type\)/);
  assert.match(html, /<span>Branding method<\/span><b>'\+safeCardText\(brandingMaterial\(l\.type\)\)/);
  assert.match(html, /the '\+safeCardText\(brandingMethod\(CUR\.type\)\)\+' is produced from that file/);
});

test('sold and price pills keep the same compact height', () => {
  assert.match(html, /\.lcard \.iname\{display:block;box-sizing:border-box;width:100%;height:19px;line-height:19px;[^}]*margin:7px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\}/);
  assert.match(html, /\.lcard \.moneyrow\{display:grid;grid-template-columns:minmax\(0,1fr\) auto;align-items:end;/);
  assert.match(html, /\.lcard \.moneyrow\{[^}]*min-height:21px/);
  assert.match(html, /\.lcard \.moneyrow \.amts\{display:inline-flex;align-items:center;height:21px;line-height:1\.2;/);
  assert.match(html, /\.lcard \.chips\{display:flex;align-items:flex-end;gap:5px/);
  assert.match(html, /\.lcard \.chipg\.sold-count\{padding:3px 7px\}/);
});