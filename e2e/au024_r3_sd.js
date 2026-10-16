// au024_r3_sd.js — R3 SELLER_DELIVERY leg: full pre-click state audit.
const fs=require('fs');const path=require('path');
process.chdir(path.resolve(__dirname,'..'));
const L=require('./lib_verify.js');
const APP='http://localhost:9113';
const SHOT_DIR='e2e/shots/AU-024';
const fx=JSON.parse(fs.readFileSync('/tmp/au024_fixtures.json','utf8'));
const PROBE=`AU024 Enum Probe Chair ${fx.stamp}`;
const FEE=fx.quoteReal.deliveryTotal;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function txt(p){return p.evaluate(()=>document.body.innerText||'').then(t=>t.trim()?t:p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n'))).catch(()=>'');}
async function winRows(p){return p.evaluate(()=>{
 return [...document.querySelectorAll('flt-semantics')]
  .filter(e=>e.getAttribute('role')==='checkbox'&&/^(Today|Tomorrow) /.test(e.getAttribute('aria-label')||''))
  .map(e=>{const r=e.getBoundingClientRect();return {label:(e.getAttribute('aria-label')||'').split('\n')[0],checked:e.getAttribute('aria-checked')==='true',x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};});
}).catch(()=>[]);}
async function termsState(p){return p.evaluate(()=>{const e=[...document.querySelectorAll('flt-semantics')]
 .find(x=>x.getAttribute('role')==='checkbox'&&(x.getAttribute('aria-label')||'').includes('I agree'));
 if(!e)return null;const r=e.getBoundingClientRect();return {checked:e.getAttribute('aria-checked'),x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};});}
async function isLoggedIn(p){try{return !!(await p.evaluate(()=>localStorage.getItem('flutter.auth_token')||''));}catch(e){return false;}}
(async()=>{
 const fails=[]; const ok=(n,c,d)=>{console.log((c?'PASS ':'FAIL ')+n+(d?' :: '+d:''));if(!c)fails.push(n+': '+(d||''));return c;};
 const browser=await L.newBrowser();
 const ctx=await L.newCtx(browser,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-024-mobile-r3-sd-leg.webm'});
 const p=await ctx.newPage();
 const net={quote:[],prof:[],resp:null,respStatus:null};
 p.on('request',req=>{const u=req.url();
   if(u.includes('/api/v1/checkout/delivery-quote'))net.quote.push({auth:!!req.headers()['authorization'],post:req.postData()});
   if(u.includes('/api/v1/checkout/proforma')&&req.method()==='POST')net.prof.push({auth:!!req.headers()['authorization'],post:req.postData()});});
 p.on('response',async resp=>{if(resp.url().includes('/api/v1/checkout/proforma')&&resp.request().method()==='POST'){net.respStatus=resp.status();try{const j=await resp.json();net.resp=String(j.proformaId||j.id||'');}catch(e){}}});
 await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
 await L.waitText(p,'Buy now',45000);
 if(!(await isLoggedIn(p))){await L.clickBtn(p,'Login');await L.waitText(p,'Welcome back',25000);
  const ei=p.locator('input[type="text"]').first();await ei.click({force:true}).catch(()=>{});await sleep(400);
  await p.keyboard.type(fx.buyer.email,{delay:15});
  const pi=p.locator('input[type="password"]').first();await pi.click({force:true}).catch(()=>{});await sleep(400);
  await p.keyboard.type(fx.buyer.pw,{delay:15});await L.clickBtn(p,'Log in');
  for(let i=0;i<30&&!await isLoggedIn(p);i++)await sleep(1000);}
 ok('login',await isLoggedIn(p),'');
 await p.evaluate(()=>{Object.keys(localStorage).filter(k=>/expatCartItems/.test(k)).forEach(k=>localStorage.removeItem(k));});
 await p.goto(APP+'/#/search',{waitUntil:'load'}).catch(()=>{});await sleep(2800);
 await L.waitText(p,'Search',20000);
 const si=p.locator('input[type="text"]').first();await si.click({force:true}).catch(()=>{});await sleep(500);
 await p.keyboard.type(PROBE,{delay:20});await sleep(1300);await p.keyboard.press('Enter');await sleep(3000);
 await L.clickCard(p,PROBE);await sleep(2800);
 await L.clickBtn(p,'Add to cart');await sleep(1800);
 await p.goto(APP+'/#/cart',{waitUntil:'load'}).catch(()=>{});await sleep(2300);
 await L.clickBtn(p,'Go to checkout');await sleep(2600);
 const inp=p.locator('input[type="text"]');const ninp=await inp.count();
 await inp.nth(Math.max(0,ninp-1)).click({force:true}).catch(()=>{});await sleep(400);
 await p.keyboard.type('+255713000444',{delay:15});
 await p.mouse.move(187,400);for(let i=0;i<10;i++){await p.mouse.wheel(0,250);await sleep(140);}await sleep(700);
 ok('continue-to-review',await L.clickBtn(p,'Continue to review'),'SD path r3');
 let s2=false;for(let i=0;i<25&&!s2;i++){await sleep(1000);s2=(await txt(p)).includes('Step 2 of 4');}
 ok('step-2-reached',s2,'');await sleep(2500);
 // window pick (verified)
 await p.mouse.move(187,330);await p.mouse.wheel(0,260);await sleep(900);
 let rs=await winRows(p);
 for(let i=0;i<10&&rs.length<3;i++){await p.mouse.move(187,330);await p.mouse.wheel(0,170);await sleep(800);rs=await winRows(p);}
 ok('window-rows-present',rs.length>=1,JSON.stringify(rs.map(r=>r.label)));
 if(!rs.length){console.log('\nR3 fails:',JSON.stringify(fails.concat('no-window-rows')));await L.closeVideo(ctx,'e2e/videos/AU-024-mobile-r3-sd-leg.webm');await ctx.close().catch(()=>{});await browser.close();process.exit(0);}
 let row=rs.find(r=>!r.checked)||rs[0];
 for(let i=0;i<8;i++){if(row.y>=150&&row.y<=560)break;
  const d=row.y>560?row.y-420:-(220-row.y);
  await p.mouse.move(187,330);await p.mouse.wheel(0,d);await sleep(850);
  const fresh=await winRows(p);const f=fresh.find(z=>z.label===row.label);if(f)row=f;else break;}
 let checked=false;
 for(let a=1;a<=3&&!checked;a++){await p.mouse.click(row.x,row.y);await sleep(1100);
  let me=(await winRows(p)).find(z=>z.label===row.label);checked=!!(me&&me.checked);}
 ok('window-checked',checked,row?`${row.label} y=${row.y}`:'no row');
 // terms tick (verified)
 let ts=await termsState(p);
 for(let a=1;a<=4&&!(ts&&ts.checked==='true');a++){
  if(ts){await p.mouse.click(ts.x,Math.min(ts.y,640));await sleep(900);}
  ts=await termsState(p);
 }
 ok('terms-checked',!!ts&&ts.checked==='true',ts?('y='+ts.y):'not found');
 await L.screenshot(p,`${SHOT_DIR}/flutter-mobile-step2-r3-window-terms-ticked.png`);
 T2=await txt(p);
 ok('pre-confirm-error-free',!/Select at least one|Please agree/.test(T2),(T2.match(/Select at least one[^]*|Please agree[^]*/)||[''])[0].slice(0,80));
 // click confirm via geometry of its role=button node
 const btnBox=await p.evaluate(()=>{const els=[...document.querySelectorAll('flt-semantics')]
  .filter(e=>e.getAttribute('role')==='button'&&(e.textContent||'').includes('Confirm & proceed'));
  const out=[];els.forEach(e=>{const r=e.getBoundingClientRect();out.push({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),w:r.width,h:r.height});});return out;});
 console.log('confirm button boxes:',JSON.stringify(btnBox));
 let clicked=false;
 for(const b of btnBox){if(b.h<5)continue;await p.mouse.click(b.x,Math.min(b.y,640));clicked=true;break;}
 ok('confirm-geometry-clicked',clicked,'');
 let s3=false;for(let i=0;i<30&&!s3;i++){await sleep(1000);s3=(await txt(p)).includes('Step 3 of 4');}
 await sleep(1600);
 const T3=await txt(p);
 ok('step-3-reached',s3,T3.slice(0,60).replace(/\n/g,'|'));
 ok('invoice-number-shown',/Invoice\s+\S+/.test(T3),'proformaNumber rendered');
 await L.screenshot(p,`${SHOT_DIR}/flutter-mobile-step3-payment-SELLER_DELIVERY.png`);
 const lastCall=net.prof[net.prof.length-1];
 ok('wire-captured',!!lastCall&&lastCall.auth,`POST x${net.prof.length} resp=${net.respStatus}`);
 let parsed=null;try{parsed=JSON.parse(lastCall?lastCall.post||'null':'null');}catch(e){}
 const bd=parsed&&parsed.buyDetails;
 ok('C2-enum-on-wire',!!bd&&bd.fulfillmentType==='SELLER_DELIVERY','ft='+(bd&&bd.fulfillmentType));
 ok('C2-no-legacy-enum',!!lastCall&&!/(^|[^A-Z_])(SALE|CARD)([^A-Z_]|$)/.test(lastCall.post||''),'scan clean');
 ok('C3-deliveryFee-on-wire',!!bd&&bd.deliveryFee===FEE,`fee=${bd&&bd.deliveryFee} exp=${FEE}`);
 ok('C3-totalAmount-consistent',!!bd&&typeof bd.totalAmount==='number'&&bd.totalAmount===15000+FEE,`total=${bd&&bd.totalAmount}`);
 ok('C2-window-in-payload',!!bd&&Array.isArray(bd.preferredDeliveryWindows)&&bd.preferredDeliveryWindows.length>=1,JSON.stringify(bd&&bd.preferredDeliveryWindows));
 fs.writeFileSync('/tmp/au024_proforma_SELLER_DELIVERY.json',lastCall?lastCall.post||'':'');
 fs.writeFileSync('/tmp/au024_net_r3.json',JSON.stringify(net,null,1));
 if(net.resp){const c=await L.api(fx.buyer.token,'POST','/api/v1/proformas/'+net.resp+'/cancel').catch(()=>null);console.log('cancel own proforma',net.resp,c&&c.status);}
 await L.closeVideo(ctx,'e2e/videos/AU-024-mobile-r3-sd-leg.webm');
 await ctx.close().catch(()=>{});await browser.close();
 console.log('\nR3 fails:',JSON.stringify(fails));
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
