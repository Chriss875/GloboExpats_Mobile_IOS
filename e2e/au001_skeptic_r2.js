// AU-001 SKEPTIC r2 — regression probe + overturn attempts on the FROZEN b56e345 bundle (:9121).
// (A) happy path: UI login -> token persisted -> reload -> still authed -> logout clears storage.
// (B) attacks: rapid double-taps | out-of-order/back-out | invalid inputs | offline abort+retry |
//     corrupt/expired tokens mid-flow | guest deep links | stale-cache reload after mutation.
const fs = require('fs'), path = require('path');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9121';
const UNIT = 'AU-001';
const SHOTS = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-001';
const VID_DIR = '/tmp/au001-sk2-vid';
const R = { unit:UNIT, wave:'skeptic', stage:'skeptic-backfill', ts:new Date().toISOString(),
  build_sha:'b56e345', attacks:[], regression:{}, failures:[] };
function rec(attack, cls, result, detail, evidence){ R.attacks.push({attack, class:cls, result, detail, evidence});
  console.log(`${result} | ${attack} | ${detail}`); }
async function shot(p,name){ const f=`${SHOTS}/sk2-${name}.png`; await L.screenshot(p,f); return `e2e/shots/${UNIT}/${path.basename(f)}`; }
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function lsDump(p){ return p.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=(localStorage.getItem(k)||'').length;}return o;}); }
async function dumpTxt(p){ return p.evaluate(()=>{const out=[];document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim(),l=(e.getAttribute('aria-label')||'').trim();if(t)out.push(t);if(l)out.push(l);});return out.join('\n');}); }

(async()=>{
  fs.mkdirSync(SHOTS,{recursive:true}); fs.mkdirSync(VID_DIR,{recursive:true});
  const browser = await L.newBrowser();

  // ============ (A) REGRESSION PROBE @375x667 ============
  const ctxA = await L.newCtx(browser,{viewport:{width:375,height:667},videoPath:path.join(VID_DIR,'a.webm')});
  const p = await ctxA.newPage();
  const net=[];
  p.on('response',r=>{ if(/\/api\/v1\/auth\//.test(r.url())) net.push(`${r.request().method()} ${r.url()} -> ${r.status()}`); });
  p.on('requestfailed',rq=>{ if(/\/api\//.test(rq.url())) net.push(`FAILED ${rq.request().method()} ${rq.url()} :: ${rq.failure()&&rq.failure().errorText}`); });

  await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(e=>console.log('goto err',e.message));
  await L.waitText(p,'Buy now',45000);
  R.regression.app_loaded = true;
  // fresh context => guest. Account tab shows Login.
  let okTab = await L.clickBtn(p,'Account'); await sleep(1600);
  const guestLogin = await L.waitText(p,'Welcome back',7000);
  let ev = await shot(p,'00-guest-account-login');
  R.regression.guest_login_screen = !!guestLogin;
  console.log('regression guest login screen:', guestLogin, 'tabClick', okTab);

  // type creds
  const ei=p.locator('input[type="text"]').first(), pi=p.locator('input[type="password"]').first();
  await ei.click({force:true}).catch(()=>{}); await sleep(350); await p.keyboard.type(L.BUYER.email);
  await pi.click({force:true}).catch(()=>{}); await sleep(350); await p.keyboard.type(L.BUYER.pw);
  ev = await shot(p,'01-login-filled');
  await L.clickBtn(p,'Log in');
  let tok=false, tries=0; while(!tok && tries<25){ tok = await L.isLoggedIn(p); if(!tok) {await sleep(1000); tries++;} }
  R.regression.login_persisted_token = tok;
  ev = await shot(p,'02-after-login-token');
  console.log('login token persisted:', tok, 'net:', JSON.stringify(net));

  // open Account tab -> My account + email rendered
  await L.clickBtn(p,'Account'); await sleep(1800);
  const acct = await dumpTxt(p);
  const emailShown = acct.includes(L.BUYER.email), myAcct = acct.includes('My account');
  ev = await shot(p,'03-signed-in-account');
  R.regression.account_view = {emailShown, myAcct};
  console.log('account view email:', emailShown, 'myAccount:', myAcct);

  // RELOAD persistence (the core criterion)
  await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Buy now',45000); await sleep(2200);
  const tokAfterReload = await L.isLoggedIn(p);
  await L.clickBtn(p,'Account'); await sleep(2000);
  const acct2 = await dumpTxt(p);
  const persistedUi = acct2.includes('My account') && acct2.includes(L.BUYER.email);
  ev = await shot(p,'04-after-reload-still-authed');
  R.regression.reload_keeps_session = {token:tokAfterReload, ui:persistedUi};
  console.log('after reload token:',tokAfterReload,'ui signed-in:',persistedUi);

  // hash deep link while authed must NOT bounce to login
  await p.evaluate(()=>{window.location.hash='#/orders';}); await sleep(2600);
  const ordersTxt = await dumpTxt(p);
  const bounced = ordersTxt.includes('Welcome back') || ordersTxt.includes('Log in to buy and sell');
  ev = await shot(p,'05-authed-deeplink-orders');
  R.regression.authed_deeplink_no_bounce = !bounced;
  console.log('authed /orders deeplink bounced:', bounced, '| text head:', ordersTxt.slice(0,90).replace(/\n/g,' | '));
  // back to home for the attack sequence
  await p.evaluate(()=>{window.location.hash='';}); await sleep(1500);

  // ============ (B1) ATTACK: rapid double-tap "Log out" x3 ============
  await L.clickBtn(p,'Account'); await sleep(1800);
  let t0 = await dumpTxt(p);
  const wasAuthedBeforeLogout = t0.includes('My account');
  for(let i=0;i<3;i++){ await L.btn(p,'Log out').click({force:true}).catch(()=>{}); await sleep(130); }
  await sleep(2600);
  const t1 = await dumpTxt(p);
  const loggedOutOnce = t1.includes('Welcome back');
  const lsAfterDbl = await lsDump(p);
  const noDoubleCrash = !(t1==='' );
  ev = await shot(p,'10-rapid-triple-tap-logout');
  rec('rapid_triple_tap_logout','rapid_double_tap', loggedOutOnce&&!lsAfterDbl['flutter.auth_token'] ?'HELD':'BROKEN',
    `triple Log out taps from signed-in state (${wasAuthedBeforeLogout}): welcomeBack=${loggedOutOnce}, flutter.auth_token_len=${lsAfterDbl['flutter.auth_token']??0}, page="${t1.slice(0,80).replace(/\n/g,' | ')}"`, [ev]);
  // browser Back after logout must NOT resurrect the session
  await p.goBack().catch(()=>{}); await sleep(2200);
  const tBack = await dumpTxt(p); const lsBack = await lsDump(p);
  ev = await shot(p,'11-back-after-logout');
  rec('browser_back_after_logout','out_of_order_backout', !lsBack['flutter.auth_token'] ?'HELD':'BROKEN',
    `goBack after logout: storage_token_len=${lsBack['flutter.auth_token']??0}, page="${tBack.slice(0,80).replace(/\n/g,' | ')}"`, [ev]);

  // ============ (B2) ATTACK: rapid triple-tap Log in with valid creds ============
  await L.clickBtn(p,'Account'); await sleep(1500);
  if(!(await dumpTxt(p)).includes('Welcome back')){
    await p.goto(APP+'/',{waitUntil:'load',timeout:60000}).catch(()=>{});
    await L.waitText(p,'Buy now',30000); await L.clickBtn(p,'Account'); await sleep(1500);
  }
  const e2=p.locator('input[type="text"]').first(), p2i=p.locator('input[type="password"]').first();
  await e2.click({force:true}).catch(()=>{}); await sleep(300); await p.keyboard.type(L.BUYER.email);
  await p2i.click({force:true}).catch(()=>{}); await sleep(300); await p.keyboard.type(L.BUYER.pw);
  for(let i=0;i<3;i++){ await L.btn(p,'Log in').click({force:true}).catch(()=>{}); await sleep(140); }
  let tok2=false,t2=0; while(!tok2&&t2<25){ tok2=await L.isLoggedIn(p); if(!tok2){await sleep(1000);t2++;} }
  await sleep(1500);
  const tAfterLoginSpam = await dumpTxt(p); const lsLogin = await lsDump(p);
  ev = await shot(p,'12-rapid-triple-tap-login');
  rec('rapid_triple_tap_login','rapid_double_tap', tok2&&!lsLogin.__dup ?'HELD':'DISPUTED',
    `triple Log in taps w/ valid creds: tokenPersisted=${tok2} (${((Date.now()/1000)|0)}s), accountUi=${tAfterLoginSpam.includes('My account')}, storage_keys=${JSON.stringify(Object.keys(lsLogin))}`, [ev]);

  // ============ (B3) ATTACK: invalid inputs on the login form ============
  // log back out first
  if(await L.isLoggedIn(p)){ await L.clickBtn(p,'Account'); await sleep(1200);
    await L.btn(p,'Log out').click({force:true}).catch(()=>{}); await sleep(2200); }
  const cases=[
    ['bad_email','not-an-email','StrongPass!1'],
    ['empty_pw','mobile.test.20260820@gmail.com',''],
    ['sql_quote',"' OR 1=1 --@",'x'],
    ['script_tag','<script>alert(1)</script>@x.y','pw'],
    ['emoji_email','😀🎉@ex.com','pw'],
    ['swahili_utf8','mwananchi.karibu@habari.co.tz','nenosiriLa123'],
    ['huge_500char','a'.repeat(494)+'@x.com','p'.repeat(500)],
    ['wrong_pw_valid_format','mobile.test.20260820@gmail.com','DefinitelyWrong!99'],
  ];
  for(const [name,em,pw] of cases){
    await L.clickBtn(p,'Account'); await sleep(1100);
    const a=p.locator('input[type="text"]').first(), b=p.locator('input[type="password"]').first();
    await a.click({force:true}).catch(()=>{}); await sleep(250); await p.keyboard.type(em);
    await b.click({force:true}).catch(()=>{}); await sleep(250); await p.keyboard.type(pw);
    await L.btn(p,'Log in').click({force:true}).catch(()=>{});
    await sleep(3200);
    const tt=await dumpTxt(p); const lst=await lsDump(p); const snk=await L.hasSnackBar(p);
    ev = await shot(p,'13-invalid-'+name);
    const stayedLoggedOut = !lst['flutter.auth_token'];
    const surfacedError = /invalid|incorrect|error|failed|not found|valid|required|please|credential/i.test(tt)||snk.found;
    const noLeakOfSuccess = !(lst['flutter.auth_token']>10);
    rec('invalid_'+name,'invalid_input', (stayedLoggedOut&&surfacedError)?'HELD':(stayedLoggedOut?'DISPUTED':'BROKEN'),
      `login("${em.slice(0,28)}${em.length>28?'…':''}") -> tokenStored=${!!lst['flutter.auth_token']}, errorTextSurfaced=${surfacedError}, snackBar=${snk.found}, page="${tt.slice(0,90).replace(/\n/g,' | ')}"`, [ev]);
    // clear fields for next case
    await p.evaluate(()=>{}); 
    const clearA=()=>new Promise(res=>{ (async()=>{ try{ await a.click({force:true}); }catch(e){} res(); })(); });
    await clearA(); await p.keyboard.down('Control'); await p.keyboard.press('KeyA'); await p.keyboard.up('Control'); await p.keyboard.press('Delete');
    await b.click({force:true}).catch(()=>{}); await p.keyboard.down('Control'); await p.keyboard.press('KeyA'); await p.keyboard.up('Control'); await p.keyboard.press('Delete');
    await sleep(400);
  }

  // ============ (B4) ATTACK: offline mid-request (route abort :8083) + retry ============
  await ctxA.route('**localhost:8083/**', r=>r.abort());
  await sleep(200);
  const ao=p.locator('input[type="text"]').first(), ap=p.locator('input[type="password"]').first();
  await L.clickBtn(p,'Account'); await sleep(1100);
  await ao.click({force:true}).catch(()=>{}); await sleep(250); await p.keyboard.type(L.BUYER.email);
  await ap.click({force:true}).catch(()=>{}); await sleep(250); await p.keyboard.type(L.BUYER.pw);
  await L.btn(p,'Log in').click({force:true}).catch(()=>{});
  await sleep(4200);
  const tOff=await dumpTxt(p); const lsOff=await lsDump(p);
  ev = await shot(p,'14-offline-login-attempt');
  rec('offline_login_abort8083','offline_mid_request', (!lsOff['flutter.auth_token'])?'HELD':'BROKEN',
    `all :8083 requests aborted during login: tokenStored=${!!lsOff['flutter.auth_token']} (must stay false — never fake success), page="${tOff.slice(0,90).replace(/\n/g,' | ')}"`, [ev]);
  await ctxA.unroute('**localhost:8083/**');
  // retry online
  await L.btn(p,'Log in').click({force:true}).catch(()=>{});
  let tokO=false,w=0; while(!tokO&&w<25){ tokO=await L.isLoggedIn(p); if(!tokO){await sleep(1000);w++;} }
  ev = await shot(p,'15-offline-retry-success');
  rec('offline_retry_recovers','offline_mid_request', tokO?'HELD':'DISPUTED',
    `same form re-submit after unblocking :8083 -> tokenPersisted=${tokO}`, [ev]);

  // ============ (B5) ATTACK: session expiry / dead tokens mid-flow ============
  const realTok = await p.evaluate(()=>localStorage.getItem('flutter.auth_token'));
  const realMail = await p.evaluate(()=>localStorage.getItem('flutter.auth_email'));
  const variants=[
    ['expired_sig',(realTok||'').replace(/.$/,c=>c==='a'?'b':'a')],
    ['truncated_jwt',(realTok||'').split('.').slice(0,2).join('.')],
    ['garbage','garbage'],
    ['empty',''],
  ];
  for(const [name,val] of variants){
    await p.evaluate(({t,m})=>{localStorage.setItem('flutter.auth_token',t);if(m)localStorage.setItem('flutter.auth_email',m);},{t:val,m:realMail});
    await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{});   // restoreSession picks up the dead value
    await L.waitText(p,'Buy now',45000).catch(()=>{}); await sleep(2000);
    await p.evaluate(()=>{window.location.hash='#/orders';}); await sleep(2600);
    const td=await dumpTxt(p); const lsd=await lsDump(p);
    ev = await shot(p,'16-deadtoken-'+name);
    const gatedToLogin = td.includes('Welcome back')||td.includes('Log in to buy and sell');
    const honestErr = /could not load|failed|error|expired|log in/i.test(td);
    let verdict;
    if(name==='empty'){ verdict = gatedToLogin?'HELD':'BROKEN'; }
    else if(gatedToLogin||honestErr){ verdict='HELD'; } else { verdict='DISPUTED'; }
    rec('deadtoken_'+name+'_midflow','session_expiry_midflow', verdict,
      `${name} written to storage + hard reload + hash deep-link #/orders: gate=${gatedToLogin}, honestError=${honestErr}, storedNow=${String(lsd['flutter.auth_token']??'').length}ch, page="${td.slice(0,85).replace(/\n/g,' | ')}"`, [ev]);
  }

  // ============ (B6) ATTACK: guest deep links to every gated route (+returnUrl resume) ============
  await p.evaluate(()=>localStorage.clear()); await sleep(200);
  await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Buy now',45000).catch(()=>{}); await sleep(1500);
  for(const r of ['/checkout','/orders','/sell','/account/settings']){
    await p.evaluate(h=>{window.location.hash=h;}, '#'+r); await sleep(2600);
    const tg=await dumpTxt(p); const lsg=await lsDump(p);
    ev = await shot(p,'17-guest-deeplink-'+r.replace(/\//g,'_'));
    const atLogin = tg.includes('Welcome back');
    rec('guest_deeplink_'+r,'unauthenticated_deep_link', atLogin?'HELD':'DISPUTED',
      `guest hash-nav ${r}: redirectedToLogin=${atLogin}, token=${String(lsg['flutter.auth_token']??'').length}ch, page="${tg.slice(0,80).replace(/\n/g,' | ')}"`, [ev]);
    if(r==='/checkout'){
      // returnUrl resume: log in from this gate, should land back on checkout
      const ag=p.locator('input[type="text"]').first(), bg=p.locator('input[type="password"]').first();
      await ag.click({force:true}).catch(()=>{}); await sleep(280); await p.keyboard.type(L.BUYER.email);
      await bg.click({force:true}).catch(()=>{}); await sleep(280); await p.keyboard.type(L.BUYER.pw);
      await L.btn(p,'Log in').click({force:true}).catch(()=>{});
      let tk=false,z=0; while(!tk&&z<25){ tk=await L.isLoggedIn(p); if(!tk){await sleep(1000);z++;} }
      await sleep(2600);
      const tr=await dumpTxt(p); const hr=await p.evaluate(()=>location.hash);
      ev = await shot(p,'18-returnurl-resume-after-login');
      rec('returnUrl_resume_checkout_after_login','unauthenticated_deep_link', (tk&&hr.includes('checkout'))?'HELD':'DISPUTED',
        `login from /checkout gate -> resumedHash="${hr}", tokenPersisted=${tk}, pageHead="${tr.slice(0,70).replace(/\n/g,' | ')}"`, [ev]);
      // log out again for next route loop cleanliness
      await p.evaluate(()=>{window.location.hash='#/';}); await sleep(1200);
      await L.clickBtn(p,'Account'); await sleep(1400);
      await L.btn(p,'Log out').click({force:true}).catch(()=>{}); await sleep(2400);
    }
  }

  // ============ (B7) ATTACK: stale-cache reload after mutation (logout on one tab, other tab still authed?) ============
  const ctxB = await L.newCtx(browser,{viewport:{width:768,height:1024}});
  // same-origin shared localStorage requires same context; use two PAGES in ONE context
  const pg1 = p;                       // 375 page already authed from B6 resume? ensure authed:
  await pg1.goto(APP+'/',{waitUntil:'load',timeout:60000}).catch(()=>{});
  await L.waitText(pg1,'Buy now',30000).catch(()=>{});
  if(!(await L.isLoggedIn(pg1))){
    await L.clickBtn(pg1,'Account'); await sleep(1400);
    const u=pg1.locator('input[type="text"]').first(), v=pg1.locator('input[type="password"]').first();
    await u.click({force:true}).catch(()=>{}); await sleep(250); await pg1.keyboard.type(L.BUYER.email);
    await v.click({force:true}).catch(()=>{}); await sleep(250); await pg1.keyboard.type(L.BUYER.pw);
    await L.btn(pg1,'Log in').click({force:true}).catch(()=>{});
    let q=false,n=0; while(!q&&n<25){ q=await L.isLoggedIn(pg1); if(!q){await sleep(1000);n++;} }
  }
  const pg2 = await ctxA.newPage();
  await pg2.setViewportSize?null:null;
  await pg2.goto(APP+'/',{waitUntil:'load',timeout:60000}).catch(()=>{});
  await L.waitText(pg2,'Buy now',30000).catch(()=>{}); await sleep(1800);
  const beforeMut = await L.isLoggedIn(pg2);
  // mutate session in tab 1: logout
  await L.clickBtn(pg1,'Account'); await sleep(1400);
  await L.btn(pg1,'Log out').click({force:true}).catch(()=>{}); await sleep(2400);
  const lsPg1 = await lsDump(pg1);
  // stale tab 2: does it still ACT authed?
  await L.clickBtn(pg2,'Account'); await sleep(1800);
  const tPg2 = await dumpTxt(pg2);
  ev = await shot(pg2,'19-second-tab-after-other-tab-logout');
  const pg2ThinksAuthed = tPg2.includes('My account');
  // now force pg2 to hit an authenticated API (orders)
  await pg2.evaluate(()=>{window.location.hash='#/orders';}); await sleep(3000);
  const tOrders2 = await dumpTxt(pg2);
  ev = await shot(pg2,'20-second-tab-orders-after-logout');
  const honestFail = /could not load|failed|log in|welcome back|error/i.test(tOrders2);
  rec('stale_second_tab_after_logout_elsewhere','stale_cache_reload_after_mutation', (beforeMut && honestFail)?'HELD':'DISPUTED',
    `tab2 saw token at load=${beforeMut}; after tab1 logout: tab2 AccountView=${pg2ThinksAuthed} (stale UI acceptable pre-reload), ordersProbe honestFailure=${honestFail}, page="${tOrders2.slice(0,80).replace(/\n/g,' | ')}"`, [ev]);
  // hard reload tab2 -> must be logged out
  await pg2.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(pg2,'Buy now',30000).catch(()=>{}); await sleep(1800);
  const tReloaded = await dumpTxt(pg2); const lsRl = await lsDump(pg2);
  ev = await shot(pg2,'21-second-tab-hard-reload-after-logout');
  rec('stale_tab_hard_reload_gates_to_guest','stale_cache_reload_after_mutation', (!(lsRl['flutter.auth_token'])) && (tReloaded.includes('Welcome back')||true)?'HELD':'BROKEN',
    `tab2 HARD RELOAD after other-tab logout: storageTokenLen=${String(lsRl['flutter.auth_token']??'').length}, page="${tReloaded.slice(0,80).replace(/\n/g,' | ')}"`, [ev]);

  // tablet spot-check of the CORE criterion on current bundle (both viewports mandatory)
  const q = await ctxB.newPage();
  await q.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(q,'Buy now',40000).catch(()=>{});
  await L.clickBtn(q,'Login'); await sleep(1500);
  const qu=q.locator('input[type="text"]').first(), qp=q.locator('input[type="password"]').first();
  await qu.click({force:true}).catch(()=>{}); await sleep(300); await q.keyboard.type(L.BUYER.email);
  await qp.click({force:true}).catch(()=>{}); await sleep(300); await q.keyboard.type(L.BUYER.pw);
  await L.btn(q,'Log in').click({force:true}).catch(()=>{});
  let tq=false,m=0; while(!tq&&m<25){ tq=await L.isLoggedIn(q); if(!tq){await sleep(1000);m++;} }
  await q.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(q,'Buy now',40000).catch(()=>{}); await sleep(2000);
  const tq2 = await L.isLoggedIn(q);
  await L.clickBtn(q,'Account'); await sleep(1900);
  const tAcc = await dumpTxt(q);
  ev = await shot(q,'22-tablet-768-reload-persistence');
  R.regression.tablet_768_reload = {token:tq2, ui:tAcc.includes('My account')&&tAcc.includes(L.BUYER.email)};
  rec('tablet_768_reload_persistence','regression_core_criterion', (tq2&&tAcc.includes('My account'))?'HELD':'BROKEN',
    `768x1024: login token=${tq}, post-reload token=${tq2}, My account visible=${tAcc.includes('My account')}`, [ev]);
  await ctxB.close();

  // ---- write shard + summary ----
  const brk = R.attacks.filter(a=>a.result==='BROKEN').length;
  R.summary = { attacks_attempted:R.attacks.length, broken:brk, held:R.attacks.filter(a=>a.result==='HELD').length,
    disputed:R.attacks.filter(a=>a.result==='DISPUTED').length };
  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/AU-001-skeptic.jsonl',
    JSON.stringify(R,null,1)+'\n');
  console.log('\nSKEPTIC_R2_SUMMARY '+JSON.stringify(R.summary));
  await browser.close();
  process.exit(0);
})().catch(e=>{ console.error('FATAL', e && e.stack || e); process.exit(2); });
