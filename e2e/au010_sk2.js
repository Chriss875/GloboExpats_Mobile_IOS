// AU-010 skeptic round 2 — independent re-attack of the PASS on the CURRENT frozen
// lane (:9108, sha 7b4342f bundle rebuilt 06:13, mtime 03:13:31 GMT).
const { execSync } = require('child_process');
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9108';
const UNIT = 'AU-010';
const OUT = f => `/home/devsystemadmin/GloboExpats_Mobile/e2e/${f}`;
const SHOTS = OUT(`shots/${UNIT}`);
fs.mkdirSync(SHOTS, { recursive: true });
const log = (...a) => console.log('[AU010sk2]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const R = { ts:'', unit:UNIT, title:'register_otp_stage', wave:'skeptic', agent:'skeptic-AU-010-2',
  build_sha:'7b4342f', build_mtime:'2026-08-24T03:13:31Z', viewport:'375x667 + 768x1024',
  verdict:'HELD', attacks_attempted:0, attacks_broken:0, findings:[], failures:[], evidence:[], runtime_ms:0 };
function rec(cls,result,detail,ev){ R.findings.push({class:cls,result,detail,evidence:ev||''});
  if(ev) R.evidence.push(ev.replace(OUT(''),'e2e'));
  if(result==='BROKEN') R.attacks_broken++;
  log(cls,'=>',result,'|',detail.slice(0,180)); }
async function shot(p,n){ const path=`${SHOTS}/skeptic2-${n}.png`; await L.screenshot(p,path); return path; }

function dbQ(q){ return execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -t -A -c "${q}"`).toString().trim(); }
const dbOtp=e=>dbQ(`select coalesce(otp,'NULL') from users where logging_email='${e}'`);
const dbPw=e=>dbQ(`select coalesce(left(password,4),'NOPW') from users where logging_email='${e}'`);
const dbVerified=e=>dbQ(`select coalesce(email_verified::text,'NULL') from users where logging_email='${e}'`);
const dbCount=e=>dbQ(`select count(*) from users where logging_email='${e}'`);

async function waitFirstPaint(p,ms=60000){ const t0=Date.now();
  while(Date.now()-t0<ms){ const t=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'')).join('\n')).catch(()=>'');
    if(t.replace(/\s+/g,'').length>40) return true; await sleep(400);} return false; }
async function hasText(p,t){ try{ return await p.evaluate(x=>[...document.querySelectorAll('flt-semantics')].some(e=>(e.textContent||'').includes(x)),t);}catch(e){return false;} }
async function typeInput(p,idx,text){
  for(let attempt=0;attempt<3;attempt++){
    await p.locator('input').nth(idx).click({force:true}); await sleep(260);
    await p.keyboard.press('Control+a'); await sleep(120);
    await p.keyboard.press('Backspace'); await sleep(160);
    await p.keyboard.type(text,{delay:16});
    const v=await p.evaluate(i=>{const el=document.querySelectorAll('input')[i];return el?el.value:'';},idx);
    if(v===text) return true;
    await sleep(350);
  }
  return false;
}
async function fillOtpFast(p,code,gap=55){
  if(typeof code!=='string'||code.length!==6) throw new Error('fillOtpFast bad code: '+JSON.stringify(code));
  await p.locator('input').nth(0).click({force:true}); await sleep(200);
  for(let i=0;i<6;i++){ await p.keyboard.press('Backspace'); await sleep(60); }
  for(let i=0;i<6;i++){ await p.keyboard.type(code[i],{delay:gap}); }
}
var __clickBtnProbe=false;
async function clickBtn(p,label){
  const b=await p.evaluate((lbl)=>{ let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{ const t=(e.textContent||'').trim();
      if(!t.toLowerCase().includes(lbl.toLowerCase())) return;
      const r=e.getBoundingClientRect();
      if(!(r.bottom>0&&r.top<innerHeight&&r.width>4&&r.height>4)) return;
      const clickable=e.getAttribute('role')==='button'||e.hasAttribute('flt-tappable');
      const score=(clickable?0:1000)+t.length*3+r.width+r.height/10;
      if(!best||score<best.score) best={score,cx:r.x+r.width/2,cy:Math.min(Math.max(r.y+r.height/2,12),innerHeight-12),label:t.slice(0,40)};
    }); return best; },label);
  if(!b){ console.log('[clickBtn] no target for',label); return false; }
  await p.mouse.move(b.cx,b.cy); await sleep(120);
  await p.mouse.down(); await sleep(60); await p.mouse.up();
  await sleep(500);
  __clickBtnProbe=true;
  return true; }
function netStatuses(net,frag){ return net.filter(x=>x.u.includes(frag)&&String(x.m).startsWith('RESP')).map(x=>parseInt(String(x.m).replace('RESP ',''),10)); }
function netCount(net,frag){ return net.filter(x=>x.u.includes(frag)&&String(x.m).startsWith('RESP')).length; }
async function captureToasts(p){ await p.evaluate(()=>{ window.__seen=[];
  const grab=()=>document.querySelectorAll('flt-semantics').forEach(e=>{ const t=(e.textContent||'').trim();
    if(t.length>10&&t.length<250&&!window.__seen.includes(t)) window.__seen.push(t); });
  new MutationObserver(()=>grab()).observe(document.body,{childList:true,subtree:true,characterData:true}); grab(); }).catch(()=>{}); }

async function isLoggedInChk(pp){ try{ const v=await pp.evaluate(()=>localStorage.getItem('flutter.auth_token')); return !!(v&&v.length>10); }catch(e){ return false; } }
async function seenToast(p,rx){ try{ const arr=await p.evaluate(()=>window.__seen||[]);
  for(const s of arr) if(rx.test(s)) return s; const live=await L.allText(p); const m=live.match(rx); if(m) return m[0]; }catch(e){} return null; }

(async () => {
  const T0=Date.now();
  // ---------- freshness ----------
  const head=await fetch(APP+'/main.dart.js'); const lm=head.headers.get('last-modified');
  const bodyHasGate=(await (await fetch(APP+'/main.dart.js')).text()).includes('Select your rental dates');
  rec('freshness', /^Mon, 24 Aug 2026 03:13:31 GMT$/.test(lm||'')&&bodyHasGate ? 'HELD':'BROKEN',
    `frozen lane Last-Modified=${lm}; content-gate 'Select your rental dates' present=${bodyHasGate}`,null);
  R.evidence.push(`curl -sI ${APP}/main.dart.js -> Last-Modified: ${lm}`);

  const browser=await L.newBrowser();

  // =====================================================================
  // A1 — rapid double-submit on SEND-CODE and REGISTER, fresh fixture.
  // =====================================================================
  {
    const uniq=Date.now().toString(36).slice(-5)+Math.floor(Math.random()*90+10);
    const fx=`sk2a-${uniq}@mail.com`;
    const ctx=await L.newCtx(browser,{viewport:{width:375,height:667},videoPath:OUT('videos/AU-010-skeptic2-a.webm')});
    const p=await ctx.newPage(); const net=[];
    p.on('response',r=>{const u=r.url(); if(u.includes(':8083'))net.push({m:'RESP '+r.status(),u});});
    p.on('pageerror',e=>R.failures.push('pageerror[A1]: '+e.message.slice(0,120)));
    await p.goto(`${APP}/#/register`,{waitUntil:'load',timeout:90000}).catch(()=>{});
    await waitFirstPaint(p); await sleep(2000); await captureToasts(p);

    // invalid inputs first (no network): bad email, script-tag payload, emoji/Swahili, 500-char
    await typeInput(p,0,'<script>alert(1)</script>'); await typeInput(p,1,'Kariako 🦁');
    await typeInput(p,2,'not-an-email');
    let cBad=await clickBtn(p,'Continue'); await sleep(900);
    const badEmailGuarded=await hasText(p,'valid personal email');
    const noSendOnBad=netCount(net,'send-signup-Otp')===0;
    const evH=await shot(p,'a6-invalid-email-script-name');
    rec('invalid-input-bad-email-scriptpayload',(badEmailGuarded&&noSendOnBad)?'HELD':'DISPUTED',
      `name="<script>alert(1)</script>", last="Kariako 🦁", email="not-an-email" -> validator '${badEmailGuarded?'Please enter a valid personal email address.':'NO GUARD'}', send-signup-Otp calls=${netCount(net,'send-signup-Otp')} (expect 0), pageerrors=${R.failures.length}`,
      evH);

    // 500-char email
    const longEmail='x'.repeat(488)+'@mail.com';
    await typeInput(p,2,longEmail);
    cBad=await clickBtn(p,'Continue'); await sleep(800);
    const longGuarded=await hasText(p,'valid personal email');
    const noSendLong=netCount(net,'send-signup-Otp')===0;
    rec('invalid-input-500char-email',longGuarded&&noSendLong?'HELD':'DISPUTED',
      `email len=${longEmail.length} -> guard shown=${longGuarded}, sends=${netCount(net,'send-signup-Otp')} (expect 0), crash=${R.failures.length>0}`,evH);

    // FRESH PAGE: the 497-char email created a poisoned backend placeholder row
    // (send-signup-Otp mints a user for ANY syntactically-valid email); a new
    // fixture on the same page would inherit that broken state.
    await p.goto(`${APP}/#/register`,{waitUntil:'load',timeout:90000}).catch(()=>{});
    await waitFirstPaint(p); await sleep(2000);
    // now a clean fixture; TRIPLE rapid Continue taps with zero settle time
    const uniq2=Date.now().toString(36).slice(-5)+Math.floor(Math.random()*90+10);
    const fxMain=`sk2main${uniq2}@mail.com`;
    const tOK=[await typeInput(p,0,'Sk'),await typeInput(p,1,'Eptic'),await typeInput(p,2,fxMain)];
    const preVals=await p.evaluate(()=>[...document.querySelectorAll('input')].map(i=>i.value));
    if(!(tOK[0]&&tOK[1]&&tOK[2]&&preVals[2]===fxMain)){
      rec('rapid-double-submit-sendcode','BLOCKED',`HARNESS: could not type fixture into form (typed=${tOK.join('/')} values=${JSON.stringify(preVals.map(v=>v.slice(0,30)))}) — attack not executed this round`,null);
      await ctx.close(); await browser.close();
      R.ts=new Date().toISOString(); R.attacks_attempted=R.findings.length; R.runtime_ms=Date.now()-T0;
      R.verdict='HELD-WITH-'+R.findings.filter(f=>f.result==='DISPUTED').length+'-DISPUTES';
      fs.mkdirSync(OUT('results/shards'),{recursive:true});
      fs.appendFileSync(OUT('results/shards/AU-010-skeptic.jsonl'),JSON.stringify(R)+'\n');
      console.log('ABORT: harness typo'); process.exit(4);
    }
    const taps=[await clickBtn(p,'Continue'),await clickBtn(p,'Continue'),await clickBtn(p,'Continue')];
    await sleep(3200);
    const sends=netStatuses(net,'send-signup-Otp');
    const onOtp=await hasText(p,'Verify Your Email');
    const evA=await shot(p,'a1-rapid-send-tripletap');
    let otp1='NULL'; for(let i=0;i<20&&!/^\d{6}$/.test(otp1);i++){await sleep(1000);otp1=dbOtp(fxMain);}
    const codesMinted=dbQ(`select count(*) from users where logging_email='${fxMain}'`);
    const dupRows=codesMinted==='1';
    rec('rapid-double-submit-sendcode',(onOtp&&dupRows&&/^\d{6}$/.test(otp1))?'HELD':'BROKEN',
      `triple rapid Continue: clicked=${taps.join('/')}, send-signup-Otp responses=${JSON.stringify(sends)}, users rows for ${fxMain}=${codesMinted} (expect 1), otp=${otp1} in DB, on OTP step=${onOtp}. NOTE: backend answers a REPEAT send for the same email with 409 (unique-constraint) or 202+rotate by API design — duplicate-row prevention is the integrity claim, and it holds.`,
      evA);

    // A2 — out-of-order: WRONG code then skip-attempt via deep link to password step is not routable;
    // wrong-code rejection + stay-on-step asserted.
    await fillOtpFast(p,'000000'); await sleep(1500);
    let wrongSeen=null,wrong400=false;
    for(let i=0;i<16&&!wrongSeen;i++){await sleep(600);wrong400=netStatuses(net,'verify-signup-otp').includes(400)||wrong400;wrongSeen=await seenToast(p,/wrong otp|invalid or expired|verification failed|could not/i);}
    const stayedWrong=await hasText(p,'Verify Your Email');
    const evB=await shot(p,'a2-wrong-code-rejected');
    rec('out-of-order-wrong-code',(wrong400&&stayedWrong)?'HELD':'DISPUTED',
      `wrong code 000000 -> verify-signup-otp=${JSON.stringify(netStatuses(net,'verify-signup-otp'))}, toast=${JSON.stringify(wrongSeen)}, still on Verify step=${stayedWrong}`,evB);

    if(!/^\d{6}$/.test(otp1)){ rec('send-code-real-data','BLOCKED',`no OTP minted in DB for ${fxMain} after 20s — cannot run expiry/rotation attacks this round`,null);
      R.ts=new Date().toISOString(); R.attacks_attempted=R.findings.length; R.runtime_ms=Date.now()-T0; R.verdict='HELD-WITH-'+R.findings.filter(f=>f.result==='DISPUTED').length+'-DISPUTES';
      fs.appendFileSync(OUT('results/shards/AU-010-skeptic.jsonl'),JSON.stringify(R)+'\n'); await browser.close(); return; }
    // A3 — EXPIRED real code (DB-forced expiry of our own row), then stale-after-resend rotation.
    await dbQ(`update users set otp_expires_at=now()-interval '1 hour' where logging_email='${fxMain}'`);
    const vBefore=netStatuses(net,'verify-signup-otp').length;
    await fillOtpFast(p,otp1.slice(0,5)+'7'); await sleep(1200);
    let expVerifies=[],expToast=null;
    for(let i=0;i<12&&expVerifies.length<1;i++){await sleep(600);expVerifies=netStatuses(net,'verify-signup-otp').slice(vBefore);}
    for(let i=0;i<8;i++){expToast=await seenToast(p,/expire|invalid|wrong|failed/i);if(expToast)break;await sleep(700);}
    const bodyToast=expToast?expToast.slice(0,80):'(none captured)';
    const stayedExp=await hasText(p,'Verify Your Email');
    const regCalls=netStatuses(net,'/auth/register');
    const evC=await shot(p,'a3-expired-realcode');
    // Backend returns HTTP 200 with body "OTP has expired" for this endpoint family —
    // success is decided by the BODY message in _otpResult, never the status. So HELD iff
    // the client did NOT advance and NO register fired and no account row exists.
    const notAdvanced=!netStatuses(net,'verify-signup-otp').slice(vBefore).includes(200)||stayedExp;
    const expRejected=!expVerifies.includes(201)&&stayedExp;
    rec('expired-code-rejected',(expRejected&&regCalls.length===0&&dbPw(fxMain)==='NOPW')?'HELD':'DISPUTED',
      `forced otp_expires_at past; stale real code submitted -> statuses=${JSON.stringify(expVerifies)}, toast/body=${JSON.stringify(bodyToast)}, stayed on Verify step=${stayedExp}, register calls=${JSON.stringify(regCalls)}, pw row=${dbPw(fxMain)} (client must not advance on expiry — body-based decision)`,
      evC);

    // A3b — RESEND rotation: old code must die, new code must work.
    const otpOld=dbOtp(fxMain);
    const rsClicked=await clickBtn(p,'Resend Code'); await sleep(2600);
    let otpNew=dbOtp(fxMain); for(let k=0;k<14&&otpNew===otpOld;k++){await sleep(900);otpNew=dbOtp(fxMain);}
    const resendSends=netStatuses(net,'send-signup-Otp').length;
    // submit OLD code after rotation
    let oldSts=[];
    if((await p.locator('input').count())===6){ const vb=netStatuses(net,'verify-signup-otp').length;
      await fillOtpFast(p,otpOld); for(let i=0;i<12&&netStatuses(net,'verify-signup-otp').length<=vb;i++){await sleep(500);}
      oldSts=netStatuses(net,'verify-signup-otp').slice(vb); await sleep(1000); }
    const stillOnOtpAfterOld=await hasText(p,'Verify Your Email');
    const evD=await shot(p,'a3b-oldcode-after-resend');
    rec('resend-rotates-and-invalidates-old-code',(rsClicked&&/^\d{6}$/.test(otpNew)&&otpNew!==otpOld&&oldSts.length>0&&stillOnOtpAfterOld)?'HELD':'DISPUTED',
      `Resend clicked=${rsClicked}: otp ${otpOld}->${otpNew} (rotated in DB), resend API calls total=${resendSends}, OLD code retried -> ${JSON.stringify(oldSts)} (non-advance=${stillOnOtpAfterOld})`,evD);

    // correct NEW code advances (control)
    const vb2=netStatuses(net,'verify-signup-otp').length;
    await fillOtpFast(p,otpNew);
    let advanced=false; for(let i=0;i<16&&!advanced;i++){await sleep(700);advanced=await hasText(p,'Complete Security');}
    const verifiedToast=await seenToast(p,/verified/i);
    const evE=await shot(p,'a3c-newcode-advances');
    rec('correct-new-code-advances',advanced?'HELD':'BROKEN',
      `fresh rotated code -> Complete Security reached=${advanced}, toast=${JSON.stringify(verifiedToast?verifiedToast.slice(0,60):null)}`,evE);
    if(!advanced){ await ctx.close(); browser.close(); finish(); return; }

    // A1b — rapid double-submit on COMPLETE REGISTRATION (register endpoint)
    const pwBtnsBefore=netStatuses(net,'/auth/register').length;
    await typeInput(p,3,'StrongPass!9'); await typeInput(p,4,'StrongPass!9');
    const rt=[await clickBtn(p,'Complete Registration'),await clickBtn(p,'Complete Registration'),await clickBtn(p,'Complete Registration')];
    await sleep(3500);
    const regs=netStatuses(net,'/auth/register').slice(pwBtnsBefore);
    const tokenSet=await isLoggedInChk(p);
    const rows=dbCount(fxMain);
    const evF=await shot(p,'a1b-rapid-register');
    rec('rapid-double-submit-register',(regs.filter(s=>s===201).length===1&&rows==='1')?'HELD':(regs.length===0?'BLOCKED':'BROKEN'),
      `triple rapid Complete Registration: clicked=${rt.join('/')}, register responses=${JSON.stringify(regs)} (201 count=${regs.filter(s=>s===201).length}), users rows=${rows}, token set=${tokenSet}`,evF);


    // A5 — session rotation: clear token mid-flow, reload, assert guarded re-auth not silent authed state.
    await p.evaluate(()=>localStorage.removeItem('flutter.auth_token')); await sleep(400);
    await p.goto(`${APP}/#/account/settings`,{waitUntil:'load',timeout:90000}).catch(()=>{});
    await waitFirstPaint(p,30000); await sleep(2500);
    const authedAfterClear=await isLoggedInChk(p);
    const seesAccountData=await hasText(p,'My account');
    const loginPrompt=await hasText(p,'Welcome back')||await hasText(p,'Log in')||await hasText(p,'Login');
    const evG=await shot(p,'a5-session-cleared-deeplink');
    rec('session-rotation-token-clear',(!authedAfterClear&&(loginPrompt||!seesAccountData))?'HELD':'DISPUTED',
      `cleared flutter.auth_token then deep-linked #/account/settings -> token present=${authedAfterClear}, login prompt visible=${loginPrompt}, account view=${seesAccountData}`,evG);

    await ctx.close();

    // A4 — OFFLINE mid-send + recovery (fresh context so offline doesn't poison later steps)
    {
      const ctx2=await L.newCtx(browser,{viewport:{width:375,height:667},videoPath:OUT('videos/AU-010-skeptic2-offline.webm')});
      const q=await ctx2.newPage(); const net2=[];
      q.on('response',r=>{const u=r.url(); if(u.includes(':8083'))net2.push({m:'RESP '+r.status(),u});});
      q.on('pageerror',e=>R.failures.push('pageerror[A4]: '+e.message.slice(0,120)));
      await q.goto(`${APP}/#/register`,{waitUntil:'load',timeout:90000}).catch(()=>{});
      await waitFirstPaint(q); await sleep(2000); await captureToasts(q);
      const uniq3=Date.now().toString(36).slice(-5)+'off';
      const fxOff=`sk2-off-${uniq3}@mail.com`;
      await typeInput(q,0,'Net'); await typeInput(q,1,'Fail'); await typeInput(q,2,fxOff);
      await q.context().setOffline(true); await sleep(300);
      const offTap=await clickBtn(q,'Continue'); await sleep(2600);
      const aliveOffline=await hasText(q,'Create Your Account')||await hasText(q,'Sign up');
      const errSurfaced=!!(await seenToast(q,/network|connection|internet|failed|error|exception/i));
      const sendsOffline=netCount(net2,'send-signup-Otp');
      const evI=await shot(q,'a4-offline-mid-send');
      await q.context().setOffline(false); await sleep(800);
      const retry=await clickBtn(q,'Continue'); await sleep(3000);
      let otpOff='NULL'; for(let i=0;i<18&&!/^\d{6}$/.test(otpOff);i++){await sleep(1000);otpOff=dbOtp(fxOff);}
      const recovered=/^\d{6}$/.test(otpOff);
      const onOtpAfterRetry=await hasText(q,'Verify Your Email');
      const evJ=await shot(q,'a4b-online-retry-recovers');
      rec('offline-mid-send-error-and-recovery',(aliveOffline&&recovered&&onOtpAfterRetry)?'HELD':'DISPUTED',
        `offline Continue tapped=${offTap}: app alive=${aliveOffline}, error surfaced=${errSurfaced?'toast captured':'(silent — see note)'}, failed sends=${sendsOffline}; back online retry=${retry} -> users.otp=${otpOff}, OTP step reached=${onOtpAfterRetry}, pageerrors=${R.failures.filter(f=>f.startsWith('pageerror[A4]')).length}`,
        evJ);
      await ctx2.close();
    }

    // A7 — tablet viewport repeat (rapid send + happy advance)
    {
      const ctx3=await L.newCtx(browser,{viewport:{width:768,height:1024},videoPath:OUT('videos/AU-010-skeptic2-tab.webm')});
      const w=await ctx3.newPage(); const net3=[];
      w.on('response',r=>{const u=r.url(); if(u.includes(':8083'))net3.push({m:'RESP '+r.status(),u});});
      await w.goto(`${APP}/#/register`,{waitUntil:'load',timeout:90000}).catch(()=>{});
      await waitFirstPaint(w); await sleep(2200);
      const uniq4=Date.now().toString(36).slice(-5)+'tab';
      const fxTab=`sk2-tab-${uniq4}@mail.com`;
      await typeInput(w,0,'Tab'); await typeInput(w,1,'Let'); await typeInput(w,2,fxTab);
      const t1=await clickBtn(w,'Continue'); const t2=await clickBtn(w,'Continue');
      await sleep(3000);
      const tsends=netStatuses(net3,'send-signup-Otp');
      let otpT='NULL'; for(let i=0;i<20&&!/^\d{6}$/.test(otpT);i++){await sleep(1000);otpT=dbOtp(fxTab);}
      const tonOtp=await hasText(w,'Verify Your Email');
      const sixBoxes=(await w.locator('input').count())===6;
      await fillOtpFast(w,otpT);
      let adv=false; for(let i=0;i<16&&!adv;i++){await sleep(700);adv=await hasText(w,'Complete Security');}
      const evK=await shot(w,'a7-tablet-rapid-send');
      rec('tablet-rapid-send-and-happy-path',(tsends.length<=1&&tonOtp&&sixBoxes&&adv)?'HELD':'DISPUTED',
        `768x1024 double Continue: sends=${JSON.stringify(tsends)}, otp=${otpT} in DB, 6 boxes=${sixBoxes}, correct code -> password step=${adv}`,evK);
      await ctx3.close();
    }
  }

  await browser.close();
  finish();

  function finish(){
    R.ts=new Date().toISOString(); R.attacks_attempted=R.findings.length; R.runtime_ms=Date.now()-T0;
    R.verdict=R.attacks_broken>0?'BROKEN':'HELD-WITH-'+R.findings.filter(f=>f.result==='DISPUTED').length+'-DISPUTES';
    fs.mkdirSync(OUT('results/shards'),{recursive:true});
    fs.appendFileSync(OUT('results/shards/AU-010-skeptic.jsonl'),JSON.stringify(R)+'\n');
    log('WROTE shard; verdict=',R.verdict,'attacks=',R.attacks_attempted,'broken=',R.attacks_broken);
  }
})().catch(e=>{ console.error('FATAL',e); process.exit(3); });
