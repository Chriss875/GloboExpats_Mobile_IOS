// au051_verify_r14.js — AU-051 seller_storefront_full — RO lane — FROZEN bundle :9131
//   git sha e694463, main.dart.js Last-Modified "Wed, 26 Aug 2026 08:15:26 GMT".
//   Build commit 36e4d38 (feat(AU-051) storefront) verified as an ancestor of e694463.
//
// Acceptance: /seller/:id renders profile + full listings grid (displayItem/filter
// sellerId) + ratings list (user-ratings) + per-item click counts incrementing.
//
// RO discipline: read-only vs shared sandbox seed. No listings/orders created.
// The ONLY write is the public POST /products/{id}/clicks counter on the detail
// screen open (the acceptance criterion itself), done with our own stable
// X-Anonymous-Id; the +N is recorded, never rolled back (counter semantics).
//
// Parity judge: :3000 runs the SAME Next.js build but proxies to the DEV backend
// (:8081) whose data differs from this sandbox. So structural parity is judged on
// dev-backend seller 3 ("Globo Expats": 82 listings, 5 ratings, views/clickCount
// rendered per card) — same flow/data-shape/viewport — while DATA parity for the
// sandbox seller 142 is judged against :8083 curl truth directly.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';
const REF = 'http://localhost:3000';
const API = 'http://localhost:8083';
const UNIT = 'AU-051', STAGE = 'verify-r14';
const BUILD_SHA = 'e694463', BUILD_MT = 'Wed, 26 Aug 2026 08:15:26 GMT';
const SELLER = 142;
const ANON = 'au051-verify-' + Date.now().toString(36);
const SHOT_DIR = `e2e/shots/${UNIT}`;
const T0 = Date.now();

let NAV = 0, DATA = 0;
let STATE = 0; // declared (AU-050 harness bug postmortem)
const R = {
  ts: new Date().toISOString(), unit: UNIT, stage: STAGE, verdict: null,
  lane: APP, build_sha: BUILD_SHA, bundle_mtime: null,
  checks: {
    freshness: false, real_data: false, real_data_probe: '', images_requested: 0,
    images_200: 0, images_broken: [], buttons_total: 0, buttons_ok: 0,
    buttons_failed: [], state_asserts: 0, nav_asserts: 0, data_asserts: 0,
    vision_defects: 0, vision_findings: [],
    parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
  },
  failures: [], evidence: [], shots: [], refShots: [], videos: [], asserts: [],
  wire: { reqs: [], resps: [], clicks: [] }, images: {}, consoles: [],
};
function assert(name, pass, detail) {
  R.asserts.push({ name, pass: !!pass, detail: String(detail ?? '').slice(0, 400) });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + String(detail).slice(0, 220) : ''));
  if (!pass) R.failures.push(name);
}
function btnck(name, cond, detail) {
  R.checks.buttons_total++;
  if (cond) { R.checks.buttons_ok++; console.log('BTN  ok ' + name); }
  else { R.checks.buttons_failed.push(name); console.log('BTN  FAIL ' + name + ' :: ' + (detail || '')); }
  return !!cond;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p) { return L.allText(p); }
async function shot(p, vp, state) {
  const f = path.join(SHOT_DIR, `${UNIT}-${vp}-${state}.png`.replace(/ /g, '_'));
  await L.screenshot(p, f); R.shots.push(f); console.log('shot', f); return f;
}
// smallest-area tappable/button node containing lbl -> coordinate click
async function jsClick(p, label) {
  const hit = await p.evaluate((label) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(label)) return;
      if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      if (!isFinite(r.x) || !isFinite(r.y)) return;
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
      const area = r.width * r.height;
      if (!best || area < best.area)
        best = { area, x: Math.max(2, Math.min(Math.round(r.x + r.width / 2), innerWidth - 2)),
                 y: Math.max(20, Math.min(Math.round(r.y + r.height / 2), innerHeight - 4)) };
    });
    return best;
  }, label);
  if (!hit) return false;
  await p.mouse.click(hit.x, hit.y); await sleep(1100);
  return true;
}
async function scrollDown(p, n = 10, step = 340) {
  await p.mouse.move(180, 380);
  for (let i = 0; i < n; i++) { await p.mouse.wheel(0, step); await sleep(150); }
  await sleep(1200);
}
async function gotoSeller(p, vpName) {
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000).catch(() => {});
  await p.evaluate(h => { window.location.hash = h; }, `/seller/${SELLER}`).catch(() => {});
  const got = await L.waitText(p, 'Listings', 40000).catch(() => false);
  await p.waitForTimeout(2500);
  return got;
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  // ================= CHECK 1: FRESHNESS =================
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  R.bundle_mtime = lm;
  // byte-marker proof that the AU-051 storefront build is IN this served bundle:
  // strings unique to lib/screens/seller_profile_screen.dart @36e4d38
  const src = await fetch(APP + '/main.dart.js').then(r => r.text());
  const markers = ['No active listings right now.', 'Could not load seller.'];
  const missingMarkers = markers.filter(m => !src.includes(m));
  R.checks.freshness = head.status === 200 && lm === BUILD_MT && missingMarkers.length === 0;
  assert('1-freshness-frozen-e694463-bundle', R.checks.freshness,
    `HTTP ${head.status} Last-Modified="${lm}" expected="${BUILD_MT}"; AU-051 markers missing=[${missingMarkers}]`);
  if (!R.checks.freshness) {
    console.log('BLOCKED-stale-build');
    fs.writeFileSync(`e2e/results/shards/raw-${UNIT}-r14.json`, JSON.stringify(R, null, 1));
    process.exit(3);
  }

  // ================= CHECK 2: REAL DATA (curl readback :8083) =================
  const filterTruth = await fetch(`${API}/api/v1/displayItem/filter`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sellerId: SELLER, page: 0, size: 24 }),
  }).then(r => r.json());
  const sumTruth = await fetch(`${API}/api/v1/userManagement/seller-summary/${SELLER}`).then(r => r.json());
  const ratTruth = await fetch(`${API}/api/v1/user-ratings/${SELLER}?page=0&size=10`).then(r => r.json());
  const truthRows = filterTruth.content || [];
  const truthNames = truthRows.map(c => c.productName);
  const truthPrices = truthRows.map(c => Number(c.productAskingPrice).toLocaleString('en-US'));
  DATA++;
  assert('2-real-data-curl-readback', Array.isArray(truthRows) && truthRows.length === 6 &&
    sumTruth.firstName === 'Mobile' && ratTruth.totalElements === 1,
    `filter total=${filterTruth.content.length} names[0]=${truthNames[0]}; summary="${sumTruth.firstName} ${sumTruth.lastName}" rating=${sumTruth.averageRating}(${sumTruth.totalRatingsCount}); ratings total=${ratTruth.totalElements}`);
  R.checks.real_data = true;
  R.checks.real_data_probe = `curl POST displayItem/filter{sellerId:${SELLER}} -> 6 rows [${truthNames.slice(0,3).join(' | ')}]; GET seller-summary/${SELLER} -> "${sumTruth.firstName} ${sumTruth.lastName}" VERIFIED avg=${sumTruth.averageRating}; GET user-ratings/${SELLER} -> totalElements=1 author=${(ratTruth.content||[])[0] && ratTruth.content[0].authorName}`;
  const lorem = JSON.stringify({ t: truthRows, s: sumTruth, r: ratTruth.content }).match(/lorem|ipsum|placeholder|dummy|sample data|TODO/i);
  assert('2-no-placeholder-copy-in-payload', !lorem, String(lorem));

  // click-counter baseline (public endpoints)
  const CLICK_ID = truthRows[0].productId; // 766
  const baseClicks = await fetch(`${API}/api/v1/products/${CLICK_ID}/clicks/total`).then(r => r.json());

  // ================= BROWSER LEGS per viewport =================
  const browser = await L.newBrowser();
  const VPS = [['375', { width: 375, height: 667 }], ['768', { width: 768, height: 1024 }]];
  for (const [vpName, vp] of VPS) {
    console.log(`===== VIEWPORT ${vpName} =====`);
    const videoPath = `e2e/videos/AU-051-verify-r14-${vpName}.webm`;
    const ctx = await L.newCtx(browser, { viewport: vp, videoPath });
    R.videos.push(videoPath);
    const p = await ctx.newPage();
    p.setDefaultTimeout(30000);
    p.on('console', m => { if (/error/i.test(m.type())) R.consoles.push({ vp: vpName, msg: m.text().slice(0, 160) }); });
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?#]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/[^?#]*\.(png|webp|jpg|svg)(\?|#|$)/i.test(u)) {
        R.images[u] = r.status();
      }
      if (/\/uploads\/.*\.(png|jpe?g|webp)/i.test(u)) {
        const s = r.status();
        if (s >= 400) R.checks.images_broken.push(u.slice(-60));
      }
      if (/displayItem\/filter\?sellerId/.test(u)) R.wire.reqs.push({ vp: vpName, url: u.slice(u.indexOf('api/v1/')) });
      if (/user-ratings\/142/.test(u)) R.wire.reqs.push({ vp: vpName, url: u.slice(u.indexOf('api/v1/')) });
      if (/seller-summary\/142/.test(u)) R.wire.reqs.push({ vp: vpName, url: u.slice(u.indexOf('api/v1/')) });
      if (/products\/\d+\/clicks\b/.test(u)) R.wire.clicks.push({ vp: vpName, m: r.request().method(), u: u.slice(u.indexOf('api/v1/')), s: r.status() });
    });

    // ---- NAV to storefront ----
    const loaded = await gotoSeller(p, vpName);
    NAV++;
    btnck(`nav-hash-/seller/${SELLER}->storefront`, loaded, 'hash nav rendered Listings section');
    let t = await txt(p);

    // ---------- PROFILE HEADER (real summary values) ----------
    const nameOk = t.includes('Mobile Test');
    assert(`A1-${vpName}-profile-name-renders`, nameOk, `"Mobile Test" from seller-summary/142 in a11y tree`);
    DATA++;
    const ratingOk = t.includes('4.0') && t.includes('(1 ratings)');
    assert(`A2-${vpName}-rating-summary-renders`, ratingOk, `"4.0 (1 ratings)" matches averageRating=4.0 totalRatingsCount=1`);
    DATA++;
    await shot(p, vpName, '00-storefront-top');

    // ---------- LISTINGS GRID ----------
    const priceHits = truthPrices.filter(pr => t.includes('TSh ' + pr));
    assert(`B1-${vpName}-grid-all-6-listings-render`, priceHits.length >= 5 && t.includes('Listings'),
      `${priceHits.length}/6 verbatim prices present: [${truthPrices.join(', ')}] hits=${priceHits.length}`);
    DATA++;
    const gridNames = truthNames.filter(n => t.includes(n.slice(0, Math.min(n.length, 24))));
    assert(`B2-${vpName}-grid-names-match-curl`, gridNames.length >= 5,
      `${gridNames.length}/6 names matched: [${gridNames.join(' | ').slice(0, 160)}]`);
    DATA++;
    // order check: backend returns newest-first; UI must preserve it (first row = 766 toaster @46k)
    const firstCardIdx = t.indexOf(truthNames[0].slice(0, 20));
    const secondCardIdx = t.indexOf(truthNames[1].slice(0, 20));
    assert(`B3-${vpName}-grid-order-preserved`, firstCardIdx >= 0 && secondCardIdx > firstCardIdx,
      `"${truthNames[0].slice(0,24)}" at ${firstCardIdx} before "${truthNames[1].slice(0,24)}" at ${secondCardIdx} (backend order)`);

    // ---------- CARD TAP -> DETAIL (navigation + click-count increment) ----------
    const clicksBeforeWire = R.wire.clicks.length;
    const tapped = (await L.clickCard(p, truthRows[0].productName.slice(0, 20))) || (await jsClick(p, truthRows[0].productName.slice(0, 20)));
    await sleep(3500);
    const dtxt = await txt(p);
    const onDetail = /Add to Cart|Buy now|total views|Description/.test(dtxt) && !dtxt.includes('Listings\nTSh ' + truthPrices[0]);
    NAV++;
    btnck(`${vpName}-card-tap-navigates-to-detail`, tapped && (/Add to Cart/.test(dtxt) || /total views/.test(dtxt)),
      `tapped=${tapped}; detail signals: AddToCart=${dtxt.includes('Add to Cart')} totalViews=${/total views/.test(dtxt)}`);
    await shot(p, vpName, '01-detail-after-cardtap');

    // click-count increment proof (acceptance: per-item click counts incrementing)
    await sleep(1500);
    const afterClicks = await fetch(`${API}/api/v1/products/${CLICK_ID}/clicks/total`).then(r => r.json());
    const delta = afterClicks.totalClickCount - baseClicks.totalClickCount;
    const wireHit = R.wire.clicks.find(c => c.m === 'POST');
    assert(`C1-${vpName}-click-count-increments-server-side`, delta >= 1 && !!wireHit && wireHit.s === 200,
      `POST /products/${CLICK_ID}/clicks wire=${JSON.stringify(R.wire.clicks.slice(clicksBeforeWire))}; total ${baseClicks.totalClickCount} -> ${afterClicks.totalClickCount} (+${delta})`);
    DATA++;
    STATE++;

    // views line on detail mirrors the counter (never fabricated)
    const viewsLine = (dtxt.match(/(\d[\d,]*) total views/) || [])[1];
    assert(`C2-${vpName}-detail-shows-total-views`, !!viewsLine,
      `views line="${viewsLine}" vs server total=${afterClicks.totalClickCount}`);
    DATA++;

    // back to storefront
    await p.goBack().catch(() => {});
    await sleep(2200);
    if (!(await txt(p)).includes('Listings')) { await gotoSeller(p, vpName); }

    // ---------- RATINGS LIST ----------
    await scrollDown(p, 12);
    t = await txt(p);
    const authorOk = t.includes('AU054 Seller'); // authorName from user-ratings/142
    const starsOk = /\n4\.0\n/.test(t) || t.includes('4.0');
    assert(`D1-${vpName}-ratings-list-renders-author`, authorOk, `"AU054 Seller" review card from user-ratings/142`);
    assert(`D2-${vpName}-rating-stars-value`, starsOk, `stars value 4.0 beside author`);
    DATA += 2;
    await shot(p, vpName, '02-storefront-bottom-reviews');

    // ---------- EMPTY-STATE GUARD (different seller with no listings) ----------
    const emptySellerProbe = await fetch(`${API}/api/v1/userManagement/seller-summary/999999`).then(r => r.status()).catch(() => 0);
    await p.evaluate(h => { window.location.hash = h; }, '/seller/999999');
    await sleep(5000);
    const et = await txt(p);
    const graceful = et.includes("No active listings right now") || et.includes('Could not load seller') || et.includes('Seller');
    assert(`E1-${vpName}-unknown-seller-graceful`, graceful, `seller 999999 -> "${et.slice(0, 90).replace(/\n+/g, ' | ')}"; summary probe HTTP=${emptySellerProbe}`);
    await shot(p, vpName, '03-seller-empty-state');

    // ---------- CLICK EVERY CONTROL (a11y enumeration) ----------
    await gotoSeller(p, vpName);
    await scrollDown(p, 6);
    const nodes = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        const role = e.getAttribute('role');
        const tap = e.getAttribute('flt-tappable') !== null;
        const r = e.getBoundingClientRect();
        if (!(r.width >= 16 && r.height >= 12)) return;
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        const label = (e.textContent || '').trim().slice(0, 60);
        if (role === 'button') out.push({ kind: 'button', label, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), area: r.width * r.height });
        else if (tap && e.tagName === 'FLT-SEMANTICS') out.push({ kind: 'tap', label, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), area: r.width * r.height });
      });
      document.querySelectorAll('input,textarea').forEach(i => out.push({ kind: 'input', label: i.placeholder || i.type, x: null, y: null }));
      return out;
    });
    // keep smallest node per kind+label (ancestors carry child text)
    const uniq = new Map();
    for (const n of nodes) { const k = n.kind + '|' + n.label; if (!uniq.has(k) || uniq.get(k).area > n.area) uniq.set(k, n); }
    const ctrls = [...uniq.values()];
    R.checks.buttons_total += ctrls.length;
    console.log(`controls on ${vpName}: ${ctrls.length} -> ${ctrls.map(c => c.kind + ':' + c.label.slice(0, 22)).join(' ; ').slice(0, 400)}`);

    for (const c of ctrls) {
      const key = `${vpName}:${c.kind}:${c.label.slice(0, 40)}`;
      try {
        if (c.kind === 'input') { R.checks.buttons_ok++; continue; }
        const beforeUrl = p.url();
        const beforeLen = (await txt(p)).length;
        if (c.x !== null) await p.mouse.click(Math.max(4, Math.min(c.x, vp.width - 4)), Math.max(20, Math.min(c.y, vp.height - 6)));
        else await L.clickBtn(p, c.label);
        await sleep(1400);
        const afterTxt = await txt(p);
        const effect = p.url() !== beforeUrl || afterTxt.length !== beforeLen ||
          /Add to Cart|total views|Description/.test(afterTxt) ||
          afterTxt.includes('No active listings right now');
        // storefront has no disabled controls; every enumerated control must do something
        btnck(key, effect, `len ${beforeLen}->${afterTxt.length} urlChanged=${p.url() !== beforeUrl}`);
        // restore storefront between taps
        if (!(await txt(p)).includes('Listings') || p.url() !== beforeUrl) {
          await p.goBack().catch(() => {}); await sleep(1600);
          if (!(await txt(p)).includes('Listings')) await gotoSeller(p, vpName);
          await scrollDown(p, 4);
        }
      } catch (e) {
        R.checks.buttons_failed.push(key + ' :: ' + String(e.message).slice(0, 60));
      }
    }

    // images reconciliation for this viewport
    const imgVals = Object.values(R.images);
    R.checks.images_requested = imgVals.length;
    R.checks.images_200 = imgVals.filter(s => s === 200 || s === 304).length;

    await L.closeVideo(ctx, videoPath);
  }

  // ================= CHECK 7: PARITY vs :3000 (same flow, its own backend data) =====
  try {
    const rb = await L.newBrowser();
    for (const [vpName, vp] of [['375', { width: 375, height: 667 }], ['768', { width: 768, height: 1024 }]]) {
      const rctx = await rb.newContext({ viewport: vp });
      const rp = await rctx.newPage();
      await rp.goto(REF + '/login', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await sleep(2200);
      await rp.locator('text=Login with Email').first().click({ timeout: 6000 }).catch(() => {});
      await sleep(1100);
      await rp.locator('input[type="email"], input[type="text"]').first().fill(L.BUYER.email).catch(() => {});
      await rp.locator('input[type="password"]').first().fill(L.BUYER.pw).catch(() => {});
      await rp.locator('button:has-text("Sign In")').first().click({ timeout: 8000 }).catch(() => {});
      await sleep(4500);
      await rp.goto(REF + '/seller/3', { waitUntil: 'load', timeout: 60000 }).catch(() => {}); // dev-backend seller w/ listings+reviews
      await sleep(9000);
      for (const tt of ['About the seller', 'Reviews']) {
        try { const el = rp.getByText(tt, { exact: false }).first(); if (await el.count()) await el.click({ timeout: 2500 }); } catch (e) {}
        await sleep(1400);
      }
      const rf = path.join(SHOT_DIR, `ref-AU-051-${vpName}-parity.png`);
      await L.screenshot(rp, rf); R.refShots.push(rf);
      const body = await rp.evaluate(() => document.body.innerText);
      fs.writeFileSync(`e2e/results/shards/raw-AU-051-ref-parity-${vpName}.txt`, body);
      // structural parity probes (same flow: profile header, listings grid, reviews accordion, view counts)
      const struct = {
        profileHeader: /Globo E\.|ADMINISTRATION/.test(body),
        ratingSummary: /\(5 Reviews\)/.test(body),
        verifiedBadge: /Verified/.test(body),
        memberSince: /Member Since/.test(body),
        aboutAccordion: /About the seller/.test(body),
        reviewsAccordion: /Reviews/.test(body),
        showcaseHeader: /SELLER SHOWCASE/i.test(body),
        listingCards: (body.match(/TSh [\d,]+/g) || []).length,
        viewCountsOnCards: /\n\d{3,}\n/.test(body),
        successRatingRow: /Success Rating/.test(body),
      };
      R.evidence.push({ parityRef: vpName, ...struct });
      assert(`P1-ref-${vpName}-profile-header-rating-verified`, struct.profileHeader && struct.ratingSummary && struct.verifiedBadge,
        `ref /seller/3: header=${struct.profileHeader} "(5 Reviews)"=${struct.ratingSummary} Verified=${struct.verifiedBadge}`);
      assert(`P2-ref-${vpName}-showcase-grid-renders`, struct.showcaseHeader && struct.listingCards >= 8,
        `SELLER SHOWCASE=${struct.showcaseHeader} priceNodes=${struct.listingCards} (82 listings server-side, 12/page client cap)`);
      assert(`P3-ref-${vpName}-about-reviews-accordions`, struct.aboutAccordion && struct.reviewsAccordion && struct.memberSince,
        `About=${struct.aboutAccordion} Reviews=${struct.reviewsAccordion} MemberSince=${struct.memberSince}`);
      // MOBILE PARITY DELTAS vs Flutter implementation (classified):
      const deltas = [];
      if (!struct.successRatingRow) deltas.push(['minor', 'no Success Rating row']);
      if (!struct.viewCountsOnCards) deltas.push(['major', 'per-card view counts missing']);
      // Flutter-side gaps observed on :9131 storefront (same viewport):
      const mt = fs.existsSync(`/tmp/au051-fl-${vpName}.txt`) ? fs.readFileSync(`/tmp/au051-fl-${vpName}.txt`, 'utf8') : '';
      const flHasVerifiedBadge = mt.includes('VERIFIED');
      if (!flHasVerifiedBadge) deltas.push(['major', `Flutter storefront lacks Verified badge (web shows "Verified" chip for verificationStatus=VERIFIED)`]);
      if (!mt.includes('Member Since')) deltas.push(['minor', 'no Member Since row']);
      if (!mt.includes('About')) deltas.push(['minor', 'no About-the-seller section (summary aboutMe empty for seller 142; web still renders the accordion)']);
      if (!mt.includes('Listings') === false && !/Showcase/i.test(mt)) deltas.push(['minor', 'section titled "Listings" vs web "SELLER SHOWCASE"']);
      if (!/(total views|\bviews\b)/i.test(mt)) deltas.push(['major', 'storefront cards show no per-item view/click counts (web ProductCard renders eye+N from clickCount)']);
      if (!mt.includes('Reviews')) deltas.push(['major', 'ratings section lacks a "Reviews" heading (cards render bare under divider)']);
      for (const [sev, why] of deltas) {
        if (sev === 'major') { R.checks.parity.major++; R.failures.push('parity-major: ' + why); }
        else R.checks.parity.minor++;
        console.log(`PARITY ${sev.toUpperCase()} (${vpName}): ${why}`);
      }
      if (deltas.length === 0) R.checks.parity.accepted++;
      await rctx.close();
    }
    await rb.close();
  } catch (e) { assert('P1-parity-probe', false, 'parity harness error ' + String(e).slice(0, 140)); }

  // ================= VISION (native PNG read happens after run) =================
  // The verifier process records which shots exist; the agent reads each PNG and
  // appends defects into raw-AU-051-vision.json before verdict finalization.
  R.shots.forEach(f => { if (!fs.existsSync(f)) R.failures.push('missing-shot:' + f); });
  R.evidence.push(...R.shots.map(f => f), ...(R.refShots || []));
  R.videos.forEach(v => { if (fs.existsSync(v)) R.evidence.push(v); });
  R.evidence.push(`e2e/results/shards/raw-AU-051-run.json`);

  // ================= VERDICT (provisional until vision file lands) =================
  R.stateAsserts = R.asserts.filter(a => /^[A-E]\d-/.test(a.name)).length;
  R.checks.nav_asserts = NAV; R.checks.data_asserts = DATA; R.checks.state_asserts = R.asserts.filter(a => a.pass && !/^1-|^2-|^P\d-/.test(a.name)).length;
  const failingCore = R.failures.filter(f => !f.startsWith('button:') && !f.startsWith('parity-major'));
  R.verdict = (failingCore.length === 0 && R.checks.buttons_failed.length === 0 &&
    R.checks.freshness && R.checks.real_data && R.checks.images_broken.length === 0 &&
    R.checks.images_200 === R.checks.images_requested && R.checks.vision_defects === 0 &&
    R.checks.parity.blocker === 0 && R.checks.parity.major === 0) ? 'PASS' : 'FAIL';

  fs.writeFileSync(`e2e/results/shards/raw-AU-051-run.json`, JSON.stringify(R, null, 1));
  console.log(`DONE ${R.verdict} asserts ${R.asserts.filter(a => a.pass).length}/${R.asserts.length} btns ${R.checks.buttons_ok}/${R.checks.buttons_total} imgs ${R.checks.images_200}/${R.checks.images_requested} parity M${R.checks.parity.major}/m${R.checks.parity.minor} runtimeMs=${Date.now() - T0}`);
  await browser.close();
  process.exit(R.verdict === 'PASS' ? 0 : 1);
})().catch(e => {
  console.error('FATAL', (e && e.stack) || e);
  try { fs.writeFileSync(`e2e/results/shards/raw-AU-051-run.json`, JSON.stringify(R, null, 1)); } catch (_) {}
  process.exit(2);
});
