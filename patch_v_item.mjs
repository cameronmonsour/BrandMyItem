import fs from 'fs';

let html = fs.readFileSync('artifacts/brandmyitem/index.html', 'utf8');

// 1. Replace #v-item block
const start = html.indexOf('<div class="view" id="v-item">');
const end = html.indexOf('<footer><div class="wrap foot">');
if (start === -1 || end === -1) throw new Error('Could not find bounds');

const oldVItem = html.substring(start, end);

const newVItem = `<div class="view" id="v-item">
  <!-- Sticky Nav -->
  <div class="ap-nav">
    <div class="ap-nav-inner">
      <a class="ap-back" href="#dashboard">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        All live items
      </a>
      <div id="iTag" class="ap-status-badge"></div>
    </div>
  </div>

  <!-- Hero Section -->
  <div class="ap-hero">
    <div class="ap-hero-bg"></div>
    <div class="ap-hero-content">
      <div class="ap-hero-eyebrow">SPONSOR INVENTORY</div>
      <h1 class="ap-hero-title" id="iHeroTitle"></h1>
      <div id="itemCount" class="countstrip ap-countdown"></div>
    </div>
  </div>

  <!-- Main Split Grid -->
  <div class="ap-grid">
    
    <!-- Left: Stage -->
    <div class="ap-col-stage">
      <div class="ap-stage-box">
        <div id="itemMap"></div>
      </div>
      <div class="segwrap ap-segwrap"><div class="seg" id="itemSeg"></div></div>
      <div class="mapcap ap-mapcap" id="itemCap">Tap any open spot to buy it.</div>
    </div>

    <!-- Right: Specs & Action -->
    <div class="ap-col-info">
      
      <!-- Funding Card -->
      <div class="ap-card ap-card-primary">
        <div class="ap-funding-top">
          <div class="ap-raised"><span id="iRaised">$0</span></div>
          <div class="ap-goal">of <span id="iGoal">$0</span></div>
        </div>
        <div class="ap-bar-track">
          <i id="iBar" class="ap-bar-fill" style="width:0%"></i>
        </div>
        
        <div class="ap-owner-row">
          <span id="iWho" class="item-owner ap-owner-who"></span>
          <span id="iHab" class="ap-owner-hab"></span>
        </div>
      </div>

      <!-- The Spots -->
      <div class="ap-card">
        <div class="ap-card-header">
          <h3 class="ap-card-title">Sponsor spots</h3>
          <p class="ap-card-desc" id="iFeeCopy">Exact prices, first come, first served. A 20% platform fee is added at checkout.</p>
        </div>
        <div class="ap-card-body">
          <div class="ap-spot-summary" id="spotSummary"></div>
        </div>
      </div>

      <!-- The Deal -->
      <div class="ap-card">
        <div class="ap-card-header">
          <h3 class="ap-card-title">The deal</h3>
        </div>
        <div class="ap-card-body">
          <table class="ap-table">
            <tbody>
              <tr><td>Ships</td><td id="iShips">new, at 100% claimed</td></tr>
              <tr><td>Check-in</td><td id="iCad"></td></tr>
              <tr><td>Term</td><td id="iTerm">12 months</td></tr>
              <tr><td>Fulfillment</td><td id="iFulfillment">You apply branding</td></tr>
              <tr><td>Branded material</td><td id="iMaterial">Adhesive sticker/decal for you to apply</td></tr>
              <tr><td>Platform fee</td><td>20%</td></tr>
              <tr><td>Total fee before tax &amp; shipping</td><td id="iTotalFee">20%</td></tr>
              <tr><td>Tax + shipping</td><td id="iTax">If applicable at checkout</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Brand Fit -->
      <div class="ap-card brand-fit-card">
        <div class="ap-card-header">
          <h3 class="ap-card-title">Why brands should brand this item</h3>
          <p class="ap-card-desc">The person, purpose, and places behind the placement.</p>
        </div>
        <div class="ap-card-body">
          <div class="ap-fit-grid">
            <div class="ap-fit-box"><span>Locations</span><b id="iBrandLocations"></b></div>
            <div class="ap-fit-box"><span>Following</span><b id="iSocial"></b></div>
            <div class="ap-fit-box ap-col-span-2"><span>Purpose</span><b id="iPurpose"></b></div>
          </div>
          <div class="ap-fit-grid" style="margin-top:10px;">
            <div class="ap-fit-box"><span>Cities</span><b id="iCities"></b></div>
            <div class="ap-fit-box"><span>Universities</span><b id="iUniversities"></b></div>
          </div>
          <div id="iSocialLinks" class="brand-social-links" style="margin-top:20px;"></div>
        </div>
      </div>

      <!-- Owner Tools -->
      <div class="ap-card" id="ownerToolsCard">
        <div class="ap-card-header">
          <h3 class="ap-card-title">Owner tools</h3>
          <p class="ap-card-desc">Shipping, delivery, and public check-in tools for this listing.</p>
        </div>
        <div class="ap-card-body">
          <div id="verifyBlock"></div>
          <div id="checkinBlock" style="margin-top:16px"></div>
        </div>
      </div>

    </div>
  </div>
</div>

`;
html = html.replace(oldVItem, newVItem);

// 2. Insert LBLL(CUR) into iHeroTitle in refreshItemCards()
const refreshLoc = html.indexOf('document.getElementById(\'iRaised\').textContent=money(raised);');
const injection = "var ht=document.getElementById('iHeroTitle');if(ht)ht.textContent=LBLL(CUR);\n  ";
html = html.substring(0, refreshLoc) + injection + html.substring(refreshLoc);

// 3. Add CSS block just before </style>
const css = `
/* ============ APPLE-STYLE ITEM PAGE ============ */
#v-item {
  background: #F2F2F7;
  min-height: 100vh;
  padding-bottom: 80px;
}

/* Nav */
.ap-nav {
  position: sticky; top: 0; z-index: 100;
  height: 54px;
  background: rgba(242, 242, 247, 0.75);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid rgba(0,0,0,0.06);
}
.ap-nav-inner {
  max-width: 1140px; margin: 0 auto; padding: 0 22px;
  height: 100%; display: flex; align-items: center; justify-content: space-between;
}
.ap-back {
  display: flex; align-items: center; gap: 4px;
  font-size: 14px; font-weight: 500; color: #1D1D1F; text-decoration: none;
  opacity: 0.8; transition: opacity 0.15s, transform 0.15s;
}
.ap-back:hover { opacity: 1; transform: translateX(-2px); }
.ap-status-badge { display: flex; align-items: center; }

/* Hero */
.ap-hero {
  position: relative;
  text-align: center;
  padding: 60px 22px 40px;
  overflow: hidden;
}
.ap-hero-bg {
  position: absolute; top: -150px; left: 50%; transform: translateX(-50%);
  width: 1000px; height: 300px;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0.04) 0%, transparent 60%);
  pointer-events: none; z-index: 0;
}
.ap-hero-content {
  position: relative; z-index: 1;
  max-width: 800px; margin: 0 auto;
}
.ap-hero-eyebrow {
  font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase;
  color: #86868B; margin-bottom: 12px;
}
.ap-hero-title {
  font-family: var(--serif);
  font-size: clamp(38px, 6vw, 56px); font-weight: 500;
  letter-spacing: -0.02em; line-height: 1.1; color: #1D1D1F;
  margin-bottom: 10px;
  display: inline-block; transform: scaleX(0.95); transform-origin: center;
}
.ap-countdown {
  font-size: 15px; color: #86868B; padding: 0; font-weight: 400;
}

/* Grid Layout */
.ap-grid {
  max-width: 1140px; margin: 0 auto; padding: 0 22px;
  display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.6fr); gap: 40px; align-items: start;
}
@media(max-width: 900px) {
  .ap-grid { grid-template-columns: 1fr; gap: 32px; }
  .ap-hero { padding-top: 40px; padding-bottom: 24px; }
}

/* Stage */
.ap-col-stage { position: sticky; top: 80px; }
@media(max-width: 900px) { .ap-col-stage { position: static; } }

.ap-stage-box {
  background: #FFFFFF; border-radius: 28px; overflow: hidden;
  box-shadow: 0 4px 24px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
  border: 1px solid rgba(0,0,0,0.04);
  display: flex; align-items: center; justify-content: center;
  min-height: 480px;
}
.ap-stage-box .mapstage {
  border: none; border-radius: 0; box-shadow: none; margin: 0; background: transparent;
  width: 100%; display: flex; justify-content: center;
}
.ap-stage-box .item3d {
  transform: rotateX(10deg) rotateY(-20deg) scale(0.9) !important;
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.ap-stage-box:hover .item3d {
  transform: rotateX(8deg) rotateY(-16deg) scale(0.95) !important;
}

.ap-segwrap { margin-top: 24px; display: flex; justify-content: center; }
.ap-segwrap .seg { background: #E5E5EA; padding: 4px; border-radius: 999px; }
.ap-segwrap .seg button.on { box-shadow: 0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04); }
.ap-mapcap { margin-top: 14px; font-size: 14px; color: #86868B; text-align: center; }

/* Info Column */
.ap-col-info {
  display: flex; flex-direction: column; gap: 24px;
}
.ap-card {
  background: #FFFFFF; border-radius: 24px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.02);
  border: 1px solid rgba(0,0,0,0.04);
  overflow: hidden;
}
.ap-card-primary {
  padding: 32px 28px;
  background: linear-gradient(180deg, #FFFFFF 0%, #FAFAFC 100%);
}
.ap-card-header { padding: 28px 28px 16px; border-bottom: 1px solid #F2F2F7; }
.ap-card-body { padding: 20px 28px 28px; }

.ap-card-title { font-size: 20px; font-weight: 600; color: #1D1D1F; letter-spacing: -0.015em; margin-bottom: 6px; }
.ap-card-desc { font-size: 14px; color: #86868B; line-height: 1.5; }

/* Funding Top */
.ap-funding-top { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; }
.ap-raised { font-size: 36px; font-weight: 600; color: #1D1D1F; letter-spacing: -0.02em; line-height: 1; }
.ap-goal { font-size: 15px; font-weight: 500; color: #86868B; }

.ap-bar-track { height: 8px; background: #E5E5EA; border-radius: 4px; overflow: hidden; margin-bottom: 24px; }
.ap-bar-fill { height: 100%; background: #1D1D1F; border-radius: 4px; display: block; transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1); }

/* Owner */
.ap-owner-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.ap-owner-who { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 500; color: #1D1D1F; }
.ap-owner-who .avatarc { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #1D1D1F; color: #fff; font-size: 13px; font-weight: 600; overflow: hidden; }
.ap-owner-who .avatarc img { width: 100%; height: 100%; object-fit: cover; }
.ap-owner-hab { font-size: 14px; color: #86868B; font-weight: 400; text-align: right; }

/* Spec Table */
.ap-table { width: 100%; border-collapse: collapse; font-size: 14.5px; line-height: 1.5; }
.ap-table td { padding: 14px 0; border-bottom: 1px solid #F2F2F7; }
.ap-table tr:last-child td { border-bottom: none; padding-bottom: 0; }
.ap-table tr:first-child td { padding-top: 0; }
.ap-table td:first-child { color: #86868B; width: 38%; font-weight: 400; }
.ap-table td:last-child { color: #1D1D1F; font-weight: 500; text-align: right; }

/* Spot Summary */
.ap-spot-summary { font-size: 14.5px; color: #1D1D1F; line-height: 1.6; }
.ap-spot-summary a { color: #0071E3; text-decoration: none; font-weight: 500; }
.ap-spot-summary a:hover { text-decoration: underline; }

/* Fit Grid */
.ap-fit-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.ap-col-span-2 { grid-column: 1 / -1; }
.ap-fit-box { background: #FAFAFC; border-radius: 14px; padding: 16px 20px; border: 1px solid rgba(0,0,0,0.03); }
.ap-fit-box span { display: block; font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #86868B; margin-bottom: 6px; }
.ap-fit-box b { display: block; font-size: 15px; font-weight: 500; color: #1D1D1F; line-height: 1.4; }

/* Overrides for dynamic content injected by JS */
.view#v-item .card { border: none; box-shadow: none; border-radius: 0; background: transparent; padding: 0; }
.view#v-item .card-h, .view#v-item .card-c { padding: 0; }
`;
html = html.replace('</style>', css + '\n</style>');

fs.writeFileSync('artifacts/brandmyitem/index.html', html);
