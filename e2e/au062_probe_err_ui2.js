// probe24: after 400, scroll INSIDE the form listview (mouse over form area) and dump
// semantics with rects to find the error Text node.
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
  await setByAria('Your name', 'AU062R14 ShortH');
  await setByAria('Email address', 'au062r14@example.com');
  await setByAria('Subject', 'short msg test h');
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
  if (otherRect) { await p.mouse.click(otherRect[0] + otherRect[2] / 2, otherRect[1] + otherRect[3] / 2); await p.waitForTimeout(700); }
  await p.locator('flt-semantics[role="button"]', { hasText: 'Send message' }).first().click({ force: true }).catch(() => {});
  await p.waitForTimeout(4000);
  // dump ALL leaf semantics nodes with text + rect
  const nodes = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .map(e => ({ t: (e.textContent || '').trim(), r: (() => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; })() }))
    .filter(n => n.t && n.t.length < 120));
  console.log('LEAF-NODES:', JSON.stringify(nodes, null, 0).slice(0, 2200));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
