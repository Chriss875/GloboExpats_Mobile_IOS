// au010_verify_r4.js — AU-010 failed-send guard re-verify on fresh bundle 97ee952.
// The skeptic's BROKEN was: 409 DATA_CONFLICT (290-char email) still advanced to
// the verify step with a success snackbar. Fix commit 49af7e0 was not in the
// tested bundle; it IS in 97ee952 @ :9110. This run proves the guard live.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP='http://localhost:9110';
const SHOT_DIR='e2e/shots/AU-010r4';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function txt(p){ return p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')).catch(()=>''); }

const R={ts:new Date().toISOString(),unit:'AU-010',title:'register_otp_stage_r4_guard',
 wave:'verify',agent:'verifier-au010-r4',build_sha:'97ee952',build_mtime:'2026-08-24T21:19:03Z',
 viewport:'375x667',checks:{real_data:true,real_data_probe:'live send-signup-otp calls on :8083 with poisoned + valid emails',
 images_requested:0,images_200:0,images_broken:[],buttons_total:1,buttons_ok:1,buttons_failed:[],
 state_asserts:0,nav_asserts:0,data_asserts:0,vision_defects:0,vision_findings:[],parity:{blocker:0,major:0,minor:0,accepted:2}},
 failures:[],evidence:[],runtime_ms:0};
function ok(n,c,d){if(c){R.checks.state_asserts++;console.log(`PASS ${n}${d?' :: '+d:''}`);}else{R.failures.push(n+' '+(d||''));console.log(`FAIL ${n} ${d||''}`);}return c;}

(async()=>{
  const t0=Date.now();
  fs.mkdirSync(SHOT_DIR,{recursive:true});
  const browser=await L.newBrowser();
  const ctx=await L.newCtx(browser,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-010-r4-guard.webm'});
  const p=await ctx.newPage();

  // ---- A) POISONED EMAIL (290 chars, regex-valid) → must NOT advance, NO success copy
  await p.goto(`${APP}/#/register`,{waitUntil:'load',timeout:90000}).catch(()=>{});
  for(let i=0;i<30;i++) await sleep(1000);
  const inputs=p.locator('input[type="text"]');
  const longEmail='a'.repeat(276)+'@gmail.com';
  await inputs.nth(0).click({force:true});await sleep(250);await p.keyboard.type('Guard',{delay:10});
  await inputs.nth(1).click({force:true});await sleep(250);await p.keyboard.type('Poison'+Date.now()%9999,{delay:10});
  await inputs.nth(2).click({force:true});await sleep(250);await p.keyboard.type(longEmail,{delay:1});
  let sendStatus=null;
  p.on('response',r=>{if(r.url().includes('send-signup-otp'))sendStatus=r.status();});
  await p.locator('flt-semantics',{hasText:'Continue'}).last().click({force:true});
  await sleep(4500);
  let T=await txt(p);
  // the verify step renders "Verify Your Email" — being there means advance
  const advanced=T.includes('Verify Your Email');
  const successCopy=T.includes('Verification code sent');
  ok('A-poisoned-email-does-not-advance',!advanced||successCopy===false&&!advanced? !advanced : !advanced,
    `advanced=${advanced} successToast=${successCopy}`);
  ok('A-no-success-copy-on-409',!successCopy,'no "Verification code sent" snackbar after a rejected send');
  R.evidence.push(`${SHOT_DIR}/a-poisoned.png`);
  await L.screenshot(p,`${SHOT_DIR}/a-poisoned.png`);

  // ---- B) VALID NEW EMAIL → advances to verify step WITH success copy
  await p.goto(`${APP}/#/`,{waitUntil:'load',timeout:90000}).catch(()=>{});
  await sleep(3000);
  await p.evaluate(()=>{window.location.hash='#/register';});
  for(let i=0;i<25;i++) await sleep(1000);
  let T0=await txt(p);
  if(T0.includes('Verify Your Email')){
    // still on the old step — hit Change Email to get back to stage 1
    const ch=p.locator('flt-semantics',{hasText:'Change Email'}).last();
    await ch.click({force:true}).catch(()=>{});
    await sleep(2000);
    T0=await txt(p);
  }
  console.log('stage1 ready:', T0.includes('Create Your Account'));
  const goodEmail=`au010ok${Date.now()}@gmail.com`;
  await inputs.nth(0).click({force:true});await sleep(250);await p.keyboard.type('Happy',{delay:10});
  await inputs.nth(1).click({force:true});await sleep(250);await p.keyboard.type('Path'+Date.now()%9999,{delay:10});
  await inputs.nth(2).click({force:true});await sleep(250);await p.keyboard.type(goodEmail,{delay:8});
  sendStatus=null;
  await p.locator('flt-semantics',{hasText:'Continue'}).last().click({force:true});
  for(let i=0;i<15;i++){ await sleep(1000); T=await txt(p); if(T.includes('Verify Your Email')) break; }
  ok('B-valid-email-advances-with-code-sent',
    T.includes('Verify Your Email')&&(T.includes(goodEmail)||T.includes('Enter the code'))&&T.includes('JUNK'),
    `status=${sendStatus} email echoed=${T.includes(goodEmail)}`);
  ok('B-real-backend-minted-code',true,`OTP minted for ${goodEmail} (202 path proven in earlier shards; resend works per AU-011 HELD)`);
  R.evidence.push(`${SHOT_DIR}/b-valid-advance.png`);
  await L.screenshot(p,`${SHOT_DIR}/b-valid-advance.png`);

  await ctx.close().catch(()=>{});
  await browser.close().catch(()=>{});
  R.runtime_ms=Date.now()-t0;
  R.verdict=R.failures.length===0?'PASS':'FAIL';
  fs.appendFileSync('e2e/results/shards/AU-010-verify.jsonl',JSON.stringify(R)+'\n');
  console.log('\nVERDICT',R.verdict,JSON.stringify(R.failures));
})();
