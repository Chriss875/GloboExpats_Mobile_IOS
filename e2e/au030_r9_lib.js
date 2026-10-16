// au030_r9_lib.js — RO-lane (:9130) helpers for the AU-030 re-verify wave.
// Login is via REAL API token injection (localStorage flutter.auth_token) —
// no UI login walk, so we never depend on :9100's login flow. Cart is built
// through the REAL UI path (product detail -> choice -> Add to cart).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const APP = 'http://localhost:9130';
const REF = 'http://localhost:3000';
const API = 'http://localhost:8083';

function _ld(){ return process.env.LD_LIBRARY_PATH || process.env.HOME + '/chromium-libs/usr/lib/x86_64-linux-gnu'; }
async function newBrowser(){
  return chromium.launch({ env:{...process.env, LD_LIBRARY_PATH:_ld()},
    args:['--force-color-profile=srgb','--disable-gpu','--use-gl=swiftshader'] });
}
async function newCtx(browser,{viewport={width:375,height:667},videoPath=null}={}){
  return browser.newContext({ viewport,
    recordVideo: videoPath?{dir:path.dirname(path.resolve(videoPath)),size:viewport}:undefined });
}
async function closeVideo(ctx, videoPath){
  try{ const pg = ctx.pages()[0]; const v = pg && await pg.video(); await ctx.close();
    if(v && videoPath) await v.saveAs(videoPath).catch(()=>{}); }catch(e){}
  return videoPath;
}
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function txt(p){ return p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')).catch(()=>''); }
async function txtAll(p){ return p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.getAttribute('aria-label')||'')+'\n'+(e.textContent||'')).join('\n')).catch(()=>''); }
async function nodeCount(p){ return p.evaluate(()=>document.querySelectorAll('flt-semantics').length).catch(()=>0); }
async function waitText(p,n,ms=25000){ return p.waitForFunction((x)=>{const els=[...document.querySelectorAll('flt-semantics')];
  return els.some(e=>(e.textContent||'').includes(x));}, n, {timeout:ms}).then(()=>true).catch(()=>false); }
const btnLoc=(p,l)=>p.locator('flt-semantics[role="button"]',{hasText:l}).last();
async function clickBtnLocator(p,label){
  try{ const loc=btnLoc(p,label); await loc.scrollIntoViewIfNeeded({timeout:6000}).catch(()=>{});
    await loc.click({timeout:8000}); await sleep(700); return true;
  }catch(e){ console.log('click-fail',label,String(e).slice(0,90)); return false; }
}
async function clickCheckbox(p,which){
  const cbs=p.locator('flt-semantics[role="checkbox"]'); const n=await cbs.count().catch(()=>0);
  if(!n) return {clicked:false,checked:null};
  const loc= which==='last'? cbs.nth(n-1): cbs.first();
  try{ await loc.scrollIntoViewIfNeeded({timeout:5000}).catch(()=>{}); const bb=await loc.boundingBox();
    await loc.click({timeout:7000, position:{x:18,y:Math.min(26,(bb?bb.height:40)/2)}});
  }catch(e){ console.log('cb-fail',String(e).slice(0,80)); return {clicked:false,checked:null}; }
  await sleep(800);
  const states=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')]
    .filter(e=>e.getAttribute('role')==='checkbox').map(e=>e.getAttribute('aria-checked')));
  return { clicked:true, checked:(which==='last'?states[states.length-1]:states[0])==='true' };
}
// scroll until a predicate over node rects passes (max ~14 wheel steps)
async function scrollToFind(p,pred,maxSteps=16){
  let hit=null;
  for(let i=0;i<maxSteps;i++){
    hit=await p.evaluate(pred);
    if(hit) return hit;
    await p.mouse.move(187,330); await p.mouse.wheel(0,240); await sleep(200);
  }
  // one upward pass in case we scrolled past
  for(let i=0;i<6;i++){
    hit=await p.evaluate(pred);
    if(hit) return hit;
    await p.mouse.move(187,330); await p.mouse.wheel(0,-260); await sleep(180);
  }
  return null;
}
async function screenshot(p,file){ await p.screenshot({path:file,fullPage:false}).catch(()=>{}); return file; }
function watchImages(p){ const m={}; p.on('response',r=>{const u=r.url();
  if(/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)||/\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) m[u]=r.status();}); return m; }

// ---- real API helpers ----
async function apiLogin(email,pw){
  const r=await fetch(`${API}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,password:pw})});
  const j=await r.json().catch(()=>({}));
  if(!j.token) throw new Error('login failed '+r.status+' '+JSON.stringify(j).slice(0,120));
  return j.token;
}
async function api(token,method,path,body){
  const headers={}; if(token) headers.Authorization='Bearer '+token;
  if(body!==undefined) headers['Content-Type']='application/json';
  const r=await fetch(API+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});
  let j=null; try{j=await r.json();}catch(e){}
  return {status:r.status,json:j,text: j?null:await r.text().catch(()=>'')};
}
// Inject a real JWT + per-user cart BEFORE the app boots; returns after boot settles.
async function injectSession(p,email,token,cartItems){
  await p.addInitScript(({email,token,cart})=>{
    const enc=v=>JSON.stringify(JSON.stringify(v));   // shared_preferences web double-encodes strings
    localStorage.setItem('flutter.auth_token', JSON.stringify(token));
    localStorage.setItem('flutter.auth_email', enc(email));
    localStorage.setItem('flutter.expatCartItems_'+email, JSON.stringify(JSON.stringify(cart)));
  }, {email,token,cart:cartItems||[]});
}
async function gotoApp(p){ await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{}); await waitText(p,'Buy now',45000); }
async function hashNav(p,h){ await p.evaluate((hh)=>{window.location.hash=hh;},h); }

module.exports={APP,REF,API,newBrowser,newCtx,closeVideo,sleep,txt,txtAll,nodeCount,waitText,btnLoc,
  clickBtnLocator,clickCheckbox,scrollToFind,screenshot,watchImages,apiLogin,api,injectSession,gotoApp,hashNav};
