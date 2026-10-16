// Decisive: ordinary product 619 add-to-cart — does ANY cart write / toast happen?
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
  await p.goto(`${APP}/#/product/619`,{waitUntil:'load',timeout:90000}).catch(()=>{});
  await sleep(3000);
  const t = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')]
    .map(e=>(e.textContent||'').trim()).filter(x=>x&&x.length<60));
  console.log('619 texts:', JSON.stringify(t.slice(2,20)));
  const addBtn = await p.evaluate(()=>{ let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if((e.textContent||'').trim()!=='Add to cart') return;
      const r=e.getBoundingClientRect(); if(r.width<8||r.height<8) return;
      if(r.cy>innerHeight-40||r.cy<0) return;
      if(!best||r.width*r.height<best.area) best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};
    }); return best; });
  console.log('add:', JSON.stringify(addBtn));
  if(addBtn){
    await p.mouse.click(Math.round(addBtn.cx), Math.round(addBtn.cy)); await sleep(1800);
    const cart = await p.evaluate(()=>Object.keys(localStorage).filter(k=>/expatCartItems/i.test(k))
      .map(k=>(localStorage.getItem(k)||'').slice(0,200)));
    console.log('cart:', JSON.stringify(cart));
    // toast?
    for(let i=0;i<8;i++){ await sleep(280);
      const tt = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')]
        .map(e=>(e.textContent||'').trim()).filter(x=>/Added to cart|Only \d+ units/i.test(x)));
      if(tt.length){ console.log('TOAST:', JSON.stringify(tt)); break; }
      if(i===7) console.log('no toast node');
    }
    await p.screenshot({path:'/tmp/p619-after-add.png'});
  }
  await ctx.close(); await browser.close();
})();
