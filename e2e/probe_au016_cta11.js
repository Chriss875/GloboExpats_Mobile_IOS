// CTA probe 11: capture frames at 120ms cadence right after Add-to-cart click to catch
// the transient snackbar, and read its text from semantics AT THAT INSTANT.
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
  await lib.waitText(p,'Modern Business Stay Apartment',40000); await sleep(2200);
  const btn = await p.evaluate(()=>{ let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if((e.textContent||'').trim()!=='Add to cart') return;
      const r=e.getBoundingClientRect(); if(r.width<8||r.height<8) return;
      if(!best||r.width*r.height<best.area) best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};
    }); return best; });
  // fire click, then poll semantics as fast as possible for 3s recording ALL texts
  await p.mouse.click(Math.round(btn.cx), Math.round(btn.cy));
  const seen = [];
  for (let i = 0; i < 40; i++) {
    const t = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
      .map(e => (e.textContent||'').trim())
      .filter(x => x && x.length < 100 && !x.includes('TSh') && x.length > 8));
    const sig = JSON.stringify(t.length);
    for (const s of t) if (!seen.includes(s)) seen.push(s);
    if (/rental dates/i.test(t.join(' '))) { console.log('FOUND at poll', i, ':', JSON.stringify(t)); break; }
    await sleep(90);
  }
  console.log('all short texts seen post-click:', JSON.stringify(seen.slice(0, 20)));
  await ctx.close(); await browser.close();
})();
