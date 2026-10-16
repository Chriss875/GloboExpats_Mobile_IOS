// probe3: full happy-path fill via aria-label inputs + dropdown option click by rect, submit,
// watch POST + toast; then check DB row.
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const MARK = 'AU062R14P3' + Math.floor(Math.random() * 900000 + 100000);
  let post = null;
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  p.on('request', r => { if (/\/api\/v1\/contact\/submit/.test(r.url())) { try { post = JSON.parse(r.postData() || '{}'); } catch (e) {} } });
  let postStatus = null;
  p.on('response', r => { if (/\/api\/v1\/contact\/submit/.test(r.url())) postStatus = r.status(); });
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
  console.log('logged', await L.isLoggedIn(p));
  await p.evaluate(() => { window.location.hash = '/contact'; });
  await L.waitText(p, 'Contact us', 15000).catch(() => {});
  await p.waitForTimeout(2500);

  async function setByAria(label, val) {
    const loc = p.locator(`[aria-label="${label}"]`).first();
    await loc.click({ force: true }); await p.waitForTimeout(300);
    await p.keyboard.press('Control+a'); await p.waitForTimeout(100);
    await p.keyboard.type(val, { delay: 6 }); await p.waitForTimeout(200);
    return p.locator(`[aria-label="${label}"]`).inputValue().catch(() => null);
  }
  console.log('name->', await setByAria('Your name', `AU062R14 Tester ${MARK}`));
  console.log('email->', await setByAria('Email address', 'au062r14@example.com'));
  console.log('subject->', await setByAria('Subject', `au062r14 subject ${MARK}`));
  // message is a textarea
  const ta = p.locator('textarea').first();
  await ta.click({ force: true }); await p.waitForTimeout(300);
  await p.keyboard.type(`AU-062 verifier real submit ${MARK}. Please disregard.`, { delay: 5 });
  console.log('message->', await ta.inputValue().catch(() => null));
  // reason dropdown
  const rb = p.locator('flt-semantics[role="button"]', { hasText: 'Reason' }).first();
  await rb.click({ force: true }); await p.waitForTimeout(800);
  const otherNode = await p.evaluate(() => {
    let hit = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if (hit) return;
      if ((e.textContent || '').trim() === 'Other') {
        const bb = e.getBoundingClientRect();
        if (bb.width > 5) hit = { cx: Math.round(bb.x + bb.width / 2), cy: Math.round(bb.y + bb.height / 2) };
      }
    });
    return hit;
  });
  console.log('other-node', otherNode);
  if (otherNode) { await p.mouse.click(otherNode.cx, otherNode.cy); await p.waitForTimeout(700); }
  // send
  await p.locator('flt-semantics[role="button"]', { hasText: 'Send message' }).first().click({ force: true }).catch(() => {});
  let toast = null;
  for (let i = 0; i < 12; i++) { await p.waitForTimeout(600); toast = await L.hasSnackBar(p); if (toast.found) break; }
  console.log('POST:', JSON.stringify(post));
  console.log('POST-STATUS:', postStatus);
  console.log('TOAST:', JSON.stringify(toast));
  await p.screenshot({ path: '/home/devsystemadmin/tmp_au062/probe3-toast.png' });
  const after = await p.evaluate(() => location.hash);
  console.log('HASH-AFTER:', after);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
