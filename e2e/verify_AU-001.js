// AU-001 verifier v2 — handles pre-existing session; full protocol.
const fs = require('fs');
const L = require('./lib_verify.js');
const UNIT = 'AU-001';
const VPS = [{n:'375x667',w:375,h:667},{n:'768x1024',w:768,h:1024}];
const out = { steps: [], images: {}, buttons: [], console: [] };
const log = (s,o)=>{ out.steps.push({step:s,...o}); console.log('STEP',s,JSON.stringify(o)); };
const shot=(vp,st)=>`e2e/shots/${UNIT}/${UNIT}-${vp}-${st}.png`;
async function semText(p){ return p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'')).join('\n')); }
async function hasText(p,t){ try{ return await p.evaluate(x=>[...document.querySelectorAll('flt-semantics')].some(e=>(e.textContent||'').includes(x)),t);}catch(e){return false;} }
async function waitText(p,t,ms=25000){ try{ await p.waitForFunction(x=>[...document.querySelectorAll('flt-semantics')].some(e=>(e.textContent||'').includes(x)),t,{timeout:ms}); return true;}catch(e){return false;} }
async function waitFirstPaint(p,ms=20000){ const t0=Date.now(); while(Date.now()-t0<ms){ const t=await semText(p); if(t.replace(/\s+/g,'').length>40) return true; await p.waitForTimeout(400);} return false; }
async function storage(p){ try{ return await p.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(/^flutter\./.test(k))o[k]=String(localStorage.getItem(k)).length;}return o;});}catch(e){return{err:String(e)}}}
async function listBtns(p){ try{ return await p.evaluate(()=>{const a=[];document.querySelectorAll('flt-semantics').forEach(e=>{const role=e.getAttribute('role'),tap=e.getAttribute('flt-tappable')==='';const t=(e.textContent||'').trim().slice(0,60);if((role==='button'||tap)&&t&&!e.querySelector('input'))a.push({role:role||'tappable',label:t});});document.querySelectorAll('input').forEach(i=>a.push({role:'input',label:i.placeholder||i.type}));return a;});}catch(e){return[{err:String(e)}]} }

async function doLogin(p){
  // assumes Login tab visible with Welcome back
  const ei=p.locator('input[type="text"]').first(), pi=p.locator('input[type="password"]').first();
  await ei.click({force:true,timeout:15000}); await p.waitForTimeout(400); await p.keyboard.type(L.BUYER.email);
  await pi.click({force:true,timeout:15000}); await p.waitForTimeout(400); await p.keyboard.type(L.BUYER.pw);
  await L.clickBtn(p,'Log in');
  return await waitText(p,'My account',25000);
}

(async()=>{
  const browser = await L.newBrowser();
  for(const vp of VPS){
    const vdir=`/tmp/wf-videos-AU-001/${vp.n}`; fs.mkdirSync(vdir,{recursive:true});
    const ctx = await browser.newContext({viewport:{width:vp.w,height:vp.h},recordVideo:{dir:vdir,size:{width:vp.w,height:vp.h}}});
    const p = await ctx.newPage();
    const imgs={}; p.on('response',r=>{const u=r.url(); if(/\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgs[u]=r.status();});
    p.on('pageerror',e=>out.console.push(vp.n+' pageerror: '+e.message));
    p.on('console',m=>{ if(m.type()==='error') out.console.push(vp.n+' console: '+m.text().slice(0,180)); });

    // ---- S0 fresh profile: clear storage then load
    await p.goto(L.APP,{waitUntil:'load',timeout:90000}).catch(()=>{});
    await p.evaluate(()=>localStorage.clear()).catch(()=>{});
    await p.goto(L.APP,{waitUntil:'load',timeout:90000}).catch(()=>{});
    const painted0 = await waitFirstPaint(p,30000);
    await p.waitForTimeout(1500);
    const homeTxt = await semText(p);
    await L.screenshot(p, shot(vp.n,'00-home-logged-out'));
    log('S0_home',{vp:vp.n,paint:painted0,textSample:homeTxt.replace(/\s+/g,' ').slice(0,300)});

    // ---- S1 login via UI
    let signed=false;
    if(await hasText(p,'My account')) { signed=true; log('S1_login',{vp:vp.n,note:'already signed in'}); }
    else {
      const openedLogin = await L.clickBtn(p,'Login');
      const wb = await waitText(p,'Welcome back',20000) || await hasText(p,'Email');
      await p.waitForTimeout(800);
      try { signed = await doLogin(p); } catch(e){ log('S1_login',{vp:vp.n,err:String(e).slice(0,160)}); }
      log('S1_login',{vp:vp.n,openedLogin,welcomeBack:wb,signedIn:signed});
    }
    await p.waitForTimeout(1200);
    const emailVis = await hasText(p,L.BUYER.email);
    await L.screenshot(p,shot(vp.n,'02-signed-in'));
    log('S1b_signed',{vp:vp.n,emailVisible:emailVis});

    // ---- S2 reload persistence
    await p.reload({waitUntil:'load'});
    const painted = await waitFirstPaint(p,20000);
    await p.waitForTimeout(2500);
    const myAcct = await hasText(p,'My account');
    const emailRl = await hasText(p,L.BUYER.email);
    await L.screenshot(p,shot(vp.n,'03-after-reload'));
    log('S2_reload',{vp:vp.n,firstPaint:painted,myAccount:myAcct,email:emailRl});

    // ---- S3 storage keys
    log('S3_storage',{vp:vp.n,...await storage(p)});
    out.buttons.push({vp:vp.n,state:'account',items:await listBtns(p)});

    // ---- S5 logout via UI
    const clickedLogout = await L.clickBtn(p,'Log out');
    await p.waitForTimeout(2500);
    const backToLogin = (await hasText(p,'Welcome back')) || !(await hasText(p,'My account'));
    await L.screenshot(p,shot(vp.n,'04-after-logout'));
    log('S5_logout',{vp:vp.n,clickedLogout,backToLogin,storageAfter:await storage(p)});

    // ---- S6 dead-token deep-link guard
    await p.evaluate(()=>localStorage.setItem('flutter.auth_token','garbage')).catch(()=>{});
    await p.goto(L.APP+'/checkout',{waitUntil:'load'});
    const painted2 = await waitFirstPaint(p,20000);
    await p.waitForTimeout(3500);
    const urlNow=p.url();
    const notAuthed = !(await hasText(p,'My account'));
    const loginShown = (await hasText(p,'Welcome back')) || (await hasText(p,'Log in'));
    await L.screenshot(p,shot(vp.n,'05-deadtoken-guard'));
    log('S6_guard',{vp:vp.n,firstPaint:painted2,url:urlNow,notAuthed,loginShown});

    // ---- S7 resume
    let resumed=false;
    try{
      const onLoginForm = await hasText(p,'Welcome back') || (await p.locator('input[type="password"]').count()>0);
      if(onLoginForm){ resumed = await doLogin(p); }
      else { resumed = await hasText(p,'My account'); }
    }catch(e){ log('S7_resume',{vp:vp.n,err:String(e).slice(0,160)}); }
    await p.waitForTimeout(4500);
    const urlAfter=p.url();
    const checkoutUi = /\/checkout/.test(urlAfter) || (await hasText(p,'Checkout'));
    await L.screenshot(p,shot(vp.n,'06-resume-checkout'));
    log('S7_resume',{vp:vp.n,resumed,urlAfter,checkoutUi,storage:await storage(p)});

    out.images[vp.n]=imgs;
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync('/tmp/au001-out.json',JSON.stringify(out,null,2));
  console.log('DONE');
})().catch(e=>{console.error('FATAL',String(e).slice(0,500));process.exit(1);});
