// lib_verify.js — shared, PROVEN real-browser automation primitives for Campaign V2.
// Reference web app (:3000) is the judge; Flutter build served at :9100; sandbox :8083.
// NO gemini() — the model reads PNGs natively (Rule 16). Video capture built in.
const { chromium } = require('playwright');
const fs = require('fs');
const APP = 'http://localhost:9100';
const REF = 'http://localhost:3000';
const API = 'http://localhost:8083';
const BUYER = { email: 'mobile.test.20260820@gmail.com', pw: 'StrongPass!1' };
const ADMIN = { email: 'mobile.test.20260820@gmail.com', pw: 'StrongPass!1' }; // sandbox user holds BUYER+ADMIN+SELLER

function _ldLibraryPath(){ return process.env.LD_LIBRARY_PATH || (process.env.HOME||'/home/devsystemadmin')+'/chromium-libs/usr/lib/x86_64-linux-gnu'; }

async function newBrowser(opts={}){
  // --disable-gpu + swiftshader: headless CanvasKit screenshots come out near-black
  // without software GL (found 2026-08-23 via native PNG inspection of skeptic shots).
  const {args: extraArgs, ...rest} = opts;
  return chromium.launch({ ...rest,
    env:{...process.env, LD_LIBRARY_PATH:_ldLibraryPath()},
    args:['--force-color-profile=srgb','--disable-gpu','--use-gl=swiftshader', ...(extraArgs||[])] });
}

// New context with MANDATORY video recording + mobile viewport. Every verify run uses this.
async function newCtx(browser, {viewport={width:375,height:667}, videoPath=null, token=null}={}){
  const ctx = await browser.newContext({ viewport, recordVideo: videoPath?{dir:require('path').dirname(videoPath), size:viewport}:undefined });
  if(token){ await ctx.addInitCookie??null; }
  return ctx;
}
async function closeVideo(ctx, videoPath){
  try{ const v = ctx.pages()[0] && await ctx.pages()[0].video(); await ctx.close();
    if(v && videoPath) await v.saveAs(videoPath).catch(()=>{}); }catch(e){}
  return videoPath;
}

async function allText(p){ return p.evaluate(()=>{const els=[...document.querySelectorAll('flt-semantics')]; return els.map(e=>(e.textContent||'')).join('\n');}); }
async function waitText(p,n,ms=25000){ return p.waitForFunction((x)=>{const els=[...document.querySelectorAll('flt-semantics')]; return els.some(e=>(e.textContent||'').includes(x));}, n, {timeout:ms}).then(()=>true).catch(()=>false); }
const btn=(p,l)=>p.locator('flt-semantics[role="button"]').filter({hasText:l}).first();
async function clickBtn(p,label){ return btn(p,label).click({force:true}).then(()=>true).catch(()=>false); }

// Click a TAPPABLE node (product cards etc.: flt-tappable, no role=button) whose text
// contains `label`, choosing the SMALLEST matching on-screen node. Flutter semantics
// wrap cards in full-screen ancestor nodes that also carry the child's text — clicking
// the largest/ancestor match taps nothing (this is why clickBtn('TSh') failed in
// verify_AU-000: it resolved to a 375x667 wrapper). Coordinates are used because
// Playwright force-clicks on offscreen/covered nodes silently no-op.
async function clickCard(p, label){
  const cands = await p.evaluate((lbl) => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const txt = (e.textContent || '').trim();
      if (!txt.includes(lbl)) return;
      if (e.getAttribute('flt-tappable') === null) return;   // must be tappable itself
      const r = e.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) return;
      if (r.bottom < 0 || r.top > window.innerHeight) return;   // skip scrolled-away nodes
      out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2),
                 area: r.width * r.height });
    });
    out.sort((a, b) => a.area - b.area);
    return out.slice(0, 3);
  }, label);
  for (const c of cands) {
    await p.mouse.click(c.cx, Math.max(20, Math.min(c.cy, 640)));
    await p.waitForTimeout(600);
    return true;
  }
  // fallback: scroll up once and retry once via locator force-click
  await p.mouse.move(190, 400); await p.mouse.wheel(0, -500); await p.waitForTimeout(600);
  const again = await p.evaluate((lbl) => {
    let hit = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (hit) return;
      const txt = (e.textContent || '').trim();
      if (!txt.includes(lbl) || e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      if (r.width < 40 || r.height < 40 || r.bottom < 0 || r.top > innerHeight) return;
      hit = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2),
              area: r.width * r.height };
    });
    return hit;
  }, label);
  if (again) { await p.mouse.click(again.cx, again.cy); await p.waitForTimeout(600); return true; }
  return false;
}
// Enumerate every interactive control from the a11y snapshot (click-everything rule).
async function listButtons(p){
  return p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const role=e.getAttribute('role'); const t=(e.textContent||'').trim().slice(0,80);
      if(role==='button') out.push({kind:'button', label:t});
      else if(e.tagName==='FLT-SEMANTICS' && (e.getAttribute('flt-tappable')==='')) out.push({kind:'tappable', label:t});
    });
    document.querySelectorAll('input,textarea').forEach(i=>out.push({kind:'input', label:(i.placeholder||i.type||'input')}));
    return out;
  });
}
async function scrollToBottom(p,steps=14){ await p.mouse.move(200,400); for(let i=0;i<steps;i++){ await p.mouse.wheel(0,180); await p.waitForTimeout(140); } }

// Scroll a node whose text contains `label` into view (wheel up/down in steps).
// Needed because Flutter semantics nodes have no scrollIntoView and force-clicks
// on offscreen nodes silently no-op.
async function scrollIntoView(p,label){
  const pos = await p.evaluate((lbl)=>{
    let r=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if(r) return;
      if((e.textContent||'').trim().includes(lbl)){ const b=e.getBoundingClientRect(); if(b.width>0) r={y:b.y+b.height/2,h:innerHeight}; }
    });
    return r;
  },label);
  if(!pos) return false;
  await p.mouse.move(200,Math.min(pos.h/2,400));
  if(pos.y < 60){ for(let i=0;i<12 && pos.y<60;i++){ await p.mouse.wheel(0,-260); await p.waitForTimeout(120);} }
  else if(pos.y > pos.h-120){ for(let i=0;i<14 && pos.y>pos.h-120;i++){ await p.mouse.wheel(0,200); await p.waitForTimeout(110);
    const again = await p.evaluate((lbl2)=>{let rr=null;document.querySelectorAll('flt-semantics').forEach(e=>{if(rr)return;if((e.textContent||'').trim().includes(lbl2)){const b=e.getBoundingClientRect();if(b.width>0)rr=b.y+b.height/2;}});return rr;},label);
    if(again===null) break; }
  }
  return true;
}

// Track image asset responses (CanvasKit draws into canvas — check NETWORK, not <img>).
function watchImages(p){ const m={}; p.on('response', r=>{const u=r.url(); if(/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)||/\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) m[u]=r.status();}); return m; }
function imageSummary(m){ const v=Object.values(m); return { total:v.length, ok:v.filter(s=>s===200||s===304).length, failed:v.filter(s=>s>=400).length }; }

// Navigate to app, open Login tab, TYPE into CanvasKit (click hidden input + keyboard), submit.
// Success signal is the PERSISTED TOKEN (flutter.auth_token non-empty in localStorage),
// never a specific landing view: since commit 82bb928 post-login pops back to the
// referring page (web router.back() parity), so 'My account' only appears on the
// Account tab — asserting it here produced false-negative logins for every verifier
// that started elsewhere. Callers wanting the account view should open the Account tab.
function isLoggedIn(p){
  return p.evaluate(()=>{ try{ const v=localStorage.getItem('flutter.auth_token'); return !!(v&&v.length>10); }catch(e){ return false; } });
}
async function login(page, cred){
  await page.goto(APP,{waitUntil:'load',timeout:90000}).catch(()=>{});
  if(await isLoggedIn(page)) return true; // already signed in from a prior run in this context
  await waitText(page,'Buy now',25000);
  await clickBtn(page,'Login'); await waitText(page,'Welcome back',25000);
  const ei=page.locator('input[type="text"]').first(); const pi=page.locator('input[type="password"]').first();
  await ei.click({force:true}).catch(()=>{}); await page.waitForTimeout(350); await page.keyboard.type(cred.email);
  await pi.click({force:true}).catch(()=>{}); await page.waitForTimeout(350); await page.keyboard.type(cred.pw);
  await clickBtn(page,'Log in');
  // Poll until the token lands in storage; no fixed landing-view assumption.
  let ok=false;
  for(let i=0;i<25 && !ok;i++){ ok=await isLoggedIn(page); if(!ok) await page.waitForTimeout(1000); }
  return ok;
}

async function screenshot(p,path){ await p.screenshot({path,fullPage:false}).catch(()=>{}); return path; }
function shotName(unit,vp,state){ return `e2e/shots/${unit}/${unit}-${vp}-${state}.png`.replace(/ /g,'_'); }

// Real-API fixture helper — always the REAL sandbox backend, never mocks.
async function apiLogin(cred=BUYER){
  const r = await fetch(`${API}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:cred.email,password:cred.pw})});
  const j = await r.json(); if(!j.token) throw new Error('login failed '+r.status); return j.token;
}
async function api(token, method, path, body, isForm=false){
  const headers = {}; if(token) headers.Authorization='Bearer '+token;
  if(body && !isForm) headers['Content-Type']='application/json';
  const r = await fetch(API+path,{method,headers,body: body&&!isForm?JSON.stringify(body):body});
  let j=null; try{ j = await r.json(); }catch(e){ j=null; }
  return {status:r.status, json:j};
}


// ---- SnackBar detector (Campaign V2) --------------------------------------
// Flutter web does NOT expose SnackBar text in flt-semantics on this build
// (found AU-016 r3: the toast paints a dark #2f3036 band above the bottom bar
// but the a11y tree never contains its copy; there is also no <canvas> node to
// sample — rendering goes through flutter-view's WebGL surface). Detect by
// scanning Playwright's own screenshot PNG for a dark full-width band.
async function hasSnackBar(page) {
  const buf = await page.screenshot().catch(() => null);
  if (!buf) return { found: false, reason: 'shot-fail' };
  const { width, height, rows } = decodePng(buf);
  if (!rows) return { found: false, reason: 'decode-fail' };
  const startY = Math.floor(height * 0.7);
  let run = 0;
  for (let y = startY; y < height - 4; y++) {
    let dark = 0, samples = 0;
    for (let x = Math.floor(width * 0.12); x < width * 0.88; x += 3) {
      const o = x * 3;
      const lum = (rows[y][o] * 299 + rows[y][o + 1] * 587 + rows[y][o + 2] * 114) / 1000;
      samples++;
      if (lum < 90) dark++;
    }
    if (dark > samples * 0.55) run++; else run = 0;
    if (run >= 10) return { found: true, atY: y - 10 };
  }
  return { found: false };
}

// Minimal PNG decoder: enough for Playwright RGB screenshots (color type 2).
function decodePng(buf) {
  // signature 8 bytes
  let pos = 8, idat = [], w = 0, h = 0, colorType = -1;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      w = buf.readUInt32BE(pos + 8); h = buf.readUInt32BE(pos + 12);
      colorType = buf[pos + 17];
    } else if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len));
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (w === 0 || colorType !== 2) return {}; // only truecolor supported
  const zlib = require('zlib');
  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch (e) { return {}; }
  const stride = 1 + w * 3;
  const rows = new Array(h);
  let prev = Buffer.alloc(w * 3);
  for (let y = 0; y < h; y++) {
    const off = y * stride;
    const f = raw[off];
    const line = raw.subarray(off + 1, off + stride);
    const out = Buffer.alloc(w * 3);
    if (f === 0) line.copy(out);
    else if (f === 1) for (let i = 0; i < out.length; i++) out[i] = (line[i] + (i >= 3 ? out[i - 3] : 0)) & 255;
    else if (f === 2) for (let i = 0; i < out.length; i++) out[i] = (line[i] + prev[i]) & 255;
    else if (f === 3) for (let i = 0; i < out.length; i++) { const a = i >= 3 ? out[i - 3] : 0; out[i] = (line[i] + ((a + prev[i]) >> 1)) & 255; }
    else if (f === 4) {
      for (let i = 0; i < out.length; i++) {
        const a = i >= 3 ? out[i - 3] : 0; const b = prev[i]; const c = i >= 3 ? prev[i - 3] : 0;
        const pp = a + b - c; const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        const pr = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
        out[i] = (line[i] + pr) & 255;
      }
    }
    rows[y] = out; prev = out;
  }
  return { width: w, height: h, rows };
}

module.exports = { APP, REF, API, BUYER, ADMIN, newBrowser, newCtx, closeVideo, allText, waitText, btn, clickBtn, clickCard,
  listButtons, scrollToBottom, scrollIntoView, watchImages, imageSummary, login, isLoggedIn, screenshot, shotName, apiLogin, api, hasSnackBar };
