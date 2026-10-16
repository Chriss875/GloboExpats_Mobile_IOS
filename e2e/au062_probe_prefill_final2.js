// probe51: My account view IS showing the email (store.email set). Now tap "Help & about"
// ListTile in-app, then from HelpScreen deep-link /contact — check email prefill again.
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
  // account tab
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
  // scroll the account list to find Help & about and tap it
  let tapped = false;
  for (let s = 0; s < 4 && !tapped; s++) {
    tapped = await (async () => {
      const rr = await p.evaluate(() => {
        let hit = null;
        document.querySelectorAll('flt-semantics').forEach(e => {
          if (!(e.textContent || '').includes('Help & about')) return;
          const bb = e.getBoundingClientRect();
          if (bb.width > 100 && bb.height > 20 && bb.y > 40 && bb.y < innerHeight - 60 && !hit) hit = [bb.x, bb.y, bb.width, bb.height];
        });
        return hit;
      });
      if (rr) { await p.mouse.click(rr[0] + Math.min(rr[2] / 2, 120), rr[1] + rr[3] / 2); return true; }
      await p.mouse.move(188, 400); await p.mouse.wheel(0, -160); await p.waitForTimeout(500);
      return false;
    })();
  }
  console.log('help&about tapped?', tapped);
  await p.waitForTimeout(2000);
  let T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('help screen?', T.includes("Tanzania's expat marketplace"));
  // contact
  await p.evaluate(() => { window.location.hash = '/contact'; });
  await L.waitText(p, 'Contact us', 15000).catch(() => {});
  await p.waitForTimeout(3500);
  const vals = await p.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ a: i.getAttribute('aria-label'), v: i.value })));
  console.log('FIELDS:', JSON.stringify(vals));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
