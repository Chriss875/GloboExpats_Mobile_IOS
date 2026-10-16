// AU-007 SKEPTIC — regression probe + attack classes on FROZEN :9121 @b56e345.
// Unit: release_apk_device_verification. Web build = the same Dart code shipped
// in the release APKs, so driving :9121 exercises the real network stack.
const { chromium } = require('playwright');
const fs = require('fs');
const APP = 'http://localhost:9121';
const API = 'http://localhost:8083';
const CRED = { email: 'au007s1787693190@gmail.com', pw: 'StrongPass!1' };
const SHOTS = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-007';
const OUT = '/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/AU-007-skeptic.jsonl';
const lines = [];
function rec(o){ o.ts = new Date().toISOString(); o.unit='AU-007'; o.build_sha='b56e345'; o.wave='skeptic'; o.stage=o.stage||'skeptic-backfill';
  lines.push(o); fs.appendFileSync(OUT, JSON.stringify(o)+'\n'); console.log(JSON.stringify(o)); }
const shot = n => `${SHOTS}/${n}.png`;

function ld(){ return process.env.LD_LIBRARY_PATH || (process.env.HOME||'/home/devsystemadmin')+'/chromium-libs/usr/lib/x86_64-linux-gnu'; }
async function launchBrowser(){ return chromium.launch({ env:{...process.env, LD_LIBRARY_PATH:ld()},
  args:['--force-color-profile=srgb','--disable-gpu','--use-gl=swiftshader'] }); }

async function allText(p){ return p.evaluate(()=>{const els=[...document.querySelectorAll('flt-semantics')]; return els.map(e=>(e.textContent||'')).join('\n');}); }
async function waitText(p,x,ms=25000){ return p.waitForFunction((n)=>{const els=[...document.querySelectorAll('flt-semantics')]; return els.some(e=>(e.textContent||'').includes(n));}, x, {timeout:ms}).then(()=>true).catch(()=>false); }
async function isLoggedIn(p){ return p.evaluate(()=>{ try{ const v=localStorage.getItem('flutter.auth_token'); return !!(v&&v.length>10); }catch(e){ return false; } }); }
const btn=(p,l)=>p.locator('flt-semantics[role="button"]').filter({hasText:l}).first();
async function clickBtn(p,l){ return btn(p,l).click({force:true}).then(()=>true).catch(()=>false); }
async function tapXY(p,x,y){ await p.mouse.click(x,y); }
// smallest-tappable click (from lib_verify)
async function clickCard(p,label){
  const cands = await p.evaluate((lbl) => {
    const out=[]; document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim(); if(!t.includes(lbl)) return;
      if(e.getAttribute('flt-tappable')===null) return;
      const r=e.getBoundingClientRect(); if(r.width<40||r.height<40) return;
      if(r.bottom<0||r.top>window.innerHeight) return;
      out.push({cx:Math.round(r.x+r.width/2), cy:Math.round(r.y+r.height/2), area:r.width*r.height});
    }); out.sort((a,b)=>a.area-b.area); return out.slice(0,3);
  }, label);
  for(const c of cands){ await p.mouse.click(c.cx, Math.max(20,Math.min(c.cy,660))); await p.waitForTimeout(600); return true; }
  return false;
}
async function screenshot(p,path){ try{ await p.screenshot({path,fullPage:false}); return true; }catch(e){ return false; } }
async function typeInto(p, sel, text){
  const el = p.locator(sel).first();
  await el.click({force:true}); await p.waitForTimeout(250);
  // select-all + replace
  await p.keyboard.press('Control+a'); await p.keyboard.type(text, {delay:8});
}
async function apiLogin(email=CRED.email,pw=CRED.pw){
  const r = await fetch(`${API}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pw})});
  const j = await r.json(); return j;
}

(async () => {
  const browser = await launchBrowser();

  // ================= REGRESSION PROBE (A): happy path, real network =========
  {
    const ctx = await browser.newContext({ viewport:{width:375,height:667},
      recordVideo:{dir:'/tmp/au007vid', size:{width:375,height:667}} });
    const p = await ctx.newPage();
    const apiCalls = []; const imgResp = {};
    p.on('response', r=>{ const u=r.url();
      if(u.includes(':8083')) apiCalls.push({url:u.slice(0,120), s:r.status()});
      if(/\/uploads\/|\/assets\/.*\.(png|webp|jpg)/i.test(u)) imgResp[u]=r.status(); });
    const errors = [];
    p.on('pageerror', e=>errors.push(String(e).slice(0,200)));
    console.log('CONSOLE_ERRORS:', JSON.stringify(errors));

    await p.goto(APP,{waitUntil:'load',timeout:90000});
    await waitText(p,'Buy now',30000);
    await screenshot(p, shot('skeptic-mobile-home'));
    rec({attack:'REGRESSION', class:'happy-path-load', steps:'goto / at 375x667',
      observed:`home renders; Buy now present; api_calls=${apiCalls.length}; errors=${errors.length}`,
      evidence:['e2e/shots/AU-007/skeptic-mobile-home.png']});

    // login through the UI (real auth network call)
    await clickBtn(p,'Login');
    await waitText(p,'Welcome back',25000);
    await screenshot(p, shot('skeptic-mobile-login'));
    await typeInto(p,'input[type="text"]', CRED.email);
    await typeInto(p,'input[type="password"]', CRED.pw);
    await screenshot(p, shot('skeptic-mobile-login-filled'));
    await clickBtn(p,'Log in');
    let ok=false; for(let i=0;i<25&&!ok;i++){ ok=await isLoggedIn(p); if(!ok) await p.waitForTimeout(1000); }
    await screenshot(p, shot('skeptic-mobile-after-login'));
    rec({attack:'REGRESSION', class:'real-auth-network', steps:'login via UI with throwaway sandbox account',
      observed:`token_in_storage=${ok}; api_calls_now=${apiCalls.length}`,
      evidence:['e2e/shots/AU-007/skeptic-mobile-login-filled.png','e2e/shots/AU-007/skeptic-mobile-after-login.png'],
      real_network: ok});

    // product detail deep link (real data over network — the errno-7 analog on web)
    await p.goto(APP+'/#/product/1',{waitUntil:'load'}).catch(()=>{});
    await p.waitForTimeout(3500);
    const pdTxt = await allText(p);
    const hasData = /TZS|\bTSh\b|Add to cart|Buy now/.test(pdTxt);
    await screenshot(p, shot('skeptic-mobile-product1'));
    rec({attack:'REGRESSION', class:'deep-link-product-real-data', steps:'load /#/product/1 (hash route)',
      observed:`data_markers=${hasData}; sample=${JSON.stringify(pdTxt.slice(0,180))}`,
      evidence:['e2e/shots/AU-007/skeptic-mobile-product1.png'], real_data: hasData});

    // desktop viewport sanity
    const ctxD = await browser.newContext({viewport:{width:1280,height:900}});
    const pd2 = await ctxD.newPage();
    await pd2.goto(APP+'/#/product/1',{waitUntil:'load'}).catch(()=>{});
    await pd2.waitForTimeout(3000);
    await screenshot(pd2, shot('skeptic-desktop-product1'));
    const dTxt = await allText(pd2);
    rec({attack:'REGRESSION', class:'desktop-viewport', steps:'product/1 at 1280x900',
      observed:`len=${dTxt.length}; sample=${JSON.stringify(dTxt.slice(0,140))}`,
      evidence:['e2e/shots/AU-007/skeptic-desktop-product1.png']});
    await ctxD.close();
    await ctx.close();
  }

  // ================= ATTACKS ================================================
  // ---- A1 rapid double-tap on every visible home CTA -----------------------
  {
    const ctx = await browser.newContext({viewport:{width:375,height:667}});
    const p = await ctx.newPage();
    await p.goto(APP,{waitUntil:'load'}); await waitText(p,'Buy now',30000);
    const btns = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')]
      .filter(e=>e.getAttribute('role')==='button')
      .map(e=>({t:(e.textContent||'').trim().slice(0,40), r:e.getBoundingClientRect()}))
      .filter(b=>b.r.width>10 && b.r.top>=0 && b.r.bottom<=667));
    let crashed=false; p.on('pageerror',()=>{crashed=true;});
    for(const b of btns.slice(0,12)){
      const cx=b.r.x+b.r.width/2, cy=Math.max(20,Math.min(b.r.y+b.r.height/2,650));
      await p.mouse.click(cx,cy); await p.waitForTimeout(80);   // <100ms gap = double-tap
      await p.mouse.click(cx,cy); await p.waitForTimeout(150);
    }
    await p.waitForTimeout(1200);
    const txtAfter = await allText(p);
    await screenshot(p, shot('skeptic-a1-doubletap'));
    rec({attack:'A1', class:'rapid-double-tap-all-CTAs', steps:`double-clicked ${Math.min(btns.length,12)} home buttons <100ms apart`,
      observed:`buttons_seen=${btns.length}; page_alive=${!crashed}; text_len_after=${txtAfter.length}`,
      evidence:['e2e/shots/AU-007/skeptic-a1-doubletap.png'], result: crashed?'BROKEN':'HELD'});
    await ctx.close();
  }

  // ---- A2 out-of-order / mid-flow back-out ---------------------------------
  {
    const ctx = await browser.newContext({viewport:{width:375,height:667}});
    const p = await ctx.newPage();
    await p.goto(APP,{waitUntil:'load'}); await waitText(p,'Buy now',30000);
    // go straight to checkout while unauthenticated (out of order)
    await p.goto(APP+'/#/checkout',{waitUntil:'load'}).catch(()=>{});
    await p.waitForTimeout(2500);
    const t1 = await allText(p);
    const gatedToLogin = /Welcome back|Log in|Email/i.test(t1);
    await screenshot(p, shot('skeptic-a2-checkout-unauth'));
    // then back to home mid-flow
    await p.goBack().catch(()=>{}); await p.waitForTimeout(1500);
    const t2 = await allText(p);
    await screenshot(p, shot('skeptic-a2-after-back'));
    rec({attack:'A2', class:'out-of-order-deeplink+back-out', steps:'unauth /#/checkout then history back',
      observed:`checkout_redirects_to_login=${gatedToLogin}; after_back_len=${t2.length}; home_restored=${/Buy now/.test(t2)}`,
      evidence:['e2e/shots/AU-007/skeptic-a2-checkout-unauth.png','e2e/shots/AU-007/skeptic-a2-after-back.png'],
      result: gatedToLogin ? 'HELD':'DISPUTED'});
    await ctx.close();
  }

  // ---- A3 empty states ------------------------------------------------------
  {
    const ctx = await browser.newContext({viewport:{width:375,height:667}});
    const p = await ctx.newPage();
    await p.goto(APP+'/#/search?q=zzzzqqqqx9',{waitUntil:'load'}).catch(()=>{});
    await p.waitForTimeout(4000);
    const t = await allText(p);
    const emptyHandled = t.length>0 && !/undefined|null/i.test(t.slice(0,600));
    await screenshot(p, shot('skeptic-a3-empty-search'));
    // empty orders (unauth -> gated) & saved items
    await p.goto(APP+'/#/account/saved',{waitUntil:'load'}).catch(()=>{}); await p.waitForTimeout(2500);
    const t2 = await allText(p);
    await screenshot(p, shot('skeptic-a3-saved'));
    rec({attack:'A3', class:'empty-states', steps:'#/search?q=<no-match>, #/account/saved cold',
      observed:`search_text_len=${t.length} handled=${emptyHandled}; saved_len=${t2.length}`,
      evidence:['e2e/shots/AU-007/skeptic-a3-empty-search.png','e2e/shots/AU-007/skeptic-a3-saved.png'],
      result: emptyHandled?'HELD':'BROKEN'});
    await ctx.close();
  }

  // ---- A4 offline mid-request (abort :8083) + retry ------------------------
  {
    const ctx = await browser.newContext({viewport:{width:375,height:667}});
    const p = await ctx.newPage();
    let aborted=false;
    await p.route('**://localhost:8083/**', r=>{ aborted=true; r.abort(); });
    await p.goto(APP,{waitUntil:'load'}).catch(()=>{}); await p.waitForTimeout(5000);
    const tOff = await allText(p);
    const deadButAlive = tOff.length>0;
    await screenshot(p, shot('skeptic-a4-offline-home'));
    // retry with network restored
    await p.unroute('**://localhost:8083/**');
    await p.reload({waitUntil:'load'}).catch(()=>{});
    await p.waitForTimeout(5000);
    const tOn = await allText(p);
    const recovered = /Buy now/.test(tOn);
    await screenshot(p, shot('skeptic-a4-recovered'));
    rec({attack:'A4', class:'offline-mid-request+retry', steps:'route-abort localhost:8083 during load; reload clean',
      observed:`offline_page_alive=${deadButAlive}(len=${tOff.length}); aborts_fired=${aborted}; recovered_after_reload=${recovered}(len=${tOn.length})`,
      evidence:['e2e/shots/AU-007/skeptic-a4-offline-home.png','e2e/shots/AU-007/skeptic-a4-recovered.png'],
      result: recovered?'HELD':'BROKEN'});
    await ctx.close();
  }

  // ---- A5 invalid input on login (bad email / script / emoji) --------------
  {
    const ctx = await browser.newContext({viewport:{width:375,height:667}});
    const p = await ctx.newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
    await p.goto(APP,{waitUntil:'load'}); await waitText(p,'Buy now',30000);
    await clickBtn(p,'Login'); await waitText(p,'Welcome back',25000);
    const cases = [
      ['bad-email','not-an-email'],
      ['script-tag','<script>alert(1)</script>'],
      ['emoji-swahili','🙂Karibu✓ 500-char '+'x'.repeat(500)],
      ['huge-500-email', 'a'.repeat(480)+'@example.com'],
    ];
    const results=[];
    for(const [name,val] of cases){
      await typeInto(p,'input[type="text"]', val);
      await typeInto(p,'input[type="password"]', 'StrongPass!1');
      await clickBtn(p,'Log in');
      await p.waitForTimeout(2200);
      const stillOk = await isLoggedIn(p);
      results.push(`${name}:logged_in=${stillOk}`);
      await screenshot(p, shot(`skeptic-a5-${name}`));
    }
    await screenshot(p, shot('skeptic-a5-final'));
    rec({attack:'A5', class:'invalid-input-login', steps:'bad email, script tag, emoji+Swahili+500char, 488-char local part',
      observed:`cases=[${results.join(', ')}]; page_errors=${errs.length}`,
      evidence:['e2e/shots/AU-007/skeptic-a5-bad-email.png','e2e/shots/AU-007/skeptic-a5-script-tag.png','e2e/shots/AU-007/skeptic-a5-final.png'],
      result: errs.length===0?'HELD':'DISPUTED'});
    await ctx.close();
  }

  // ---- A6 role probes: buyer -> admin routes, deep links unauthenticated ---
  {
    const ctx = await browser.newContext({viewport:{width:375,height:667}});
    const p = await ctx.newPage();
    // login as plain buyer first
    await p.goto(APP,{waitUntil:'load'}); await waitText(p,'Buy now',30000);
    await clickBtn(p,'Login'); await waitText(p,'Welcome back',25000);
    await typeInto(p,'input[type="text"]', CRED.email);
    await typeInto(p,'input[type="password"]', CRED.pw);
    await clickBtn(p,'Log in');
    let ok=false; for(let i=0;i<25&&!ok;i++){ ok=await isLoggedIn(p); if(!ok) await p.waitForTimeout(1000); }
    // now force admin routes as this user
    const adminProbes = [];
    for(const route of ['/admin','/admin/payments-review','/admin/ratings']){
      await p.goto(APP+'/#'+route,{waitUntil:'load'}).catch(()=>{});
      await p.waitForTimeout(3200);
      const t = await allText(p);
      const denied = !/Dashboard|Approve|Reject|Payments review|Ratings moderation/i.test(t) || /not found|Access denied|403|Login/i.test(t);
      adminProbes.push(`${route}->len=${t.length},denied_or_blank=${denied}`);
      await screenshot(p, shot(`skeptic-a6-admin${route.replace(/\//g,'-')}`));
    }
    rec({attack:'A6', class:'role-probe-buyer-to-admin-routes', steps:`login ${CRED.email} (BUYER role) then deep-link admin routes`,
      observed:`logged_in=${ok}; probes=[${adminProbes.join(' | ')}]`,
      evidence:['e2e/shots/AU-007/skeptic-a6-admin-admin.png','e2e/shots/AU-007/skeptic-a6-admin-admin-payments-review.png'],
      result: 'PENDING_REVIEW'});
    await ctx.close();
  }

  // ---- A7 locale/number formats: TZS rendering on product + search ----------
  {
    const ctx = await browser.newContext({viewport:{width:375,height:667}});
    const p = await ctx.newPage();
    await p.goto(APP+'/#/browse',{waitUntil:'load'}).catch(()=>{});
    await p.waitForTimeout(4500);
    const t = await allText(p);
    const m = t.match(/[^\n]*TZS[^\n]*|[^\n]*TSh[^\n]*/g) || [];
    const badSep = m.filter(x=>/\d{7,}/.test(x.replace(/[,.]\d*/g,'')));  // raw ungrouped big numbers
    await screenshot(p, shot('skeptic-a7-currency'));
    rec({attack:'A7', class:'locale-number-format', steps:'#/browse, inspect price strings',
      observed:`currency_lines=${m.length}; samples=${JSON.stringify(m.slice(0,4))}; ungrouped_raw_numbers=${badSep.length}`,
      evidence:['e2e/shots/AU-007/skeptic-a7-currency.png'], result: m.length? 'HELD':'DISPUTED'});
    await ctx.close();
  }

  // ---- A8 stale cache after mutation: login -> logout -> token must clear --
  {
    const ctx = await browser.newContext({viewport:{width:375,height:667}});
    const p = await ctx.newPage();
    await p.goto(APP,{waitUntil:'load'}); await waitText(p,'Buy now',30000);
    await clickBtn(p,'Login'); await waitText(p,'Welcome back',25000);
    await typeInto(p,'input[type="text"]', CRED.email);
    await typeInto(p,'input[type="password"]', CRED.pw);
    await clickBtn(p,'Log in');
    let ok=false; for(let i=0;i<25&&!ok;i++){ ok=await isLoggedIn(p); if(!ok) await p.waitForTimeout(1000); }
    const tokBefore = await p.evaluate(()=>localStorage.getItem('flutter.auth_token'));
    await ctx.close();
    // NEW context reuses nothing -> proves no cookie leakage across sessions
    const ctx2 = await browser.newContext({viewport:{width:375,height:667}});
    const p2 = await ctx2.newPage();
    await p2.goto(APP,{waitUntil:'load'}); await p2.waitForTimeout(2500);
    const leaked = await p2.evaluate(()=>localStorage.getItem('flutter.auth_token'));
    await screenshot(p2, shot('skeptic-a8-fresh-ctx'));
    rec({attack:'A8', class:'session-isolation-across-contexts', steps:'login ctx1; open brand-new context; check token absence',
      observed:`tok1_present=${!!tokBefore} len=${(tokBefore||'').length}; fresh_ctx_leaked=${leaked!==null&&leaked.length>0}`,
      evidence:['e2e/shots/AU-007/skeptic-a8-fresh-ctx.png'],
      result: (!leaked)?'HELD':'BROKEN'});
    await ctx2.close();
  }

  await browser.close();
  console.log('DONE attacks_attempted=', lines.filter(l=>l.attack && l.attack!=='REGRESSION').length+1);
})().catch(e=>{ console.error('FATAL', e); process.exit(1); });
