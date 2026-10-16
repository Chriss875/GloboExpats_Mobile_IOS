// STAGE 7: correct-path logout (no stray tap) -> storage + backend call + UI swap;
// then the REAL cross-tab logout test.
const {L,APP,rec,sleep,lsDump,dumpTxt,head,fillLogin,shot} = require('./au001_sk2_lib.js');
const {btn,clickBtn}=L;
(async()=>{
  const browser=await L.newBrowser();
  // ---- A: single-tab logout, clean path
  {
    const ctx=await L.newCtx(browser,{viewport:{width:375,height:667}});
    const p=await ctx.newPage();
    const authNet=[];
    p.on('request',rq=>{ if(/\/api\/v1\/auth\//.test(rq.url())) authNet.push(`${rq.method()} ${rq.url().replace('http://localhost:8083','')}`); });
    await p.goto(APP+'/',{waitUntil:'load',timeout:90000}); await L.waitText(p,'Buy now',45000);
    await p.evaluate(()=>{localStorage.clear();}); await sleep(150);
    await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p,'Buy now',45000); await sleep(1500);
    await clickBtn(p,'Account'); await sleep(1700);
    await fillLogin(p,L.BUYER.email,L.BUYER.pw);
    await btn(p,'Log in').click({force:true}).catch(()=>{});
    let ok=false,w=0; while(!ok&&w<25){ ok=await L.isLoggedIn(p); if(!ok){await sleep(1000);w++;} }
    await sleep(2000);
    console.log('authed:',ok,'| view head:',head(await dumpTxt(p),80));
    const loVisible=await btn(p,'Log out').isVisible().catch(()=>false);
    console.log('Log out visible (clean path):',loVisible);
    if(loVisible){
      await btn(p,'Log out').click({force:true}).catch(()=>{});
      await sleep(3200);
      const keys=await p.evaluate(()=>Object.keys(localStorage));
      const tv=await dumpTxt(p);
      let ev=await shot(p,'25-clean-logout-storage');
      rec('clean_logout_clears_storage_and_swaps_ui','regression_core_criterion',
        (!keys.includes('flutter.auth_token') && tv.includes('Welcome back'))?'HELD':'DISPUTED',
        `logout via visible Log out button: residualAuthKeys=${JSON.stringify(keys.filter(k=>/auth/i.test(k)))}, welcomeBack=${tv.includes('Welcome back')}, authApiCalls=${JSON.stringify(authNet)}`, [ev]);
      // reload after clean logout -> still guest
      await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p,'Buy now',40000).catch(()=>{}); await sleep(1800);
      const k2=await lsDump(p); const t2v=await dumpTxt(p);
      let ev2=await shot(p,'26-reload-after-clean-logout');
      rec('reload_after_clean_logout_stays_guest','regression_core_criterion',
        (!(k2['flutter.auth_token']>10)) && t2v.includes('Welcome back') ? 'HELD':'BROKEN',
        `hard reload post-logout: tokenLen=${String(k2['flutter.auth_token']??'').length}, accountTabShowsLogin=${t2v.includes('Welcome back')}`,[ev2]);
    }
    await ctx.close();
  }
  // ---- B: cross-tab, tab1 logs out via CLEAN path, tab2 hard-reloads
  {
    const ctx=await L.newCtx(browser,{viewport:{width:375,height:667}});
    const p1=await ctx.newPage(), p2=await ctx.newPage();
    for(const pg of [p1,p2]){ await pg.goto(APP+'/',{waitUntil:'load',timeout:90000}); await L.waitText(pg,'Buy now',45000); }
    await p1.evaluate(()=>localStorage.clear()); await sleep(250);
    await p1.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p1,'Buy now',45000); await sleep(1500);
    await clickBtn(p1,'Account'); await sleep(1700);
    await fillLogin(p1,L.BUYER.email,L.BUYER.pw);
    await btn(p1,'Log in').click({force:true}).catch(()=>{});
    let ok=false,w=0; while(!ok&&w<25){ ok=await L.isLoggedIn(p1); if(!ok){await sleep(1000);w++;} }
    console.log('\ntab1 authed:',ok);
    await p2.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p2,'Buy now',45000).catch(()=>{}); await sleep(1800);
    console.log('tab2 sees session:',await L.isLoggedIn(p2));
    await clickBtn(p1,'Account'); await sleep(1900);
    const tA=await dumpTxt(p1);
    console.log('tab1 My account:',tA.includes('My account'),'| Log out visible:',await btn(p1,'Log out').isVisible().catch(()=>false));
    await btn(p1,'Log out').click({force:true}).catch(()=>{}); await sleep(3000);
    console.log('tab1 post-logout auth keys:',JSON.stringify((await p1.evaluate(()=>Object.keys(localStorage))).filter(k=>/auth/i.test(k))));
    // tab2 stale then reload
    await clickBtn(p2,'Account'); await sleep(1700);
    const staleView=await dumpTxt(p2);
    let evA=await shot(p2,'27-stale-tab-account-before-reload');
    await p2.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p2,'Buy now',45000).catch(()=>{}); await sleep(2200);
    const sAfter=await lsDump(p2); const tRl=await dumpTxt(p2);
    await clickBtn(p2,'Account'); await sleep(1800);
    const tAcc=await dumpTxt(p2);
    let evB=await shot(p2,'28-tab2-hardreload-after-cross-tab-clean-logout');
    const gated = !(sAfter['flutter.auth_token']>10) && (tAcc.includes('Welcome back'));
    rec('cross_tab_logout_then_hard_reload_gates_guest','stale_cache_reload_after_mutation', gated?'HELD':'BROKEN',
      `tab1 logged out cleanly; tab2 hard reload: residualTokenLen=${String(sAfter['flutter.auth_token']??'').length}, accountShowsLogin=${tAcc.includes('Welcome back')} | pre-reload stale AccountView=${staleView.includes('My account')} | page="${head(tRl,90)}"`,[evA,evB]);
    await ctx.close();
  }
  console.log('\nSTAGE7_DONE');
  await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e&&e.stack||e);process.exit(2);});
