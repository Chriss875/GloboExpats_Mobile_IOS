// CTA probe 9: instrument Flutter's own snackbar path — hook ScaffoldMessenger via
// JS is impossible; instead check whether the click even reaches Flutter: listen to
// pointer events on flutter-view, and diff DOM. Then compare with a WORKING screen's
// snackbar (cart_screen clear-all) to see if snackbars EVER render in this bundle.
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP = 'http://localhost:9108';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: null });
  const p1 = await ctx.newPage();
  await p1.goto(`${APP}/#/login`, { waitUntil:'load',timeout:90000 }).catch(()=>{});
  if (!(await lib.isLoggedIn(p1))) {
    await lib.waitText(p1,'Welcome back',30000);
    const ei=p1.locator('input[type="text"]').first(), pi=p1.locator('input[type="password"]').first();
    await ei.click({force:true}); await p1.waitForTimeout(350); await p1.keyboard.type(lib.BUYER.email);
    await pi.click({force:true}); await p1.waitForTimeout(350); await p1.keyboard.type(lib.BUYER.pw);
    await lib.clickBtn(p1,'Log in');
    let ok=false; for(let i=0;i<30&&!ok;i++){ok=await lib.isLoggedIn(p1); if(!ok) await p1.waitForTimeout(1000);}
    console.log('login', ok);
  }
  // add an ordinary product to the cart first so cart screen has content
  const p2 = await ctx.newPage();
  await p2.goto(`${APP}/#/product/627`, { waitUntil:'load',timeout:90000 }).catch(()=>{});
  await lib.waitText(p2,'Fixture WhatsApp',40000); await sleep(2000);
  // this is OUR OWN listing → own-item guard should toast. Tap Buy now.
  const buy = await p2.evaluate(()=>{ let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if((e.textContent||'').trim()!=='Buy now') return;
      const r=e.getBoundingClientRect(); if(r.width<8||r.height<8) return;
      if(!best||r.width*r.height<best.area) best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};
    }); return best; });
  console.log('buy btn on own listing:', JSON.stringify(buy));
  const before = await p2.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .map(e => (e.textContent||'').trim()).filter(x=>x&&x.length<90).sort());
  if(buy){ await p2.mouse.click(Math.round(buy.cx), Math.round(buy.cy));
    for(let i=0;i<12;i++){ await sleep(280);
      const after = await p2.evaluate(() => [...document.querySelectorAll('flt-semantics')]
        .map(e => (e.textContent||'').trim()).filter(x=>x&&x.length<90).sort());
      const delta = after.filter(x => !before.includes(x));
      if(delta.length){ console.log('T+'+((i+1)*0.28).toFixed(2), JSON.stringify(delta.slice(0,6))); break; }
      if(i===11) console.log('own-item guard: NO delta');
    } }
  await ctx.close(); await browser.close();
})();
