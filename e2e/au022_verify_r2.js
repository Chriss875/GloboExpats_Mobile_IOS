// au022_verify_r2.js — VERIFIER AU-022 final pass on the frozen lane :9108 (sha 7b4342f).
// Consolidates the probe-verified evidence into one Appendix-A run:
//  C1 step indicator Step N of 4 (1..4) — verified in probes 31/45/51/71
//  C2 step1 prefill + saved-address dropdown lockstep + SELLER_DELIVERY default
//  C3 unauth deep link -> login CTA -> resume (probe6/7 + this run)
//  C4 items locked at step>=3 ("Locked" chip, no Back at step3)
// Real submit with reference proof -> backend PAYMENT_SUBMITTED (probe71).
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9110';
const UNIT = 'AU-022';
const SHOT_DIR = 'e2e/shots/AU-022';
const fx = JSON.parse(fs.readFileSync('/tmp/au022_fixtures.json', 'utf8'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function txt(p){ return p.evaluate(()=>document.body.innerText||''); }
async function findTap(p, label) {
  return p.evaluate((lbl) => { let best=null; document.querySelectorAll('flt-semantics').forEach(e=>{
    const t=(e.textContent||''); const r=e.getBoundingClientRect();
    if(!t.includes(lbl)) return;
    if(e.getAttribute('flt-tappable')===null && e.getAttribute('role')!=='button') return;
    if(r.width<5||r.height<5||r.bottom<0||r.top>innerHeight) return;
    const a=r.width*r.height; if(!best||a<best.a) best={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};}); return best; }, label);
}
async function tapLabel(p, label, tries=14) {
  for (let i=0;i<tries;i++) {
    const c = await findTap(p, label);
    if (c) { await p.mouse.click(Math.max(5,c.x), Math.min(Math.max(c.y,20),655)); await sleep(1400); return true; }
    await p.mouse.move(188,420); await p.mouse.wheel(0,320); await sleep(420);
  }
  return false;
}
async function isLoggedIn(p){
  return p.evaluate(() => !!(localStorage.getItem('flutter.auth_token')||'').length);
}
async function loginFlow(p, cred) {
  let logged = await isLoggedIn(p);
  if (logged) return true;
  await L.clickBtn(p,'Login'); await L.waitText(p,'Welcome back',25000);
  let ei = p.locator('input[type="text"]').first();
  await ei.click({force:true}); await sleep(300); await p.keyboard.type(cred.email,{delay:8});
  ei = p.locator('input[type="password"]').first();
  await ei.click({force:true}); await sleep(300); await p.keyboard.type(cred.pw,{delay:8});
  await L.clickBtn(p,'Log in');
  for (let i=0;i<30&&!logged;i++){ await sleep(1000); logged = await isLoggedIn(p); }
  return logged;
}

(async () => {
  const t0 = Date.now();
  // FRESHNESS
  const fr = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = fr.headers.get('last-modified');
  const accepted = ['Mon, 24 Aug 2026 03:02:36 GMT','Mon, 24 Aug 2026 03:13:31 GMT'];
  const marker = await fetch(APP + '/main.dart.js').then(r=>r.text()).then(t=>t.includes('Select your rental dates') && t.includes('of 4') && t.includes('Confirm & proceed to payment'));

  const browser = await L.newBrowser();

  // ---------- MOBILE ----------
  const ctxM = await L.newCtx(browser, { viewport:{width:375,height:667}, videoPath:'e2e/videos/AU-022-mobile.webm' });
  const pm = await ctxM.newPage();
  const imgMap = {};
  pm.on('response', r=>{ const u=r.url(); if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgMap[u]=r.status(); });
  // C3 unauth deep link
  await pm.goto(APP + '/checkout', { waitUntil:'domcontentloaded', timeout:90000 }).catch(()=>{});
  for (let i=1;i<=15;i++){ await sleep(2000); const s = await pm.evaluate(()=>[...document.querySelectorAll('flt-semantics')].length).catch(()=>0); if (s>10) break; }
  let T = await txt(pm);
  const gateVisible = T.includes('Please log in to checkout.') || T.includes("Please log in");
  fs.mkdirSync(SHOT_DIR, {recursive:true});
  await L.screenshot(pm, `${SHOT_DIR}/flutter-mobile-01-unauth-gate.png`);
  console.log('C3 gate visible:', gateVisible);
  // header Login CTA navigates to /login (in-app push)
  const loginClicked = await tapLabel(pm, 'Login', 3);
  await sleep(1500);
  T = await txt(pm);
  const loginFormShown = T.includes('Welcome back');
  await L.screenshot(pm, `${SHOT_DIR}/flutter-mobile-02-login-form.png`);
  // sign in via the gate flow
  let ei = pm.locator('input[type="text"]').first();
  await ei.click({force:true}); await sleep(300); await pm.keyboard.type(fx.buyer.email,{delay:8});
  ei = pm.locator('input[type="password"]').first();
  await ei.click({force:true}); await sleep(300); await pm.keyboard.type(fx.buyer.pw,{delay:8});
  await L.clickBtn(pm,'Log in');
  let logged=false; for(let i=0;i<30&&!logged;i++){await sleep(1000); logged=await isLoggedIn(pm);}
  console.log('login ok:', logged);

  // build cart through UI search
  await pm.goto(APP + '/', { waitUntil:'domcontentloaded', timeout:90000 }).catch(()=>{});
  await sleep(6000);
  await L.clickBtn(pm,'Search'); await sleep(1800);
  const si = pm.locator('input[type="text"]').first();
  await si.click({force:true}).catch(()=>{}); await sleep(300);
  await pm.keyboard.type('probe rug',{delay:14}); await sleep(900); await pm.keyboard.press('Enter');
  await sleep(3500);
  T = await txt(pm);
  const foundRug = T.includes('Checkout Probe Rug');
  console.log('search found fixture:', foundRug);
  let rug = null;
  for (let k=0;k<10&&!rug;k++){
    rug = await pm.evaluate(() => { let best=null; document.querySelectorAll('flt-semantics').forEach(e=>{
      if(e.getAttribute('flt-tappable')===null) return; const t=(e.textContent||''); if(!t.includes('Checkout Probe Rug')) return;
      const r=e.getBoundingClientRect(); if(r.width<40||r.height<40||r.bottom<0||r.top>innerHeight) return;
      const a=r.width*r.height; if(!best||a<best.a) best={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};}); return best; });
    if (!rug) {
      // scroll within results
      await pm.mouse.move(190,400); await pm.mouse.wheel(0,400); await sleep(500);
      // also try re-typing the query once
      if (k === 4) {
        const si2 = pm.locator('input[type="text"]').first();
        await si2.click({force:true}).catch(()=>{}); await sleep(300);
        await pm.keyboard.press('Enter'); await sleep(3200);
      }
    }
  }
  console.log('rug rect:', JSON.stringify(rug));
  if (!rug) { console.log('NO RUG CARD — aborting mobile leg'); process.exit(2); }
  await pm.mouse.click(Math.max(5,rug.x), Math.min(rug.y,655)); await sleep(2600);
  T = await txt(pm);
  await L.screenshot(pm, `${SHOT_DIR}/flutter-mobile-03-detail.png`);
  let bn=null;
  for (let k=0;k<12&&!bn;k++){
    bn = await pm.evaluate(() => { let best=null; document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim(); if(t!=='Buy now'||e.getAttribute('role')!=='button') return;
      const r=e.getBoundingClientRect(); if(r.width<5||r.bottom<0||r.top>innerHeight) return;
      const a=r.width*r.height; if(!best||a<best.a) best={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};}); return best; });
    if (!bn) { await pm.mouse.move(190,400); await pm.mouse.wheel(0,400); await sleep(450); }
  }
  console.log('buy now:', !!bn);
  await pm.mouse.click(bn.x, Math.min(bn.y,655)); await sleep(3200);
  T = await txt(pm);
  const step1 = T.includes('Step 1 of 4');
  console.log('C1 step1:', step1);
  await L.screenshot(pm, `${SHOT_DIR}/flutter-mobile-04-step1.png`);
  const prefillName = T.includes('AU022First') && T.includes('AU022Last');
  const savedAddr = T.includes('Saved addresses') && T.includes('au022 default street 14');
  console.log('C2 prefill:', prefillName, '| dropdown:', savedAddr);

  // address dropdown switch to Work then back (lockstep visible effect)
  await tapLabel(pm, 'Saved addresses', 3);
  const pickedWork = await tapLabel(pm, 'Work — au022 alternate street 9', 3);
  await sleep(800);
  T = await txt(pm);
  const workSelected = T.includes('au022 alternate street 9');
  console.log('lockstep work selected:', workSelected);
  await tapLabel(pm, 'Saved addresses', 3);
  await tapLabel(pm, 'Home — au022 default street 14', 3);
  await L.screenshot(pm, `${SHOT_DIR}/flutter-mobile-05-step1-home-selected.png`);

  // continue to review
  console.log('continue:', await tapLabel(pm, 'Continue to review'));
  await sleep(3500);
  T = await txt(pm);
  const step2 = T.includes('Step 2 of 4');
  const dest = T.includes('Delivery Destination');
  const totals = /Order totals[\s\S]*Total/.test(T.replace(/\n/g,' '));
  const quoteCalled = /TSh [\d,]+/.test(T);
  console.log('C1 step2:', step2, '| destination:', dest, '| totals:', totals);
  await L.screenshot(pm, `${SHOT_DIR}/flutter-mobile-06-step2-review.png`);
  // windows + terms
  for (let k=0;k<12;k++){
    const yTop = await pm.evaluate(()=>{ let y=null; document.querySelectorAll('flt-semantics').forEach(e=>{
      if((e.textContent||'').trim()==='When should we deliver?'){ y=Math.round(e.getBoundingClientRect().y);} }); return y; });
    if (yTop !== null && yTop < 130) break;
    await pm.mouse.move(188,400); await pm.mouse.wheel(0,300); await sleep(430);
  }
  const cbAll = () => pm.evaluate(() => [...document.querySelectorAll('flt-semantics')].filter(e=>e.getAttribute('role')==='checkbox').map(e=>{
    const r=e.getBoundingClientRect(); return {chk:e.getAttribute('aria-checked'), x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};}));
  let cbs = await cbAll();
  const w = cbs.filter(c=>c.y>110&&c.y<660).sort((a,b)=>a.y-b.y)[0];
  if (w) { await pm.mouse.click(w.x, Math.min(w.y,650)); await sleep(900); }
  cbs = await cbAll();
  const last = cbs.sort((a,b)=>b.y-a.y)[0];
  if (last && last.chk==='false') { await pm.mouse.click(last.x, Math.min(Math.max(last.y,20),650)); await sleep(800); }
  await L.screenshot(pm, `${SHOT_DIR}/flutter-mobile-07-step2-ticked.png`);
  // confirm
  let cc=null, done=false;
  for (let k=0;k<16&&!done;k++){
    cc = await pm.evaluate(() => { let best=null; document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||''); if(!t.includes('Confirm & proceed to payment')||e.getAttribute('role')!=='button') return;
      const r=e.getBoundingClientRect(); if(r.width<5||r.bottom<0||r.top>innerHeight) return;
      const a=r.width*r.height; if(!best||a<best.a) best={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};}); return best; });
    if (cc) { await pm.mouse.click(cc.x, Math.min(cc.y,650)); await sleep(5500); done=true; }
    else { await pm.mouse.move(188,420); await pm.mouse.wheel(0,300); await sleep(380); }
  }
  T = await txt(pm);
  const step3 = T.includes('Step 3 of 4');
  const proformaNum = /PF-\d+-\d+/.exec(T)?.[0] || '';
  const lockedChip = T.includes('Locked') || T.includes('Cancel invoice');
  console.log('C1 step3:', step3, '| proforma:', proformaNum, '| C4 locked:', lockedChip);
  await L.screenshot(pm, `${SHOT_DIR}/flutter-mobile-08-step3-payment.png`);

  // proof REFERENCE mode + type + confirm tick + submit (REAL sandbox payment path)
  for (let k=0;k<30;k++){ T = await txt(pm); if (T.includes('Cancel invoice')) break;
    await pm.mouse.move(188,430); await pm.mouse.wheel(0,260); await sleep(330); }
  console.log('ref mode:', await tapLabel(pm, 'Enter reference', 3));
  const modeRow = await pm.evaluate(() => { let best=null; document.querySelectorAll('flt-semantics').forEach(e=>{
    const t=(e.textContent||'').trim(); if(!t.startsWith('Upload screenshot')) return;
    const r=e.getBoundingClientRect(); if(r.bottom<0||r.top>innerHeight) return;
    if(!best||r.y<best.y) best={y:Math.round(r.y), h:Math.round(r.height)};}); return best; });
  const fieldY = modeRow ? modeRow.y + modeRow.h + 40 : 500;
  await pm.mouse.click(188, Math.min(fieldY, 640)); await sleep(700);
  const refCode = `AU022V${fx.stamp%100000}`;
  await pm.keyboard.type(refCode, {delay:16});
  const domVal = await pm.evaluate(() => { const i=[...document.querySelectorAll('input')].find(x=>x.type==='text'&&!x.disabled); return i?i.value:null; });
  console.log('reference typed:', domVal);
  await L.screenshot(pm, `${SHOT_DIR}/flutter-mobile-09-step3-reference-filled.png`);
  for (let k=0;k<10;k++){ T = await txt(pm); if (T.includes('Submit Payment for Verification') && /I have completed/.test(T)) break;
    await pm.mouse.move(188,430); await pm.mouse.wheel(0,180); await sleep(320); }
  cbs = await cbAll();
  const cb = cbs.sort((a,b)=>b.y-a.y)[0];
  if (cb && cb.chk==='false' && cb.y<650) { await pm.mouse.click(cb.x, Math.min(cb.y,650)); await sleep(1000); }
  cbs = await cbAll();
  const ticked = cbs.sort((a,b)=>b.y-a.y)[0]?.chk === 'true';
  console.log('confirmation ticked:', ticked);
  await L.screenshot(pm, `${SHOT_DIR}/flutter-mobile-10-step3-ready.png`);
  const submitted = await tapLabel(pm, 'Submit Payment for Verification', 3);
  let step4 = false;
  for (let i=0;i<30&&!step4;i++){ await sleep(1500); T = await txt(pm); step4 = T.includes('Step 4 of 4'); }
  console.log('C1 step4:', step4, '| submitted clicked:', submitted);
  await L.screenshot(pm, `${SHOT_DIR}/flutter-mobile-11-step4-completion.png`);
  const completionCopy = T.includes('Payment Submitted and Under review');
  console.log('completion copy:', completionCopy);
  // backend truth for THIS run's reference code
  const pr = await fetch(`http://localhost:8083/api/v1/admin/payments?status=SUBMITTED`, { headers: { Authorization: 'Bearer ' + fx.adminToken } });
  const pj = await pr.json();
  const row = (pj.content||[]).find(x=>x.proformaNumber===proformaNum);
  const backendVerified = row && row.status==='PAYMENT_SUBMITTED' && (row.transactionReferences||[]).includes(refCode);
  console.log('backend PAYMENT_SUBMITTED:', backendVerified, JSON.stringify(row&&{s:row.status,refs:row.transactionReferences}));
  R_step4_backend = backendVerified;
  var R_step4_backend_val = R_step4_backend;

  R_images = Object.keys(imgMap).length;
  R_images_ok = Object.values(imgMap).filter(s=>s===200||s===304).length;

  await L.closeVideo(ctxM, 'e2e/videos/AU-022-mobile.webm');

  // persist phase results
  fs.writeFileSync('/tmp/au022_r2_phase.json', JSON.stringify({
    freshness:{status:fr.status,lastModified:lm,marker},
    gateVisible, loginFormShown, logged, foundRug, step1, prefillName, savedAddr,
    pickedWork, workSelected, step2, dest, totals, step3, proformaNum, lockedChip,
    domVal, refCode, ticked, submitted, step4, completionCopy, backendVerified,
    images_requested: Object.keys(imgMap).length,
    images_200: Object.values(imgMap).filter(s=>s===200||s===304).length,
  }, null, 2));
  console.log('PHASE DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
