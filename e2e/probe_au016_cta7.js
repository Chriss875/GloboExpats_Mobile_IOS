// CTA probe 7: does ANY snackbar work in this frozen bundle? Drive the KNOWN-good
// AU-018 own-item guard: open OUR OWN listing (productId 627, sellerId 142 = our userId)
// and tap Add to cart -> expect the own-item toast. That isolates "snackbars render" vs
// "the rental branch is broken".
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
  // 627 is our OWN product (sellerId 142 == our userId)
  await p.goto(`${APP}/#/product/627`, { waitUntil:'load',timeout:90000 }).catch(()=>{});
  const name = await lib.waitText(p,'Fixture WhatsApp Contact Phone Listing',40000);
  console.log('own detail loaded:', name); await sleep(2200);
  const btn = await p.evaluate(() => { let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if((e.textContent||'').trim()!=='Add to cart') return;
      const r=e.getBoundingClientRect(); if(r.width<8||r.height<8) return;
      if(!best||r.width*r.height<best.area) best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};
    }); return best; });
  console.log('btn', JSON.stringify(btn));
  if(btn){ await p.mouse.click(Math.round(btn.cx), Math.round(btn.cy));
    for(let i=0;i<12;i++){ await sleep(300);
      const t = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')]
        .map(e=>(e.textContent||'').trim())
        .filter(x=>/own listed items|Added to cart|Select your rental/i.test(x)));
      if(t.length){ console.log('T+'+((i+1)*0.3).toFixed(1), JSON.stringify(t)); break; }
      if(i===11) console.log('NO toast on own-item guard either'); } }
  // also check cart storage after
  const cart = await p.evaluate(()=>Object.keys(localStorage).filter(k=>/cart/i.test(k)));
  console.log('cart keys:', JSON.stringify(cart));
  await ctx.close(); await browser.close();
})();
