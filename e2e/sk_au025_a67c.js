const L=require('./lib_verify.js');const fs=require('fs');
const fx=JSON.parse(fs.readFileSync('/tmp/au025_fixtures.json','utf8'));
const APP='http://localhost:9108';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await L.newBrowser();
 const ctx=await L.newCtx(browser,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-025-skeptic.webm'});
 const p=await ctx.newPage();
 p.setDefaultTimeout(25000);
 let blocked=0;
 await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
 await L.waitText(p,'Buy now',45000);
 const tok=()=>p.evaluate(()=>localStorage.getItem('flutter.auth_token')||'');
 let logged=await tok();
 if(!logged){ await L.clickBtn(p,'Login'); await L.waitText(p,'Welcome back',25000);
  await p.locator('input[type="text"]').first().click({force:true}); await sleep(400);
  await p.keyboard.type(fx.buyer.email,{delay:12});
  await p.locator('input[type="password"]').first().click({force:true}); await sleep(400);
  await p.keyboard.type(fx.buyer.pw,{delay:12});
  await L.clickBtn(p,'Log in');
  for(let i=0;i<30&&!logged;i++){await sleep(1000);logged=await tok();} }
 await p.evaluate(()=>{Object.keys(localStorage).filter(k=>/expatCartItems/.test(k)).forEach(k=>localStorage.removeItem(k));});
 await p.goto(APP+'/#/search',{waitUntil:'load',timeout:60000}).catch(()=>{}); await sleep(2500);
 const si=p.locator('input[type="text"]').first(); await si.click({force:true}); await sleep(400);
 await p.keyboard.type('AU025 Quote Probe Table '+fx.stamp,{delay:18}); await sleep(1200);
 await p.keyboard.press('Enter'); await sleep(3000);
 const body=()=>p.evaluate(()=>document.body.innerText||'').then(t=>t.trim()?t:p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')));
 await L.clickCard(p,'AU025 Quote Probe Table '+fx.stamp); await sleep(2800);
 console.log('add-to-cart:',await L.clickBtn(p,'Add to cart')); await sleep(1800);
 // go to checkout, then arm block (page object persists across hash change)
 await p.goto(APP+'/#/checkout',{waitUntil:'load',timeout:60000}).catch(()=>{}); await sleep(3500);
 await p.route('**/api/v1/checkout/delivery-quote',route=>{blocked++;return route.abort('failed');});
 // fill phone: click bbox then type; verify via DOM input value
 const ph=p.locator('input[type="text"]').nth(1);
 const pb=await ph.boundingBox().catch(()=>null); console.log('phone-bbox:',JSON.stringify(pb));
 if(pb){ await p.mouse.click(pb.x+pb.width/2,pb.y+pb.height/2); await sleep(500);
   await p.keyboard.type('+255713000333',{delay:16});
   const val=await ph.inputValue().catch(()=>'?');
   console.log('phone-dom-value:',val);
 }
 const geomClick=async lbl=>{const c=await p.evaluate(l=>{const e=[...document.querySelectorAll('flt-semantics[role=button]')].find(e=>(e.textContent||'').includes(l));if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,bottom:r.bottom};},lbl); if(!c)return null; if(c.bottom>667-2){await p.mouse.wheel(0,c.bottom-667+90); await sleep(500);} const c2=await p.evaluate(l=>{const e=[...document.querySelectorAll('flt-semantics[role=button]')].find(e=>(e.textContent||'').includes(l));if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};},lbl); await p.mouse.click(c2.x,c2.y); return true;};
 let okc=false; for(let i=0;i<4&&!okc;i++){ okc=(await geomClick('Continue to review'))===true; if(!okc){await p.mouse.wheel(0,220);await sleep(500);} }
 console.log('continue-clicked:',okc,'| blocked:',blocked);
 let s2=false,T=''; for(let i=0;i<24&&!s2;i++){await sleep(800);T=await body();s2=T.includes('Step 2 of 4');}
 console.log('step2-reached:',s2,'| blocked:',blocked);
 await sleep(2000); T=await body();
 console.log('A67 failure-label:',T.includes('No route found'),'| TBC:',T.includes('To be confirmed'),'| fake-success:',T.includes('8,000'));
 await L.screenshot(p,'e2e/shots/AU-025/sk-a6-failure-before-offline.png');
 fs.writeFileSync('/tmp/au025_sk_a6_state.json',JSON.stringify({blocked,text:T.slice(0,500)},null,1));
 // A6 offline retry
 const retryGeom=async()=>p.evaluate(()=>{let best=null;document.querySelectorAll('flt-semantics[role=button]').forEach(e=>{if((e.textContent||'').trim()==='Retry check'){const r=e.getBoundingClientRect();if(r.bottom>4&&r.top<innerHeight-4)best={x:r.x+r.width/2,y:r.y+r.height/2};}});return best;}).catch(()=>null);
 let rg=await retryGeom(); if(!rg){ await L.scrollToBottom(p,12); await sleep(900); rg=await retryGeom(); }
 console.log('retry-geom:',JSON.stringify(rg));
 if(rg){
  await ctx.setOffline(true); await sleep(700);
  const before=blocked;
  await p.mouse.click(Math.max(5,rg.x),Math.min(rg.y,660)); await sleep(2000);
  console.log('offline-retry delta-blocked:',blocked-before);
  T=await body();
  console.log('A6-offline-still-failing:',T.includes('No route found'),'| fake-success:',T.includes('8,000'));
  await L.screenshot(p,'e2e/shots/AU-025/sk-a6-offline-retry.png');
  await ctx.setOffline(false); await sleep(800);
  await p.unroute('**/api/v1/checkout/delivery-quote'); await sleep(300);
  const rg2=await retryGeom(); 
  if(rg2) { await p.mouse.click(Math.max(5,rg2.x),Math.min(rg2.y,660)); }
  else { console.log('no retry btn visible after unrouted — scroll'); await L.scrollToBottom(p,8); const rg3=await retryGeom(); if(rg3) await p.mouse.click(Math.max(5,rg3.x),Math.min(rg3.y,660)); }
  let recovered=false; for(let i=0;i<20&&!recovered;i++){ await sleep(1000); T=await body(); recovered=T.includes('8,000'); }
  console.log('A7-recovery-fee-rendered:',recovered);
  T=await body();
  console.log('A7 text:',T.slice(0,430).replace(/\n/g,'|'));
  await L.screenshot(p,'e2e/shots/AU-025/sk-a7-recovery.png');
 }
 fs.writeFileSync('/tmp/au025_sk_a67.json',JSON.stringify({blocked,text:T.slice(0,700)},null,1));
 await L.closeVideo(ctx,'e2e/videos/AU-025-skeptic.webm');
 await ctx.close(); await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
