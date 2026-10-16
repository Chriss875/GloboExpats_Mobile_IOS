// Does ANY SnackBar render in this bundle? cart_screen has a real snackbar path
// ("Cart cleared" style). Open /#/cart with an item, tap Clear all, watch semantics.
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP = 'http://localhost:9108';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: null });
  const p = await ctx.newPage();
  // seed OUR OWN cart key directly (RO-safe: our user's key only)
  await p.goto(`${APP}/#/login`, { waitUntil:'load',timeout:90000 }).catch(()=>{});
  if (!(await lib.isLoggedIn(p))) {
    await lib.waitText(p,'Welcome back',30000);
    const ei=p.locator('input[type="text"]').first(), pi=p.locator('input[type="password"]').first();
    await ei.click({force:true}); await p.waitForTimeout(350); await p.keyboard.type(lib.BUYER.email);
    await pi.click({force:true}); await p.waitForTimeout(350); await p.keyboard.type(lib.BUYER.pw);
    await lib.clickBtn(p,'Log in');
    let ok=false; for(let i=0;i<30&&!ok;i++){ok=await lib.isLoggedIn(p); if(!ok) await p.waitForTimeout(1000);}
    console.log('login', ok);
  }
  const seeded = await p.evaluate(() => {
    // find the per-user cart key the app uses
    const probeKey = Object.keys(localStorage).find(k=>/^flutter\./.test(k));
    return { keys: Object.keys(localStorage) };
  });
  console.log('storage keys:', JSON.stringify(seeded.keys));
  // derive email-keyed cart name like expatCartItems_<email>
  const set = await p.evaluate(() => {
    localStorage.setItem('expatCartItems_mobile.test.20260820@gmail.com', JSON.stringify([
      { lineId:'p627', productId:627, title:'Fixture WhatsApp Contact Phone Listing', price:46000,
        quantity:1, selected:true, currency:'TZS' }]));
    return true;
  });
  await p.goto(`${APP}/#/cart`, { waitUntil:'load',timeout:90000 }).catch(()=>{});
  await sleep(3000);
  const t0 = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .map(e => (e.textContent||'').trim()).filter(Boolean).slice(0,30));
  console.log('cart screen texts:', JSON.stringify(t0.slice(0,18)));
  const clear = await p.evaluate(() => { let best=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(!/clear/i.test(t)) return;
      const r=e.getBoundingClientRect(); if(r.width<8||r.height<8) return;
      if(!best||r.width*r.height<best.area) best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2,t};
    }); return best; });
  console.log('clear btn:', JSON.stringify(clear));
  if(clear){
    // confirm dialog may appear; handle it
    await p.mouse.click(Math.round(clear.cx), Math.round(clear.cy));
    for(let i=0;i<10;i++){ await sleep(300);
      const dlg = await p.evaluate(()=>{ let b=null;
        document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
          if(/^confirm$|^yes$|^clear$/i.test((e.textContent||'').trim())){
            const r=e.getBoundingClientRect(); if(!b||r.width*r.height<b.area)
              b={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2}; } });
        return b; });
      if(dlg){ await p.mouse.click(Math.round(dlg.cx), Math.round(dlg.cy)); break; }
    }
    for(let i=0;i<12;i++){ await sleep(280);
      const t = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')]
        .map(e=>(e.textContent||'').trim()).filter(x=>/cleared|removed|empty|Clear/i.test(x)));
      if(t.length){ console.log('T+'+((i+1)*0.28).toFixed(2), JSON.stringify(t)); break; }
      if(i===11) console.log('no visible reaction to Clear all'); }
  }
  await p.evaluate(()=>localStorage.removeItem('expatCartItems_mobile.test.20260820@gmail.com'));
  await ctx.close(); await browser.close();
})();
