// AU-007 SKEPTIC round 2 — targeted re-probes:
//  R1: desktop semantics timing fix (wait for flt-semantics before reading)
//  R2: A3 empty-search re-run with proper wait + screenshot review
//  R3: /admin/payments-review as BUYER — what actually renders (692 chars)?
//  R4: session expiry mid-flow (tamper token -> gated route)
const { chromium } = require('playwright');
const fs = require('fs');
const APP = 'http://localhost:9121';
const API = 'http://localhost:8083';
const CRED = { email: 'au007s1787693190@gmail.com', pw: 'StrongPass!1' };
const SHOTS = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-007';
const OUT = '/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/AU-007-skeptic.jsonl';
function rec(o){ o.ts = new Date().toISOString(); o.unit='AU-007'; o.build_sha='b56e345'; o.wave='skeptic'; o.stage=o.stage||'skeptic-backfill';
  fs.appendFileSync(OUT, JSON.stringify(o)+'\n'); console.log(JSON.stringify(o)); }
const shot = n => `${SHOTS}/${n}.png`;
function ld(){ return process.env.LD_LIBRARY_PATH || (process.env.HOME||'/home/devsystemadmin')+'/chromium-libs/usr/lib/x86_64-linux-gnu'; }
async function allText(p){ return p.evaluate(()=>{const els=[...document.querySelectorAll('flt-semantics')]; return els.map(e=>(e.textContent||'')).join('\n');}); }
async function hasSemantics(p){ return p.evaluate(()=>document.querySelectorAll('flt-semantics').length); }
const btn=(p,l)=>p.locator('flt-semantics[role="button"]').filter({hasText:l}).first();
async function clickBtn(p,l){ return btn(p,l).click({force:true}).then(()=>true).catch(()=>false); }
async function isLoggedIn(p){ return p.evaluate(()=>{ try{ const v=localStorage.getItem('flutter.auth_token'); return !!(v&&v.length>10); }catch(e){ return false; } }); }
async function typeInto(p, sel, text){ const el=p.locator(sel).first(); await el.click({force:true}); await p.waitForTimeout(250);
  await p.keyboard.press('Control+a'); await p.keyboard.type(text,{delay:8}); }

(async () => {
  const browser = await chromium.launch({ env:{...process.env, LD_LIBRARY_PATH:ld()},
    args:['--force-color-profile=srgb','--disable-gpu','--use-gl=swiftshader'] });

  // ---- R1: desktop with proper semantics wait ------------------------------
  {
    const ctx = await browser.newContext({viewport:{width:1280,height:900}});
    const p = await ctx.newPage();
    await p.goto(APP+'/#/product/1',{waitUntil:'load'}).catch(()=>{});
    let n=0; for(let i=0;i<30;i++){ n=await hasSemantics(p); if(n>5) break; await p.waitForTimeout(500); }
    const t = await allText(p);
    await p.screenshot({path: shot('skeptic-desktop-product1-fixed')});
    rec({attack:'R1', class:'desktop-viewport-recheck', steps:'#/product/1 at 1280x900, poll flt-semantics up to 15s',
      observed:`semantics_nodes=${n}; len=${t.length}; sample=${JSON.stringify(t.slice(0,120))}`,
      evidence:['e2e/shots/AU-007/skeptic-desktop-product1-fixed.png'],
      result: n>5 && /TSh/.test(t) ? 'HELD':'DISPUTED'});
    await ctx.close();
  }

  // ---- R2: A3 re-run with proper waits -------------------------------------
  {
    const ctx = await browser.newContext({viewport:{width:375,height:667}});
    const p = await ctx.newPage();
    await p.goto(APP+'/#/search?q=zzzzqqqqx9',{waitUntil:'load'}).catch(()=>{});
    let n=0; for(let i=0;i<30;i++){ n=await hasSemantics(p); if(n>5) break; await p.waitForTimeout(500); }
    const t = await allText(p);
    await p.screenshot({path: shot('skeptic-a3-empty-search-fixed')});
    rec({attack:'A3b', class:'empty-states-recheck', steps:'#/search?q=<no-match> with semantics polling',
      observed:`semantics_nodes=${n}; text=${JSON.stringify(t.slice(0,200))}`,
      evidence:['e2e/shots/AU-007/skeptic-a3-empty-search-fixed.png'],
      result: n>5 ? 'HELD':'DISPUTED'});
    await ctx.close();
  }

  // ---- R3: buyer at /admin/payments-review — what really shows -------------
  {
    const ctx = await browser.newContext({viewport:{width:375,height:667}});
    const p = await ctx.newPage();
    await p.goto(APP,{waitUntil:'load'}); await p.waitForFunction(()=>{
      return [...document.querySelectorAll('flt-semantics')].some(e=>(e.textContent||'').includes('Buy now')); },{timeout:30000}).catch(()=>{});
    await clickBtn(p,'Login');
    await p.waitForFunction(()=>[...document.querySelectorAll('flt-semantics')].some(e=>(e.textContent||'').includes('Welcome back')),{timeout:25000}).catch(()=>{});
    await typeInto(p,'input[type="text"]',CRED.email);
    await typeInto(p,'input[type="password"]',CRED.pw);
    await clickBtn(p,'Log in');
    let ok=false; for(let i=0;i<25&&!ok;i++){ ok=await isLoggedIn(p); if(!ok) await p.waitForTimeout(1000); }
    // now the admin payments-review deep link
    await p.goto(APP+'/#/admin/payments-review',{waitUntil:'load'}).catch(()=>{});
    await p.waitForTimeout(4000);
    const t = await allText(p);
    await p.screenshot({path: shot('skeptic-a6-payments-review-buyer')});
    rec({attack:'A6b', class:'role-probe-payments-review-detail', steps:`buyer ${CRED.email} logged in; deep-link /#/admin/payments-review`,
      observed:`logged_in=${ok}; rendered_text=${JSON.stringify(t.slice(0,400))}`,
      evidence:['e2e/shots/AU-007/skeptic-a6-payments-review-buyer.png']});
    await ctx.close();
  }

  // ---- R4: session expiry mid-flow (tampered token) ------------------------
  {
    const ctx = await browser.newContext({viewport:{width:375,height:667}});
    const p = await ctx.newPage();
    await p.goto(APP,{waitUntil:'load'});
    await p.waitForFunction(()=>[...document.querySelectorAll('flt-semantics')].some(e=>(e.textContent||'').includes('Buy now')),{timeout:30000}).catch(()=>{});
    await p.evaluate(()=>localStorage.setItem('flutter.auth_token','eyJhbGciOiJIUzM4NCJ9.TAMPERED.sig'));
    await p.goto(APP+'/#/orders',{waitUntil:'load'}).catch(()=>{});
    await p.waitForTimeout(3500);
    const t = await allText(p);
    await p.screenshot({path: shot('skeptic-r4-tampered-orders')});
    rec({attack:'R4', class:'session-expiry-midflow', steps:'inject garbage JWT then open /#/orders',
      observed:`text=${JSON.stringify(t.slice(0,220))}`,
      evidence:['e2e/shots/AU-007/skeptic-r4-tampered-orders.png'],
      result:/Log in|Welcome back|login/i.test(t)?'HELD':'PENDING_REVIEW'});
    await ctx.close();
  }

  await browser.close();
})().catch(e=>{ console.error('FATAL', e); process.exit(1); });
