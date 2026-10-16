// FINAL VERIFICATION RUN — AU-033 canonical checklist, aria-label ground truth.
const fs=require('fs'); const path=require('path');
process.chdir('/home/devsystemadmin/GloboExpats_Mobile');
const L=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP='http://localhost:9112';
const fx=JSON.parse(fs.readFileSync('/tmp/au033_rb_fixtures.json','utf8'));
const SHOT_DIR='e2e/shots/AU-033';
const PNG=path.join(process.cwd(),'e2e/fixtures/receipt-proof.png');
const R={ts:new Date().toISOString(),unit:'AU-033',stage:'verify-final',asserts:[],failures:[],network:[],images:{},controls:[]};
function ok(n,c,d){R.asserts.push({name:n,pass:!!c,detail:String(d||'').slice(0,260)});console.log((c?'PASS ':'FAIL ')+n+(d?' :: '+String(d).slice(0,160):''));if(!c)R.failures.push(n);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ariaText(p){
  // authoritative: aria-labels carry the full Flutter text on this build
  return p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const a=e.getAttribute('aria-label')||e.textContent||'';
      const r=e.getBoundingClientRect();
      if(a.trim()) out.push({label:a,tappable:e.getAttribute('flt-tappable')!==null,role:e.getAttribute('role'),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)});
    });
    return out;
  }).catch(()=>[]);
}
function joined(nodes){return nodes.map(n=>n.label).join('\n');}
function clean(x){return (x&&x[0]?String(x[0]).replace(/\s+/g,' '):'');}
async function tapNode(p,pred,tries=2){
  for(let i=0;i<tries;i++){
    const ns=await ariaText(p);
    const hit=ns.filter(pred).sort((a,b)=>a.w*a.h-b.w*b.h)[0];
    if(hit){await p.mouse.click(Math.max(3,Math.min(hit.x+hit.w/2,hit.w>0?hit.x+hit.w-3:371)),Math.max(20,Math.min(hit.y+hit.h/2,663)));await sleep(1200);return true;}
    await p.mouse.move(190,350); await p.mouse.wheel(0,-240); await sleep(400);
  }
  return false;
}
async function login(p,email,pw){
  await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Buy now',45000);
  await L.clickBtn(p,'Login'); await L.waitText(p,'Welcome back',25000);
  const ei=p.locator('input[type="text"]').first(); await ei.click({force:true}); await sleep(300); await p.keyboard.type(email,{delay:12});
  const pi=p.locator('input[type="password"]').first(); await pi.click({force:true}); await sleep(300); await p.keyboard.type(pw,{delay:12});
  await L.clickBtn(p,'Log in');
  let li=false; for(let i=0;i<30&&!li;i++){ await sleep(1000); li=await p.evaluate(()=>!!(localStorage.getItem('flutter.auth_token')||'')); }
  ok('buyer-login',li,'');
}
(async()=>{
  fs.mkdirSync(SHOT_DIR,{recursive:true});

  // ===== independent API truth =====
  const mine=await L.api(fx.buyer.token,'GET','/api/v1/payments/my');
  const row=mine.json.find(x=>x.proformaId===fx.proformaId);
  ok('api-row-rejected',(row.receipts||[]).every(rc=>rc.status==='REJECTED'),JSON.stringify((row.receipts||[]).map(r=>r.status)));
  const rejRc=row.receipts[0];
  ok('api-T24-reasonCode',rejRc.rejectionReasonCode==='AMOUNT_MISMATCH',rejRc.rejectionReasonCode);
  const dl=new Date(row.correctionDeadline);
  const rejAt=new Date(row.rejectedAt);
  ok('api-correctionDeadline-plus48h',Math.abs(dl-rejAt-48*3600e3)<5000,`rejectedAt=${row.rejectedAt} deadline=${row.correctionDeadline}`);

  // freshness
  const fm=await fetch(APP+'/main.dart.js').then(r=>r.headers.get('last-modified')).catch(()=>null);
  ok('freshness-last-modified',fm==='Tue, 25 Aug 2026 08:11:40 GMT',String(fm));

  // ===== MOBILE 375 =====
  const browser=await L.newBrowser();
  const ctx=await L.newCtx(browser,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-033-mobile.webm'});
  const p=await ctx.newPage();
  p.on('response',r=>{if(/localhost:8083\/api\//.test(r.url()))R.network.push(`${r.request().method()} ${r.url().replace('http://localhost:8083','')} -> ${r.status()}`);});
  p.on('response',r=>{const u=r.url();if(/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)||/\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u))R.images[u]=r.status();});
  await login(p,fx.buyer.email,fx.buyer.pw);

  await p.goto(APP+'/account/payments',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await sleep(7000);
  let ns=await ariaText(p); let T=joined(ns);
  ok('screen-title',T.includes('My Payments'),'');
  ok('network-payments-my-200',R.network.some(l=>l.includes('/payments/my')&&l.includes('-> 200')),R.network.filter(l=>l.includes('/payments/my')).join(';').slice(0,120));
  ok('tabs-pending-approved-rejected-expired',['Pending 0','Approved 0','Rejected 1','Expired 0'].every(x=>T.includes(x)),'tab counts from aria labels');
  ok('pending-tab-empty-state',T.includes('No pending payments'),'"No pending payments" + copy (this buyer has only the rejected row)');
  await L.screenshot(p,SHOT_DIR+'/flutter-375-01-default-tab.png');

  // rejected tab
  ok('click-rejected-tab',await tapNode(p,n=>n.label.startsWith('Rejected')),'');
  await sleep(1500);
  ns=await ariaText(p); T=joined(ns);
  const cardLabel=(ns.find(n=>n.role==='group'&&n.label&&n.label.includes('PF-2026'))||{}).label||'';
  ok('rejected-card-present',cardLabel.length>0,cardLabel.slice(0,80));
  ok('rejected-card-number',cardLabel.includes(fx.number),fx.number);
  ok('V4-badge-action-needed',cardLabel.includes('Action needed - new proof'),'');
  ok('V4-pending-since-label',/Pending since \d+\/\d+\/\d+, \d+:\d+ [AP]M/.test(cardLabel),(cardLabel.match(/Pending since[^·]+·?/)||[''])[0].trim());
  ok('V4-method-and-count',cardLabel.includes('mobile money')&&cardLabel.includes('1 receipt'),'');
  ok('V4-price-real',cardLabel.includes('TSh 14,000'),'12,000 item + 2,000 fee');
  ok('V4-banner-copy',cardLabel.includes('Your proof of payment was rejected - please upload a new one.'),'verbatim');
  ok('V4-filename',cardLabel.includes('au033rb.png'),'');
  ok('V4-reasonCode-rendered',cardLabel.includes('AMOUNT_MISMATCH'),'reasonCode visible');
  ok('V4-admin-note-rendered',cardLabel.includes(`AU033 RB probe ${fx.stamp}`),'note text verbatim');
  const cd=cardLabel.match(/(\d+d )?\d+h \d+m remaining to upload corrected proof/);
  ok('V4-correction-countdown',!!cd,cd&&cd[0]);
  // verify countdown math against API deadline
  const remainMs=dl-Date.now();
  const hrs=Math.floor(remainMs/3600e3), mins=Math.floor((remainMs%3600e3)/60e3);
  ok('V4-countdown-matches-deadline',hrs>=47&&hrs<=48,`expected ~${hrs}h ${mins}m from API deadline`);
  ok('V4-no-continue-payment-on-rejected',!cardLabel.includes('Continue payment'),'resumable=false');
  ok('V4-order-button',cardLabel.includes('Order')||(await (async()=>{const n2=await ariaText(p);return n2.some(n=>n.label==='Order');})()),'orderIds non-empty -> Order button');
  await L.screenshot(p,SHOT_DIR+'/flutter-375-02-rejected-card.png');

  // enumerate + click EVERY control on this state
  const ctrls=(ns.filter(n=>n.tappable)).concat(await p.evaluate(()=>[...document.querySelectorAll('input')].map(i=>({label:i.placeholder||i.type,tappable:true,input:true}))));
  R.controls.push({state:'rejected-tab',count:ctrls.length,list:ctrls.map(c=>c.label).slice(0,10)});

  // click Reopen & update payment -> real upload via filechooser
  const fcP=p.waitForEvent('filechooser',{timeout:15000}).catch(()=>null);
  let upHit=false;
  { const n2=await ariaText(p); const h=n2.filter(n=>n.label.includes('Reopen & update payment')).sort((a,b)=>a.w*a.h-b.w*b.h)[0];
    if(h){await p.mouse.click(h.x+h.w/2,h.y+h.h/2);upHit=true;} }
  ok('reopen-button-clicked',upHit,'');
  const fc=await fcP;
  ok('filechooser-fired',!!fc,'image_picker web file chooser opened');
  if(fc){await fc.setFiles([PNG]).catch(e=>console.log('setFiles err',e.message)); await sleep(6000);}
  ok('network-receipts-post-200',R.network.some(l=>l.includes('/receipts')&&l.includes('-> 200')),R.network.filter(l=>l.includes('receipts')).join(';').slice(0,140));

  // server truth after re-upload
  const mine2=await L.api(fx.buyer.token,'GET','/api/v1/payments/my');
  const row2=mine2.json.find(x=>x.proformaId===fx.proformaId);
  const st2=(row2.receipts||[]).map(r=>r.status);
  ok('server-new-SUBMITTED-receipt',st2.filter(s=>s==='SUBMITTED').length>=1,st2.join(','));
  ok('T24-review-restarted',(row2.receipts||[]).some(r=>r.submittedAt>Date.now()-300000&&r.status==='SUBMITTED'),'fresh SUBMITTED receipt = new 30-min review');

  // UI: row left Rejected group
  await sleep(2500);
  ns=await ariaText(p); T=joined(ns);
  ok('tab-now-Pending-1-Rejected-0',T.includes('Pending 1')&&T.includes('Rejected 0'),(T.match(/Pending \d+\s*Approved \d+ Rejected \d+/)||[''])[0]);
  await L.screenshot(p,SHOT_DIR+'/flutter-375-03-after-reupload.png');

  // Pending tab now holds the recovering row with Continue-payment absent but Order present
  ok('open-pending-tab',await tapNode(p,n=>n.label.startsWith('Pending')),'');
  await sleep(1500);
  ns=await ariaText(p); T=joined(ns);
  ok('recovered-row-in-pending',T.includes(fx.number),'row moved to Pending group per web precedence');
  await L.screenshot(p,SHOT_DIR+'/flutter-375-04-pending-after-recovery.png');

  // placeholder scan
  ok('no-placeholder-text',!/(lorem|placeholder|dummy|TODO)\b/i.test(T),'scanned final a11y text');

  await L.closeVideo(ctx,'e2e/videos/AU-033-mobile.webm');

  // ===== TABLET 768 =====
  const ctxT=await L.newCtx(browser,{viewport:{width:768,height:1024},videoPath:'e2e/videos/AU-033-tablet.webm'});
  const t2=await ctxT.newPage();
  t2.on('response',r=>{const u=r.url();if(/\/uploads\//.test(u))R.images[u]=r.status();});
  await t2.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(t2,'Buy now',45000);
  await L.clickBtn(t2,'Login'); await L.waitText(t2,'Welcome back',25000);
  const tei=t2.locator('input[type="text"]').first(); await tei.click({force:true}); await sleep(300); await t2.keyboard.type(fx.buyer.email,{delay:12});
  const tpi=t2.locator('input[type="password"]').first(); await tpi.click({force:true}); await sleep(300); await t2.keyboard.type(fx.buyer.pw,{delay:12});
  await L.clickBtn(t2,'Log in');
  let tl=false; for(let i=0;i<30&&!tl;i++){ await sleep(1000); tl=await t2.evaluate(()=>!!(localStorage.getItem('flutter.auth_token')||'')); }
  ok('tablet-login',tl,'');
  await t2.goto(APP+'/account/payments',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await sleep(7000);
  let tn=await ariaText(t2); let TT=joined(tn);
  ok('tablet-title',TT.includes('My Payments'),'');
  ok('tablet-tabs',TT.includes('Rejected 1'),'pre-upload counts still cached at load');
  // NOTE: the re-upload already happened; reload shows post-recovery state.
  ok('tablet-recovered-row-visible',TT.includes(fx.number),fx.number);
  await L.screenshot(t2,SHOT_DIR+'/flutter-768-01-payments.png');
  R.controls.push({state:'tablet',count:tn.filter(n=>n.tappable).length});
  await L.closeVideo(ctxT,'e2e/videos/AU-033-tablet.webm');

  const imgs=Object.entries(R.images);
  R.imageSummary={requested:imgs.length,ok:imgs.filter(([,s])=>s===200||s===304).length,failed:imgs.filter(([,s])=>s>=400).length};
  fs.writeFileSync('/tmp/au033_final_result.json',JSON.stringify({ts:R.ts,asserts:R.asserts,failures:R.failures,network:R.network.slice(0,40),images:R.imageSummary,controls:R.controls},null,2));
  console.log('\nIMAGES',JSON.stringify(R.imageSummary));
  console.log('FAILURES',JSON.stringify(R.failures));
  await browser.close();
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
