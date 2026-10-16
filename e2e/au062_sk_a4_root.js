// A4 ROOT CAUSE: in the skeptic file the tapText helper is defined at module scope but
// pickReasonOther + tapText run AFTER page.goto RELOAD — check whether 'Send message'
// button node exists post-reload when skeptic's tapText runs (its rect filter uses
// r.bottom < 0 || r.top > vh with NO clamping of cy). Reproduce with logging.
const L = require('./lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const browser = await L.newBrowser();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(page, 'Buy now', 60000).catch(() => {});
  if (!(await L.isLoggedIn(page))) {
    await L.clickBtn(page, 'Login'); await L.waitText(page, 'Welcome back', 25000);
    const ei = page.locator('input[type="text"]').first(); await ei.click({ force: true }); await page.waitForTimeout(300);
    await page.keyboard.type('mobile.test.20260820@gmail.com', { delay: 6 });
    const pi = page.locator('input[type="password"]').first(); await pi.click({ force: true }); await page.waitForTimeout(300);
    await page.keyboard.type('StrongPass!1', { delay: 6 });
    await L.clickBtn(page, 'Log in');
    for (let i = 0; i < 25; i++) { if (await L.isLoggedIn(page)) break; await page.waitForTimeout(800); }
  }
  await page.goto(APP + '/#/contact', { waitUntil: 'load' }).catch(() => {});
  await L.waitText(page, 'Contact us', 20000).catch(() => {}); await page.waitForTimeout(2500);
  // find ALL nodes containing 'Send message' with rects
  const cands = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim(); if (!t.includes('Send message')) return;
      if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      out.push({ role: e.getAttribute('role'), tap: e.getAttribute('flt-tappable') !== null, cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height, w: Math.round(r.width) });
    });
    out.sort((a, b) => a.area - b.area); return out;
  });
  console.log('SEND-NODES:', JSON.stringify(cands));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
