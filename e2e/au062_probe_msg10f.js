// probe22: short message -> wait longer for the error text to paint (a11y tree)
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(APP + '/#/contact', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Contact us', 40000);
  await p.waitForTimeout(3000);
  async function setByAria(label, val) {
    const loc = p.locator(`[aria-label="${label}"]`).first();
    await loc.click({ force: true }); await p.waitForTimeout(400);
    await p.keyboard.press('Control+a'); await p.waitForTimeout(120);
    await p.keyboard.type(val, { delay: 8 }); await p.waitForTimeout(300);
  }
  await setByAria('Your name', 'AU062R14 ShortF');
  await setByAria('Email address', 'au062r14@example.com');
  await setByAria('Subject', 'short msg test f');
  const ta = p.locator('textarea').first();
  await ta.click({ force: true }); await p.waitForTimeout(350);
  await p.keyboard.type('short msg', { delay: 8 }); await p.waitForTimeout(250);   // 8 chars <10
  const rb = p.locator('flt-semantics[role="button"]', { hasText: 'Reason' }).first();
  await rb.click({ force: true }); await p.waitForTimeout(900);
  const otherRect = await p.evaluate(() => {
    let hit = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if ((e.textContent || '').trim() !== 'Other') return;
      const bb = e.getBoundingClientRect();
      if (bb.width > 5 && !hit) hit = [Math.round(bb.x), Math.round(bb.y), Math.round(bb.width), Math.round(bb.height)];
    });
    return hit;
  });
  if (otherRect) { await p.mouse.click(otherRect[0] + otherRect[2] / 2, otherRect[1] + otherRect[3] / 2); await p.waitForTimeout(700); }
  await p.locator('flt-semantics[role="button"]', { hasText: 'Send message' }).first().click({ force: true }).catch(() => {});
  // wait up to 12s for either the mapped error or fallback to appear
  let found = '';
  for (let i = 0; i < 24; i++) {
    await p.waitForTimeout(500);
    const T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
    if (T.includes('at least 10 characters')) { found = 'mapped:min10'; break; }
    if (T.includes('Could not send your message')) { found = 'fallback:could-not-send'; break; }
    if (T.includes('Something went wrong')) { found = 'other:something-went-wrong'; break; }
  }
  console.log('ERROR-UI:', found || 'NONE');
  await p.screenshot({ path: '/home/devsystemadmin/tmp_au062/probe22-error.png' });
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
