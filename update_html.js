const fs = require('fs');
let html = fs.readFileSync('artifacts/brandmyitem/index.html', 'utf8');

const oldRailRegex = /<aside class="rail">[\s\S]*?<\/aside>/;

const newRail = `<aside class="rail">
        <div class="ios-group">
          <div class="ios-group-head">Audience</div>
          <div class="ios-box">
            <label class="ios-item">
              <span class="ios-label">Following</span>
              <div class="ios-control">
                <select class="ios-select" id="fSocial">
                  <option value="">Any</option>
                  <option value="Under 1K">Under 1K</option>
                  <option value="1K–10K">1K–10K</option>
                  <option value="10K–100K">10K–100K</option>
                  <option value="100K+">100K+</option>
                </select>
                <svg class="ios-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
              </div>
            </label>
            <label class="ios-item">
              <span class="ios-label">Seen</span>
              <div class="ios-control">
                <select class="ios-select" id="fFreq">
                  <option value="">Any</option>
                  <option value="Daily">Daily</option>
                  <option value="Few times a week">Few times a week</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Occasionally">Occasionally</option>
                </select>
                <svg class="ios-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
              </div>
            </label>
          </div>
        </div>

        <div class="ios-group">
          <div class="ios-group-head">Where it shows up</div>
          <div class="ios-box">
            <label class="ios-item ios-item-col">
              <span class="ios-label">Location or setting</span>
              <input class="ios-input-col" id="fLocation" placeholder="City, campus, coffee shop">
            </label>
            <label class="ios-item ios-item-col">
              <span class="ios-label">University</span>
              <input class="ios-input-col" id="fUniversity" placeholder="Search universities">
            </label>
          </div>
        </div>

        <div class="ios-group">
          <div class="ios-group-head">Item & inventory</div>
          <div class="ios-box">
            <div class="ios-item ios-item-col">
              <span class="ios-label">Exact item price</span>
              <div class="ios-pricerow">
                <input class="ios-input-box" id="fItemMin" type="number" placeholder="Min">
                <span style="color:var(--mfg)">&ndash;</span>
                <input class="ios-input-box" id="fItemMax" type="number" placeholder="Max">
              </div>
            </div>
            <label class="ios-item">
              <span class="ios-label">Open spots</span>
              <div class="ios-control">
                <input class="ios-input-right" id="fOpenMin" type="number" min="0" placeholder="Any">
              </div>
            </label>
            <label class="ios-item">
              <span class="ios-label">Method</span>
              <div class="ios-control">
                <select class="ios-select" id="fMethod">
                  <option value="">Any</option>
                </select>
                <svg class="ios-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
              </div>
            </label>
          </div>
        </div>

        <div class="ios-group">
          <div class="ios-group-head">Deal details</div>
          <div class="ios-box">
            <label class="ios-item">
              <span class="ios-label">Fulfillment</span>
              <div class="ios-control">
                <select class="ios-select" id="fFulfillment">
                  <option value="">Any</option>
                  <option value="self">Owner applies</option>
                  <option value="assisted">BrandMyItem applies</option>
                </select>
                <svg class="ios-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
              </div>
            </label>
            <label class="ios-item">
              <span class="ios-label">Commitment</span>
              <div class="ios-control">
                <select class="ios-select" id="fTerm">
                  <option value="">Any</option>
                  <option value="6">6 months</option>
                  <option value="12">12 months</option>
                  <option value="18">18 months</option>
                </select>
                <svg class="ios-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
              </div>
            </label>
            <label class="ios-item">
              <span class="ios-label">Check-in</span>
              <div class="ios-control">
                <select class="ios-select" id="fCadence">
                  <option value="">Any</option>
                  <option value="monthly photo">Monthly photo</option>
                  <option value="photo every 2 weeks">Photo every 2 weeks</option>
                  <option value="weekly photo">Weekly photo</option>
                </select>
                <svg class="ios-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
              </div>
            </label>
          </div>
        </div>

        <div class="ios-group">
          <div class="ios-group-head">Status</div>
          <div class="ios-box">
            <label class="ios-item">
              <span class="ios-label">All items</span>
              <input type="radio" name="fst" value="all" class="ios-radio" checked>
              <svg class="ios-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            </label>
            <label class="ios-item">
              <span class="ios-label">Open spots</span>
              <input type="radio" name="fst" value="open" class="ios-radio">
              <svg class="ios-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            </label>
            <label class="ios-item">
              <span class="ios-label">Fully branded</span>
              <input type="radio" name="fst" value="done" class="ios-radio">
              <svg class="ios-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            </label>
          </div>
        </div>

        <div class="ios-group">
          <div class="ios-group-head">Spot price</div>
          <div class="ios-box">
            <div class="ios-item ios-item-col" style="padding-bottom:12px;">
              <div class="ios-pricerow" style="margin-top:0;">
                <input class="ios-input-box" id="fmin" type="number" placeholder="Min">
                <span style="color:var(--mfg)">&ndash;</span>
                <input class="ios-input-box" id="fmax" type="number" placeholder="Max">
              </div>
            </div>
          </div>
        </div>

        <div class="ios-group">
          <div class="ios-group-head">Sort</div>
          <div class="ios-box">
            <label class="ios-item">
              <span class="ios-label">Sort by</span>
              <div class="ios-control">
                <select class="ios-select" id="fsort">
                  <option value="new">Newest</option>
                  <option value="close">Closest to funded</option>
                  <option value="cheap">Cheapest</option>
                  <option value="rich">Biggest goal</option>
                </select>
                <svg class="ios-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
              </div>
            </label>
          </div>
        </div>

        <button class="ios-btn" id="clearDashFilters" type="button">Clear filters</button>
      </aside>`;

html = html.replace(oldRailRegex, newRail);

fs.writeFileSync('artifacts/brandmyitem/index.html', html);
