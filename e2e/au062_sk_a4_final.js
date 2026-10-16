// A4 final: exact skeptic flow + verbose — find where the double-tap diverges
const L = require('./lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const MARK = 'A4F' + Math.floor(Math.random() * 900000 + 100000);
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
  // skeptic A4 body
  await page.goto(APP + '/#/contact', { waitUntil: 'load' }).catch(() => {});
  await L.waitText(page, 'Contact us', 20000).catch(() => {}); await page.waitForTimeout(2500);
  async function setByAria(label, val) {
    const loc = page.locator(`[aria-label="${label}"]`).first();
    await loc.click({ force: true }); await page.waitForTimeout(400);
    await page.keyboard.press('Control+a'); await page.waitForTimeout(120);
    await page.keyboard.type(val, { delay: 8 }); await page.waitForTimeout(300);
    console.log(label, '=', await loc.inputValue().catch(() => 'ERR'));
  }
  await setByAria('Your name', `SK ${MARK}`);
  await setByAria('Email address', 'au062r14@example.com');
  await setByAria('Subject', `a4f ${MARK}`);
  const ta2 = page.locator('textarea').first();
  await ta2.click({ force: true }); await page.waitForTimeout(300);
  await page.keyboard.type(`Double tap submit test ${MARK}.`, { delay: 5 });
  console.log('Message =', await ta2.inputValue());
  const rb = page.locator('flt-semantics[role="button"]', { hasText: 'Reason' }).first();
  await rb.click({ force: true }); await page.waitForTimeout(1000);
  let rect = await page.evaluate(() => {
    let hit = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if ((e.textContent || '').trim() !== 'Other') return;
      const bb = e.getBoundingClientRect();
      if (bb.width > 5 && !hit) hit = [bb.x, bb.y, bb.width, bb.height];
    });
    return hit;
  });
  console.log('Other rect:', rect && [Math.round(rect[0]), Math.round(rect[1])]);
  if (rect) { await page.mouse.click(rect[0] + rect[2] / 2, rect[1] + rect[3] / 2); await page.waitForTimeout(700); }
  const T = await page.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('dropdown closed (no BuyingSelling)?', !T.includes('BuyingSellingDelivery'), '| Other in field?', T.includes('Reason\nOther') || T.includes('ReasonOther'));
  let posts = [];
  page.on('request', r => { if (/contact\/submit/.test(r.url())) posts.push(r.url()); });
  const t1 = await tapText(page, 'Send message');
  await page.waitForTimeout(150);
  const t2 = await tapText(page, 'Send message');
  console.log('tap1', t1, 'tap2', t2);
  await page.waitForTimeout(3500);
  console.log('posts:', posts.length);
  const { execSync } = require('child_process');
  const rows = execSync(`docker exec sandbox-db sh -c "psql -U \\$POSTGRES_USER -d \\$POSTGRES_DB -t -A -c \\"select count(*) from contact_messages where subject='a4f ${MARK}';\\""`, { encoding: 'utf8' }).trim();
  console.log('db rows:', rows);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
