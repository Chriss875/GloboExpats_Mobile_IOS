// STAGE 8: root-cause the logout storage residue. shared_preferences_web writes
// `flutter.<key>` = JSON-ENCODED value. Hypotheses:
//  H1: prefs.remove() is a no-op on this build -> full token remains (logout broken)
//  H2: remove works, but something REWRITES the token after clear (e.g. best-effort
//      _api.logout(token) 401->handleUnauthorized->... or a listener) -> short residue?
//  H3: the residue is the KV in-memory mirror replaying a pre-init write.
// Probe: watch ALL localStorage mutations from inside the page (wrap setItem/removeItem/clear).
const {L,APP,rec,sleep,lsDump,dumpTxt,head,fillLogin} = require('./au001_sk2_lib.js');
const {btn,clickBtn}=L;
(async()=>{
  const browser=await L.newBrowser();
  const ctx=await L.newCtx(browser,{viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  await p.goto(APP+'/',{waitUntil:'load',timeout:90000}); await L.waitText(p,'Buy now',45000);
  await p.evaluate(()=>{localStorage.clear();}); await sleep(150);
  await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p,'Buy now',45000); await sleep(1500);

  // instrument BEFORE login so we catch every mutation
  await p.evaluate(()=>{
    window.__mutations=[];
    const _s=Storage.prototype.setItem,_r=Storage.prototype.removeItem,_c=Storage.prototype.clear;
    Storage.prototype.setItem=function(k,v){ window.__mutations.push(['set',k,String(v).length,Date.now()%100000]); return _s.call(this,k,v); };
    Storage.prototype.removeItem=function(k){ window.__mutations.push(['rm',k,null,Date.now()%100000]); return _r.call(this,k); };
    Storage.prototype.clear=function(){ window.__mutations.push(['clear',null,null,Date.now()%100000]); return _c.call(this); };
  });
  await clickBtn(p,'Account'); await sleep(1700);
  await fillLogin(p,L.BUYER.email,L.BUYER.pw);
  await btn(p,'Log in').click({force:true}).catch(()=>{});
  let ok=false,w=0; while(!ok&&w<25){ ok=await L.isLoggedIn(p); if(!ok){await sleep(1000);w++;} }
  await sleep(2000);
  console.log('authed:',ok);
  console.log('MUTATIONS AFTER LOGIN:',JSON.stringify(await p.evaluate(()=>window.__mutations)));
  // snapshot raw values (lengths only) before logout
  console.log('BEFORE LOGOUT:',JSON.stringify(await lsDump(p)));

  await btn(p,'Log out').click({force:true}).catch(()=>{});
  await sleep(3500);
  console.log('\nMUTATIONS AROUND LOGOUT:',JSON.stringify(await p.evaluate(()=>window.__mutations.slice(-12))));
  const raw=await p.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);let v=String(localStorage.getItem(k));o[k]=/auth/i.test(k)?('<'+v.length+'ch:'+v.slice(0,6)+'…'+v.slice(-4)+'>'):v;}return o;});
  console.log('RAW STORAGE POST-LOGOUT:',JSON.stringify(raw));
  const tv=await dumpTxt(p);
  console.log('VIEW POST-LOGOUT:',head(tv,120));
  console.log('isLoggedIn():',await L.isLoggedIn(p),'| welcomeBack=',tv.includes('Welcome back'));
  // reload
  await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p,'Buy now',40000).catch(()=>{}); await sleep(2000);
  const k2=await lsDump(p), t2v=await dumpTxt(p);
  await clickBtn(p,'Account'); await sleep(1800);
  const tAcc=await dumpTxt(p);
  let ev=await shot(p,'29-reload-after-instrumented-logout');
  console.log('\nAFTER RELOAD token len:',String(k2['flutter.auth_token']??'').length,
    '| account shows Login:',tAcc.includes('Welcome back'),'| My account:',tAcc.includes('My account'));
  rec('instrumented_logout_storage_trace','regression_core_criterion',
    (!(k2['flutter.auth_token']>10) && tAcc.includes('Welcome back'))?'HELD':'BROKEN',
    `storage-mutation trace across logout+reload: postLogoutAuthKeys=${JSON.stringify(Object.keys(raw).filter(k=>/auth/i.test(k)))}, postReloadTokenLen=${String(k2['flutter.auth_token']??'').length}, accountShowsLogin=${tAcc.includes('Welcome back')}`,[ev]);
  await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e&&e.stack||e);process.exit(2);});
