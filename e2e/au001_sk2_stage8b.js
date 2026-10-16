// STAGE 8b: does the Log out tap even reach AuthStore.logout()? Compare a
// coordinate click on the button's rect vs the semantics-locator force-click.
const {L,APP,rec,shot,sleep,lsDump,dumpTxt,head,fillLogin} = require('./au001_sk2_lib.js');
const {btn,clickBtn}=L;
(async()=>{
  const browser=await L.newBrowser();
  const ctx=await L.newCtx(browser,{viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  await p.goto(APP+'/',{waitUntil:'load',timeout:90000}); await L.waitText(p,'Buy now',45000);
  await p.evaluate(()=>{localStorage.clear();}); await sleep(150);
  await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p,'Buy now',45000); await sleep(1500);
  await clickBtn(p,'Account'); await sleep(1700);
  await fillLogin(p,L.BUYER.email,L.BUYER.pw);
  await btn(p,'Log in').click({force:true}).catch(()=>{});
  let ok=false,w=0; while(!ok&&w<25){ ok=await L.isLoggedIn(p); if(!ok){await sleep(1000);w++;} }
  await sleep(2000);
  console.log('authed:',ok);

  // find the Log out node rect
  const r=await p.evaluate(()=>{
    let hit=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if(hit) return;
      if((e.textContent||'').trim()==='Log out' || (e.textContent||'').includes('Log out')){
        const b=e.getBoundingClientRect();
        if(b.width>10&&b.height>10) hit={x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2),w:b.width,h:b.height};
      }
    });
    return hit;
  });
  console.log('Log out rect:',JSON.stringify(r));
  // scroll to bottom of the list first (button is last child)
  await p.mouse.move(190,400); for(let i=0;i<12;i++){ await p.mouse.wheel(0,400); await sleep(120); }
  await sleep(700);
  const r2=await p.evaluate(()=>{
    let hit=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if(hit) return;
      if((e.textContent||'').trim().includes('Log out')){
        const b=e.getBoundingClientRect();
        if(b.width>10&&b.height>10&&b.bottom>0&&b.top<innerHeight) hit={x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};
      }
    });
    return hit;
  });
  console.log('Log out rect after scroll:',JSON.stringify(r2));
  if(r2){
    await p.mouse.click(r2.x,r2.y);
    await sleep(3500);
    const keys=await lsDump(p); const tv=await dumpTxt(p);
    const ev=await shot(p,'30-coord-click-logout');
    rec('coordinate_click_logout','regression_core_criterion',
      (!(keys['flutter.auth_token']>10)&&tv.includes('Welcome back'))?'HELD':'BROKEN',
      `real coordinate mouse click on "Log out" rect ${JSON.stringify(r2)}: postTokenLen=${String(keys['flutter.auth_token']??'').length}, welcomeBack=${tv.includes('Welcome back')}, viewHead="${head(tv,80)}"`,[ev]);
    // reload check
    await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p,'Buy now',45000).catch(()=>{}); await sleep(2000);
    const k2=await lsDump(p);
    await clickBtn(p,'Account'); await sleep(1800);
    const tAcc=await dumpTxt(p);
    const ev2=await shot(p,'31-reload-after-coord-logout');
    rec('reload_after_coord_logout_stays_guest','regression_core_criterion',
      (!(k2['flutter.auth_token']>10)&&tAcc.includes('Welcome back'))?'HELD':'BROKEN',
      `hard reload after coordinate-click logout: tokenLen=${String(k2['flutter.auth_token']??'').length}, accountShowsLogin=${tAcc.includes('Welcome back')}, My account=${tAcc.includes('My account')}`,[ev2]);
  } else { rec('coordinate_click_logout','regression_core_criterion','BLOCKED','Log out node not found on screen after scrolling',[]); }
  await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e&&e.stack||e);process.exit(2);});
