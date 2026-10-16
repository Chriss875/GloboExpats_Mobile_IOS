// au024_r7_sd.js — R7: SD leg with scroll-into-view card tap + verified detail open.
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
// scroll the tappable card whose text includes `label` into view, then tap its centre
async function tapCardScrolled(p,label){
  const findBox=async(lbl)=>p.evaluate((l)=>{let hit=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if(hit)return;
      if((e.textContent||'').trim().indexOf(l)===-1)return;
      if(e.getAttribute('flt-tappable')===null)return;
      const r=e.getBoundingClientRect();
      if(r.width<40||r.height<40)return;
      hit={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2),y:r.y,h:r.height};});
    return hit;},lbl).catch(()=>null);
  let box=await findBox(label);
  for(let i=0;i<14&&(!box);i++){
    await p.mouse.move(187,400);await p.mouse.wheel(0,320);await sleep(700);
    box=await findBox(label);
  }
  // bring it into the mid band
  for(let i=0;i<8&&box&&(box.y<80||box.y>560);i++){
    const d=box.cy>560?box.cy-380:-(220-box.cy);
    await p.mouse.move(187,400);await p.mouse.wheel(0,d);await sleep(800);
    box=await findBox(label);
  }
  if(!box||box.y<60||box.y>600) { console.log('card box:',JSON.stringify(box)); return false; }
  await p.mouse.click(box.cx,Math.min(Math.max(box.cy,30),655));
  await sleep(3000);
  return true;
}
(async()=>{
 const fails=[]; const ok=(n,c,d)=>{console.log((c?'PASS ':'FAIL ')+n+(d?' :: '+d:''));if(!c)fails.push(n+': '+(d||''));return c;};
 const browser=await L.newBrowser();
 const ctx=await L.newCtx(browser,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-024-mobile-r7-sd-leg.webm'});
 const p=await ctx.newPage();
 const imgMap={};
 p.on('response',r=>{const u=r.url();if(/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u))imgMap[u]=r.status();});
 const net={quote:[],prof:[],resp:null,respStatus:null};
 p.on('request',req=>{const u=req.url();
   if(u.includes('/api/v1/checkout/delivery-quote'))net.quote.push({auth:!!req.headers()['authorization'],post:req.postData()});
   if(u.includes('/api/v1/checkout/proforma')&&req.method()==='POST')net.prof.push({auth:!!req.headers()['authorization'],post:req.postData()});});
 p.on('response',async resp=>{if(resp.url().includes('/api/v1/checkout/proforma')&&resp.request().method()==='POST'){net.respStatus=resp.status();try{const j=await resp.json();net.resp=String(j.proformaId||j.id||'');}catch(e){}}});
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
  ok('login-token',lg,'');} else ok('login-token',true,'already');
 await sleep(1000);
 await p.evaluate(()=>{Object.keys(localStorage).filter(k=>/expatCartItems/.test(k)).forEach(k=>localStorage.removeItem(k));});
 await sleep(400);
 // search: type the FULL unique stamp (r8 run showed partial token can drop the row)
 for(let attempt=1;attempt<=3;attempt++){
   await p.goto(APP+'/#/search',{waitUntil:'load'}).catch(()=>{});await sleep(3200);
   const si=p.locator('input[type="text"]').first();
   await si.click({force:true}).catch(()=>{});await sleep(600);
   await si.fill('').catch(()=>{});
   await p.keyboard.insertText('AU024 Enum Probe Chair '+fx.stamp);await sleep(2200);
   await p.keyboard.press('Enter');await sleep(3800);
   let T=await txt(p);
   if(T.includes(PROBE)){ok('search-shows-fixture',true,'attempt '+attempt);break;}
   if(attempt===3) ok('search-shows-fixture',false,'3 attempts');
 }
 ok('open-detail-card',await tapCardScrolled(p,PROBE),'scroll+tap fixture card');
 T=await txt(p);
 ok('detail-loaded-real-price',T.includes('Add to cart')&&T.includes(Number(fx.askingPrice).toLocaleString('en-US')),
   `detail shows Add to cart + TSh ${Number(fx.askingPrice).toLocaleString('en-US')} for "${PROBE}"`);
 await L.screenshot(p,`${SHOT_DIR}/flutter-mobile-r7-detail.png`);
 ok('add-to-cart',await L.clickBtn(p,'Add to cart'),'1x fixture product');
 await sleep(2400);
 await p.goto(APP+'/#/cart',{waitUntil:'load'}).catch(()=>{});await sleep(2600);
 T=await txt(p);
 ok('cart-has-item',!T.includes('Your cart is empty'),T.slice(0,50).replace(/\n/g,'|'));
 ok('go-to-checkout',await L.clickBtn(p,'Go to checkout'),'cart CTA');await sleep(3000);
 T=await txt(p);
 ok('step1-visible',T.includes('Step 1 of 4'),T.slice(0,40).replace(/\n/g,'|'));
 ok('step1-order-summary-line',T.includes(PROBE.slice(-10))||T.includes(PROBE),'fixture line in Order Summary');
 const inp=p.locator('input[type="text"]');let ninp=await inp.count();
 await inp.nth(Math.max(0,ninp-1)).click({force:true}).catch(()=>{});await sleep(500);
 await p.keyboard.insertText('+255713000444');await sleep(500);
 await p.mouse.move(187,400);for(let i=0;i<10;i++){await p.mouse.wheel(0,250);await sleep(150);}await sleep(900);
 ok('continue-to-review',await L.clickBtn(p,'Continue to review'),'SD path r7');
 let s2=false;for(let i=0;i<30&&!s2;i++){await sleep(1000);s2=(await txt(p)).includes('Step 2 of 4');}
 await sleep(3000);
 T=await txt(p);
 ok('step-2-reached',s2,T.slice(0,60).replace(/\n/g,'|'));
 let fee=T.includes(Number(FEE).toLocaleString('en-US'));
 for(let i=0;i<16&&!fee;i++){await sleep(1000);T=await txt(p);fee=T.includes(Number(FEE).toLocaleString('en-US'));}
 ok('C3-real-fee-rendered',fee,`TSh ${FEE}; quote calls=${net.quote.length}`);
 ok('C3-quote-call-fired-with-jwt',net.quote.length>=1&&!!net.quote[net.quote.length-1].auth,
   `POST /checkout/delivery-quote x${net.quote.length}`);
 await p.mouse.move(187,330);await p.mouse.wheel(0,280);await sleep(1000);
 let rs=await winRows(p);
 for(let i=0;i<12&&rs.length<3;i++){await p.mouse.move(187,330);await p.mouse.wheel(0,180);await sleep(900);rs=await winRows(p);}
 ok('window-rows-present',rs.length>=1,JSON.stringify(rs.map(r=>`${r.label}@${r.y}${r.checked?'[x]':''}`)));
 if(!rs.length){await L.screenshot(p,`${SHOT_DIR}/flutter-mobile-step2-r7-no-windows.png`);fs.writeFileSync('/tmp/au024_r7_text.txt',T);
   console.log('\nR7 fails:',JSON.stringify(fails));await L.closeVideo(ctx,'e2e/videos/AU-024-mobile-r7-sd-leg.webm');await ctx.close().catch(()=>{});await browser.close();process.exit(0);}
 let row=rs.find(r=>!r.checked)||rs[0];
 for(let i=0;i<8;i++){if(row.y>=150&&row.y<=560)break;
  const d=row.y>560?row.y-420:-(220-row.y);
  await p.mouse.move(187,330);await p.mouse.wheel(0,d);await sleep(900);
  const fresh=await winRows(p);const f=fresh.find(z=>z.label===row.label);if(f)row=f;else break;}
 let checked=false;
 for(let a=1;a<=3&&!checked;a++){await p.mouse.click(row.x,row.y);await sleep(1200);
  let me=(await winRows(p)).find(z=>z.label===row.label);checked=!!(me&&me.checked);}
 ok('window-checked',checked,row?`${row.label} y=${row.y}`:'no row');
 R_WIN=row&&row.label;
 var R_WIN=R_WIN; global.__w=R_WIN;
 // terms row sits BELOW the window list: wheel it into the mid band first
 let ts=await termsState(p);
 for(let i=0;i<10&&ts&&(ts.y<80||ts.y>600);i++){
   const d=ts.y>600?ts.y-380:-(220-ts.y);
   await p.mouse.move(187,330);await p.mouse.wheel(0,d);await sleep(850);
   ts=await termsState(p);}
 for(let a=1;a<=4&&!(ts&&ts.checked==='true');a++){
  if(ts&&ts.y>=60&&ts.y<=640){await p.mouse.click(ts.x,Math.min(Math.max(ts.y,30),640));await sleep(1000);}
  else if(ts){const d=ts.y>640?ts.y-380:-(220-ts.y);await p.mouse.move(187,330);await p.mouse.wheel(0,d);await sleep(850);}
  ts=await termsState(p);}
 ok('terms-checked',!!ts&&ts.checked==='true',ts?('y='+ts.y):'not found');
 await L.screenshot(p,`${SHOT_DIR}/flutter-mobile-step2-r7-window-terms-ticked.png`);
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
 ok('C2-no-legacy-enum-anywhere',!!lastCall&&!/(^|[^A-Z_])(SALE|CARD)([^A-Z_]|$)/.test(lastCall.post||''),`scan over ${((lastCall||{}).post||'').length} bytes clean`);
 ok('C3-deliveryFee-on-wire',!!bd&&bd.deliveryFee===FEE,`fee=${bd&&bd.deliveryFee} exp=${FEE}`);
 ok('C3-totalAmount-consistent',!!bd&&typeof bd.totalAmount==='number'&&bd.totalAmount===fx.askingPrice+FEE,`total=${bd&&bd.totalAmount} exp=${fx.askingPrice+FEE}`);
 ok('C2-window-in-payload',!!bd&&Array.isArray(bd.preferredDeliveryWindows)&&bd.preferredDeliveryWindows.length>=1,JSON.stringify(bd&&bd.preferredDeliveryWindows));
 fs.writeFileSync('/tmp/au024_proforma_SELLER_DELIVERY.json',lastCall?lastCall.post||'':'');
 fs.writeFileSync('/tmp/au024_net_r7.json',JSON.stringify({net,window:R_WIN},null,1));
 if(net.resp){const c=await L.api(fx.buyer.token,'POST','/api/v1/proformas/'+net.resp+'/cancel').catch(()=>null);console.log('cancel own proforma',net.resp,c&&c.status);}
 const imgStat={requested:Object.keys(imgMap).length,ok200:Object.values(imgMap).filter(s=>s===200||s===304).length};
 fs.writeFileSync('/tmp/au024_r7_images.json',JSON.stringify(imgStat,null,1));
 await L.closeVideo(ctx,'e2e/videos/AU-024-mobile-r7-sd-leg.webm');
 await ctx.close().catch(()=>{});await browser.close();
 console.log('\nR7 fails:',JSON.stringify(fails));
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
