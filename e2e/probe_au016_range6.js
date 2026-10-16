// Range probe 6: replicate rp4 exactly, screenshot after each stage, dump semantics.
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP = 'http://localhost:9108';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport:{width:375,height:667}, videoPath:null });
  const p1 = await ctx.newPage();
  await p1.goto(`${APP}/#/login`,{waitUntil:'load',timeout:90000}).catch(()=>{});
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
  await p.goto(`${APP}/#/product/470`,{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Modern Business Stay Apartment',40000); await sleep(2200);
  async function btnRect(label){
    return p.evaluate((l)=>{ let best=null;
      document.querySelectorAll('flt-semantics').forEach(e=>{
        if((e.textContent||'').trim()!==l) return;
        const r=e.getBoundingClientRect(); if(r.width<8||r.height<8) return;
        if(r.bottom<=0||r.top>=innerHeight||r.cy<50) return;
        if(!best||r.width*r.height<best.area) best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2,label:l};
      }); return best; }, label);
  }
  for(let i=0;i<10;i++){ const r=await btnRect('Start date'); if(r&&r.cy>60&&r.cy<620) break;
    await p.mouse.move(183,400); await p.mouse.wheel(0,300); await sleep(250); }
  let st = await btnRect('Start date');
  console.log('start:', JSON.stringify(st));
  await p.mouse.click(Math.round(st.cx), Math.round(st.cy)); await sleep(1100);
  await p.screenshot({path:'/tmp/rp6-cal.png'});
  await p.mouse.click(187, 476); await sleep(500);          // day 26 (rp4 coords)
  await p.screenshot({path:'/tmp/rp6-day.png'});
  const okB = await p.evaluate(()=>{ let b=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      if(/^OK$/i.test((e.textContent||'').trim())){const r=e.getBoundingClientRect();b={cx:r.x+r.width/2,cy:r.y+r.height/2};}});
    return b; });
  console.log('OK:', JSON.stringify(okB));
  await p.mouse.click(Math.round(okB.cx), Math.round(okB.cy)); await sleep(1300);
  await p.screenshot({path:'/tmp/rp6-after-start.png'});
  st = await btnRect('Start date');
  console.log('start after:', JSON.stringify(st));
  // semantics: any dd/mm/yyyy text anywhere?
  const dates = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')]
    .map(e=>({t:(e.textContent||'').trim(), y:Math.round(e.getBoundingClientRect().y)}))
    .filter(x=>/\d{1,2}\/\d{1,2}\/\d{4}/.test(x.t)));
  console.log('date nodes:', JSON.stringify(dates));
  await ctx.close(); await browser.close();
})();
