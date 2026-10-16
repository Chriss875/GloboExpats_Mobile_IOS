// Probe 8: semantics are stale for the picked buttons; use PIXELS as the state oracle.
// Full flow: pick start 26 + end 28, verify button bands changed, read total line pixels,
// then Add to cart and check localStorage lineId.
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
  // ---- pick start Aug 26 ----
  await p.mouse.click(Math.round(st.cx), Math.round(st.cy)); await sleep(1100);
  await p.mouse.click(187, 476); await sleep(500);
  let okB = await p.evaluate(()=>{ let b=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      if(/^OK$/i.test((e.textContent||'').trim())){const r=e.getBoundingClientRect();b={cx:r.x+r.width/2,cy:r.y+r.height/2};}});
    return b; });
  await p.mouse.click(Math.round(okB.cx), Math.round(okB.cy)); await sleep(1300);
  // ---- pick end Aug 28 (End btn now has stale 'End date' label? find by position: right half at same y) ----
  const endBtn = await p.evaluate(()=>{ let best=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(!(t==='End date'||/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t))) return;
      const r=e.getBoundingClientRect();
      if(r.y<500||r.y>620) return;
      if(r.x>180 && (!best||r.width*r.height<best.area))
        best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2,label:t};
    }); return best; });
  console.log('end btn:', JSON.stringify(endBtn));
  if(endBtn){
    await p.mouse.click(Math.round(endBtn.cx), Math.round(endBtn.cy)); await sleep(1100);
    await p.mouse.click(277, 476); await sleep(500);   // day 28
    okB = await p.evaluate(()=>{ let b=null;
      document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
        if(/^OK$/i.test((e.textContent||'').trim())){const r=e.getBoundingClientRect();b={cx:r.x+r.width/2,cy:r.y+r.height/2};}});
      return b; });
    await p.mouse.click(Math.round(okB.cx), Math.round(okB.cy)); await sleep(1500);
  }
  await p.screenshot({path:'/tmp/rp8-both-picked.png'});
  // total line via pixels rows 559..570
  const fs=require('fs'), zlib=require('zlib');
  function bandInk(path,y0,y1){ const d=fs.readFileSync(path); let pos=8,idat=Buffer.alloc(0);
    while(pos<d.length){const ln=d.readUInt32BE(pos),typ=d.slice(pos+4,pos+8).toString();
      if(typ==='IDAT') idat=Buffer.concat([idat,d.slice(pos+8,pos+8+ln)]); pos+=12+ln;}
    const w=d.readUInt32BE(16),h=d.readUInt32BE(20),raw=zlib.inflateSync(idat),stride=w*3+1;
    let ink=0; for(let y=y0;y<y1;y++){const row=raw.slice(y*stride,(y+1)*stride);
      for(let x=24;x<353;x++){const px=row.slice(1+x*3,1+x*3+3);
        const lum=(px[0]*299+px[1]*587+px[2]*114)/1000; if(lum>40) ink++;}}
    return ink; }
  console.log('total-line ink:', bandInk('/tmp/rp8-both-picked.png',558,570));
  // add to cart
  const addBtn = await p.evaluate(()=>{ let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if((e.textContent||'').trim()!=='Add to cart') return;
      const r=e.getBoundingClientRect(); if(r.width<8||r.height<8) return;
      if(!best||r.width*r.height<best.area) best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};
    }); return best; });
  console.log('add:', JSON.stringify(addBtn));
  await p.mouse.click(Math.round(addBtn.cx), Math.round(addBtn.cy)); await sleep(1800);
  const cart = await p.evaluate(()=>{ const o={};
    Object.keys(localStorage).filter(k=>/expatCartItems/i.test(k))
      .forEach(k=>{ try{o[k]=JSON.parse(localStorage.getItem(k));}catch(e){} }); return o; });
  console.log('CART:', JSON.stringify(cart).slice(0,700));
  await ctx.close(); await browser.close();
})();
