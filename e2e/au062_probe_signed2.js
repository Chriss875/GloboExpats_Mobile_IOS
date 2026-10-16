// probe12: signed probe with full request logging to see whether submit fires at all
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const MARK = 'AU062R14S2' + Math.floor(Math.random() * 900000 + 100000);
  const token = await L.apiLogin();
  const reqs = [];
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.addInitScript((t) => {
    localStorage.setItem('flutter.auth_token', JSON.stringify(t));
    localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com'));
  }, token);
  p.on('request', r => { if (r.url().includes(':8083')) reqs.push({ m: r.method(), u: r.url().slice(0, 90), auth: r.headers()['authorization'] ? 'yes' : 'no' }); });
  let resp = null;
  p.on('response', async r => {
    if (/contact\/submit/.test(r.url())) {
      let body = null; try { body = await r.json(); } catch (e) {}
      resp = { status: r.status(), body };
    }
  });
  await p.goto(APP + '/#/contact', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Contact us', 40000).catch(() => {});
  await p.waitForTimeout(3000);
  async function setByAria(label, val) {
    const loc = p.locator(`[aria-label="${label}"]`).first();
    await loc.click({ force: true }); await p.waitForTimeout(250);
    await p.keyboard.press('Control+a'); await p.waitForTimeout(80);
    await p.keyboard.type(val, { delay: 5 }); await p.waitForTimeout(150);
  }
  await setByAria('Your name', `AU062R14 Signed2 ${MARK}`);
  await setByAria('Email address', 'mobile.test.20260820@gmail.com');
  await setByAria('Subject', `signed2 ${MARK}`);
  const ta = p.locator('textarea').first();
  await ta.click({ force: true }); await p.waitForTimeout(250);
  await p.keyboard.type(`Signed-in JWT attach test ${MARK}.`, { delay: 5 });
  // dump current input values before send
  const vals = await p.evaluate(() => [...document.querySelectorAll('input,textarea')].map(i => ({ a: i.getAttribute('aria-label'), v: (i.value || '').slice(0, 50) })));
  console.log('VALUES:', JSON.stringify(vals));
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
  console.log('otherNode:', otherNode);
  if (otherNode) { await p.mouse.click(otherNode.cx, otherNode.cy); await p.waitForTimeout(600); }
  const T1 = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('menu closed?', !T1.includes('BuyingSellingDelivery'));
  await p.locator('flt-semantics[role="button"]', { hasText: 'Send message' }).first().click({ force: true }).catch(() => {});
  for (let i = 0; i < 12; i++) { await p.waitForTimeout(600); if (resp) break; }
  console.log('RESP:', JSON.stringify(resp));
  console.log('API-REQS:', JSON.stringify(reqs.slice(-6)));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
