// CTA probe 5: does the button respond AT ALL? Compare a known-good snackbar path:
// tap Save (wishlist) which shows its own snackbar, then Add to cart. Watch semantics count.
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP = 'http://localhost:9108';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: null });
  const p = await ctx.newPage(); p.setDefaultTimeout(25000);
  await p.goto(`${APP}/#/login`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  if (!(await lib.isLoggedIn(p))) {
    await lib.waitText(p, 'Welcome back', 30000);
    const ei = p.locator('input[type="text"]').first(), pi = p.locator('input[type="password"]').first();
    await ei.click({ force: true }); await p.waitForTimeout(350); await p.keyboard.type(lib.BUYER.email);
    await pi.click({ force: true }); await p.waitForTimeout(350); await p.keyboard.type(lib.BUYER.pw);
    await lib.clickBtn(p, 'Log in');
    let ok=false; for(let i=0;i<30&&!ok;i++){ok=await lib.isLoggedIn(p); if(!ok) await p.waitForTimeout(1000);}
    console.log('login', ok);
  }
  await sleep(1000);
  await p.goto(`${APP}/#/product/470`, { waitUntil:'load',timeout:90000 }).catch(()=>{});
  await lib.waitText(p,'Modern Business Stay Apartment',40000); await sleep(2200);
  const count = () => p.evaluate(() => document.querySelectorAll('flt-semantics').length);
  async function findBtn(label){
    return p.evaluate((l)=>{ let best=null;
      document.querySelectorAll('flt-semantics').forEach(e=>{
        if((e.textContent||'').trim()!==l) return;
        const r=e.getBoundingClientRect();
        if(!best||r.width*r.height<best.area) best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};
      }); return best; }, label);
  }
  // baseline
  console.log('semantics before:', await count());
  // 1) Save (wishlist) — known to toast "Saved to your wishlist."
  const save = await findBtn('Save');
  if (save){ await p.mouse.click(Math.round(save.cx), Math.round(save.cy)); 
    for(let i=0;i<8;i++){ await sleep(400);
      const t = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')]
        .map(e=>(e.textContent||'').trim()).filter(x=>/wishlist|Saved/i.test(x)));
      if(t.length){ console.log('SAVE TOAST:', JSON.stringify(t)); break; } }
  } else console.log('no Save btn');
  await sleep(2500);
  console.log('semantics after save-toast:', await count());
  // 2) Add to cart with no dates
  const add = await findBtn('Add to cart');
  console.log('add btn', JSON.stringify(add));
  await p.mouse.click(Math.round(add.cx), Math.round(add.cy));
  for(let i=0;i<10;i++){ await sleep(400);
    const t = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')]
      .map(e=>({t:(e.textContent||'').trim(), y:Math.round(e.getBoundingClientRect().y)}))
      .filter(x=>x.t && /rental|Added|dates|cart|Select/i.test(x.t)));
    if(t.length){ console.log('ADD T+'+((i+1)*0.4).toFixed(1), JSON.stringify(t.slice(0,6))); } }
  console.log('semantics final:', await count());
  // 3) Start date button — does IT work? (calendar opens)
  const st = await findBtn('Start date');
  await p.mouse.click(Math.round(st.cx), Math.round(st.cy));
  for(let i=0;i<8;i++){ await sleep(350);
    const cal = await p.evaluate(()=>['OK','CANCEL'].every(w=>[...document.querySelectorAll('flt-semantics[role="button"]')]
      .some(e=>(e.textContent||'').trim().toUpperCase()===w)));
    if(cal){ console.log('START CALENDAR OPEN at T+'+((i+1)*0.35).toFixed(2)); break; } }
  console.log('semantics with calendar:', await count());
  await p.screenshot({path:'/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-016r2/diag-cta5-calendar.png'});
  await ctx.close(); await browser.close();
})();
