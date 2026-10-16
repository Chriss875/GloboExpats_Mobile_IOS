// After start pick, dump y of 'Choose options' node to see if layout grew.
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport:{width:375,height:667}, videoPath:null });
  const p1 = await ctx.newPage();
  await p1.goto('http://localhost:9108/#/login',{waitUntil:'load',timeout:90000}).catch(()=>{});
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
  await p.goto('http://localhost:9108/#/product/470',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Modern Business Stay Apartment',40000); await sleep(2200);
  const yOf = t => p.evaluate((lbl)=>{ let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if((e.textContent||'').trim()!==lbl) return;
      const r=e.getBoundingClientRect(); if(r.width<2||r.height<2) return;
      if(!best||r.width*r.height<best.area) best={area:r.width*r.height,y:r.y};
    }); return best ? Math.round(best.y) : null; }, t);
  console.log('pre:', 'StartDate@', await yOf('Start date'), 'ChooseOptions@', await yOf('Choose options'));
  let st = await p.evaluate(()=>{ let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if((e.textContent||'').trim()!=='Start date') return;
      const r=e.getBoundingClientRect(); if(r.cy<50) return;
      if(!best||r.width*r.height<best.area) best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};
    }); return best; });
  await p.mouse.click(Math.round(st.cx), Math.round(st.cy)); await sleep(1100);
  await p.mouse.click(187, 476); await sleep(500);
  const okB = await p.evaluate(()=>{ let b=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      if(/^OK$/i.test((e.textContent||'').trim())){const r=e.getBoundingClientRect();b={cx:r.x+r.width/2,cy:r.y+r.height/2};}});
    return b; });
  await p.mouse.click(Math.round(okB.cx), Math.round(okB.cy)); await sleep(1600);
  console.log('post:', 'ChooseOptions@', await yOf('Choose options'),
    'WhatsAppRow@', await yOf('WhatsApp seller · +255 725255245'));
  // full text dump of anything between y500..700
  const rows = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')]
    .map(e=>({t:(e.textContent||'').trim().slice(0,60), y:Math.round(e.getBoundingClientRect().y)}))
    .filter(n=>n.t && n.y>495 && n.y<720));
  console.log(JSON.stringify(rows,null,0).slice(0,800));
  await ctx.close(); await browser.close();
})();
