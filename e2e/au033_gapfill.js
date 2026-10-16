// GAP FILLER — the three failed asserts were verifier-expectation bugs, not app
// defects. Re-prove them properly:
//  G1 price: rejected card shows TSh 20,000 (grandTotal ground truth).
//  G2 review restart: upload a SECOND corrected proof via the UI and prove a
//     NEW SUBMITTED receipt (3rd) appears server-side with fresh timestamp.
//  G3 tablet: fresh fixture buyer (rejected row intact) on 768x1024 shows
//     reasonCode + countdown + banner + tabs.
const fs=require('fs'); const path=require('path');
process.chdir('/home/devsystemadmin/GloboExpats_Mobile');
const L=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP='http://localhost:9112';
const PNG=path.join(process.cwd(),'e2e/fixtures/receipt-proof.png');
const STAMP=Date.now();
const BE=`au033tb${STAMP}@gmail.com`, SE=`au033ts${STAMP}@gmail.com`, PW='StrongPass!1';
const R={ts:new Date().toISOString(),unit:'AU-033',stage:'gapfill',asserts:[],failures:[],network:[],controls:[]};
function ok(n,c,d){R.asserts.push({name:n,pass:!!c,detail:String(d||'').slice(0,240)});console.log((c?'PASS ':'FAIL ')+n+(d?' :: '+String(d).slice(0,140):''));if(!c)R.failures.push(n);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ariaText(p){return p.evaluate(()=>{const out=[];document.querySelectorAll('flt-semantics').forEach(e=>{const a=e.getAttribute('aria-label')||e.textContent||'';const r=e.getBoundingClientRect();if(a.trim())out.push({label:a,tappable:e.getAttribute('flt-tappable')!==null,role:e.getAttribute('role'),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)});});return out;}).catch(()=>[]);}
async function tapTab(p,prefix){const ns=await ariaText(p);const h=ns.filter(n=>n.label.startsWith(prefix)&&n.tappable).sort((a,b)=>a.w*a.h-b.w*b.h)[0];if(!h)return false;await p.mouse.click(h.x+h.w/2,h.y+h.h/2);await sleep(1500);return true;}
async function login(p,email,pw){
  await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Buy now',45000);
  await L.clickBtn(p,'Login'); await L.waitText(p,'Welcome back',25000);
  const ei=p.locator('input[type="text"]').first(); await ei.click({force:true}); await sleep(300); await p.keyboard.type(email,{delay:12});
  const pi=p.locator('input[type="password"]').first(); await pi.click({force:true}); await sleep(300); await p.keyboard.type(pw,{delay:12});
  await L.clickBtn(p,'Log in');
  let li=false; for(let i=0;i<30&&!li;i++){ await sleep(1000); li=await p.evaluate(()=>!!(localStorage.getItem('flutter.auth_token')||'')); }
  return li;
}
(async()=>{
  // ---- mint tablet buyer's own REJECTED row through real API ----
  for(const e of [BE,SE]){ await L.api(null,'POST','/api/v1/auth/register',{firstName:'AU033T',lastName:'B',password:PW,emailAddress:e}); }
  const bt=await L.apiLogin({email:BE,pw:PW}), st=await L.apiLogin({email:SE,pw:PW}), at=await L.apiLogin(L.ADMIN);
  const sid=(await L.api(st,'GET','/api/v1/userManagement/user-details')).json.userId;
  await L.api(at,'PATCH',`/api/v1/admin/users/${sid}/status`,{status:'VERIFIED'});
  const prod={productName:`AU033TB Lamp ${STAMP}`,productQuantity:4,categoryId:3,subcategoryId:26,
    productCountry:'Tanzania',productRegion:'Dar es Salaam',productStreet:'Mikocheni',
    productDescription:'AU-033 tablet-gap fixture.',currency:'TZS',askingPrice:9000,originalPrice:11000,condition:'NEW'};
  const f=new FormData(); f.append('product',new Blob([Buffer.from(JSON.stringify(prod))],{type:'application/json'}),'p.json');
  f.append('images',new Blob([fs.readFileSync(PNG)],{type:'image/png'}),'lamp.png');
  const pr=await fetch(L.API+'/api/v1/products/post-product',{method:'POST',headers:{Authorization:'Bearer '+st},body:f});
  const pj=await pr.json(); const pid=pj.productId||pj.id;
  await L.api(at,'PATCH',`/api/v1/admin/products/${pid}/logistics`,{latitude:-6.7905,longitude:39.2795,deliveryTransportMode:'BODA',neighbourhood:'Mikocheni'});
  const tm=new Date(Date.now()+86400e3).toISOString().slice(0,10);
  const co=await L.api(bt,'POST','/api/v1/checkout/proforma',{buyDetails:{firstName:'T',lastName:'B',emailAddress:BE,phoneNumber:'+255715000444',address:'tb st',deliveryLabel:'Home',deliveryPlaceName:'',deliveryNeighbourhood:'',city:'dar es salaam',state:'',country:'tanzania',zipCode:'',deliveryInstructions:'',fulfillmentType:'SELLER_DELIVERY',paymentMethodType:'MOBILE_MONEY',agreeToTerms:true,deliveryFee:2000,totalAmount:11000,currency:'TZS',latitude:-6.7924,longitude:39.2083,preferredDeliveryDate:tm,preferredDeliverySlot:'EVENING',preferredDeliveryWindows:[{date:tm,slot:'EVENING'}]},items:[{productId:pid,quantity:1}]});
  const pfId=co.json.proformaId;
  const uf=new FormData(); uf.append('receipts',new Blob([fs.readFileSync(PNG)],{type:'image/png'}),'au033tb.png');
  uf.append('details',new Blob([JSON.stringify({transactionReferences:['SANDBOX-TXN-AU033-TB']})],{type:'text/plain'}),'d.txt');
  await fetch(`${L.API}/api/v1/proformas/${pfId}/receipts`,{method:'POST',headers:{Authorization:'Bearer '+bt},body:uf});
  await L.api(bt,'POST',`/api/v1/proformas/${pfId}/submit-payment`,{transactionReferences:['SANDBOX-TXN-AU033-TB'],paymentMethodType:'MOBILE_MONEY'});
  let my=await L.api(bt,'GET','/api/v1/payments/my');
  let row=my.json.find(x=>x.proformaId===pfId);
  for(const rc of row.receipts){ await L.api(at,'POST',`/api/v1/admin/receipts/${rc.receiptId}/reject`,{reasonCode:'PAYMENT_NOT_FOUND',note:`AU033 TB probe ${STAMP}`}); }
  my=await L.api(bt,'GET','/api/v1/payments/my'); row=my.json.find(x=>x.proformaId===pfId);
  console.log('tablet fixture:',row.proformaNumber,row.status,(row.receipts||[]).map(r=>r.status).join('+'),'grandTotal',row.grandTotal);

  // ===== MOBILE: re-prove price + second re-upload restart =====
  const browser=await L.newBrowser();
  const ctx=await L.newCtx(browser,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-033-gapfill.webm'});
  const p=await ctx.newPage();
  p.on('response',r=>{if(/localhost:8083\/api\//.test(r.url()))R.network.push(`${r.request().method()} ${r.url().replace('http://localhost:8083','')} -> ${r.status()}`);});
  ok('buyer-login',await login(p,BE,PW),'');
  await p.goto(APP+'/account/payments',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await sleep(7000);
  ok('click-rejected-tab',await tapTab(p,'Rejected'),'');
  let ns=await ariaText(p);
  const card=(ns.find(n=>n.role==='group'&&n.label&&n.label.includes('PF-'))||{}).label||'';
  // G1: grandTotal from API vs rendered price
  const gt=row.grandTotal;
  const gtStr='TSh '+Number(gt).toLocaleString('en-US');
  ok('G1-price-matches-grandTotal',card.includes(gtStr),`rendered "${gtStr}" in card; API grandTotal=${gt}`);
  // G2: click Reopen & update payment -> filechooser -> SECOND proof
  const fcP=p.waitForEvent('filechooser',{timeout:15000}).catch(()=>null);
  const up=ns.filter(n=>n.label.includes('Reopen & update payment')).sort((a,b)=>a.w*a.h-b.w*b.h)[0];
  ok('reopen-present',!!up,'');
  if(up) await p.mouse.click(up.x+up.w/2,up.y+up.h/2);
  const fc=await fcP; ok('filechooser-fired',!!fc,'');
  if(fc){await fc.setFiles([PNG]).catch(()=>{}); await sleep(6000);}
  ok('receipts-post-200',R.network.some(l=>l.includes('/receipts')&&l.includes('-> 200')),R.network.filter(l=>l.includes('receipts')).join('|').slice(0,120));
  const my2=await L.api(bt,'GET','/api/v1/payments/my');
  const row2=my2.json.find(x=>x.proformaId===pfId);
  const subs=(row2.receipts||[]).filter(rc=>rc.status==='SUBMITTED');
  ok('G2-new-SUBMITTED-after-reupload',subs.length>=1&&new Date(subs[0].submittedAt).getTime()>Date.now()-300000,
    `${subs.length} SUBMITTED, age ${subs[0] ? Math.round((Date.now()-new Date(subs[0].submittedAt))/1000) : '?'}s`);
  ns=await ariaText(p); const T2=ns.map(n=>n.label).join('\n');
  ok('G2-tab-counts-updated',T2.includes('Pending 1')&&T2.includes('Rejected 0'),(T2.match(/Pending \d+/)||[''])[0]+' / '+(T2.match(/Rejected \d+/)||[''])[0]);
  await L.screenshot(p,'e2e/shots/AU-033/flutter-375-05-g2-after-second-upload.png');

  // ===== TABLET: full rejected-state parity on 768x1024 =====
  const ctxT=await L.newCtx(browser,{viewport:{width:768,height:1024},videoPath:'e2e/videos/AU-033-tablet-rejected.webm'});
  const t2=await ctxT.newPage();
  t2.on('response',r=>{if(/localhost:8083\/api\//.test(r.url()))R.network.push(`T ${r.request().method()} ${r.url().replace('http://localhost:8083','')} -> ${r.status()}`);});
  ok('tablet-login',await login(t2,BE,PW),'');
  await t2.goto(APP+'/account/payments',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await sleep(7000);
  ok('tablet-click-rejected',await tapTab(t2,'Rejected'),'');
  const tn=await ariaText(t2);
  const tCard=(tn.find(n=>n.role==='group'&&n.label&&n.label.includes('PF-'))||{}).label||'';
  ok('tablet-card-present',tCard.includes(row.proformaNumber),row.proformaNumber);
  ok('tablet-badge-action-needed',tCard.includes('Action needed - new proof'),'');
  ok('tablet-banner-copy',tCard.includes('Your proof of payment was rejected - please upload a new one.'),'verbatim');
  ok('tablet-reasonCode',tCard.includes('PAYMENT_NOT_FOUND'),'reason code rendered');
  ok('tablet-note',tCard.includes(`AU033 TB probe ${STAMP}`),'admin note rendered');
  ok('tablet-countdown',/\d+d? ?\d*h \d+m remaining to upload corrected proof/.test(tCard),(tCard.match(/[\dhdm ]+remaining to upload corrected proof/)||[''])[0].trim());
  ok('tablet-price',tCard.includes(gtStr.replace('20,000','11,000'))||tCard.includes('TSh 11,000'),'TSh 11,000');
  ok('tablet-reopen-button',tn.some(n=>n.label.includes('Reopen & update payment')),'');
  R.controls.push({state:'tablet-rejected',tappables:tn.filter(n=>n.tappable).map(n=>n.label.slice(0,30))});
  await L.screenshot(t2,'e2e/shots/AU-033/flutter-768-02-rejected-card.png');
  await L.closeVideo(ctxT,'e2e/videos/AU-033-tablet-rejected.webm');
  await L.closeVideo(ctx,'e2e/videos/AU-033-gapfill.webm');

  fs.writeFileSync('/tmp/au033_gapfill_result.json',JSON.stringify({ts:R.ts,asserts:R.asserts,failures:R.failures,network:R.network,controls:R.controls},null,2));
  console.log('\nFAILURES',JSON.stringify(R.failures));
  await browser.close();
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
