// probe18: short message -> does backend reject with 400 and does UI show the error?
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  let resp = null; let body = null;
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  p.on('response', async r => {
    if (/contact\/submit/.test(r.url())) {
      try { body = await r.text(); } catch (e) {}
      resp = r.status();
    }
  });
  await p.goto(APP + '/#/contact', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Contact us', 40000);
  await p.waitForTimeout(3000);
  async function setByAria(label, val) {
    const loc = p.locator(`[aria-label="${label}"]`).first();
    await loc.click({ force: true }); await p.waitForTimeout(400);
    await p.keyboard.press('Control+a'); await p.waitForTimeout(120);
    await p.keyboard.type(val, { delay: 8 }); await p.waitForTimeout(300);
  }
  // NOTE: message must be >= 10 chars for the client to even send; use a valid-length
  // message but an INVALID reason path is impossible (dropdown). Instead test server
  // validation by sending a 9-char message via direct API from the page context.
  const apiResp = await p.evaluate(async () => {
    const r = await fetch('http://localhost:8083/api/v1/contact/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'AU062R14 ServerVal', email: 'au062r14@example.com', reason: 'OTHER', subject: 'server-side size check', message: 'short' }),
    });
    return { status: r.status, text: (await r.text()).slice(0, 200) };
  });
  console.log('SERVER-VALIDATION:', JSON.stringify(apiResp));
  // CORS note: the app origin is :9131 — sandbox allows it?
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
