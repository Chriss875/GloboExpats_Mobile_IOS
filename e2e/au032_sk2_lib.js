// au032_sk2_lib.js — SKEPTIC r14 helpers, FROZEN lane :9131 (sha e694463).
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9131';
const UNIT = 'AU-032';
const BUILD_SHA = 'e694463', BUILD_MT = 'Wed, 26 Aug 2026 08:15:26 GMT';
const fx = JSON.parse(fs.readFileSync('/tmp/au032_fixtures.json', 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p){ return L.allText(p).catch(()=> ''); }
function vis(p, needle){
  return p.evaluate((n) => {
    let r = false;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (r) return;
      if ((e.textContent||'').includes(n)) { const b = e.getBoundingClientRect(); if (b.bottom > 0 && b.top < innerHeight && b.height > 1 && b.width > 1) r = true; }
    });
    return r;
  }, needle).catch(()=> false);
}
// smallest visible tappable/role-button node containing label
async function hit(p, label){
  return p.evaluate((lbl) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent||'').trim();
      if (!t.includes(lbl)) return;
      const roleOk = e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null;
      if (!roleOk) return;
      const r = e.getBoundingClientRect();
      if (r.width < 6 || r.height < 6 || r.bottom < 0 || r.top > innerHeight) return;
      if (!best || r.width*r.height < best.area) best = { area: r.width*r.height, x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2), label: t.slice(0,50) };
    });
    return best;
  }, label);
}
async function tap(p, label, tries=3){
  for (let i=0;i<tries;i++){
    const h = await hit(p, label);
    if (h) { await p.mouse.click(h.x, h.y); await sleep(900); return true; }
    await p.mouse.move(200,300); await p.mouse.wheel(0,260); await sleep(350);
  }
  return false;
}
async function shot(p, name){ const f = `e2e/shots/AU-032/${name}.png`; await L.screenshot(p, f); return f; }
async function qty(tok){ const d = await L.api(tok,'GET',`/api/v1/displayItem/itemDetails/${fx.productId}`); return d.status===200 ? d.json.productQuantity : null; }
async function isLoggedIn(p){ try{ return !!(await p.evaluate(()=>localStorage.getItem('flutter.auth_token')||'')); }catch(e){ return false; } }
async function loginUi(p){
  await p.goto(APP+'/',{waitUntil:'domcontentloaded',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Buy now',60000);
  let ok = await isLoggedIn(p);
  if(!ok){
    await L.clickBtn(p,'Login'); await L.waitText(p,'Welcome back',30000);
    await p.locator('input[type="text"]').first().click({force:true}).catch(()=>{}); await sleep(400);
    await p.keyboard.type(fx.buyer.email,{delay:12});
    await p.locator('input[type="password"]').first().click({force:true}).catch(()=>{}); await sleep(400);
    await p.keyboard.type(fx.buyer.pw,{delay:12});
    await L.clickBtn(p,'Log in');
    for(let i=0;i<40&&!ok;i++){ await sleep(1000); ok = await isLoggedIn(p); }
  }
  return ok;
}
async function hashNav(p, route){ await p.evaluate(r=>{location.hash=r;},route); await sleep(2200); }
module.exports = { APP, UNIT, BUILD_SHA, BUILD_MT, fx, sleep, txt, vis, hit, tap, shot, qty, isLoggedIn, loginUi, hashNav, L };
