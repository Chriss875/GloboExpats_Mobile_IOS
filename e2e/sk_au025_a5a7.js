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
 console.log('app:',await L.waitText(p,'Buy now',45000));
 const tok=()=>p.evaluate(()=>localStorage.getItem('flutter.auth_token')||'');
 let logged=await tok();
 if(!logged){ await L.clickBtn(p,'Login'); await L.waitText(p,'Welcome back',25000);
  await p.locator('input[type="text"]').first().click({force:true}).catch(()=>{}); await sleep(400);
  await p.keyboard.type(fx.buyer.email,{delay:12});
  await p.locator('input[type="password"]').first().click({force:true}).catch(()=>{}); await sleep(400);
  await p.keyboard.type(fx.buyer.pw,{delay:12});
  await L.clickBtn(p,'Log in');
  for(let i=0;i<30&&!logged;i++){await sleep(1000);logged=await tok();} }
 console.log('logged:',!!logged);
 await p.evaluate(()=>{Object.keys(localStorage).filter(k=>/expatCartItems/.test(k)).forEach(k=>localStorage.removeItem(k));});
 await p.goto(APP+'/#/search',{waitUntil:'load',timeout:60000}).catch(()=>{}); await sleep(2500);
 const si=p.locator('input[type="text"]').first(); await si.click({force:true}).catch(()=>{}); await sleep(400);
 await p.keyboard.type('AU025 Quote Probe Table '+fx.stamp,{delay:18}); await sleep(1200);
 await p.keyboard.press('Enter'); await sleep(3000);
 const body=()=>p.evaluate(()=>document.body.innerText||'').then(t=>t.trim()?t:p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')));
 await L.clickCard(p,'AU025 Quote Probe Table '+fx.stamp); await sleep(2800);
 console.log('add-to-cart:',await L.clickBtn(p,'Add to cart')); await sleep(1800);

 // ===== A6/A7 leg: BLOCK endpoint, drive to failure, then go OFFLINE and retry =====
 await p.route('**/api/v1/checkout/delivery-quote',route=>{blocked++;return route.abort('failed');});
 await p.goto(APP+'/#/checkout',{waitUntil:'load',timeout:60000}).catch(()=>{}); await sleep(3500);
 // phone field = nth(1) per earlier bbox probe
 const ph=p.locator('input[type="text"]').nth(1);
 const pb=await ph.boundingBox().catch(()=>null); console.log('phone-bbox:',JSON.stringify(pb));
 if(pb){ await p.mouse.click(pb.x+pb.width/2,pb.y+pb.height/2); await sleep(500); await p.keyboard.type('+255713000333',{delay:14}); }
 const geomClick=async lbl=>{const c=await p.evaluate(l=>{const e=[...document.querySelectorAll('flt-semantics[role=button]')].find(e=>(e.textContent||'').includes(l));if(!e)return null;const r=e.getBoundingClientRect();if(r.bottom>innerHeight-4)return null;return {x:r.x+r.width/2,y:r.y+r.height/2};},lbl); if(!c)return 'offscreen'; await p.mouse.click(c.x,c.y); return true;};
 let r1=await geomClick('Continue to review'); if(r1==='offscreen'){ await p.mouse.wheel(0,220); await sleep(400); r1=await geomClick('Continue to review'); }
 console.log('continue-click:',r1);
 let s2=false,T=''; for(let i=0;i<24&&!s2;i++){await sleep(800);T=await body();s2=T.includes('Step 2 of 4');}
 console.log('A67 step2:',s2,'| blocked:',blocked);
 await sleep(2000); T=await body();
 const failNow=T.includes('No route found');
 console.log('A67 failure-label:',failNow,'| TBC:',T.includes('To be confirmed'));
 await L.screenshot(p,'e2e/shots/AU-025/sk-a6-failure-before-offline.png');
 // find Retry check geometry
 const retryGeom=async()=>p.evaluate(()=>{const e=[...document.querySelectorAll('flt-semantics[role=button]')].find(e=>(e.textContent||'').trim()==='Retry check');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,bottom:r.bottom};}).catch(()=>null);
 let rg=await retryGeom();
 if(!rg){ await L.scrollToBottom(p,10); await sleep(800); rg=await retryGeom(); }
 console.log('retry-geom:',JSON.stringify(rg));
 // GO OFFLINE then click retry
 await ctx.setOffline(true); await sleep(500);
 const before=blocked;
 if(rg){ await p.mouse.click(Math.max(5,rg.x),Math.min(rg.y,660)); await sleep(1500); }
 let after=await retryGeom();
 console.log('A6-offline retry clicked, blocked delta:',blocked-before,'(expect 0 — offline aborts before route?)');
 T=await body();
 console.log('A6-offline still failing:',T.includes('No route found')||T.includes('Calculation timed out'),'| fake-success:',T.includes('8,000'));
 await L.screenshot(p,'e2e/shots/AU-025/sk-a6-offline-retry.png');
 // BACK ONLINE + UNBLOCK, then retry -> real fee should render (recovery)
 await ctx.setOffline(false);
 await p.unroute('**/api/v1/checkout/delivery-quote');
 if(after){ await p.mouse.click(Math.max(5,after.x),Math.min(after.y,660)); }
 let recovered=false;
 for(let i=0;i<20&&!recovered;i++){ await sleep(1000); T=await body(); recovered=T.includes('8,000'); }
 console.log('A7-recovery fee rendered:',recovered,'| blocked total:',blocked);
 T=await body();
 console.log('A7 text:',T.slice(0,420).replace(/\n/g,'|'));
 await L.screenshot(p,'e2e/shots/AU-025/sk-a7-recovery.png');
 fs.writeFileSync('/tmp/au025_sk_a67.json',JSON.stringify({blocked,text:T.slice(0,700)},null,1));
 await L.closeVideo(ctx,'e2e/videos/AU-025-skeptic.webm');
 await ctx.close(); await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
