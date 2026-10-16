const L=require('./lib_verify.js');const fs=require('fs');
const fx=JSON.parse(fs.readFileSync('/tmp/au025_fixtures.json','utf8'));
const APP='http://localhost:9108';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await L.newBrowser();
 const ctxT=await L.newCtx(browser,{viewport:{width:768,height:1024},videoPath:'e2e/videos/AU-025-skeptic-tablet.webm'});
 const pt=await ctxT.newPage();
 pt.setDefaultTimeout(25000);
 let blocked=0;
 const body=pp=>pp.evaluate(()=>document.body.innerText||'').then(t=>t.trim()?t:pp.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')));
 await pt.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
 await L.waitText(pt,'Buy now',45000);
 const tok=()=>pt.evaluate(()=>localStorage.getItem('flutter.auth_token')||'');
 let logged=await tok();
 if(!logged){ await L.clickBtn(pt,'Login'); await L.waitText(pt,'Welcome back',25000);
  await pt.locator('input[type="text"]').first().click({force:true}); await sleep(400);
  await pt.keyboard.type(fx.buyer.email,{delay:12});
  await pt.locator('input[type="password"]').first().click({force:true}); await sleep(400);
  await pt.keyboard.type(fx.buyer.pw,{delay:12});
  await L.clickBtn(pt,'Log in');
  for(let i=0;i<30&&!logged;i++){await sleep(1000);logged=await tok();} }
 console.log('tablet logged:',!!logged);
 await pt.evaluate(()=>{Object.keys(localStorage).filter(k=>/expatCartItems/.test(k)).forEach(k=>localStorage.removeItem(k));});
 await pt.goto(APP+'/#/search',{waitUntil:'load',timeout:60000}).catch(()=>{}); await sleep(2500);
 const si=pt.locator('input[type="text"]').first(); await si.click({force:true}); await sleep(400);
 await pt.keyboard.type('AU025 Quote Probe Table '+fx.stamp,{delay:18}); await sleep(1200);
 await pt.keyboard.press('Enter'); await sleep(3000);
 await L.clickCard(pt,'AU025 Quote Probe Table '+fx.stamp); await sleep(2800);
 console.log('add-to-cart:',await L.clickBtn(pt,'Add to cart')); await sleep(1800);
 // block endpoint -> failure at TABLET viewport (verifier only showed tablet happy path)
 await pt.route('**/api/v1/checkout/delivery-quote',route=>{blocked++;return route.abort('failed');});
 await pt.goto(APP+'/#/checkout',{waitUntil:'load',timeout:60000}).catch(()=>{}); await sleep(3500);
 const ph=pt.locator('input[type="text"]').nth(3);
 await ph.click({force:true}); await sleep(400);
 await pt.keyboard.type('+255713000333',{delay:14});
 const geomClick=async(pp,lbl)=>{const c=await pp.evaluate(l=>{const e=[...document.querySelectorAll('flt-semantics[role=button]')].find(e=>(e.textContent||'').includes(l));if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,bottom:r.bottom};},lbl); if(!c)return null; if(c.bottom>1020){await pp.mouse.wheel(0,c.bottom-1024+90); await sleep(500);} const c2=await pp.evaluate(l=>{const e=[...document.querySelectorAll('flt-semantics[role=button]')].find(e=>(e.textContent||'').includes(l));if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};},lbl); await pp.mouse.click(c2.x,c2.y); return true;};
 let okc=false; for(let i=0;i<4&&!okc;i++){ okc=(await geomClick(pt,'Continue to review'))===true; if(!okc){await pt.mouse.wheel(0,260);await sleep(500);} }
 console.log('A12 continue-clicked:',okc,'| blocked:',blocked);
 let s2=false,T=''; for(let i=0;i<24&&!s2;i++){await sleep(800);T=await body(pt);s2=T.includes('Step 2 of 4');}
 await sleep(2200); T=await body(pt);
 console.log('A12 tablet failure-label:',T.includes('No route found'),'| TBC:',T.includes('To be confirmed'),'| fake-success:',T.includes('8,000'));
 await L.screenshot(pt,'e2e/shots/AU-025/sk-a12-tablet-failure.png');
 fs.writeFileSync('/tmp/au025_sk_a12.json',JSON.stringify({blocked,text:T.slice(0,300)},null,1));
 await L.closeVideo(ctxT,'e2e/videos/AU-025-skeptic-tablet.webm');
 await ctxT.close(); await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
