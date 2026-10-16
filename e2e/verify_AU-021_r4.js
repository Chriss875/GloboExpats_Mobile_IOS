// verify_AU-021_r4.js — FINAL RW-lane real-browser verification of AU-021
// (cart_qty_revalidation_grouping_r2) against FROZEN bundle :9108.
//
// Proven flow (dry-runs r1..r3): login -> home grid cards -> Add to cart xN ->
// Back to shell home -> scroll top -> Cart ICON opens CartScreen in-session
// (deep-link /cart cold-load renders home — router quirk, noted in report).
//
// Evidence captured: itemDetails refetch counts (network), qty clamp + notice
// text, seller-group headers, stepper behavior at cap, checkout review fees.
const fs = require('fs');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9108';
const fx = JSON.parse(fs.readFileSync('/tmp/au021_fixtures.json', 'utf8'));
const PA = fx.productADetail, PB = fx.productBDetail;
const UNIT = 'AU-021';
const SHOTS = `e2e/shots/${UNIT}`;
fs.mkdirSync(SHOTS, { recursive: true });

const OUT = { fetches: {}, quotes: {}, images: {}, checksM: {}, checksT: {} };

async function waitSem(p){
  for(let i=0;i<60;i++){
    if(await p.evaluate(()=>document.querySelectorAll('flt-semantics').length>3).catch(()=>false)) return;
    await p.waitForTimeout(1000);
  }
}
async function loginFrozen(p, cred){
  await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await waitSem(p);
  if(await p.evaluate(()=>{try{return !!(localStorage.getItem('flutter.auth_token')||'').length&&localStorage.getItem('flutter.auth_token').length>10;}catch(e){return false;}})) return true;
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
  await p.mouse.move(190,400); await p.mouse.wheel(0,-2600); await p.waitForTimeout(900);
  for(let s=0;s<14;s++){
    const rr=await p.evaluate((pf)=>{
      let out=null;
      document.querySelectorAll('flt-semantics').forEach(e=>{
        if(!(e.textContent||'').startsWith(pf)) return;
        if(e.getAttribute('flt-tappable')===null) return;
        const b=e.getBoundingClientRect();
        if(b.top<90||b.bottom>innerHeight-140) return;
        if(!out) out={cx:Math.round(b.x+b.width/2),cy:Math.round(b.y+b.height/2)};
      });
      return out;
    },prefix);
    if(rr){
      await p.mouse.click(rr.cx,Math.min(rr.cy,640));
      for(let i=0;i<12;i++){ if(/Add to cart/.test(await L.allText(p).catch(()=>''))) break; await p.waitForTimeout(1200);}
      if(/Add to cart/.test(await L.allText(p).catch(()=>''))) return true;
    }
    await p.mouse.wheel(0,300); await p.waitForTimeout(1100);
  }
  return false;
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
  await p.waitForTimeout(2200);
}
async function openCartViaIcon(p){
  await p.mouse.move(190,400);
  for(let i=0;i<8;i++){ await p.mouse.wheel(0,-900); await p.waitForTimeout(320); }
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
  let txt='';
  for(let i=0;i<18;i++){ txt=[...new Set((await L.allText(p).catch(()=>'')).split('\n'))].join('|'); if(/Woven Basket|Your cart is empty/.test(txt)) break; await p.waitForTimeout(1500);}
  return /Woven Basket/.test(txt);
}
async function rawCart(p){
  const v = await p.evaluate(()=>{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(/expatCartItems_/.test(k)) return localStorage.getItem(k)||'';
    }
    return '';
  });
  // shared_preferences web stores the string as-is; KvStore.setJson wrote
  // jsonEncode(list) — but sp may double-wrap. Unwrap up to twice.
  let s = v;
  for (let i=0;i<2 && typeof s==='string';i++){
    try { s = JSON.parse(s); } catch(e){ break; }
  }
  return Array.isArray(s) ? s : [];
}
async function readQty(p,pid){
  const items=await rawCart(p);
  const it=(items||[]).find(x=>x.productId===pid);
  return it?it.quantity:0;
}

async function runViewport(browser, w, h, tag, videoName){
  const S={};
  S.images={}; S.fetches=0; S.quotes=0;
  const ctx=await L.newCtx(browser,{viewport:{width:w,height:h},videoPath:`e2e/videos/${videoName}`});
  const p=await ctx.newPage();
  p.on('response',r=>{
    const u=r.url();
    if(/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) S.images[u]=r.status();
    if(/itemDetails\/64[01]/.test(u)) S.fetches++;
    if(/checkout\/delivery-quote/.test(u)) S.quotes++;
  });
  if(!await loginFrozen(p,fx.buyer)) throw new Error('login failed '+tag);
  console.log(tag,'logged in');
  for(let i=0;i<30;i++){ if((await L.allText(p).catch(()=>'')).includes(short(PA))) break; await p.waitForTimeout(1500);}

  // --- add A x5 (stock is 2 -> revalidation will clamp)
  if(!await openCard(p,short(PA))) throw new Error(tag+': open A failed');
  for(let k=0;k<5;k++){ await L.clickBtn(p,'Add to cart'); await p.waitForTimeout(650); }
  console.log(tag,'added A x5; persisted qty:', await readQty(p,PA.productId));
  await clickBack(p);

  // --- add B x2 (stock 4 -> untouched)
  if(!await openCard(p,short(PB))) throw new Error(tag+': open B failed');
  for(let k=0;k<2;k++){ await L.clickBtn(p,'Add to cart'); await p.waitForTimeout(650); }
  console.log(tag,'added B x2; persisted qty:', await readQty(p,PB.productId));
  await clickBack(p);

  // --- open the cart via the header icon (in-session)
  const opened=await openCartViaIcon(p);
  console.log(tag,'cart opened with lines:',opened);
  await p.waitForTimeout(6000); // revalidation settle

  // collect FULL semantics by scrolling the cart viewport region
  let all='';
  await p.mouse.move(w/2,Math.min(h*0.55,380));
  await p.mouse.wheel(0,-800); await p.waitForTimeout(700);
  for(let s=0;s<5;s++){
    all+='||'+[...new Set((await L.allText(p).catch(()=>'')).split('\n'))].join('|');
    await p.mouse.wheel(0,180); await p.waitForTimeout(700);
  }
  const cartTxt=all;
  fs.writeFileSync(`/tmp/au021_cart_${tag}.txt`,cartTxt.slice(0,12000));
  await p.mouse.move(w/2,300); await p.mouse.wheel(0,-1200); await p.waitForTimeout(800);
  await L.screenshot(p,`${SHOTS}/${UNIT}-${tag}-cart.png`);

  const flat=cartTxt.replace(/\n/g,'|');
  const c={};
  c.cart_open_with_lines   = opened;
  c.badge_and_title        = /Cart \(\d+ items?\)/.test(flat);
  c.group_a_title          = flat.includes(short(PA));
  c.group_b_title          = flat.includes(short(PB));
  c.reval_notice_visible   = /Quantities reduced to current stock for AU021 Woven Basket/.test(flat);
  c.two_seller_groups      = (flat.match(/Ships from Dar es Salaam/g)||[]).length>=2 || (flat.match(/AU021 Seller/g)||[]).length>=4;
  c.itemDetails_refetched  = S.fetches>=2;
  c.subtotal_shown         = /Subtotal \(\d+ items?\): TSh /.test(flat);
  c.shipping_calc_note     = /Calculated at checkout/.test(flat);

  // qty of A after clamp (persisted store is source of truth)
  const qA=await readQty(p,PA.productId);
  const qB=await readQty(p,PB.productId);
  c.qty_a_clamped_to_2     = qA===2;
  c.qty_b_untouched_2      = qB===2;
  console.log(tag,'persisted after revalidate: A=',qA,'B=',qB);

  // '+' at cap must not raise A beyond 2. Find the FIRST 'Save for later' row and
  // click 40px right / below-title pattern on group A tile.
  const plusOk=await tryStepper(p, short(PA), +1);
  await p.waitForTimeout(1400);
  const qA2=await readQty(p,PA.productId);
  c.plus_at_cap_blocked   = plusOk && qA2<=2;

  // '-' decrements B
  const minusOk=await tryStepper(p, short(PB), -1);
  await p.waitForTimeout(1200);
  const qB2=await readQty(p,PB.productId);
  c.minus_decrements      = minusOk && qB2===1;
  if(qB2===1){ await tryStepper(p, short(PB), +1); await p.waitForTimeout(1000); }

  // selection checkbox round trip (checkbox left of 'Save for later')
  const sel0=await selCount(p);
  await toggleCheckbox(p); await p.waitForTimeout(900);
  const sel1=await selCount(p);
  await toggleCheckbox(p); await p.waitForTimeout(900);
  const sel2=await selCount(p);
  c.selection_toggles     = sel0===2 && sel1<sel0 && sel2===sel0;

  // Go to checkout -> address step
  await L.clickBtn(p,'Go to checkout');
  for(let i=0;i<12;i++){ if(/Seller's delivery|Continue to review/.test(await L.allText(p).catch(()=>''))) break; await p.waitForTimeout(1500);}
  const addrTxt=[...new Set((await L.allText(p).catch(()=>'')).split('\n'))].join('|');
  fs.writeFileSync(`/tmp/au021_addr_${tag}.txt`,addrTxt.slice(0,5000));
  await L.screenshot(p,`${SHOTS}/${UNIT}-${tag}-checkout-address.png`);
  c.address_step           = /Seller's delivery/.test(addrTxt) && /Continue to review/.test(addrTxt);
  c.fulfillment_options    = /Pick up myself/.test(addrTxt);

  // continue to review
  await L.clickBtn(p,'Continue to review');
  for(let i=0;i<16;i++){ if(/Order totals|Delivery fee/.test(await L.allText(p).catch(()=>''))) break; await p.waitForTimeout(1500);}
  await p.waitForTimeout(4500);
  const revTxt=[...new Set((await L.allText(p).catch(()=>'')).split('\n'))].join('|');
  fs.writeFileSync(`/tmp/au021_review_${tag}.txt`,revTxt.slice(0,6000));
  await L.screenshot(p,`${SHOTS}/${UNIT}-${tag}-checkout-review.png`);
  c.review_step            = /Order totals/.test(revTxt);
  c.review_group_cards     = revTxt.includes(short(PA)) && revTxt.includes(short(PB));
  c.fee_per_group_3000     = (revTxt.match(/TSh 3,000/g)||[]).length>=2;
  c.delivery_total_6000    = /TSh 6,000/.test(revTxt);
  c.delivery_quote_called  = S.quotes>=1;

  S.checks=c;
  console.log(tag,'CHECKS',JSON.stringify(c,null,1));

  // keep page open for video flush
  await L.closeVideo(ctx,`e2e/videos/${videoName}`);
  return S;
}

(async () => {
  // REAL API: drop A stock to 2 (multipart product update)
  const form=new FormData();
  form.append('product',new Blob([Buffer.from(JSON.stringify({productName:PA.title,productQuantity:2}))],{type:'application/json'}),'product.json');
  const patch=await fetch(`${L.API}/api/v1/products/update/${PA.productId}`,{method:'PATCH',headers:{Authorization:'Bearer '+fx.sellerA.token},body:form});
  console.log('stock-patch A->2:',patch.status);
  const detA=await L.api(null,'GET',`/api/v1/displayItem/itemDetails/${PA.productId}`);
  if(detA.json.productQuantity!==2) throw new Error('stock patch did not stick');
  console.log('fresh stock A:',detA.json.productQuantity);

  const browser=await L.newBrowser();
  const M=await runViewport(browser,375,667,'mobile',`${UNIT}-mobile.webm`);
  const T=await runViewport(browser,768,1024,'tablet',`${UNIT}-tablet.webm`);
  await browser.close();

  OUT.fetches={mobile:M.fetches,tablet:T.fetches};
  OUT.quotes={mobile:M.quotes,tablet:T.quotes};
  OUT.imageSummary={mobile:L.imageSummary(M.images),tablet:L.imageSummary(T.images)};
  OUT.imageUrlsMobile=M.images; OUT.imageUrlsTablet=T.images;
  OUT.checksM=M.checks; OUT.checksT=T.checks;
  fs.writeFileSync('/tmp/au021_out_r4.json',JSON.stringify(OUT,null,1));
  console.log('DONE');
})().catch(e=>{console.error('VERIFY FATAL',e.message);process.exit(1);});

function short(d){return d.title.split(' ').slice(0,4).join(' ');}

async function tryStepper(p,titlePrefix,delta){
  // find the cart TILE containing the title; steppers sit in its Qty row:
  // 'Qty' label then [-] [n] [+]; approximate offsets from the title's rect.
  const r=await p.evaluate((pf)=>{
    let tile=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'');
      if(!t.startsWith(pf)) return;
      const b=e.getBoundingClientRect();
      if(b.width<150||b.width>370) return;
      if(tile) return;
      tile={x:b.x,y:b.y,w:b.width,h:b.h};
    });
    if(!tile) return null;
    return {x:tile.x,y:tile.y,w:tile.w};
  },titlePrefix);
  if(!r) return false;
  const y=Math.min(r.y+118, innerHeight-24);
  const x= delta>0 ? r.x+96 : r.x+52;
  await p.mouse.click(x,y);
  return true;
}
async function selCount(p){
  const items=await rawCart(p);
  return (items||[]).filter(x=>x.selected!==false).length;
}
async function toggleCheckbox(p){
  const r=await p.evaluate(()=>{
    let hit=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'');
      if(!/Save for later/.test(t)) return;
      const b=e.getBoundingClientRect();
      if(b.width>340) return;
      if(hit) return;
      hit={x:Math.round(Math.max(b.x-26,6)),y:Math.round(b.y+b.height/2)};
    });
    return hit;
  });
  if(!r) return false;
  await p.mouse.click(r.x,r.y);
  return true;
}
