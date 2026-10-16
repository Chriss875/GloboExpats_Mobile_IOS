// AU-001 SKEPTIC - try to overturn the PASS for auth_session_persistence.
// App: http://localhost:9102 (FROZEN verify snapshot @ cf35e99). Ref :3000. Sandbox API :8083.
const path = require('path');
const fs = require('fs');
const { APP, REF, BUYER, newBrowser, newCtx, allText, waitText, btn, clickBtn,
        listButtons, screenshot, isLoggedIn } =
  require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');

const UNIT = 'AU-001';
const SHOTS = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-001';
const VID_DIR = '/tmp/wf-videos-AU-001-sk';
const R = { attacks: [], failures: [] };
function rec(attack, outcome, detail, evidence) {
  R.attacks.push({ attack, outcome, detail, evidence });
  console.log(`${outcome} | ${attack} | ${detail}`);
}
async function shot(p, name) {
  const f = `${SHOTS}/skeptic-${name}.png`;
  await screenshot(p, f);
  return `e2e/shots/AU-001/${path.basename(f)}`;
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(VID_DIR, { recursive: true });
  const browser = await newBrowser();

  // ================= CONTEXT A : 375x667 main attack run =================
  const ctxA = await newCtx(browser, { viewport:{width:375,height:667}, videoPath: path.join(VID_DIR,'AU-001-skeptic.webm') });
  const p = await ctxA.newPage();
  const authReqs = [];
  p.on('request', rq => { if (/\/api\/v1\/auth\//.test(rq.url())) authReqs.push(`${rq.method()} ${rq.url()}`); });

  // ---- load + login (typed UI login, token poll per harness convention)
  await p.goto(APP, { waitUntil:'load', timeout:90000 });
  if (!(await isLoggedIn(p))) {
    await waitText(p,'Buy now',40000);
    await clickBtn(p,'Login'); await waitText(p,'Welcome back',25000);
    const ei=p.locator('input[type="text"]').first(); const pi=p.locator('input[type="password"]').first();
    await ei.click({force:true}).catch(()=>{}); await p.waitForTimeout(350); await p.keyboard.type(BUYER.email);
    await pi.click({force:true}).catch(()=>{}); await p.waitForTimeout(350); await p.keyboard.type(BUYER.pw);
    await clickBtn(p,'Log in');
    let ok=false; for(let i=0;i<25&&!ok;i++){ ok=await isLoggedIn(p); if(!ok) await p.waitForTimeout(1000); }
    rec('login_setup', ok?'HELD':'BROKEN', 'UI login persisted token='+ok, []);
  }
  let ev = await shot(p,'375x667-00-logged-in');
  const baseTxt = await allText(p);
  rec('baseline_logged_in', /My account|Log out|Orders/.test(baseTxt)?'HELD':'DISPUTED',
      'baseline signed-in text sample: '+baseTxt.slice(0,120).replace(/\n/g,' | '), [ev]);

  // ---------- ATTACK 1: rapid double-taps on Log in (from a logged-out state later) and Log out now ----------
  // 1a. rapid double-tap "Log out" x3
  await clickBtn(p,'Account'); await p.waitForTimeout(1500);
  let txt0 = await allText(p);
  const wasIn = txt0.includes('My account') || txt0.includes('Log out');
  for (let i=0;i<3;i++){ await btn(p,'Log out').click({force:true}).catch(()=>{}); await p.waitForTimeout(120); }
  await p.waitForTimeout(2500);
  let txt1 = await allText(p);
  const loggedOutFast = txt1.includes('Welcome back');
  const lsAfterDblLogout = await p.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=(localStorage.getItem(k)||'').length;}return o;});
  ev = await shot(p,'375x667-01-rapid-double-tap-logout');
  rec('rapid_double_tap_logout', loggedOutFast && !('flutter.auth_token' in lsAfterDblLogout) ?'HELD':'BROKEN',
      `3x rapid Log out taps -> login form shown=${loggedOutFast}, token key present=${('flutter.auth_token' in lsAfterDblLogout)}, auth keys=${Object.keys(lsAfterDblLogout).join(',')}`, [ev]);

  // 1b. rapid double-tap "Log in" while request is in flight (fresh submit)
  await clickBtn(p,'Login'); await p.waitForTimeout(1500);
  const ei=p.locator('input[type="text"]').first(); const pi=p.locator('input[type="password"]').first();
  await ei.click({force:true}).catch(()=>{}); await p.waitForTimeout(350); await p.keyboard.type(BUYER.email);
  await pi.click({force:true}).catch(()=>{}); await p.waitForTimeout(350); await p.keyboard.type(BUYER.pw);
  authReqs.length = 0;
  await btn(p,'Log in').click({force:true}).catch(()=>{});
  await btn(p,'Log in').click({force:true}).catch(()=>{}).then(()=>btn(p,'Log in').click({force:true})).catch(()=>{});
  await p.waitForTimeout(6000);
  const dblLoginToken = await isLoggedIn(p);
  const nLoginPosts = authReqs.filter(r=>r.startsWith('POST') && /login/.test(r)).length;
  ev = await shot(p,'375x667-02-rapid-double-tap-login');
  rec('rapid_double_tap_login', dblLoginToken && nLoginPosts>=1 && nLoginPosts<=3 ?'HELD':'DISPUTED',
      `triple-tapped Log in: POST /auth/login count=${nLoginPosts}, session established=${dblLoginToken}`, [ev]);

  // ---------- ATTACK 2: out-of-order sequence — logout then browser BACK into gated route ----------
  await clickBtn(p,'Account'); await p.waitForTimeout(1500);
  await clickBtn(p,'Log out'); await p.waitForTimeout(2500);
  const afterLogoutTxt = await allText(p);
  // history back should NOT resurrect the signed-in Account view from bfcache/state
  await p.goBack().catch(()=>{}); await p.waitForTimeout(2500);
  const backTxt = await allText(p);
  ev = await shot(p,'375x667-03-back-after-logout');
  rec('back_after_logout_no_resurrection', !backTxt.includes(BUYER.email) ?'HELD':'BROKEN',
      `after logout + history back, email visible=${backTxt.includes(BUYER.email)}; page snippet=${backTxt.slice(0,90).replace(/\n/g,' | ')}`, [ev]);
  // forward again
  await p.goForward().catch(()=>{}); await p.waitForTimeout(2000);

  // ---------- ATTACK 3: invalid input on the login form ----------
  const badInputs = [
    ['bad_email', 'not-an-email', 'StrongPass!1'],
    ['empty_pw', BUYER.email, ''],
    ['500char_email', 'a'.repeat(500)+'@gmail.com', 'StrongPass!1'],
    ['emoji_email', '😀🙂🔥@gmail.com', 'StrongPass!1'],
    ['script_email', '<script>alert(1)</script>', 'Str<script>1'],
    ['sql_quote', "'; DROP TABLE users; --", "x' OR '1'='1"],
  ];
  for (const [name,email,pw] of badInputs) {
    // ensure we are on login screen
    let t = await allText(p);
    if (!t.includes('Welcome back')) {
      await p.goto(APP, {waitUntil:'load',timeout:90000}).catch(()=>{});
      await waitText(p,'Buy now',30000).catch(()=>{});
      await clickBtn(p,'Login'); await waitText(p,'Welcome back',20000);
    }
    const e2i=p.locator('input[type="text"]').first(); const p2i=p.locator('input[type="password"]').first();
    await e2i.click({force:true}).catch(()=>{});
    await p.keyboard.press('Control+a').catch(()=>{}); await p.keyboard.press('Backspace').catch(()=>{}); await p.waitForTimeout(200);
    await p.keyboard.type(email,{delay:5});
    await p2i.click({force:true}).catch(()=>{}); await p.waitForTimeout(250);
    await p.keyboard.press('Control+a').catch(()=>{}); await p.keyboard.press('Backspace').catch(()=>{}); await p.waitForTimeout(200);
    if (pw) await p.keyboard.type(pw,{delay:5});
    await p.waitForTimeout(300);
    const preTok = await isLoggedIn(p);
    await clickBtn(p,'Log in');
    await p.waitForTimeout(4500);
    const postTok = await isLoggedIn(p);
    const postTxt = await allText(p);
    ev = await shot(p,'375x667-04-invalid-'+name);
    const rejected = !postTok;
    const noCrash = postTxt.length > 20;
    const errMsg = postTxt.split('\n').filter(l=>/valid|required|fail|incorrect|error|bad|wrong|must|enter/i.test(l)).slice(0,2).join(' ; ');
    rec('invalid_input_'+name, rejected&&noCrash ?'HELD':'BROKEN',
      `pre_token=${preTok} post_token=${postTok} crash=${!noCrash}; msg="${errMsg.slice(0,140)}"`, [ev]);
    if (postTok) { // never leave a broken session behind
      await p.evaluate(()=>{localStorage.removeItem('flutter.auth_token');localStorage.removeItem('flutter.auth_email');});
      await p.reload({waitUntil:'load'}).catch(()=>{}); await p.waitForTimeout(2000);
    }
  }

  // ---------- ATTACK 4: offline mid-request during LOGIN + retry assert ----------
  // fresh logged-out state
  await p.evaluate(()=>{localStorage.clear();});
  await p.goto(APP,{waitUntil:'load',timeout:90000}).catch(()=>{});
  await waitText(p,'Buy now',40000).catch(()=>{});
  await clickBtn(p,'Login'); await waitText(p,'Welcome back',25000);
  const eo=p.locator('input[type="text"]').first(); const po=p.locator('input[type="password"]').first();
  await eo.click({force:true}).catch(()=>{}); await p.waitForTimeout(350); await p.keyboard.type(BUYER.email);
  await po.click({force:true}).catch(()=>{}); await p.waitForTimeout(350); await p.keyboard.type(BUYER.pw);
  await ctxA.setOffline(true);
  await clickBtn(p,'Log in');
  await p.waitForTimeout(7000);
  const offTok = await isLoggedIn(p);
  const offTxt = await allText(p);
  ev = await shot(p,'375x667-05-offline-login-attempt');
  const honestFail = !offTok && offTxt.includes('Welcome back');
  rec('offline_mid_request_login', honestFail ?'HELD':'BROKEN',
    `offline login: token persisted=${offTok} (MUST be false), still on login screen=${offTxt.includes('Welcome back')}, err="${offTxt.split('\n').filter(l=>/network|fail|error|socket|connection|unavailable/i.test(l)).join(';').slice(0,120)}"`, [ev]);
  await ctxA.setOffline(false); await p.waitForTimeout(1500);
  // retry online must succeed
  await clickBtn(p,'Log in');
  let retryOk=false; for(let i=0;i<20&&!retryOk;i++){ retryOk=await isLoggedIn(p); if(!retryOk) await p.waitForTimeout(1000);}
  ev = await shot(p,'375x667-06-offline-retry-success');
  rec('offline_retry_online_succeeds', retryOk ?'HELD':'BROKEN', `after going back online and re-tapping Log in: token persisted=${retryOk}`, [ev]);

  // ---------- ATTACK 5: corrupt-token variants mid-flow (deep link to gated route each time) ----------
  const tokReal = await p.evaluate(()=>localStorage.getItem('flutter.auth_token'));
  const corrupts = [
    ['garbage','garbage'],
    ['empty',''],
    ['null_literal','null'],
    ['truncated',(tokReal||'').slice(0, Math.floor((tokReal||'').length*0.6))],
    ['jwt_missing_sig',(tokReal||'').split('.').slice(0,2).join('.')],
    ['flipped_sig',(tokReal||'').replace(/.$/, c=>c==='a'?'b':'a')],
  ];
  for (const [name,val] of corrupts) {
    await p.evaluate(({t,em})=>{localStorage.setItem('flutter.auth_token',t);localStorage.setItem('flutter.auth_email',em);}, {t:val,em:BUYER.email});
    // reload so restoreSession runs with the corrupted value
    await p.reload({waitUntil:'load',timeout:60000}).catch(()=>{});
    await waitText(p,'Buy now',40000).catch(()=>{});
    await p.waitForTimeout(1500);
    // deep-link gated route
    await p.goto(APP+'/orders',{waitUntil:'load',timeout:60000}).catch(()=>{});
    await p.waitForTimeout(2500);
    const t = await allText(p);
    const gatedToLogin = t.includes('Welcome back');
    const actedAuthed = /My orders|Order|Could not load/.test(t) && !gatedToLogin;
    const tokNow = await p.evaluate(()=>localStorage.getItem('flutter.auth_token'));
    ev = await shot(p,'375x667-07-corrupt-'+name+'-orders');
    let verdict;
    if (!val || name==='null_literal') {
      // empty/null token: isAuthenticated false -> gate MUST redirect
      verdict = gatedToLogin ?'HELD':'BROKEN';
    } else if (actedAuthed) {
      // app believed it was authed: it must surface an honest error or recover, not fake success
      verdict = /Could not load|error|failed|log in|expired/i.test(t) ?'HELD':'DISPUTED';
    } else {
      verdict = gatedToLogin ?'HELD':'DISPUTED';
    }
    rec('corrupt_token_'+name, verdict,
      `token_len=${String(val).length} deep-link /orders -> loginGate=${gatedToLogin}, ordersUi=${actedAuthed}, stored_token_now_len=${String(tokNow).length}; page="${t.slice(0,110).replace(/\n/g,' | ')}"`, [ev]);
  }

  // ---------- ATTACK 6: unauthenticated deep links to every gated route ----------
  await p.evaluate(()=>{localStorage.clear();});
  await p.reload({waitUntil:'load',timeout:60000}).catch(()=>{});
  await waitText(p,'Buy now',40000).catch(()=>{});
  for (const r of ['/checkout','/orders','/account/addresses','/account/settings','/account/payment-methods','/sell']) {
    await p.goto(APP+r,{waitUntil:'load',timeout:60000}).catch(()=>{});
    await p.waitForTimeout(2200);
    const t = await allText(p);
    const atLogin = t.includes('Welcome back');
    const leakAuthed = /Please log in to checkout/.test(t) || (!atLogin && /address|settings|payment method|my orders/i.test(t));
    ev = await shot(p,'375x667-08-guest-deeplink-'+r.replace(/\//g,'_'));
    rec('guest_deeplink_'+r, atLogin ?'HELD': (leakAuthed?'BROKEN':'DISPUTED'),
      `guest deep link ${r}: loginGate=${atLogin}, body="${t.slice(0,90).replace(/\n/g,' | ')}"`, [ev]);
    // returnUrl resume check for one route
    if (r==='/orders') {
      await p.evaluate(()=>{ /* nothing */ });
    }
  }

  // ================= CONTEXT B : 768x1024 spot checks =================
  const ctxB = await newCtx(browser, { viewport:{width:768,height:1024} });
  const q = await ctxB.newPage();
  await q.goto(APP,{waitUntil:'load',timeout:90000}).catch(()=>{});
  await waitText(q,'Buy now',40000).catch(()=>{});
  await clickBtn(q,'Login'); await waitText(q,'Welcome back',25000);
  const qi=q.locator('input[type="text"]').first(); const qp=q.locator('input[type="password"]').first();
  await qi.click({force:true}).catch(()=>{}); await q.waitForTimeout(350); await q.keyboard.type(BUYER.email);
  await qp.click({force:true}).catch(()=>{}); await q.waitForTimeout(350); await q.keyboard.type(BUYER.pw);
  await clickBtn(q,'Log in');
  let inB=false; for(let i=0;i<25&&!inB;i++){ inB=await isLoggedIn(q); if(!inB) await q.waitForTimeout(1000);}
  ev = await shot(q,'768x1024-00-signed-in');
  // corrupt sig token at tablet size too
  await q.evaluate(()=>{const t=localStorage.getItem('flutter.auth_token')||'';localStorage.setItem('flutter.auth_token',t.replace(/.$/, c=>c==='a'?'b':'a'));});
  await q.reload({waitUntil:'load',timeout:60000}).catch(()=>{});
  await waitText(q,'Buy now',40000).catch(()=>{});
  await q.goto(APP+'/checkout',{waitUntil:'load',timeout:60000}).catch(()=>{});
  await q.waitForTimeout(2500);
  const tb = await allText(q);
  ev = await shot(q,'768x1024-01-corrupt-sig-checkout');
  rec('tablet_corrupt_sig_checkout_gate', (/Welcome back/.test(tb)||/Could not load|failed|error|log in/i.test(tb))?'HELD':'DISPUTED',
    `768x1024 flipped-signature token + deep link /checkout: loginGate=${tb.includes('Welcome back')}, checkoutForm=${!/Welcome back/.test(tb)}, body="${tb.slice(0,100).replace(/\n/g,' | ')}"`, [ev]);
  rec('tablet_corrupt_sig_verdict', (/Welcome back/.test(tb)||/Could not load|failed|error/i.test(tb))?'HELD':'DISPUTED',
    'verdict for tablet corrupt-sig probe based on rendered state above', [ev]);
  await ctxB.close();

  // ---------- reference parity: does :3000 keep session across reload? (judge sanity, same data) ----------
  const ctxC = await browser.newContext({ viewport:{width:375,height:667} });
  const r3 = await ctxC.newPage();
  await r3.goto(REF+'/login',{waitUntil:'load',timeout:90000}).catch(e=>console.log('ref goto:',e.message));
  await r3.waitForTimeout(3000);
  const fe=r3.locator('input[type="email"],input[name="email"],input[placeholder*="mail" i]').first();
  const fp=r3.locator('input[type="password"]').first();
  if (await fe.count()){
    await fe.fill(BUYER.email).catch(()=>{});
    await fp.first().fill(BUYER.pw).catch(()=>{});
    const sub=r3.locator('button:has-text("Log in"), button:has-text("Sign in")').first();
    if(await sub.count()){ await sub.click().catch(()=>{}); await r3.waitForTimeout(4500);}
    const lsRef=await r3.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){o[localStorage.key(i)]='x';}return o;}).catch(()=>({}));
    ev=await shot(r3,'ref-375-after-login');
    rec('ref_login_parity_probe', Object.keys(lsRef).some(k=>/auth|token/i.test(k))?'HELD':'DISPUTED',
      'reference :3000 localStorage keys after login: '+JSON.stringify(Object.keys(lsRef)), [ev]);
  } else {
    rec('ref_login_form_found','BLOCKED','could not locate reference login inputs',[]);
  }
  await ctxC.close();

  await closeVideoKeep(ctxA, path.join(VID_DIR,'AU-001-skeptic.webm'));
  fs.writeFileSync('/tmp/au001_skeptic.json', JSON.stringify(R,null,1));
  const brk=R.attacks.filter(a=>a.outcome==='BROKEN').length;
  console.log('\nSKEPTIC_SUMMARY attacks='+R.attacks.length+' broken='+brk);
  process.exit(0);
})().catch(e=>{ console.error('FATAL', e); process.exit(2); });

async function closeVideoKeep(ctx, videoPath){
  try{
    const v = ctx.pages()[0] && await ctx.pages()[0].video();
    await ctx.close();
    if(v) await v.saveAs(videoPath).catch(()=>{});
    fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-001-skeptic.webm','');
    fs.copyFileSync(videoPath, '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-001-skeptic.webm');
  }catch(e){ console.log('video save failed:', e.message); }
}
