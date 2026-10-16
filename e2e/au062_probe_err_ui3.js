// probe25: 400 case — dismiss the dropdown overlay first (tap outside), then dump leaves.
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
  await setByAria('Your name', 'AU062R14 ShortI');
  await setByAria('Email address', 'au062r14@example.com');
  await setByAria('Subject', 'short msg test i');
  const ta = p.locator('textarea').first();
  await ta.click({ force: true }); await p.waitForTimeout(350);
  await p.keyboard.type('short', { delay: 8 }); await p.waitForTimeout(250);
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
  // click Send
  await p.locator('flt-semantics[role="button"]', { hasText: 'Send message' }).first().click({ force: true }).catch(() => {});
  await p.waitForTimeout(4000);
  // tap a neutral spot to close any lingering scrim, then scroll the form up to reveal error row
  await p.mouse.click(188, 300); await p.waitForTimeout(500);
  await p.mouse.move(180, 380); for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, -260); await p.waitForTimeout(150); }
  await p.waitForTimeout(600);
  const nodes = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .map(e => ({ t: (e.textContent || '').trim(), r: (() => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; })(), role: e.getAttribute('role') }))
    .filter(n => n.t && n.t.length < 130));
  console.log('NODES-AFTER-SEND:', JSON.stringify(nodes).slice(0, 2400));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
