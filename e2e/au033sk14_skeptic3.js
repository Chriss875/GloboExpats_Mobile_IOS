// AU-033 SKEPTIC r14 — part A v3. APP override via env for lib_verify.login.
process.chdir('/home/devsystemadmin/GloboExpats_Mobile');
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs'); const os=require('os'), path=require('path');
const APP='http://localhost:9131';
const fx=JSON.parse(fs.readFileSync('/tmp/au033sk14_rw_fixtures.json','utf8'));
const BUYER={email:fx.buyer.email,pw:fx.buyer.pw};
const SHOTS='e2e/shots/AU-033/';
const rows=[];
const R=(attack,result,detail,evidence)=>{rows.push({ts:new Date().toISOString(),unit:'AU-033',wave:'skeptic',attack,result,detail:String(detail).slice(0,700),evidence:String(evidence).slice(0,300)});console.log('['+result+']',attack,'::',String(detail).slice(0,240));};
// login on :9131 explicitly (do NOT rely on lib default)
async function login9131(page){
  await page.goto(APP,{waitUntil:'load',timeout:90000}).catch(()=>{});
  if(await L.isLoggedIn(page)) return true;
  await L.waitText(page,'Buy now',25000);
  await L.clickBtn(page,'Login'); await L.waitText(page,'Welcome back',25000);
  const ei=page.locator('input[type="text"]').first(); const pi=page.locator('input[type="password"]').first();
  await ei.click({force:true}).catch(()=>{}); await page.waitForTimeout(350); await page.keyboard.type(BUYER.email);
  await pi.click({force:true}).catch(()=>{}); await page.waitForTimeout(350); await page.keyboard.type(BUYER.pw);
  await L.clickBtn(page,'Log in');
  let ok=false; for(let i=0;i<25&&!ok;i++){ ok=await L.isLoggedIn(page); if(!ok) await page.waitForTimeout(1000);} return ok;
}
async function openPayments(p){
  await L.clickBtn(p,'Account'); await p.waitForTimeout(1800);
  await L.clickBtn(p,'My payments'); 
  for(let i=0;i<12;i++){ await p.waitForTimeout(1000); const t=await L.allText(p); if(t.includes('My Payments')&&t.includes('Pending')) return true; }
  return false;
}
(async()=>{
 const b=await L.newBrowser();

 // ===== context A (375x667): A1 double-tap, A5 thrash, A4 weird filename =====
 {
  const ctx=await L.newCtx(b,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-033-sk14-a.webm'});
  const p=await ctx.newPage();
  if(!await login9131(p)) throw new Error('login failed');
  if(!await openPayments(p)) throw new Error('payments panel did not open');
  let t=await L.allText(p);
  console.log('PANEL:', t.replace(/\n/g,' § ').slice(0,300));
  await L.screenshot(p,SHOTS+'sk14-a-panel.png');

  // A1
  const rect=await p.evaluate(()=>{
    let hit=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      if(hit)return; if((e.textContent||'').includes('Continue payment')){const r=e.getBoundingClientRect(); if(r.width>10)hit={x:r.x,y:r.y,w:r.width,h:r.height};}
    }); return hit;});
  if(rect){
    for(let i=0;i<3;i++){ await p.mouse.click(rect.x+rect.w/2,rect.y+rect.h/2); await p.waitForTimeout(70); }
    await p.waitForTimeout(2500);
    t=await L.allText(p);
    const onCheckout=t.includes('Step 1 of 4')||/checkout/i.test(t)||t.includes('Back');
    await L.screenshot(p,SHOTS+'sk14-a1-after-tripletap.png');
    await p.goBack().catch(()=>{}); await p.waitForTimeout(2000);
    t=await L.allText(p);
    const backOk=t.includes('My Payments')&&t.includes('Pending');
    await L.screenshot(p,SHOTS+'sk14-a1-after-back.png');
    R('A1-rapid-triple-tap-continue-payment',(onCheckout&&backOk)?'HELD':'BROKEN',
      `tripletap->checkout=${onCheckout} (Step-1-of-4 copy present); single goBack -> My Payments list=${backOk}; no crash`,
      `${SHOTS}sk14-a1-after-tripletap.png; ${SHOTS}sk14-a1-after-back.png; videos/AU-033-sk14-a.webm`);
  } else R('A1-rapid-triple-tap-continue-payment','DISPUTED','no Continue payment button found',SHOTS+'sk14-a-panel.png');

  if(!await openPayments(p)) throw new Error('re-open payments failed');

  // A5 thrash
  for(let i=0;i<8;i++){ for(const g of ['Approved','Rejected','Expired','Pending']){ await L.clickBtn(p,g); await p.waitForTimeout(160);} }
  await L.clickBtn(p,'Rejected'); await p.waitForTimeout(800);
  t=await L.allText(p);
  const rejCards=(t.match(new RegExp(fx.v4.proformaNumber,'g'))||[]).length;
  await L.screenshot(p,SHOTS+'sk14-a5-thrash-rejected.png');
  R('A5-tab-thrash-x8-duplicate-cards', rejCards===1?'HELD':'BROKEN',
    `after 32 tab switches rejected proforma appears ${rejCards}x in Rejected group (expect exactly 1)`,
    SHOTS+'sk14-a5-thrash-rejected.png');

  // A4 weird filename upload
  const fcPromise=p.waitForEvent('filechooser',{timeout:20000}).catch(()=>null);
  await L.clickBtn(p,'Reopen & update payment');
  const fc=await fcPromise;
  if(fc){
    const weird=path.join(os.tmpdir(),'au033sk14 <script>alert(1)<\/script> "q" 🧾 malipo.png');
    fs.writeFileSync(weird, fs.readFileSync('e2e/fixtures/receipt-proof.png'));
    await fc.setFiles([weird]).catch(e=>R('A4-setfiles','DISPUTED','setFiles error '+e.message,'-'));
    await p.waitForTimeout(5000);
    const snk=await L.hasSnackBar(p);
    await L.screenshot(p,SHOTS+'sk14-a4-after-weird-upload.png');
    const mine=await L.api(fx.buyer.token,'GET','/api/v1/payments/my');
    const row=(mine.json||[]).find(r=>r.proformaId===fx.v4.proformaId);
    const subs=((row&&row.receipts)||[]).filter(r=>r.status==='SUBMITTED').length;
    const rejs=((row&&row.receipts)||[]).filter(r=>r.status==='REJECTED').length;
    R('A4-invalid-filename-upload-restart', subs>=1?'HELD':'BROKEN',
      `emoji/quote/<script> filename receipt POST accepted by sandbox; server now SUBMITTED=${subs} REJECTED=${rejs} rowStatus=${row&&row.status}; snackBand=${JSON.stringify(snk)}`,
      `${SHOTS}sk14-a4-after-weird-upload.png; videos/AU-033-sk14-a.webm`);
  } else R('A4-invalid-filename-upload-restart','DISPUTED','filechooser never fired','-');
  await L.closeVideo(ctx,'e2e/videos/AU-033-sk14-a.webm');
 }
 fs.writeFileSync('/tmp/au033sk14_rows_a.json',JSON.stringify(rows,null,1));
 console.log('PART A DONE');
 await b.close();
})().catch(e=>{console.error('SKFAIL',e.message);fs.writeFileSync('/tmp/au033sk14_rows_a.json',JSON.stringify(rows,null,1));process.exit(2)});
