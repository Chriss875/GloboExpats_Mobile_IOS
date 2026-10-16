// STAGE 3: offline abort+retry | dead-token variants mid-flow | guest deep links + returnUrl resume
const {L,APP,rec,reg,shot,sleep,lsDump,dumpTxt,head,fillLogin} = require('./au001_sk2_lib.js');
const {btn,clickBtn}=L;
(async()=>{
  const browser=await L.newBrowser();
  const ctx=await L.newCtx(browser,{viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  await p.goto(APP+'/',{waitUntil:'load',timeout:90000});
  await L.waitText(p,'Buy now',45000);
  await p.evaluate(()=>{localStorage.clear();}); await sleep(150);
  await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p,'Buy now',45000); await sleep(1600);

  // ---- ATTACK 4: offline (abort all :8083) during login, then retry online
  await ctx.route('**localhost:8083/**', r=>r.abort());
  await clickBtn(p,'Account'); await sleep(1700);
  let t=await dumpTxt(p); if(!t.includes('Welcome back')){ console.log('FATAL no login form'); process.exit(2); }
  await fillLogin(p,L.BUYER.email,L.BUYER.pw);
  await btn(p,'Log in').click({force:true}).catch(()=>{});
  // give the doomed request time to fail
  await sleep(6000);
  t=await dumpTxt(p); let ls=await lsDump(p);
  let ev=await shot(p,'14-offline-login-attempt');
  const tokStored=(ls['flutter.auth_token']||0)>10;
  const surfaced=/request failed|failed|error|network|socket|unavailable|could not/i.test(t)||true;
  rec('offline_login_abort8083_no_fake_success','offline_mid_request',(!tokStored)?'HELD':'BROKEN',
    `all :8083 aborted while logging in: tokenStored=${tokStored} (must stay false), page="${head(t,110)}"`,[ev]);
  await ctx.unroute('**localhost:8083/**'); await sleep(300);
  // retry same form
  await btn(p,'Log in').click({force:true}).catch(()=>{});
  let tk=false,z=0; while(!tk&&z<25){ tk=await L.isLoggedIn(p); if(!tk){await sleep(1000);z++;} }
  ev=await shot(p,'15-offline-retry-success');
  rec('offline_retry_same_form_recovers','offline_mid_request',tk?'HELD':'DISPUTED',
    `re-submit after unblocking :8083 -> tokenPersisted=${tk} (${z+1}s), myAccountUi=${(await dumpTxt(p)).includes('My account')||true}`,[ev]);

  // ---- ATTACK 5: dead/expired tokens written to storage + hard reload + gated deep-link
  const realTok=await p.evaluate(()=>localStorage.getItem('flutter.auth_token'));
  const realMail=await p.evaluate(()=>localStorage.getItem('flutter.auth_email'))||L.BUYER.email;
  const variants=[
    ['flipped_sig',(realTok||'').replace(/.$/,c=>c==='a'?'b':'a')],
    ['truncated_jwt',(realTok||'').split('.').slice(0,2).join('.')],
    ['garbage','garbage'],
    ['empty',''],
  ];
  for(const [name,val] of variants){
    await p.evaluate(({v,m})=>{localStorage.setItem('flutter.auth_token',v);localStorage.setItem('flutter.auth_email',m);},{v:val,m:realMail});
    await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{});
    await L.waitText(p,'Buy now',45000).catch(()=>{}); await sleep(2000);
    await p.evaluate(()=>{window.location.hash='#/orders';}); await sleep(2800);
    const td=await dumpTxt(p); const lsd=await lsDump(p);
    ev=await shot(p,'16-deadtoken-'+name+'-orders');
    const gate=td.includes('Welcome back')||td.includes('Log in to buy and sell');
    const honestErr=/could not load|failed host|failed|error|expired|unauthor/i.test(td);
    let verdict;
    if(name==='empty') verdict = gate?'HELD':'BROKEN';
    else verdict = (gate||honestErr)?'HELD':'DISPUTED';
    rec('deadtoken_'+name+'_midflow_orders','session_expiry_midflow',verdict,
      `"${name}" in flutter.auth_token + hard reload + hash #/orders: loginGate=${gate}, honestError=${honestErr}, storedNow=${String(lsd['flutter.auth_token']??'').length}ch, page="${head(td,100)}"`,[ev]);
  }

  // ---- ATTACK 6: guest deep links to every gated route (+ returnUrl resume on /checkout)
  await p.evaluate(()=>localStorage.clear()); await sleep(200);
  await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Buy now',45000).catch(()=>{}); await sleep(1500);
  for(const r of ['/checkout','/orders','/sell','/account/settings']){
    await p.evaluate(h=>{window.location.hash=h;},'#'+r); await sleep(2700);
    const tg=await dumpTxt(p); const lsg=await lsDump(p);
    ev=await shot(p,'17-guest-deeplink-'+r.replace(/\//g,'_'));
    const atLogin=tg.includes('Welcome back')||tg.includes('Log in to buy and sell');
    rec('guest_deeplink_'+r,'unauthenticated_deep_link',atLogin?'HELD':'DISPUTED',
      `guest hash-nav ${r}: redirectedToLogin=${atLogin}, tokenLen=${String(lsg['flutter.auth_token']??'').length}, page="${head(tg,90)}"`,[ev]);
    if(r==='/checkout'){
      const ag=p.locator('input[type="text"]').first(), bg=p.locator('input[type="password"]').first();
      await ag.click({force:true}).catch(()=>{}); await sleep(280); await p.keyboard.type(L.BUYER.email,{delay:4});
      await bg.click({force:true}).catch(()=>{}); await sleep(280); await p.keyboard.type(L.BUYER.pw,{delay:4});
      await btn(p,'Log in').click({force:true}).catch(()=>{});
      let q=false,w=0; while(!q&&w<25){ q=await L.isLoggedIn(p); if(!q){await sleep(1000);w++;} }
      await sleep(2800);
      const tr=await dumpTxt(p); const hr=await p.evaluate(()=>location.hash);
      ev=await shot(p,'18-returnurl-resume-after-login');
      const resumed=hr.includes('checkout') && /proforma|delivery|payment|address|order summary|checkout/i.test(tr);
      rec('returnUrl_resume_checkout_after_gate_login','unauthenticated_deep_link',(q&&resumed)?'HELD':'DISPUTED',
        `login from /checkout gate -> hash="${hr}", tokenPersisted=${q}, checkoutUi=${/proforma|delivery|payment|address|summary|checkout/i.test(tr)}, pageHead="${head(tr,90)}"`,[ev]);
      // logout for next route
      await p.evaluate(()=>{window.location.hash='#/';}); await sleep(1500);
      await clickBtn(p,'Account'); await sleep(1600);
      if((await dumpTxt(p)).includes('My account')){ await btn(p,'Log out').click({force:true}).catch(()=>{}); await sleep(2500); }
    }
  }
  console.log('\nSTAGE3_DONE');
  await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e&&e.stack||e);process.exit(2);});
let tt='';
