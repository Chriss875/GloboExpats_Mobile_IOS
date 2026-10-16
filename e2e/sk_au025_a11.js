const L=require('./lib_verify.js');const fs=require('fs');
const fx=JSON.parse(fs.readFileSync('/tmp/au025_fixtures.json','utf8'));
const APP='http://localhost:9108';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await L.newBrowser();
 const ctx=await L.newCtx(browser,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-025-skeptic-a11.webm'});
 const p=await ctx.newPage();
 p.setDefaultTimeout(25000);
 let blocked=0;
 const body=()=>p.evaluate(()=>document.body.innerText||'').then(t=>t.trim()?t:p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')));
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
 // A11: session-expiry probe — 401 from quote endpoint (simulates expired JWT)
 await p.route('**/api/v1/checkout/delivery-quote',route=>{blocked++;route.fulfill({status:401,contentType:'application/json',body:'{"errorCode":"UNAUTHORIZED","message":"token expired"}'});});
 await p.evaluate(()=>{Object.keys(localStorage).filter(k=>/expatCartItems/.test(k)).forEach(k=>localStorage.removeItem(k));});
 await p.goto(APP+'/#/search',{waitUntil:'load',timeout:60000}).catch(()=>{}); await sleep(2500);
 const si=p.locator('input[type="text"]').first(); await si.click({force:true}); await sleep(400);
 await p.keyboard.type('AU025 Quote Probe Table '+fx.stamp,{delay:18}); await sleep(1200);
 await p.keyboard.press('Enter'); await sleep(3000);
 await L.clickCard(p,'AU025 Quote Probe Table '+fx.stamp); await sleep(2800);
 console.log('add-to-cart:',await L.clickBtn(p,'Add to cart')); await sleep(1800);
 await p.goto(APP+'/#/checkout',{waitUntil:'load',timeout:60000}).catch(()=>{}); await sleep(3500);
 const ph=p.locator('input[type="text"]').nth(3);
 await ph.click({force:true}); await sleep(400);
 await p.keyboard.type('+255713000333',{delay:14});
 const geomClick=async lbl=>{const c=await p.evaluate(l=>{const e=[...document.querySelectorAll('flt-semantics[role=button]')].find(e=>(e.textContent||'').includes(l));if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,bottom:r.bottom};},lbl); if(!c)return null; if(c.bottom>665){await p.mouse.wheel(0,c.bottom-667+90); await sleep(500);} const c2=await p.evaluate(l=>{const e=[...document.querySelectorAll('flt-semantics[role=button]')].find(e=>(e.textContent||'').includes(l));if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};},lbl); await p.mouse.click(c2.x,c2.y); return true;};
 let okc=false; for(let i=0;i<4&&!okc;i++){ okc=(await geomClick('Continue to review'))===true; if(!okc){await p.mouse.wheel(0,220);await sleep(500);} }
 console.log('A11 continue-clicked:',okc,'| blocked:',blocked);
 let s2=false; for(let i=0;i<24&&!s2;i++){await sleep(800);let T=await body();s2=T.includes('Step 2 of 4');}
 await sleep(2000);
 const T=await body();
 console.log('A11 step2:',s2,'| failure-label:',T.includes('No route found'),'| fake-success:',T.includes('8,000'),'| still-logged-in:',!!(await tok()));
 console.log('A11 text:',T.slice(0,320).replace(/\n/g,'|'));
 await L.screenshot(p,'e2e/shots/AU-025/sk-a11-quote-401.png');
 fs.writeFileSync('/tmp/au025_sk_a11.json',JSON.stringify({blocked,text:T.slice(0,400)},null,1));
 await L.closeVideo(ctx,'e2e/videos/AU-025-skeptic-a11.webm');
 await ctx.close(); await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
