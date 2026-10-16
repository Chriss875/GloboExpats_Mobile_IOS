// CTA probe 4: click at exact rect center, then dump EVERY text node with its y-position
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP = 'http://localhost:9108';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: null });
  const p = await ctx.newPage(); p.setDefaultTimeout(25000);
  await p.goto(`${APP}/#/login`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  if (!(await lib.isLoggedIn(p))) {
    await lib.waitText(p, 'Welcome back', 30000);
    const ei = p.locator('input[type="text"]').first(), pi = p.locator('input[type="password"]').first();
    await ei.click({ force: true }); await p.waitForTimeout(350); await p.keyboard.type(lib.BUYER.email);
    await pi.click({ force: true }); await p.waitForTimeout(350); await p.keyboard.type(lib.BUYER.pw);
    await lib.clickBtn(p, 'Log in');
    let ok=false; for(let i=0;i<30&&!ok;i++){ok=await lib.isLoggedIn(p); if(!ok) await p.waitForTimeout(1000);}
    console.log('login', ok);
  }
  await sleep(1200);
  await p.goto(`${APP}/#/product/470`, { waitUntil:'load', timeout:90000 }).catch(()=>{});
  await lib.waitText(p,'Modern Business Stay Apartment',40000); await sleep(2200);
  async function dump(tag){
    const rows = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
      .map(e => { const r=e.getBoundingClientRect();
        return { t:(e.textContent||'').trim().slice(0,50), x:Math.round(r.x), y:Math.round(r.y),
                 w:Math.round(r.width), h:Math.round(r.height), role:e.getAttribute('role') }; })
      .filter(r => r.t && r.h>0));
    // only nodes in bottom half (snackbar zone)
    console.log(tag, JSON.stringify(rows.filter(r=>r.y>=380)));
  }
  const btn = await p.evaluate(() => {
    let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if((e.textContent||'').trim()!=='Add to cart') return;
      const r=e.getBoundingClientRect();
      if(!best||r.width*r.height<best.area) best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};
    });
    return best;
  });
  console.log('btn', JSON.stringify(btn), 'viewport', await p.evaluate(()=>[innerWidth,innerHeight]));
  await p.mouse.click(Math.round(btn.cx), Math.round(btn.cy));
  for (let i=0;i<10;i++){ await sleep(350); await dump('T+'+((i+1)*0.35).toFixed(2)); }
  await ctx.close(); await browser.close();
})();
