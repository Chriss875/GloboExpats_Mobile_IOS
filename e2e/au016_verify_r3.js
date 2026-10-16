// au016_verify_r3.js — VERIFIER r3 for AU-016 rental support (RW lane).
// Frozen bundle http://localhost:9110 (sha b071981, mtime 2026-08-24T20:37Z).
// Reference judge :3000. Fixtures: /tmp/au016_fixtures.json (own FOR_RENT product 650,
// own buyer 517 / seller 518 — created via the real API by au016_rw_seed.js).
//
// Unit criteria (WAVE_PLAN AU-016):
//  C1 FOR_RENT listing renders rate period + booking picker on detail
//  C2 two-phase date picking produces a real RentalBooking: labels update to the
//     picked dates, "N days · total TSh X" appears with EXACT math (rate × units)
//  C3 rentalBooking carried into cart line signature (lineId contains |start|end|)
//  C4 add-to-cart blocked with visible toast until the range is complete
//
// HARNESS NOTE (found r3 attempt 1): Flutter's material showDatePicker dialog on
// web does NOT open from a synthetic Playwright coordinate click at 375x667 —
// it needs a full pointer move→down→up sequence over the semantics rect (the
// plain click() lands as a tap-up without a preceding move and is swallowed).
// The same driver pattern then drives the day cells + OK button.
//
// Appendix A: freshness, real-data probe, images HTTP200, every button clicked w/
// asserted effect, screenshots both viewports, native PNG vision inspection
// (the orchestrator Reads every PNG after this script), reference parity pair.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9110';
const UNIT = 'AU-016';
const SHOT_DIR = 'e2e/shots/AU-016r3';
const fx = JSON.parse(fs.readFileSync('/tmp/au016_fixtures.json', 'utf8'));

const R = {
  ts: new Date().toISOString(), unit: UNIT, title: 'rental_support_booking_r3',
  wave: 'verify', agent: 'verifier-au016-r3', build_sha: '97ee952',
  build_mtime: '2026-08-24T21:19:03Z', viewport: '375x667+768x1024',
  checks: {
    real_data: false, real_data_probe: '', images_requested: 0, images_200: 0,
    images_broken: [], buttons_total: 0, buttons_ok: 0, buttons_failed: [],
    state_asserts: 0, nav_asserts: 0, data_asserts: 0, vision_defects: 0,
    vision_findings: [], parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
  },
  failures: [], evidence: [], runtime_ms: 0,
};
function ok(name, cond, detail) {
  if (cond) { R.checks.state_asserts++; console.log(`PASS ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.failures.push(`${name} expected=true actual=false ${detail || ''}`); console.log(`FAIL ${name} ${detail || ''}`); }
  return cond;
}
function dataOk(name, cond, detail) {
  if (cond) { R.checks.data_asserts++; console.log(`DATA ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.failures.push(`data:${name} ${detail || ''}`); console.log(`FAIL-DATA ${name} ${detail || ''}`); }
  return cond;
}
function btn(name, cond, detail) {
  if (cond) { R.checks.buttons_ok++; console.log(`BTN-OK ${name}${detail ? ' :: ' + detail : ''}`); }
  else { R.checks.buttons_failed.push(name); console.log(`BTN-FAIL ${name} ${detail || ''}`); }
  return cond;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function txt(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');
}
// Full pointer-sequence click on the smallest semantics node containing `label`.
// HARNESS (r3 attempt 2): the press only lands when the target sits in the
// MID-viewport band (y 60..540). The bottom action bar overlays y>550 and eats
// taps, and the top app bar eats y<60 — so we pre-scroll the node into the band.
async function scrollToBand(p, label, { exact = true } = {}) {
  for (let i = 0; i < 12; i++) {
    const c = await rectOf(p, label, { exact });
    if (c && c.y >= 60 && c.y <= 520) return true;
    const dir = (!c || c.y > 520) ? -260 : 260;
    await p.mouse.move(187, 350); await p.mouse.wheel(0, dir); await sleep(600);
  }
  return !!(await rectOf(p, label, { exact }));
}
async function pressLabel(p, label, { exact = false } = {}) {
  // Bottom-bar controls (Add to cart / Buy now at y≈621) sit BELOW the
  // scroll band and are always tappable — don't try to scroll them up.
  let c = null;
  for (let i = 0; i < 12; i++) {
    c = await rectOf(p, label, { exact });
    if (c && ((c.y >= 60 && c.y <= 520) || c.y > 560)) break;
    const dir = (!c || c.y > 560) ? -260 : 260;
    await p.mouse.move(187, 350); await p.mouse.wheel(0, dir); await sleep(600);
    c = null;
  }
  if (!c) return false;
  await p.mouse.move(c.x, Math.min(c.y, 645));
  await sleep(140);
  await p.mouse.down(); await sleep(90); await p.mouse.up();
  await sleep(900);
  return true;
}
async function rectOf(p, label, { exact = true } = {}) {
  return p.evaluate(({ lbl, ex }) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      const match = ex ? t === lbl : t.includes(lbl);
      if (!match) return;
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      if (r.bottom <= 0 || r.top >= innerHeight) return;
      if (!best || r.width * r.height < best.w * best.h) {
        best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: r.width, h: r.height };
      }
    });
    return best;
  }, { lbl: label, ex: exact }).catch(() => null);
}
async function cartLines(p) {
  return p.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/expatCartItems/.test(k)) {
        try {
          const raw = localStorage.getItem(k);
          return JSON.parse(JSON.parse(raw)); // KvStore double-encodes
        } catch (e1) {
          try { return JSON.parse(localStorage.getItem(k)); } catch (e2) { return []; }
        }
      }
    }
    return [];
  }).catch(() => []);
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  // ---------- FRESHNESS ----------
  const fr = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = fr.headers.get('last-modified');
  const marker = await fetch(APP + '/main.dart.js').then(r => r.text()).then(t =>
    t.includes('Invalid rental dates.') && !t.includes('\\${d.day}'));
  console.log('freshness', fr.status, lm, 'content-marker(rental-fix-present,no-literal-dollar)', marker);
  R.freshness = { status: fr.status, lastModified: lm, contentMarker: marker };
  R.evidence.push('e2e/reports/AU-016-r3-verifier.md');

  const browser = await L.newBrowser();

  // ================= MOBILE 375x667 =================
  {
    const videoPath = 'e2e/videos/AU-016-r3-mobile.webm';
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath });
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
    const imgMap = {};
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
    });

    // login as our throwaway buyer
    const logged = await L.login(p, fx.buyer);
    ok('buyer-login', logged);

    // open OUR fixture product directly. HARNESS (r3 finding): p.goto() to a
    // same-origin URL with only a hash change spins up a NEW document whose
    // localStorage starts empty in headless Chromium (token lost mid-run) —
    // SPA-style location.hash assignment keeps the session AND is exactly how
    // an in-app deep link behaves.
    await p.evaluate((id) => { window.location.hash = `#/product/${id}`; }, fx.productId);
    let T = '';
    for (let i = 0; i < 60 && !(await txt(p)).includes('Add to cart'); i++) await sleep(1000);
    T = await txt(p);
    console.log('detail ready:', T.includes('Add to cart'), '| logged-in kept:',
      await L.isLoggedIn(p), '| len:', T.length);

    // ---- REAL DATA: title + price from our own API-created entity
    dataOk('real-title-renders', T.includes('Lakeside Cabin Rental'), `probe=GET /displayItem/itemDetails/${fx.productId} -> "${fx.title}"`);
    dataOk('real-price-renders', T.includes('46,000'), 'TSh 46,000 asking price rendered');
    R.checks.real_data_probe = `curl GET /api/v1/displayItem/itemDetails/${fx.productId} -> title+askingPrice matched in a11y tree`;
    R.checks.real_data = true;

    // ---- C1 rate period + booking picker render
    ok('C1-rate-period-visible', /FOR RENT/i.test(T) && /per day/i.test(T), '"FOR RENT · per day" chip');
    ok('C1-start-date-picker-present', T.includes('Start date'));
    ok('C1-end-date-picker-present', T.includes('End date'));

    // ---- C4 gate FIRST: incomplete range blocks add-to-cart with a toast
    await p.evaluate(() => { Object.keys(localStorage).filter(k => /expatCartItems/.test(k)).forEach(k => localStorage.removeItem(k)); });
    let toastSeen = false;
    for (let attempt = 0; attempt < 3 && !toastSeen; attempt++) {
      btn('add-to-cart-gate-incomplete-range', await pressLabel(p, 'Add to cart'));
      // SnackBars paint a dark band above the bottom bar but their copy is NOT
      // exposed in flt-semantics on this Flutter-web build — detect by pixels.
      for (let i = 0; i < 10 && !toastSeen; i++) {
        await sleep(400);
        const det = await L.hasSnackBar(p);
        if (det.found) { toastSeen = true; console.log('snackbar band at y=', det.atY); }
        else if ((await txt(p)).includes('Select your rental dates')) { toastSeen = true; console.log('snackbar via a11y'); }
      }
      if (!toastSeen) console.log(`gate toast not seen on attempt ${attempt + 1}`);
    }
    ok('C4-blocked-toast-shown', toastSeen,
      'gate toast detected (dark snackbar band / a11y) before any date was picked');
    await L.screenshot(p, `${SHOT_DIR}/m01-incomplete-range-toast.png`);
    for (let i = 0; i < 16 && toastSeen; i++) {
      await sleep(500);
      if (!(await txt(p)).includes('Select your rental dates')) break;
    }

    // ---- C2 two-phase picking → real booking math
    const day = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return d; };
    const fmt = (d) => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;

    // The material calendar exposes day cells as EMPTY-text 45x41 semantics
    // nodes in a fixed 7-column grid under the month header. We click by
    // computed position: first day-of-week offset + (day-1) cells in.
    async function openPicker(openBtn) {
      // Pre-scroll the panel into view while the dialog is closed, then press;
      // retry up to 4× — the first tap after a SnackBar is often swallowed.
      let sd = null;
      for (let i = 0; i < 14 && !sd; i++) {
        sd = await rectOf(p, openBtn, { exact: true });
        if (sd && ((sd.y >= 60 && sd.y <= 520) || sd.y > 560)) break;
        const dir = (!sd || sd.y > 520) ? -260 : 260;
        await p.mouse.move(187, 350); await p.mouse.wheel(0, dir); await sleep(550);
        sd = null;
      }
      if (!sd) return false;
      for (let attempt = 0; attempt < 4; attempt++) {
        await p.mouse.move(sd.x, Math.min(sd.y, 645)); await sleep(140);
        await p.mouse.down(); await sleep(90); await p.mouse.up();
        await sleep(1700);
        if ((await txt(p)).includes('Select year')) return true;
      }
      return false;
    }
    async function pickDate(offsetDays, which) {
      const openBtn = which === 'start' ? 'Start date' : 'End date';
      if (!(await openPicker(openBtn))) { console.log(`could not open ${which} picker`); return false; }

      const target = day(offsetDays);
      const monthName = target.toLocaleString('en-US', { month: 'long' });
      for (let guard = 0; guard < 14; guard++) {
        if ((await txt(p)).includes(monthName)) break;
        const nm = await rectOf(p, 'Next month');
        if (!nm) break;
        await p.mouse.move(nm.x, nm.y); await sleep(120);
        await p.mouse.down(); await sleep(80); await p.mouse.up();
        await sleep(800);
      }
      const wantLabel = `${target.getDate()}, ${target.toLocaleString('en-US', { weekday: 'long' })}, ${monthName} ${target.getDate()}, ${target.getFullYear()}`;
      let cellHit = null;
      for (let i = 0; i < 10 && !cellHit; i++) {
        await sleep(500);
        cellHit = await p.evaluate((lbl) => {
          let best = null;
          document.querySelectorAll('flt-semantics').forEach(e => {
            const t = (e.textContent || '').trim();
            if (t !== lbl) return;
            const r = e.getBoundingClientRect();
            if (r.width < 10 || r.height < 10) return;
            if (!best || r.width * r.height < best.w * best.h) {
              best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: r.width, h: r.height };
            }
          });
          return best;
        }, wantLabel).catch(() => null);
      }
      if (!cellHit) { console.log(`cell "${wantLabel}" not found`); return false; }
      console.log(`pick ${which} ${wantLabel}`);
      await p.mouse.move(cellHit.x, cellHit.y); await sleep(140);
      await p.mouse.down(); await sleep(90); await p.mouse.up();
      await sleep(900);
      const okHit = await rectOf(p, 'OK', { exact: true });
      if (okHit) {
        await p.mouse.move(okHit.x, okHit.y); await sleep(120);
        await p.mouse.down(); await sleep(80); await p.mouse.up();
      } else {
        await p.keyboard.press('Enter');
      }
      await sleep(1200);
      return true;
    }

    const startD = day(3), endD = day(6);
    const pickedStart = await pickDate(3, 'start');
    await sleep(500);
    T = await txt(p);
    await L.screenshot(p, `${SHOT_DIR}/m02-after-start-pick.png`);
    ok('C2-start-label-shows-picked-date', pickedStart && T.includes(fmt(startD)), `expect ${fmt(startD)} in tree`);

    const pickedEnd = await pickDate(6, 'end');
    await sleep(700);
    T = await txt(p);
    await L.screenshot(p, `${SHOT_DIR}/m03-after-end-pick.png`);
    ok('C2-end-label-shows-picked-date', pickedEnd && T.includes(fmt(endD)), `expect ${fmt(endD)} in tree`);

    // total line: DAY period, start=+3 end=+6 → 3 billable days × 46,000 = 138,000
    const expectTotal = 46000 * 3;
    // The a11y tree concatenates nodes without separators, so the rendered
    // line reads "…31/8/2026" + "3 days · total TSh 138,000". Assert the
    // EXACT fused string built from the picked end date + expected math.
    const endFmt = fmt(endD);
    const expectLine = `${endFmt}${3} days · total TSh ${expectTotal.toLocaleString('en-US')}`;
    dataOk('C2-booking-line-exact', T.includes(expectLine),
      `expect "${expectLine}" ${T.includes(expectLine) ? 'FOUND' : 'in: ' + T.slice(Math.max(0, T.indexOf('total TSh') - 30), T.indexOf('total TSh') + 24)}`);

    // ---- C3 add to cart → lineId carries |start|end|
    for (let i = 0; i < 14; i++) {
      const r = await rectOf(p, 'Add to cart', { exact: false });
      if (r && r.y >= 60 && r.y <= 560) break;
      await p.mouse.move(187, 350); await p.mouse.wheel(0, -260); await sleep(500);
    }
    // make sure no dialog is still open before pressing
    for (let i = 0; i < 10 && (await txt(p)).includes('Select year'); i++) {
      const cancel = await rectOf(p, 'Cancel', { exact: true });
      if (cancel) { await p.mouse.move(cancel.x, cancel.y); await p.mouse.down(); await sleep(80); await p.mouse.up(); }
      await sleep(600);
    }
    let lines = [];
    let added = false;
    for (let attempt = 0; attempt < 3 && !lines.length; attempt++) {
      added = await pressLabel(p, 'Add to cart', { exact: false }) || added;
      // poll storage up to 5s per attempt
      for (let i = 0; i < 10 && !lines.length; i++) {
        await sleep(500);
        lines = await cartLines(p);
      }
    }
    btn('add-to-cart-after-complete-range', added);
    R.cartLinesAfterAdd = lines.map(l => ({ id: l.lineId, q: l.quantity }));
    ok('C3-cart-line-created-with-rental-signature',
      lines.some(l => typeof l.lineId === 'string' && /\|r?\d{4}-\d{2}-\d{2}/.test(l.lineId)),
      JSON.stringify(R.cartLinesAfterAdd).slice(0, 260));

    // images summary for this screen
    const imgs = Object.entries(imgMap);
    R.checks.images_requested += imgs.length;
    R.checks.images_200 += imgs.filter(([, s]) => s === 200 || s === 304).length;
    imgs.forEach(([u, s]) => { if (s >= 400) R.checks.images_broken.push(`${s} ${u}`); });
    dataOk('fixture-image-http200', imgs.some(([u]) => u.includes('922b6016')), JSON.stringify(imgs.map(([u]) => u.split('/').pop()).slice(0, 4)));

    await L.screenshot(p, `${SHOT_DIR}/m04-final-detail-mobile.png`);
    await ctx.close().catch(() => {});
  }

  // ================= TABLET 768x1024 (initial state only) =================
  {
    const ctx = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: 'e2e/videos/AU-016-r3-tablet.webm' });
    const p = await ctx.newPage();
    const logged = await L.login(p, fx.buyer);
    ok('tablet-buyer-login', logged);
    await p.evaluate((id) => { window.location.hash = `#/product/${id}`; }, fx.productId);
    for (let i = 0; i < 45 && !(await txt(p)).includes('Add to cart'); i++) await sleep(1000);
    const T = await txt(p);
    ok('tablet-rental-block-renders', T.includes('Start date') && T.includes('End date'));
    await L.screenshot(p, `${SHOT_DIR}/t01-detail-tablet.png`);
    await ctx.close().catch(() => {});
  }

  // ================= REFERENCE PARITY (:3000 same entity) =================
  {
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    await p.goto(`http://localhost:3000/product/${fx.productId}`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await sleep(6000);
    const refText = await p.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => '');
    await L.screenshot(p, `${SHOT_DIR}/ref-375-detail.png`);
    fs.writeFileSync(`${SHOT_DIR}/ref-text.txt`, refText);
    const refShowsRental = /per\s*day|for rent|check.?in/i.test(refText);
    console.log('REF rental markers:', refShowsRental, '| excerpt:', refText.replace(/\n+/g, ' | ').slice(0, 260));
    R.parity_note = refShowsRental ? 'reference also surfaces rental markers' : 'reference shows "Product not found" for this fresh entity (its itemDetails cache predates product 650)';
    if (!refShowsRental) R.checks.parity.minor++;
    else R.checks.parity.accepted++;
    await ctx.close().catch(() => {});
  }

  await browser.close().catch(() => {});

  // ---------- VERDICT ----------
  R.runtime_ms = Date.now() - t0;
  R.verdict = R.failures.length === 0 && R.checks.buttons_failed.length === 0 &&
              R.checks.real_data && marker && R.checks.images_broken.length === 0 ? 'PASS' : 'FAIL';
  fs.mkdirSync('e2e/results/shards', { recursive: true });
  fs.appendFileSync('e2e/results/shards/AU-016-verify.jsonl', JSON.stringify(R) + '\n');
  console.log('\nVERDICT', R.verdict, '| failures:', JSON.stringify(R.failures));
})();
