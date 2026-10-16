const L=require('./lib_verify.js');const fs=require('fs');
const fx=JSON.parse(fs.readFileSync('/tmp/au025_fixtures.json','utf8'));
const APP='http://localhost:9108';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await L.newBrowser();
 const ctx=await L.newCtx(browser,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-025-skeptic-a2.webm'});
 const p=await ctx.newPage();
 p.setDefaultTimeout(25000);
 const body=()=>p.evaluate(()=>document.body.innerText||'').then(t=>t.trim()?t:p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')));
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
 console.log('logged:',!!logged);
 await p.evaluate(()=>{Object.keys(localStorage).filter(k=>/expatCartItems/.test(k)).forEach(k=>localStorage.removeItem(k));});
 // A2: out-of-order — jump straight to /#/checkout with empty cart
 await p.goto(APP+'/#/checkout',{waitUntil:'load',timeout:60000}).catch(()=>{}); await sleep(3500);
 let T=await body();
 console.log('A2a-empty-cart-step1-shown:',T.includes('Step 1 of 4'),'| cart-note:',T.includes('Your cart is empty')?'empty-guard':'(no guard text)');
 // add item via UI then back-out mid-flow (step2 -> Back -> step1)
 await p.goto(APP+'/#/search',{waitUntil:'load',timeout:60000}).catch(()=>{}); await sleep(2500);
 const si=p.locator('input[type="text"]').first(); await si.click({force:true}); await sleep(400);
 await p.keyboard.type('AU025 Quote Probe Table '+fx.stamp,{delay:18}); await sleep(1200);
 await p.keyboard.press('Enter'); await sleep(3000);
 await L.clickCard(p,'AU025 Quote Probe Table '+fx.stamp); await sleep(2800);
 await L.clickBtn(p,'Add to cart'); await sleep(1800);
 await p.route('**/api/v1/checkout/delivery-quote',route=>{blocked++;return route.abort('failed');});
 await p.goto(APP+'/#/checkout',{waitUntil:'load',timeout:60000}).catch(()=>{}); await sleep(3500);
 const ph=p.locator('input[type="text"]').nth(3);
 await ph.click({force:true}); await sleep(400);
 await p.keyboard.type('+255713000333',{delay:14});
 const geomClick=async lbl=>{const c=await p.evaluate(l=>{const e=[...document.querySelectorAll('flt-semantics[role=button]')].find(e=>(e.textContent||'').includes(l));if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,bottom:r.bottom};},lbl); if(!c)return null; if(c.bottom>665){await p.mouse.wheel(0,c.bottom-667+90); await sleep(500);} const c2=await p.evaluate(l=>{const e=[...document.querySelectorAll('flt-semantics[role=button]')].find(e=>(e.textContent||'').includes(l));if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};},lbl); await p.mouse.click(c2.x,c2.y); return true;};
 let okc=false; for(let i=0;i<4&&!okc;i++){ okc=(await geomClick('Continue to review'))===true; if(!okc){await p.mouse.wheel(0,220);await sleep(500);} }
 let s2=false; for(let i=0;i<24&&!s2;i++){await sleep(800);T=await body();s2=T.includes('Step 2 of 4');}
 console.log('A2b step2 reached:',s2,'blocked:',blocked);
 await sleep(1500);
 // BACK OUT mid-flow from failing review
 T=await body();
 const hasBack=T.includes('Back');
 const geomClickBack=async lbl=>{const c=await p.evaluate(l=>{let best=null;document.querySelectorAll('flt-semantics[role=button]').forEach(e=>{if((e.textContent||'').trim()===l){const r=e.getBoundingClientRect();if(!best&&r.height>4)best={x:r.x+r.width/2,y:r.y+r.height/2,bottom:r.bottom};}});return best;},lbl); if(!c)return null; if(c.bottom>665){await p.mouse.wheel(0,c.bottom-667+90); await sleep(500);} return await p.evaluate(l=>{let b=null;document.querySelectorAll('flt-semantics[role=button]').forEach(e=>{if((e.textContent||'').trim()===l){const r=e.getBoundingClientRect();if(!b)b={x:r.x+r.width/2,y:r.y+r.height/2};}});return b;},lbl); };
 if(hasBack){
   const bc=await geomClickBack('Back');
   console.log('back-geom:',JSON.stringify(bc));
   if(bc){ await p.mouse.click(bc.x,bc.y); }
 }
 let s1=false; for(let i=0;i<15&&!s1;i++){await sleep(800);T=await body();s1=T.includes('Step 1 of 4');}
 console.log('A2c back-to-step1-from-failing-review:',s1);
 // re-enter: does it refetch (blocked++) and still fail gracefully?
 const before=blocked;
 let okc2=false; for(let i=0;i<4&&!okc2;i++){ okc=(await geomClick('Continue to review'))===true; if(!okc){await p.mouse.wheel(0,220);await sleep(500);} }
 let s2b=false; for(let i=0;i<20&&!s2b;i++){await sleep(800);T=await body();s2b=T.includes('Step 2 of 4');}
 await sleep(1500); T=await body();
 console.log('A2d re-entered step2:',s2b,'| refetched(delta):',blocked-before,'| still-failing:',T.includes('No route found'),'| fake-success:',T.includes('8,000'));
 await L.screenshot(p,'e2e/shots/AU-025/sk-a2-backout-refetch.png');
 fs.writeFileSync('/tmp/au025_sk_a2.json',JSON.stringify({blocked,text:T.slice(0,300)},null,1));
 await L.closeVideo(ctx,'e2e/videos/AU-025-skeptic-a2.webm');
 await ctx.close(); await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
