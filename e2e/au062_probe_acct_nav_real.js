// probe43: after login, click bottom-nav Account via its tab node (role=tab?) then dump view.
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 40000);
  if (!(await L.isLoggedIn(p))) {
    // header login
    const hdrLogin = await p.evaluate(() => {
      let hit = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        if (t !== 'Login') return;
        const bb = e.getBoundingClientRect();
        if (bb.y < 200 && bb.width > 5 && !hit) hit = [Math.round(bb.x), Math.round(bb.y), Math.round(bb.width), Math.round(bb.height)];
      });
      return hit;
    });
    if (hdrLogin) await p.mouse.click(hdrLogin[0] + hdrLogin[2] / 2, hdrLogin[1] + hdrLogin[3] / 2);
    else await L.clickBtn(p, 'Login');
    await L.waitText(p, 'Welcome back', 20000);
    const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }); await p.waitForTimeout(300);
    await p.keyboard.type('mobile.test.20260820@gmail.com', { delay: 6 });
    const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }); await p.waitForTimeout(300);
    await p.keyboard.type('StrongPass!1', { delay: 6 });
    await L.clickBtn(p, 'Log in');
    for (let i = 0; i < 25; i++) { if (await L.isLoggedIn(p)) break; await p.waitForTimeout(800); }
  }
  console.log('token?', await L.isLoggedIn(p));
  // list all nodes containing 'Account'
  const acctNodes = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .map((e, i) => ({ i, t: (e.textContent || '').trim().slice(0, 40), role: e.getAttribute('role'), r: (() => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; })() }))
    .filter(n => n.t.startsWith('Account')));
  console.log('ACCOUNT NODES:', JSON.stringify(acctNodes));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
