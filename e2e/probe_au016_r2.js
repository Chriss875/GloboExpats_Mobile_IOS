// Diagnostic: what does the app do after Buy now with no dates? Where is the snackbar?
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP = 'http://localhost:9108';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: null });
  const p = await ctx.newPage(); p.setDefaultTimeout(25000);
  p.on('console', m => console.log('PAGE:', (m.text() || '').slice(0, 200)));
  p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
  // login
  await p.goto(`${APP}/#/login`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  if (!(await lib.isLoggedIn(p))) {
    await lib.waitText(p, 'Welcome back', 30000);
    const ei = p.locator('input[type="text"]').first(), pi = p.locator('input[type="password"]').first();
    await ei.click({ force: true }); await p.waitForTimeout(350); await p.keyboard.type(lib.BUYER.email);
    await pi.click({ force: true }); await p.waitForTimeout(350); await p.keyboard.type(lib.BUYER.pw);
    await lib.clickBtn(p, 'Log in');
    let ok = false; for (let i = 0; i < 30 && !ok; i++) { ok = await lib.isLoggedIn(p); if (!ok) await p.waitForTimeout(1000); }
    console.log('login', ok);
  }
  await p.goto(`${APP}/#/product/470`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await lib.waitText(p, 'Modern Business Stay Apartment', 40000); await sleep(2000);

  async function tapExact(label) {
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
    if (!hit) { console.log('no node for', label); return false; }
    console.log('tap', label, 'at', Math.round(hit.cx), Math.round(hit.cy), 'area', Math.round(hit.area));
    await p.mouse.click(Math.round(hit.cx), Math.round(hit.cy));
    await sleep(700); return true;
  }
  // scroll to CTA
  for (let i = 0; i < 14; i++) {
    const vis = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
      .some(e => ((e.textContent || '').trim() === 'Buy now') &&
        (e.getBoundingClientRect().top > 0 && e.getBoundingClientRect().bottom < innerHeight)));
    if (vis) break;
    await p.mouse.move(180, 400); await p.mouse.wheel(0, 300); await sleep(240);
  }
  await tapExact('Buy now');
  // poll semantics every 400ms for 5s
  for (let i = 0; i < 12; i++) {
    const t = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
      .map(e => (e.textContent || '').trim()).filter(x => /rental|dates|Select/i.test(x)));
    if (t.length) { console.log('T+~' + (i * 0.4).toFixed(1) + 's', JSON.stringify(t.slice(0, 4))); break; }
    await sleep(400);
  }
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-016r2/diag-after-buynow.png' });
  // try Start date now
  await tapExact('Start date');
  for (let i = 0; i < 10; i++) {
    const hasCal = await p.evaluate(() => ['OK', 'CANCEL'].every(w =>
      [...document.querySelectorAll('flt-semantics[role="button"]')].some(e =>
        (e.textContent || '').trim().toUpperCase() === w)));
    if (hasCal) { console.log('CALENDAR OPEN'); break; }
    await sleep(400);
  }
  const dayHit = await p.evaluate(() => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const m = ((e.textContent || '').trim()).match(/^(\d{1,2}),\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/);
      if (!m) return;
      const r = e.getBoundingClientRect();
      if (r.width < 15 || r.height < 15) return;
      best = { t: (e.textContent||'').trim(), dis: e.getAttribute('aria-disabled'), cx: Math.round(r.x + r.width/2), cy: Math.round(r.y + r.height/2) };
    });
    return best;
  });
  console.log('day cell sample:', JSON.stringify(dayHit));
  if (dayHit) { await p.mouse.click(dayHit.cx, dayHit.cy); await sleep(600); }
  const okB = await p.evaluate(() => { let b = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if (/^OK$/i.test((e.textContent || '').trim())) { const r = e.getBoundingClientRect(); b = { cx: Math.round(r.x + r.width/2), cy: Math.round(r.y + r.height/2) }; } });
    return b; });
  console.log('OK btn', JSON.stringify(okB));
  if (okB) { await p.mouse.click(okB.cx, okB.cy); await sleep(900); }
  const after = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .map(e => (e.textContent || '').trim()).filter(x => /\d{1,2}\/\d{1,2}\/\d{4}|nights?|total/i.test(x)));
  console.log('after pick:', JSON.stringify(after.slice(0, 6)));
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-016r2/diag-after-pick.png' });
  await ctx.close(); await browser.close();
})();
