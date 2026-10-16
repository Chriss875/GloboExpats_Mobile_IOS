const L=require('./lib_verify.js');const fs=require('fs');
const fx=JSON.parse(fs.readFileSync('/tmp/au025_fixtures.json','utf8'));
const APP='http://localhost:9108';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await L.newBrowser();
 const ctx=await L.newCtx(browser,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-025-skeptic-a9.webm'});
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
 // A10: corrupt the persisted auth token -> step1 should not quote with bad creds
 await p.evaluate(()=>localStorage.setItem('flutter.auth_token','eyJhbGciOiJIUzM4NCJ9.corruptedsig'));
 await p.goto(APP+'/#/checkout',{waitUntil:'load',timeout:60000}).catch(()=>{}); await sleep(4000);
 let T=await body();
 console.log('A10-corrupt-token gate:',T.includes('Log in')||T.includes('Welcome back')?'redirected-to-login':(T.includes('Step 1 of 4')?'stayed-step1':'?'),T.slice(0,90).replace(/\n/g,'|'));
 // restore token
 await p.evaluate(t=>localStorage.setItem('flutter.auth_token',t),fx.buyer.token); await sleep(800);
 // A9: invalid input — 500-char phone string
 await p.goto(APP+'/#/checkout',{waitUntil:'load',timeout:60000}).catch(()=>{}); await sleep(3500);
 const ph=p.locator('input[type="text"]').nth(3);
 await ph.click({force:true}); await sleep(400);
 await p.keyboard.type('9'.repeat(120),{delay:2}); await sleep(300);
 console.log('A9-phone-value-len:',(await ph.inputValue().catch(()=>'')).length);
 T=await body();
 // continue should be blocked by validator (required only) or proceed; check no crash
 const geomClick=async lbl=>{const c=await p.evaluate(l=>{const e=[...document.querySelectorAll('flt-semantics[role=button]')].find(e=>(e.textContent||'').includes(l));if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,bottom:r.bottom};},lbl); if(!c)return null; if(c.bottom>665){await p.mouse.wheel(0,c.bottom-667+90); await sleep(500);} const c2=await p.evaluate(l=>{const e=[...document.querySelectorAll('flt-semantics[role=button]')].find(e=>(e.textContent||'').includes(l));if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};},lbl); await p.mouse.click(c2.x,c2.y); return true;};
 let okc=false; for(let i=0;i<4&&!okc;i++){ okc=(await geomClick('Continue to review'))===true; if(!okc){await p.mouse.wheel(0,220);await sleep(500);} }
 console.log('A9 continue-clicked:',okc);
 let s2=false; for(let i=0;i<20&&!s2;i++){await sleep(700);T=await body();s2=T.includes('Step 2 of 4');}
 console.log('A9 reached-step2-with-garbage-phone:',s2);
 T=await body();
 console.log('A9 phone-rendered-truncated:',T.includes('+255713000333'),'| app-alive:',T.includes('Checkout'));
 await L.screenshot(p,'e2e/shots/AU-025/sk-a9-invalid-phone.png');
 fs.writeFileSync('/tmp/au025_sk_a9.json',JSON.stringify({step2:T.slice(0,400)},null,1));
 await L.closeVideo(ctx,'e2e/videos/AU-025-skeptic-a9.webm');
 await ctx.close(); await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
