// STAGE 4: offline-retry root-cause + stale-cache cross-tab logout
const {L,APP,rec,shot,sleep,lsDump,dumpTxt,head,fillLogin} = require('./au001_sk2_lib.js');
const {btn,clickBtn}=L;
(async()=>{
  const browser=await L.newBrowser();

  // ---- A. offline retry root-cause (fresh context, instrumented) ----
  {
    const ctx=await L.newCtx(browser,{viewport:{width:375,height:667}});
    const p=await ctx.newPage();
    const events=[];
    p.on('response',r=>{ if(/\/api\/v1\//.test(r.url())) events.push(`RESP ${r.request().method()} ${r.url().replace('http://localhost:8083','')} -> ${r.status()}`); });
    p.on('requestfailed',rq=>{ if(/\/api\/v1\//.test(rq.url())) events.push(`FAIL ${rq.method()} ${rq.url().replace('http://localhost:8083','')} :: ${rq.failure()&&rq.failure().errorText}`); });
    await p.goto(APP+'/',{waitUntil:'load',timeout:90000}); await L.waitText(p,'Buy now',45000);
    await p.evaluate(()=>{localStorage.clear();}); await sleep(150);
    await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p,'Buy now',45000); await sleep(1600);

    await ctx.route('**localhost:8083/**', r=>r.abort());
    await clickBtn(p,'Account'); await sleep(1700);
    await fillLogin(p,L.BUYER.email,L.BUYER.pw);
    await btn(p,'Log in').click({force:true}).catch(()=>{});
    await sleep(5000);
    let t=await dumpTxt(p); let ev1=await shot(p,'14b-offline-attempt-instrumented');
    console.log('OFFLINE page:', head(t,140));
    console.log('OFFLINE net:', JSON.stringify(events.slice(-6)));
    await ctx.unroute('**localhost:8083/**');
    events.length=0;
    // retry path R2: re-click with fields still populated
    await btn(p,'Log in').click({force:true}).catch(()=>{});
    let ok=false,w=0; while(!ok&&w<12){ ok=await L.isLoggedIn(p); if(!ok){await sleep(1000);w++;} }
    let ev2=await shot(p,'15b-offline-retry-r2-fields-intact');
    console.log('RETRY-R2 token:', ok, 'net:', JSON.stringify(events.slice(-4)), 'page:', head(await dumpTxt(p),110));
    rec('offline_retry_fields_intact_resubmit','offline_mid_request', ok?'HELD':'DISPUTED',
      `instrumented retry (fields intact): tokenPersisted=${ok}, net=${JSON.stringify(events.slice(-3))}`,[ev1,ev2]);
    if(!ok){
      // retry path R3: full reload then fresh login (the recovery a user can always do)
      events.length=0;
      await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p,'Buy now',45000).catch(()=>{}); await sleep(1500);
      await clickBtn(p,'Account'); await sleep(1700);
      if(!(await dumpTxt(p)).includes('Welcome back')){ console.log('[R3] no form?'); }
      else{
        await fillLogin(p,L.BUYER.email,L.BUYER.pw);
        await btn(p,'Log in').click({force:true}).catch(()=>{});
        let q=false,v=0; while(!q&&v<20){ q=await L.isLoggedIn(p); if(!q){await sleep(1000);v++;} }
        ev2=await shot(p,'15c-offline-retry-r3-fresh-form');
        console.log('RETRY-R3 token:', q, 'net:', JSON.stringify(events.slice(-3)));
        rec('offline_recovery_fresh_form_after_reload','offline_mid_request', q?'HELD':'BROKEN',
          `reload -> fresh login form -> submit: tokenPersisted=${q} (${v+1}s)`,[ev2]);
      }
    }
    await ctx.close();
  }

  // ---- B. stale-cache cross-tab logout (two pages, one context = shared localStorage) ----
  {
    const ctx=await L.newCtx(browser,{viewport:{width:375,height:667}});
    const p1=await ctx.newPage();
    await p1.goto(APP+'/',{waitUntil:'load',timeout:90000}); await L.waitText(p1,'Buy now',45000);
    await p1.evaluate(()=>{localStorage.clear();}); await sleep(150);
    await p1.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p1,'Buy now',45000); await sleep(1400);
    await clickBtn(p1,'Account'); await sleep(1700);
    await fillLogin(p1,L.BUYER.email,L.BUYER.pw);
    await btn(p1,'Log in').click({force:true}).catch(()=>{});
    let ok=false,w=0; while(!ok&&w<25){ ok=await L.isLoggedIn(p1); if(!ok){await sleep(1000);w++;} }
    console.log('tab1 authed:', ok);

    const p2=await ctx.newPage();
    await p2.goto(APP+'/',{waitUntil:'load',timeout:90000}); await L.waitText(p2,'Buy now',40000).catch(()=>{}); await sleep(2000);
    const beforeMut=await L.isLoggedIn(p2);
    let evA=await shot(p2,'19a-second-tab-sees-session');

    // mutate in tab1: logout
    await clickBtn(p1,'Account'); await sleep(1600);
    const t1=await dumpTxt(p1);
    if(!t1.includes('My account')){ console.log('tab1 no My account view?', head(t1,80)); }
    await btn(p1,'Log out').click({force:true}).catch(()=>{}); await sleep(2600);
    const ls1=await lsDump(p1);
    console.log('tab1 post-logout tokenLen:', String(ls1['flutter.auth_token']??'').length);

    // tab2 stale probe: Account view still authed?
    await clickBtn(p2,'Account'); await sleep(1900);
    const t2=await dumpTxt(p2);
    let evB=await shot(p2,'19-second-tab-account-after-other-logout');
    const pg2ThinksAuthed=t2.includes('My account');
    // tab2 hits an authenticated API via /orders
    await p2.evaluate(()=>{window.location.hash='#/orders';}); await sleep(3000);
    const tO=await dumpTxt(p2);
    let evC=await shot(p2,'20-second-tab-orders-after-other-logout');
    const honestFail=/could not load|failed|log in|welcome back|error|expired/i.test(tO);
    rec('stale_second_tab_keeps_stale_ui_until_reload','stale_cache_reload_after_mutation',
      (beforeMut && pg2ThinksAuthed)?'HELD':'DISPUTED',
      `tab2 loaded while session live=${beforeMut}; after tab1 logout, tab2 AccountView=${pg2ThinksAuthed} (in-memory UI staleness is expected pre-reload), page="${head(t2,90)}"`,[evA,evB]);
    rec('stale_second_tab_orders_honest_failure','stale_cache_reload_after_mutation',
      honestFail?'HELD':'DISPUTED',
      `tab2 hash #/orders AFTER other-tab logout: honestFailure=${honestFail}, page="${head(tO,100)}"`,[evC]);
    // hard reload must gate to guest
    await p2.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p2,'Buy now',40000).catch(()=>{}); await sleep(1800);
    const tRl=await dumpTxt(p2); const lsRl=await lsDump(p2);
    let evD=await shot(p2,'21-second-tab-hard-reload-gates-guest');
    const gated=(String(lsRl['flutter.auth_token']??'').length===0) && (tRl.includes('Welcome back')||tRl.includes('Log in'));
    rec('stale_tab_hard_reload_gates_to_guest','stale_cache_reload_after_mutation', gated?'HELD':'BROKEN',
      `tab2 hard reload after other-tab logout: storageTokenLen=${String(lsRl['flutter.auth_token']??'').length}, page="${head(tRl,90)}"`,[evD]);
    await ctx.close();
  }
  console.log('\nSTAGE4_DONE');
  await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e&&e.stack||e);process.exit(2);});
