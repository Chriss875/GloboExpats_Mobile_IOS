// verify_AU-021_r5.js — FINAL RW-lane verification of AU-021 on frozen :9108.
// Fixes from r4: absolute shot paths, stepper coords from live tile rects,
// checkout form completion before Continue-to-review, tablet stage, ref parity.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9108';
const REF = 'http://localhost:3000';
const fx = JSON.parse(fs.readFileSync('/tmp/au021_fixtures.json', 'utf8'));
const PA = fx.productADetail, PB = fx.productBDetail;
const UNIT = 'AU-021';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const SHOTS = path.join(ROOT, 'e2e/shots', UNIT);
fs.mkdirSync(SHOTS, { recursive: true });

async function waitSem(p){
  for(let i=0;i<60;i++){
    if(await p.evaluate(()=>document.querySelectorAll('flt-semantics').length>3).catch(()=>false)) return;
    await p.waitForTimeout(1000);
  }
}
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
  let s=v;
  for(let i=0;i<2 && typeof s==='string';i++){ try{ s=JSON.parse(s);}catch(e){break;} }
  return Array.isArray(s)?s:[];
}
async function readQty(p,pid){
  const items=await rawCart(p);
  const it=items.find(x=>x.productId===pid);
  return it?it.quantity:0;
}
function short(d){return d.title.split(' ').slice(0,4).join(' ');}

// Stepper buttons: located RELATIVE to the visible 'Save for later' row of each
// tile. From the r4 screenshot geometry: checkbox x~24, title starts x~90,
// Qty row sits ~46px BELOW the 'Save for later' baseline; [-] at x~100, [+] x~150.
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
async function clickStepper(p,rowIndex,delta){
  const rows=await tileRows(p);
  if(rowIndex>=rows.length) return false;
  const r=rows[rowIndex];
  let y=r.y+r.h+52;
  if(y>640) y=640;
  if(y<20) y=20;
  const x= delta>0 ? 150 : 104;
  await p.mouse.click(x,y);
  return true;
}
async function toggleCheckbox(p,rowIndex){
  const rows=await tileRows(p);
  if(rowIndex>=rows.length) return false;
  const r=rows[rowIndex];
  await p.mouse.click(24, Math.max(10,r.y));
  return true;
}

(async () => {
  // ---- REAL API: clamp A stock to 2 (multipart update)
  const form=new FormData();
  form.append('product',new Blob([Buffer.from(JSON.stringify({productName:PA.title,productQuantity:2}))],{type:'application/json'}),'product.json');
  const patch=await fetch(`${L.API}/api/v1/products/update/${PA.productId}`,{method:'PATCH',headers:{Authorization:'Bearer '+fx.sellerA.token},body:form});
  console.log('stock-patch A->2:',patch.status);
  const detA=await L.api(null,'GET',`/api/v1/displayItem/itemDetails/${PA.productId}`);
  if(detA.json.productQuantity!==2) throw new Error('stock patch did not stick');
  console.log('fresh stock A:',detA.json.productQuantity);

  // ---- REAL API ground truth: delivery-quote for the 2-line cart
  const btok=fx.buyer.token;
  const dq=await L.api(btok,'POST','/api/v1/checkout/delivery-quote',{
    destination:{city:'dar es salaam',country:'tanzania',latitude:-6.7905,longitude:39.2795},
    items:[{productId:PA.productId,quantity:2},{productId:PB.productId,quantity:2}]});
  console.log('delivery-quote:',dq.status, JSON.stringify(dq.json).slice(0,300));
  fs.writeFileSync('/tmp/au021_delivery_quote_api.json',JSON.stringify(dq.json,null,1));

  const browser=await L.newBrowser();

  async function runViewport(w,h,tag,videoName){
    const S={images:{},fetches:0,quotes:0,checks:{}};
    const ctx=await L.newCtx(browser,{viewport:{width:w,height:h},videoPath:path.join(ROOT,'e2e/videos',videoName)});
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

    if(!await openCard(p,short(PA))) throw new Error(tag+': open A failed');
    for(let k=0;k<5;k++){ await L.clickBtn(p,'Add to cart'); await p.waitForTimeout(650); }
    const qA0=await readQty(p,PA.productId);
    console.log(tag,'A added, persisted qty:',qA0);
    await clickBack(p);

    if(!await openCard(p,short(PB))) throw new Error(tag+': open B failed');
    for(let k=0;k<2;k++){ await L.clickBtn(p,'Add to cart'); await p.waitForTimeout(650); }
    const qB0=await readQty(p,PB.productId);
    console.log(tag,'B added, persisted qty:',qB0);
    await clickBack(p);

    const opened=await openCartViaIcon(p);
    console.log(tag,'cart opened:',opened);
    await p.waitForTimeout(6000); // revalidation settle

    const txt=[...new Set((await L.allText(p).catch(()=>'')).split('\n'))].join('|');
    fs.writeFileSync(`/tmp/au021_cart_${tag}.txt`,txt.slice(0,8000));
    await L.screenshot(p,path.join(SHOTS,`${UNIT}-${tag}-cart.png`));

    const qA=await readQty(p,PA.productId);
    const qB=await readQty(p,PB.productId);
    console.log(tag,'persisted after revalidate: A=',qA,'B=',qB);

    const c=S.checks;
    c.cart_open_with_lines=opened;
    c.badge_title=/Cart \(\d+ items?\)/.test(txt);
    c.reval_notice_visible=/Quantities reduced to current stock for AU021 Woven Basket/.test(txt);
    c.qty_a_clamped_2=qA===2;
    c.qty_b_stays_2=qB===2;
    c.itemDetails_refetched=S.fetches>=2;

    // steppers: '+' on row0 (A) at cap must stay 2; '-' on row1 (B) drops to 1
    const plusOk=await clickStepper(p,0,+1);
    await p.waitForTimeout(1400);
    const qA2=await readQty(p,PA.productId);
    c.plus_at_cap_blocked=plusOk&&qA2===2;
    console.log(tag,'after + at cap:',qA2);

    const minusOk=await clickStepper(p,1,-1);
    await p.waitForTimeout(1300);
    const qB2=await readQty(p,PB.productId);
    c.minus_decrements=minusOk&&qB2===1;
    console.log(tag,'after - on B:',qB2);
    if(qB2===1){ await clickStepper(p,1,+1); await p.waitForTimeout(1100); }

    // checkbox round-trip on row0
    const s0=(await rawCart(p)).filter(x=>x.selected!==false).length;
    await toggleCheckbox(p,0); await p.waitForTimeout(900);
    const s1=(await rawCart(p)).filter(x=>x.selected!==false).length;
    await toggleCheckbox(p,0); await p.waitForTimeout(900);
    const s2=(await rawCart(p)).filter(x=>x.selected!==false).length;
    c.selection_roundtrip=s0===2&&s1===1&&s2===2;
    console.log(tag,'selection counts:',s0,s1,s2);

    // remove-line guard: skip destructive on fixtures; Clear-all NOT clicked.

    // Go to checkout
    await L.clickBtn(p,'Go to checkout');
    for(let i=0;i<14;i++){ if(/Seller's delivery|Continue to review/.test(await L.allText(p).catch(()=>''))) break; await p.waitForTimeout(1500);}
    // fill any empty visible inputs (phone etc.) so validation passes
    const inputs=await p.locator('input, textarea').all();
    for(const inp of inputs){
      const v=await inp.inputValue().catch(()=>'');
      if(!v.trim()){
        const type=await inp.getAttribute('type').catch(()=>null);
        if(type==='password'||type==='checkbox') continue;
        try{ await inp.click({force:true}); await p.waitForTimeout(200); await p.keyboard.type('+255700000000'); }catch(e){}
      }
    }
    const addrTxt=[...new Set((await L.allText(p).catch(()=>'')).split('\n'))].join('|');
    fs.writeFileSync(`/tmp/au021_addr_${tag}.txt`,addrTxt.slice(0,5000));
    await L.screenshot(p,path.join(SHOTS,`${UNIT}-${tag}-checkout-address.png`));
    c.address_step=/Seller's delivery/.test(addrTxt)&&/Saved addresses|Delivery address/.test(addrTxt);
    c.saved_address_prefilled=/AU021 Home/.test(addrTxt);
    c.order_summary_lines=addrTxt.includes(short(PA))&&addrTxt.includes(short(PB));

    await L.clickBtn(p,'Continue to review');
    let reached=false;
    for(let i=0;i<18;i++){
      const t=await L.allText(p).catch(()=>'');
      if(/Order totals/.test(t)){ reached=true; break; }
      if(/error|required/i.test(t)&&!/Order totals/.test(t)){ /* keep waiting */ }
      await p.waitForTimeout(1500);
    }
    await p.waitForTimeout(4500); // quote round trip
    const revTxt=[...new Set((await L.allText(p).catch(()=>'')).split('\n'))].join('|');
    fs.writeFileSync(`/tmp/au021_review_${tag}.txt`,revTxt.slice(0,6000));
    await L.screenshot(p,path.join(SHOTS,`${UNIT}-${tag}-checkout-review.png`));
    c.review_step=reached&&/Order totals/.test(revTxt);
    c.review_group_cards=revTxt.includes(short(PA))&&revTxt.includes(short(PB));
    c.fee_per_group_3000=(revTxt.match(/TSh 3,000/g)||[]).length>=2;
    c.delivery_total_6000=/TSh 6,000/.test(revTxt);
    c.delivery_quote_called=S.quotes>=1;
    console.log(tag,'CHECKS',JSON.stringify(c,null,1));

    await L.closeVideo(ctx,path.join(ROOT,'e2e/videos',videoName));
    return S;
  }

  const M=await runViewport(375,667,'mobile',`${UNIT}-mobile.webm`);
  const T=await runViewport(768,1024,'tablet',`${UNIT}-tablet.webm`);
  await browser.close();

  // ---- reference parity: seed SAME cart into :3000 localStorage, screenshot /cart
  let refShot=null;
  {
    const ctx=await L.newCtx(browser||await L.newBrowser(),{viewport:{width:375,height:667}});
    const p=await ctx.newPage();
    await p.goto(REF+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
    await p.evaluate((fxJson)=>{
      const fx=JSON.parse(fxJson);
      const PA=fx.productADetail,PB=fx.productBDetail;
      const mk=(d,pid,q)=>({productId:pid,expatId:String(d.sellerId),expatName:d.sellerName,name:d.title,price:d.price,imageUrl:d.image?('http://localhost:8083/'+d.image.imageUrl):null,maxQuantity:d.stock,quantity:q,selected:true});
      localStorage.setItem('expatCartItems_'+fx.buyer.email, JSON.stringify([mk(PA,PA.productId,2),mk(PB,PB.productId,2)]));
    }, JSON.stringify(fx));
    await p.goto(REF+'/cart',{waitUntil:'load',timeout:90000}).catch(()=>{});
    await p.waitForTimeout(5000);
    const refTxt=await p.evaluate(()=>document.body.innerText.slice(0,2500));
    fs.writeFileSync('/tmp/au021_ref_cart.txt',refTxt);
    refShot=path.join(SHOTS,`${UNIT}-ref-375-cart.png`);
    await p.screenshot({path:refShot}).catch(()=>{});
    await ctx.close();
    console.log('reference parity captured:', !!refTxt);
  }

  const OUT={
    fetches:{mobile:M.fetches,tablet:T.fetches},
    quotes:{mobile:M.quotes,tablet:T.quotes},
    imageSummary:{mobile:L.imageSummary(M.images),tablet:L.imageSummary(T.images)},
    imageUrlsMobile:M.images,imageUrlsTablet:T.images,
    checksM:M.checks,checksT:T.checks,
    api_delivery_quote:dq.json, reference:{shot:refShot},
  };
  fs.writeFileSync('/tmp/au021_out_r5.json',JSON.stringify(OUT,null,1));
  console.log('DONE_R5');
})().catch(e=>{console.error('VERIFY FATAL',e.message);process.exit(1);});
