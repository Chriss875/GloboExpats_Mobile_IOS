// Probe 10: pick start ONLY (26). Then check pixels: label changed AND total line?
// Then pick end (28) and check again. This isolates which step produces the total.
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP = 'http://localhost:9108';
const fs = require('fs'), zlib = require('zlib');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function bandInk(path, y0, y1, x0 = 24, x1 = 350) {
  const d = fs.readFileSync(path); let pos = 8, idat = Buffer.alloc(0);
  while (pos < d.length) { const ln = d.readUInt32BE(pos), typ = d.slice(pos + 4, pos + 8).toString();
    if (typ === 'IDAT') idat = Buffer.concat([idat, d.slice(pos + 8, pos + 8 + ln)]); pos += 12 + ln; }
  const w = d.readUInt32BE(16), raw = zlib.inflateSync(idat), stride = w * 3 + 1;
  let ink = 0;
  for (let y = y0; y < Math.min(y1, d.readUInt32BE(20)); y++) {
    const row = raw.slice(y * stride, (y + 1) * stride);
    for (let x = x0; x < x1; x++) { const px = row.slice(1 + x * 3, 1 + x * 3 + 3);
      if ((px[0] * 299 + px[1] * 587 + px[2] * 114) / 1000 > 40) ink++; }
  }
  return ink;
}
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
  await p.screenshot({path:'/tmp/rpA-0.png'});
  // start = Aug 26
  await p.mouse.click(Math.round(st.cx), Math.round(st.cy)); await sleep(1100);
  await p.mouse.click(187, 476); await sleep(500);
  let okB = await p.evaluate(()=>{ let b=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      if(/^OK$/i.test((e.textContent||'').trim())){const r=e.getBoundingClientRect();b={cx:r.x+r.width/2,cy:r.y+r.height/2};}});
    return b; });
  await p.mouse.click(Math.round(okB.cx), Math.round(okB.cy)); await sleep(1500);
  await p.screenshot({path:'/tmp/rpA-1.png'});
  console.log('after START only: buttons ink', bandInk('/tmp/rpA-1.png',534,557),
    'below ink', bandInk('/tmp/rpA-1.png',558,600));
  // end = Aug 28
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
  await p.screenshot({path:'/tmp/rpA-2.png'});
  console.log('after END: buttons ink', bandInk('/tmp/rpA-2.png',534,557),
    'below ink', bandInk('/tmp/rpA-2.png',558,600));
  await ctx.close(); await browser.close();
})();
