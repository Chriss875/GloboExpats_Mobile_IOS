// SKEPTIC AU-016 — Appendix B attack battery against the PASS claim.
// Frozen lane :9108 (sha 16b9b33, mtime Mon, 24 Aug 2026 00:36:38 GMT). RO lane: only
// the test account's own cart key is touched and restored afterwards.
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP = 'http://localhost:9108'; // FROZEN lane under test (never :9100)
const SHOTS = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-016-skeptic';
const fs = require('fs'); fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = {}; // results

async function txt(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '').trim()).join('\n')); }
async function cart(p) {
  return p.evaluate(() => { try { return JSON.parse(localStorage.getItem('expatCartItems_mobile.test.20260820@gmail.com') || '[]'); } catch (e) { return ['PARSE_ERR']; } });
}
// smallest-node exact-text tapper (probe_au016_r2 recipe — proven on this bundle)
async function tapExact(p, label, opts = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const hit = await p.evaluate((lbl) => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        if (t !== lbl && !t.startsWith(lbl + '\n')) return;
        const r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return;
        if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return;
        if (!best || r.width * r.height < best.area) best = { area: r.width * r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
      }); return best;
    }, label);
    if (hit) { await p.mouse.click(Math.round(hit.cx), Math.round(hit.cy)); await sleep(opts.wait || 700); return true; }
    await p.mouse.move(183, 380); await p.mouse.wheel(0, opts.wheel ?? 280); await sleep(260);
  }
  return false;
}
async function calOpen(p) {
  for (let i = 0; i < 10; i++) {
    if (await p.evaluate(() => ['OK', 'CANCEL'].every(w => [...document.querySelectorAll('flt-semantics[role="button"]')].some(e => (e.textContent || '').trim().toUpperCase() === w)))) return true;
    await sleep(350);
  } return false;
}
async function okBtn(p) {
  return p.evaluate(() => { let b = null; document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
    if (/^OK$/i.test((e.textContent || '').trim())) { const r = e.getBoundingClientRect(); b = { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; } }); return b; });
}
// pick a specific day-of-month in the currently shown month grid
async function pickDay(p, dom) {
  const hit = await p.evaluate((d) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      const m = t.match(new RegExp('^(' + d + '),\\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)'));
      if (!m) return;
      const r = e.getBoundingClientRect();
      if (r.width < 15 || r.height < 15 || e.getAttribute('aria-disabled') === 'true') return;
      if (r.bottom <= 0 || r.top >= innerHeight) return;
      if (!best || r.width * r.height < best.area) best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), t };
    }); return best;
  }, dom);
  if (!hit) return false;
  await p.mouse.click(hit.cx, hit.cy); await sleep(550);
  const ok = await okBtn(p); if (!ok) return false;
  await p.mouse.click(Math.round(ok.cx), Math.round(ok.cy)); await sleep(1400); return true;
}
function panelState(t) {
  return {
    startLbl: /Start date/.test(t) ? 'Start date' : (t.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || []).join(','),
    hasTotalLine: /\d+\s+(nights?|days?|weeks?|months?)\s*(·|•|-)?\s*/i.test(t) && /total/i.test(t),
    totalSnip: (t.match(/.*total[^\n]*/gi) || []).slice(-2),
    nightsSnip: (t.match(/[^\n]*nights?[^\n]*/gi) || []).slice(0, 3),
    qtyStepper: /Quantity/.test(t),
  };
}

(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-016-skeptic-375.webm' });
  ctx.setDefaultTimeout && ctx.setDefaultTimeout(25000);
  const p = await ctx.newPage(); p.setDefaultTimeout(25000);
  const imgs = lib.watchImages(p);
  let dialogs = []; p.on('dialog', d => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  const origCart = await (await (async () => { const q = await ctx.newPage(); await q.goto(APP + '/#/login', { waitUntil: 'domcontentloaded' }).catch(() => {}); const v = await q.evaluate(() => localStorage.getItem('expatCartItems_mobile.test.20260820@gmail.com')); await q.close(); return v; })());
  console.log('ORIG_CART:', String(origCart).slice(0, 200));

  // ---------- setup: login + open fixture 470 ----------
  await p.goto(`${APP}/#/login`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(2500);
  let logged = await lib.isLoggedIn(p).catch(() => false);
  if (!logged) {
    await lib.waitText(p, 'Welcome back', 30000);
    const ei = p.locator('input[type="text"]').first(), pi = p.locator('input[type="password"]').first();
    await ei.click({ force: true }); await p.waitForTimeout(400); await p.keyboard.type(lib.BUYER.email);
    await pi.click({ force: true }); await p.waitForTimeout(400); await p.keyboard.type(lib.BUYER.pw);
    await lib.clickBtn(p, 'Log in');
    for (let i = 0; i < 30 && !logged; i++) { logged = await lib.isLoggedIn(p).catch(() => false); if (!logged) await p.waitForTimeout(1000); }
  }
  console.log('LOGIN:', logged);
  await p.goto(`${APP}/#/product/470`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  console.log('DETAIL_LOADED:', await lib.waitText(p, 'Modern Business Stay Apartment', 45000));
  await sleep(2500);

  // ---------- ATTACK 1+2: two-phase date picks, both orders ----------
  for (const order of ['start_then_end', 'end_then_start']) {
    // reload for clean state
    await p.goto(`${APP}/#/product/470`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await lib.waitText(p, 'Modern Business Stay Apartment', 45000); await sleep(2200);
    const first = order.startsWith('start') ? 'Start date' : 'End date';
    const second = order.startsWith('start') ? 'End date' : 'Start date';
    const opened = await tapExact(p, first, { wheel: 300 });
    const open1 = opened ? await calOpen(p) : false;
    const day1ok = open1 ? await pickDay(p, 26) : false;   // Aug 26
    const shot1 = `${SHOTS}/atk-${order}-after-first-pick.png`;
    await p.screenshot({ path: shot1 });
    const t1 = panelState(await txt(p));
    const opened2 = await tapExact(p, second, { wheel: 300 });
    const open2 = opened2 ? await calOpen(p) : false;
    const day2ok = open2 ? await pickDay(p, 28) : false;   // Aug 28 -> 2 nights
    const shot2 = `${SHOTS}/atk-${order}-after-second-pick.png`;
    await p.screenshot({ path: shot2 });
    const t2raw = await txt(p); const t2 = panelState(t2raw);
    R[`attack_${order}`] = { openedFirst: opened, cal1: open1, picked1: day1ok, afterFirst: t1,
      openedSecond: opened2, cal2: open2, picked2: day2ok, afterBoth: t2,
      rateChip: /FOR RENT/.test(t2raw) && /per night/.test(t2raw),
      shots: [shot1, shot2] };
    console.log(`ATTACK ${order}:`, JSON.stringify(R[`attack_${order}`]));
  }

  // ---------- ATTACK 2b: with a (failed) range attempt, hammer Add to cart ----------
  await tapExact(p, 'Add to cart', { wait: 500 });
  await p.screenshot({ path: `${SHOTS}/atk-addcart-no-dates.png` });
  await sleep(400);
  await tapExact(p, 'Add to cart', { wait: 500 });
  const cAfterAdd = await cart(p);
  R.attack_addcart_no_dates = { cartLines: cAfterAdd.length, cart: cAfterAdd.slice(0, 2).map(l => l.lineId || JSON.stringify(l).slice(0, 80)) };
  console.log('ATTACK addcart-no-dates:', JSON.stringify(R.attack_addcart_no_dates));

  // ---------- ATTACK 3: rapid double-tap Buy now x3 ----------
  for (let i = 0; i < 3; i++) { await tapExact(p, 'Buy now', { wait: 120 }); }
  await sleep(800);
  const tRapid = await txt(p);
  await p.screenshot({ path: `${SHOTS}/atk-rapid-buynow.png` });
  R.attack_rapid_tap = { stillOnDetail: /Modern Business Stay Apartment/.test(tRapid), crashed: dialogs.length > 0, dialogs: dialogs.slice(0, 3) };
  console.log('ATTACK rapid:', JSON.stringify(R.attack_rapid_tap));

  // ---------- ATTACK 4: offline mid-request + retry ----------
  await p.goto(`${APP}/#/product/470`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await lib.waitText(p, 'Modern Business Stay Apartment', 45000); await sleep(1500);
  await ctx.setOffline(true);
  await p.reload({ waitUntil: 'load', timeout: 30000 }).catch(() => {});
  await sleep(2500);
  const tOff = await txt(p);
  await p.screenshot({ path: `${SHOTS}/atk-offline-reload.png` });
  const offBlank = tOff.trim().length < 40;
  await ctx.setOffline(false);
  await p.reload({ waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await lib.waitText(p, 'Modern Business Stay Apartment', 45000).catch(() => {}); await sleep(1800);
  const tBack = await txt(p);
  R.attack_offline = { offline_blank_or_error: offBlank, offline_snip: tOff.trim().slice(0, 160).replace(/\n+/g, ' | '),
    recovered: /Modern Business Stay Apartment/.test(tBack) };
  console.log('ATTACK offline:', JSON.stringify(R.attack_offline));

  // ---------- ATTACK 5: invalid input — hostile deep links ----------
  const hostile = [
    ['#%2Fproduct%2F470%3Cscript%3Ealert(1)%3C%2Fscript%3E', 'script-tag-id'],
    ['#/product/99999999999999999999', 'huge-id'],
    ['#/product/%F0%9F%8F%A0', 'emoji-id'],
    ['#/product/-1', 'negative-id'],
  ];
  R.attack_invalid_input = [];
  for (const [frag, name] of hostile) {
    await p.goto(`${APP}/${frag}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await sleep(2600);
    const t = await txt(p);
    const shot = `${SHOTS}/atk-invalid-${name}.png`;
    await p.screenshot({ path: shot });
    const st = { name, dialogFired: dialogs.length > 0, blank: t.trim().length < 30,
      notFoundCopy: /not found|Product not found/i.test(t), errSnip: t.trim().slice(0, 110).replace(/\n+/g, ' | ') };
    R.attack_invalid_input.push(st); console.log('INVALID', name, JSON.stringify(st));
    if (dialogs.length) break;
  }

  // ---------- ATTACK 6: session expiry mid-flow ----------
  await p.evaluate(() => localStorage.setItem('flutter.auth_token', 'EXPIRED.GARBAGE.TOKEN'));
  await p.goto(`${APP}/#/product/470`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await sleep(3000);
  const tExp = await txt(p);
  await tapExact(p, 'Add to cart', { wait: 700 }).catch(() => {});
  await p.screenshot({ path: `${SHOTS}/atk-expired-token.png` });
  const cExp = await cart(p);
  R.attack_expired_token = { detailLoaded: /Modern Business Stay Apartment/.test(tExp), rateChip: /per night/.test(tExp),
    ctaPresent: /Buy now/.test(tExp), cartLines: cExp.length };
  // restore real session for later checks
  await p.evaluate(tok => localStorage.setItem('flutter.auth_token', tok), '');
  console.log('ATTACK expired-token:', JSON.stringify(R.attack_expired_token));

  // ---------- ATTACK 7: role probe — anonymous visitor ----------
  const ctx2 = await lib.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const pa = await ctx2.newPage(); pa.setDefaultTimeout(25000);
  await pa.goto(`${APP}/#/product/470`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(4000);
  const tAnon = await txt(pa);
  await pa.screenshot({ path: `${SHOTS}/atk-anon-detail.png` });
  R.attack_anon = { loaded: /Modern Business Stay Apartment/.test(tAnon), rateChip: /FOR RENT/.test(tAnon) && /per night/.test(tAnon),
    rentalPanel: /Start date/.test(tAnon), buyNow: /Buy now/.test(tAnon), addToCart: /Add to cart/.test(tAnon),
    seeOnMap: /See on map/i.test(tAnon), bookNow: /Book now/i.test(tAnon) };
  console.log('ATTACK anon:', JSON.stringify(R.attack_anon));
  await ctx2.close();

  // ---------- ATTACK 8: locale/number formats vs API truth ----------
  const api = await fetch('http://localhost:8083/api/v1/displayItem/itemDetails/470').then(r => r.json()).catch(() => null);
  const d = api && ((api.data || api));
  const price = d ? (d.askingPrice ?? d.price ?? null) : null;
  const tLoc = await (async () => { await p.goto(`${APP}/#/product/470`, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await lib.waitText(p, 'Modern Business Stay Apartment', 45000).catch(() => {}); await sleep(2000); return txt(p); })();
  const priceStr = price != null ? String(Math.round(Number(price))) : '';
  const grouped = priceStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  R.attack_formats = { apiPrice: price, expectedGrouped: `TSh ${grouped}`, renderedHasGrouped: tLoc.includes(`TSh ${grouped}`),
    rawUnformattedLeak: priceStr.length > 3 && tLoc.includes('TSh ' + priceStr.replace(/,/g, '') + '\n') && !tLoc.includes(grouped),
    viewsFmt: (tLoc.match(/[^\n]*total views[^\n]*/i) || [''])[0].slice(0, 60) };
  console.log('FORMATS:', JSON.stringify(R.attack_formats));

  // ---------- ATTACK 9: second FOR_RENT fixture 623 — is the deadlock general? ----------
  await p.goto(`${APP}/#/product/623`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await lib.waitText(p, 'Samia apartments', 45000).catch(() => {}); await sleep(2200);
  const o1 = await tapExact(p, 'Start date', { wheel: 300 }); const c1 = o1 ? await calOpen(p) : false;
  const d1 = c1 ? await pickDay(p, 26) : false;
  const o2 = await tapExact(p, 'End date', { wheel: 300 }); const c2 = o2 ? await calOpen(p) : false;
  const d2 = c2 ? await pickDay(p, 29) : false;
  const t623 = panelState(await txt(p));
  await p.screenshot({ path: `${SHOTS}/atk-623-two-phase.png` });
  R.attack_623 = { cal1: c1, cal2: c2, afterBoth: t623 };
  console.log('ATTACK 623:', JSON.stringify(R.attack_623));

  // ---------- images sweep incl. lazy gallery ----------
  const sum = lib.imageSummary(imgs);
  R.images = sum;

  fs.writeFileSync(`${SHOTS}/skeptic-results.json`, JSON.stringify(R, null, 2));
  console.log('IMAGES:', JSON.stringify(sum));
  console.log('DONE');
  await lib.closeVideo(ctx, '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-016-skeptic-375.webm');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
