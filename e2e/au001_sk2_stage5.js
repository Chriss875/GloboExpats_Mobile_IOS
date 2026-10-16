// STAGE 5: root-cause the 3-char token residue (cross-tab logout) — is it the app or the harness?
const {L,APP,rec,shot,sleep,lsDump,dumpTxt,head,fillLogin} = require('./au001_sk2_lib.js');
const {btn,clickBtn}=L;
(async()=>{
  const browser=await L.newBrowser();
  // fresh context, single page: login -> logout -> dump storage keys+values
  {
    const ctx=await L.newCtx(browser,{viewport:{width:375,height:667}});
    const p=await ctx.newPage();
    await p.goto(APP+'/',{waitUntil:'load',timeout:90000}); await L.waitText(p,'Buy now',45000);
    await p.evaluate(()=>{localStorage.clear();}); await sleep(150);
    await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p,'Buy now',45000); await sleep(1500);
    await clickBtn(p,'Account'); await sleep(1700);
    await fillLogin(p,L.BUYER.email,L.BUYER.pw);
    await btn(p,'Log in').click({force:true}).catch(()=>{});
    let ok=false,w=0; while(!ok&&w<25){ ok=await L.isLoggedIn(p); if(!ok){await sleep(1000);w++;} }
    console.log('authed:',ok, 'keys:',JSON.stringify(await lsDump(p)));
    await clickBtn(p,'Account'); await sleep(1600);
    const t=await dumpTxt(p);
    console.log('account view has My account:', t.includes('My account'), '| head:', head(t,80));
    await btn(p,'Log out').click({force:true}).catch(()=>{}); await sleep(2600);
    const after=await p.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=String(localStorage.getItem(k));}return o;});
    console.log('AFTER LOGOUT storage:', JSON.stringify(after).replace(/(auth_token\\?":\\?")[^"]{8}[^"]*/g,'$1<REDACTED>'));
    const welcome=(await dumpTxt(p)).includes('Welcome back');
    rec('single_tab_logout_clears_storage','regression_core_criterion',(welcome && Object.keys(after).every(k=>!/^flutter\.auth/.test(k)||String(after[k]).length===0))?'HELD':'DISPUTED',
      `logout in a single tab: welcomeBack=${welcome}, residualAuthKeys=${JSON.stringify(Object.entries(after).filter(([k])=>/auth/i.test(k)).map(([k,v])=>k+'='+v.length+'ch'))}`,[await shot(p,'23-single-tab-logout-storage')]);
    await ctx.close();
  }
  // cross-tab with 'storage' event listener instrumentation
  {
    const ctx=await L.newCtx(browser,{viewport:{width:375,height:667}});
    const p1=await ctx.newPage(); const p2=await ctx.newPage();
    await p1.goto(APP+'/',{waitUntil:'load',timeout:90000}); await L.waitText(p1,'Buy now',45000);
    await p2.goto(APP+'/',{waitUntil:'load',timeout:90000}); await L.waitText(p2,'Buy now',45000);
    await p1.evaluate(()=>{localStorage.clear();}); await sleep(200);
    await p1.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p1,'Buy now',45000); await sleep(1400);
    await clickBtn(p1,'Account'); await sleep(1700);
    await fillLogin(p1,L.BUYER.email,L.BUYER.pw);
    await btn(p1,'Log in').click({force:true}).catch(()=>{});
    let ok=false,w=0; while(!ok&&w<25){ ok=await L.isLoggedIn(p1); if(!ok){await sleep(1000);w++;} }
    console.log('\ntab1 authed:', ok);
    // reload tab2 so it boots WITH the session
    await p2.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p2,'Buy now',45000).catch(()=>{}); await sleep(1800);
    console.log('tab2 sees token:', await L.isLoggedIn(p2));
    // logout on tab1
    await clickBtn(p1,'Account'); await sleep(1700);
    const t1v=await dumpTxt(p1);
    console.log('tab1 account view My account:', t1v.includes('My account'), '| head:', head(t1v.replace(/\n/g,' '),80));
    await btn(p1,'Log out').click({force:true}).catch(()=>{}); await sleep(2800);
    const s1=await lsDump(p1), s2raw=await lsDump(p2);
    console.log('tab1 post-logout auth_token len:', String(s1['flutter.auth_token']??'').length);
    console.log('tab2 (stale) flutter.auth_token len:', String(s2raw['flutter.auth_token']??'').length, '(expected stale copy)');
    // hard-reload tab2 -> gate check
    await p2.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p2,'Buy now',45000).catch(()=>{}); await sleep(2200);
    const s2after=await lsDump(p2);
    const tRl=await dumpTxt(p2);
    let ev=await shot(p2,'24-tab2-hardreload-after-cross-tab-logout');
    console.log('tab2 AFTER hard reload: token len=', String(s2after['flutter.auth_token']??'').length,
      '| gated to login =', tRl.includes('Welcome back'), '| page head:', head(tRl,100));
    // THE question: does the app treat a 3-char residual token as a session?
    rec('cross_tab_logout_hard_reload_gate','stale_cache_reload_after_mutation',
      (String(s2after['flutter.auth_token']??'').length===0 || tRl.includes('Welcome back'))?'HELD':'BROKEN',
      `tab2 hard reload after other-tab logout: residualTokenLen=${String(s2after['flutter.auth_token']??'').length}, gatedToLogin=${tRl.includes('Welcome back')||tRl.includes('Log in')}, page="${head(tRl,110)}"`,[ev]);
    await ctx.close();
  }
  console.log('\nSTAGE5_DONE');
  await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e&&e.stack||e);process.exit(2);});
