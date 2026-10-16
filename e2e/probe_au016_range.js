// Range probe: instrument bookRange step by step. After Start-date pick+OK, dump the
// panel button labels (should show dd/mm/yyyy) and after End pick+OK dump texts.
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
        const t=(e.textContent||'').trim();
        if(t!==l && !t.startsWith(l+'\n')) return;
        const r=e.getBoundingClientRect(); if(r.width<8||r.height<8) return;
        if(r.bottom<=0||r.top>=innerHeight) return;
        if(!best||r.width*r.height<best.area) best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2,label:t.slice(0,30)};
      }); return best; }, label);
  }
  // scroll so panel is mid-screen
  for(let i=0;i<10;i++){
    const r=await btnRect('Start date');
    if(r && r.cy>60 && r.cy<600){ console.log('panel visible at', JSON.stringify(r)); break; }
    await p.mouse.move(183,400); await p.mouse.wheel(0,300); await sleep(250);
  }
  let st = await btnRect('Start date');
  console.log('start:', JSON.stringify(st));
  await p.mouse.click(Math.round(st.cx), Math.round(st.cy)); await sleep(1100);
  console.log('cal open:', await p.evaluate(()=>['OK','CANCEL'].every(w=>[...document.querySelectorAll('flt-semantics[role="button"]')].some(e=>(e.textContent||'').trim().toUpperCase()===w))));
  const day = await p.evaluate(()=>{ let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const m=((e.textContent||'').trim()).match(/^(\d{1,2}),\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/);
      if(!m||Number(m[1])!==26) return;
      if((e.getAttribute('aria-disabled')||'')==='true') return;
      const r=e.getBoundingClientRect(); if(r.width<15||r.height<15||r.bottom<=0||r.top>=innerHeight) return;
      if(!best||r.width*r.height<best.area) best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};
    }); return best; });
  console.log('day26:', JSON.stringify(day));
  await p.mouse.click(Math.round(day.cx), Math.round(day.cy)); await sleep(500);
  const okB = await p.evaluate(()=>{ let b=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      if(/^OK$/i.test((e.textContent||'').trim())){const r=e.getBoundingClientRect();b={cx:r.x+r.width/2,cy:r.y+r.height/2};}});
    return b; });
  console.log('OK:', JSON.stringify(okB));
  await p.mouse.click(Math.round(okB.cx), Math.round(okB.cy)); await sleep(1000);
  // what do the buttons say now?
  const labels = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')]
    .map(e=>({t:(e.textContent||'').trim(), role:e.getAttribute('role'),
      y:Math.round(e.getBoundingClientRect().y)}))
    .filter(x=>/\d{1,2}\/\d{1,2}\/\d{4}|Start|End|nights?|total/i.test(x.t)));
  console.log('post-start labels:', JSON.stringify(labels));
  let en = await btnRect(/End date/.source ? 'End date' : 'End date');
  console.log('end btn:', JSON.stringify(en));
  if(en){ await p.mouse.click(Math.round(en.cx), Math.round(en.cy)); await sleep(1100);
    console.log('end cal open:', await p.evaluate(()=>['OK','CANCEL'].every(w=>[...document.querySelectorAll('flt-semantics[role="button"]')].some(e=>(e.textContent||'').trim().toUpperCase()===w))));
    const day2 = await p.evaluate(()=>{ let best=null;
      document.querySelectorAll('flt-semantics').forEach(e=>{
        const m=((e.textContent||'').trim()).match(/^(\d{1,2}),\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/);
        if(!m||Number(m[1])!==28) return;
        if((e.getAttribute('aria-disabled')||'')==='true') return;
        const r=e.getBoundingClientRect(); if(r.width<15||r.height<15||r.bottom<=0||r.top>=innerHeight) return;
        if(!best||r.width*r.height<best.area) best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};
      }); return best; });
    console.log('day28:', JSON.stringify(day2));
    if(day2){ await p.mouse.click(Math.round(day2.cx), Math.round(day2.cy)); await sleep(500);
      const okB2 = await p.evaluate(()=>{ let b=null;
        document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
          if(/^OK$/i.test((e.textContent||'').trim())){const r=e.getBoundingClientRect();b={cx:r.x+r.width/2,cy:r.y+r.height/2};}});
        return b; });
      if(okB2){ await p.mouse.click(Math.round(okB2.cx), Math.round(okB2.cy)); } await sleep(1100); }
    const labels2 = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')]
      .map(e=>(e.textContent||'').trim())
      .filter(x=>/\d{1,2}\/\d{1,2}\/\d{4}|nights?|total/i.test(x)));
    console.log('post-end labels:', JSON.stringify(labels2));
    await p.screenshot({path:'/tmp/range-probe-final.png'});
  }
  await ctx.close(); await browser.close();
})();
