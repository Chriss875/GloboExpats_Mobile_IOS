// probe11: signed-in user submits contact -> does backend attach user_id (JWT)?
// Login via API, inject token into localStorage, cold-load /contact, submit with
// a real token and check contact_messages.user_id in DB.
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const MARK = 'AU062R14SG' + Math.floor(Math.random() * 900000 + 100000);
  const token = await L.apiLogin();
  let post = null; let authHeader = null;
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.addInitScript((t) => {
    localStorage.setItem('flutter.auth_token', JSON.stringify(t));
    localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com'));
  }, token);
  p.on('request', r => {
    if (/\/api\/v1\/contact\/submit/.test(r.url())) {
      authHeader = r.headers()['authorization'] || null;
      try { post = JSON.parse(r.postData() || '{}'); } catch (e) {}
    }
  });
  let status = null;
  p.on('response', r => { if (/contact\/submit/.test(r.url())) status = r.status(); });
  await p.goto(APP + '/#/contact', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Contact us', 40000).catch(() => {});
  await p.waitForTimeout(3000);
  async function setByAria(label, val) {
    const loc = p.locator(`[aria-label="${label}"]`).first();
    await loc.click({ force: true }); await p.waitForTimeout(250);
    await p.keyboard.press('Control+a'); await p.waitForTimeout(80);
    await p.keyboard.type(val, { delay: 5 }); await p.waitForTimeout(150);
  }
  await setByAria('Your name', `AU062R14 Signed ${MARK}`);
  // leave email EMPTY on purpose? No — validation requires it. Use account email.
  await setByAria('Email address', 'mobile.test.20260820@gmail.com');
  await setByAria('Subject', `signed ${MARK}`);
  const ta = p.locator('textarea').first();
  await ta.click({ force: true }); await p.waitForTimeout(250);
  await p.keyboard.type(`Signed-in JWT attach test ${MARK}.`, { delay: 5 });
  const rb = p.locator('flt-semantics[role="button"]', { hasText: 'Reason' }).first();
  await rb.click({ force: true }); await p.waitForTimeout(700);
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
  if (otherNode) { await p.mouse.click(otherNode.cx, otherNode.cy); await p.waitForTimeout(600); }
  await p.locator('flt-semantics[role="button"]', { hasText: 'Send message' }).first().click({ force: true }).catch(() => {});
  let toast = null;
  for (let i = 0; i < 12; i++) { await p.waitForTimeout(600); toast = await L.hasSnackBar(p); if (toast.found) break; }
  console.log('POST:', JSON.stringify(post));
  console.log('AUTH-HEADER-SENT:', authHeader);
  console.log('STATUS:', status, 'TOAST:', JSON.stringify(toast));
  console.log('MARK:', MARK);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
