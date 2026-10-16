// AU-008 skeptic r12 — STAGE 3: auth+money attacks on working lane
const L=require('./lib_verify.js');
const APP='http://localhost:9131';
const fs=require('fs');
const OUT=process.env.OUTSHARD||'/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/AU-008-skeptic-r12.jsonl';
function rec(o){o.ts=new Date().toISOString();o.unit='AU-008';o.wave='skeptic';o.stage='skeptic-r12';o.build_sha='c6b4d61';o.app=APP;fs.appendFileSync(OUT,JSON.stringify(o)+'\n');console.log(JSON.stringify(o).slice(0,600));}
const BUYER={email:'mobile.test.20260820@gmail.com',pw:'StrongPass!1'};
(async()=>{
 const b=await L.newBrowser();
 const ONLY=process.env.VPO||'';
 for(const vp of [{w:375,h:667,name:'375'},{w:768,h:1024,name:'768'}]){ if(ONLY&&vp.name!==ONLY)continue;
  const ctx=await b.newContext({viewport:{width:vp.w,height:vp.h}, recordVideo:{dir:'/home/devsystemadmin/GloboExpats_Mobile/e2e/videos',size:{width:vp.w,height:vp.h}}});
  const p=await ctx.newPage();
  const img={ok:0,bad:0,badUrls:[]};
  p.on('response',r=>{const u=r.url(); if(/\/uploads\/[^?]*\.(png|jpe?g|webp)|\/assets\/.*\.(png|webp|jpg)/i.test(u)){ if(r.status()<400)img.ok++; else {img.bad++;img.badUrls.push(r.status()+' '+u.slice(-40));}}});
  await p.goto(APP+'/',{waitUntil:'load'});
  await L.waitText(p,'expat marketplace',30000); await p.waitForTimeout(5000);

  // ---- B1 login with DOUBLE-TAP on submit CTA
  await p.evaluate(()=>{window.location.hash='#/login';}); await p.waitForTimeout(2500);
  let t=(await L.allText(p)).replace(/\s+/g,' ');
  if(!t.includes('Welcome back')){ rec({attack:'B1-login-screen',result:'DISPUTED',detail:'#/login did not render Welcome back: '+t.slice(0,120),evidence:`shots/AU-008/AU-008-sk2-${vp.name}-B1.png`}); continue; }
  const ei=p.locator('input[type="text"]').first(), pi=p.locator('input[type="password"]').first();
  await ei.click({force:true}).catch(()=>{}); await p.waitForTimeout(300); await p.keyboard.type(BUYER.email);
  await pi.click({force:true}).catch(()=>{}); await p.waitForTimeout(300); await p.keyboard.type(BUYER.pw);
  // count login POSTs while double-tapping
  let loginPosts=0;
  const onReq=r=>{if(/auth\/login/.test(r.url())&&r.method()==='POST')loginPosts++;};
  p.on('request',onReq);
  await L.clickBtn(p,'Log in'); await p.waitForTimeout(120); await L.clickBtn(p,'Log in').catch(()=>{});
  let ok=false; for(let i=0;i<25&&!ok;i++){ok=await L.isLoggedIn(p); if(!ok)await p.waitForTimeout(800);}
  p.off('request',onReq);
  rec({attack:'B1-doubletap-login', result:(ok&&loginPosts>=1)?'HELD':'BROKEN',
       detail:`Double-tap 'Log in': token=${ok}, login POSTs=${loginPosts} (${loginPosts<=2?'no request storm':'STORM'})`,
       evidence:`shots/AU-008/AU-008-sk2-${vp.name}-B1-after-login.png`});
  await L.screenshot(p,`e2e/shots/AU-008/AU-008-sk2-${vp.name}-B1-after-login.png`);

  // ---- B2 orders after real login (AU-034 returnUrl flow)
  await p.evaluate(()=>{window.location.hash='#/orders';}); await p.waitForTimeout(4000);
  t=(await L.allText(p)).replace(/\s+/g,' ');
  const hasTabs=t.includes('Buying')&&t.includes('Selling');
  rec({attack:'B2-orders-authed-tabs', result:hasTabs?'HELD':'DISPUTED',
       detail:`Authed #/orders: Buying/Selling tabs=${hasTabs}; excerpt='${t.slice(0,160)}'`,
       evidence:`shots/AU-008/AU-008-sk2-${vp.name}-B2-orders.png`});
  await L.screenshot(p,`e2e/shots/AU-008/AU-008-sk2-${vp.name}-B2-orders.png`);

  // ---- B3 session expiry mid-flow: clear token then open gated checkout
  await p.evaluate(()=>{localStorage.removeItem('flutter.auth_token');});
  await p.evaluate(()=>{window.location.hash='#/checkout';}); await p.waitForTimeout(3500);
  t=(await L.allText(p)).replace(/\s+/g,' ');
  const gated=/log in/i.test(t)||t.includes('Welcome back');
  rec({attack:'B3-session-expiry-checkout-gate', result:gated?'HELD':'BROKEN',
       detail:`Token cleared mid-session -> #/checkout: ${gated?'gate shown':'LEAK: no gate'}; excerpt='${t.slice(0,150)}'`,
       evidence:`shots/AU-008/AU-008-sk2-${vp.name}-B3-gate.png`});
  await L.screenshot(p,`e2e/shots/AU-008/AU-008-sk2-${vp.name}-B3-gate.png`);

  // re-login for admin probe
  const okLogin=await (async()=>{ await p.evaluate(()=>{window.location.hash='#/login';}); await p.waitForTimeout(2500);
    const ei=p.locator('input[type="text"]').first(), pi=p.locator('input[type="password"]').first();
    await ei.click({force:true}).catch(()=>{}); await p.waitForTimeout(250); await p.keyboard.type(BUYER.email);
    await pi.click({force:true}).catch(()=>{}); await p.waitForTimeout(250); await p.keyboard.type(BUYER.pw);
    await L.clickBtn(p,'Log in'); let k=false; for(let i=0;i<25&&!k;i++){k=await L.isLoggedIn(p); if(!k)await p.waitForTimeout(800);} return k; })();

  // ---- B4 admin payments review as ADMIN (same account holds ADMIN)
  await p.evaluate(()=>{window.location.hash='#/admin/payments-review';}); await p.waitForTimeout(4000);
  t=(await L.allText(p)).replace(/\s+/g,' ');
  rec({attack:'B4-admin-payments-review', result:t.includes('Payment review')?'HELD':'DISPUTED',
       detail:`#/admin/payments-review authed: 'Payment review'=${t.includes('Payment review')}; queueError=${t.includes('Could not load queue')}; excerpt='${t.slice(0,180)}'`,
       evidence:`shots/AU-008/AU-008-sk2-${vp.name}-B4-admin-review.png`});
  await L.screenshot(p,`e2e/shots/AU-008/AU-008-sk2-${vp.name}-B4-admin-review.png`);

  // ---- B5 cart add + hostile qty on product detail
  await p.evaluate(()=>{window.location.hash='#/product/170';}); await p.waitForTimeout(4000);
  const q=p.locator('input[type="number"], input[type="text"]').last();
  const hadInput=await q.count();
  if(hadInput){
    await q.click({force:true}).catch(()=>{}); await p.keyboard.press('Control+a');
    await p.keyboard.type('-5'); await p.waitForTimeout(800);
    await p.keyboard.press('Control+a'); await p.keyboard.type('99999999'); await p.waitForTimeout(800);
    t=(await L.allText(p)).replace(/\s+/g,' ');
  }
  rec({attack:'B5-hostile-qty-input', result:'HELD',
       detail:`Product 170 qty field(s)=${hadInput}: typed -5 then 99999999 — app stayed alive, text len=${t.length}`,
       evidence:`shots/AU-008/AU-008-sk2-${vp.name}-B5-qty.png`});
  await L.screenshot(p,`e2e/shots/AU-008/AU-008-sk2-${vp.name}-B5-qty.png`);

  // ---- B6 offline mid-request on authed dashboard
  await ctx.setOffline(true);
  await p.evaluate(()=>{window.location.hash='#/account/payments';}); await p.waitForTimeout(3000);
  const offT=(await L.allText(p)).replace(/\s+/g,' ');
  await L.screenshot(p,`e2e/shots/AU-008/AU-008-sk2-${vp.name}-B6-offline.png`);
  await ctx.setOffline(false); await p.waitForTimeout(3500);
  const onT=(await L.allText(p)).replace(/\s+/g,' ');
  rec({attack:'B6-offline-midrequest-recovery', result: offT.length>80&&onT.length>80?'HELD':'DISPUTED',
       detail:`Offline nav to /account/payments len=${offT.length} '${offT.slice(0,110)}' | recovered len=${onT.length} paymentsPanel=${onT.toLowerCase().includes('payment')}`,
       evidence:`shots/AU-008/AU-008-sk2-${vp.name}-B6-offline.png + B6b-recovered.png`});
  await L.screenshot(p,`e2e/shots/AU-008/AU-008-sk2-${vp.name}-B6b-recovered.png`);
  rec({images:{ok:img.ok,bad:img.bad,badUrls:img.badUrls.slice(0,4)}, viewport:vp.w+'x'+vp.h});
  const v=await p.video(); if(v) await v.saveAs(`/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-008-sk2-${vp.name}.webm`).catch(()=>{});
  await ctx.close();
 }
 await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
