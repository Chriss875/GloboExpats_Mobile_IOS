// Range probe 5: replicate rp4 (raw coords) then dump semantics + check total line text.
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
  // day cells via rect list
  const days = await p.evaluate(()=>{ const out=[];
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const m=((e.textContent||'').trim()).match(/^(\d{1,2}),\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/);
      if(!m) return;
      const r=e.getBoundingClientRect();
      if(r.width<20||r.width>60) return;   // only real cells
      out.push({d:Number(m[1]), cx:r.x+r.width/2, cy:r.y+r.height/2});
    }); return out; });
  console.log('cells:', JSON.stringify(days.filter(d=>d.d>=24)));
  const d26 = days.find(d=>d.d===26), d28 = days.find(d=>d.d===28);
  await p.mouse.click(Math.round(d26.cx), Math.round(d26.cy)); await sleep(500);
  const okB = await p.evaluate(()=>{ let b=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      if(/^OK$/i.test((e.textContent||'').trim())){const r=e.getBoundingClientRect();b={cx:r.x+r.width/2,cy:r.y+r.height/2};}});
    return b; });
  await p.mouse.click(Math.round(okB.cx), Math.round(okB.cy)); await sleep(1300);
  st = await btnRect('Start date');
  console.log('start after pick:', JSON.stringify(st));
  let en = await btnRect('End date');
  await p.mouse.click(Math.round(en.cx), Math.round(en.cy)); await sleep(1100);
  const days2 = await p.evaluate(()=>{ const out=[];
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const m=((e.textContent||'').trim()).match(/^(\d{1,2}),\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/);
      if(!m) return;
      const r=e.getBoundingClientRect();
      if(r.width<20||r.width>60) return;
      out.push({d:Number(m[1]), cx:r.x+r.width/2, cy:r.y+r.height/2});
    }); return out; });
  const d28b = days2.find(d=>d.d===28);
  console.log('end cal d28:', JSON.stringify(d28b));
  if(!d28b){ // maybe need next month nav
    console.log('all end cells:', JSON.stringify(days2.map(d=>d.d)));
  } else {
    await p.mouse.click(Math.round(d28b.cx), Math.round(d28b.cy)); await sleep(500);
    const okB2 = await p.evaluate(()=>{ let b=null;
      document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
        if(/^OK$/i.test((e.textContent||'').trim())){const r=e.getBoundingClientRect();b={cx:r.x+r.width/2,cy:r.y+r.height/2};}});
      return b; });
    await p.mouse.click(Math.round(okB2.cx), Math.round(okB2.cy)); await sleep(1400);
  }
  const all = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')]
    .map(e=>(e.textContent||'').trim())
    .filter(x=>/\d{1,2}\/\d{1,2}\/\d{4}|nights?|total/i.test(x) && x.length<80));
  console.log('post-range texts:', JSON.stringify(all));
  await ctx.close(); await browser.close();
})();
