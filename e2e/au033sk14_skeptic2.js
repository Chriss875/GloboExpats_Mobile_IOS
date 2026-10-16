// AU-033 SKEPTIC r14 part A v2 — in-app nav (Account tab -> My payments).
process.chdir('/home/devsystemadmin/GloboExpats_Mobile');
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs'); const os=require('os'), path=require('path');
const APP='http://localhost:9131';
const fx=JSON.parse(fs.readFileSync('/tmp/au033sk14_rw_fixtures.json','utf8'));
const BUYER={email:fx.buyer.email,pw:fx.buyer.pw};
const SHOTS='e2e/shots/AU-033/';
const rows=[];
const R=(attack,result,detail,evidence)=>{rows.push({ts:new Date().toISOString(),unit:'AU-033',wave:'skeptic',attack,result,detail:String(detail).slice(0,700),evidence:String(evidence).slice(0,300)});console.log('['+result+']',attack,'::',String(detail).slice(0,240));};
(async()=>{
 const b=await L.newBrowser();
 const ctx=await L.newCtx(b,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-033-sk14-a.webm'});
 const p=await ctx.newPage();
 if(!await L.login(p,BUYER)) throw new Error('login failed');
 await L.clickBtn(p,'Account'); await p.waitForTimeout(2000);
 await L.clickBtn(p,'My payments'); await p.waitForTimeout(4000);
 let t=await L.allText(p);
 console.log('PAYMENTS PANEL:', t.replace(/\n/g,' § ').slice(0,900));
 await L.screenshot(p,SHOTS+'sk14-a-panel.png');

 // ---- A1 rapid triple-tap Continue payment on the PENDING_PAYMENT row ----
 const rect=await p.evaluate(()=>{
   let hit=null;
   document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
     if(hit)return; if((e.textContent||'').includes('Continue payment')){const r=e.getBoundingClientRect(); if(r.width>10)hit={x:r.x,y:r.y,w:r.width,h:r.height};}
   }); return hit;});
 if(rect){
   for(let i=0;i<3;i++){ await p.mouse.click(rect.x+rect.w/2,rect.y+rect.h/2); await p.waitForTimeout(70); }
   await p.waitForTimeout(2500);
   t=await L.allText(p);
   const onCheckout=t.includes('Step 1 of 4')||/checkout/i.test(t);
   const url=p.url();
   await L.screenshot(p,SHOTS+'sk14-a1-after-tripletap.png');
   // how many checkout routes got pushed? go back once and see where we land
   await p.goBack().catch(()=>{}); await p.waitForTimeout(1800);
   const tBack=await L.allText(p);
   const backIsPayments=tBack.includes('My Payments')&&tBack.includes('Pending');
   await L.screenshot(p,SHOTS+'sk14-a1-after-back.png');
   R('A1-rapid-triple-tap-continue-payment', (onCheckout&&backIsPayments)?'HELD':'BROKEN',
     `triple-tap -> checkout rendered=${onCheckout}; single back returns to My Payments=${backIsPayments} (stack depth sane); url=${url}`,
     `${SHOTS}sk14-a1-after-tripletap.png; ${SHOTS}sk14-a1-after-back.png; videos/AU-033-sk14-a.webm`);
 } else {
   R('A1-rapid-triple-tap-continue-payment','DISPUTED','Continue payment button absent from semantics after fixture load; panel text='+t.slice(0,150),SHOTS+'sk14-a-panel.png');
 }
 // recover: navigate back into panel
 await L.clickBtn(p,'Account'); await p.waitForTimeout(1200);
 await L.clickBtn(p,'My payments'); await p.waitForTimeout(3500);

 // ---- A5 tab thrash x8 cycles, then count rejected cards ----
 for(let i=0;i<8;i++){ for(const g of ['Approved','Rejected','Expired','Pending']){ await L.clickBtn(p,g); await p.waitForTimeout(180);} }
 await L.clickBtn(p,'Rejected'); await p.waitForTimeout(800);
 t=await L.allText(p);
 const rejCards=(t.match(new RegExp(fx.v4.proformaNumber,'g'))||[]).length;
 await L.screenshot(p,SHOTS+'sk14-a5-thrash-rejected.png');
 R('A5-tab-thrash-x8-duplicate-cards', rejCards===1?'HELD':'BROKEN',
   `after 32 tab switches the rejected proforma appears ${rejCards}x in Rejected group (expect exactly 1)`,
   SHOTS+'sk14-a5-thrash-rejected.png');

 // ---- A4 invalid filename upload through real filechooser ----
 const fcPromise=p.waitForEvent('filechooser',{timeout:20000}).catch(()=>null);
 const clicked=await L.clickBtn(p,'Reopen & update payment');
 const fc=await fcPromise;
 if(fc){
   const weird=path.join(os.tmpdir(),'au033sk14 <script>alert(1)<\/script> "q" 🧾 malipo.png');
   fs.writeFileSync(weird, fs.readFileSync('e2e/fixtures/receipt-proof.png'));
   await fc.setFiles([weird]).catch(e=>R('A4-setfiles','DISPUTED','setFiles error '+e.message,'-'));
   await p.waitForTimeout(4500);
   const snk=await L.hasSnackBar(p);
   await L.screenshot(p,SHOTS+'sk14-a4-after-weird-upload.png');
   const mine=await L.api(fx.buyer.token,'GET','/api/v1/payments/my');
   const row=(mine.json||[]).find(r=>r.proformaId===fx.v4.proformaId);
   const subs=((row&&row.receipts)||[]).filter(r=>r.status==='SUBMITTED').length;
   const rejs=((row&&row.receipts)||[]).filter(r=>r.status==='REJECTED').length;
   R('A4-invalid-filename-upload-restart', subs>=1?'HELD':'BROKEN',
     `emoji/quote/<script> filename receipt POST -> server SUBMITTED=${subs} REJECTED=${rejs} status=${row&&row.status}; snackBand=${JSON.stringify(snk)}`,
     `${SHOTS}sk14-a4-after-weird-upload.png; videos/AU-033-sk14-a.webm`);
 } else {
   R('A4-invalid-filename-upload-restart','DISPUTED','filechooser never fired (clicked='+clicked+')','-');
 }
 await L.closeVideo(ctx,'e2e/videos/AU-033-sk14-a.webm');
 await b.close();
 fs.writeFileSync('/tmp/au033sk14_rows_a.json',JSON.stringify(rows,null,1));
 console.log('PART A DONE');
})().catch(e=>{console.error('SKFAIL',e);fs.writeFileSync('/tmp/au033sk14_rows_a.json',JSON.stringify(rows,null,1));process.exit(2)});
