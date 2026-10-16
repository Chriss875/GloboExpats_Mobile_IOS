// probe13: ANONYMOUS submit (logged-out context) — must still 201 (public endpoint).
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const MARK = 'AU062R14AN' + Math.floor(Math.random() * 900000 + 100000);
  let resp = null;
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  p.on('response', async r => {
    if (/contact\/submit/.test(r.url())) { let body=null; try{body=await r.json();}catch(e){} resp={status:r.status(),body}; }
  });
  await p.goto(APP + '/#/contact', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Contact us', 40000).catch(() => {});
  await p.waitForTimeout(3000);
  console.log('anon sees form?', (await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n'))).includes('Send message'));
  async function setByAria(label, val) {
    const loc = p.locator(`[aria-label="${label}"]`).first();
    await loc.click({ force: true }); await p.waitForTimeout(250);
    await p.keyboard.press('Control+a'); await p.waitForTimeout(80);
    await p.keyboard.type(val, { delay: 5 }); await p.waitForTimeout(150);
  }
  await setByAria('Your name', `AU062R14 Anon ${MARK}`);
  await setByAria('Email address', 'au062r14@example.com');
  await setByAria('Subject', `anon ${MARK}`);
  const ta = p.locator('textarea').first();
  await ta.click({ force: true }); await p.waitForTimeout(250);
  await p.keyboard.type(`Anonymous contact submit test ${MARK}.`, { delay: 5 });
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
  for (let i = 0; i < 12; i++) { await p.waitForTimeout(600); if (resp) break; }
  console.log('ANON RESP:', JSON.stringify(resp));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
