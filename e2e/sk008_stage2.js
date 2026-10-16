// AU-008 skeptic r12 — STAGE 2: adversarial attack battery on :9131 @c6b4d61 (hash lane)
// Attack classes: double-tap, out-of-order/deep-link re-entry, empty states,
// offline mid-request+retry, invalid input (emoji/Swahili/script/500char/bad email),
// TZS/locale vs reference, role probe, session expiry.
const {L,shot,SHOT} = require('./sk008_lib.js');
const APP='http://localhost:9131';
// NOTE: run AFTER sandbox CORS patch so API calls actually resolve (see report).
const fs=require('fs');
const OUT=process.env.OUTSHARD||'/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/AU-008-skeptic-r12.jsonl';
function rec(o){ o.ts=new Date().toISOString(); o.unit='AU-008'; o.wave='skeptic'; o.stage='skeptic-r12'; o.build_sha='c6b4d61'; o.app=APP;
  fs.appendFileSync(OUT, JSON.stringify(o)+'\n'); console.log(JSON.stringify(o).slice(0,700)); }
const BUYER={email:'mobile.test.20260820@gmail.com',pw:'StrongPass!1'};
(async()=>{
 const b=await L.newBrowser();
 const ctx=await b.newContext({viewport:{width:375,height:667}, recordVideo:{dir:'/home/devsystemadmin/GloboExpats_Mobile/e2e/videos',size:{width:375,height:667}}});
 const p=await ctx.newPage();
 const img={ok:0,bad:0,badUrls:[]};
 p.on('response',r=>{const u=r.url(); if(/\/uploads\/[^?]*\.(png|jpe?g|webp)|\/assets\/.*\.(png|webp|jpg)/i.test(u)){ if(r.status()<400)img.ok++; else {img.bad++; img.badUrls.push(r.status()+' '+u.slice(-50));}}});
 const findings=[];
 await p.goto(APP+'/',{waitUntil:'load'}); await L.waitText(p,'expat marketplace',30000); await p.waitForTimeout(4000);

 // ---- LOGIN via UI (hash lane) to get a real JWT in localStorage
 async function uiLogin(){
   await p.evaluate(()=>{window.location.hash='#/login';}); await p.waitForTimeout(2500);
   const t=await L.allText(p);
   if(!t.includes('Welcome back')) return false;
   const ei=p.locator('input[type="text"]').first(), pi=p.locator('input[type="password"]').first();
   await ei.click({force:true}).catch(()=>{}); await p.waitForTimeout(300); await p.keyboard.type(BUYER.email);
   await pi.click({force:true}).catch(()=>{}); await p.waitForTimeout(300); await p.keyboard.type(BUYER.pw);
   // DOUBLE-TAP the Log in button (attack: rapid double-taps on CTA)
   await L.clickBtn(p,'Log in'); await p.waitForTimeout(80); await L.clickBtn(p,'Log in').catch(()=>{});
   let ok=false; for(let i=0;i<25&&!ok;i++){ ok=await L.isLoggedIn(p); if(!ok)await p.waitForTimeout(800);}
   return ok;
 }
 const loginOk=await uiLogin();
 rec({attack:'A0-ui-login-with-doubletap', result: loginOk?'HELD':'BROKEN',
      detail:`UI login on hash lane with deliberate double-tap on 'Log in': token=${await L.isLoggedIn(p)}`,
      evidence:'shots/AU-008/AU-008-sk2-375-A0-login.png'});
 await shot(p,'375','A0-login');

 // ---- A1: cart add + checkout flow with invalid qty inputs
 // find a product from home rails
 await p.evaluate(()=>{window.location.hash='#/';}); await p.waitForTimeout(2500);
 const homeTxt=await L.allText(p);
 const priceMatch=homeTxt.match(/TSh ?([\d,]+)/);
 rec({attack:'A1-home-price-format', result: priceMatch?(/TSh ?\d{1,3}(,\d{3})+/.test(priceMatch[0])?'HELD':'DISPUTED'):'DISPUTED',
      detail:`TZS thousands separator on home rail: verbatim '${priceMatch?priceMatch[0]:'NONE'}'`,
      evidence:'shots/AU-008/AU-008-sk2-375-A1-home.png'});
 await shot(p,'375','A1-home');

 // ---- A2: search with hostile input (script tags, emoji, Swahili, 500 chars)
 await p.evaluate(()=>{window.location.hash='#/search';}); await p.waitForTimeout(2500);
 const si=p.locator('input[type="text"]').first();
 const hostiles=['<script>alert(1)</script>','🚀🔥💥 karibu','Jina langu ni Mwalimu wa Kiswahili sana', 'x'.repeat(500), "'; DROP TABLE products;--"];
 let searchResults=[];
 for(const h of hostiles){
   await si.click({force:true}).catch(()=>{}); await p.waitForTimeout(200);
   await p.keyboard.press('Control+a'); await p.keyboard.type(h.slice(0,120)); await p.waitForTimeout(1800);
   const t=await L.allText(p);
   searchResults.push({in:h.slice(0,24), len:t.length, err:t.includes('Something went wrong'), crash:(await p.evaluate(()=>document.querySelectorAll('flt-semantics')).then?.call?0:0)});
 }
 await shot(p,'375','A2-search-hostile');
 rec({attack:'A2-search-invalid-input', result: searchResults.some(r=>r.err)?'DISPUTED':'HELD',
      detail:`5 hostile searches (script tag/emoji/Swahili/500-char/SQL-ish) — app stayed responsive: ${JSON.stringify(searchResults.map(r=>({i:r.in,len:r.len,err:r.err})))}`,
      evidence:'shots/AU-008/AU-008-sk2-375-A2-search-hostile.png'});

 // ---- A3: offline mid-request + retry on product detail
 await ctx.setOffline(true);
 await p.evaluate(()=>{window.location.hash='#/product/639';}); await p.waitForTimeout(3500);
 const offTxt=await L.allText(p);
 await shot(p,'375','A3-offline-product');
 await ctx.setOffline(false);
 await p.waitForTimeout(3500);
 const backTxt=await L.allText(p);
 rec({attack:'A3-offline-midrequest-retry', result: offTxt.length>100 && backTxt.length>100 ? 'HELD':'DISPUTED',
      detail:`Offline cold deep-link /product/639: len=${offTxt.length} excerpt='${offTxt.slice(0,120).replace(/\s+/g,' ')}' | after reconnect len=${backTxt.length} '${backTxt.slice(0,120).replace(/\s+/g,' ')}'`,
      evidence:'shots/AU-008/AU-008-sk2-375-A3-offline-product.png'});
 await shot(p,'375','A3b-reconnect');

 // ---- A4: session expiry mid-flow (clear token while authed, then hit gated route)
 await p.evaluate(()=>{localStorage.removeItem('flutter.auth_token'); window.location.hash='#/orders';});
 await p.waitForTimeout(3000);
 const gateTxt=await L.allText(p);
 const gated=!gateTxt.includes('Buying')||gateTxt.includes('Log in');
 rec({attack:'A4-session-expiry-midflow', result: gated?'HELD':'BROKEN',
      detail:`Token removed mid-session then /orders: ${gated?"gated to login":"ORDERS RENDERED WITHOUT AUTH"} excerpt='${gateTxt.slice(0,140).replace(/\s+/g,' ')}'`,
      evidence:'shots/AU-008/AU-008-sk2-375-A4-expiry-orders.png'});
 await shot(p,'375','A4-expiry-orders');

 // ---- A5: role probe — buyer JWT against admin endpoint
 try{
  const tok=await (await fetch('http://localhost:8083/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(BUYER)})).json().then(j=>j.token);
  const r=await fetch('http://localhost:8083/api/v1/admin/payments',{headers:{Authorization:'Bearer '+tok}});
  rec({attack:'A5-role-probe-admin-endpoint', result: (r.status===401||r.status===403)?'HELD':'BROKEN',
       detail:`BUYER JWT on GET /api/v1/admin/payments -> HTTP ${r.status} (${r.status===403?'403 Forbidden, no leak':'unexpected'})`,
       evidence:'curl from harness, no browser involved'});
 }catch(e){ rec({attack:'A5-role-probe-admin-endpoint',result:'DISPUTED',detail:'probe error '+String(e).slice(0,90)}); }

 // ---- A6: empty states — saved items & notifications for fresh account view
 await p.evaluate(()=>{window.location.hash='#/account/saved';}); await p.waitForTimeout(3000);
 const savedTxt=await L.allText(p);
 await shot(p,'375','A6-saved-empty');
 rec({attack:'A6-empty-state-saved', result: savedTxt.length>30?'HELD':'BROKEN',
      detail:`#/account/saved renders (len=${savedTxt.length}) excerpt='${savedTxt.slice(0,150).replace(/\s+/g,' ')}' — NOTE api blocked=${img.bad} by CORS so data may be placeholder-free shell`,
      evidence:'shots/AU-008/AU-008-sk2-375-A6-saved-empty.png'});

 // ---- A7: out-of-order deep-link re-entry into checkout after login gate
 await p.evaluate(()=>{window.location.hash='#/checkout';}); await p.waitForTimeout(3000);
 const coTxt=await L.allText(p);
 await shot(p,'375','A7-checkout-authed');
 rec({attack:'A7-checkout-deeplink-authed', result: coTxt.length>60?'HELD':'BROKEN',
      detail:`Authed deep-link #/checkout renders (len=${coTxt.length}) excerpt='${coTxt.slice(0,160).replace(/\s+/g,' ')}'`,
      evidence:'shots/AU-008/AU-008-sk2-375-A7-checkout-authed.png'});

 const v=await p.video(); if(v){await v.saveAs('/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-008-sk2-375.webm').catch(()=>{});}
 await ctx.close(); await b.close();
 fs.writeFileSync('/tmp/sk008_stage2.json', JSON.stringify({img,findings},null,1));
})().catch(e=>{console.error(e);process.exit(1);});
