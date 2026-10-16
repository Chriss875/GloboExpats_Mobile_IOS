// STAGE 9 (DEFINITIVE): scroll Log out into view (wheel down), coordinate-click its
// true rect, then assert storage + UI + reload.
const {L,APP,rec,shot,sleep,lsDump,dumpTxt,head,fillLogin} = require('./au001_sk2_lib.js');
const {btn,clickBtn}=L;
(async()=>{
  const browser=await L.newBrowser();
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
  console.log('authed:',ok);

  async function logoutRect(){
    return p.evaluate(()=>{
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
  // wheel to bottom
  await p.mouse.move(190,400);
  for(let i=0;i<16;i++){ await p.mouse.wheel(0,500); await sleep(100); }
  await sleep(900);
  let r=await logoutRect();
  console.log('logout rect in viewport:',JSON.stringify(r));
  if(!r){ rec('clean_logout','regression_core_criterion','BLOCKED','Log out button not reachable after scrolling',[]); process.exit(0); }
  await p.mouse.click(r.x,r.y);
  await sleep(3500);
  const keys=await lsDump(p); const tv=await dumpTxt(p);
  let ev=await shot(p,'32-definitive-logout');
  rec('definitive_logout_storage_ui','regression_core_criterion',
    (!(keys['flutter.auth_token']>10)&&tv.includes('Welcome back'))?'HELD':'BROKEN',
    `coordinate click on visible "Log out" button ${JSON.stringify(r)}: postTokenLen=${String(keys['flutter.auth_token']??'').length}, welcomeBack=${tv.includes('Welcome back')}, viewHead="${head(tv,80)}", authApi=${JSON.stringify(authNet)}`,[ev]);
  // hard reload
  await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p,'Buy now',45000).catch(()=>{}); await sleep(2000);
  const k2=await lsDump(p);
  await clickBtn(p,'Account'); await sleep(1900);
  const tAcc=await dumpTxt(p);
  const ev2=await shot(p,'33-reload-after-definitive-logout');
  rec('reload_after_definitive_logout_stays_guest','regression_core_criterion',
    (!(k2['flutter.auth_token']>10)&&tAcc.includes('Welcome back'))?'HELD':'BROKEN',
    `hard reload after real logout: tokenLen=${String(k2['flutter.auth_token']??'').length}, accountShowsLogin=${tAcc.includes('Welcome back')}, My account=${tAcc.includes('My account')}`, [ev2]);

  // ---- cross-tab with the CORRECT logout path on tab1 ----
  const ctxB=await L.newCtx(browser,{viewport:{width:768,height:1024}});
  const q1=await ctxB.newPage(), q2=await ctxB.newPage();
  for(const pg of [q1,q2]){ await pg.goto(APP+'/',{waitUntil:'load',timeout:90000}); await L.waitText(pg,'Buy now',45000).catch(()=>{}); }
  await q1.evaluate(()=>localStorage.clear()); await sleep(250);
  await q1.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(q1,'Buy now',45000).catch(()=>{}); await sleep(1500);
  await clickBtn(q1,'Account'); await sleep(1700);
  await fillLogin(q1,L.BUYER.email,L.BUYER.pw);
  await btn(q1,'Log in').click({force:true}).catch(()=>{});
  let ok2=false,v=0; while(!ok2&&v<25){ ok2=await L.isLoggedIn(q1); if(!ok2){await sleep(1000);v++;} }
  console.log('\ntab1 authed:',ok2);
  await q2.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(q2,'Buy now',45000).catch(()=>{}); await sleep(1800);
  console.log('tab2 sees session:',await L.isLoggedIn(q2));
  // tab1 logs out via correct path
  await q1.mouse.move(380,500);
  for(let i=0;i<16;i++){ await q1.mouse.wheel(0,600); await sleep(90); }
  await sleep(800);
  const r1=await logoutRect.call(null,q1)||await q1.evaluate(()=>{
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
  console.log('tab1 logout rect:',JSON.stringify(r1));
  if(!r1){ rec('cross_tab_logout_correct_path','stale_cache_reload_after_mutation','BLOCKED','tab1 Log out not reachable',[]); }
  else{
    await q1.mouse.click(r1.x,r1.y); await sleep(3200);
    const s1=await lsDump(q1);
    console.log('tab1 post-logout token len:',String(s1['flutter.auth_token']??'').length);
    await clickBtn(q2,'Account'); await sleep(1700);
    const staleView=await dumpTxt(q2);
    const evA=await shot(q2,'34-stale-tab-account-pre-reload');
    await q2.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(q2,'Buy now',45000).catch(()=>{}); await sleep(2200);
    const sAfter=await lsDump(q2);
    await clickBtn(q2,'Account'); await sleep(1900);
    const tAcc2=await dumpTxt(q2);
    const evB=await shot(q2,'35-tab2-hardreload-after-correct-cross-logout');
    rec('cross_tab_logout_correct_path_then_hard_reload','stale_cache_reload_after_mutation',
      (!(sAfter['flutter.auth_token']>10) && tAcc2.includes('Welcome back'))?'HELD':'BROKEN',
      `tab1 logged out via visible button (residualTokenLen=${String(s1['flutter.auth_token']??'').length}); tab2 pre-reload AccountView(stale)=${staleView.includes('My account')}; tab2 hard-reload -> tokenLen=${String(sAfter['flutter.auth_token']??'').length}, accountShowsLogin=${tAcc2.includes('Welcome back')}`,[evA,evB]);
  }
  console.log('\nSTAGE9_DONE');
  await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e&&e.stack||e);process.exit(2);});
