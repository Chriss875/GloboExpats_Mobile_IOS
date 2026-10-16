// probe19: UI short-message (5 chars) -> client validator must block (no POST).
// Dump the a11y text right after clicking Send to see the error string.
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  let fired = false;
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  p.on('request', r => { if (/contact\/submit/.test(r.url())) fired = true; });
  await p.goto(APP + '/#/contact', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Contact us', 40000);
  await p.waitForTimeout(3500);
  async function setByAria(label, val) {
    const loc = p.locator(`[aria-label="${label}"]`).first();
    await loc.click({ force: true }); await p.waitForTimeout(450);
    await p.keyboard.press('Control+a'); await p.waitForTimeout(140);
    await p.keyboard.type(val, { delay: 8 }); await p.waitForTimeout(350);
    console.log(label, '=', await loc.inputValue().catch(() => 'ERR'));
  }
  await setByAria('Your name', 'AU062R14 ShortMsg');
  await setByAria('Email address', 'au062r14@example.com');
  await setByAria('Subject', 'short msg test');
  const ta = p.locator('textarea').first();
  await ta.click({ force: true }); await p.waitForTimeout(400);
  await p.keyboard.type('short', { delay: 10 }); await p.waitForTimeout(300);
  console.log('Message =', await ta.inputValue());
  const rb = p.locator('flt-semantics[role="button"]', { hasText: 'Reason' }).first();
  await rb.click({ force: true }); await p.waitForTimeout(1000);
  const otherRect = await p.evaluate(() => {
    let hit = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if ((e.textContent || '').trim() !== 'Other') return;
      const bb = e.getBoundingClientRect();
      if (bb.width > 5 && !hit) hit = [Math.round(bb.x), Math.round(bb.y), Math.round(bb.width), Math.round(bb.height)];
    });
    return hit;
  });
  console.log('otherRect', otherRect);
  if (otherRect) { await p.mouse.click(otherRect[0] + otherRect[2] / 2, otherRect[1] + otherRect[3] / 2); await p.waitForTimeout(800); }
  const before = fired;
  await p.locator('flt-semantics[role="button"]', { hasText: 'Send message' }).first().click({ force: true }).catch(() => {});
  await p.waitForTimeout(3000);
  const T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('POST-fired?', before, '->', fired);
  console.log('SNIPPET:', JSON.stringify(T.slice(0, 500)));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
