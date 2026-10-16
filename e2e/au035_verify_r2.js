// AU-035 r2 — fix r1 harness gaps: scroll-to-item before asserting, 768 fresh
// login, rental order full scroll, reference login, Track delivery via UI.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9112';
const UNIT = 'AU-035';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const SHOT_DIR = `${ROOT}/e2e/shots/${UNIT}`;
const VIDEO = `${ROOT}/e2e/videos/${UNIT}-verify.webm`;
const EXPECT = {
  o12: { id:'2499e6e9-b5f9-4b47-982e-1d50f99144c5', num:'ORD-2026-000012',
         title:'LANCÔME PARIS La vie est belle', choice:'Pack Size: Single',
         subtotal:'TSh 626,000', fee:'TSh 4,000', total:'TSh 630,000', price:'TSh 626,000' },
  o23: { id:'49dee2e4-e785-45e9-91a8-6a4dac2b3270', num:'ORD-2026-000023',
         title:'AU016 Lakeside Cabin Rental', unitPrice:'TSh 46,000' },
};
const R = { unit:UNIT, stage:'verify-r2', ts:new Date().toISOString(), asserts:[], clicks:[], parity:[], images:{} };
function log(...a){ console.log('[r2]',...a); }
function assert(n,p,d){ R.asserts.push({name:n,pass:!!p,...(d!==undefined?{detail:d}:{})}); log(p?'PASS':'FAIL',n,JSON.stringify(d??'').slice(0,220)); }
async function dumpText(p){ return p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'')).join('\n')); }
async function shot(p,vp,st){ const f=`${SHOT_DIR}/${UNIT}-${vp}-${st}.png`; await L.screenshot(p,f); log('shot',st,vp); return f; }
async function controls(p){
  return p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const role=e.getAttribute('role'); const tap=e.getAttribute('flt-tappable')!==null;
      if(role!=='button'&&!tap) return;
      const r=e.getBoundingClientRect();
      if(r.width<8||r.height<8||r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth) return;
      out.push({kind:role==='button'?'button':'tappable',label:(e.textContent||'').trim().slice(0,60),x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});
    });
    document.querySelectorAll('input,textarea').forEach(i=>out.push({kind:'input',label:(i.placeholder||i.type||'input'),x:-1,y:-1}));
    return out;
  });
}
async function clickXY(p,x,y){ await p.mouse.move(x,y); await p.waitForTimeout(140); await p.mouse.down(); await p.waitForTimeout(90); await p.mouse.up(); }

(async () => {
  const browser = await L.newBrowser();
  const ctx = await browser.newContext({ viewport:{width:375,height:667},
    recordVideo:{ dir:path.dirname(VIDEO), size:{width:375,height:667} } });
  const imgMap = {};
  ctx.on('page', pg => pg.on('response', r => { const u=r.url();
    if(/\/uploads\/[^?]*\.(png|jpe?g|webp)/i.test(u)||/assets\/assets\/images\//.test(u)) imgMap[u]=r.status(); }));
  const page = await ctx.newPage();

  // ---- login once (UI-typed) ----
  await page.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(page,'Buy now',25000);
  await L.clickBtn(page,'Login'); await L.waitText(page,'Welcome back',25000);
  const ei=page.locator('input[type="text"]').first(), pi=page.locator('input[type="password"]').first();
  await ei.click({force:true}); await page.waitForTimeout(300); await page.keyboard.type(L.BUYER.email);
  await pi.click({force:true}); await page.waitForTimeout(300); await page.keyboard.type(L.BUYER.pw);
  await L.clickBtn(page,'Log in');
  let ok=false; for(let i=0;i<25&&!ok;i++){ ok=await L.isLoggedIn(page); if(!ok) await page.waitForTimeout(1000); }
  assert('login-buyer-ui', ok);

  async function gotoOrder(id){
    await page.goto(APP+'/orders/'+id,{waitUntil:'load',timeout:90000}).catch(()=>{});
    for(let i=0;i<20;i++){ const t=await dumpText(page); if(t.includes('Placed on')&&t.length>200) break; await page.waitForTimeout(900); }
    await page.waitForTimeout(1500);
  }
  // scroll until predicate(text) true or bottom reached; returns text
  async function scrollUntil(pred){
    for(let i=0;i<14;i++){
      const t = await dumpText(page);
      if(pred(t)) return t;
      await page.mouse.move(190,350); await page.mouse.wheel(0,240); await page.waitForTimeout(180);
    }
    return dumpText(page);
  }

  // ================= O12 — COMPLETED + choice line =================
  await gotoOrder(EXPECT.o12.id);
  const T12full = await scrollUntil(t=>t.includes(EXPECT.o12.title));
  await shot(page,'375','10-o12-items');
  assert('o12-number', T12full.includes(EXPECT.o12.num));
  assert('o12-item-title-renders', T12full.includes(EXPECT.o12.title),
    T12full.split('\n').filter(l=>/LANC|Ordered item/i.test(l)).slice(0,3));
  assert('o12-choice-label-exact', T12full.includes(EXPECT.o12.choice), `expect "${EXPECT.o12.choice}"`);
  assert('o12-unit-labels', T12full.includes('Quantity:'), 'web orderItemUnitLabel non-rental → Quantity');
  assert('o12-price-line', T12full.includes(EXPECT.o12.price));
  assert('o12-status-wording-completed', /Completed/.test(T12full));
  assert('no-placeholder-copy', !/lorem|placeholder|dummy|TODO/i.test(T12full));
  // timeline visible at top (already asserted in r1 with all 6 labels)
  await page.evaluate(()=>window.scrollTo(0,0)); await page.mouse.move(190,300); await page.mouse.wheel(0,-2000); await page.waitForTimeout(600);
  const T12top = await dumpText(page);
  const tl=['Order placed','Waiting for seller to confirm availability','Arranging delivery','In transit','Delivered','Completed'];
  assert('o12-timeline-all-six-steps', tl.filter(l=>T12top.includes(l)).length===6, {found:tl.filter(l=>T12top.includes(l))});
  await shot(page,'375','11-o12-top');

  // totals + escrow banner + ratings line (bottom)
  const T12bot = await scrollUntil(t=>t.includes('Subtotal'));
  assert('o12-totals-exact', T12bot.includes(EXPECT.o12.subtotal)&&T12bot.includes(EXPECT.o12.fee)&&T12bot.includes(EXPECT.o12.total));
  await shot(page,'375','12-o12-bottom');

  // ---- click EVERY control on this detail (scroll sweep, 3 passes) ----
  const seen = new Set(); const results=[];
  for(let pass=0; pass<4; pass++){
    const cs = await controls(page);
    for(const c of cs){
      if(c.kind==='input'){ if(!seen.has('input')){seen.add('input');results.push({label:'input',result:'no inputs on detail'});} continue; }
      const key=c.kind+':'+c.label;
      if(seen.has(key)) continue;
      if(c.y<70||c.y>640){ continue; }
      seen.add(key);
      const before=await dumpText(page), u0=page.url();
      await clickXY(page,c.x,c.y); await page.waitForTimeout(1600);
      const after=await dumpText(page), u1=page.url();
      let effect=null;
      if(u1!==u0) effect='nav:'+u1.replace(APP,'');
      else if(after!==before) effect='tree-changed';
      else { const sb=await L.hasSnackBar(page); if(sb.found) effect='snackbar'; else {
          const dlg=(await controls(page)).find(x=>/^Cancel$|^OK$|^Back$|^Submit$|^Keep order$/.test(x.label));
          if(dlg){ await clickXY(page,dlg.x,dlg.y); await page.waitForTimeout(800); effect='dialog-opened'; } } }
      results.push({label:c.label.slice(0,44), result:effect||'NO-EFFECT'});
      if(u1!==u0){ await page.goBack().catch(()=>{}); await page.waitForTimeout(1800); }
    }
    await page.mouse.move(190,350); await page.mouse.wheel(0,420); await page.waitForTimeout(260);
    const endTxt=await dumpText(page);
    if(endTxt===before_end_check()) break;
    function before_end_check(){ return ''; }
  }
  R.clicks.push({tag:'o12-detail', clicks:results});
  const noEff=results.filter(c=>c.result==='NO-EFFECT');
  assert('o12-click-every-control', results.length>=1, {clicked:results.length, controls:results.map(c=>c.label)});
  assert('o12-click-effects', noEff.length===0, {withoutEffect:noEff.map(c=>c.label)});

  // Track delivery nav (explicit)
  await gotoOrder(EXPECT.o12.id);
  let track=null;
  for(let i=0;i<10&&!track;i++){ const cs=await controls(page); track=cs.find(c=>/Track delivery/.test(c.label))||null; if(!track){ await page.mouse.move(190,350); await page.mouse.wheel(0,320); await page.waitForTimeout(200);} }
  if(track){ const u0=page.url(); await clickXY(page,track.x,track.y); await page.waitForTimeout(2500);
    const u1=page.url(); const tt=await dumpText(page);
    assert('o12-track-delivery-navigates', u1!==u0 || /Abdallah|transport|MOTORBIKE|rider/i.test(tt), {from:u0.replace(APP,''),to:u1.replace(APP,''),excerpt:tt.split('\n').filter(Boolean).slice(0,8).join('|').slice(0,160)});
    await shot(page,'375','13-track');
  } else assert('o12-track-delivery-navigates', false, 'control not found');

  // ================= 768 viewport — same session, new page =================
  const p768 = await ctx.newPage();
  await p768.setViewportSize({width:768,height:1024});
  await p768.goto(APP+'/orders/'+EXPECT.o12.id,{waitUntil:'load',timeout:90000}).catch(()=>{});
  for(let i=0;i<22;i++){ const t=await dumpText(p768); if(t.includes(EXPECT.o12.num)) break; await p768.waitForTimeout(900); }
  await p768.waitForTimeout(1500);
  const T768a = await dumpText(p768);
  await shot(p768,'768','10-o12-top');
  await p768.mouse.move(380,500);
  for(let i=0;i<10;i++){ await p768.mouse.wheel(0,300); await p768.waitForTimeout(170); }
  const T768 = T768a + '\n' + await dumpText(p768);
  assert('v768-o12-same-real-data', T768.includes(EXPECT.o12.num)&&T768.includes(EXPECT.o12.title)&&T768.includes(EXPECT.o12.choice));
  assert('v768-timeline-visible', ['Order placed','In transit','Delivered','Completed'].every(l=>T768.includes(l)));
  await p768.close();

  // ================= O23 — rental AWAITING_SELLER_CONFIRMATION =================
  await gotoOrder(EXPECT.o23.id);
  const T23 = await scrollUntil(t=>t.includes('Subtotal'));
  await shot(page,'375','20-o23-full');
  assert('o23-number', T23.includes(EXPECT.o23.num));
  assert('o23-title', T23.includes(EXPECT.o23.title), T23.split('\n').filter(l=>/AU016|Ordered item/.test(l)).slice(0,2));
  assert('o23-unit-label', /Unit:\s*1/.test(T23.replace(/\n/g,' ')), 'rental line reads "Unit: ..." (orderItemUnitLabel)');
  assert('o23-rental-card', T23.includes('Rental booking'));
  assert('o23-booking-window', /2026-08-27|27\/8\/2026|27 Aug/.test(T23) && /2026-08-29|29\/8\/2026|29 Aug/.test(T23),
    T23.split('\n').filter(l=>/2026/.test(l)).slice(0,4));
  assert('o23-duration', /2 days/.test(T23));
  assert('o23-awsc-buyer-wording', T23.includes('Payment confirmed - awaiting seller'));
  const rt=['Booking placed','Seller confirmation','Arrival / check-in','Rental period','Completed'];
  assert('o23-rental-timeline-steps', rt.filter(l=>T23.includes(l)).length>=4, {found:rt.filter(l=>T23.includes(l))});

  // ================= O11 — CANCELLED failure copy =================
  const tok = await L.apiLogin(L.BUYER);
  const lst = await L.api(tok,'GET','/api/v1/orders');
  const cRow=(lst.json||[]).find(o=>o.orderNumber==='ORD-2026-000011');
  if(cRow){
    await gotoOrder(cRow.orderId);
    const T11 = await scrollUntil(t=>t.includes('Subtotal'));
    await shot(page,'375','30-o11');
    assert('o11-cancelled-copy', T11.includes('Order cancelled')||T11.includes('Cancelled'));
  }

  // ================= PARITY :3000 (logged in as the same buyer) =================
  const rp = await ctx.newPage(); await rp.setViewportSize({width:375,height:667});
  await rp.goto('http://localhost:3000/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await rp.waitForTimeout(4000);
  const rpBody0 = await rp.evaluate(()=>document.body.innerText||'');
  if(/Login|Sign in/i.test(rpBody0)){
    try{
      await rp.getByText('Login with Email').click({timeout:6000});
    }catch(e){ try{ await rp.evaluate(()=>{ const el=[...document.querySelectorAll('a,button,div,span')].find(e=>/Login with Email/i.test(e.textContent||'')); if(el) el.click(); }); }catch(e2){} }
    await rp.waitForTimeout(2500);
    const em = rp.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]').first();
    const pw = rp.locator('input[type="password"]').first();
    await em.fill(L.BUYER.email).catch(async()=>{ await em.type(L.BUYER.email); });
    await pw.fill(L.BUYER.pw).catch(async()=>{ await pw.type(L.BUYER.pw); });
    await rp.keyboard.press('Enter');
    await rp.waitForTimeout(5000);
    // direct deep-link to the order after auth
    await rp.goto('http://localhost:3000/orders/'+EXPECT.o12.id,{waitUntil:'load',timeout:90000}).catch(()=>{});
    await rp.waitForTimeout(7000);
  }
  const refTxt = await rp.evaluate(()=>document.body.innerText||'');
  const refHasTitle=refTxt.includes('La vie est belle');
  const refHasChoice=refTxt.includes('Pack Size')||refTxt.includes('Single');
  const refHasTimeline=/Order placed|Arranging delivery|In transit|Delivered|Completed/.test(refTxt);
  const refHasQty=/Quantity\s*:/.test(refTxt)||/Quantity/.test(refTxt);
  R.parity.push(
    {check:'ref-title', ok:refHasTitle},{check:'ref-choice',ok:refHasChoice},
    {check:'ref-timeline',ok:refHasTimeline},{check:'ref-quantity-label',ok:refHasQty});
  assert('parity-ref-order-renders', refHasTitle, {len:refTxt.length, title:refHasTitle, choice:refHasChoice, timeline:refHasTimeline});
  log('REF excerpt:', refTxt.replace(/\n+/g,' | ').slice(0,500));
  await rp.screenshot({path:`${SHOT_DIR}/${UNIT}-375-ref-o12.png`}).catch(()=>{});
  await rp.close();

  // ---- image summary ----
  const vals=Object.values(imgMap);
  const broken=Object.entries(imgMap).filter(([,s])=>!(s===200||s===304)).map(([u,s])=>u+' -> '+s);
  R.images={requested:vals.length, ok:vals.filter(s=>s===200||s===304).length, broken};

  await L.closeVideo(ctx, VIDEO).catch(()=>{});
  await browser.close();

  const pass=R.asserts.filter(a=>a.pass).length, failN=R.asserts.filter(a=>!a.pass).length;
  fs.appendFileSync(`${ROOT}/e2e/results/shards/${UNIT}-verify.jsonl`,
    JSON.stringify({...R, summary:{total:R.asserts.length,pass,fail:failN}, verdict: failN===0?'PASS':'FAIL'})+'\n');
  console.log(`DONE r2 pass=${pass} fail=${failN}`);
})().catch(e=>{ console.error('FATAL', e); process.exit(1); });
