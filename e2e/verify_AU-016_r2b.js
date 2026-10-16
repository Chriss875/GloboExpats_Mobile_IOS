// AU-016 r2 VERIFY pass 2 (RO lane) — fixes from pass 1:
//  * calendar day cells are role=button with text "24, Monday, August 24, 2026" (not gridcell/digit)
//  * CTA row located by rect + scrollIntoView (offscreen force-tap was silently no-op)
//  * full-page slow scroll + gallery swipe to trigger all 22 upload loads
// Usage: node verify_AU-016_r2b.js <375|768>
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

// locate ANY semantics node whose trimmed text === label (smallest wins), scroll it into
// view, then hard-click its coordinates (Playwright force-click no-ops on covered nodes).
async function tapExact(p, label) {
  for (let pass = 0; pass < 3; pass++) {
    const hit = await p.evaluate((lbl) => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        if (t !== lbl && !t.startsWith(lbl + '\n')) return;
        const r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return;
        if (!best || r.width * r.height < best.w * best.h)
          best = { w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
      });
      return best;
    }, label);
    if (hit) {
      await p.mouse.click(Math.round(hit.cx), Math.round(Math.min(hit.cy, H - 10)));
      await sleep(650); return true;
    }
    // scroll a page-fraction looking for it (both directions)
    await p.mouse.move(W / 2, Math.round(H / 2));
    await p.mouse.wheel(0, pass === 0 ? 400 : -800);
    await sleep(350);
  }
  return false;
}

// Flutter materialDatePicker day cells: role=button, text "N, Weekday, Month N, Year".
// Disabled past days are still in the tree -> filter by aria-disabled.
async function calDay(p, day) {
  const hit = await p.evaluate((d) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      const m = t.match(/^(\d{1,2}),\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/);
      if (!m || Number(m[1]) !== d) return;
      if ((e.getAttribute('aria-disabled') || '') === 'true') return;
      const r = e.getBoundingClientRect();
      if (r.width < 15 || r.height < 15 || r.bottom <= 0 || r.top >= innerHeight) return;
      if (!best || r.width * r.height < best.w * best.h)
        best = { w: r.width * r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
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
  await p.mouse.click(Math.round(b.cx), Math.round(b.cy)); await sleep(700); return true;
}
async function calOpen(p) {
  return p.evaluate(() => ['OK', 'Cancel'].every(want =>
    [...document.querySelectorAll('flt-semantics[role="button"]')]
      .some(e => (e.textContent || '').trim().toUpperCase() === want)));
}
// book a range via the two panel buttons; returns {ok, unitsLine}
async function bookRange(p, dStart, dEnd) {
  if (!(await tapExact(p, 'Start date'))) return { ok: false, why: 'Start date btn' };
  if (!(await calOpen(p))) return { ok: false, why: 'start calendar did not open' };
  if (!(await calDay(p, dStart))) return { ok: false, why: `day ${dStart} not clickable` };
  if (!(await calOk(p))) return { ok: false, why: 'start OK missing' };
  if (!(await tapExact(p, 'End date'))) return { ok: false, why: 'End date btn' };
  if (!(await calOpen(p))) return { ok: false, why: 'end calendar did not open' };
  if (!(await calDay(p, dEnd))) return { ok: false, why: `day ${dEnd} not clickable` };
  if (!(await calOk(p))) return { ok: false, why: 'end OK missing' };
  const line = (await texts(p)).find(x => /\d+\s*(nights?|days?)\s*·\s*total/i.test(x)) || null;
  return { ok: !!line, line };
}

(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport: { width: W, height: H }, videoPath: `${VID}/AU-016-${V}.webm` });
  const p = await ctx.newPage(); p.setDefaultTimeout(25000);
  const imgs = lib.watchImages(p);
  const clicksSeen = [];
  p.on('request', r => { const u = r.url(); if (/\/products\/\d+\/clicks/.test(u)) clicksSeen.push(r.method()); });

  // login
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

  // ---------- load detail ----------
  await p.goto(`${APP}/#/product/470`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  if (!(await lib.waitText(p, 'Modern Business Stay Apartment', 45000))) {
    console.log(JSON.stringify({ v: V, fatal: 'detail never rendered', failures: out.failures }));
    process.exit(2);
  }
  await sleep(2200);

  // C1 rate-period + listing type + real data
  const t1 = await texts(p);
  const joined = t1.join('\n');
  out.realdata = {};
  for (const [k, re] of Object.entries({
    price: /TSh 150,000/, name: /Modern Business Stay Apartment/,
    loc: /kilaiti street, Dar es Salaam, Tanzania/, views: /\d+ total views/,
    seller: /Angel Korosso/, org: /Siimply Stays/, checkin: /Check-in time\s*1:00 PM/,
  })) out.realdata[k] = re.test(joined);
  out.ratePeriod = /FOR RENT · per night/.test(joined);
  console.log(V, 'realdata', JSON.stringify(out.realdata), 'ratePeriod', out.ratePeriod,
    '| rental strings:', JSON.stringify(t1.filter(x => /FOR RENT|per night|date/i.test(x)).slice(0, 5)));
  if (!out.ratePeriod) out.failures.push(`[${V}] no "FOR RENT · per night" rate-period text`);
  else out.asserts.data++;
  Object.entries(out.realdata).forEach(([k, v]) => { if (v) out.asserts.data++; else out.failures.push(`[${V}] real-data ${k} missing`); });

  // C2 NO quantity stepper
  const plusMinus = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .filter(e => ['add_circle_outline', 'remove_circle_outline']
      .includes(e.getAttribute('aria-label') || '')).length);
  const qtyLabel = t1.some(x => /^Quantity$/.test(x));
  console.log(V, 'stepper present?', qtyLabel, plusMinus);
  if (qtyLabel || plusMinus > 0) out.failures.push(`[${V}] quantity stepper present on FOR_RENT detail (label=${qtyLabel} icons=${plusMinus})`);
  else out.asserts.state++;

  // C3 panel visible
  if (!(await hasText(p, 'Start date')) || !(await hasText(p, 'End date')))
    out.failures.push(`[${V}] Start/End date buttons not rendered`);
  else out.asserts.data++;
  await shot(p, '01-detail-top');
  out.buttons.push(...(await lib.listButtons(p)).map(b => ({ tag: 'top', ...b })));

  // C4 BLOCKED add-to-cart with no dates (do BEFORE any booking)
  const buyTap = await tapExact(p, 'Buy now');
  await sleep(1400);
  const toast = (await texts(p)).find(x => /Select your rental dates/i.test(x));
  const stillHere = (await texts(p)).some(x => x.includes('Modern Business Stay Apartment'));
  console.log(V, 'blocked test: tapped', buyTap, 'toast', JSON.stringify(toast), 'stillOnDetail', stillHere);
  if (!buyTap) out.failures.push(`[${V}] Buy now button could not be tapped`);
  else if (!toast) out.failures.push(`[${V}] no "Select your rental dates" block toast (stillOnDetail=${stillHere})`);
  else { out.asserts.state++; await shot(p, '02-blocked-no-dates'); }
  // dismiss snackbar if any
  await p.mouse.click(10, Math.round(H / 2)); await sleep(600);

  // C5 pick a range -> live units x total
  const r1 = await bookRange(p, 26, 28);
  console.log(V, 'range1', JSON.stringify(r1));
  if (!r1.ok) out.failures.push(`[${V}] range1 booking failed: ${r1.why || 'no units·total line'}`);
  else {
    out.asserts.data++; out.unitsTotal = r1.line;
    // math check: 2 nights × 150,000 = 300,000
    if (!/300,000|TZS 300,000/.test(r1.line)) out.failures.push(`[${V}] units×rate wrong: "${r1.line}" expected 300,000`);
    else out.asserts.data++;
    await shot(p, '03-range-picked');
  }

  // C6 add to cart with dates -> line carries |r<start>|<end> signature
  const addTap = await tapExact(p, 'Add to cart');
  await sleep(1500);
  const addedToast = (await texts(p)).find(x => /Added to cart/i.test(x));
  console.log(V, 'add-to-cart tapped', addTap, 'toast', JSON.stringify(addedToast));
  if (!addedToast) out.failures.push(`[${V}] "Added to cart" confirmation not shown after booking range`);
  else out.asserts.state++;
  const cart1 = await p.evaluate(() => {
    const o = {}; Object.keys(localStorage).filter(k => /expatCartItems/i.test(k))
      .forEach(k => { try { o[k] = JSON.parse(localStorage.getItem(k)); } catch (e) {} }); return o;
  });
  const flat = []; Object.values(cart1).forEach(v => Array.isArray(v) && v.forEach(i => flat.push(i)));
  console.log(V, 'cart after add:', JSON.stringify(flat.map(i => ({ id: i.lineId, q: i.quantity }))).slice(0, 600));

  // second distinct range -> SECOND line
  const r2 = await bookRange(p, 29, 31);
  console.log(V, 'range2', JSON.stringify(r2));
  if (!r2.ok) out.failures.push(`[${V}] range2 booking failed: ${r2.why || 'no units·total line'}`);
  else await shot(p, '04-range2-picked');
  await tapExact(p, 'Add to cart'); await sleep(1500);
  const cart2 = await p.evaluate(() => {
    const o = {}; Object.keys(localStorage).filter(k => /expatCartItems/i.test(k))
      .forEach(k => { try { o[k] = JSON.parse(localStorage.getItem(k)); } catch (e) {} }); return o;
  });
  const flat2 = []; Object.values(cart2).forEach(v => Array.isArray(v) && v.forEach(i => flat2.push(i)));
  const rentLines = flat2.filter(i => typeof i.lineId === 'string' && /\|r\d{4}-\d{2}-\d{2}\|/.test(i.lineId));
  console.log(V, 'cart final:', JSON.stringify(flat2.map(i => ({ id: i.lineId, q: i.quantity }))).slice(0, 900));
  if (rentLines.length < 1) out.failures.push(`[${V}] NO cart line carries rental signature |rYYYY-MM-DD| — ids: ${JSON.stringify(flat2.map(i => i.lineId))}`);
  else {
    out.asserts.data++;
    const sigs = rentLines.map(l => l.lineId.split('|r')[1]);
    if (new Set(rentLines.map(l => l.lineId)).size < 2)
      out.failures.push(`[${V}] two different ranges collapsed into ${new Set(rentLines.map(l => l.lineId)).size} line(s): ${JSON.stringify(rentLines.map(l => l.lineId))}`);
    else { out.asserts.state++; out.twoLines = rentLines.map(l => l.lineId); }
  }
  // open cart screen for visual proof
  await p.goto(`${APP}/#/cart`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(2500);
  await shot(p, '05-cart-lines');

  // RO cleanup: clear OUR OWN user's cart key(s)
  await p.evaluate(() => Object.keys(localStorage).filter(k => /expatCartItems/i.test(k))
    .forEach(k => localStorage.removeItem(k)));

  // ---------- images: full-page slow scroll + gallery swipes ----------
  await p.goto(`${APP}/#/product/470`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await lib.waitText(p, 'Modern Business Stay Apartment', 40000); await sleep(1800);
  // horizontal gallery swipes (main carousel)
  for (let i = 0; i < 6; i++) {
    await p.mouse.move(W - 30, 200); await p.mouse.down();
    await p.mouse.move(30, 200, { steps: 8 }); await p.mouse.up(); await sleep(700);
  }
  await p.mouse.move(W / 2, Math.round(H / 2));
  for (let i = 0; i < 22; i++) { await p.mouse.wheel(0, 420); await sleep(260); }
  await sleep(2000);
  out.images = lib.imageSummary(imgs);
  out.images_requested = 22;
  console.log(V, 'images:', JSON.stringify(out.images), 'requests seen:', Object.keys(imgs).length);
  if (out.images.failed > 0) out.failures.push(`[${V}] ${out.images.failed} image request(s) failed`);
  if (out.images.ok < out.images_requested) out.notes.push(`[${V}] images ok=${out.images.ok}/requested=${out.images_requested} (lazy-load dependent)`);
  await shot(p, '06-final-bottom');
  out.clickRequests = clicksSeen.length;

  await lib.closeVideo(ctx, `${VID}/AU-016-${V}.webm`);
  await browser.close();
  fs.writeFileSync(`/tmp/au016r2-${V}.json`, JSON.stringify(out, null, 1));
  console.log('RESULT ' + V, JSON.stringify(out));
})();
