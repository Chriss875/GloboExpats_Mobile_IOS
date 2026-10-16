// Seed cart with the flutter.-prefixed shared_preferences key, then open /#/cart.
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP = 'http://localhost:9108';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: null });
  const p = await ctx.newPage();
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
  await p.evaluate(() => {
    localStorage.setItem('flutter.expatCartItems_mobile.test.20260820@gmail.com', JSON.stringify([
      { lineId:'p627', productId:627, title:'Fixture WhatsApp Contact Phone Listing', price:46000,
        quantity:1, selected:true, currency:'TZS' }]));
  });
  await p.goto(`${APP}/#/cart`, { waitUntil:'load',timeout:90000 }).catch(()=>{});
  await sleep(3200);
  const t0 = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .map(e => (e.textContent||'').trim()).filter(Boolean));
  console.log('cart texts:', JSON.stringify([...new Set(t0)].slice(0,16)));
  // find Clear all button
  const clear = await p.evaluate(() => { let best=null;
    document.querySelectorAll('flt-semantics[role="button"], flt-semantics[flt-tappable]').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(!/clear/i.test(t)) return;
      const r=e.getBoundingClientRect(); if(r.width<8||r.height<8||r.bottom<=0||r.top>=innerHeight) return;
      if(!best||r.width*r.height<best.area) best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2,t};
    }); return best; });
  console.log('clear btn:', JSON.stringify(clear));
  const before = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .map(e=>(e.textContent||'').trim()).filter(x=>x&&x.length<90).sort());
  if(clear){ await p.mouse.click(Math.round(clear.cx), Math.round(clear.cy)); 
    for(let i=0;i<8;i++){ await sleep(300);
      const dlg = await p.evaluate(()=>{ let b=null;
        document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
          const t=(e.textContent||'').trim();
          if(/^(confirm|yes|clear|ok)$/i.test(t)){ const r=e.getBoundingClientRect(); if(!b||r.width*r.height<b.area) b={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2}; } });
        return b; });
      if(dlg){ console.log('dialog found, confirming'); await p.mouse.click(Math.round(dlg.cx), Math.round(dlg.cy)); break; } }
    for(let i=0;i<12;i++){ await sleep(280);
      const after = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')]
        .map(e=>(e.textContent||'').trim()).filter(x=>x&&x.length<90).sort());
      const delta = after.filter(x=>!before.includes(x));
      if(delta.length){ console.log('T+'+((i+1)*0.28).toFixed(2), JSON.stringify(delta.slice(0,6))); break; }
      if(i===11) console.log('clear-all: NO delta'); } }
  await p.evaluate(()=>Object.keys(localStorage).filter(k=>/expatCartItems/.test(k)).forEach(k=>localStorage.removeItem(k)));
  await ctx.close(); await browser.close();
})();
