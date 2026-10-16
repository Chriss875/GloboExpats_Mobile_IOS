// STAGE 10: (i) explain the 3-char residue seen on the stray-tap path;
// (ii) capture POST /auth/logout STATUS; (iii) tablet 768x1024 full core criterion;
// (iv) HONEST rapid triple-tap logout (button scrolled into view);
// (v) out-of-order back-out mid-login.
const {L,APP,rec,sleep,lsDump,dumpTxt,head,fillLogin} = require('./au001_sk2_lib.js');
const {btn,clickBtn}=L;
async function logoutRect(pg){
  return pg.evaluate(()=>{
    let hit=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if(hit) return;
      if(e.getAttribute('role')==='button' && (e.textContent||'').trim()==='Log out'){
        const b=e.getBoundingClientRect();
        if(b.width>10&&b.height>10&&b.bottom>0&&b.top<innerHeight) hit={x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};
      }
    });
    return hit;
  });
}
async function scrollToLogout(pg){
  await pg.mouse.move(190,400);
  for(let i=0;i<16;i++){ await pg.mouse.wheel(0,500); await sleep(90); }
  await sleep(800);
  return logoutRect(pg);
}
(async()=>{
  const browser=await L.newBrowser();

  // ---------- (i)+(ii): stray-tap residue explanation + logout POST status ----------
  {
    const ctx=await L.newCtx(browser,{viewport:{width:375,height:667}});
    const p=await ctx.newPage();
    const st=[];
    p.on('response',r=>{ if(/\/api\/v1\/auth\//.test(r.url())) st.push(`${r.request().method()} ${r.url().replace('http://localhost:8083','')} -> ${r.status()}`); });
    await p.goto(APP+'/',{waitUntil:'load',timeout:90000}); await L.waitText(p,'Buy now',45000);
    await p.evaluate(()=>{localStorage.clear();}); await sleep(150);
    await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p,'Buy now',45000); await sleep(1500);
    await clickBtn(p,'Account'); await sleep(1700);
    await fillLogin(p,L.BUYER.email,L.BUYER.pw);
    await btn(p,'Log in').click({force:true}).catch(()=>{});
    let ok=false,w=0; while(!ok&&w<25){ ok=await L.isLoggedIn(p); if(!ok){await sleep(1000);w++;} }
    await sleep(1800);
    console.log('authed:',ok);
    // STRAY TAP: semantics force-click while Log out is OFFSCREEN (reproduces stages 5/7)
    await btn(p,'Log out').click({force:true}).catch(()=>{});
    await sleep(2600);
    const navTxt=await dumpTxt(p);
    console.log('after offscreen force-click, view:', head(navTxt,70));
    // navigate back to account list
    await clickBtn(p,'Account'); await sleep(1700);
    const tBack=await dumpTxt(p);
    console.log('back on account?', tBack.includes('My account'), '| head:', head(tBack,60));
    const residRaw=await p.evaluate(()=>{
      const v=localStorage.getItem('flutter.auth_token');
      return v===null?'<ABSENT>':(v.length+'ch:'+JSON.stringify(v));
    });
    console.log('flutter.auth_token NOW:',residRaw.slice(0,60),'...');
    console.log('isLoggedIn():',await L.isLoggedIn(p));
    // Now do the REAL logout from wherever we are
    const r=await scrollToLogout(p);
    console.log('logout rect:',JSON.stringify(r));
    if(r){
      await p.mouse.click(r.x,r.y); await sleep(3200);
      console.log('\nAUTH NET:',JSON.stringify(st));
      const kAfter=await lsDump(p);
      const tv=await dumpTxt(p);
      rec('stray_tap_residue_explained_then_real_logout','out_of_order_backout',
        (!(kAfter['flutter.auth_token']>10)&&tv.includes('Welcome back'))?'HELD':'BROKEN',
        `offscreen force-click landed elsewhere (view="${head(navTxt,50)}") leaving flutter.auth_token=${residRaw.slice(0,24)}; after returning + REAL logout click: tokenLen=${String(kAfter['flutter.auth_token']??'').length}, welcomeBack=${tv.includes('Welcome back')}, authNet=${JSON.stringify(st)}`,[]);
    }
    await ctx.close();
  }

  // ---------- (iv) honest rapid triple-tap logout ----------
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
    await sleep(1600);
    const r=await scrollToLogout(p);
    console.log('\n[triple] rect:',JSON.stringify(r));
    if(!r){ rec('rapid_triple_tap_logout_honest','rapid_double_tap','BLOCKED','Log out not reachable',[]); }
    else{
      for(let i=0;i<3;i++){ await p.mouse.click(r.x,r.y); await sleep(130); }
      await sleep(2800);
      const k=await lsDump(p); const tv=await dumpTxt(p);
      rec('rapid_triple_tap_logout_honest','rapid_double_tap',
        (!(k['flutter.auth_token']>10)&&tv.includes('Welcome back'))?'HELD':'BROKEN',
        `3 rapid clicks (~130ms apart) on the visible Log out button: tokenLen=${String(k['flutter.auth_token']??'').length}, welcomeBack=${tv.includes('Welcome back')}, noCrash=${tv.length>0}`,[await require('./au001_sk2_lib.js').shot(p,'36-rapid-triple-logout-in-view')]);
      // reload -> guest
      await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p,'Buy now',45000).catch(()=>{}); await sleep(1900);
      const k2=await lsDump(p);
      await clickBtn(p,'Account'); await sleep(1800);
      const ta=await dumpTxt(p);
      rec('reload_after_triple_tap_logout','rapid_double_tap',
        (!(k2['flutter.auth_token']>10)&&ta.includes('Welcome back'))?'HELD':'BROKEN',
        `post triple-tap logout hard reload: tokenLen=${String(k2['flutter.auth_token']??'').length}, accountShowsLogin=${ta.includes('Welcome back')}`,[]);
    }
    await ctx.close();
  }

  // ---------- (v) out-of-order: start login, abandon to another tab, come Back ----------
  {
    const ctx=await L.newCtx(browser,{viewport:{width:375,height:667}});
    const p=await ctx.newPage();
    await p.goto(APP+'/',{waitUntil:'load',timeout:90000}); await L.waitText(p,'Buy now',45000);
    await p.evaluate(()=>{localStorage.clear();}); await sleep(150);
    await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p,'Buy now',45000); await sleep(1400);
    await clickBtn(p,'Account'); await sleep(1600);
    // type email only, then abandon to Home tab
    const a=p.locator('input[type="text"]').first();
    await a.click({force:true}).catch(()=>{}); await sleep(250); await p.keyboard.type(L.BUYER.email,{delay:4});
    await clickBtn(p,'Home'); await sleep(1500);
    const homeTxt=await dumpTxt(p);
    // come back via Account tab: still guest login form?
    await clickBtn(p,'Account'); await sleep(1600);
    const backTxt=await dumpTxt(p);
    const stillGuestForm=backTxt.includes('Welcome back');
    const noToken=(await lsDump(p))['flutter.auth_token']>10;
    rec('abandon_login_midway_return','out_of_order_backout',(stillGuestForm&&!noToken)?'HELD':'DISPUTED',
      `typed half a login, switched Home, returned: formStillShown=${stillGuestForm}, tokenStored=${noToken}, homeHead="${head(homeTxt,50)}"` ,[]);
    // finish login from the abandoned form
    const b=p.locator('input[type="password"]').first();
    await b.click({force:true}).catch(()=>{}); await sleep(250); await p.keyboard.type(L.BUYER.pw,{delay:4});
    await btn(p,'Log in').click({force:true}).catch(()=>{});
    let ok=false,v=0; while(!ok&&v<25){ ok=await L.isLoggedIn(p); if(!ok){await sleep(1000);v++;} }
    rec('resume_abandoned_login_succeeds','out_of_order_backout', ok?'HELD':'DISPUTED',
      `completing abandoned login: tokenPersisted=${ok} (${v+1}s)`,[]);
    // browser Back from signed-in account view must NOT log us out
    await clickBtn(p,'Account'); await sleep(1600);
    await p.goBack().catch(()=>{}); await sleep(2200);
    const tb=await dumpTxt(p); const kb=await lsDump(p);
    rec('browser_back_while_signed_in_keeps_session','out_of_order_backout',(kb['flutter.auth_token']>10)?'HELD':'BROKEN',
      `goBack while signed in: tokenLen=${String(kb['flutter.auth_token']??'').length}, page="${head(tb,70)}"`,[]);
    await ctx.close();
  }

  // ---------- (iii) tablet 768x1024 full core criterion ----------
  {
    const ctx=await L.newCtx(browser,{viewport:{width:768,height:1024}});
    const q=await ctx.newPage();
    const st=[];
    q.on('response',r=>{ if(/\/api\/v1\/auth\//.test(r.url())) st.push(`${r.request().method()} ${r.url().replace('http://localhost:8083','')} -> ${r.status()}`); });
    await q.goto(APP+'/',{waitUntil:'load',timeout:90000}); await L.waitText(q,'Buy now',45000);
    await q.evaluate(()=>{localStorage.clear();}); await sleep(150);
    await q.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(q,'Buy now',45000).catch(()=>{}); await sleep(1600);
    await clickBtn(q,'Login'); await sleep(1800);
    let t=await dumpTxt(q);
    if(!t.includes('Welcome back')){ await clickBtn(q,'Account'); await sleep(1600); }
    await fillLogin(q,L.BUYER.email,L.BUYER.pw);
    await btn(q,'Log in').click({force:true}).catch(()=>{});
    let ok=false,w=0; while(!ok&&w<25){ ok=await L.isLoggedIn(q); if(!ok){await sleep(1000);w++;} }
    await q.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(q,'Buy now',45000).catch(()=>{}); await sleep(2100);
    const tokR=await L.isLoggedIn(q);
    await clickBtn(q,'Account'); await sleep(1900);
    const acc=await dumpTxt(q);
    const shot=require('./au001_sk2_lib.js').shot;
    const evA=await shot(q,'37-tablet-reload-persistence');
    rec('tablet_768_reload_persistence_core','regression_core_criterion',
      (tokR&&acc.includes('My account')&&acc.includes(L.BUYER.email))?'HELD':'BROKEN',
      `768x1024 login token=${ok}, postReloadToken=${tokR}, MyAccount=${acc.includes('My account')}, email=${acc.includes(L.BUYER.email)} (bundle b56e345)`, [evA]);
    // tablet logout via visible button
    const r=await scrollToLogout(q);
    if(!r){ rec('tablet_logout_clears_storage','regression_core_criterion','BLOCKED','tablet Log out not reachable',[]); }
    else{
      await q.mouse.click(r.x,r.y); await sleep(3200);
      const k=await lsDump(q); const tv=await dumpTxt(q);
      const evB=await shot(q,'38-tablet-after-logout');
      rec('tablet_768_logout_clears_storage_hits_backend','regression_core_criterion',
        (!(k['flutter.auth_token']>10)&&tv.includes('Welcome back'))?'HELD':'BROKEN',
        `tablet logout: tokenLen=${String(k['flutter.auth_token']??'').length}, welcomeBack=${tv.includes('Welcome back')}, authNet=${JSON.stringify(st)}`,[evB]);
    }
    await ctx.close();
  }
  console.log('\nSTAGE10_DONE');
  await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e&&e.stack||e);process.exit(2);});
