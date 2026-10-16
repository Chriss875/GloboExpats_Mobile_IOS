// AU-016 r2 VERIFY (RO lane) — rental support on product detail, frozen lane :9108.
// Fixture: sandbox itemDetails/470 "Modern Business Stay Apartment" FOR_RENT NIGHT.
// Usage: node verify_AU-016_r2.js <375|768>
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP = 'http://localhost:9108';
const SHOTS = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-016r2';
const VID = '/tmp/wf-videos-AU016r2';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const V = process.argv[2] || '375';
const W = V === '375' ? 375 : 768, H = V === '375' ? 667 : 1024;
const out = { v: V, failures: [], notes: [], asserts: { state: 0, nav: 0, data: 0 }, buttons: [], images: null };

async function shot(pg, name) { await lib.screenshot(pg, `${SHOTS}/AU-016-${V}-${name}.png`); }

// smallest-node text tap (au013 pattern)
async function tapByText(p, text, opts = {}) {
  const maxLen = (opts && opts.maxLen) || 90;
  for (let pass = 0; pass < 4; pass++) {
    const hit = await p.evaluate(([text, maxLen]) => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        if (!t.includes(text) || t.length > maxLen) return;
        const r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return;
        if (r.bottom < 0 || r.top > innerHeight) return;
        const clickable = e.hasAttribute('flt-tappable') || e.getAttribute('role') === 'button';
        const score = (clickable ? 0 : 1000) + t.length * 3 + r.width + r.height / 10;
        if (!best || score < best.score) best = { score, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
      });
      return best;
    }, [text, maxLen]);
    if (hit) { await p.mouse.click(Math.round(hit.cx), Math.round(hit.cy)); await sleep(600); return true; }
    await p.mouse.move(W / 2 - 5, H / 2); await p.mouse.wheel(0, 320); await sleep(300);
  }
  return false;
}
const texts = p => p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
  .map(e => (e.textContent || '').trim()).filter(Boolean));
async function hasText(p, t) { return (await texts(p)).some(x => x.includes(t)); }
async function dumpButtons(p, tag) {
  out.buttons.push(...(await lib.listButtons(p)).map(b => ({ tag, ...b })));
}

(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport: { width: W, height: H }, videoPath: `${VID}/AU-016-${V}.webm` });
  const p = await ctx.newPage(); p.setDefaultTimeout(25000);
  const imgs = lib.watchImages(p);
  // login first (RO: cart is per-user localStorage; needed for the two-range two-line assert)
  await p.goto(`${APP}/#/login`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  if (!(await lib.isLoggedIn(p))) {
    await lib.waitText(p, 'Welcome back', 30000);
    const ei = p.locator('input[type="text"]').first(), pi = p.locator('input[type="password"]').first();
    await ei.click({ force: true }); await p.waitForTimeout(350); await p.keyboard.type(lib.BUYER.email);
    await pi.click({ force: true }); await p.waitForTimeout(350); await p.keyboard.type(lib.BUYER.pw);
    await lib.clickBtn(p, 'Log in');
    let ok = false; for (let i = 0; i < 30 && !ok; i++) { ok = await lib.isLoggedIn(p); if (!ok) await p.waitForTimeout(1000); }
    if (!ok) out.failures.push(`[${V}] login failed`); else out.asserts.state++;
  }

  // ---- detail load ----
  await p.goto(`${APP}/#/product/470`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  const loaded = await lib.waitText(p, 'Modern Business Stay Apartment', 40000);
  if (!loaded) { console.log(JSON.stringify({ v: V, fatal: 'detail never rendered' , failures: out.failures})); await ctx.close(); await browser.close(); process.exit(2); }
  await sleep(2500);

  // C1 rate period text
  const t1 = await texts(p);
  const rateOk = t1.some(x => /per night/i.test(x));
  const typeOk = t1.some(x => /FOR RENT|FOR_RENT|Short Stay|SHORT STAY/i.test(x));
  console.log(V, 'rate-period:', rateOk, 'listing-type:', typeOk,
    '| sample:', t1.filter(x => /per |rent|FOR /i.test(x)).slice(0, 6));
  if (!rateOk) out.failures.push(`[${V}] no "per night" rate-period text`);
  else out.asserts.data++;
  if (typeOk) out.asserts.data++;

  // C2 NO quantity stepper for rentals
  const qtyUi = t1.filter(x => /^(Quantity|\d+ available)$/.test(x));
  const stepperBtns = (await lib.listButtons(p)).filter(b => b.label === '');
  // detect +/- icon buttons near a Quantity label via aria labels
  const plusMinus = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .filter(e => ['add_circle_outline','remove_circle_outline'].includes(e.getAttribute('aria-label') || '')).length);
  console.log(V, 'qty-ui-present:', JSON.stringify(qtyUi), 'plusMinusNodes:', plusMinus);
  if (qtyUi.length || plusMinus > 0) out.failures.push(`[${V}] quantity stepper present on rental detail: ${JSON.stringify(qtyUi)} pm=${plusMinus}`);
  else out.asserts.state++;

  await shot(p, '01-detail-top');
  await dumpButtons(p, 'top');

  // C3 Start/End date pickers exist
  const startVisible = await hasText(p, 'Start date');
  const endVisible = await hasText(p, 'End date');
  console.log(V, 'start/end visible:', startVisible, endVisible);
  if (!startVisible || !endVisible) out.failures.push(`[${V}] booking panel Start/End not visible`);
  else out.asserts.data++;

  // C4 pick dates -> live units x total readout
  const pickStart = await tapByText(p, 'Start date', { maxLen: 40 });
  await sleep(1200);
  const calOpen = await hasText(p, 'Select a date') || await p.evaluate(() =>
    [...document.querySelectorAll('flt-semantics')].some(e => /S M T W T F S/.test(e.textContent || '')) ||
    document.querySelectorAll('flt-semantics[role="gridcell"], flt-semantics[role="grid"]').length > 0);
  console.log(V, 'pickStart tapped:', pickStart, 'calendar open:', calOpen);
  if (!pickStart) out.failures.push(`[${V}] Start date button not tappable`);
  if (!calOpen) out.failures.push(`[${V}] calendar did not open after tapping Start date`);
  else { out.asserts.state++; await shot(p, '02-calendar'); }
  // pick day 10 of the visible month grid
  const pickedDay = await p.evaluate(() => {
    const cells = [...document.querySelectorAll('flt-semantics')].filter(e =>
      (e.getAttribute('role') === 'gridcell' || e.getAttribute('role') === 'button'));
    const cands = cells.map(e => ({ t: (e.textContent || '').trim(), r: e.getBoundingClientRect(),
      role: e.getAttribute('role') }))
      .filter(x => /^\d{1,2}$/.test(x.t) && x.r.width > 20 && x.r.height > 20 &&
        x.r.bottom > 0 && x.r.top < innerHeight);
    if (!cands.length) return false;
    cands.sort((a, b) => Number(a.t) - Number(b.t));
    const target = cands.find(c => Number(c.t) >= 10) || cands[cands.length - 1];
    document.querySelectorAll('flt-semantics').forEach(() => {});
    return { x: target.r.x + target.r.width / 2, y: target.r.y + target.r.height / 2, d: target.t };
  });
  if (pickedDay && pickedDay.x) {
    await p.mouse.click(Math.round(pickedDay.x), Math.round(pickedDay.y));
    await sleep(700);
    const okBtn = await p.evaluate(() => {
      let best = null;
      document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
        const t = (e.textContent || '').trim();
        if (/^OK$|^SELECT$/i.test(t)) { const r = e.getBoundingClientRect();
          best = { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }
      });
      return best;
    });
    if (okBtn) { await p.mouse.click(Math.round(okBtn.cx), Math.round(okBtn.cy)); }
    await sleep(900);
    await shot(p, '03-after-start-pick');
  } else out.failures.push(`[${V}] no selectable calendar day found`);

  // End date
  const pickEnd = await tapByText(p, /End date/.source ? 'End date' : 'End date', { maxLen: 60 });
  await sleep(1400);
  const endDay = await p.evaluate(() => {
    const cells = [...document.querySelectorAll('flt-semantics')].map(e => {
      const r = e.getBoundingClientRect(); return { t: (e.textContent || '').trim(), r }; })
      .filter(x => /^\d{1,2}$/.test(x.t) && x.r.width > 20 && x.r.height > 20 &&
        x.r.bottom > 0 && x.r.top < innerHeight);
    if (!cells.length) return false;
    cells.sort((a, b) => Number(b.t) - Number(a.t));
    const target = cells[0]; // highest day number on the visible grid
    return { x: target.r.x + target.r.width / 2, y: target.r.y + target.r.height / 2, d: target.t };
  });
  if (endDay && endDay.x) {
    await p.mouse.click(Math.round(endDay.x), Math.round(endDay.y)); await sleep(700);
    const okBtn = await p.evaluate(() => {
      let best = null;
      document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
        const t = (e.textContent || '').trim();
        if (/^OK$|^SELECT$/i.test(t)) { const r = e.getBoundingClientRect();
          best = { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }
      });
      return best;
    });
    if (okBtn) { await p.mouse.click(Math.round(okBtn.cx), Math.round(okBtn.cy)); }
    await sleep(1100);
    const t2 = await texts(p);
    const unitsTotal = t2.find(x => /\d+\s*(nights?|days?)\s*·\s*total/i.test(x));
    console.log(V, 'units-total line:', JSON.stringify(unitsTotal), '| all price-ish:',
      JSON.stringify(t2.filter(x => /total|night|TSh|TZS/i.test(x)).slice(0, 8)));
    if (!unitsTotal) out.failures.push(`[${V}] no "N nights · total X" live total after picking range`);
    else { out.asserts.data++; out.unitsTotal = unitsTotal; }
    await shot(p, '04-range-picked');
  } else out.failures.push(`[${V}] no selectable end-day in calendar`);

  // C5 add-to-cart without dates blocked — fresh page state (no booking)
  await p.goto(`${APP}/#/product/470`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await lib.waitText(p, 'Modern Business Stay Apartment', 30000); await sleep(2000);
  // scroll to bottom where CTAs live
  await lib.scrollToBottom(p, 12); await sleep(800);
  const buyLabel = (await texts(p)).find(x => /^Buy now$|^Book now$|^Add to cart$/i.test(x.trim()));
  console.log(V, 'CTA label:', JSON.stringify(buyLabel));
  await dumpButtons(p, 'cta');
  const tappedBuy = await tapByText(p, buyLabel ? buyLabel.trim() : 'Buy now', { maxLen: 30 });
  await sleep(1300);
  const toast = (await texts(p)).find(x => /Select your rental dates/i.test(x));
  console.log(V, 'blocked-toast:', JSON.stringify(toast), 'nav away:', !(await lib.waitText(p, 'Modern Business Stay Apartment', 1500)));
  if (!toast) out.failures.push(`[${V}] add-to-cart without dates NOT blocked with "Select your rental dates" (tapped=${tappedBuy})`);
  else out.asserts.state++;
  await shot(p, '05-blocked-no-dates');

  // ---- C6 two ranges -> two cart lines (localStorage signature check) ----
  async function bookRangeAndAdd(dayA, dayB, tag) {
    // start
    await tapByText(p, 'Start date', { maxLen: 40 });
    await sleep(1200);
    await p.evaluate((d) => {
      const cells = [...document.querySelectorAll('flt-semantics')].map(e => {
        const r = e.getBoundingClientRect(); return { t: (e.textContent || '').trim(), r }; })
        .filter(x => x.t === String(d) && x.r.width > 20 && x.r.height > 20 && x.r.bottom > 0 && x.r.top < innerHeight);
      if (cells.length) { /* click below */ }
      window.__cell = cells[0] ? { x: cells[0].r.x + cells[0].r.width / 2, y: cells[0].r.y + cells[0].r.height / 2 } : null;
    }, dayA);
    const c1 = await p.evaluate(() => window.__cell);
    if (c1) { await p.mouse.click(Math.round(c1.x), Math.round(c1.y)); await sleep(600);
      const okB = await p.evaluate(() => { let b = null;
        document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
          if (/^OK$/i.test((e.textContent || '').trim())) { const r = e.getBoundingClientRect(); b = { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; } });
        return b; });
      if (okB) await p.mouse.click(Math.round(okB.cx), Math.round(okB.cy)); }
    await sleep(800);
    // end
    await tapByText(p, 'End date', { maxLen: 60 });
    await sleep(1200);
    await p.evaluate((d) => {
      const cells = [...document.querySelectorAll('flt-semantics')].map(e => {
        const r = e.getBoundingClientRect(); return { t: (e.textContent || '').trim(), r }; })
        .filter(x => x.t === String(d) && x.r.width > 20 && x.r.height > 20 && x.r.bottom > 0 && x.r.top < innerHeight);
      window.__cell2 = cells[cells.length - 1] ? { x: cells[cells.length - 1].r.x + cells[cells.length - 1].r.width / 2,
        y: cells[cells.length - 1].r.y + cells[cells.length - 1].r.height / 2 } : null;
    }, dayB);
    const c2 = await p.evaluate(() => window.__cell2);
    if (c2) { await p.mouse.click(Math.round(c2.x), Math.round(c2.y)); await sleep(600);
      const okB = await p.evaluate(() => { let b = null;
        document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
          if (/^OK$/i.test((e.textContent || '').trim())) { const r = e.getBoundingClientRect(); b = { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; } });
        return b; });
      if (okB) await p.mouse.click(Math.round(okB.cx), Math.round(okB.cy)); }
    await sleep(900);
    // Add to cart button
    const added = await tapByText(p, 'Add to cart', { maxLen: 30 });
    await sleep(1400);
    const snk = (await texts(p)).find(x => /Added to cart/i.test(x));
    console.log(tag, 'added:', !!snk);
    return !!snk;
  }

  // navigate to cart and read localStorage line ids
  function readCart() {
    return p.evaluate(() => {
      try {
        const keys = Object.keys(localStorage).filter(k => /expatCartItems|cart/i.test(k));
        const all = {};
        keys.forEach(k => { try { all[k] = JSON.parse(localStorage.getItem(k)); } catch (e) { all[k] = localStorage.getItem(k); } });
        return all;
      } catch (e) { return { err: String(e) }; }
    });
  }

  const ok1 = await bookRangeAndAdd(11, 14, V + '-range1');
  const cart1 = await readCart();
  await shot(p, '06-after-add-1');
  const ok2 = await bookRangeAndAdd(17, 19, V + '-range2');
  const cart2 = await readCart();
  await shot(p, '07-after-add-2');
  const lines = [];
  Object.values(cart2).forEach(v => { if (Array.isArray(v)) v.forEach(it => {
    if (it && it.lineId) lines.push({ lineId: it.lineId, q: it.quantity, title: it.title });
    else if (it && it.productId != null) lines.push({ raw: it });
  }); });
  console.log(V, 'cart lines:', JSON.stringify(lines).slice(0, 1200));
  const rentLines = lines.filter(l => l.lineId && /\|r\d{4}-\d{2}-\d{2}/.test(l.lineId));
  if (!rentLines.length) out.failures.push(`[${V}] no cart line carries the rental booking signature (${JSON.stringify(lines).slice(0, 400)})`);
  else {
    out.asserts.data++;
    const distinct = new Set(rentLines.map(l => l.lineId));
    if (distinct.size < 2) out.failures.push(`[${V}] expected TWO distinct signed lines after two ranges, got ${distinct.size}: ${JSON.stringify(rentLines)}`);
    else out.asserts.state++;
  }
  if (!ok1 || !ok2) out.notes.push(`[${V}] add-to-cart confirmations seen: ${ok1}/${ok2}`);

  // cleanup RO: remove what we added from OUR OWN user cart only
  await p.evaluate(() => {
    Object.keys(localStorage).filter(k => /expatCartItems/i.test(k)).forEach(k => localStorage.removeItem(k));
  });

  // images + final shots
  await sleep(1200);
  out.images = lib.imageSummary(imgs);
  console.log(V, 'images:', JSON.stringify(out.images));
  await shot(p, '08-final');
  await lib.closeVideo(ctx, `${VID}/AU-016-${V}.webm`);
  await browser.close();
  fs.writeFileSync(`/tmp/au016-${V}.json`, JSON.stringify(out, null, 1));
  console.log('RESULT ' + V, JSON.stringify(out));
})();
const fs = require('fs');
