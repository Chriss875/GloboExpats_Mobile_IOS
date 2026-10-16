// probe14: anon submit with validation-error dump — why did it not fire?
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const MARK = 'AU062R14B2' + Math.floor(Math.random() * 900000 + 100000);
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
  async function setByAria(label, val) {
    const loc = p.locator(`[aria-label="${label}"]`).first();
    await loc.click({ force: true }); await p.waitForTimeout(250);
    await p.keyboard.press('Control+a'); await p.waitForTimeout(80);
    await p.keyboard.type(val, { delay: 5 }); await p.waitForTimeout(150);
  }
  await setByAria('Your name', `AU062R14 Anon2 ${MARK}`);
  await setByAria('Email address', 'au062r14@example.com');
  await setByAria('Subject', `anon2 ${MARK}`);
  const ta = p.locator('textarea').first();
  await ta.click({ force: true }); await p.waitForTimeout(250);
  await p.keyboard.type(`Anonymous contact submit test ${MARK}.`, { delay: 5 });
  // open dropdown, list option rects, click "Other" via its rect
  const rb = p.locator('flt-semantics[role="button"]', { hasText: 'Reason' }).first();
  await rb.click({ force: true }); await p.waitForTimeout(800);
  const opts = await p.evaluate(() => [...document.querySelectorAll('flt-semantics[role="button"]')].map(e => ({ t: (e.textContent || '').trim(), r: (() => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; })() })).filter(o => o.r[3] > 5 && o.t));
  console.log('OPTIONS:', JSON.stringify(opts));
  const other = opts.find(o => o.t === 'Other');
  if (other) { await p.mouse.click(other.r[0] + other.r[2] / 2, other.r[1] + other.r[3] / 2); await p.waitForTimeout(700); }
  const vals = await p.evaluate(() => [...document.querySelectorAll('input,textarea')].map(i => ({ a: i.getAttribute('aria-label'), v: (i.value || '').slice(0, 40) })));
  console.log('VALS:', JSON.stringify(vals));
  await p.locator('flt-semantics[role="button"]', { hasText: 'Send message' }).first().click({ force: true }).catch(() => {});
  for (let i = 0; i < 12; i++) { await p.waitForTimeout(600); if (resp) break; }
  const errT = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('RESP:', JSON.stringify(resp));
  console.log('ERR-TEXT:', errT.split('\n').filter(l => /required|error|could not/i.test(l)).slice(0, 4));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
