// probe31: invalid email — check the a11y tree right at the email field row (error under field)
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
  // fill everything EXCEPT make email invalid
  await setByAria('Your name', 'AU062R14 BadE3');
  const em = p.locator('[aria-label="Email address"]').first();
  await em.click({ force: true }); await p.waitForTimeout(350);
  await p.keyboard.press('Control+a'); await p.waitForTimeout(100);
  await p.keyboard.type('bad-email', { delay: 8 }); await p.waitForTimeout(300);
  console.log('email value:', await em.inputValue());
  await setByAria('Subject', 'bad e3');
  const ta = p.locator('textarea').first();
  await ta.click({ force: true }); await p.waitForTimeout(350);
  await p.keyboard.type('This message is long enough for the DTO.', { delay: 6 }); await p.waitForTimeout(250);
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
  if (otherRect) { await p.mouse.click(otherRect[0] + otherRect[2] / 2, otherRect[1] + otherRect[3] / 2); await p.waitForTimeout(900); }
  await p.locator('flt-semantics[role="button"]', { hasText: 'Send message' }).first().click({ force: true }).catch(() => {});
  await p.waitForTimeout(1800);
  // scroll to top via drag and dump all text nodes with rects
  for (let i = 0; i < 3; i++) { await p.mouse.move(188, 500); await p.mouse.down(); await p.mouse.move(188, 250, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(350); }
  const nodes = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .map(e => ({ t: (e.textContent || '').trim(), r: (() => { const b = e.getBoundingClientRect(); return [Math.round(b.y), Math.round(b.height)]; })() }))
    .filter(n => n.t.length < 60));
  console.log('NODES:', JSON.stringify(nodes).slice(0, 1600));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
