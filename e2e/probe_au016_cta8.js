// CTA probe 8: tap Add to cart, then IMMEDIATELY dump ALL semantics nodes (not filtered)
// at T+300ms and diff against pre-tap set. Also watch the flt-glass-pane / overlay layers.
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP = 'http://localhost:9108';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: null });
  const p1 = await ctx.newPage();
  await p1.goto(`${APP}/#/login`, { waitUntil:'load',timeout:90000 }).catch(()=>{});
  if (!(await lib.isLoggedIn(p1))) {
    await lib.waitText(p1,'Welcome back',30000);
    const ei=p1.locator('input[type="text"]').first(), pi=p1.locator('input[type="password"]').first();
    await ei.click({force:true}); await p1.waitForTimeout(350); await p1.keyboard.type(lib.BUYER.email);
    await pi.click({force:true}); await p1.waitForTimeout(350); await p1.keyboard.type(lib.BUYER.pw);
    await lib.clickBtn(p1,'Log in');
    let ok=false; for(let i=0;i<30&&!ok;i++){ok=await lib.isLoggedIn(p1); if(!ok) await p1.waitForTimeout(1000);}
    console.log('login', ok);
  }
  await p1.close();
  const p = await ctx.newPage();
  await p.goto(`${APP}/#/product/470`, { waitUntil:'load',timeout:90000 }).catch(()=>{});
  await lib.waitText(p,'Modern Business Stay Apartment',40000); await sleep(2500);
  const snap = () => p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .map(e => (e.textContent||'').trim()).filter(x=>x&&x.length<80).sort());
  const before = await snap();
  console.log('before count', before.length);
  // click via Playwright's own locator on role=button (uses proper hit-testing + actionability)
  const loc = p.locator('flt-semantics[role="button"]', { hasText: 'Add to cart' }).first();
  try { await loc.click({ timeout: 5000 }); console.log('locator click ok'); }
  catch(e){ console.log('locator click FAILED:', String(e).slice(0,150)); }
  for(let i=0;i<12;i++){
    await sleep(280);
    const after = await snap();
    const delta = after.filter(x => !before.includes(x));
    if (delta.length) { console.log('T+'+((i+1)*0.28).toFixed(2), JSON.stringify(delta.slice(0,8))); break; }
    if(i===11) console.log('NO semantic delta at all');
  }
  await ctx.close(); await browser.close();
})();
