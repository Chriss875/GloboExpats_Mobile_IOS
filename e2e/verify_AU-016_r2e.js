// AU-016 r2 FINAL (RO lane) — frozen :9108, sha 7b4342f. Two-pass date-pick strategy
// (pass1 start-only is a no-op by design: end defaults to same day → ArgumentError →
// state stays null; pass2 sets the OTHER bound creating a valid range), pixel-verified.
// Usage: node verify_AU-016_r2e.js <375|768>
const fs = require('fs'), zlib = require('zlib');
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
function readPng(path) {
  const d = fs.readFileSync(path);
  let pos = 8, idat = Buffer.alloc(0);
  while (pos < d.length) {
    const ln = d.readUInt32BE(pos); const typ = d.slice(pos + 4, pos + 8).toString();
    if (typ === 'IDAT') idat = Buffer.concat([idat, d.slice(pos + 8, pos + 8 + ln)]);
    pos += 12 + ln;
  }
  const w = d.readUInt32BE(16), h = d.readUInt32BE(20);
  return { w, h, raw: zlib.inflateSync(idat), stride: w * 3 + 1 };
}
async function tapOnScreen(p, label) {
  const hit = await p.evaluate((lbl) => {
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
  }, label);
  if (!hit) return false;
  await p.mouse.click(Math.round(hit.cx), Math.round(hit.cy));
  await sleep(650); return true;
}
async function scrollUntil(p, label, maxSteps = 16) {
  for (let i = 0; i < maxSteps; i++) {
    const vis = await p.evaluate((lbl) => {
      let ok = false;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if (ok) return;
        if ((e.textContent || '').trim() !== lbl) return;
        const r = e.getBoundingClientRect();
        if (r.top > 40 && r.bottom < innerHeight - 10 && r.height > 8) ok = true;
      });
      return ok;
    }, label);
    if (vis) return true;
    await p.mouse.move(W / 2 - 4, Math.round(H * 0.6));
    await p.mouse.wheel(0, 300);
    await sleep(240);
  }
  return false;
}
const dayCells = p => p.evaluate(() => {
  const out = [];
  document.querySelectorAll('flt-semantics').forEach(e => {
    const m = ((e.textContent || '').trim()).match(/^(\d{1,2}),\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/);
    if (!m) return;
    const r = e.getBoundingClientRect();
    if (r.width < 20 || r.width > 60) return;
    out.push({ d: Number(m[1]), cx: r.x + r.width / 2, cy: r.y + r.height / 2 });
  });
  return out;
});
async function calOpen(p) {
  return p.evaluate(() => ['OK', 'CANCEL'].every(w =>
    [...document.querySelectorAll('flt-semantics[role="button"]')]
      .some(e => (e.textContent || '').trim().toUpperCase() === w)));
}
async function pickDay(p, day) {
  const cells = await dayCells(p);
  const c = cells.find(x => x.d === day);
  if (!c) return false;
  await p.mouse.click(Math.round(c.cx), Math.round(c.cy)); await sleep(500);
  const okB = await p.evaluate(() => { let b = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if (/^OK$/i.test((e.textContent || '').trim())) { const r = e.getBoundingClientRect();
        b = { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; } });
    return b; });
  if (!okB) return false;
  await p.mouse.click(Math.round(okB.cx), Math.round(okB.cy)); await sleep(1300);
  return true;
}
// panel buttons by position band (semantics labels are stale after picks)
async function panelButtons(p) {
  return p.evaluate(() => {
    const btns = [];
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!(t === 'Start date' || t === 'End date' || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t))) return;
      const r = e.getBoundingClientRect();
      if (r.y < 480 || r.y > 660 || r.width < 60) return;
      btns.push({ label: t, x: r.x, y: r.y, w: r.width });
    });
    return btns;
  });
}
async function catchToast(p, tag) {
  await p.screenshot({ path: `/tmp/${tag}-base.png` });
  const base = readPng(`/tmp/${tag}-base.png`);
  let best = null;
  for (let f = 0; f < 14; f++) {
    const path = `/tmp/${tag}-toast-${f}.png`;
    await p.screenshot({ path });
    const fr = readPng(path);
    let diff = 0;
    for (let y = 540; y < Math.min(620, fr.h); y++) {
      const r1 = base.raw.slice(y * base.stride, (y + 1) * base.stride);
      const r2 = fr.raw.slice(y * fr.stride, (y + 1) * fr.stride);
      for (let x = 1; x < r1.length; x += 3)
        if (Math.abs(r1[x] - r2[x]) > 25) diff++;
    }
    if (!best && diff > 400) { best = { path, diff }; }
  }
  return best;
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

  // ---- detail ----
  await p.goto(`${APP}/#/product/470`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  if (!(await lib.waitText(p, 'Modern Business Stay Apartment', 45000))) {
    console.log(JSON.stringify({ v: V, fatal: 'detail never rendered' })); process.exit(2);
  }
  await sleep(2200);

  // C1 rate period + real data
  const t1 = await texts(p); const joined = t1.join('\n');
  out.realdata = {};
  for (const [k, re] of Object.entries({
    price: /TSh 150,000/, name: /Modern Business Stay Apartment/,
    loc: /kilaiti street, Dar es Salaam, Tanzania/, views: /\d+ total views/,
    seller: /Angel Korosso/, org: /Siimply Stays/, checkin: /Check-in time\s*1:00 PM/ }))
    out.realdata[k] = re.test(joined);
  out.ratePeriod = /FOR RENT · per night/.test(joined);
  console.log(V, 'ratePeriod', out.ratePeriod, JSON.stringify(out.realdata));
  if (!out.ratePeriod) out.failures.push(`[${V}] no "FOR RENT · per night" rate-period text`);
  else out.asserts.data++;
  Object.entries(out.realdata).forEach(([k, v]) => { if (v) out.asserts.data++; else out.failures.push(`[${V}] real-data ${k} missing`); });

  // C2 no quantity stepper on rentals
  const plusMinus = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .filter(e => ['add_circle_outline', 'remove_circle_outline'].includes(e.getAttribute('aria-label') || '')).length);
  const qtyLabel = t1.some(x => /^Quantity$/.test(x));
  if (qtyLabel || plusMinus > 0) out.failures.push(`[${V}] quantity stepper present on FOR_RENT detail`);
  else out.asserts.state++;

  // C3 booking panel present
  if (!(await hasText(p, 'Start date')) || !(await hasText(p, 'End date')))
    out.failures.push(`[${V}] Start/End date pickers missing`);
  else out.asserts.data++;
  await shot(p, '01-detail-top');
  out.buttons.push(...(await lib.listButtons(p)).map(b => ({ tag: 'top', ...b })));

  // C4 add-to-cart WITHOUT dates blocked — toast via pixel-catch
  await scrollUntil(p, 'Buy now'); await sleep(350);
  const buyTap = await tapOnScreen(p, 'Buy now');
  const toastShot = buyTap ? await catchToast(p, `au016-${V}-block`) : null;
  console.log(V, 'block test tapped:', buyTap, 'toast:', JSON.stringify(toastShot));
  if (!buyTap) out.failures.push(`[${V}] Buy now could not be tapped`);
  else if (!toastShot) out.failures.push(`[${V}] no block-toast after Buy now w/o dates`);
  else {
    out.asserts.state++;
    fs.copyFileSync(toastShot.path, `${SHOTS}/AU-016-${V}-02-blocked-toast.png`);
    const fr = readPng(toastShot.path);
    const lines = [];
    for (let y = 540; y < Math.min(620, fr.h); y++) {
      let line = '';
      for (let x = 24; x < 353; x++) {
        const px = fr.raw.slice(y * fr.stride + 1 + x * 3, y * fr.stride + 1 + x * 3 + 3);
        const lum = (px[0] * 299 + px[1] * 587 + px[2] * 114) / 1000;
        line += lum > 45 ? '#' : ' ';
      }
      if (line.trim()) lines.push(line);
    }
    fs.writeFileSync(`/tmp/au016-${V}-toast.txt`, lines.join('\n'));
  }
  await sleep(2600);

  // C5 two-phase range pick: phase A start=26 (no-op), phase B end=28 → valid range
  async function bookRange(dA, dB, tag) {
    if (!(await scrollUntil(p, 'Start date'))) return { ok: false, why: 'Start unreachable' };
    if (!(await tapOnScreen(p, 'Start date'))) return { ok: false, why: 'Start tap failed' };
    if (!(await calOpen(p))) return { ok: false, why: 'start cal' };
    await pickDay(p, dA);                       // phase A: registers start only
    // phase B: open the OTHER picker (End), pick dB → valid range
    const btns = await panelButtons(p);
    const endBtn = btns.find(b => b.x > W / 2);
    if (!endBtn) return { ok: false, why: 'end button not found post-A' };
    await p.mouse.click(Math.round(endBtn.x + endBtn.w / 2), Math.round(endBtn.y + 16));
    await sleep(1100);
    if (!(await calOpen(p))) return { ok: false, why: 'end cal' };
    if (!(await pickDay(p, dB))) return { ok: false, why: `day ${dB}` };
    // layout growth = total-line proof (Choose options shifts down OR new ink below buttons)
    return { ok: true };
  }
  const preY = await p.evaluate(() => { let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if ((e.textContent || '').trim() !== 'Choose options') return;
      const r = e.getBoundingClientRect(); if (!best || r.width * r.height < best.a) best = { a: r.width * r.height, y: r.y };
    }); return best ? Math.round(best.y) : null; });
  const r1 = await bookRange(26, 28, '03-range-picked');
  const postY = await p.evaluate(() => { let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if ((e.textContent || '').trim() !== 'Choose options') return;
      const r = e.getBoundingClientRect(); if (!best || r.width * r.height < best.a) best = { a: r.width * r.height, y: r.y };
    }); return best ? Math.round(best.y) : null; });
  console.log(V, 'range1', JSON.stringify(r1), 'chooseOptionsY', preY, '->', postY);
  if (!r1.ok) out.failures.push(`[${V}] range1 failed: ${r1.why}`);
  else if (postY == null || postY <= preY) out.failures.push(`[${V}] booking panel did not grow (total line missing): Choose options y ${preY}->${postY}`);
  else {
    out.asserts.data++; out.totalLineGrew = `${preY}->${postY}`;
    await shot(p, '03-range-picked');
  }

  // C6 add to cart with valid range → signed cart line in OUR OWN user's storage
  await scrollUntil(p, 'Add to cart'); await sleep(300);
  await tapOnScreen(p, 'Add to cart'); await sleep(1800);
  const cartAfterAdd = await p.evaluate(() => {
    const o = {}; Object.keys(localStorage).filter(k => /expatCartItems/i.test(k))
      .forEach(k => { try { o[k] = JSON.parse(localStorage.getItem(k)); } catch (e) {} }); return o;
  });
  const flat = []; Object.values(cartAfterAdd).forEach(v => Array.isArray(v) && v.forEach(i => flat.push(i)));
  console.log(V, 'cart1:', JSON.stringify(flat.map(i => ({ id: i.lineId, q: i.quantity }))).slice(0, 500));

  // second distinct range → second distinct line
  const preY2 = await p.evaluate(() => { let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if ((e.textContent || '').trim() !== 'Choose options') return;
      const r = e.getBoundingClientRect(); if (!best || r.width * r.height < best.a) best = { a: r.width * r.height, y: r.y };
    }); return best ? Math.round(best.y) : null; });
  const r2 = await bookRange(29, 31, '04-range2-picked');
  const postY2 = await p.evaluate(() => { let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if ((e.textContent || '').trim() !== 'Choose options') return;
      const r = e.getBoundingClientRect(); if (!best || r.width * r.height < best.a) best = { a: r.width * r.height, y: r.y };
    }); return best ? Math.round(best.y) : null; });
  console.log(V, 'range2', JSON.stringify(r2), 'chooseY', preY2, '->', postY2);
  if (!r2.ok) out.failures.push(`[${V}] range2 failed: ${r2.why}`);
  else if (postY2 == null || postY2 <= preY2) out.notes.push(`[${V}] range2 total-line growth unclear (${preY2}->${postY2})`);
  await scrollUntil(p, 'Add to cart'); await sleep(300);
  await tapOnScreen(p, 'Add to cart'); await sleep(1800);
  const cartFinal = await p.evaluate(() => {
    const o = {}; Object.keys(localStorage).filter(k => /expatCartItems/i.test(k))
      .forEach(k => { try { o[k] = JSON.parse(localStorage.getItem(k)); } catch (e) {} }); return o;
  });
  const flat2 = []; Object.values(cartFinal).forEach(v => Array.isArray(v) && v.forEach(i => flat2.push(i)));
  console.log(V, 'cart2:', JSON.stringify(flat2.map(i => ({ id: i.lineId, q: i.quantity }))).slice(0, 800));
  const rentLines = flat2.filter(i => typeof i.lineId === 'string' && /\|r\d{4}-\d{2}-\d{2}/.test(i.lineId));
  if (rentLines.length < 1) out.failures.push(`[${V}] NO signed rental cart line — ids: ${JSON.stringify(flat2.map(i => i.lineId))}`);
  else {
    out.asserts.data++;
    const uniq = new Set(rentLines.map(l => l.lineId));
    if (uniq.size < 2) out.failures.push(`[${V}] two ranges collapsed into ${uniq.size} line(s): ${JSON.stringify(rentLines.map(l => l.lineId))}`);
    else { out.asserts.state++; out.twoLines = rentLines.map(l => ({ id: l.lineId, q: l.quantity })); }
    if (rentLines.some(l => l.quantity !== 1)) out.failures.push(`[${V}] rental qty != 1`);
    else out.asserts.state++;
  }
  await p.goto(`${APP}/#/cart`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(2500);
  await shot(p, '05-cart-lines');
  await p.evaluate(() => Object.keys(localStorage).filter(k => /expatCartItems/i.test(k))
    .forEach(k => localStorage.removeItem(k)));   // RO cleanup of OUR OWN key

  // images: reload, swipe gallery, slow full scroll
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
  console.log(V, 'images:', JSON.stringify(out.images), 'seen:', Object.keys(imgs).length);
  if (out.images.failed > 0) out.failures.push(`[${V}] ${out.images.failed} image request(s) failed`);
  if (out.images.ok < out.images_requested) out.notes.push(`[${V}] images ok=${out.images.ok}/${out.images_requested}`);
  await shot(p, '06-final-bottom');
  out.clickRequests = clicksSeen.length;

  await lib.closeVideo(ctx, `${VID}/AU-016-${V}.webm`);
  await browser.close();
  fs.writeFileSync(`/tmp/au016-final-${V}.json`, JSON.stringify(out, null, 1));
  console.log('RESULT ' + V, JSON.stringify({ v: V, failures: out.failures, notes: out.notes,
    asserts: out.asserts, images: out.images, ratePeriod: out.ratePeriod,
    totalLineGrew: out.totalLineGrew, twoLines: out.twoLines }));
})();
