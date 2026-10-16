// STAGE 1: regression probe + rapid-tap attacks (375x667)
const {fs,path,L,APP,R,rec,reg,shot,sleep,lsDump,dumpTxt,head,fillLogin} = require('./au001_sk2_lib.js');
(async()=>{
  const browser = await L.newBrowser();
  const ctxA = await L.newCtx(browser,{viewport:{width:375,height:667},videoPath:'/tmp/au001-sk2-vid/s1.webm'});
  const p = await ctxA.newPage();
  const net=[];
  p.on('response',r=>{ if(/\/api\/v1\/auth\//.test(r.url())) net.push(`${r.request().method()} ${r.url().replace(APP,'')} -> ${r.status()}`); });

  await p.goto(APP+'/',{waitUntil:'load',timeout:90000});
  await L.waitText(p,'Buy now',45000);
  await L.clickBtn(p,'Account'); await sleep(1700);
  const guestLogin = await L.waitText(p,'Welcome back',7000);
  let ev=await shot(p,'00-guest-account-login');
  reg('guest_account_shows_login',{pass:!!guestLogin,evidence:[ev]});

  await fillLogin(p,L.BUYER.email,L.BUYER.pw);
  ev=await shot(p,'01-login-filled');
  await L.btn(p,'Log in').click({force:true}).catch(()=>{});
  let tok=false,t=0; while(!tok&&t<25){ tok=await L.isLoggedIn(p); if(!tok){await sleep(1000);t++;} }
  ev=await shot(p,'02-after-login-token');
  reg('ui_login_persists_jwt',{token:tok,waitSecs:t,authNet:net.slice(-4),evidence:[ev]});

  await L.clickBtn(p,'Account'); await sleep(1900);
  const acct=await dumpTxt(p);
  ev=await shot(p,'03-signed-in-account');
  reg('signed_in_account_view',{emailRendered:acct.includes(L.BUYER.email),myAccount:acct.includes('My account'),evidence:[ev]});

  // CORE: reload persistence
  await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Buy now',45000).catch(()=>{}); await sleep(2200);
  const tokR=await L.isLoggedIn(p);
  await L.clickBtn(p,'Account'); await sleep(2100);
  const a2=await dumpTxt(p);
  ev=await shot(p,'04-after-reload-still-authed');
  reg('reload_keeps_session_375x667',{tokenPersisted:tokR,accountUi:a2.includes('My account'),emailRendered:a2.includes(L.BUYER.email),evidence:[ev]});

  // authed hash deep-link /orders must not bounce
  await p.evaluate(()=>{window.location.hash='#/orders';}); await sleep(2800);
  const oT=await dumpTxt(p);
  ev=await shot(p,'05-authed-deeplink-orders');
  reg('authed_deeplink_orders_no_bounce',{bouncedToLogin:oT.includes('Welcome back')||oT.includes('Log in to buy and sell'),pageHead:head(oT,120),evidence:[ev]});
  await p.evaluate(()=>{window.location.hash='#/';}); await sleep(1600);

  // ATTACK 1: rapid triple-tap Log out
  await L.clickBtn(p,'Account'); await sleep(1800);
  const wasAuthed=(await dumpTxt(p)).includes('My account');
  for(let i=0;i<3;i++){ await L.btn(p,'Log out').click({force:true}).catch(()=>{}); await sleep(140); }
  await sleep(2600);
  const t1=await dumpTxt(p); const ls1=await lsDump(p);
  ev=await shot(p,'10-rapid-triple-tap-logout');
  rec('rapid_triple_tap_logout','rapid_double_tap',(wasAuthed && t1.includes('Welcome back') && !ls1['flutter.auth_token'])?'HELD':'BROKEN',
    `signed-in=${wasAuthed}; after 3x Log out taps @~140ms: welcomeBack=${t1.includes('Welcome back')}, flutter.auth_token_len=${ls1['flutter.auth_token']??0}, page="${head(t1)}"`,[ev]);
  // browser Back must not resurrect
  await p.goBack().catch(()=>{}); await sleep(2300);
  const tb=await dumpTxt(p); const lsb=await lsDump(p);
  ev=await shot(p,'11-back-after-logout');
  rec('browser_back_after_logout_no_resurrect','out_of_order_backout',(!lsb['flutter.auth_token'])?'HELD':'BROKEN',
    `goBack post-logout: tokenLen=${String(lsb['flutter.auth_token']??'').length}, page="${head(tb)}"`,[ev]);

  // ATTACK 2: rapid triple-tap Log in with valid creds
  await openLoginTab(p);
  await fillLogin(p,L.BUYER.email,L.BUYER.pw);
  for(let i=0;i<3;i++){ await L.btn(p,'Log in').click({force:true}).catch(()=>{}); await sleep(150); }
  let tk=false,z=0; while(!tk&&z<25){ tk=await L.isLoggedIn(p); if(!tk){await sleep(1000);z++;} }
  await sleep(1800);
  const tl=await dumpTxt(p); const lsL=await lsDump(p);
  ev=await shot(p,'12-rapid-triple-tap-login');
  rec('rapid_triple_tap_login_valid_creds','rapid_double_tap',(tk && lsL['flutter.auth_token']>10)?'HELD':'DISPUTED',
    `3x Log in taps w/ valid creds: tokenPersisted=${tk} (${z+1}s), myAccountUi=${tl.includes('My account')}, storageKeys=${JSON.stringify(Object.keys(lsL))}`,[ev]);

  console.log('\nSTAGE1_DONE', JSON.stringify(R.attacks.map(a=>a.result)));
  await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e&&e.stack||e);process.exit(2);});
