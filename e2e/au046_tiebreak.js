// au046_tiebreak.js — TIE-BREAKER for AU-046 disputed findings D1/D2/D3.
// Lane: the CURRENT frozen bundle (md5 e999122d…, Last-Modified Wed, 26 Aug
// 2026 00:58:48 GMT, served byte-identical on :9130 AND :9121). NOTE:
// :9130's Origin is NOT in the sandbox CORS allowlist — its first run was all
// API-blocked. :9121 IS allowlisted, so all evidence below comes from :9121,
// same bytes as :9130. Supersedes verifier (:9110/56ba3fc) + skeptic
// (:9112/858b0ef).
// D1: block ONLY /category-availability → compare rails vs control.
// D2 pass1: ZERO interception, pure server-counter deltas around one tap.
// D2 pass2: passive CDP Network observation (no interception/buffering).
// D3: 5 cold loads of #/category/food-groceries in fresh contexts.
const fs = require('fs');
const path = require('path');
const LV = require('./lib_verify.js');
const { newBrowser, newCtx, closeVideo, allText, waitText, btn, clickBtn, clickCard,
  scrollIntoView, scrollToBottom, screenshot } = LV;
const APP = process.env.TB_APP || 'http://localhost:9121';
const API = 'http://localhost:8083';
const OUT = path.join(__dirname, 'tmp', 'AU-046-tiebreak');
const SHOTS = path.join(__dirname, 'shots', 'AU-046');
const VID = path.join(__dirname, 'videos');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });
const R = { ts: new Date().toISOString(), bundle: APP, stages: {} };
const log = (s, o) => { console.log('[' + s + '] ' + JSON.stringify(o)); };

async function jget(p) { const r = await fetch(API + p); return { status: r.status, j: await r.json().catch(() => null) }; }

async function clicksTotal(id) {
  const r = await fetch(`${API}/api/v1/products/${id}/clicks/total`);
  if (!r.ok) return null;
  const b = await r.json();
  return { total: b.totalClickCount, anon: b.anonymousTotalClickCount, loggedIn: b.loggedInTotalClickCount };
}

// ---- shared nav -----------------------------------------------------------
async function gotoHome(p) {
  await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  const ok = await waitText(p, 'Buy now', 45000);
  await p.waitForTimeout(1200);
  return ok;
}

async function categoryInfo() {
  const { j } = await jget('/api/v1/products/categories');
  const arr = Array.isArray(j) ? j : (j && (j.content || j.categories)) || [];
  return arr.map(c => ({ id: c.id ?? c.categoryId, name: c.name, slug: c.slug }));
}

async function filterByCategory(catId) {
  const r = await fetch(API + '/api/v1/displayItem/filter', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoryIds: [catId] })
  });
  const b = await r.json().catch(() => null);
  const content = (b && b.content) || [];
  return { status: r.status, totalElements: b ? b.totalElements : null, ms: Date.now(),
    items: content.map(c => ({ id: c.id, title: (c.title || c.name || '').toString() })) };
}

// Open the category screen by tapping a rail chip on home (real user path).
async function openCategoryViaRail(p, catName) {
  const inTree = await p.evaluate((n) => [...document.querySelectorAll('flt-semantics')]
    .some(e => (e.textContent || '').includes(n)), catName);
  if (!inTree) { // scroll the rails band into view first
    await p.mouse.move(187, 400);
    for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, 220); await p.waitForTimeout(150); }
  }
  await scrollIntoView(p, catName);
  const tapped = await clickCard(p, catName);
  await p.waitForTimeout(1500);
  return tapped;
}

// ---- STAGE D2 pass1: PURE (zero JS-side instrumentation), counter deltas ---
async function d2_pass1(browser) {
  const res = { pass: 'pure-counter-delta', taps: [] };
  const ctx = await newCtx(browser, { viewport: { width: 375, height: 667 },
    videoPath: path.join(VID, 'AU-046-tiebreak-d2-pure.webm') });
  const p = await ctx.newPage();
  try {
    if (!await gotoHome(p)) throw new Error('home did not render');
    const cats = await categoryInfo();
    // pick a populated category whose chip is actually rendered
    let chosen = null, listing = null;
    for (const c of cats) {
      const f = await filterByCategory(c.id);
      if ((f.totalElements || 0) >= 3) { chosen = c; listing = f; break; }
    }
    if (!chosen) throw new Error('no populated category');
    res.category = { id: chosen.id, name: chosen.name, slug: chosen.slug, items: listing.totalElements };
    if (!await openCategoryViaRail(p, chosen.name)) throw new Error('rail chip tap failed');
    // confirm the category screen really loaded its list
    const want = listing.items[0].title.slice(0, 24);
    res.categoryScreenConfirmed = await waitText(p, want, 25000);

    // baseline every item's counter, pick the LEAST-clicked (least contended)
    const base = {};
    for (const it of listing.items) base[it.id] = await clicksTotal(it.id);
    let target = null;
    for (const it of listing.items) {
      if (!target || (base[it.id] && base[it.id].total) < (base[target.id] && base[target.id].total)) target = it;
    }
    res.target = { id: target.id, title: target.title, baseTotal: base[target.id] };
    const label = target.title.slice(0, Math.min(target.title.length, 28));
    await scrollIntoView(p, label);
    const tappedCard = await clickCard(p, label);
    res.cardTapped = tappedCard;
    const detailShown = (await waitText(p, 'Share', 25000)) || (await waitText(p, 'Add to cart', 8000));
    res.detailShown = detailShown;
    await screenshot(p, path.join(SHOTS, 'tb-d2-detail-after-tap-375.png'));
    await p.waitForTimeout(4000); // allow fire-and-forget POST + totals refresh
    res.afterTotal = await clicksTotal(target.id);
    res.delta = res.afterTotal && res.target.baseTotal
      ? { total: res.afterTotal.total - res.target.baseTotal.total,
          anon: res.afterTotal.anon - res.target.baseTotal.anon,
          loggedIn: res.afterTotal.loggedIn - res.target.baseTotal.loggedIn }
      : null;
    res.verdict = res.delta && res.delta.total > 0 && res.delta.loggedIn === 0 ? 'POST_FIRED' : 'NOT_OBSERVED';
    // sanity: whole-category drift during the window (concurrent-agent noise detector)
    const drift = {};
    for (const it of listing.items.slice(0, 6)) {
      const now = await clicksTotal(it.id);
      drift[it.id] = now ? now.total - base[it.id].total : null;
    }
    res.windowDrift = drift;
  } catch (e) { res.error = String(e.message || e); }
  fs.writeFileSync(path.join(OUT, 'd2_pass1.json'), JSON.stringify(res, null, 2));
  await closeVideo(ctx, path.join(VID, 'AU-046-tiebreak-d2-pure.webm'));
  return res;
}

// ---- STAGE D2 pass2: passive CDP Network observation -----------------------
async function d2_pass2(browser) {
  const res = { pass: 'cdp-network-passive', apiCalls: [], postClicks: [] };
  const ctx = await newCtx(browser, { viewport: { width: 375, height: 667 },
    videoPath: path.join(VID, 'AU-046-tiebreak-d2-cdp.webm') });
  const p = await ctx.newPage();
  try {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.enable');
    cdp.on('Network.requestWillBeSent', ev => {
      const u = ev.request.url;
      if (u.includes('/api/v1/')) {
        res.apiCalls.push({ m: ev.request.method, u: u.replace(API, ''), ts: ev.wallTime });
        const m = u.match(/\/api\/v1\/products\/(\d+)\/clicks$/) ;
        if (ev.request.method === 'POST' && m) res.postClicks.push({ id: +m[1], requestId: ev.requestId, at: Date.now() });
      }
    });
    cdp.on('Network.responseReceived', ev => {
      const hit = res.postClicks.find(x => x.requestId === ev.requestId);
      if (hit) hit.status = ev.response.status;
    });
    if (!await gotoHome(p)) throw new Error('home did not render');
    const cats = await categoryInfo();
    let chosen = null, listing = null;
    for (const c of cats) {
      const f = await filterByCategory(c.id);
      if ((f.totalElements || 0) >= 3) { chosen = c; listing = f; break; }
    }
    res.category = chosen && chosen.slug;
    if (!chosen) throw new Error('no populated category');
    if (!await openCategoryViaRail(p, chosen.name)) throw new Error('rail chip tap failed');
    const want = listing.items[0].title.slice(0, 24);
    res.categoryScreenConfirmed = await waitText(p, want, 25000);
    // tap the FIRST card this time (different position than pass1)
    const label = listing.items[listing.items.length > 2 ? 2 : 0].title.slice(0, 28);
    await scrollIntoView(p, label);
    res.cardTapped = await clickCard(p, label);
    res.detailShown = await waitText(p, 'Share', 25000);
    await p.waitForTimeout(5000);
    res.postClickObserved = res.postClicks.length > 0;
    res.verdict = res.postClickObserved ? 'POST_FIRED_CDP' : 'NOT_OBSERVED';
    await screenshot(p, path.join(SHOTS, 'tb-d2-cdp-detail-375.png'));
  } catch (e) { res.error = String(e.message || e); }
  fs.writeFileSync(path.join(OUT, 'd2_pass2.json'), JSON.stringify(res, null, 2));
  await closeVideo(ctx, path.join(VID, 'AU-046-tiebreak-d2-cdp.webm'));
  return res;
}

// ---- STAGE D3: five cold loads of #/category/food-groceries ---------------
async function d3_coldloads(browser) {
  const res = [];
  for (let i = 1; i <= 5; i++) {
    const r = { attempt: i, startedAt: new Date().toISOString() };
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } }); // fresh storage/cache
    const p = await ctx.newPage();
    const reqs = [];
    p.on('response', rx => {
      const u = rx.url();
      if (u.includes('/api/v1/')) reqs.push({ s: rx.status(), m: rx.request().method(),
        u: u.replace(API, '').slice(0, 110) });
    });
    try {
      await p.goto(APP + '/#/category/food-groceries', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await p.waitForFunction(() => {
        const t = [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n');
        return t.includes('Could not load products') || (t.match(/TSh/g) || []).length >= 3;
      }, { timeout: 40000 }).catch(() => {});
      await p.waitForTimeout(1500);
      const txt = await allText(p);
      r.errorShown = txt.includes('Could not load products');
      r.tshCount = (txt.match(/TSh/g) || []).length;
      r.itemSample = txt.split('\n').filter(l => l.includes('TSh')).slice(0, 3);
      r.apiCalls = reqs;
      r.filterStatus = (reqs.find(q => q.u.includes('/displayItem/filter')) || {}).s || null;
      await screenshot(p, path.join(SHOTS, `tb-d3-cold-${i}.png`));
      r.outcome = r.errorShown ? 'ERROR_SHOWN' : (r.tshCount >= 3 ? 'LOADED' : 'NO_SIGNAL');
    } catch (e) { r.outcome = 'HARNESS_ERROR'; r.error = String(e.message || e); }
    res.push(r);
    await ctx.close();
    log('D3', r);
  }
  fs.writeFileSync(path.join(OUT, 'd3_attempts.json'), JSON.stringify(res, null, 2));
  return res;
}

// ---- STAGE D1: block ONLY /category-availability on current bundle --------
async function d1_outage(browser) {
  const res = {};
  // control: unblocked home — empty slugs hidden?
  {
    const ctx = await newCtx(browser, { viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    await gotoHome(p);
    await p.mouse.move(187, 400);
    for (let i = 0; i < 16; i++) { await p.mouse.wheel(0, 260); await p.waitForTimeout(130); }
    await p.waitForTimeout(800);
    const txt = await allText(p);
    res.control_foodGroceriesChipVisible = txt.includes('Food & Groceries');
    res.control_howItWorks = ['How it works'].map(s => txt.includes(s));
    res.control_chipSample = txt.split('\n').filter(l =>
      /Electronics|Fashion|Beauty|Furniture|Food & Groceries/.test(l)).slice(0, 8);
    await screenshot(p, path.join(SHOTS, 'tb-d1-control-rails-swept.png'));
    await ctx.close();
  }
  // attack: abort ONLY the availability call
  {
    const ctx = await newCtx(browser, { viewport: { width: 375, height: 667 },
      videoPath: path.join(VID, 'AU-046-tiebreak-d1-outage.webm') });
    const p = await ctx.newPage();
    await p.route('**/api/v1/displayItem/category-availability*', rx => rx.abort('failed'));
    await gotoHome(p);
    await p.mouse.move(187, 400);
    for (let i = 0; i < 16; i++) { await p.mouse.wheel(0, 260); await p.waitForTimeout(130); }
    await p.waitForTimeout(1000);
    const txt = await allText(p);
    res.attack_foodGroceriesChipInTree = txt.includes('Food & Groceries');
    res.attack_errorBox = txt.includes('Could not load categories');
    res.attack_otherChips = txt.split('\n').filter(l =>
      /Electronics|Fashion|Beauty|Furniture/.test(l)).slice(0, 6);
    // geometry of the leaked chip if present
    res.leakedChipGeom = await p.evaluate(() => {
      const es = [...document.querySelectorAll('flt-semantics')]
        .filter(e => (e.textContent || '').includes('Food & Groceries') && e.getAttribute('flt-tappable') !== null);
      return es.map(e => { const b = e.getBoundingClientRect();
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
          onscreen: b.bottom > 0 && b.top < innerHeight }; });
    });
    await screenshot(p, path.join(SHOTS, 'tb-d1-outage-rails-swept.png'));
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'd1_outage.json'), JSON.stringify(res, null, 2));
  return res;
}

// ---- STAGE HOME: current-bundle home shots at both viewports --------------
async function homeShots(browser) {
  const out = {};
  for (const vp of [{ n: '375x667', w: 375, h: 667 }, { n: '768x1024', w: 768, h: 1024 }]) {
    const ctx = await newCtx(browser, { viewport: { width: vp.w, height: vp.h } });
    const p = await ctx.newPage();
    await gotoHome(p);
    await screenshot(p, path.join(SHOTS, `tb-home-top-${vp.n.split('x')[0]}.png`));
    await p.mouse.move(vp.w / 2, vp.h / 2);
    for (let i = 0; i < 14; i++) { await p.mouse.wheel(0, 240); await p.waitForTimeout(140); }
    await p.waitForTimeout(700);
    await screenshot(p, path.join(SHOTS, `tb-home-swept-${vp.n.split('x')[0]}.png`));
    const txt = await allText(p);
    out[vp.n] = {
      howItWorksPresent: txt.includes('How it works'),
      waFabHint: txt.includes('WhatsApp') || txt.includes('Chat'),
      tsh: (txt.match(/TSh/g) || []).length,
      errorBoxes: ['Could not load', 'Please try again'].map(s => txt.includes(s)),
    };
    await ctx.close();
    log('HOME', out[vp.n]);
  }
  return out;
}

(async () => {
  const browser = await newBrowser();
  try {
    R.stages.home = await homeShots(browser);
    R.stages.d1 = await d1_outage(browser);
    R.stages.d2_pass1 = await d2_pass1(browser);
    R.stages.d2_pass2 = await d2_pass2(browser);
    R.stages.d3 = await d3_coldloads(browser);
  } finally {
    await browser.close().catch(() => {});
  }
  fs.writeFileSync(path.join(OUT, 'tiebreak_raw.json'), JSON.stringify(R, null, 2));
  console.log('DONE ' + JSON.stringify(Object.keys(R.stages)));
})();
