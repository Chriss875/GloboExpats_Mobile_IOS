// Probe 9: after both picks, scroll DOWN a bit — the panel grew (total line added),
// pushing layout; then dump semantics again (stale tree may refresh after scroll) and
// tap Add to cart from the new layout.
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
  await p.mouse.click(187, 476); await sleep(500);
  let okB = await p.evaluate(()=>{ let b=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      if(/^OK$/i.test((e.textContent||'').trim())){const r=e.getBoundingClientRect();b={cx:r.x+r.width/2,cy:r.y+r.height/2};}});
    return b; });
  await p.mouse.click(Math.round(okB.cx), Math.round(okB.cy)); await sleep(1300);
  const endBtn = await p.evaluate(()=>{ let best=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(!(t==='End date'||/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t))) return;
      const r=e.getBoundingClientRect();
      if(r.y<500||r.y>620) return;
      if(r.x>180 && (!best||r.width*r.height<best.area))
        best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2,label:t};
    }); return best; });
  console.log('end:', JSON.stringify(endBtn));
  await p.mouse.click(Math.round(endBtn.cx), Math.round(endBtn.cy)); await sleep(1100);
  await p.mouse.click(277, 476); await sleep(500);
  okB = await p.evaluate(()=>{ let b=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      if(/^OK$/i.test((e.textContent||'').trim())){const r=e.getBoundingClientRect();b={cx:r.x+r.width/2,cy:r.y+r.height/2};}});
    return b; });
  await p.mouse.click(Math.round(okB.cx), Math.round(okB.cy)); await sleep(1500);
  // nudge scroll to flush semantics
  await p.mouse.move(183,300); await p.mouse.wheel(0,120); await sleep(500);
  await p.mouse.wheel(0,-40); await sleep(700);
  const all = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')]
    .map(e=>({t:(e.textContent||'').trim(), y:Math.round(e.getBoundingClientRect().y), role:e.getAttribute('role')}))
    .filter(n=>n.t && /nights?|total|TSh|\/2026|\d{1,2}\/\d{1,2}\/\d{4}/i.test(n.t) && n.t.length<90));
  console.log('post-scroll texts:', JSON.stringify(all, null, 1).slice(0, 900));
  await ctx.close(); await browser.close();
})();
