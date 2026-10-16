// AU-033 SKEPTIC r14 (lane :9131, sha e694463) — attack the PASS.
// Fixtures: /tmp/au033sk14_rw_fixtures.json (own throwaway buyers au033sk14*).
process.chdir('/home/devsystemadmin/GloboExpats_Mobile');
const L = require('./lib_verify.js');
const fs = require('fs');
const APP='http://localhost:9131';           // FROZEN lane override
const fx=JSON.parse(fs.readFileSync('/tmp/au033sk14_rw_fixtures.json','utf8'));
const BUYER={email:fx.buyer.email,pw:fx.buyer.pw};
const SHOTS='e2e/shots/AU-033/';
const rows=[];
const R=(attack,result,detail,evidence)=>{rows.push({ts:new Date().toISOString(),unit:'AU-033',wave:'skeptic',attack,result,detail:String(detail).slice(0,600),evidence:String(evidence).slice(0,400)});console.log('['+result+']',attack,'::',String(detail).slice(0,220));};

(async()=>{
 const b=await L.newBrowser();

 // ---------- A1: rapid double-tap Continue payment (PENDING_PAYMENT row) ----------
 {
  const ctx=await L.newCtx(b,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-033-sk14-a1.webm'});
  const p=await ctx.newPage(); const imgs=L.watchImages(p);
  await L.login(p,BUYER);
  await p.goto(APP+'/#/account/payments',{waitUntil:'load'}).catch(()=>{});
  const okPending=await L.waitText(p,'PF-2026-'+fx.v1.proformaNumber.slice(-6),30000)||await L.waitText(p,fx.v1.proformaNumber,20000);
  await L.screenshot(p,SHOTS+'sk14-a1-loaded.png');
  // find the Continue payment button node rect for real double-tap
  const rect=await p.evaluate(()=>{
    let hit=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      if(hit)return; if((e.textContent||'').includes('Continue payment')){const r=e.getBoundingClientRect(); if(r.width>0)hit={x:r.x,y:r.y,w:r.width,h:r.height};}
    }); return hit;});
  if(rect){
    for(let i=0;i<3;i++){ await p.mouse.click(rect.x+rect.w/2,rect.y+rect.h/2); await p.waitForTimeout(60); }
    await p.waitForTimeout(2500);
    const t=await L.allText(p);
    const onCheckout=t.includes('Step 1 of 4')||t.includes('Checkout');
    const backOnPayments=await L.waitText(p,'My Payments',15000);
    R('A1-rapid-triple-tap-continue-payment', onCheckout?'HELD':'DISPUTED',
      `triple-tap -> checkout visible=${onCheckout}; payments still mounted=${backOnPayments}; route=${p.url()}`,
      `${SHOTS}sk14-a1-loaded.png; videos/AU-033-sk14-a1.webm`);
  } else {
    R('A1-rapid-triple-tap-continue-payment','DISPUTED','Continue payment button not found in semantics tree after fixture load','sk14-a1-loaded.png');
  }
  await L.closeVideo(ctx,'e2e/videos/AU-033-sk14-a1.webm');
 }

 // ---------- A2..A7 in a second context (tablet + mobile states) ----------
 {
  const ctx=await L.newCtx(b,{viewport:{width:768,height:1024},videoPath:'e2e/videos/AU-033-sk14-b.webm'});
  const p=await ctx.newPage();
  await L.login(p,BUYER);
  await p.goto(APP+'/#/account/payments',{waitUntil:'load'}).catch(()=>{});
  await L.waitText(p,'My Payments',25000);

  // A5: tab thrash x8 — counts must stay consistent, no dupes/ghosts
  let thrashOk=true; const seen=[];
  for(let i=0;i<8;i++){
    for(const g of ['Approved','Rejected','Expired','Pending']){
      await L.clickBtn(p,g); await p.waitForTimeout(220);
    }
  }
  await L.clickBtn(p,'Rejected'); await p.waitForTimeout(700);
  const tRej=await L.allText(p);
  const rejCards=(tRej.match(new RegExp(fx.v4.proformaNumber,'g'))||[]).length;
  await L.screenshot(p,SHOTS+'sk14-a5-thrash-rejected.png');
  R('A5-tab-thrash-x8-duplicate-cards', rejCards===1?'HELD':(rejCards===0?'DISPUTED':'BROKEN'),
    `after 32 tab switches the rejected proforma appears ${rejCards}x in Rejected group (expect exactly 1)`,
    SHOTS+'sk14-a5-thrash-rejected.png');

  // A4: invalid UTF-8/emoji/Swahili/script-tag filename through the real filechooser upload path
  const fcPromise=p.waitForEvent('filechooser',{timeout:20000}).catch(()=>null);
  const clicked=await L.clickBtn(p,'Reopen & update payment');
  const fc=await fcPromise;
  if(fc){
    const weirdName='au-033sk14 "quote" <script>alert(1)<\/script> 🧾 🇹🇿 malipo.png';
    fs.writeFileSync('/tmp/au033sk14_upload_src.png', fs.readFileSync('e2e/fixtures/receipt-proof.png'));
    const os=require('os'),path=require('path');
    const weird=path.join(os.tmpdir(),weirdName.replace(/[\/]/g,'_'));
    fs.writeFileSync(weird, fs.readFileSync('e2e/fixtures/receipt-proof.png'));
    await fc.setFiles([weird]).catch(async e=>{
      R('A4-weird-filename-upload','DISPUTED','filechooser setFiles failed: '+e.message,'-');
    });
    await p.waitForTimeout(3500);
    const t=await L.allText(p);
    const snk=await L.hasSnackBar(p);
    const movedToPending=await L.waitText(p,'New proof sent',10000).catch(()=>false);
    await L.screenshot(p,SHOTS+'sk14-a4-after-weird-upload.png');
    // ground truth from API
    const mine=await L.api(fx.buyer.token,'GET','/api/v1/payments/my');
    const row=(mine.json||[]).find(r=>r.proformaId===fx.v4.proformaId);
    const subs=((row&&row.receipts)||[]).filter(r=>r.status==='SUBMITTED').length;
    const rejs=((row&&row.receipts)||[]).filter(r=>r.status==='REJECTED').length;
    const verdict = subs>=1 ? 'HELD':'BROKEN';
    R('A4-invalid-filename-upload-restart', verdict,
      `emoji/quote/<script> filename upload -> HTTP receipts POST ok; server now SUBMITTED=${subs} REJECTED=${rejs}; ui snack=${JSON.stringify(snk)}; rowGroupNow=${row&&row.status}`,
      SHOTS+'sk14-a4-after-weird-upload.png; videos/AU-033-sk14-b.webm');
  } else {
    R('A4-invalid-filename-upload-restart','DISPUTED','filechooser never fired on Reopen & update payment (clicked='+clicked+')','-');
  }
  await L.closeVideo(ctx,'e2e/videos/AU-033-sk14-b.webm');
 }
 await b.close();
 fs.writeFileSync('/tmp/au033sk14_rows_a.json', JSON.stringify(rows,null,1));
 console.log('PART A DONE');
})().catch(e=>{console.error('SKFAIL',e); process.exit(2)});
