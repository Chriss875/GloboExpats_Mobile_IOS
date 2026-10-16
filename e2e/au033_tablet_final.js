// TABLET REJECTED-STATE PASS with its OWN fresh buyer (no sequencing overlap).
const fs=require('fs'); const path=require('path');
process.chdir('/home/devsystemadmin/GloboExpats_Mobile');
const L=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP='http://localhost:9112';
const PNG=path.join(process.cwd(),'e2e/fixtures/receipt-proof.png');
const STAMP=Date.now();
const BE=`au033tt${STAMP}@gmail.com`, SE=`au033tw${STAMP}@gmail.com`, PW='StrongPass!1';
const R={ts:new Date().toISOString(),unit:'AU-033',stage:'tablet-final',asserts:[],failures:[]};
function ok(n,c,d){R.asserts.push({name:n,pass:!!c,detail:String(d||'').slice(0,240)});console.log((c?'PASS ':'FAIL ')+n+(d?' :: '+String(d).slice(0,140):''));if(!c)R.failures.push(n);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ariaText(p){return p.evaluate(()=>{const out=[];document.querySelectorAll('flt-semantics').forEach(e=>{const a=e.getAttribute('aria-label')||e.textContent||'';const r=e.getBoundingClientRect();if(a.trim())out.push({label:a,tappable:e.getAttribute('flt-tappable')!==null,role:e.getAttribute('role'),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)});});return out;}).catch(()=>[]);}
async function tapTab(p,prefix){const ns=await ariaText(p);const h=ns.filter(n=>n.label.startsWith(prefix)&&n.tappable).sort((a,b)=>a.w*a.h-b.w*b.h)[0];if(!h)return false;await p.mouse.click(h.x+h.w/2,h.y+h.h/2);await sleep(1500);return true;}
(async()=>{
  // mint own rejected row
  for(const e of [BE,SE]){ await L.api(null,'POST','/api/v1/auth/register',{firstName:'AU033W',lastName:'B',password:PW,emailAddress:e}); }
  const bt=await L.apiLogin({email:BE,pw:PW}), st=await L.apiLogin({email:SE,pw:PW}), at=await L.apiLogin(L.ADMIN);
  const sid=(await L.api(st,'GET','/api/v1/userManagement/user-details')).json.userId;
  await L.api(at,'PATCH',`/api/v1/admin/users/${sid}/status`,{status:'VERIFIED'});
  const prod={productName:`AU033TT Lamp ${STAMP}`,productQuantity:4,categoryId:3,subcategoryId:26,
    productCountry:'Tanzania',productRegion:'Dar es Salaam',productStreet:'Mikocheni',
    productDescription:'AU-033 tablet rejected-state fixture.',currency:'TZS',askingPrice:9000,originalPrice:11000,condition:'NEW'};
  const f=new FormData(); f.append('product',new Blob([Buffer.from(JSON.stringify(prod))],{type:'application/json'}),'p.json');
  f.append('images',new Blob([fs.readFileSync(PNG)],{type:'image/png'}),'lamp.png');
  const pr=await fetch(L.API+'/api/v1/products/post-product',{method:'POST',headers:{Authorization:'Bearer '+st},body:f});
  const pj=await pr.json(); const pid=pj.productId||pj.id;
  await L.api(at,'PATCH',`/api/v1/admin/products/${pid}/logistics`,{latitude:-6.7905,longitude:39.2795,deliveryTransportMode:'BODA',neighbourhood:'Mikocheni'});
  const tm=new Date(Date.now()+86400e3).toISOString().slice(0,10);
  const co=await L.api(bt,'POST','/api/v1/checkout/proforma',{buyDetails:{firstName:'W',lastName:'B',emailAddress:BE,phoneNumber:'+255715000555',address:'tw st',deliveryLabel:'Home',deliveryPlaceName:'',deliveryNeighbourhood:'',city:'dar es salaam',state:'',country:'tanzania',zipCode:'',deliveryInstructions:'',fulfillmentType:'SELLER_DELIVERY',paymentMethodType:'MOBILE_MONEY',agreeToTerms:true,deliveryFee:2000,totalAmount:11000,currency:'TZS',latitude:-6.7924,longitude:39.2083,preferredDeliveryDate:tm,preferredDeliverySlot:'EVENING',preferredDeliveryWindows:[{date:tm,slot:'EVENING'}]},items:[{productId:pid,quantity:1}]});
  const pfId=co.json.proformaId;
  const uf=new FormData(); uf.append('receipts',new Blob([fs.readFileSync(PNG)],{type:'image/png'}),'au033tt.png');
  uf.append('details',new Blob([JSON.stringify({transactionReferences:['SANDBOX-TXN-AU033-TT']})],{type:'text/plain'}),'d.txt');
  await fetch(`${L.API}/api/v1/proformas/${pfId}/receipts`,{method:'POST',headers:{Authorization:'Bearer '+bt},body:uf});
  await L.api(bt,'POST',`/api/v1/proformas/${pfId}/submit-payment`,{transactionReferences:['SANDBOX-TXN-AU033-TT'],paymentMethodType:'MOBILE_MONEY'});
  let my=await L.api(bt,'GET','/api/v1/payments/my');
  let row=my.json.find(x=>x.proformaId===pfId);
  for(const rc of row.receipts){ await L.api(at,'POST',`/api/v1/admin/receipts/${rc.receiptId}/reject`,{reasonCode:'PAYMENT_NOT_FOUND',note:`AU033 TT probe ${STAMP}`}); }
  my=await L.api(bt,'GET','/api/v1/payments/my'); row=my.json.find(x=>x.proformaId===pfId);
  console.log('tablet fixture:',row.proformaNumber,row.status,(row.receipts||[]).map(r=>r.status).join('+'),'total',row.grandTotal);

  const browser=await L.newBrowser();
  const ctx=await L.newCtx(browser,{viewport:{width:768,height:1024},videoPath:'e2e/videos/AU-033-tablet-rejected.webm'});
  const t2=await ctx.newPage();
  await t2.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(t2,'Buy now',45000);
  await L.clickBtn(t2,'Login'); await L.waitText(t2,'Welcome back',25000);
  const ei=t2.locator('input[type="text"]').first(); await ei.click({force:true}); await sleep(300); await t2.keyboard.type(BE,{delay:12});
  const pi=t2.locator('input[type="password"]').first(); await pi.click({force:true}); await sleep(300); await t2.keyboard.type(PW,{delay:12});
  await L.clickBtn(t2,'Log in');
  let li=false; for(let i=0;i<30&&!li;i++){ await sleep(1000); li=await t2.evaluate(()=>!!(localStorage.getItem('flutter.auth_token')||'')); }
  ok('tablet-login',li,'');
  await t2.goto(APP+'/account/payments',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await sleep(7000);
  ok('tablet-click-rejected-tab',await tapTab(t2,'Rejected'),'');
  const tn=await ariaText(t2);
  const card=(tn.find(n=>n.role==='group'&&n.label&&n.label.includes('PF-'))||{}).label||'';
  ok('tablet-card-present',card.includes(row.proformaNumber),row.proformaNumber);
  ok('tablet-badge-action-needed',card.includes('Action needed - new proof'),'');
  ok('tablet-banner-copy',card.includes('Your proof of payment was rejected - please upload a new one.'),'verbatim');
  ok('tablet-reasonCode',card.includes('PAYMENT_NOT_FOUND'),'reason code rendered');
  ok('tablet-admin-note',card.includes(`AU033 TT probe ${STAMP}`),'note verbatim');
  ok('tablet-countdown',/\d+d? ?\d*h \d+m remaining to upload corrected proof/.test(card),(card.match(/[\dhdm ]+remaining to upload corrected proof/)||[''])[0].trim());
  ok('tablet-price-grandTotal',card.includes('TSh '+Number(row.grandTotal).toLocaleString('en-US')),`grandTotal=${row.grandTotal}`);
  ok('tablet-pending-since',/Pending since \d+\/\d+\/\d+/.test(card),(card.match(/Pending since[^·]+/)||[''])[0].trim());
  ok('tablet-reopen-button',tn.some(n=>n.label.includes('Reopen & update payment')),'control present for click-through');
  // click it: filechooser must fire on tablet too
  // scroll the amber block's button into view first, then click
  let up=null;
  for(let i=0;i<6&&!up;i++){
    const n2=await ariaText(t2);
    up=n2.filter(n=>n.label.includes('Reopen & update payment')).sort((a,b)=>a.w*a.h-b.w*b.h)[0];
    if(!up){ await t2.mouse.move(380,500); await t2.mouse.wheel(0,260); await sleep(500); }
  }
  console.log('reopen geometry:',JSON.stringify(up));
  const fcP=t2.waitForEvent('filechooser',{timeout:15000}).catch(()=>null);
  if(up && up.y>0 && up.y<1010) await t2.mouse.click(up.x+up.w/2,up.y+up.h/2);
  else if(up) { await t2.mouse.move(up.x+10,Math.min(up.y+up.h/2,1000)); await t2.mouse.wheel(0,-200); await sleep(400); await t2.mouse.click(up.x+up.w/2,Math.min(up.y+up.h/2,1000)); }
  const fc=await fcP;
  ok('tablet-filechooser-fires',!!fc,'re-upload control is live on tablet');
  if(fc) await fc.setFiles([PNG]).catch(()=>{});
  await sleep(6000);
  const my2=await L.api(bt,'GET','/api/v1/payments/my');
  const row2=my2.json.find(x=>x.proformaId===pfId);
  ok('tablet-upload-restarts-review',(row2.receipts||[]).filter(rc=>rc.status==='SUBMITTED'&&new Date(rc.submittedAt)>new Date(Date.now()-300000)).length>=1,
    (row2.receipts||[]).map(rc=>rc.status).join(','));
  await L.screenshot(t2,'e2e/shots/AU-033/flutter-768-02-rejected-card.png');
  R.shots=['flutter-768-02-rejected-card.png'];
  fs.writeFileSync('/tmp/au033_tablet_result.json',JSON.stringify(R,null,2));
  console.log('\nFAILURES',JSON.stringify(R.failures));
  await L.closeVideo(ctx,'e2e/videos/AU-033-tablet-rejected.webm');
  await browser.close();
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
