// probe32: invalid email — after send attempt, press Escape to close any overlay, then dump
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
  await setByAria('Your name', 'AU062R14 BadE4');
  const em = p.locator('[aria-label="Email address"]').first();
  await em.click({ force: true }); await p.waitForTimeout(350);
  await p.keyboard.press('Control+a'); await p.waitForTimeout(100);
  await p.keyboard.type('bad-email', { delay: 8 }); await p.waitForTimeout(300);
  await setByAria('Subject', 'bad e4');
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
  // scroll form to TOP by dragging down repeatedly
  for (let i = 0; i < 6; i++) { await p.mouse.move(188, 550); await p.mouse.down(); await p.mouse.move(188, 150, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(300); }
  await p.waitForTimeout(500);
  const T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('has valid-email error?', T.includes('Enter a valid email address'));
  console.log('ALL-TEXT:', JSON.stringify(T.replace(/\n+/g, ' | ').slice(0, 700)));
  await p.screenshot({ path: '/home/devsystemadmin/tmp_au062/probe32-bade4.png' });
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
