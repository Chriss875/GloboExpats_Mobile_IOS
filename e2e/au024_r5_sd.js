// au024_r5_sd.js — R5: SD leg, single context, cart seeded via REAL UI (r1's proven path).
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
 const ctx=await L.newCtx(browser,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-024-mobile-r5-sd-leg.webm'});
 const p=await ctx.newPage();
 const net={quote:[],prof:[],resp:null,respStatus:null};
 p.on('request',req=>{const u=req.url();
   if(u.includes('/api/v1/checkout/delivery-quote'))net.quote.push({auth:!!req.headers()['authorization'],post:req.postData()});
   if(u.includes('/api/v1/checkout/proforma')&&req.method()==='POST')net.prof.push({auth:!!req.headers()['authorization'],post:req.postData()});});
 p.on('response',async resp=>{if(resp.url().includes('/api/v1/checkout/proforma')&&resp.request().method()==='POST'){net.respStatus=resp.status();try{const j=await resp.json();net.resp=String(j.proformaId||j.id||'');}catch(e){}}});
 // ---- home -> search -> detail -> add to cart, ONE page ----
 await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
 ok('app-loaded',await L.waitText(p,'Buy now',45000),'');
 if(!(await isLoggedIn(p))){ok('login-open',await L.clickBtn(p,'Login'),'');
  await L.waitText(p,'Welcome back',25000);
  const ei=p.locator('input[type="text"]').first();await ei.click({force:true}).catch(()=>{});await sleep(400);
  await p.keyboard.type(fx.buyer.email,{delay:15});
  const pi=p.locator('input[type="password"]').first();await pi.click({force:true}).catch(()=>{});await sleep(400);
  await p.keyboard.type(fx.buyer.pw,{delay:15});
  ok('login-submit',await L.clickBtn(p,'Log in'),'');
  let lg=false;for(let i=0;i<30&&!lg;i++){await sleep(1000);lg=await isLoggedIn(p);}
  ok('login-token',lg,'');}
 else ok('login-token',true,'already logged in');
 await sleep(1200);
 // navigate to search via bottom nav / deep link INSIDE the SPA
 ok('nav-search-tab',(await clickTab(p))||true,'');
 async function clickTab(p){
   for(const lbl of ['Search']){ if(await L.clickBtn(p,lbl)) return true; }
   return false;
 }
 await sleep(1500);
 T=await txt(p);
 if(!T.includes('Search')) { await p.goto(APP+'/#/search',{waitUntil:'load'}).catch(()=>{}); await sleep(3000); }
 // type query
 const si=p.locator('input[type="text"]').first();
 await si.click({force:true}).catch(()=>{});await sleep(600);
 await p.keyboard.insertText(PROBE);await sleep(1800);
 let beforeUrl=p.url();
 await p.keyboard.press('Enter');await sleep(3500);
 T=await txt(p);
 ok('search-results-show-probe',T.includes(PROBE),`url ${beforeUrl}->${p.url()}`);
 await L.screenshot(p,`${SHOT_DIR}/flutter-mobile-r5-search.png`);
 ok('open-detail',await L.clickCard(p,PROBE),'tap fixture card');await sleep(3200);
 T=await txt(p);
 ok('detail-add-to-cart-present',T.includes('Add to cart'),'detail loaded');
 ok('add-to-cart',await L.clickBtn(p,'Add to cart'),'');await sleep(2400);
 T=await txt(p);
 console.log('after add:',T.slice(0,80).replace(/\n/g,'|'));
 // go to checkout through the UI
 ok('nav-cart',await L.clickBtn(p,'Cart')||true,'cart tab');await sleep(2000);
 T=await txt(p);
 if(!T.includes('Your cart')){ await p.goto(APP+'/#/cart',{waitUntil:'load'}).catch(()=>{});await sleep(2600);T=await txt(p); }
 ok('cart-has-item',!T.includes('Your cart is empty'),T.slice(0,50).replace(/\n/g,'|'));
 ok('go-to-checkout',await L.clickBtn(p,'Go to checkout'),'cart CTA');await sleep(3000);
 T=await txt(p);
 ok('step1-visible',T.includes('Step 1 of 4'),T.slice(0,40).replace(/\n/g,'|'));
 const inp=p.locator('input[type="text"]');let ninp=await inp.count();
 await inp.nth(Math.max(0,ninp-1)).click({force:true}).catch(()=>{});await sleep(500);
 await p.keyboard.insertText('+255713000444');await sleep(500);
 await p.mouse.move(187,400);for(let i=0;i<10;i++){await p.mouse.wheel(0,250);await sleep(150);}await sleep(900);
 ok('continue-to-review',await L.clickBtn(p,'Continue to review'),'SD path r5');
 let s2=false;for(let i=0;i<30&&!s2;i++){await sleep(1000);s2=(await txt(p)).includes('Step 2 of 4');}
 await sleep(3000);
 T=await txt(p);
 ok('step-2-reached',s2,T.slice(0,60).replace(/\n/g,'|'));
 let fee=T.includes(Number(FEE).toLocaleString('en-US'));
 for(let i=0;i<16&&!fee;i++){await sleep(1000);T=await txt(p);fee=T.includes(Number(FEE).toLocaleString('en-US'));}
 ok('fee-rendered',fee,`TSh ${FEE}; quote calls=${net.quote.length}`);
 await p.mouse.move(187,330);await p.mouse.wheel(0,280);await sleep(1000);
 let rs=await winRows(p);
 for(let i=0;i<12&&rs.length<3;i++){await p.mouse.move(187,330);await p.mouse.wheel(0,180);await sleep(900);rs=await winRows(p);}
 ok('window-rows-present',rs.length>=1,JSON.stringify(rs.map(r=>`${r.label}@${r.y}${r.checked?'[x]':''}`)));
 if(!rs.length){await L.screenshot(p,`${SHOT_DIR}/flutter-mobile-step2-r5-no-windows.png`);fs.writeFileSync('/tmp/au024_r5_text.txt',T);
   console.log('\nR5 fails:',JSON.stringify(fails));await L.closeVideo(ctx,'e2e/videos/AU-024-mobile-r5-sd-leg.webm');await ctx.close().catch(()=>{});await browser.close();process.exit(0);}
 let row=rs.find(r=>!r.checked)||rs[0];
 for(let i=0;i<8;i++){if(row.y>=150&&row.y<=560)break;
  const d=row.y>560?row.y-420:-(220-row.y);
  await p.mouse.move(187,330);await p.mouse.wheel(0,d);await sleep(900);
  const fresh=await winRows(p);const f=fresh.find(z=>z.label===row.label);if(f)row=f;else break;}
 let checked=false;
 for(let a=1;a<=3&&!checked;a++){await p.mouse.click(row.x,row.y);await sleep(1200);
  let me=(await winRows(p)).find(z=>z.label===row.label);checked=!!(me&&me.checked);}
 ok('window-checked',checked,row?`${row.label} y=${row.y}`:'no row');
 let ts=await termsState(p);
 for(let a=1;a<=4&&!(ts&&ts.checked==='true');a++){
  if(ts){await p.mouse.click(ts.x,Math.min(ts.y,640));await sleep(950);}
  ts=await termsState(p);}
 ok('terms-checked',!!ts&&ts.checked==='true',ts?('y='+ts.y):'not found');
 await L.screenshot(p,`${SHOT_DIR}/flutter-mobile-step2-r5-window-terms-ticked.png`);
 T=await txt(p);
 ok('pre-confirm-no-validation-error',!/Select at least one|Please agree/.test(T),(T.match(/Select at least one[^]*|Please agree[^]*/)||[''])[0].slice(0,90));
 ok('confirm-clicked',await L.clickBtn(p,'Confirm & proceed to payment'),'step2 -> step3');
 let s3=false;for(let i=0;i<30&&!s3;i++){await sleep(1000);s3=(await txt(p)).includes('Step 3 of 4');}
 await sleep(1800);
 T=await txt(p);
 ok('step-3-reached',s3,T.slice(0,70).replace(/\n/g,'|'));
 ok('invoice-number-shown',/Invoice\s+\S+/.test(T),'proformaNumber rendered');
 await L.screenshot(p,`${SHOT_DIR}/flutter-mobile-step3-payment-SELLER_DELIVERY.png`);
 const lastCall=net.prof[net.prof.length-1];
 ok('wire-captured',!!lastCall&&lastCall.auth,`POST x${net.prof.length} resp=${net.respStatus}`);
 let parsed=null;try{parsed=JSON.parse(lastCall?lastCall.post||'null':'null');}catch(e){}
 const bd=parsed&&parsed.buyDetails;
 ok('C2-enum-on-wire',!!bd&&bd.fulfillmentType==='SELLER_DELIVERY','ft='+(bd&&bd.fulfillmentType));
 ok('C2-no-legacy-enum-anywhere',!!lastCall&&!/(^|[^A-Z_])(SALE|CARD)([^A-Z_]|$)/.test(lastCall.post||''),`scan over ${((lastCall||{}).post||'').length} bytes`);
 ok('C3-deliveryFee-on-wire',!!bd&&bd.deliveryFee===FEE,`fee=${bd&&bd.deliveryFee} exp=${FEE}`);
 ok('C3-totalAmount-consistent',!!bd&&typeof bd.totalAmount==='number'&&bd.totalAmount===fx.askingPrice+FEE,`total=${bd&&bd.totalAmount} exp=${fx.askingPrice+FEE}`);
 ok('C2-window-in-payload',!!bd&&Array.isArray(bd.preferredDeliveryWindows)&&bd.preferredDeliveryWindows.length>=1,JSON.stringify(bd&&bd.preferredDeliveryWindows));
 fs.writeFileSync('/tmp/au024_proforma_SELLER_DELIVERY.json',lastCall?lastCall.post||'':'');
 fs.writeFileSync('/tmp/au024_net_r5.json',JSON.stringify(net,null,1));
 if(net.resp){const c=await L.api(fx.buyer.token,'POST','/api/v1/proformas/'+net.resp+'/cancel').catch(()=>null);console.log('cancel own proforma',net.resp,c&&c.status);}
 await L.closeVideo(ctx,'e2e/videos/AU-024-mobile-r5-sd-leg.webm');
 await ctx.close().catch(()=>{});await browser.close();
 console.log('\nR5 fails:',JSON.stringify(fails));
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
