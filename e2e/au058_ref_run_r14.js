// ref run for AU-058: :3000/notifications with the THROWAWAY r14 buyer logged in via
// the dev-backend login form? NO — the throwaway exists only on the sandbox. Instead:
// drive the reference with the sandbox-mirrored account that exists on BOTH backends
// (mobile.test.20260820@gmail.com) to capture the reference's STRUCTURE (tabs, cards,
// empty state) — the dataset delta is recorded as accepted divergence.
const { chromium } = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/node_modules/playwright');
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  for (const [vp, viewport] of [['mobile',{width:375,height:667}],['tablet',{width:768,height:1024}]]) {
    const ctx = await b.newContext({ viewport, recordVideo:{dir:'/home/devsystemadmin/GloboExpats_Mobile/e2e/videos', size:viewport} });
    const p = await ctx.newPage();
    await p.goto('http://localhost:3000/login?returnUrl=%2Fnotifications',{waitUntil:'domcontentloaded',timeout:60000});
    await p.waitForTimeout(2500);
    await p.locator('input[type="email"]').first().click({force:true}).catch(()=>{});
    await p.keyboard.type(L.BUYER.email,{delay:8});
    await p.locator('input[type="password"]').first().click({force:true}).catch(()=>{});
    await p.keyboard.type(L.BUYER.pw,{delay:8});
    await p.locator('button[type="submit"]').first().click({force:true}).catch(()=>{});
    await p.waitForTimeout(9000);
    console.log('URL:',p.url());
    // tabs
    const tabs=await p.evaluate(()=>[...document.querySelectorAll('[role="tab"],button')].map(b=>(b.textContent||'').trim()).filter(Boolean).slice(0,18));
    console.log('TABS/BUTTONS:',JSON.stringify(tabs));
    // metric tiles
    const tiles=await p.evaluate(()=>{const t=document.body.innerText; return ['Pending','Buying','Selling'].map(l=>{const i=t.indexOf(l);return l+':'+(i>=0?t.slice(Math.max(0,i-8),i).replace(/\n/g,'').trim():'?');})});
    console.log('TILES:',JSON.stringify(tiles));
    // actionable cards
    const cards=await p.evaluate(()=>[...document.querySelectorAll('article')].map(a=>(a.querySelector('h3')?.textContent||'').trim()).slice(0,10));
    console.log('ACTION CARDS:',JSON.stringify(cards));
    const bodyText=await p.evaluate(()=>document.body.innerText.slice(0,900));
    console.log('BODY:\n'+bodyText);
    await p.screenshot({path:`/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-058/AU-058-ref-${vp}-notifications.png`,fullPage:false});
    await p.screenshot({path:`/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-058/AU-058-ref-${vp}-notifications-full.png`,fullPage:true});
    await L.closeVideo(ctx, `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-058-r14-ref-${vp}.webm`);
  }
  await b.close();
})().catch(e=>{console.error('REF FATAL',e.message);process.exit(1)});
