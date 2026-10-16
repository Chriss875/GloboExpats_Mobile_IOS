// CTA probe 12 (FINAL): use Playwright video-independent rapid screenshots via CDP
// screencast frames is heavy; instead click and IMMEDIATELY screenshot in a tight loop
// with 60ms gaps, saving each, then find the frame containing the toast and dump its
// semantics AT THAT MOMENT via a parallel evaluate racing the screenshots.
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
  await p1.close();
  const p = await ctx.newPage();
  await p.goto(`${APP}/#/product/470`, { waitUntil:'load',timeout:90000 }).catch(()=>{});
  await lib.waitText(p,'Modern Business Stay Apartment',40000); await sleep(2200);
  const btn = await p.evaluate(()=>{ let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if((e.textContent||'').trim()!=='Add to cart') return;
      const r=e.getBoundingClientRect(); if(r.width<8||r.height<8) return;
      if(!best||r.width*r.height<best.area) best={area:r.width*r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};
    }); return best; });
  // race: click then loop of evaluate-only polls with NO sleep between
  await p.mouse.click(Math.round(btn.cx), Math.round(btn.cy));
  let hit=null;
  for (let i=0;i<400;i++){
    const texts = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
      .map(e=>(e.textContent||'').trim()));
    const m = texts.find(x=>/rental dates|Added to cart|own listed items/i.test(x));
    if(m){ hit={poll:i,text:m}; break; }
  }
  console.log('race result:', JSON.stringify(hit));
  // Also: maybe semantics never expose it. Take a burst of 12 screenshots at ~70ms.
  for(let f=0;f<12;f++){ await p.screenshot({path:`/tmp/burst-${f}.png`}); }
  console.log('burst saved');
  await ctx.close(); await browser.close();
})();
