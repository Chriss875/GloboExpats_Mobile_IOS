const L=require('./lib_verify.js');const fs=require('fs');
const fx=JSON.parse(fs.readFileSync('/tmp/au025_fixtures.json','utf8'));
const APP='http://localhost:9108';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await L.newBrowser();
 const ctx=await L.newCtx(browser,{viewport:{width:375,height:667}});
 const p=await ctx.newPage();
 p.setDefaultTimeout(25000);
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
 await sleep(2000);
 // checkout via UI (Go to checkout) after adding item, so form hydrates
 await p.goto(APP+'/#/checkout',{waitUntil:'load',timeout:60000}).catch(()=>{}); await sleep(4000);
 let T=await p.evaluate(()=>document.body.innerText||'');
 console.log('has-first-name-label:',T.includes('First name'),'| has-email:',T.includes('Email'));
 const n=await p.locator('input[type="text"]').count();
 for(let i=0;i<n;i++){ const inp=p.locator('input[type="text"]').nth(i); const v=await inp.inputValue().catch(()=>'?'); const bb=await inp.boundingBox().catch(()=>null); console.log(i,'value=',JSON.stringify(v),'bbox=',JSON.stringify(bb)); }
 process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
