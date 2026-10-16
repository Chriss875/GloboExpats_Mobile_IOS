// A4 diag3: reproduce the EXACT skeptic A4 flow (page.goto reload between submits)
// to find why 0 posts happened there — likely the reason pick failed after goto.
const L = require('./lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const MARK = 'A4D3' + Math.floor(Math.random() * 900000 + 100000);
  async function tapText(p, lbl) {
    const cands = await p.evaluate((lbl) => {
      const out = []; const vh = innerHeight;
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim(); if (!t.includes(lbl)) return;
        if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
        const r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > vh) return;
        out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height });
      });
      out.sort((a, b) => a.area - b.area); return out.slice(0, 4);
    }, lbl);
    if (!cands.length) return false;
    await p.mouse.click(cands[0].cx, cands[0].cy); await p.waitForTimeout(500); return true;
  }
  const browser = await L.newBrowser();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  // replicate skeptic: login on home
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
  // THE SUSPECT LINE: page.goto('/#/contact') — a FULL RELOAD while already at '/'
  await page.goto(APP + '/#/contact', { waitUntil: 'load' }).catch(() => {});
  const sawForm = await L.waitText(page, 'Contact us', 20000).catch(() => false);
  console.log('form seen after goto-reload?', !!sawForm);
  await page.waitForTimeout(2500);
  let T = await page.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('has Send message?', T.includes('Send message'), '| has Reason?', T.includes('Reason'));
  console.log('inputs:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('input,textarea')].map(i => i.getAttribute('aria-label')))));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
