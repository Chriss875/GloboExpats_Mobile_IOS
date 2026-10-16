// 768-specific block-toast check with wider band + longer catch window
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP = 'http://localhost:9108';
const fs=require('fs'), zlib=require('zlib');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function readPng(path){const d=fs.readFileSync(path);let pos=8,idat=Buffer.alloc(0);
 while(pos<d.length){const ln=d.readUInt32BE(pos),typ=d.slice(pos+4,pos+8).toString();
  if(typ==='IDAT')idat=Buffer.concat([idat,d.slice(pos+8,pos+8+ln)]);pos+=12+ln;}
 return {w:d.readUInt32BE(16),h:d.readUInt32BE(20),raw:zlib.inflateSync(idat),stride:d.readUInt32BE(16)*3+1};}
(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport:{width:768,height:1024}, videoPath:null });
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
  await lib.waitText(p,'Modern Business Stay Apartment',40000); await sleep(2500);
  // scroll Buy now into view
  for(let i=0;i<16;i++){
    const vis=await p.evaluate(()=>{let ok=false;
      document.querySelectorAll('flt-semantics').forEach(e=>{
        if(ok)return; if((e.textContent||'').trim()!=='Buy now')return;
        const r=e.getBoundingClientRect(); if(r.top>60&&r.bottom<innerHeight-10) ok=true;});
      return ok;});
    if(vis)break;
    await p.mouse.move(380,600); await p.mouse.wheel(0,320); await sleep(240);
  }
  const btn = await p.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if((e.textContent||'').trim()!=='Buy now')return;
      const r=e.getBoundingClientRect(); if(r.width<8||r.height<8)return;
      if(r.bottom<=0||r.top>=innerHeight)return;
      if(!best||r.width*r.height<best.area)best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};});
    return best;});
  console.log('buynow:',JSON.stringify(btn));
  await p.mouse.click(Math.round(btn.cx),Math.round(btn.cy));
  const base=readPng(await (async()=>{await p.screenshot({path:'/tmp/b768-base.png'});return '/tmp/b768-base.png';})());
  let best=null;
  for(let f=0;f<16;f++){
    await p.screenshot({path:`/tmp/b768-f${f}.png`});
    const fr=readPng(`/tmp/b768-f${f}.png`);
    let diff=0,rows=new Set();
    for(let y=900;y<Math.min(1024,fr.h);y++){
      const r1=base.raw.slice(y*base.stride,(y+1)*base.stride),r2=fr.raw.slice(y*fr.stride,(y+1)*fr.stride);
      for(let x=1;x<r1.length;x+=3) if(Math.abs(r1[x]-r2[x])>25){diff++;rows.add(y);}
    }
    if(diff>300&&!best)best={f,diff,rows:[...rows]};
  }
  console.log('toast catch:',JSON.stringify(best));
  await ctx.close(); await browser.close();
})();
