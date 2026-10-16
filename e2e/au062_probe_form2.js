// probe2: click Reason dropdown, dump menu options; also check email prefill value
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 40000);
  if (!(await L.isLoggedIn(p))) {
    await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 20000);
    const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }); await p.waitForTimeout(300);
    await p.keyboard.type('mobile.test.20260820@gmail.com', { delay: 6 });
    const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }); await p.waitForTimeout(300);
    await p.keyboard.type('StrongPass!1', { delay: 6 });
    await L.clickBtn(p, 'Log in');
    for (let i = 0; i < 25; i++) { if (await L.isLoggedIn(p)) break; await p.waitForTimeout(800); }
  }
  await p.evaluate(() => { window.location.hash = '/contact'; });
  await L.waitText(p, 'Contact us', 15000).catch(() => {});
  await p.waitForTimeout(2500);
  // email input value BEFORE any typing
  const emailVal0 = await p.evaluate(() => {
    const ins = [...document.querySelectorAll('input')];
    return ins.map(i => ({ aria: i.getAttribute('aria-label'), v: i.value }));
  });
  console.log('INPUTS-BEFORE:', JSON.stringify(emailVal0));
  // click the Reason button
  const rb = p.locator('flt-semantics[role="button"]', { hasText: 'Reason' }).first();
  await rb.click({ force: true });
  await p.waitForTimeout(900);
  let T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('AFTER-CLICK-REASON text contains Buying?', T.includes('Buying'), '| Selling?', T.includes('Selling'));
  const opts = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => ({ t: (e.textContent || '').trim(), r: (() => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; })(), role: e.getAttribute('role') })).filter(s => s.t && s.r[1] >= 0 && s.r[1] < innerHeight));
  console.log('VISIBLE-NODES:', JSON.stringify(opts, null, 1).slice(0, 2500));
  // try clicking "Other" option if present
  const otherNode = await p.evaluate(() => {
    let hit = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (hit) return;
      const t = (e.textContent || '').trim();
      if (/^Other$/.test(t) || t === 'Other') {
        const b = e.getBoundingClientRect();
        if (b.width > 5 && b.height > 5 && b.bottom > 0 && b.top < innerHeight)
          hit = { cx: Math.round(b.x + b.width / 2), cy: Math.round(b.y + b.height / 2) };
      }
    });
    return hit;
  });
  console.log('OTHER-OPTION-NODE:', otherNode);
  if (otherNode) { await p.mouse.click(otherNode.cx, otherNode.cy); await p.waitForTimeout(700); }
  T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('AFTER-PICK-OTHER still-open-menu-has-Other?', T.includes('Other'));
  const emailVal1 = await p.evaluate(() => {
    const ins = [...document.querySelectorAll('input')];
    return ins.map(i => ({ aria: i.getAttribute('aria-label'), v: i.value }));
  });
  console.log('INPUTS-AFTER:', JSON.stringify(emailVal1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
