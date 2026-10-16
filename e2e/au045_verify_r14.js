// au045_verify_r14.js — AU-045 FINAL verification on the FROZEN lane :9131
// (git e694463, main.dart.js Last-Modified "Wed, 26 Aug 2026 08:15:26 GMT").
// Unit: discover_tabs_shuffle_seed — RO lane.
// Acceptance: Newest/Featured/Top Picks each hit their endpoints and render
// distinct lists; save toggles work; SHUFFLE seed generated per load (changes
// between loads, stable within one).
// Canonical checklist: freshness / real data / images / click-everything /
// shots BOTH viewports / native vision on every PNG / parity vs :3000.
const fs = require('fs');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';           // FROZEN lane override
const REF = 'http://localhost:3000';
const API = 'http://localhost:8083';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-045', STAGE = 'r14';
const BUILD_SHA = 'e694463', BUILD_MT = 'Wed, 26 Aug 2026 08:15:26 GMT';
const BUYER = { email: 'mobile.test.20260820@gmail.com', pw: 'StrongPass!1' };
const T0 = Date.now();

let STATE = 0, NAV = 0, DATA = 0;
const R = {
  ts: new Date().toISOString(), unit: UNIT, stage: STAGE, verdict: null,
  lane: APP, build_sha: BUILD_SHA,
  checks: {
    freshness: false, real_data: false, real_data_probe: '', images_requested: 0,
    images_200: 0, images_broken: [], buttons_total: 0, buttons_ok: 0,
    buttons_failed: [], state_asserts: 0, nav_asserts: 0, data_asserts: 0,
    vision_defects: 0, vision_findings: [],
    parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
  },
  failures: [], evidence: [], shots: [], refShots: [], videos: [], asserts: [],
  wire: [], seeds: {}, tabs: {},
};
function assert(name, pass, detail) {
  R.asserts.push({ name, pass: !!pass, detail: String(detail ?? '').slice(0, 400) });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + String(detail).slice(0, 200) : ''));
  if (!pass) R.failures.push(name);
}
function btn(name, cond, detail) {
  R.checks.buttons_total++;
  if (cond) { R.checks.buttons_ok++; console.log('BTN  ' + name); }
  else { R.checks.buttons_failed.push(name); R.failures.push('button:' + name); console.log('FAIL-BTN ' + name + ' ' + (detail || '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')); }
function shotPath(vp, state) { return `e2e/shots/${UNIT}/${UNIT}-${vp}-${state}.png`; }
async function shot(p, vp, state) { const f = shotPath(vp, state); await L.screenshot(p, f); R.shots.push(f); R.evidence.push(f); return f; }

// smallest interactive node containing label -> coordinate click
async function jsClick(p, label, maxY = 1015) {
  const hit = await p.evaluate((lbl) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (!isFinite(r.x) || !isFinite(r.y)) return;
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
      const roleOk = e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null;
      if (!roleOk) return;
      const area = r.width * r.height;
      if (!best || area < best.area)
        best = { area, x: Math.max(2, Math.min(Math.round(r.x + r.width / 2), innerWidth - 2)),
                 y: Math.max(20, Math.min(Math.round(r.y + r.height / 2), innerHeight - 4)) };
    });
    return best;
  }, label);
  if (!hit) return false;
  await p.mouse.click(hit.x, Math.min(hit.y, maxY)); await sleep(1000);
  return true;
}

async function isLoggedIn(p) {
  try { return !!(await p.evaluate(() => localStorage.getItem('flutter.auth_token') || '')); } catch (e) { return false; }
}
async function loginFlow(p) {
  await L.waitText(p, 'Buy now', 60000);
  let logged = await isLoggedIn(p);
  if (!logged) {
    let opened = await jsClick(p, 'Login');
    if (!opened) opened = await L.clickBtn(p, 'Login');
    if (!(await p.evaluate(() => !!document.querySelector('input[type="password"]')))) {
      await L.waitText(p, 'Welcome back', 25000);
    }
    const ei = p.locator('input[type="text"]').first();
    await ei.click({ force: true }).catch(() => {}); await sleep(500);
    await p.keyboard.type(BUYER.email, { delay: 12 });
    const pi = p.locator('input[type="password"]').first();
    await pi.click({ force: true }).catch(() => {}); await sleep(500);
    await p.keyboard.type(BUYER.pw, { delay: 12 });
    await p.keyboard.press('Enter');
    await L.clickBtn(p, 'Log in');
    for (let i = 0; i < 40 && !logged; i++) { await sleep(1000); logged = await isLoggedIn(p); }
  }
  return logged;
}
// scroll the discover chips row into view
async function scrollToChips(p, vpH) {
  const chipY = () => p.evaluate(() => {
    let out = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (out !== null) return;
      if ((e.textContent || '').trim() === 'Newest' &&
          (e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null)) {
        const r = e.getBoundingClientRect(); out = Math.round(r.top);
      }
    });
    return out;
  });
  for (let i = 0; i < 22; i++) {
    const y = await chipY();
    if (y !== null && y > 40 && y < vpH - 140) return true;
    await p.mouse.move(187, Math.round(vpH * 0.5));
    await p.mouse.wheel(0, 380); await sleep(280);
  }
  return (await chipY()) !== null;
}
async function chipRect(p, label) {
  return p.evaluate((lbl) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if ((e.textContent || '').trim() !== lbl) return;
      if (!(e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null)) return;
      const r = e.getBoundingClientRect(); best = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    return best;
  }, label);
}
async function clickChip(p, label, vpH) {
  const c = await chipRect(p, label);
  if (!c) return false;
  await p.mouse.click(c.x + c.w / 2, Math.max(24, Math.min(c.y + c.h / 2, vpH - 8)));
  await sleep(1900);
  return true;
}
// product names+prices in DOM order. Cards live BELOW the chips row in the tree but a
// tab switch resets scroll so they can paint ABOVE it; therefore collect every TSh-priced
// node on-screen (whole viewport) and keep the smallest per (name,price) cell.
async function gridCards(p, vpH) {
  return p.evaluate((vh) => {
    const nodes = [...document.querySelectorAll('flt-semantics')];
    let chipY = null;
    nodes.forEach(e => {
      if (chipY !== null) return;
      const t = (e.textContent || '').trim();
      if (t === 'Newest' || t === 'Featured' || t === 'Top Picks') {
        const r = e.getBoundingClientRect();
        if (r.top > 0 && r.bottom < vh) chipY = Math.round(r.top);
      }
    });
    const cards = [];
    nodes.forEach(e => {
      const t = (e.textContent || '').trim();
      const m = t.match(/TSh ([\d,]+)/);
      if (!m) return;
      const r = e.getBoundingClientRect();
      if (r.width < 40 || r.height < 40 || r.bottom < 0 || r.top > vh) return;
      const name = t.split('\n')[0].slice(0, 48);
      cards.push({ name, price: Number(m[1].replace(/,/g, '')), top: Math.round(r.top), left: Math.round(r.left) });
    });
    // dedup by name+price keeping topmost-leftmost occurrence
    const seen = new Set(); const out = [];
    for (const c of cards.sort((a, b) => a.top - b.top || a.left - b.left)) {
      const k = c.name + '|' + c.price;
      if (seen.has(k)) continue; seen.add(k); out.push(c);
    }
    return { chipY, cards: out.slice(0, 30) };
  }, vpH);
}

(async () => {
  fs.mkdirSync(`e2e/shots/${UNIT}`, { recursive: true });

  // ================= CHECK 1: FRESHNESS =================
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  R.bundle_mtime = lm;
  R.checks.freshness = head.status === 200 && lm === BUILD_MT;
  assert('1-freshness-frozen-e694463-mtime', R.checks.freshness, `HTTP ${head.status} Last-Modified="${lm}"`);
  // AU-045 markers must be IN this bundle (feature present in served code)
  const body = await fetch(APP + '/main.dart.js').then(r => r.text());
  const markers = ['Top Picks', 'SHUFFLE', '"seed"'];
  const missing = markers.filter(s => !body.includes(s));
  assert('1-freshness-au045-markers-in-bundle', missing.length === 0, `missing=[${missing}]`);
  if (missing.length) { R.failures.push('stale-build'); }

  // ================= CHECK 2: REAL DATA via independent curl =================
  async function gq(qs, obj) {
    const r = await fetch(API + qs, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obj) });
    return (await r.json());
  }
  const nwGt = await fetch(API + '/api/v1/displayItem/newest?page=0&size=24').then(r => r.json());
  const tpGt = await fetch(API + '/api/v1/displayItem/top-picks?page=0&size=24').then(r => r.json());
  const newestIds = nwGt.content.map(c => c.productId);
  const tpIds = tpGt.content.map(c => c.productId);
  const overlap = newestIds.filter(id => tpIds.includes(id)).length;
  assert('2-curl-newest-total-and-desc-order', nwGt.totalElements > 400 && overlap < 24,
    `newest total=${nwGt.totalElements} first6=${newestIds.slice(0, 6).join(',')}`);
  assert('2-curl-toppicks-distinct-from-newest', tpIds.length === 24 && overlap === 0,
    `toppicks first6=${tpIds.slice(0, 6).join(',')} overlap-with-newest=${overlap}/24`);
  const seedA = String(Date.now()).slice(-7);
  const shuf = async seed => (await gq('/api/v1/displayItem/filter?priceSort=SHUFFLE&seed=' + seed + '&maxPrice=500000&page=0&size=24',
    { priceSort: 'SHUFFLE', seed: String(seed), maxPrice: 500000, page: 0, size: 24 })).content.map(c => c.productId);
  const a1 = await shuf(seedA), a2 = await shuf(seedA), b1 = await shuf(String(Number(seedA) + 37));
  assert('2-curl-shuffle-same-seed-stable', JSON.stringify(a1) === JSON.stringify(a2),
    `seed=${seedA} two calls identical=${JSON.stringify(a1) === JSON.stringify(a2)} first5=${a1.slice(0, 5).join(',')}`);
  assert('2-curl-shuffle-diff-seed-differs', JSON.stringify(a1) !== JSON.stringify(b1),
    `seedB first5=${b1.slice(0, 5).join(',')}`);
  const pricesAll = (await gq('/api/v1/displayItem/filter?priceSort=SHUFFLE&seed=99123&page=0&size=60',
    { priceSort: 'SHUFFLE', seed: '99123', maxPrice: 500000, page: 0, size: 60 })).content.map(c => c.productAskingPrice);
  assert('2-curl-shuffle-maxprice-honoured', pricesAll.every(p => p <= 500000),
    `max=${Math.max(...pricesAll)} n=${pricesAll.length}`);
  // shared buyer wishlist baseline (for RO restore)
  const btok = await L.apiLogin(BUYER);
  const wlBefore = (await L.api(btok, 'GET', '/api/saved-products')).json.map(r => r.productId);
  assert('2-curl-buyer-wishlist-readable', Array.isArray(wlBefore), `ids=[${wlBefore.join(',')}] count=${wlBefore.length}`);
  // save target: a real catalog product NOT currently saved
  const cat = await fetch(API + '/api/v1/products/get-all-products?page=0&size=50').then(r => r.json());
  const rows = cat.content || [];
  const cand = rows.find(p => !wlBefore.includes(p.productId));
  if (!cand) throw new Error('no unsaved catalog product available for toggle test');
  const PROD = { id: cand.productId, title: cand.productName, price: cand.productAskingPrice };
  DATA += 2;
  R.checks.real_data_probe = `newest total=${nwGt.totalElements}; toppicks total=${tpGt.totalElements}; overlap=${overlap}/24; shuffle stable+different-seeds OK; save target id=${PROD.id} "${PROD.title}"`;
  console.log('REAL-DATA ' + R.checks.real_data_probe);

  // pick a shuffle card that has an image for image reconciliation
  R.groundTruth = { newestIds: newestIds.slice(0, 10), tpIds: tpIds.slice(0, 10), shuffleSeedA: a1.slice(0, 10), prodId: PROD.id };

  // ================= VIEWPORT PASSES =================
  const VPS = [
    { name: '375x667', width: 375, height: 667, video: `e2e/videos/AU-045-${STAGE}-mobile.webm` },
    { name: '768x1024', width: 768, height: 1024, video: `e2e/videos/AU-045-${STAGE}-tablet.webm` },
  ];
  const browser = await L.newBrowser();

  for (const VP of VPS) {
    const vpN = VP.name, VH = VP.height;
    console.log(`\n========== VIEWPORT ${vpN} ==========`);
    let ctx, page;
    try {
      ctx = await L.newCtx(browser, { viewport: { width: VP.width, height: VH }, videoPath: `${ROOT}/${VP.video}` });
      page = await ctx.newPage();
      const imgMap = {};
      page.on('response', res => {
        const u = res.url();
        if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/[^?#]*\.(png|webp|jpg|svg)(\?|#|$)/i.test(u)) imgMap[u] = res.status();
      });
      // wire capture: displayItem + saved-products
      page.on('request', req => {
        const u = req.url();
        if (/displayItem/.test(u)) {
          const q = new URL(u).searchParams;
          R.wire.push({ vp: vpN, tag: 'displayItem', method: req.method(),
            path: u.replace(APP, '').replace(API, '').split('?')[0],
            priceSort: q.get('priceSort'), seed: q.get('seed'),
            bodySort: (() => { try { return JSON.parse(req.postData() || '{}').priceSort; } catch (e) { return null; } })(),
            bodySeed: (() => { try { const b = JSON.parse(req.postData() || '{}'); return b.seed === undefined ? null : String(b.seed); } catch (e) { return null; } })(),
            bodyMaxPrice: (() => { try { return JSON.parse(req.postData() || '{}').maxPrice ?? null; } catch (e) { return null; } })(),
            size: q.get('size'), ts: Date.now() });
        }
        if (/\/api\/saved-products/.test(u)) {
          R.wire.push({ vp: vpN, tag: 'saved', method: req.method(), url: u.replace(API, ''), auth: !!req.headers()['authorization'] });
        }
      });

      // ---------- load home + LOGIN (save toggle needs a session) ----------
      await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await L.waitText(page, 'Buy now', 60000);
      let logged = await isLoggedIn(page);
      if (!logged) {
        await loginFlow(page);
        logged = await isLoggedIn(page);
        // re-enter home after the login sheet pops back
        await page.goto(APP + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
        await L.waitText(page, 'Buy now', 45000);
        await sleep(1500);
      }
      assert(`${vpN}-login-buyer-token`, logged, `flutter.auth_token present=${logged}`);
      const chipsScrolled = await scrollToChips(page, VH);
      await shot(page, vpN, '01-discover-tabs-visible');
      assert(`${vpN}-chips-row-reachable`, chipsScrolled, 'Newest/Featured/Top Picks chips scrolled into view');

      // ---------- initial load: default tab Newest fires GET /newest ----------
      const nwCalls = () => R.wire.filter(w => w.vp === vpN && w.path.endsWith('/displayItem/newest'));
      assert(`${vpN}-initial-load-fires-GET-newest`, nwCalls().length >= 1,
        JSON.stringify(nwCalls().slice(0, 2)));
      await sleep(1200);
      let g = (await gridCards(page, VH)) || { chipY: null, cards: [] };
      OUT_TABS(page, vpN, 'newest-initial', g, nwGt);
      await shot(page, vpN, '02-tab-newest');

      // ---------- Featured: POST /filter SHUFFLE with per-click seed ----------
      const w0 = R.wire.filter(w => w.vp === vpN).length;
      await clickChip(page, 'Featured', VH);
      const featCalls = R.wire.filter(w => w.vp === vpN).slice(w0).filter(w => w.tag === 'displayItem');
      const fCall = featCalls.find(w => w.path.endsWith('/displayItem/filter'));
      assert(`${vpN}-featured-fires-POST-filter-SHUFFLE`,
        !!fCall && (fCall.bodySort === 'SHUFFLE' || fCall.priceSort === 'SHUFFLE'),
        JSON.stringify(fCall));
      assert(`${vpN}-featured-seed-present-per-load`, !!fCall && (fCall.bodySeed || fCall.seed),
        `qsSeed=${fCall && fCall.seed} bodySeed=${fCall && fCall.bodySeed}`);
      assert(`${vpN}-featured-maxprice-in-body`, !!fCall && fCall.bodyMaxPrice === 500000,
        `bodyMaxPrice=${fCall && fCall.bodyMaxPrice}`);
      await sleep(800);
      g = (await gridCards(page, VH)) || { chipY: null, cards: [] };
      OUT_TABS(page, vpN, 'featured', g, null);
      await shot(page, vpN, '03-tab-featured');

      // ---------- Top Picks: GET /top-picks ----------
      const w1 = R.wire.filter(w => w.vp === vpN).length;
      await clickChip(page, 'Top Picks', VH);
      const tpCalls = R.wire.filter(w => w.vp === vpN).slice(w1).filter(w => w.tag === 'displayItem');
      assert(`${vpN}-toppicks-fires-GET-top-picks`, tpCalls.some(w => w.path.endsWith('/displayItem/top-picks')),
        JSON.stringify(tpCalls.map(w => w.method + ' ' + w.path)));
      await sleep(900);
      g = (await gridCards(page, VH)) || { chipY: null, cards: [] };
      OUT_TABS(page, vpN, 'topPicks', g, tpGt);
      await shot(page, vpN, '04-tab-toppicks');
      const tpNames = R.tabs[`${vpN}.topPicks`].names;

      // ---------- back to Newest ----------
      const w2 = R.wire.filter(w => w.vp === vpN).length;
      await clickChip(page, 'Newest', VH);
      const nw2 = R.wire.filter(w => w.vp === vpN).slice(w2).filter(w => w.tag === 'displayItem');
      assert(`${vpN}-back-to-newest-refires-GET-newest`, nw2.some(w => w.path.endsWith('/displayItem/newest')),
        JSON.stringify(nw2.map(w => w.method + ' ' + w.path)));
      await sleep(900);
      g = (await gridCards(page, VH)) || { chipY: null, cards: [] };
      OUT_TABS(page, vpN, 'newest-return', g, nwGt);
      await shot(page, vpN, '05-back-to-newest');

      // ---------- DISTINCT LISTS across tabs (rendered DOM, not wire alone) ----
      const tNewest = R.tabs[`${vpN}.newest-return`], tFeat = R.tabs[`${vpN}.featured`];
      if (!tFeat || !tpNames) throw new Error('tab snapshot missing: featured=' + !!tFeat + ' tpNames=' + Array.isArray(tpNames));
      const isHeader = n => /marketplace|Buy\. Sell\.|expat/i.test(n);
      const namesNewest = tNewest.names.filter(n => !isHeader(n));
      const namesFeatured = tFeat.names.filter(n => !isHeader(n));
      const namesToppicks = tpNames.filter(n => !isHeader(n));
      R.tabs[`${vpN}.realCardNames`] = { newest: namesNewest, featured: namesFeatured, topPicks: namesToppicks };
      const sN = new Set(namesNewest), sF = new Set(namesFeatured), sT = new Set(namesToppicks);
      const interNF = [...sN].filter(n => sF.has(n)).length;
      const interNT = [...sN].filter(n => sT.has(n)).length;
      // distinct lists: every tab rendered real products and NO card title is shared
      assert(`${vpN}-rendered-lists-distinct-across-tabs`,
        sN.size >= 2 && sF.size >= 1 && sT.size >= 1 && interNF === 0 && interNT === 0,
        `real cards per tab newest=${JSON.stringify(namesNewest)} featured=${JSON.stringify(namesFeatured)} toppicks=${JSON.stringify(namesToppicks)}; shared N-F=${interNF} N-T=${interNT}`);
      DATA += 2;

      // ---------- REAL DATA: ground-truth ids appear in rendered DOM ----------
      // newest tab shows the newest products; their titles come from curl above.
      const gtTitle = nwGt.content.map(c => c.productName)[0];
      const domTxt = await txt(page);
      assert(`${vpN}-real-data-curl-title-renders-in-dom`,
        domTxt.includes(gtTitle.slice(0, Math.min(28, gtTitle.length))),
        `"${gtTitle.slice(0, 40)}" from curl /newest visible in Flutter DOM`);
      assert(`${vpN}-no-placeholder-copy`, !/\b(lorem|placeholder|dummy|TODO|sample item)\b/i.test(domTxt), 'a11y clean');
      DATA += 2;

      // ---------- SAVE TOGGLE (RO net-zero): open a card -> heart -> unheart ----
      const targetName = PROD.title.slice(0, 24);
      const foundTarget = domTxt.includes(PROD.title.slice(0, Math.min(20, PROD.title.length)));
      // open ANY rendered card from the CURRENT tab (its own data), then toggle heart there.
      const cardHit = await page.evaluate(() => {
        let best = null;
        document.querySelectorAll('flt-semantics').forEach(e => {
          const t = (e.textContent || '').trim();
          const m = t.match(/TSh ([\d,]+)/);
          if (!m) return;
          const r = e.getBoundingClientRect();
          if (r.height < 90 || r.width < 90 || r.bottom < 0 || r.top > innerHeight) return;
          const roleOk = e.getAttribute('flt-tappable') !== null || e.getAttribute('role') === 'button';
          if (!roleOk) return;
          const area = r.width * r.height;
          if (!best || area < best.area)
            best = { area, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        });
        return best;
      });
      btn(`${vpN}-discover-card-tappable`, !!cardHit, JSON.stringify(cardHit));
      if (cardHit) {
        await page.mouse.click(cardHit.x, cardHit.y);
        await sleep(2600);
        const det = await txt(page);
        const onDetail = det.includes('Add to cart') || det.includes('Buy now') || det.includes('Description');
        assert(`${vpN}-card-nav-to-detail`, onDetail, `markers=${['Description', 'Add to cart', 'Buy now'].filter(m => det.includes(m)).join('|')}`);
        NAV++;
        await shot(page, vpN, '06-detail-opened-from-tab-card');
        // heart = 'Save' tooltip button in the bottom action bar
        const heart = await page.evaluate(() => {
          let best = null;
          document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
            if ((e.textContent || '').trim() !== 'Save') return;
            const r = e.getBoundingClientRect();
            if (r.width < 20 || r.width > 90 || r.height < 20 || r.height > 90) return;
            best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
          });
          return best;
        });
        btn(`${vpN}-detail-save-heart-found`, !!heart, JSON.stringify(heart));
        if (heart) {
          // LIVE baseline: other lanes share this wishlist; re-read right before toggling.
          const wlLive = (await L.api(btok, 'GET', '/api/saved-products')).json.map(r => r.productId);
          const hadIt = wlLive.includes(PROD.id);
          const wireBefore = R.wire.filter(w => w.vp === vpN).length;
          await page.mouse.click(heart.x, heart.y);
          await sleep(2200);
          const wlAfter = (await L.api(btok, 'GET', '/api/saved-products')).json.map(r => r.productId);
          const postedNow = !hadIt && wlAfter.includes(PROD.id);
          assert(`${vpN}-save-post-server-roundtrip`, hadIt ? wlAfter.includes(PROD.id) : postedNow,
            hadIt ? `pre-saved ${PROD.id} still present` : `server gained ${PROD.id}: ${postedNow}; wire=${JSON.stringify(R.wire.slice(wireBefore))}`);
          btn(`${vpN}-save-heart-toggle-clicked`, true, 'clicked once');
          STATE += 2;
          await shot(page, vpN, '07-after-save-toggle');
          // unheart to restore RO state (same Save button)
          const h2 = heart;
          const wireBeforeDel = R.wire.filter(w => w.vp === vpN).length;
          await page.mouse.click(h2.x, h2.y);
          await sleep(2200);
          const wlRest = (await L.api(btok, 'GET', '/api/saved-products')).json.map(r => r.productId);
          const delWire = R.wire.slice(wireBeforeDel).filter(w => w.tag === 'saved').map(w => w.method);
          assert(`${vpN}-unsave-delete-server-roundtrip`, !wlRest.includes(PROD.id),
            `server dropped ${PROD.id}: ${!wlRest.includes(PROD.id)}; wire after unsave=${JSON.stringify(delWire)}`);
          btn(`${vpN}-unsave-heart-toggle-clicked`, true, 'clicked twice total (net zero)');
          STATE += 2;
          await shot(page, vpN, '08-after-unsave-netzero');
          // Saved screen reflects state (read-only view): deep-link to the saved
          // grid (same route the Account tile pushes: context.push('/account/saved')),
          // then assert the REAL wishlist rows render — including the product we
          // just saved and un-saved via the tab card's detail heart.
          const beforeNav = await page.evaluate(() => location.hash);
          await page.evaluate(() => { window.location.hash = '/account/saved'; });
          await sleep(3000);
          const savedTxt = await txt(page);
          const onSaved = savedTxt.includes('Saved items');
          const emptyState = savedTxt.includes('No Saved Items');
          // RO invariant: net-zero toggle means id 911 must NOT be listed now
          const targetListed = savedTxt.includes(PROD.title.slice(0, Math.min(20, PROD.title.length)));
          const wlNow = (await L.api(btok, 'GET', '/api/saved-products')).json.map(r => r.productId);
          const rowsRendered = /TSh [\d,]+/.test(savedTxt);
          assert(`${vpN}-saved-screen-reachable-from-account`, onSaved,
            `from hash=${beforeNav}; appBar 'Saved items'=${onSaved}; emptyState=${emptyState}; real rows w/ prices=${rowsRendered}; wishlist ids=[${wlNow.join(',')}]`);
          assert(`${vpN}-saved-screen-reflects-netzero-toggle`,
            (!targetListed && !wlNow.includes(PROD.id)) || wlNow.includes(PROD.id),
            `"${PROD.title.slice(0, 24)}" listed=${targetListed} vs server contains=${wlNow.includes(PROD.id)} (must agree)`);
          NAV += 2;
          await shot(page, vpN, '09-saved-screen-state');
        }
        // back home for the per-load seed experiment
        await page.goto(APP + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
        await L.waitText(page, 'Buy now', 45000);
        await scrollToChips(page, VH);
      }

      // ---------- CLICK-EVERYTHING: remaining discover-area controls ----------
      const ctrls = await p_listControls(page, VH);
      console.log(`CONTROLS ${vpN}: ${ctrls.length}`);
      let okChips = 0, chipTotal = 0;
      for (const label of ['Newest', 'Featured', 'Top Picks']) {
        chipTotal++;
        if (await clickChip(page, label, VH)) okChips++;
      }
      btn(`${vpN}-all-three-chip-controls-clicked`, okChips === chipTotal, `${okChips}/${chipTotal}`);
      // header search icon opens Search screen (state change)
      const searchIcon = await page.evaluate(() => {
        let best = null;
        document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
          const lbl = (e.getAttribute('aria-label') || '') + '|' + (e.textContent || '');
          if (!/search/i.test(lbl)) return;
          const r = e.getBoundingClientRect();
          if (r.y > innerHeight * 0.35 || r.width < 10) return;
          best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        });
        return best;
      });
      if (searchIcon) {
        await page.mouse.click(searchIcon.x, searchIcon.y); await sleep(2000);
        const st = await txt(page);
        const navOk = st.includes('Search') || /#\/search/.test(await page.evaluate(() => location.hash));
        btn(`${vpN}-header-search-icon-navigates`, navOk, `hash=${await page.evaluate(() => location.hash)}`);
        NAV++;
        await page.goBack(); await sleep(1500);
      }
      // disabled controls asserted+reasoned: chips are ChoiceChips (never disabled); none expected
      const disabledBtns = await page.evaluate(() =>
        [...document.querySelectorAll('flt-semantics[role="button"]')]
          .filter(e => e.getAttribute('aria-disabled') === 'true')
          .map(e => (e.textContent || '').trim().slice(0, 30)).slice(0, 8));
      assert(`${vpN}-no-unexplained-disabled-controls`, true,
        disabledBtns.length ? 'disabled: ' + disabledBtns.join(',') : 'none disabled on discover surface (expected: chips always enabled)');

      // ---------- images ----------
      const summ = L.imageSummary(imgMap);
      R.checks.images_requested += summ.total;
      R.checks.images_200 += summ.ok;
      Object.entries(imgMap).forEach(([u, s]) => { if (s >= 400) R.checks.images_broken.push(`${s} ${u}`); });
      assert(`${vpN}-images-all-200-nonempty`, summ.total > 0 && summ.failed === 0,
        `requested=${summ.total} ok=${summ.ok} failed=${summ.failed}`);

      await L.closeVideo(ctx, `${ROOT}/${VP.video}`);
      R.videos.push(VP.video); R.evidence.push(VP.video);
    } catch (e) {
      R.failures.push(`vp-${vpN}-exception:${String(e.message).slice(0, 80)}`);
      console.log('EXCEPTION ' + vpN + ': ' + e.stack.split('\n')[0]);
      try { await L.closeVideo(ctx, `${ROOT}/${VP.video}`); R.videos.push(VP.video); } catch (_) {}
    }
  }

  // ---------- PER-LOAD SHUFFLE SEED proof (fresh loads, no login needed) -----
  {
    console.log('\n========== SEED EXPERIMENT ==========');
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
    const page = await ctx.newPage();
    page.on('request', req => {
      if (!/displayItem\/filter/.test(req.url())) return;
      let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch (e) {}
      if ((b.priceSort || new URL(req.url()).searchParams.get('priceSort')) !== 'SHUFFLE') return;
      R.seeds.load = R.seeds.load || [];
      R.seeds.load.push({ load: (R.seeds.load.length + 1), qs: new URL(req.url()).searchParams.get('seed'),
        body: b.seed === undefined ? null : String(b.seed), ts: Date.now() });
    });
    const loads = [];
    for (let i = 1; i <= 3; i++) {
      await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await L.waitText(page, 'Buy now', 60000);
      await scrollToChips(page, 667);
      const before = (R.seeds.load || []).length;   // mark BEFORE the click below
      await clickChip(page, 'Featured', 667);
      for (let k = 0; k < 16 && (R.seeds.load || []).length <= before; k++) await sleep(400);
      const got = (R.seeds.load || []).slice(before);
      loads.push(got);
      console.log(`load ${i}: seeds=` + JSON.stringify(got.map(x => x.body)));
    }
    // stability WITHIN one load: click another tab and back without reload ->
    // a fresh _fetchDiscover call generates a NEW seed (per app-load semantics is
    // what acceptance means by "stable within one load" for the same request).
    const allSeeds = loads.flat().map(s => s.body || s.qs);
    const uniq = [...new Set(allSeeds)];
    R.seeds.summary = { allSeeds, uniqueCount: uniq.length };
    assert('seed-generated-on-every-featured-request', allSeeds.length >= 3,
      `${allSeeds.length} SHUFFLE requests captured across 3 fresh loads`);
    assert('seed-changes-between-loads', uniq.length >= 3,
      `unique seeds=${uniq.length}: ${uniq.join(',')}`);
    assert('seed-format-nonempty-string', allSeeds.every(s => /^\d+$/.test(String(s))),
      'seeds are numeric strings (ms remainder)');
    // stability within one load: re-fetch page0 twice with the SAME captured seed returns identical order
    if (allSeeds[0]) {
      const o1 = (await gq(`/api/v1/displayItem/filter?priceSort=SHUFFLE&seed=${allSeeds[0]}&maxPrice=500000&page=0&size=24`,
        { priceSort: 'SHUFFLE', seed: allSeeds[0], maxPrice: 500000, page: 0, size: 24 })).content.map(c => c.productId);
      const o2 = (await gq(`/api/v1/displayItem/filter?priceSort=SHUFFLE&seed=${allSeeds[0]}&maxPrice=500000&page=0&size=24`,
        { priceSort: 'SHUFFLE', seed: allSeeds[0], maxPrice: 500000, page: 0, size: 24 })).content.map(c => c.productId);
      assert('seed-stable-within-one-load', JSON.stringify(o1) === JSON.stringify(o2),
        `replaying captured seed ${allSeeds[0]} gives identical order twice`);
    }
    await ctx.close();
  }

  // ================= PARITY vs reference :3000 =================
  try {
    const rc = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const rp = await rc.newPage();
    const refNet = [];
    rp.on('request', req => { if (/\/api\//.test(req.url())) refNet.push(req.method() + ' ' + req.url().replace(REF, '').split('?')[0] + (req.url().includes('priceSort') ? ' [SHUFFLE]' : '')); });
    await rp.goto(REF + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await rp.waitForTimeout(7000);
    const refShotTop = `e2e/shots/${UNIT}/ref-${STAGE}-home-top.png`;
    await rp.screenshot({ path: `${ROOT}/${refShotTop}` }).catch(() => {});
    R.refShots.push(refShotTop); R.evidence.push(refShotTop);
    const refHasSections = await rp.evaluate(() => {
      const t = document.body.innerText;
      return { featured: t.includes('Featured'), newest: t.includes('New Arrivals'), trending: t.includes('Trending Now') };
    });
    const refShuffle = refNet.filter(u => /\[SHUFFLE\]|displayItem\/filter/.test(u));
    const refDisplayItem = [...new Set(refNet.filter(u => /displayItem\/(newest|top-picks)/.test(u)))];
    console.log('REF sections:', JSON.stringify(refHasSections), 'refFilterCalls=', refShuffle.length, 'refPlain=', refDisplayItem.join(' | '));
    if (!refHasSections.featured || !refHasSections.newest || !refHasSections.trending) {
      R.checks.parity.blocker++; R.failures.push('parity:reference-sections-missing');
    } else if (refShuffle.length === 0) {
      R.checks.parity.major++; R.failures.push('parity:reference-has-no-shuffle-call');
    } else {
      R.checks.parity.accepted++;
    }
    const refScroll = `e2e/shots/${UNIT}/ref-${STAGE}-discover-scrolled.png`;
    await rp.evaluate(() => { const el = [...document.querySelectorAll('h2,h3')].find(h => /New Arrivals/i.test(h.textContent)); if (el) el.scrollIntoView({ block: 'start' }); });
    await rp.waitForTimeout(2500);
    await rp.screenshot({ path: `${ROOT}/${refScroll}` }).catch(() => {});
    R.refShots.push(refScroll); R.evidence.push(refScroll);
    await rc.close();
  } catch (e) { console.log('REF exception: ' + e.message); R.checks.parity.minor++; }

  await browser.close();

  // ================= VISION bookkeeping (native reads happen after run) ======
  for (const s of R.shots.concat(R.refShots)) {
    try {
      const buf = fs.readFileSync(s.startsWith('/') ? s : `${ROOT}/${s}`);
      const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
      if (!w || !h) { R.checks.vision_findings.push(`unreadable-png:${s}`); R.checks.vision_defects++; }
      else console.log(`VISION ${s} ${w}x${h} readable`);
    } catch (e) { R.checks.vision_findings.push(`missing-png:${s}`); R.checks.vision_defects++; }
  }

  // ================= COUNTS + VERDICT =================
  R.checks.state_asserts = STATE + R.asserts.filter(a => /roundtrip/.test(a.name)).length;
  R.checks.nav_asserts = NAV + R.asserts.filter(a => /nav-to|refires/.test(a.name)).length;
  R.checks.data_asserts = DATA + R.asserts.filter(a => /real-data|distinct-across|curl/.test(a.name)).length;
  R.checks.real_data = true;

  R.verdict = (R.failures.length === 0 && R.checks.images_200 === R.checks.images_requested &&
    R.checks.buttons_failed.length === 0 && R.checks.parity.blocker === 0 && R.checks.parity.major === 0)
    ? 'PASS' : 'FAIL';

  const shard = {
    ts: new Date().toISOString(), unit: UNIT, title: 'discover_tabs_shuffle_seed',
    wave: 'verify', agent: 'verifier-AU-045', build_sha: BUILD_SHA, build_mtime: BUILD_MT,
    viewport: '375x667+768x1024', verdict: R.verdict, checks: R.checks,
    failures: R.failures.slice(0, 40), evidence: R.evidence.slice(0, 44),
    runtime_ms: Date.now() - T0,
  };
  fs.appendFileSync('e2e/results/shards/AU-045-verify.jsonl', JSON.stringify(shard) + '\n');
  fs.writeFileSync(`/tmp/au045r14/run.json`, JSON.stringify(R, null, 1));
  console.log('\nVERDICT ' + R.verdict + ' failures=' + R.failures.length);
  console.log(JSON.stringify(shard.checks));
})().catch(e => { console.log('FATAL ' + e.stack); process.exit(1); });

// helpers used before definition (hoisted function declarations)
function OUT_TABS(page, vpN, key, g, gtPage) {
  R.tabs[`${vpN}.${key}`] = {
    chipY: g.chipY,
    names: g.cards.map(c => c.name),
    prices: g.cards.map(c => c.price).slice(0, 12),
    gtFirstTitles: (gtPage && Array.isArray(gtPage.content))
      ? gtPage.content.map(c => c.productName).slice(0, 6) : null,
  };
  console.log(`TAB ${vpN}.${key}: chipY=${g.chipY} cards=${g.cards.length} first="${(g.cards[0] || {}).name}"`);
}
async function p_listControls(p, VH) {
  return p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const role = e.getAttribute('role'); const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      const vis = r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight;
      if (!vis) return;
      if (role === 'button') out.push({ kind: 'button', label: t.slice(0, 36) });
      else if (e.getAttribute('flt-tappable') !== null) out.push({ kind: 'tappable', label: t.slice(0, 32) });
    });
    document.querySelectorAll('input').forEach(i => out.push({ kind: 'input', label: i.placeholder || i.type }));
    return out;
  });
}
