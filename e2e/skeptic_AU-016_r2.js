// SKEPTIC AU-016 round 2 — close loose ends: fixture 623 proper load, anon add-to-cart,
// expired-token view identity, tablet-viewport post-pick state, parity CTA labels.
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP = 'http://localhost:9108';
const SHOTS = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-016-skeptic';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '').trim()).join('\n')); }
async function tapExact(p, label, opts = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const hit = await p.evaluate((lbl) => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        if (t !== lbl && !t.startsWith(lbl + '\n')) return;
        const r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return;
        if (r.bottom <= 0 || r.top >= innerHeight) return;
        if (!best || r.width * r.height < best.area) best = { area: r.width * r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
      }); return best;
    }, label);
    if (hit) { await p.mouse.click(Math.round(hit.cx), Math.round(hit.cy)); await sleep(opts.wait || 700); return true; }
    await p.mouse.move(183, 380); await p.mouse.wheel(0, opts.wheel ?? 280); await sleep(240);
  }
  return false;
}
(async () => {
  const out = {};
  const browser = await lib.newBrowser();

  // ---- A: fixture 623 with CORRECT title anchor ----
  const ctxA = await lib.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const pa = await ctxA.newPage(); pa.setDefaultTimeout(25000);
  await pa.goto(`${APP}/#/login`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(2000);
  let logged = await lib.isLoggedIn(pa).catch(() => false);
  if (!logged) {
    await lib.waitText(pa, 'Welcome back', 30000);
    const ei = pa.locator('input[type="text"]').first(), pi = pa.locator('input[type="password"]').first();
    await ei.click({ force: true }); await pa.waitForTimeout(350); await pa.keyboard.type(lib.BUYER.email);
    await pi.click({ force: true }); await pa.waitForTimeout(350); await pa.keyboard.type(lib.BUYER.pw);
    await lib.clickBtn(pa, 'Log in');
    for (let i = 0; i < 30 && !logged; i++) { logged = await lib.isLoggedIn(pa).catch(() => false); if (!logged) await pa.waitForTimeout(1000); }
  }
  out.login = logged;
  await pa.goto(`${APP}/#/product/623`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  out.t623_loaded = await lib.waitText(pa, 'Kawe Beach', 45000);
  await sleep(2500);
  const t623 = await txt(pa);
  out.t623_rateChip = /FOR RENT/.test(t623) && /per night/.test(t623);
  out.t623_panel = /Start date/.test(t623);
  out.t623_priceSnip = (t623.match(/TSh[\d,]*/g) || []).slice(0, 3);
  out.t623_titleSnip = t623.slice(0, 150).replace(/\n+/g, ' | ');
  // two-phase pick on 623
  const s623 = await tapExact(pa, 'Start date', { wheel: 300 });
  let cal623 = false;
  for (let i = 0; i < 8 && !cal623; i++) cal623 = await pa.evaluate(() => ['OK', 'CANCEL'].every(w => [...document.querySelectorAll('flt-semantics[role="button"]')].some(e => (e.textContent || '').trim().toUpperCase() === w))).then(v => v || (sleep(350), v)).catch(() => false);
  out.t623_calOpened = !!cal623;
  if (cal623) {
    const dayHit = await pa.evaluate(() => { let b = null; document.querySelectorAll('flt-semantics').forEach(e => {
      const m = ((e.textContent || '').trim()).match(/^(26),\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/); if (!m) return;
      const r = e.getBoundingClientRect(); if (r.width < 15 || r.height < 15 || e.getAttribute('aria-disabled') === 'true') return;
      b = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) }; }); return b; });
    if (dayHit) { await pa.mouse.click(dayHit.cx, dayHit.cy); await sleep(550); }
    const okB = await pa.evaluate(() => { let b = null; document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if (/^OK$/i.test((e.textContent || '').trim())) { const r = e.getBoundingClientRect(); b = { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; } }); return b; });
    if (okB) { await pa.mouse.click(Math.round(okB.cx), Math.round(okB.cy)); await sleep(1400); }
    await tapExact(pa, 'End date', { wheel: 300 });
    const dayHit2 = await pa.evaluate(() => { let b = null; document.querySelectorAll('flt-semantics').forEach(e => {
      const m = ((e.textContent || '').trim()).match(/^(29),\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/); if (!m) return;
      const r = e.getBoundingClientRect(); if (r.width < 15 || r.height < 15 || e.getAttribute('aria-disabled') === 'true') return;
      b = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) }; }); return b; });
    if (dayHit2) { await pa.mouse.click(dayHit2.cx, dayHit2.cy); await sleep(550); }
    const okB2 = await pa.evaluate(() => { let b = null; document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if (/^OK$/i.test((e.textContent || '').trim())) { const r = e.getBoundingClientRect(); b = { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; } }); return b; });
    if (okB2) { await pa.mouse.click(Math.round(okB2.cx), Math.round(okB2.cy)); await sleep(1600); }
  }
  const t623b = await txt(pa);
  out.t623_afterPicks = { stillPlaceholderLabels: /Start date/.test(t623b) && /End date/.test(t623b),
    totalLine: /\d+\s*nights?\b[^\n]*total|total[^\n]*\d+\s*nights?/i.test(t623b),
    anyDateRendered: /\d{1,2}\/\d{1,2}\/\d{4}/.test(t623b) };
  await pa.screenshot({ path: `${SHOTS}/r2-623-after-picks.png` });

  // ---- B: expired-token view identity (what actually happens) ----
  await pa.evaluate(() => localStorage.setItem('flutter.auth_token', 'EXPIRED.GARBAGE.TOKEN'));
  await pa.goto(`${APP}/#/product/470`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await sleep(3500);
  const tExp = await txt(pa);
  out.expiredView = { urlAfter: pa.url(), hasLoginCta: /Log ?in|Login|Sign in|Welcome back/i.test(tExp),
    hasErrorCopy: /trouble|error|failed|not found/i.test(tExp), hasDetail: /Modern Business Stay/.test(tExp),
    snip: tExp.trim().slice(0, 130).replace(/\n+/g, ' | ') };
  await pa.screenshot({ path: `${SHOTS}/r2-expired-token-view.png` });
  await ctxA.close();

  // ---- C: anon add-to-cart (money-integrity probe) ----
  const ctxC = await lib.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const pc = await ctxC.newPage(); pc.setDefaultTimeout(25000);
  await pc.goto(`${APP}/#/product/470`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await lib.waitText(pc, 'Modern Business Stay Apartment', 45000).catch(() => {}); await sleep(2500);
  await pc.evaluate(() => localStorage.clear()); // force true anon
  await pc.reload({ waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await lib.waitText(pc, 'Modern Business Stay Apartment', 45000).catch(() => {}); await sleep(2500);
  const tapped = await tapExact(pc, 'Add to cart', { wheel: 300, wait: 1200 });
  await sleep(1200);
  const tAnonCart = await txt(pc);
  const anonKeys = await pc.evaluate(() => Object.keys(localStorage).filter(k => /cart/i.test(k)));
  const anonCartVal = await pc.evaluate(() => { try { return JSON.parse(localStorage.getItem('expatCartItems_') || localStorage.getItem('expatCartItems_null') || 'null'); } catch (e) { return 'RAW:' + String(localStorage.getItem('expatCartItems_')).slice(0, 80); } });
  out.anon_addToCart = { tapped, cartKeys: anonKeys, val: Array.isArray(anonCartVal) ? anonCartVal.length : anonCartVal,
    navChanged: !/Modern Business Stay/.test(tAnonCart), loginPromptShown: /log ?in|sign in|account/i.test(tAnonCart),
    snip: tAnonCart.trim().slice(0, 120).replace(/\n+/g, ' | ') };
  await pc.screenshot({ path: `${SHOTS}/r2-anon-addcart.png` });
  await ctxC.close();

  // ---- D: tablet viewport post-pick (deadlock generality across mandatory viewport) ----
  const ctxD = await lib.newCtx(browser, { viewport: { width: 768, height: 1024 } });
  const pd = await ctxD.newPage(); pd.setDefaultTimeout(25000);
  await pd.goto(`${APP}/#/login`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(2000);
  let lg2 = await lib.isLoggedIn(pd).catch(() => false);
  if (!lg2) {
    await lib.waitText(pd, 'Welcome back', 30000);
    const ei = pd.locator('input[type="text"]').first(), pi = pd.locator('input[type="password"]').first();
    await ei.click({ force: true }); await pd.waitForTimeout(350); await pd.keyboard.type(lib.BUYER.email);
    await pi.click({ force: true }); await pd.waitForTimeout(350); await pd.keyboard.type(lib.BUYER.pw);
    await lib.clickBtn(pd, 'Log in');
    for (let i = 0; i < 30 && !lg2; i++) { lg2 = await lib.isLoggedIn(pd).catch(() => false); if (!lg2) await pd.waitForTimeout(1000); }
  }
  await pd.goto(`${APP}/#/product/470`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await lib.waitText(pd, 'Modern Business Stay Apartment', 45000).catch(() => {}); await sleep(2500);
  const st768 = await tapExact(pd, 'Start date', { wheel: 400 });
  let cal768 = false;
  for (let i = 0; i < 10 && !cal768; i++) { cal768 = await pd.evaluate(() => ['OK', 'CANCEL'].every(w => [...document.querySelectorAll('flt-semantics[role="button"]')].some(e => (e.textContent || '').trim().toUpperCase() === w))); if (!cal768) await sleep(350); }
  if (cal768) {
    const dh = await pd.evaluate(() => { let b = null; document.querySelectorAll('flt-semantics').forEach(e => {
      const m = ((e.textContent || '').trim()).match(/^(26),\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/); if (!m) return;
      const r = e.getBoundingClientRect(); if (r.width < 15 || r.height < 15 || e.getAttribute('aria-disabled') === 'true') return;
      b = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) }; }); return b; });
    if (dh) { await pd.mouse.click(dh.cx, dh.cy); await sleep(550); }
    const ok = await pd.evaluate(() => { let b = null; document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if (/^OK$/i.test((e.textContent || '').trim())) { const r = e.getBoundingClientRect(); b = { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; } }); return b; });
    if (ok) { await pd.mouse.click(Math.round(ok.cx), Math.round(ok.cy)); await sleep(1500); }
  }
  const t768 = await txt(pd);
  out.tablet_afterPick = { cal768, labelStillStart: /Start date/.test(t768), anyDate: /\d{1,2}\/\d{1,2}\/\d{4}/.test(t768),
    totalLine: /\d+\s*nights?\b/i.test(t768), bookNow: /Book now/i.test(t768), seeOnMap: /See on map/i.test(t768) };
  await pd.screenshot({ path: `${SHOTS}/r2-tablet-after-pick.png` });
  await ctxD.close();

  console.log(JSON.stringify(out, null, 1));
  require('fs').writeFileSync(`${SHOTS}/skeptic-r2-results.json`, JSON.stringify(out, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
