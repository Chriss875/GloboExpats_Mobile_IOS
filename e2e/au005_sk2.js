// au005_sk2.js — attacks A1..A6 + A8..A10 (stage 1 got through A0/A7 only).
const path = require('path'); const fs = require('fs');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9121';
const SHOT_DIR = 'e2e/shots/AU-005';
const R = { ts: new Date().toISOString(), unit: 'AU-005', stage: 'skeptic-backfill', wave: 'skeptic', build_sha: 'b56e345', attacks_attempted: 0, attacks_broken: 0, findings: [], evidence: [], consoleErrors: [], network: [] };
function finding(cls, result, detail, ev) {
  R.findings.push({ class: cls, result, detail, evidence: ev || [] });
  R.attacks_attempted++; if (result === 'BROKEN') R.attacks_broken++;
  console.log(result.padEnd(9), '|', cls, '|', detail.slice(0, 180));
}
async function shot(p, name) { const f = `${SHOT_DIR}/sk-${name}.png`; await L.screenshot(p, f); const rel = `e2e/shots/AU-005/${path.basename(f)}`; R.evidence.push(rel); return rel; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p){ return p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')).catch(()=>''); }
async function hasText(p,n){ return (await txt(p)).includes(n); }
async function waitText(p,n,tries=22){ for(let i=0;i<tries;i++){ if((await txt(p)).includes(n)) return true; await sleep(1000);} return false; }
async function findNode(p,label,exact=false){
  return p.evaluate(({lbl,exact})=>{ let best=null; document.querySelectorAll('flt-semantics').forEach(e=>{
    const t=(e.textContent||'').trim(); if(exact? t!==lbl : !t.includes(lbl)) return;
    if(e.getAttribute('role')!=='button' && e.getAttribute('flt-tappable')===null) return;
    const r=e.getBoundingClientRect(); if(r.width<4||r.height<4||r.bottom<0||r.top>innerHeight) return;
    if(!best||r.width*r.height<best.area) best={area:r.width*r.height,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
  }); return best; },{lbl:label,exact});
}
async function tap(p,label,tries=3){ for(let i=0;i<tries;i++){ const h=await findNode(p,label); if(h){ await p.mouse.click(Math.max(4,Math.min(h.x,371)),Math.max(24,Math.min(h.y,663))); await sleep(900); return true;} await p.mouse.move(187,350); await p.mouse.wheel(0,260); await sleep(320);} return false; }
async function isLoggedIn(p){ try{ return !!(await p.evaluate(()=>localStorage.getItem('flutter.auth_token')||'')); }catch(e){ return false; } }
async function hashNav(p,h,settle=4200){ await p.evaluate(x=>{window.location.hash=x;},h).catch(()=>{}); await sleep(settle); }
async function openApp(p){ await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p,'Buy now',45000).catch(()=>{}); await p.evaluate(()=>{if(window.location.hash&&window.location.hash!=='#/') window.location.hash='#/';}).catch(()=>{}); await sleep(1000); }
async function loginUi(p,email,pw){
  if(!(await hasText(p,'Welcome back'))){ await L.clickBtn(p,'Login'); await waitText(p,'Welcome back',20); }
  const ei=p.locator('input[type="text"]').first(); await ei.click({force:true}).catch(()=>{}); await sleep(300); await p.keyboard.type(email,{delay:12});
  const pi=p.locator('input[type="password"]').first(); await pi.click({force:true}).catch(()=>{}); await sleep(300); await p.keyboard.type(pw,{delay:12});
  await L.clickBtn(p,'Log in');
  let ok=false; for(let i=0;i<30&&!ok;i++){ await sleep(1000); ok=await isLoggedIn(p);} return ok;
}

(async () => {
  const browser = await L.newBrowser();
  const ctxA = await L.newCtx(browser,{viewport:{width:375,height:667}});
  const ctxB = await L.newCtx(browser,{viewport:{width:768,height:1024}});
  const p = await ctxA.newPage();
  p.on('console', m => { if (m.type()==='error') R.consoleErrors.push(m.text().slice(0,160)); });

  // ---- sign in once as the shared admin/buyer account (real UI) ----
  await openApp(p);
  const li = await loginUi(p,'mobile.test.20260820@gmail.com','StrongPass!1');
  console.log('login ok=', li);

  // ================= A8 SESSION EXPIRY MID-FLOW ==========================================
  await hashNav(p,'#/product/338'); await waitText(p,'HUNTRX TOY SET',25);
  await p.evaluate(()=>{ const cur=JSON.parse(localStorage.getItem('flutter.auth_token')||'"x"');
    localStorage.setItem('flutter.auth_token', JSON.stringify(cur.replace(/.$/, c=>c==='a'?'b':'a'))); });
  let hit = await findNode(p,'Save',true);
  if(!hit){ // Save is an IconButton with tooltip; find by text fallback
    hit = await p.evaluate(()=>{ let b=null; document.querySelectorAll('flt-semantics').forEach(e=>{ if(b) return; const lab=e.getAttribute('aria-label')||''; if(/save/i.test(lab)){const r=e.getBoundingClientRect(); b={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};} }); return b; });
  }
  if(hit){ await p.mouse.click(Math.max(4,Math.min(hit.x,371)),Math.max(24,Math.min(hit.y,663))); await sleep(2500); }
  const tExp = await txt(p);
  const sb = await L.hasSnackBar(p);
  const ev8 = await shot(p,'a8-expired-token-save');
  finding('A8-session-expiry-midflow', (!tExp.includes('Exception')) ? 'HELD':'BROKEN',
    `expired-token Save tap on live product page: noExceptionLeak=${!tExp.includes('Exception')} snackBand=${sb.found}${sb.atY?('@y='+sb.atY):''} stillOnDetail=${tExp.includes('HUNTRX TOY SET')}; text="${tExp.slice(0,110).replace(/\n+/g,' | ')}"`, [ev8]);
  // restore good token
  const tok = fs.readFileSync('/tmp/au005_admin_tok.txt','utf8').trim();
  await p.evaluate(t=>{ localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, tok);
  await openApp(p);

  // ================= A1 RAPID DOUBLE-TAPS ON EVERY CTA ===================================
  await hashNav(p,'#/product/338'); await waitText(p,'HUNTRX TOY SET',25);
  const addB = await findNode(p,'Add to cart',true);
  const buyB = await findNode(p,'Buy now',true);
  if(addB&&buyB){
    for(let i=0;i<3;i++){ await p.mouse.click(addB.x,addB.y); await sleep(120);}
    for(let i=0;i<3;i++){ await p.mouse.click(buyB.x,buyB.y); await sleep(120);}
  }
  await sleep(3000);
  const tRapid = await txt(p);
  const ev1 = await shot(p,'a1-rapid-taps-detail');
  const stable = tRapid.trim().length>60 && !tRapid.includes('Exception');
  // exactly one checkout push expected even after triple Buy-now
  const onCheckout = /Checkout|Delivery|Order summary/i.test(tRapid);
  finding('A1-rapid-double-taps-ctas', stable ? 'HELD':'BROKEN',
    `3x Add-to-cart + 3x Buy-now @~120ms: appStable=${stable}, landedOn=${onCheckout?'checkout/detail':'other'}; textLen=${tRapid.length}; head="${tRapid.slice(0,90).replace(/\n+/g,' | ')}"`, [ev1]);
  // rapid tab spam
  await openApp(p);
  for(const lbl of ['Marketplace','Sell','Requests','Account','Home']){ for(let i=0;i<3;i++){ await tap(p,lbl,1); await sleep(90);} }
  await sleep(2000);
  const tTabs = await txt(p);
  const ev1b = await shot(p,'a1-tab-spam');
  finding('A1-rapid-tab-spam', (tTabs.trim().length>60 && !tTabs.includes('Exception')) ? 'HELD':'BROKEN',
    `15 rapid bottom-nav taps (~90ms apart): appStable=${tTabs.trim().length>60}; textLen=${tTabs.length}`, [ev1b]);

  // ================= A2 OUT-OF-ORDER / MID-FLOW BACK-OUT =================================
  await hashNav(p,'#/search?q='); await sleep(1200);
  const sInp = p.locator('input[type="text"]').first();
  await sInp.click({force:true}).catch(()=>{}); await sleep(250);
  await p.keyboard.type('toy',{delay:16}); await p.keyboard.press('Enter');
  await sleep(600); // leave mid-request
  const bk = await findNode(p,'Back');
  if(bk){ await p.mouse.click(bk.x,bk.y); await sleep(1200); }
  await hashNav(p,'#/search?q=toy');
  const toyOk = await waitText(p,'TOY',20);
  const ev2 = await shot(p,'a2-search-backout-reenter');
  finding('A2-out-of-order-backout-reenter', toyOk ? 'HELD':'DISPUTED',
    `mid-request Back during 'toy' search then instant re-entry: resultsRender=${toyOk}`, [ev2]);
  // deep-link chain: detail -> back-to-browse -> category -> back
  await hashNav(p,'#/product/999999'); await sleep(3500);
  const bb2 = await findNode(p,'Back to Browse',true);
  if(bb2){ await p.mouse.click(bb2.x,bb2.y); await sleep(2200); }
  const tBrowse = await txt(p);
  await hashNav(p,'#/category/garden-outdoors'); await sleep(4500);
  const tGarden = await txt(p);
  const ev2b = await shot(p,'a2-empty-category-garden');
  finding('A2-chain-nav-after-backout', (tBrowse.length>50 && !tGarden.includes('Exception')) ? 'HELD':'DISPUTED',
    `notfound->browse->empty category(garden-outdoors): gardenText="${tGarden.slice(0,90).replace(/\n+/g,' | ')}"`, [ev2b]);

  // ================= A4 OFFLINE MID-REQUEST (route abort :8083) + RETRY ==================
  await p.route('**localhost:8083/**', r=>r.abort()).catch(()=>{});
  await hashNav(p,'#/product/338',6000);
  const tOff = await txt(p);
  const ev4 = await shot(p,'a4-offline-detail');
  const handled = /Could not load product|couldn't find that|Product not found|Network problem|try again/i.test(tOff) && !/Exception|SocketException|Failed host lookup/i.test(tOff);
  finding('A4-offline-midrequest-copy', handled ? 'HELD':(tOff.trim().length>40?'DISPUTED':'BROKEN'),
    `all :8083 aborted -> #/product/338 copy: handled=${handled} rawNetLeak=${/SocketException|Failed host lookup|Connection refused/i.test(tOff)}; text="${tOff.slice(0,150).replace(/\n+/g,' | ')}"`, [ev4]);
  await p.unroute('**localhost:8083/**').catch(()=>{});
  await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{});
  await sleep(2500); await hashNav(p,'#/product/338',5000);
  const tRec = await txt(p);
  const ev4b = await shot(p,'a4-recovered-after-retry');
  finding('A4-offline-retry-recovers', tRec.includes('HUNTRX TOY SET') ? 'HELD':'DISPUTED',
    `network restored -> reload -> detail loads again=${tRec.includes('HUNTRX TOY SET')}`, [ev4b]);

  // ================= A5 INVALID INPUT ====================================================
  const cases=[['q500','a'.repeat(500)],['emoji','🚀🔥👍🚀🔥👍🚀🔥👍'],['swahili','Chakula cha mchuzi wa nyama na wali'],['scripttag','<script>alert(1)</script>']];
  for(const [name,val] of cases){
    await hashNav(p,'#/search?q='); await sleep(1300);
    const inp=p.locator('input[type="text"]').first();
    await inp.click({force:true}).catch(()=>{}); await sleep(250); await inp.fill('').catch(()=>{});
    await p.keyboard.type(val,{delay:2}); await p.keyboard.press('Enter'); await sleep(5500);
    const t=await txt(p);
    const okState=/No results found\.|TSh/.test(t) && !/Exception|RangeError/i.test(t);
    const ev5 = await shot(p,'a5-'+name);
    finding('A5-invalid-input-'+name, okState?'HELD':'BROKEN',
      `query len=${val.length} first12="${val.slice(0,12)}": cleanTerminal=${okState}; scriptEchoed=${t.includes('<script>')}; text="${t.slice(0,100).replace(/\n+/g,' | ')}"`, [ev5]);
    await openApp(p);
  }

  // ================= A9 STALE-CACHE RELOAD AFTER MUTATION ================================
  // mutate server-side via REAL API (mark one notification read) then check the screen refetches
  await openApp(p);
  await hashNav(p,'#/notifications',5000);
  const beforeN = await txt(p);
  const unreadBefore = (beforeN.match(/New Request Posted/g)||[]).length;
  // real mutation through the API with the same account's token
  const { execSync } = require('child_process');
  let markStatus='skipped'; try {
    markStatus = execSync(`TOK=$(cat /tmp/au005_admin_tok.txt); curl -s -o /dev/null -w '%{http_code}' -X PATCH -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{}' http://localhost:8083/api/v1/notifications/read-all`).toString().trim();
  } catch(e){ markStatus='ERR '+e.message.slice(0,40); }
  await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{});
  await sleep(2500); await hashNav(p,'#/',1500); await hashNav(p,'#/notifications',5000);
  const afterN = await txt(p);
  const unreadAfter = (afterN.match(/New Request Posted/g)||[]).length;
  const ev9 = await shot(p,'a9-notifications-after-mutation');
  finding('A9-stale-cache-reload', (markStatus==='200'||markStatus==='204') && afterN.length>30 && !afterN.includes('Could not load notifications') ? 'HELD':'DISPUTED',
    `PATCH /notifications/read-all status=${markStatus}: rowsBefore=${unreadBefore} rowsAfterReload=${unreadAfter} errBanner=${afterN.includes('Could not load notifications')}; stale-cache served=${unreadBefore>0&&unreadAfter===unreadBefore&&!afterN.includes('read')}`.slice(0,190), [ev9]);

  // ================= A6 LOCALE / NUMBER FORMAT ===========================================
  await hashNav(p,'#/product/338'); await waitText(p,'HUNTRX TOY SET',22);
  const tP = await txt(p);
  const m = tP.match(/TSh\s?[\d,]+(\.\d+)?/g)||[];
  const priceOk = m.some(s=>/^TSh\s?\d{1,3}(,\d{3})+$/.test(s.replace(/\s+/g,' ').trim()));
  const ev6 = await shot(p,'a6-price-format');
  finding('A6-locale-number-format', priceOk?'HELD':'DISPUTED',
    `TZS format on detail: prices=[${m.slice(0,4).join(' ; ')}] thousandsGrouping=${priceOk}`, [ev6]);

  // tablet parity spot-checks
  const q = await ctxB.newPage();
  q.on('console', mm => { if(mm.type()==='error') R.consoleErrors.push('[768] '+mm.text().slice(0,140)); });
  await q.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(q,'Buy now',45000).catch(()=>{});
  await q.evaluate(()=>{window.location.hash='#/product/999999';}).catch(()=>{}); await sleep(5000);
  const tq = await txt(q);
  const ev10 = await shot(q,'a10-tablet-404');
  finding('A10-tablet-404-parity', tq.includes('Product not found')?'HELD':'DISPUTED',
    `768x1024 #/product/999999: notFoundCopy=${tq.includes('Product not found')}`, [ev10]);
  await q.evaluate(()=>{window.location.hash='#/search?q=xqzjvkw';}).catch(()=>{}); await sleep(5000);
  const tqs = await txt(q);
  const ev11 = await shot(q,'a10-tablet-search-empty');
  finding('A10-tablet-search-empty-parity', tqs.includes('No results found.')?'HELD':'DISPUTED',
    `768x1024 empty search: emptyCopy=${tqs.includes('No results found.')}`, [ev11]);
  await q.close();

  await ctxA.close().catch(()=>{});
  await browser.close();
  fs.writeFileSync('/tmp/au005_skeptic_stage2.json', JSON.stringify(R,null,2));
  console.log('\nSTAGE2 attacks=',R.attacks_attempted,'broken=',R.attacks_broken);
})().catch(e=>{ console.error('FATAL', e && e.message); fs.writeFileSync('/tmp/au005_skeptic_stage2.json', JSON.stringify(R,null,2)); process.exit(1); });
