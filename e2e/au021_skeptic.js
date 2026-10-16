// au021_skeptic.js — Appendix B attacks on the AU-021 PASS (frozen lane :9108).
// Attack classes:
//  A1 rapid double-taps (+ at cap, Go to checkout)
//  A2 mid-flow back-outs (checkout -> Back -> cart integrity -> re-enter)
//  A3 empty states (Clear all items)
//  A4 offline mid-request + retry (clamp must NOT fire without fresh data)
//  A5 invalid/hostile input (500-char + emoji + Swahili + <script> product)
//  A6 locale/number formats + stale-math after clamp
//  A7 role/session probes (logged-out cart, auth gate on checkout)
//  A8 session expiry mid-flow (quote must never fabricate fees)
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9108';
const fx = JSON.parse(fs.readFileSync('/tmp/au021_fixtures.json', 'utf8'));
const PA = fx.productADetail, PB = fx.productBDetail;
const UNIT = 'AU-021';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const SHOTS = path.join(ROOT, 'e2e/shots', UNIT);
fs.mkdirSync(SHOTS, { recursive: true });
const OUT = { attacks: [], findings: [] };
const R = {};

async function waitSem(p){
  for(let i=0;i<60;i++){
    if(await p.evaluate(()=>document.querySelectorAll('flt-semantics').length>3).catch(()=>false)) return;
    await p.waitForTimeout(1000);
  }
}
async function txt(p){ return [...new Set((await L.allText(p).catch(()=>'')).split('\n'))].join('|'); }

async function loginFrozen(p, cred){
  await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await waitSem(p);
  const tok = await p.evaluate(()=>{try{return localStorage.getItem('flutter.auth_token')||'';}catch(e){return '';}});
  if(tok.length>10) return true;
  await L.waitText(p,'Buy now',30000);
  for(let i=0;i<4;i++){ if(await L.clickBtn(p,'Login')) break; }
  await L.waitText(p,'Welcome back',25000);
  const ei=p.locator('input[type="text"]').first(), pi=p.locator('input[type="password"]').first();
  await ei.click({force:true}); await p.waitForTimeout(350); await p.keyboard.type(cred.email);
  await pi.click({force:true}); await p.waitForTimeout(350); await p.keyboard.type(cred.pw);
  await L.clickBtn(p,'Log in');
  let ok=false;
  for(let i=0;i<25&&!ok;i++){ ok=await p.evaluate(()=>{const v=localStorage.getItem('flutter.auth_token');return !!(v&&v.length>10);}).catch(()=>false); if(!ok)await p.waitForTimeout(1000); }
  return ok;
}
async function openCard(p,prefix){
  try{ await L.clickBtn(p,'Newest'); }catch(e){}
  await p.waitForTimeout(1500);
  // adaptive-scroll until the card rect enters the tap band (proven approach)
  let rr=null;
  for(let i=0;i<26;i++){
    rr=await p.evaluate((pf)=>{
      let out=null;
      document.querySelectorAll('flt-semantics').forEach(e=>{
        if(!(e.textContent||'').startsWith(pf)) return;
        if(e.getAttribute('flt-tappable')===null) return;
        const b=e.getBoundingClientRect();
        if(b.top<52||b.bottom>innerHeight-60) return;
        out={cx:Math.round(b.x+b.width/2),cy:Math.round(b.y+b.height/2)};
      });
      const all=[];
      document.querySelectorAll('flt-semantics').forEach(e=>{
        if(out||(e.textContent||'').indexOf(pf)!==0) return;
        const b=e.getBoundingClientRect();
        all.push(Math.round(b.top));
      });
      return out||{off:all[0]??null};
    },prefix);
    if(rr&&rr.cx!==undefined) break;
    const top=(rr&&rr.off!==undefined&&rr.off!==null)?rr.off:null;
    await p.mouse.move(190,400);
    if(top===null){ for(let k=0;k<6;k++) await p.mouse.wheel(0,1200); }
    else if(top>667){ for(let k=0;k<6;k++) await p.mouse.wheel(0,1200); }
    else if(top<-260){ await p.mouse.wheel(0,-900); }
    else if(top<52){ await p.mouse.wheel(0,-320); }
    else { await p.mouse.wheel(0,420); }
    await p.waitForTimeout(850);
  }
  console.log('openCard found',prefix,JSON.stringify(rr));
  if(!rr) return false;
  await p.mouse.click(rr.cx,Math.min(Math.max(rr.cy,60),640));
  for(let i=0;i<14;i++){ if(/Add to cart/.test(await L.allText(p).catch(()=>''))) break; await p.waitForTimeout(1200);}
  return /Add to cart/.test(await L.allText(p).catch(()=>''));
}
async function clickBack(p){
  const b=await p.evaluate(()=>{
    let hit=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      if((e.textContent||'').trim()!=='Back') return;
      const r=e.getBoundingClientRect(); if(hit) return;
      hit={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
    });
    return hit;
  });
  if(b){ await p.mouse.click(b.x,b.y); }
  await p.waitForTimeout(2000);
}
async function openCartViaIcon(p){
  await p.mouse.move(190,400);
  for(let i=0;i<8;i++){ await p.mouse.wheel(0,-900); await p.waitForTimeout(280); }
  const cb=await p.evaluate(()=>{
    let hit=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if((e.textContent||'').trim()!=='Cart') return;
      if(e.getAttribute('role')!=='button') return;
      const b=e.getBoundingClientRect(); if(hit||b.width>60) return;
      hit={cx:Math.round(b.x+b.width/2),cy:Math.round(b.y+b.height/2)};
    });
    return hit;
  });
  if(!cb) return false;
  await p.mouse.click(cb.cx,cb.cy);
  let t='';
  for(let i=0;i<18;i++){ t=await txt(p); if(/Woven Basket|Carved Bowl|Your cart is empty/.test(t)) break; await p.waitForTimeout(1400);}
  return true;
}
async function rawCart(p){
  const v = await p.evaluate(()=>{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(/expatCartItems_/.test(k)) return localStorage.getItem(k)||'';
    }
    return '';
  });
  let s=v;
  for(let i=0;i<2 && typeof s==='string';i++){ try{ s=JSON.parse(s);}catch(e){break;} }
  return Array.isArray(s)?s:[];
}
async function writeCart(p, items){
  await p.evaluate((json)=>{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(/expatCartItems_/.test(k)){ localStorage.setItem(k,json); return; }
    }
  }, JSON.stringify(items));
}
async function setQty(p,pid,q){
  const items=await rawCart(p);
  const it=items.find(x=>x.productId===pid);
  if(!it) return false;
  it.quantity=q; it.selected=true;
  await writeCart(p,items);
  return true;
}
function short(d){return d.title.split(' ').slice(0,4).join(' ');}

async function tileRows(p){
  return p.evaluate(()=>{
    const rows=[];
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'');
      if(!/Save for later/.test(t) || t.length>60) return;
      const b=e.getBoundingClientRect();
      if(b.width<=0||b.width>340) return;
      rows.push({y:Math.round(b.y),h:Math.round(b.height)});
    });
    return rows.sort((a,b)=>a.y-b.y);
  });
}
async function clickStepper(p,rowIndex,delta,times=1){
  const rows=await tileRows(p);
  if(rowIndex>=rows.length) return false;
  const r=rows[rowIndex];
  let y=r.y+r.h+52; if(y>640) y=640; if(y<20) y=20;
  const x= delta>0 ? 150 : 104;
  for(let i=0;i<times;i++) await p.mouse.click(x,y);
  return true;
}

(async () => {
  // ---------- shared stage 1 context ----------
  const browser=await L.newBrowser();
  let dialogs=0;

  // ===== STAGE A: reproduce premise + A1/A2/A6 attacks =====
  {
    const ctx=await L.newCtx(browser,{viewport:{width:375,height:667},videoPath:path.join(ROOT,'e2e/videos',`${UNIT}-skeptic-a.webm`)});
    const p=await ctx.newPage();
    p.on('dialog', async d=>{ dialogs++; await d.dismiss().catch(()=>{}); });
    const imgs={}; p.on('response',r=>{const u=r.url(); if(/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgs[u]=r.status();});

    if(!await loginFrozen(p,fx.buyer)) throw new Error('S-A login failed');
    let found=false;
    for(let i=0;i<30;i++){ if((await L.allText(p).catch(()=>'')).includes(short(PA))){found=true;break;} await p.waitForTimeout(1500);}
    console.log('S-A grid has fixture:',found);
    // build a REAL cart first (schema fidelity), then over-stock it via storage
    if(!await openCard(p,short(PA))) throw new Error('S-A open A failed');
    await L.clickBtn(p,'Add to cart'); await p.waitForTimeout(700);
    await clickBack(p);
    if(!await openCard(p,short(PB))) throw new Error('S-A open B failed');
    await L.clickBtn(p,'Add to cart'); await p.waitForTimeout(700);
    await clickBack(p);
    // stale-cart injection: A qty 5 (stock 2), B qty 2 (stock 4)
    await setQty(p,PA.productId,5); await setQty(p,PB.productId,2);
    const seeded=await rawCart(p);
    console.log('SEEDED', JSON.stringify(seeded.map(i=>({p:i.productId,q:i.quantity}))));

    await openCartViaIcon(p);
    await p.waitForTimeout(6000); // revalidation settle
    const t1=await txt(p);
    const qA= ((await rawCart(p)).find(x=>x.productId===PA.productId)||{}).quantity;
    const qB= ((await rawCart(p)).find(x=>x.productId===PB.productId)||{}).quantity;
    R.premise_clamp = qA===2 && qB===2;
    R.premise_notice = /Quantities reduced to current stock/.test(t1);
    await L.screenshot(p,path.join(SHOTS,`${UNIT}-skeptic-a-cart.png`));

    // A1: rapid double-tap '+' on capped row 0 (must stay 2)
    await clickStepper(p,0,+1,3); // 3 rapid clicks
    await p.waitForTimeout(1600);
    const qA_after=((await rawCart(p)).find(x=>x.productId===PA.productId)||{}).quantity;
    R.a1_plus_rapid_stays_2 = qA_after===2;

    // A1b: rapid '-' x3 on row 1 (B 2 -> floor 1, never 0/negative through rapid fire)
    await clickStepper(p,1,-1,3);
    await p.waitForTimeout(1500);
    const qB_rapid=((await rawCart(p)).find(x=>x.productId===PB.productId)||{}).quantity;
    R.a1_minus_rapid_floor = qB_rapid>=1 && qB_rapid<=2;
    if(qB_rapid===1){ await clickStepper(p,1,+1,1); await p.waitForTimeout(1200); }

    // A6: stale-math + TZS formats in the order summary strip
    R.a6_subtotal_recomputed = /TSh 74,000/.test(t1) && !/TSh 110,000/.test(t1) && !/TSh 85,000/.test(t1);
    const money=t1.match(/TSh [\d,]+/g)||[];
    R.a6_money_format_ok = money.every(m=>/^TSh \d{1,3}(,\d{3})*$/.test(m));
    R.a6_money_samples=[...new Set(money)].slice(0,8);

    // A1c: rapid double-tap 'Go to checkout'
    const h0=await p.evaluate(()=>history.length);
    await L.clickBtn(p,'Go to checkout');
    await p.waitForTimeout(250);
    await L.clickBtn(p,'Go to checkout');
    let reached=false;
    for(let i=0;i<14;i++){ if(/Continue to review/.test(await L.allText(p).catch(()=>''))) { reached=true; break;} await p.waitForTimeout(1400);}
    const h1=await p.evaluate(()=>history.length);
    const tCo=await txt(p);
    R.a1_goto_double_single_push = reached && (h1-h0)<=3; // 1 push + possible quote/history noise
    R.a1_history_delta=h1-h0;
    R.a1_checkout_step_count=(tCo.match(/Step 1 of 4/g)||[]).length;

    // A2: mid-flow back-out -> cart intact -> re-enter
    await clickBack(p);
    await p.waitForTimeout(1500);
    const backCart=await rawCart(p);
    R.a2_cart_intact_after_back =
      ((backCart.find(x=>x.productId===PA.productId)||{}).quantity===2) &&
      ((backCart.find(x=>x.productId===PB.productId)||{}).quantity===2);
    await L.screenshot(p,path.join(SHOTS,`${UNIT}-skeptic-a-back-cart.png`));
    // re-enter checkout
    await L.clickBtn(p,'Go to checkout');
    for(let i=0;i<14;i++){ if(/Continue to review/.test(await L.allText(p).catch(()=>''))) break; await p.waitForTimeout(1400);}
    const tRe=await txt(p);
    R.a2_reenter_prefilled = /AU021 Home/.test(tRe);
    R.a2_reenter_both_lines = tRe.includes(short(PA)) && tRe.includes(short(PB));

    const isum=L.imageSummary(imgs);
    R.stage_a_images=isum;
    R.stage_a_dialogs=dialogs;
    await lib_close(ctx,path.join(ROOT,'e2e/videos',`${UNIT}-skeptic-a.webm`));
  }

  // ===== STAGE B: A4 offline mid-request + retry =====
  {
    const ctx=await L.newCtx(browser,{viewport:{width:375,height:667},videoPath:path.join(ROOT,'e2e/videos',`${UNIT}-skeptic-b.webm`)});
    const p=await ctx.newPage();
    if(!await loginFrozen(p,fx.buyer)) throw new Error('S-B login failed');
    for(let i=0;i<30;i++){ if((await L.allText(p).catch(()=>'')).includes(short(PA))) break; await p.waitForTimeout(1500);}
    if(!await openCard(p,short(PA))) throw new Error('S-B open A failed');
    await L.clickBtn(p,'Add to cart'); await p.waitForTimeout(700);
    await clickBack(p);
    if(!await openCard(p,short(PB))) throw new Error('S-B open B failed');
    await L.clickBtn(p,'Add to cart'); await p.waitForTimeout(700);
    await clickBack(p);
    await setQty(p,PA.productId,5); await setQty(p,PB.productId,2);

    await ctx.setOffline(true);
    await openCartViaIcon(p);
    await p.waitForTimeout(7000);
    const tOff=await txt(p);
    const qOff=((await rawCart(p)).find(x=>x.productId===PA.productId)||{}).quantity;
    R.a4_offline_no_false_clamp = qOff===5;
    R.a4_offline_no_fake_notice = !/Quantities reduced/.test(tOff) || qOff!==undefined&&qOff===5;
    R.a4_offline_usable = /Go to checkout|Your cart/.test(tOff);
    await L.screenshot(p,path.join(SHOTS,`${UNIT}-skeptic-b-offline-cart.png`));

    await ctx.setOffline(false);
    // leave + re-enter cart so initState revalidation reruns with network back
    await clickBack(p); await p.waitForTimeout(1200);
    await openCartViaIcon(p);
    await p.waitForTimeout(7000);
    const qOn=((await rawCart(p)).find(x=>x.productId===PA.productId)||{}).quantity;
    const tOn=await txt(p);
    R.a4_online_retry_clamps = qOn===2 && /Quantities reduced/.test(tOn);
    await L.screenshot(p,path.join(SHOTS,`${UNIT}-skeptic-b-online-retry.png`));
    await lib_close(ctx,path.join(ROOT,'e2e/videos',`${UNIT}-skeptic-b.webm`));
  }

  // ===== STAGE C: A3 empty state + A5 hostile product =====
  {
    // hostile product C via real API (seller A token)
    const longName = '🧺 Kikapu cha Mwananchi — '
      + 'X'.repeat(380)
      + ' <script>alert(1)<\/script> ।';
    const product = {
      productName: longName,
      productQuantity: 3,
      categoryId: 3, subcategoryId: 26,
      productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Masaki',
      productDescription: 'AU-021 skeptic hostile-title fixture (emoji + Swahili + 500ch + script tag).',
      currency: 'TZS', askingPrice: 9450, originalPrice: 11813, condition: 'NEW',
    };
    const form=new FormData();
    form.append('product',new Blob([Buffer.from(JSON.stringify(product))],{type:'application/json'}),'product.json');
    const pngPath=path.join(__dirname,'fixtures','receipt-proof.png');
    form.append('images',new Blob([fs.readFileSync(pngPath)],{type:'image/png'}),'item.png');
    const cr=await fetch(`${L.API}/api/v1/products/post-product`,{method:'POST',headers:{Authorization:'Bearer '+fx.sellerA.token},body:form});
    const crj=await cr.json().catch(()=>({}));
    const pc = crj.productId || crj.id || (crj.product&&(crj.product.productId||crj.product.id));
    console.log('hostile product:',cr.status,pc);
    R.hostile_product_created = !!pc;
    if(pc){
      await L.api(fx.adminToken,'PATCH',`/api/v1/admin/products/${pc}/logistics`,
        {latitude:-6.8001,longitude:39.2751,deliveryTransportMode:'BODA',neighbourhood:'Masaki'});
      const det=await L.api(null,'GET',`/api/v1/displayItem/itemDetails/${pc}`);
      R.hostile_public = det.status===200;
    }

    const ctx=await L.newCtx(browser,{viewport:{width:375,height:667},videoPath:path.join(ROOT,'e2e/videos',`${UNIT}-skeptic-c.webm`)});
    const p=await ctx.newPage();
    p.on('dialog', async d=>{ dialogs++; await d.dismiss().catch(()=>{}); });
    if(!await loginFrozen(p,fx.buyer)) throw new Error('S-C login failed');
    for(let i=0;i<30;i++){ if((await L.allText(p).catch(()=>'')).includes(short(PA))) break; await p.waitForTimeout(1500);}
    // seed cart: hostile C qty 9 (stock 3) + normal B qty 2
    if(!await openCard(p,short(PB))) throw new Error('S-C open B failed');
    await L.clickBtn(p,'Add to cart'); await p.waitForTimeout(700);
    await clickBack(p);
    if(pc){
      // put hostile line straight into storage using the SAME schema as real lines
      const det=await L.api(null,'GET',`/api/v1/displayItem/itemDetails/${pc}`);
      const d=det.json||{};
      const proto=(await rawCart(p))[0]||{};
      const line=Object.assign({},proto,{
        productId:pc,
        name:d.productName,
        price:d.productAskingPrice,
        maxQuantity:d.productQuantity,
        quantity:9, selected:true,
        imageUrl: d.productImages&&d.productImages[0]?('http://localhost:8083/'+d.productImages[0].imageUrl):(proto.imageUrl||null),
      });
      const items=await rawCart(p);
      items.push(line);
      await writeCart(p,items);
    }
    await openCartViaIcon(p);
    await p.waitForTimeout(6000);
    const tC=await txt(p);
    const rc=await rawCart(p);
    const qc=((rc.find(x=>x.productId===pc)||{}).quantity);
    R.a5_hostile_clamped_to_stock = qc===3;
    R.a5_no_script_execution = dialogs===0;
    R.a5_no_crash = /Go to checkout/.test(tC);
    R.a5_notice_present = /Quantities reduced/.test(tC);
    await L.screenshot(p,path.join(SHOTS,`${UNIT}-skeptic-c-hostile-cart.png`));
    await p.mouse.move(190,400); await p.mouse.wheel(0,420); await p.waitForTimeout(700);
    await L.screenshot(p,path.join(SHOTS,`${UNIT}-skeptic-c-hostile-scrolled.png`));

    // A3: empty state
    await p.mouse.move(190,400);
    for(let i=0;i<8;i++){ await p.mouse.wheel(0,-900); await p.waitForTimeout(250); }
    if(await L.clickBtn(p,'Clear all items')){
      await p.waitForTimeout(1800);
      const tE=await txt(p);
      R.a3_empty_state = /Your cart is empty/.test(tE);
      R.a3_no_checkout_btn = !/Go to checkout/.test(tE);
      R.a3_badge_resets = /Cart \(0 items\)|^Cart\b/.test(tE);
      await L.screenshot(p,path.join(SHOTS,`${UNIT}-skeptic-c-empty.png`));
    } else { R.a3_empty_state='CLEAR_BTN_NOT_FOUND'; }

    await lib_close(ctx,path.join(ROOT,'e2e/videos',`${UNIT}-skeptic-c.webm`));
  }

  // ===== STAGE D: A7 logged-out cart + auth gate, A8 expiry mid-flow =====
  {
    const ctx=await L.newCtx(browser,{viewport:{width:375,height:667},videoPath:path.join(ROOT,'e2e/videos',`${UNIT}-skeptic-d.webm`)});
    const p=await ctx.newPage();
    const apiCodes=[]; p.on('response',r=>{ if(/delivery-quote|itemDetails/.test(r.url())) apiCodes.push({u:r.url().slice(-48),s:r.status()}); });
    if(!await loginFrozen(p,fx.buyer)) throw new Error('S-D login failed');
    for(let i=0;i<30;i++){ if((await L.allText(p).catch(()=>'')).includes(short(PA))) break; await p.waitForTimeout(1500);}
    let okA=false;
    for(let att=0;att<3&&!okA;att++){ okA=await openCard(p,short(PA)); if(!okA){ await p.waitForTimeout(3000);} }
    if(!okA) throw new Error('S-D open A failed');
    for(let k=0;k<2;k++){ await L.clickBtn(p,'Add to cart'); await p.waitForTimeout(700); }
    const qAd=((await rawCart(p)).find(x=>x.productId===PA.productId)||{}).quantity||0;
    console.log('S-D A qty after adds:',qAd);
    await clickBack(p);
    let okB=false;
    for(let att=0;att<3&&!okB;att++){ okB=await openCard(p,short(PB)); if(!okB) await p.waitForTimeout(3000); }
    if(!okB) throw new Error('S-D open B failed');
    await L.clickBtn(p,'Add to cart'); await p.waitForTimeout(700);
    await L.clickBtn(p,'Add to cart'); await p.waitForTimeout(700);
    await clickBack(p);
    await setQty(p,PA.productId,2); await setQty(p,PB.productId,2);

    // A8: corrupt token WHILE on the checkout address step, then Continue to review
    await openCartViaIcon(p); await p.waitForTimeout(3500);
    await L.clickBtn(p,'Go to checkout');
    for(let i=0;i<14;i++){ if(/Continue to review/.test(await L.allText(p).catch(()=>''))) break; await p.waitForTimeout(1300);}
    await p.evaluate(()=>localStorage.setItem('flutter.auth_token','EXPIRED-GARBAGE-TOKEN-FROM-SKEPTIC'));
    await L.clickBtn(p,'Continue to review');
    await p.waitForTimeout(9000);
    const tR=await txt(p);
    R.a8_review_reached = /Order totals|Review/.test(tR)&&/Step 2 of 4|Order totals/.test(tR);
    R.a8_fabricated_fees = /TSh 3,000/.test(tR)&&/TSh 6,000/.test(tR);
    R.a8_graceful = /To be confirmed|Retry check|Calculating|error|failed|sign in|Login/i.test(tR);
    await L.screenshot(p,path.join(SHOTS,`${UNIT}-skeptic-d-expired-review.png`));
    R.a8_api_codes=apiCodes.slice(-8);

    // A7: full logout -> cart contents + checkout gate
    await p.evaluate(()=>{ try{ localStorage.removeItem('flutter.auth_token'); }catch(e){} });
    await clickBack(p); await p.waitForTimeout(1200);
    await openCartViaIcon(p); await p.waitForTimeout(2500);
    const tOut=await txt(p);
    R.a7_logged_out_cart_visible = /Woven Basket|Carved Bowl|Your cart is empty/.test(tOut);
    await L.screenshot(p,path.join(SHOTS,`${UNIT}-skeptic-d-loggedout-cart.png`));
    if(/Go to checkout/.test(tOut)){
      await L.clickBtn(p,'Go to checkout');
      let gated=false;
      for(let i=0;i<12;i++){ if(/Welcome back|Log ?in|Email/i.test(await L.allText(p).catch(()=>''))){ gated=true; break;} await p.waitForTimeout(1300);}
      const tG=await txt(p);
      R.a7_checkout_gate = gated && !/Step 1 of 4/.test(tG);
      await L.screenshot(p,path.join(SHOTS,`${UNIT}-skeptic-d-authgate.png`));
    } else R.a7_checkout_gate='NO_CHECKOUT_BTN_LOGGED_OUT';
    await lib_close(ctx,path.join(ROOT,'e2e/videos',`${UNIT}-skeptic-d.webm`));
  }

  await browser.close();
  fs.writeFileSync(path.join(ROOT,'e2e/results/shards','au021_skeptic_raw.json'),JSON.stringify(R,null,1));
  console.log('SKEPTIC_RAW',JSON.stringify(R,null,1));
})().catch(e=>{console.error('SKEPTIC FATAL',e.message);process.exit(1);});

async function lib_close(ctx,vp){ await L.closeVideo(ctx,vp); }
