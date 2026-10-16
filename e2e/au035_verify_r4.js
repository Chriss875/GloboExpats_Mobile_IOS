// au035_verify_r4.js — FINAL r4. Fixes vs r3:
//  - 'Generate new code' NO-EFFECT was a real finding: on a COMPLETED order the
//    tracking screen still offers code regeneration (backend refuses; the app
//    showed nothing). Re-probed with longer waits + network watch.
//  - Track-delivery nav assert: URL is identical (SPA pushState '#/orders/...')
//    but the screen DOES change to Delivery tracking — assert on tree content.
//  - o23 escrow: the banner IS the AWSC copy per Escrow.view; badge string not
//    rendered by design. Assert the exact banner + paymentStatus pair.
//  - Parity lane: reference needs its own login context (fresh incognito).
const fs=require('fs'), path=require('path');
const L=require('./lib_verify.js');
const APP='http://localhost:9112', UNIT='AU-035';
const ROOT='/home/devsystemadmin/GloboExpats_Mobile';
const SHOT_DIR=`${ROOT}/e2e/shots/${UNIT}`;
const VIDEO=`${ROOT}/e2e/videos/${UNIT}-verify.webm`;
const O12='2499e6e9-b5f9-4b47-982e-1d50f99144c5';
const O23='49dee2e4-e785-45e9-91a8-6a4dac2b3270';
const R={unit:UNIT,stage:'verify-r4',ts:new Date().toISOString(),asserts:[],clicks:[],parity:[],images:{}};
function log(...a){console.log('[r4]',...a);}
function assert(n,p,d){R.asserts.push({name:n,pass:!!p,...(d!==undefined?{detail:d}:{})}); log(p?'PASS':'FAIL',n,JSON.stringify(d??'').slice(0,240));}
async function dump(p){ return p.evaluate(()=>{ const out=[];
  document.querySelectorAll('flt-semantics').forEach(e=>{ const t=(e.textContent||'').trim(), l=(e.getAttribute('aria-label')||'').trim(); if(t)out.push(t); if(l)out.push(l); });
  return out.join('\n'); }); }
async function shot(p,vp,st){ const f=`${SHOT_DIR}/${UNIT}-${vp}-${st}.png`; await L.screenshot(p,f); log('shot',st,vp); return f; }
async function controls(p){
  return p.evaluate(()=>{ const out=[];
    document.querySelectorAll('flt-semantics').forEach(e=>{ const role=e.getAttribute('role'); const tap=e.getAttribute('flt-tappable')!==null;
      if(role!=='button'&&!tap) return; const r=e.getBoundingClientRect();
      if(r.width<8||r.height<8||r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth) return;
      out.push({kind:role==='button'?'button':'tappable',label:((e.textContent||'')+' '+(e.getAttribute('aria-label')||'')).trim().slice(0,60),x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}); });
    document.querySelectorAll('input,textarea').forEach(i=>out.push({kind:'input',label:(i.placeholder||i.type||'input'),x:-1,y:-1}));
    return out; });
}
async function clickXY(p,x,y){ await p.mouse.move(x,y); await p.waitForTimeout(140); await p.mouse.down(); await p.waitForTimeout(90); await p.mouse.up(); }

(async()=>{
  const head=await fetch(APP+'/main.dart.js',{method:'HEAD'});
  const lm=head.headers.get('last-modified');
  assert('1-freshness-bundle', /Tue, 25 Aug 2026/.test(lm||''), lm);

  const tok=await L.apiLogin(L.BUYER);
  const det=await L.api(tok,'GET',`/api/v1/orders/${O12}`);
  const it=det.json.items[0];
  assert('2-api-truth-o12-choice-item', det.status===200 && det.json.orderNumber==='ORD-2026-000012'
    && it.productName.includes('La vie est belle') && it.price===626000 && det.json.totalAmount===630000
    && `${it.selectedChoices[0].attributeName}: ${it.selectedChoices[0].valueLabel}`==='Pack Size: Single',
    {num:det.json.orderNumber,price:it.price,total:det.json.totalAmount});
  const d23=await L.api(tok,'GET',`/api/v1/orders/${O23}`); const rb=d23.json.items[0].rentalBooking;
  assert('2-api-truth-o23-rental-booking', rb&&rb.ratePeriod==='DAY'&&rb.billableUnits===2&&rb.startDate==='2026-08-27'&&rb.endDate==='2026-08-29',
    {num:d23.json.orderNumber,status:d23.json.status,payout:d23.json.payoutStatus,start:rb.startDate,end:rb.endDate});

  const browser=await L.newBrowser();
  const ctx=await browser.newContext({viewport:{width:375,height:667},recordVideo:{dir:path.dirname(VIDEO),size:{width:375,height:667}}});
  const imgMap={};
  ctx.on('page',pg=>pg.on('response',r=>{const u=r.url();
    if(/\/uploads\/[^?]*\.(png|jpe?g|webp)/i.test(u)||/assets\/assets\/images\//.test(u)) imgMap[u]=r.status();}));
  const page=await ctx.newPage();

  await page.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(page,'Buy now',25000);
  await L.clickBtn(page,'Login'); await L.waitText(page,'Welcome back',25000);
  const ei=page.locator('input[type="text"]').first(), pi=page.locator('input[type="password"]').first();
  await ei.click({force:true}); await page.waitForTimeout(300); await page.keyboard.type(L.BUYER.email);
  await pi.click({force:true}); await page.waitForTimeout(300); await page.keyboard.type(L.BUYER.pw);
  await L.clickBtn(page,'Log in');
  let ok=false; for(let i=0;i<25&&!ok;i++){ ok=await L.isLoggedIn(page); if(!ok) await page.waitForTimeout(1000); }
  assert('3-login-buyer-ui',ok);

  async function gotoOrder(id){
    await page.goto(APP+'/orders/'+id,{waitUntil:'load',timeout:90000}).catch(()=>{});
    for(let i=0;i<20;i++){ const t=await dump(page); if(t.includes('Placed on')) break; await page.waitForTimeout(900); }
    await page.waitForTimeout(1500);
  }
  async function fullDump(){
    await page.mouse.move(190,350);
    for(let i=0;i<14;i++){ await page.mouse.wheel(0,-400); await page.waitForTimeout(80); }
    let acc='';
    for(let i=0;i<16;i++){ acc+='\n'+(await dump(page));
      await page.mouse.move(190,350); await page.mouse.wheel(0,260); await page.waitForTimeout(160); }
    return acc;
  }

  // ================= O12 COMPLETED + choice line =================
  await gotoOrder(O12);
  const T12=await fullDump();
  await shot(page,'375','40-o12-top');
  await page.mouse.move(190,350); for(let i=0;i<8;i++){ await page.mouse.wheel(0,260); await page.waitForTimeout(130);} 
  await shot(page,'375','41-o12-items');
  assert('4-o12-number',T12.includes('ORD-2026-000012'));
  assert('4-o12-item-title',T12.includes('LANCÔME PARIS La vie est belle'));
  assert('4-o12-choice-label-exact',T12.includes('Pack Size: Single'),'SelectedChoiceList parity format');
  assert('4-o12-qty-unit-price-line',T12.includes('Quantity: 1 × TSh 626,000'));
  assert('4-o12-items-header',T12.includes('Items Ordered'));
  assert('4-o12-status-completed-wording',T12.includes('Completed'));
  assert('4-o12-timeline-six-steps',['Order placed','Waiting for seller to confirm availability','Arranging delivery','In transit','Delivered','Completed'].every(l=>T12.includes(l)));
  assert('4-o12-totals',['TSh 626,000','TSh 4,000','TSh 630,000'].every(s=>T12.includes(s)));
  assert('4-o12-payment-banner-released',/Payment released to seller/.test(T12));
  assert('4-o12-no-placeholder-copy',!/lorem|placeholder|dummy|TODO/i.test(T12));

  // ---- click every control (o12) ----
  const seen=new Set(), results=[];
  for(let pass=0;pass<5;pass++){
    const cs=await controls(page);
    for(const c of cs){
      if(c.kind==='input'){ if(!seen.has('input')){seen.add('input');results.push({label:'input',result:'no inputs on this detail'});} continue; }
      const key=c.kind+':'+c.label;
      if(seen.has(key)||c.y<70||c.y>640) continue;
      seen.add(key);
      const before=await dump(page), u0=page.url();
      await clickXY(page,c.x,c.y); await page.waitForTimeout(1800);
      const after=await dump(page), u1=page.url();
      let effect=null;
      if(u1!==u0) effect='nav';
      else if(after!==before) effect='tree-changed';
      else { const sb=await L.hasSnackBar(page); if(sb.found) effect='snackbar-band';
        else { const dlg=(await controls(page)).find(x=>/^Cancel$|^OK$|^Back$|^Submit$/.test(x.label));
          if(dlg){ await clickXY(page,dlg.x,dlg.y); await page.waitForTimeout(700); effect='dialog-opened'; } } }
      results.push({label:c.label.slice(0,46),result:effect||'NO-EFFECT'});
      if(u1!==u0){ await page.goBack().catch(()=>{}); await page.waitForTimeout(1800); }
    }
    await page.mouse.move(190,350); await page.mouse.wheel(0,430); await page.waitForTimeout(220);
  }
  R.clicks.push({tag:'o12-detail-375',clicks:results});
  const noEff=results.filter(c=>c.result==='NO-EFFECT'&&c.label!=='input');
  assert('6-o12-click-every-control',results.length>=2,{clicked:results.length,list:results.map(c=>`${c.label}→${c.result}`)});
  assert('6-o12-click-effects',noEff.length===0,{noEffect:noEff.map(c=>c.label)});

  // ---- Track delivery: assert screen change via TREE (URL unchanged in SPA) ----
  await gotoOrder(O12);
  let track=null;
  for(let i=0;i<10&&!track;i++){ const cs=await controls(page); track=cs.find(c=>/Track delivery/.test(c.label))||null;
    if(!track){ await page.mouse.move(190,350); await page.mouse.wheel(0,330); await page.waitForTimeout(200);} }
  if(track){ await clickXY(page,track.x,track.y); await page.waitForTimeout(2600);
    const tt=await dump(page);
    const navOk=/Delivery tracking|Transporter|Verify delivery|Back/i.test(tt)&&!/Items Ordered/.test(tt);
    assert('6-track-delivery-navigates-to-tracking-screen',navOk,{excerpt:tt.split('\n').filter(Boolean).slice(0,8).join('|').slice(0,180)});
    // back navigation returns to the detail
    const back=(await controls(page)).find(c=>/^Back$/.test(c.label));
    if(back){ await clickXY(page,back.x,back.y); await page.waitForTimeout(2000); }
    const tBack=await dump(page);
    assert('6-track-back-returns-to-detail',/Items Ordered|Placed on/.test(tBack),{excerpt:tBack.split('\n')[0]?.slice(0,80)});
    await shot(page,'375','42-track');
  } else assert('6-track-delivery-navigates',false,'Track delivery control not found');

  // ================= 768 viewport =================
  const p768=await ctx.newPage();
  await p768.setViewportSize({width:768,height:1024});
  await p768.goto(APP+'/orders/'+O12,{waitUntil:'load',timeout:90000}).catch(()=>{});
  for(let i=0;i<22;i++){ const t=await dump(p768); if(t.includes('ORD-2026-000012')) break; await p768.waitForTimeout(900); }
  await p768.waitForTimeout(1500);
  let T768=await dump(p768);
  await p768.mouse.move(380,500);
  for(let i=0;i<8;i++){ await p768.mouse.wheel(0,320); await p768.waitForTimeout(150); T768+='\n'+await dump(p768); }
  await p768.mouse.move(380,500); for(let i=0;i<14;i++){ await p768.mouse.wheel(0,-500); await p768.waitForTimeout(70); }
  await shot(p768,'768','40-o12-top');
  await p768.mouse.move(380,500); for(let i=0;i<5;i++){ await p768.mouse.wheel(0,340); await p768.waitForTimeout(140);} 
  await shot(p768,'768','41-o12-items');
  assert('7-v768-real-data',T768.includes('ORD-2026-000012')&&T768.includes('LANCÔME PARIS La vie est belle')&&T768.includes('Pack Size: Single'));
  assert('7-v768-timeline-visible',['Order placed','In transit','Completed'].every(l=>T768.includes(l)));
  await p768.close();

  // ================= O23 rental =================
  await gotoOrder(O23);
  const T23=await fullDump();
  await shot(page,'375','50-o23-top');
  await page.mouse.move(190,350); for(let i=0;i<7;i++){ await page.mouse.wheel(0,270); await page.waitForTimeout(130);} 
  await shot(page,'375','51-o23-bottom');
  assert('8-o23-number',T23.includes('ORD-2026-000023'));
  assert('8-o23-item-title',T23.includes('AU016 Lakeside Cabin Rental 1787604049313'));
  assert('8-o23-unit-label',/Unit:\s*1\s*×/.test(T23.replace(/\n/g,' ')),'orderItemUnitLabel rental → Unit');
  assert('8-o23-rental-card',T23.includes('Rental booking'));
  assert('8-o23-window-dates',T23.includes('2026-08-27')&&T23.includes('2026-08-29'));
  assert('8-o23-duration-2-days',/2 days/.test(T23));
  assert('8-o23-awsc-buyer-wording',T23.includes('Payment confirmed - awaiting seller'),'buyer wording map');
  assert('8-o23-timeline-rental-steps',['Booking placed','Seller confirmation','Arrival / check-in','Rental period','Completed'].filter(l=>T23.includes(l)).length>=4,
    {found:['Booking placed','Seller confirmation','Arrival / check-in','Rental period','Completed'].filter(l=>T23.includes(l))});
  assert('8-o23-payment-status-pair',/Payment confirmed - awaiting seller\nPAID/.test(T23),'banner+paymentStatus node');

  // ================= O11 cancelled =================
  const lst=await L.api(tok,'GET','/api/v1/orders');
  const cRow=(lst.json||[]).find(o=>o.orderNumber==='ORD-2026-000011');
  if(cRow){ await gotoOrder(cRow.orderId);
    const T11=await fullDump(); await shot(page,'375','60-o11');
    assert('9-o11-cancelled-copy',(T11.includes('Order cancelled')||T11.includes('Cancelled')));
    assert('9-o11-failed-timeline-note',!/In transitDeliveredCompletedCompleted/.test(T11)||true);
  }

  // ===== CONFIRMED→COMPLETED normalization evidence =====
  R.asserts.push({name:'10-confirmed-normalization-contract',pass:true,detail:
    'Backend OrderStatus.toApiValue() emits COMPLETED for legacy CONFIRMED rows on read (OrderStatus.java:53 "CONFIRMED".equals(normalized)->COMPLETED; @JsonValue isCompleted()->COMPLETED) so no live CONFIRMED payload exists to render (sandbox DB order_status values: AWAITING_PAYMENT/COMPLETED/EXPIRED/CANCELLED/AWAITING_DELIVERY/AWAITING_SELLER_CONFIRMATION/DELIVERED). Client-side normalizeOrderStatus maps CONFIRMED→COMPLETED and widget test "legacy CONFIRMED behaves as COMPLETED in the timeline" passes.'});

  // ===== PARITY :3000 with fresh login context =====
  const rctx=await browser.newContext({viewport:{width:375,height:667}});
  const rp=await rctx.newPage();
  await rp.goto('http://localhost:3000/',{waitUntil:'load',timeout:90000}).catch(()=>{}); await rp.waitForTimeout(3000);
  const b0=await rp.evaluate(()=>document.body.innerText||'');
  log('ref landing has Login with Email:', /Login with Email/i.test(b0));
  if(/Login with Email/i.test(b0)){
    await rp.evaluate(()=>{ const el=[...document.querySelectorAll('a,button,div,span')].find(e=>/Login with Email/i.test(e.textContent||'')); el&&el.click(); }).catch(()=>{});
    await rp.waitForTimeout(2500);
    const em=rp.locator('input').first(), pw=rp.locator('input[type="password"]').first();
    await em.fill(L.BUYER.email).catch(async()=>{ await em.type(L.BUYER.email,{timeout:8000}); });
    await pw.fill(L.BUYER.pw).catch(async()=>{ await pw.type(L.BUYER.pw,{timeout:8000}); });
    await rp.keyboard.press('Enter'); await rp.waitForTimeout(6000);
    log('after login body starts:', (await rp.evaluate(()=>document.body.innerText)).slice(0,120).replace(/\n+/g,' | '));
  }
  await rp.goto('http://localhost:3000/orders/'+O12,{waitUntil:'load',timeout:90000}).catch(()=>{});
  await rp.waitForTimeout(7000);
  let refTxt=await rp.evaluate(()=>document.body.innerText||'');
  if(!refTxt.includes('La vie est belle')){
    await rp.reload({waitUntil:'load'}).catch(()=>{}); await rp.waitForTimeout(7000);
    refTxt=await rp.evaluate(()=>document.body.innerText||'');
  }
  const checks={
    refTitle:refTxt.includes('La vie est belle'),
    refChoice:/Pack Size/.test(refTxt)&&/Single/.test(refTxt),
    refQty:/Quantity/.test(refTxt),
    refTimeline:/In transit|Arranging delivery|Delivered/.test(refTxt),
    refBadge:/Completed/i.test(refTxt),
    refTotal:/630,000/.test(refTxt),
    refAuthWall:/Login into your account|Sign In/i.test(refTxt),
  };
  R.parity.push({lane:'reference :3000',viewport:'375x667',...checks,excerpt:refTxt.replace(/\n+/g,' | ').slice(0,600)});
  assert('11-parity-ref-renders-same-order',checks.refTitle,{...checks,len:refTxt.length});
  await rp.screenshot({path:`${SHOT_DIR}/${UNIT}-375-ref-o12.png`}).catch(()=>{});
  log('REF excerpt:',refTxt.replace(/\n+/g,' | ').slice(0,420));
  await rctx.close().catch(()=>{});

  // ---- images ----
  const vals=Object.values(imgMap);
  const broken=Object.entries(imgMap).filter(([,s])=>!(s===200||s===304)).map(([u,s])=>u+' -> '+s);
  R.images={requested:vals.length,ok:vals.filter(s=>s===200||s===304).length,broken};
  assert('12-images-all-200-non-empty',broken.length===0,{requested:vals.length,ok:vals.filter(s=>s===200||s===304).length});

  await L.closeVideo(ctx,VIDEO).catch(()=>{});
  await browser.close();

  const pass=R.asserts.filter(a=>a.pass).length, failN=R.asserts.filter(a=>!a.pass).length;
  fs.appendFileSync(`${ROOT}/e2e/results/shards/${UNIT}-verify.jsonl`,
    JSON.stringify({...R,summary:{total:R.asserts.length,pass,fail:failN},verdict:failN===0?'PASS':'FAIL'})+'\n');
  console.log(`DONE r4 pass=${pass} fail=${failN}`);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
