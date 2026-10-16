// A4 diagnostic: why did the double-tap submit produce 0 posts? (validation? reason not picked?)
const L = require('./lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const MARK = 'A4DIAG' + Math.floor(Math.random() * 900000 + 100000);
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
  async function setByAria(label, val) {
    const loc = page.locator(`[aria-label="${label}"]`).first();
    await loc.click({ force: true }); await page.waitForTimeout(400);
    await page.keyboard.press('Control+a'); await page.waitForTimeout(120);
    await page.keyboard.type(val, { delay: 8 }); await page.waitForTimeout(300);
    console.log(label, '=', await loc.inputValue().catch(() => 'ERR'));
  }
  await setByAria('Your name', `SK ${MARK}`);
  await setByAria('Email address', 'au062r14@example.com');
  await setByAria('Subject', `a4diag ${MARK}`);
  const ta2 = page.locator('textarea').first();
  await ta2.click({ force: true }); await page.waitForTimeout(300);
  await page.keyboard.type(`Double tap diag ${MARK}.`, { delay: 5 });
  console.log('Message =', await ta2.inputValue());
  // pick reason
  const rb = page.locator('flt-semantics[role="button"]', { hasText: 'Reason' }).first();
  await rb.click({ force: true }); await page.waitForTimeout(900);
  const rect = await page.evaluate(() => {
    let hit = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if ((e.textContent || '').trim() !== 'Other') return;
      const bb = e.getBoundingClientRect();
      if (bb.width > 5 && !hit) hit = [bb.x, bb.y, bb.width, bb.height];
    });
    return hit;
  });
  console.log('Other rect:', rect);
  if (rect) { await page.mouse.click(rect[0] + rect[2] / 2, rect[1] + rect[3] / 2); await page.waitForTimeout(700); }
  let posts = [];
  page.on('request', r => { if (/contact\/submit/.test(r.url())) posts.push(r.postData()); });
  // tap send twice quickly
  await tapText(page, 'Send message');
  await page.waitForTimeout(150);
  await tapText(page, 'Send message');
  await page.waitForTimeout(3500);
  console.log('posts fired:', posts.length);
  const { execSync } = require('child_process');
  const rows = execSync(`docker exec sandbox-db sh -c "psql -U \\$POSTGRES_USER -d \\$POSTGRES_DB -t -A -c \\"select count(*) from contact_messages where subject='a4diag ${MARK}';\\""`, { encoding: 'utf8' }).trim();
  console.log('db rows:', rows);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
