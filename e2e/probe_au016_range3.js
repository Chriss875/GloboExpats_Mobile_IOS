// Range probe 3: click day cell, then check the OK button's disabled state and whether
// Flutter registered selection — compare day-cell rect (selected cells render wider in
// Material3? no) — better: after clicking day, tap OK and watch if dialog closes at all.
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
  await p.mouse.click(Math.round(st.cx), Math.round(st.cy)); await sleep(1100);
  const calOpen = () => p.evaluate(()=>['OK','CANCEL'].every(w=>[...document.querySelectorAll('flt-semantics[role="button"]')].some(e=>(e.textContent||'').trim().toUpperCase()===w)));
  console.log('cal open:', await calOpen());
  // list ALL day cells with rects
  const days = await p.evaluate(()=>{ const out=[];
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const m=((e.textContent||'').trim()).match(/^(\d{1,2}),\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/);
      if(!m) return;
      const r=e.getBoundingClientRect();
      out.push({d:Number(m[1]), x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height),
                dis:e.getAttribute('aria-disabled'), tappable:e.getAttribute('flt-tappable'), role:e.getAttribute('role')});
    }); return out; });
  console.log('days:', JSON.stringify(days.filter(d=>d.d>=24 && d.d<=31)));
  // click day 26 by its exact rect center
  const d26 = days.find(d=>d.d===26);
  if(!d26){ console.log('NO DAY 26'); return; }
  await p.mouse.click(d26.x + Math.round(d26.w/2), d26.y + Math.round(d26.h/2));
  await sleep(500);
  console.log('still open after day click:', await calOpen());
  // screenshot + pixel check of that cell region for a blue selection circle
  await p.screenshot({path:'/tmp/rp3-day-selected.png'});
  // press OK
  const okB = await p.evaluate(()=>{ let b=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      if(/^OK$/i.test((e.textContent||'').trim())){const r=e.getBoundingClientRect();b={cx:r.x+r.width/2,cy:r.y+r.height/2};}});
    return b; });
  await p.mouse.click(Math.round(okB.cx), Math.round(okB.cy));
  for(let i=0;i<10;i++){ await sleep(300); if(!(await calOpen())) break; }
  console.log('cal closed after OK:', !(await calOpen()));
  st = await btnRect('Start date');
  console.log('start btn label now:', JSON.stringify(st));
  await ctx.close(); await browser.close();
})();
