// AU-006 SKEPTIC r12f — click-sweep EVERY control on EVERY screen,
// frozen bundle :9131 (c6b4d61), both viewports.
// Detection: EXACT-label smallest visible node -> coordinate click ->
// response = screenshot-bytes differ OR hash changed OR toast band found
// (screenshot compare catches snackbars/dialogs/sheets that a11y text misses;
// identical-length PNGs are compared byte-wise).
const lib = require('./lib_verify.js');
const fs = require('fs'); const path = require('path');
process.chdir(path.join(__dirname, '..'));

const ROUTES = [
  '/', '/browse', '/search?q=phone', '/category/electronics', '/product/101',
  '/seller/2', '/cart', '/orders', '/login', '/register',
  '/reset-password', '/verify-email', '/account/settings', '/account/addresses',
  '/account/payment-methods', '/notifications', '/help', '/faq', '/about',
  '/contact', '/privacy', '/terms', '/expat/dashboard', '/sell', '/insights',
  '/admin', '/saved-items', '/requests',
];
const VPS = [{ n:'mobile', w:375, h:667 }, { n:'tablet', w:768, h:1024 }];
const CAP = Number(process.env.CAP || 26);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const routes = ONLY ? ONLY : ROUTES;
const OUTFILE = 'e2e/results/shards/raw-AU-006-sk2-r12.jsonl';
function rec(o){ fs.appendFileSync(OUTFILE, JSON.stringify(o)+'\n'); }

async function makeEnv(browser, armRoute){
  const vp = VPS[Number(process.env.VPI||0)];
  const b = await browser.newContext({ viewport:{width:vp.w,height:vp.h} });
  const p = await b.newPage();
  let extHits=0; const urls=[];
  if (armRoute) {
    // intercept only non-app, non-CDN traffic (wa.me / tel: / matomo ...)
    await b.route(/^(?!http:\/\/localhost:9131|https:\/\/www\.gstatic\.com|https:\/\/fonts\.gstatic\.com|http:\/\/localhost:8083|http:\/\/localhost:8084)/,
      async r => { try{ extHits++; urls.push(r.url().slice(0,80)); await r.fulfill({status:200, body:'', contentType:'text/plain'}); }catch(e){} });
  }
  return { b, p, ext:()=>extHits, urls, resetExt:()=>{extHits=0;urls.length=0;} };
}
async function boot(p){
  for (let a=0;a<2;a++){
    try { await p.goto('http://localhost:9131/#/', { waitUntil:'load', timeout:60000 }); } catch(e){}
    for (let w=0;w<10;w++){
      try { if (await p.evaluate(()=>!!document.querySelector('flt-semantics'))){ await p.waitForTimeout(2500); return true; } }
      catch(e){}
      await p.waitForTimeout(1000);
    }
  }
  return false;
}
// navigate + wait until the a11y tree STABILIZES (two consecutive identical reads)
async function navSettled(p, route, settleMs=1400){
  for (let a=0;a<3;a++){
    try { await p.evaluate((r)=>{ window.location.hash = '#' + r; }, route); break; }
    catch(e){ await p.waitForTimeout(600); }
  }
  const t0=Date.now();
  let prev=null;
  while(Date.now()-t0 < settleMs+4000){
    let cur=null;
    try { cur = await lib.allText(p); } catch(e){ return; }
    if (prev!==null && cur===prev) break;
    prev=cur;
    await p.waitForTimeout(500);
  }
  await p.waitForTimeout(300);
}
function bufDiffers(a,b){ if(a.length!==b.length) return true; for(let i=0;i<a.length;i+=997){ if(a[i]!==b[i]) return true; } return false; }

(async () => {
  const browser = await lib.newBrowser();
  fs.mkdirSync('e2e/shots/AU-006', { recursive:true });

  for (let vi=0; vi<VPS.length; vi++){
    process.env.VPI=String(vi);
    const vp=VPS[vi];
    let env = await makeEnv(browser, false);
    let authed=false;
    try {
      authed = await boot(env.p) && await lib.login(env.p, lib.BUYER);
      if(!authed){ await boot(env.p); authed = await lib.login(env.p, lib.BUYER); }
    } catch(e){ rec({vp:vp.n, kind:'auth-error', err:String(e.message).slice(0,120)}); }
    rec({vp:vp.n, kind:'auth', ok:authed});

    let consecutiveFails=0;
    for (const route of routes){
      if (consecutiveFails>=3){ rec({vp:vp.n, kind:'abort-3-fails'}); break; }
      let dead=[], responded=[], total=0;
      try {
        let alive=false;
        try{ alive=await env.p.evaluate(()=>!!document.querySelector('flt-semantics')); }catch(e){}
        if(!alive){ try{await env.b.close();}catch(_){} env=await makeEnv(browser, true);
          if(!(await boot(env.p)) || !(await lib.login(env.p, lib.BUYER))) throw new Error('reboot/login failed'); }
        if(!(await lib.isLoggedIn(env.p))) authed = await lib.login(env.p, lib.BUYER);

        await navSettled(env.p, route);
        // enumerate VISIBLE, exact-labeled controls (dedup by label+kind)
        const CAPN = CAP;
        const list = await env.p.evaluate((capN)=>{
          const out=[];
          document.querySelectorAll('flt-semantics').forEach(e=>{
            const role=e.getAttribute('role'); const tap=e.getAttribute('flt-tappable');
            if(role!=='button' && tap===null) return;
            const r=e.getBoundingClientRect();
            if(r.width<8||r.height<8) return;
            if(r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth) return;
            out.push({kind:role==='button'?'b':'c', label:(e.textContent||'').trim(),
                      cx:Math.round(r.x+r.width/2), cy:Math.round(r.y+r.height/2),
                      area:r.width*r.height});
          });
          out.sort((a,b)=>a.area-b.area);
          const seen=new Set(); const res=[];
          for(const o of out){ const k=o.kind+'|'+o.label; if(seen.has(k)||!o.label) continue; seen.add(k); res.push(o); }
          return res.slice(0, capN);
        }, CAPN);
        total=list.length;
        await lib.screenshot(env.p, `e2e/shots/AU-006/AU-006-sk2-${vp.n}-${route.replace(/[^a-z0-9]+/gi,'_')}-initial.png`);
        for (let i=0;i<total;i++){
          const ctl=list[i];
          const key=ctl.kind+':'+ctl.label.slice(0,50);
          try {
            await navSettled(env.p,'/');
            await navSettled(env.p,route);
            env.resetExt();
            const s0=(await env.p.screenshot()).toString('base64');
            await env.p.mouse.click(Math.max(2,Math.min(ctl.cx, vp.w-2)), Math.max(2,Math.min(ctl.cy, vp.h-2)));
            await env.p.waitForTimeout(900);
            const u1=await urlHash(env.p);
            const s1=(await env.p.screenshot()).toString('base64');
            const sb=await lib.hasSnackBar(env.p);
            if(s1!==s0 || sb.found) responded.push(key+(sb.found?' [toast]':''));
            else if(env.ext()>0) responded.push(key+' [external]');
            else {
              dead.push(key+' [no-effect]');
              await lib.screenshot(env.p, `e2e/shots/AU-006/AU-006-sk2-${vp.n}-DEAD-${route.replace(/[^a-z0-9]+/gi,'_')}-${i}.png`).catch(()=>{});
            }
          } catch(e){ dead.push(key+' [env-crash]'); }
        }
      } catch(e){
        rec({vp:vp.n, route, kind:'route-fail', err:String(e.message).slice(0,90)});
        console.log(`[${vp.n}] ${route} FAIL`);
        consecutiveFails++;
        continue;
      }
      rec({vp:vp.n, route, total, responded:responded.length, dead});
      console.log(`[${vp.n}] ${route} ctl=${total} ok=${responded.length} dead=${dead.length}`);
      consecutiveFails=0;
    }
    try{ await env.b.close(); }catch(e){}
  }
  await browser.close();
  console.log('SWEEP-DONE');
})();
async function urlHash(p){ try { return await p.evaluate(()=>location.hash); } catch(e){ return '?'; } }
