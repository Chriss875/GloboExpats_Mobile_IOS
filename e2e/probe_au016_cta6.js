// CTA probe 6 (definitive, minimal): fresh context, straight to product, tap Add to cart
// ONCE. Watch for a snackbar node by CLASS/role and by text delta vs pre-tap snapshot.
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP = 'http://localhost:9108';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: null });
  const p = await ctx.newPage(); p.setDefaultTimeout(25000);
  // login in a FIRST page so token persists; product opens in a SECOND page of same ctx
  const p1 = await ctx.newPage();
  await p1.goto(`${APP}/#/login`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  if (!(await lib.isLoggedIn(p1))) {
    await lib.waitText(p1, 'Welcome back', 30000);
    const ei = p1.locator('input[type="text"]').first(), pi = p1.locator('input[type="password"]').first();
    await ei.click({ force: true }); await p1.waitForTimeout(350); await p1.keyboard.type(lib.BUYER.email);
    await pi.click({ force: true }); await p1.waitForTimeout(350); await p1.keyboard.type(lib.BUYER.pw);
    await lib.clickBtn(p1, 'Log in');
    let ok=false; for(let i=0;i<30&&!ok;i++){ok=await lib.isLoggedIn(p1); if(!ok) await p1.waitForTimeout(1000);}
    console.log('login', ok);
  }
  await p1.close();
  const p2 = await ctx.newPage();
  await p2.goto(`${APP}/#/product/470`, { waitUntil:'load',timeout:90000 }).catch(()=>{});
  await lib.waitText(p2,'Modern Business Stay Apartment',40000); await sleep(2500);
  console.log('logged in on p2:', await lib.isLoggedIn(p2));

  const before = await p2.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .map(e => (e.textContent||'').trim()));
  const btn = await p2.evaluate(() => { let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if((e.textContent||'').trim()!=='Add to cart') return;
      const r=e.getBoundingClientRect();
      if(r.width<8||r.height<8) return;
      if(!best||r.width*r.height<best.area) best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};
    }); return best; });
  console.log('btn', JSON.stringify(btn));
  await p2.mouse.click(Math.round(btn.cx), Math.round(btn.cy));
  for(let i=0;i<12;i++){
    await sleep(300);
    const now = await p2.evaluate(() => [...document.querySelectorAll('flt-semantics')]
      .map(e => ({ t:(e.textContent||'').trim(), role:e.getAttribute('role'),
        y:Math.round(e.getBoundingClientRect().y), h:Math.round(e.getBoundingClientRect().height) })));
    const added = now.filter(n => n.t === 'Added to cart');
    const blocked = now.filter(n => /Select your rental dates/.test(n.t));
    if(added.length||blocked.length){
      console.log('T+'+((i+1)*0.3).toFixed(1), 'ADDED-node:', JSON.stringify(added), 'BLOCKED-node:', JSON.stringify(blocked));
      break;
    }
    if(i===11) console.log('no snackbar node ever appeared; total nodes:', now.length);
  }
  const cart = await p2.evaluate(() => Object.keys(localStorage).filter(k=>/cart/i.test(k))
    .map(k=>k+'='+localStorage.getItem(k)));
  console.log('cart storage:', JSON.stringify(cart).slice(0,400));
  await p2.screenshot({path:'/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-016r2/diag-cta6.png'});
  await ctx.close(); await browser.close();
})();
