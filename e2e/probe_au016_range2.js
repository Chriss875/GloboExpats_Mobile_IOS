// Range probe 2: after OK, poll for the panel buttons changing label to dd/mm/yyyy,
// and check whether a SNACKBAR (error) appeared instead. Screenshot each stage.
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
        if(t!==l) return;
        const r=e.getBoundingClientRect(); if(r.width<8||r.height<8) return;
        if(r.bottom<=0||r.top>=innerHeight||r.cy<50) return;
        if(!best||r.width*r.height<best.area) best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2,label:t};
      }); return best; }, label);
  }
  for(let i=0;i<10;i++){ const r=await btnRect('Start date'); if(r&&r.cy>60&&r.cy<620) break;
    await p.mouse.move(183,400); await p.mouse.wheel(0,300); await sleep(250); }
  let st = await btnRect('Start date');
  console.log('start btn BEFORE:', JSON.stringify(st));
  // baseline screenshot
  await p.screenshot({path:'/tmp/rp2-0-panel.png'});
  await p.mouse.click(Math.round(st.cx), Math.round(st.cy)); await sleep(1100);
  const day = await p.evaluate(()=>{ let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const m=((e.textContent||'').trim()).match(/^(\d{1,2}),\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/);
      if(!m||Number(m[1])!==26) return;
      if((e.getAttribute('aria-disabled')||'')==='true') return;
      const r=e.getBoundingClientRect(); if(r.width<15||r.height<15||r.bottom<=0||r.top>=innerHeight) return;
      if(!best||r.width*r.height<best.area) best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};
    }); return best; });
  console.log('day26 rect:', JSON.stringify(day));
  await p.mouse.click(Math.round(day.cx), Math.round(day.cy)); await sleep(450);
  // is day 26 now highlighted? take shot of calendar with selection
  await p.screenshot({path:'/tmp/rp2-1-day-picked.png'});
  const sel = await p.evaluate(()=>{ let b=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const m=((e.textContent||'').trim()).match(/^(26),\s+Mon/);
      if(!m) return; const r=e.getBoundingClientRect();
      b={w:Math.round(r.width),h:Math.round(r.height),sel:e.getAttribute('aria-selected'),pressed:e.getAttribute('aria-pressed')};});
    return b; });
  console.log('day26 state after click:', JSON.stringify(sel));
  const okB = await p.evaluate(()=>{ let b=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      if(/^OK$/i.test((e.textContent||'').trim())){const r=e.getBoundingClientRect();b={cx:r.x+r.width/2,cy:r.y+r.height/2};}});
    return b; });
  await p.mouse.click(Math.round(okB.cx), Math.round(okB.cy));
  // poll button label change over 3s
  let changed=false;
  for(let i=0;i<15;i++){ await sleep(200);
    st = await btnRect('Start date');
    if(!st){ changed='GONE'; break; }
    if(/\d/.test(st.label)){ changed=true; break; }
  }
  console.log('start btn AFTER:', JSON.stringify(st), 'changed:', changed);
  await p.screenshot({path:'/tmp/rp2-2-after-ok.png'});
  // any snackbar? band diff
  await ctx.close(); await browser.close();
})();
