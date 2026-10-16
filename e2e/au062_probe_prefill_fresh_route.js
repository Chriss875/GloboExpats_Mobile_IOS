// probe56: prove the const-reuse hypothesis — after login, navigate /contact via a
// DIFFERENT route entry (push) so a fresh widget builds: use browser back/forward or
// go to '/contact' FIRST TIME EVER in this session AFTER login (fresh context, no
// prior contact visit, login done, then single hash change).
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
  // verify store has email: account tab shows it
  const r = await p.evaluate(() => {
    let hit = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if ((e.textContent || '').trim() !== 'Account\nTab 5 of 5') return;
      const bb = e.getBoundingClientRect(); hit = [bb.x, bb.y, bb.width, bb.height];
    });
    return hit;
  });
  if (r) await p.mouse.click(r[0] + r[2] / 2, r[1] + r[3] / 2);
  await p.waitForTimeout(2200);
  let T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('email visible on account?', T.includes('mobile.test.20260820@gmail.com'));
  // FIRST-EVER navigation to /contact in this session
  await p.evaluate(() => { window.location.hash = '/contact'; });
  await L.waitText(p, 'Contact us', 15000).catch(() => {});
  await p.waitForTimeout(3500);
  const vals = await p.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ a: i.getAttribute('aria-label'), v: i.value })));
  console.log('FIRST-CONTACT FIELDS:', JSON.stringify(vals));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
