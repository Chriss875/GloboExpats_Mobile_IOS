// au038_probe_scroll.js — scroll probe: are the Confirm availability / Can't fulfil
// buttons rendered below the fold on the ASC detail? Dump buttons before/after scroll.
const L = require('./lib_verify.js');
const fs = require('fs');
const fx = JSON.parse(fs.readFileSync('/tmp/au038_fixtures.json', 'utf8'));
(async () => {
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9112/login', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Welcome back', 30000);
  const ei = p.locator('input[type="text"]').first(); const pi = p.locator('input[type="password"]').first();
  await ei.click({ force: true }); await p.waitForTimeout(300); await p.keyboard.type(fx.seller.email);
  await pi.click({ force: true }); await p.waitForTimeout(300); await p.keyboard.type(fx.seller.pw);
  await L.clickBtn(p, 'Log in');
  let ok = false; for (let i = 0; i < 30 && !ok; i++) { ok = await L.isLoggedIn(p); if (!ok) await p.waitForTimeout(1000); }
  console.log('login', ok);
  await p.goto('http://localhost:9112/orders/' + fx.D.orderId, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(5000);
  const dump = async (tag) => {
    const btns = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        const role = e.getAttribute('role');
        if (role !== 'button') return;
        const r = e.getBoundingClientRect();
        out.push({ label: (e.textContent || '').trim().slice(0, 40), y: Math.round(r.y), h: Math.round(r.height), vis: r.bottom > 0 && r.top < innerHeight });
      });
      return out;
    });
    console.log(tag, JSON.stringify(btns));
  };
  await dump('at-top:');
  await p.mouse.move(190, 350);
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 300); await p.waitForTimeout(250); }
  await p.waitForTimeout(800);
  await dump('after-scroll:');
  const T = await L.allText(p);
  console.log('hasConfirmLabel:', T.includes('Confirm availability'), 'hasDecline:', T.includes("Can't fulfil"));
  await p.screenshot({ path: 'e2e/shots/AU-038/AU-038-mobile-03-gate-actions-scrolled.png' }).catch(() => {});
  await ctx.close(); await browser.close();
})().catch(e => console.error('FATAL', e.message));
