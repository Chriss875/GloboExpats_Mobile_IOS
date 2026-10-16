// AU-016 r2 VERIFY pass 3 (RO lane) — frozen lane :9108, sha 7b4342f.
// Fixture: sandbox itemDetails/470 "Modern Business Stay Apartment" FOR_RENT NIGHT.
// Fixes vs r2b: on-screen filter restored; CTA row tapped by rect (offscreen no-op);
// gallery swipes + full scroll for image loads. Usage: node verify_AU-016_r2c.js <375|768>
const fs = require('fs');
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP = 'http://localhost:9108';
const SHOTS = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-016r2';
const VID = '/tmp/wf-videos-AU016r2';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const V = process.argv[2] || '375';
const W = V === '375' ? 375 : 768, H = V === '375' ? 667 : 1024;
const out = { v: V, failures: [], notes: [], asserts: { state: 0, nav: 0, data: 0 }, buttons: [] };

async function shot(pg, name) { await lib.screenshot(pg, `${SHOTS}/AU-016-${V}-${name}.png`); }
const texts = p => p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
  .map(e => (e.textContent || '').trim()).filter(Boolean));
async function hasText(p, t) { return (await texts(p)).some(x => x.includes(t)); }

// ON-SCREEN smallest node whose trimmed text === label (or starts with it), hard-click center.
async function tapExact(p, label) {
  const hit = await p.evaluate(([lbl]) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (t !== lbl && !t.startsWith(lbl + '\n')) return;
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return;
      if (!best || r.width * r.height < best.area)
        best = { area: r.width * r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    });
    return best;
  }, [label]);
  if (!hit) return false;
  await p.mouse.click(Math.round(hit.cx), Math.round(hit.cy));
  await sleep(650); return true;
}
async function scrollToLabel(p, label) {
  for (let i = 0; i < 14; i++) {
    if (await tapExact.__probe ? false : false) {}
    const vis = await p.evaluate((lbl) => {
      let found = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if (found) return;
        const t = (e.textContent || '').trim();
        if ((t === lbl || t.startsWith(lbl + '\n'))) {
          const r = e.getBoundingClientRect();
          if (r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < innerHeight && r.top > 0) found = true;
        }
      });
      return !!found;
    }, label);
    if (vis) return true;
    await p.mouse.move(W / 2 - 5, Math.round(H * 0.6));
    await p.mouse.wheel(0, 300);
    await sleep(260);
  }
  return false;
}

// Flutter materialDatePicker day cells: role=button text "N, Weekday, Month N, Year".
async function calDay(p, day) {
  const hit = await p.evaluate((d) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const m = ((e.textContent || '').trim()).match(/^(\d{1,2}),\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/);
      if (!m || Number(m[1]) !== d) return;
      if ((e.getAttribute('aria-disabled') || '') === 'true') return;
      const r = e.getBoundingClientRect();
      if (r.width < 15 || r.height < 15 || r.bottom <= 0 || r.top >= innerHeight) return;
      if (!best || r.width * r.height < best.area)
        best = { area: r.width * r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    });
    return best;
  }, day);
  if (!hit) return false;
  await p.mouse.click(Math.round(hit.cx), Math.round(hit.cy)); await sleep(500); return true;
}
async function calOk(p) {
  const b = await p.evaluate(() => {
    let best = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if (!/^OK$/i.test((e.textContent || '').trim())) return;
      const r = e.getBoundingClientRect(); best = { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    });
    return best;
  });
  if (!b) return false;
  await p.mouse.click(Math.round(b.cx), Math.round(b.cy)); await sleep(750); return true;
}
async function calOpen(p) {
  return p.evaluate(() => ['OK', 'CANCEL'].every(want =>
    [...document.querySelectorAll('flt-semantics[role="button"]')]
      .some(e => (e.textContent || '').trim().toUpperCase() === want)));
}
async function bookRange(p, dStart, dEnd) {
  // panel sits mid-screen; scroll so Start date is visible first
  if (!(await scrollToLabel(p, 'Start date'))) return { ok: false, why: 'Start date btn not reachable' };
  if (!(await tapExact(p, 'Start date'))) return { ok: false, why: 'Start date tap failed' };
  if (!(await calOpen(p))) return { ok: false, why: 'start calendar did not open' };
  if (!(await calDay(p, dStart))) return { ok: false, why: `day ${dStart} not clickable` };
  if (!(await calOk(p))) return { ok: false, why: 'start OK missing' };
  if (!(await tapExact(p, 'End date'))) {
    if (!(await scrollToLabel(p, 'End date'))) return { ok: false, why: 'End date unreachable' };
    if (!(await tapExact(p, 'End date'))) return { ok: false, why: 'End date tap failed' };
  }
  if (!(await calOpen(p))) return { ok: false, why: 'end calendar did not open' };
  if (!(await calDay(p, dEnd))) return { ok: false, why: `day ${dEnd} not clickable` };
  if (!(await calOk(p))) return { ok: false, why: 'end OK missing' };
  const line = (await texts(p)).find(x => /\d+\s*(nights?|days?)\s*·\s*total/i.test(x)) || null;
  return { ok: !!line, line };
}
async function readCartLines(p) {
  const c = await p.evaluate(() => {
    const o = {}; Object.keys(localStorage).filter(k => /expatCartItems/i.test(k))
      .forEach(k => { try { o[k] = JSON.parse(localStorage.getItem(k)); } catch (e) {} }); return o;
  });
  const flat = []; Object.values(c).forEach(v => Array.isArray(v) && v.forEach(i => flat.push(i)));
  return flat;
}

(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport: { width: W, height: H }, videoPath: `${VID}/AU-016-${V}.webm` });
  const p = await ctx.newPage(); p.setDefaultTimeout(25000);
  const imgs = lib.watchImages(p);
  const clicksSeen = [];
  p.on('request', r => { const u = r.url(); if (/\/products\/\d+\/clicks/.test(u)) clicksSeen.push(r.method()); });

  // ---- login ----
  await p.goto(`${APP}/#/login`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  if (!(await lib.isLoggedIn(p))) {
    await lib.waitText(p, 'Welcome back', 30000);
    const ei = p.locator('input[type="text"]').first(), pi = p.locator('input[type="password"]').first();
    await ei.click({ force: true }); await p.waitForTimeout(350); await p.keyboard.type(lib.BUYER.email);
    await pi.click({ force: true }); await p.waitForTimeout(350); await p.keyboard.type(lib.BUYER.pw);
    await lib.clickBtn(p, 'Log in');
    let ok = false; for (let i = 0; i < 30 && !ok; i++) { ok = await lib.isLoggedIn(p); if (!ok) await p.waitForTimeout(1000); }
    if (!ok) out.failures.push(`[${V}] login failed`);
  }

  // ---- load detail ----
  await p.goto(`${APP}/#/product/470`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  if (!(await lib.waitText(p, 'Modern Business Stay Apartment', 45000))) {
    console.log(JSON.stringify({ v: V, fatal: 'detail never rendered', failures: out.failures }));
    process.exit(2);
  }
  await sleep(2200);

  // C1 rate period + real data
  const t1 = await texts(p); const joined = t1.join('\n');
  out.realdata = {};
  for (const [k, re] of Object.entries({
    price: /TSh 150,000/, name: /Modern Business Stay Apartment/,
    loc: /kilaiti street, Dar es Salaam, Tanzania/, views: /\d+ total views/,
    seller: /Angel Korosso/, org: /Siimply Stays/, checkin: /Check-in time\s*1:00 PM/,
    wifi: /WifiAvailable|Wifi\s*Available/ }))
    out.realdata[k] = re.test(joined);
  out.ratePeriod = /FOR RENT · per night/.test(joined);
  console.log(V, 'ratePeriod', out.ratePeriod, JSON.stringify(out.realdata));
  if (!out.ratePeriod) out.failures.push(`[${V}] no "FOR RENT · per night" rate-period text`);
  else out.asserts.data++;
  Object.entries(out.realdata).forEach(([k, v]) => { if (v) out.asserts.data++; else out.failures.push(`[${V}] real-data ${k} missing`); });

  // C2 NO quantity stepper on rentals
  const plusMinus = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .filter(e => ['add_circle_outline', 'remove_circle_outline'].includes(e.getAttribute('aria-label') || '')).length);
  const qtyLabel = t1.some(x => /^Quantity$/.test(x));
  if (qtyLabel || plusMinus > 0) out.failures.push(`[${V}] quantity stepper present on FOR_RENT detail (label=${qtyLabel} icons=${plusMinus})`);
  else out.asserts.state++;

  // C3 booking panel present
  if (!(await hasText(p, 'Start date')) || !(await hasText(p, 'End date')))
    out.failures.push(`[${V}] Start/End date pickers missing`);
  else out.asserts.data++;
  await shot(p, '01-detail-top');
  out.buttons.push(...(await lib.listButtons(p)).map(b => ({ tag: 'top', ...b })));

  // C4 add-to-cart WITHOUT dates is blocked
  await scrollToLabel(p, 'Buy now'); await sleep(400);
  const buyTap = await tapExact(p, 'Buy now');
  await sleep(1400);
  const toast = (await texts(p)).find(x => /Select your rental dates/i.test(x));
  const stillHere = (await texts(p)).some(x => x.includes('Modern Business Stay Apartment'));
  console.log(V, 'blocked test: tapped', buyTap, 'toast', JSON.stringify(toast), 'stillOnDetail', stillHere);
  if (!buyTap) out.failures.push(`[${V}] Buy now button could not be tapped`);
  else if (!toast) out.failures.push(`[${V}] no "Select your rental dates" block toast after Buy now w/o dates (stillOnDetail=${stillHere})`);
  else { out.asserts.state++; await shot(p, '02-blocked-no-dates'); }
  // also verify Add to cart path blocked identically
  const addTapNoDates = await tapExact(p, 'Add to cart');
  await sleep(1200);
  const toast2 = (await texts(p)).find(x => /Select your rental dates/i.test(x));
  if (addTapNoDates && !toast2) out.failures.push(`[${V}] Add to cart without dates NOT blocked`);
  else if (toast2) out.notes.push(`[${V}] Add to cart also blocks without dates`);

  // C5 pick range -> live units x total (math check 2 nights x 150000 = 300000)
  const r1 = await bookRange(p, 26, 28);
  console.log(V, 'range1', JSON.stringify(r1));
  if (!r1.ok) out.failures.push(`[${V}] range1 booking failed: ${r1.why || 'no "N nights · total" line'}`);
  else {
    out.asserts.data++; out.unitsTotal = r1.line;
    if (!/300,000/.test(r1.line)) out.failures.push(`[${V}] units×rate math wrong: "${r1.line}" (expect 300,000 = 2×150,000)`);
    else { out.asserts.data++; }
    await shot(p, '03-range-picked');
  }

  // C6a add to cart with dates -> signed line
  await scrollToLabel(p, 'Add to cart'); await sleep(400);
  const addTap = await tapExact(p, 'Add to cart');
  await sleep(1600);
  const addedToast = (await texts(p)).find(x => /Added to cart/i.test(x));
  console.log(V, 'add-to-cart', addTap, 'toast', JSON.stringify(addedToast));
  if (!addedToast) out.failures.push(`[${V}] no "Added to cart" confirmation after booking a range`);
  else out.asserts.state++;
  const cartAfter1 = await readCartLines(p);
  console.log(V, 'cart1:', JSON.stringify(cartAfter1.map(i => ({ id: i.lineId, q: i.quantity }))).slice(0, 500));

  // C6b second distinct range -> SECOND distinct line
  const r2 = await bookRange(p, 29, 31);
  console.log(V, 'range2', JSON.stringify(r2));
  if (!r2.ok) out.failures.push(`[${V}] range2 booking failed: ${r2.why || 'no units·total line'}`);
  else await shot(p, '04-range2-picked');
  await tapExact(p, 'Add to cart'); await sleep(1600);
  const cartAfter2 = await readCartLines(p);
  console.log(V, 'cart2:', JSON.stringify(cartAfter2.map(i => ({ id: i.lineId, q: i.quantity }))).slice(0, 800));
  const rentLines = cartAfter2.filter(i => typeof i.lineId === 'string' && /\|r\d{4}-\d{2}-\d{2}/.test(i.lineId));
  if (rentLines.length < 1) out.failures.push(`[${V}] NO cart line carries rental signature |rYYYY-MM-DD… — ids: ${JSON.stringify(cartAfter2.map(i => i.lineId))}`);
  else {
    out.asserts.data++;
    const uniq = new Set(rentLines.map(l => l.lineId));
    if (uniq.size < 2) out.failures.push(`[${V}] two different ranges did NOT produce two lines (${uniq.size}): ${JSON.stringify(rentLines.map(l => l.lineId))}`);
    else { out.asserts.state++; out.twoLines = rentLines.map(l => ({ id: l.lineId, q: l.quantity })); }
    // rentals force quantity 1
    if (rentLines.some(l => l.quantity !== 1)) out.failures.push(`[${V}] rental line quantity != 1: ${JSON.stringify(rentLines.map(l => l.quantity))}`);
    else out.asserts.state++;
  }

  // visual proof of two lines in the cart screen
  await p.goto(`${APP}/#/cart`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(2500);
  await shot(p, '05-cart-lines');

  // RO cleanup — clear only OUR OWN user's cart key(s)
  await p.evaluate(() => Object.keys(localStorage).filter(k => /expatCartItems/i.test(k))
    .forEach(k => localStorage.removeItem(k)));

  // ---- images: reload detail, swipe gallery, full-page slow scroll ----
  await p.goto(`${APP}/#/product/470`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await lib.waitText(p, 'Modern Business Stay Apartment', 40000); await sleep(1800);
  for (let i = 0; i < 8; i++) {
    await p.mouse.move(W - 25, Math.round(H * 0.3)); await p.mouse.down();
    await p.mouse.move(25, Math.round(H * 0.3), { steps: 10 }); await p.mouse.up(); await sleep(700);
  }
  await p.mouse.move(W / 2, Math.round(H * 0.55));
  for (let i = 0; i < 24; i++) { await p.mouse.wheel(0, 430); await sleep(240); }
  await sleep(2200);
  out.images = lib.imageSummary(imgs);
  out.images_requested = 22;
  console.log(V, 'images:', JSON.stringify(out.images), 'requests seen:', Object.keys(imgs).length);
  if (out.images.failed > 0) out.failures.push(`[${V}] ${out.images.failed} image request(s) failed`);
  if (out.images.ok < out.images_requested) out.notes.push(`[${V}] images ok=${out.images.ok}/${out.images_requested}`);
  await shot(p, '06-final-bottom');

  // every control enumerated -> clicked-with-effect summary lives in buttons[] + notes
  out.buttons.push(...(await lib.listButtons(p)).map(b => ({ tag: 'bottom', ...b })));
  out.clickRequests = clicksSeen.length;

  await lib.closeVideo(ctx, `${VID}/AU-016-${V}.webm`);
  await browser.close();
  fs.writeFileSync(`/tmp/au016r2c-${V}.json`, JSON.stringify(out, null, 1));
  console.log('RESULT ' + V, JSON.stringify({ v: V, failures: out.failures, notes: out.notes,
    asserts: out.asserts, images: out.images, ratePeriod: out.ratePeriod, unitsTotal: out.unitsTotal, twoLines: out.twoLines }));
})();
