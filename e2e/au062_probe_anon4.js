// probe16: anon full submit with generous waits after each field + value verification
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const MARK = 'AU062R14C4' + Math.floor(Math.random() * 900000 + 100000);
  let resp = null;
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  p.on('response', async r => {
    if (/contact\/submit/.test(r.url())) { let body=null; try{body=await r.json();}catch(e){} resp={status:r.status(),body}; }
  });
  await p.goto(APP + '/#/contact', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Contact us', 40000);
  await p.waitForTimeout(3500);
  async function setByAria(label, val) {
    const loc = p.locator(`[aria-label="${label}"]`).first();
    await loc.click({ force: true }); await p.waitForTimeout(500);
    await p.keyboard.press('Control+a'); await p.waitForTimeout(150);
    await p.keyboard.type(val, { delay: 10 }); await p.waitForTimeout(400);
    const v = await loc.inputValue().catch(() => 'ERR');
    console.log('set', label, '->', v === val ? 'OK' : `MISMATCH(${v})`);
    return v === val;
  }
  const ok1 = await setByAria('Your name', `AU062R14 Anon4 ${MARK}`);
  const ok2 = await setByAria('Email address', 'au062r14@example.com');
  const ok3 = await setByAria('Subject', `anon4 ${MARK}`);
  const ta = p.locator('textarea').first();
  await ta.click({ force: true }); await p.waitForTimeout(400);
  await p.keyboard.type(`Anonymous contact submit test ${MARK}.`, { delay: 8 });
  await p.waitForTimeout(300);
  console.log('msg ok:', (await ta.inputValue()).length > 20);
  const rb = p.locator('flt-semantics[role="button"]', { hasText: 'Reason' }).first();
  await rb.click({ force: true }); await p.waitForTimeout(1000);
  // click Other via coordinates from a fresh rect query
  const otherRect = await p.evaluate(() => {
    let hit = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if ((e.textContent || '').trim() !== 'Other') return;
      const bb = e.getBoundingClientRect();
      if (bb.width > 5 && !hit) hit = [Math.round(bb.x), Math.round(bb.y), Math.round(bb.width), Math.round(bb.height)];
    });
    return hit;
  });
  console.log('otherRect:', otherRect);
  if (otherRect) { await p.mouse.click(otherRect[0] + otherRect[2] / 2, otherRect[1] + otherRect[3] / 2); await p.waitForTimeout(800); }
  // verify dropdown closed & reason chosen
  const T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('dropdown closed:', !T.includes('BuyingSellingDelivery'));
  await p.locator('flt-semantics[role="button"]', { hasText: 'Send message' }).first().click({ force: true }).catch(() => {});
  for (let i = 0; i < 15; i++) { await p.waitForTimeout(600); if (resp) break; }
  console.log('RESP:', JSON.stringify(resp));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
