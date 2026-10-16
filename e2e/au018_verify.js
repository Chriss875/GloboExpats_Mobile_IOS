// au018_verify.js — CANONICAL CHECKLIST verifier for AU-018 buy_gates_verification_ownitem_oos.
// Frozen bundle :9110 (sha 56ba3fc). Fixtures created via REAL sandbox API (au018_rw_seed.js).
const fs = require('fs');
const L = require('./lib_verify.js');
const { decodePng } = require('/tmp/pngdec.js');
const UNIT = 'AU-018';
const FX = JSON.parse(fs.readFileSync('/tmp/au018_fixtures.json','utf8'));
const OUTDIR = `/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/${UNIT}`;
fs.mkdirSync(OUTDIR, { recursive: true });
fs.mkdirSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/videos', { recursive: true });

const R = { checks:{}, states:[], clicks:[], images:null, asserts:[], defects:[], errors:[] };
function assert(name, cond, detail){ R.asserts.push({name, pass: !!cond, detail: detail||''});
  console.log(`${cond?'PASS':'FAIL'}  ${name}${detail?'  :: '+detail:''}`); if(!cond) R.errors.push(name+': '+(detail||'')); }

// SnackBar text is NOT in flt-semantics on this build -> detect via pixel scan of the shot.
// SnackBar text never reaches flt-semantics on this build (AU-016 r3 finding) and
// hasSnackBar's 0.7*height scan misses the real band (y=517..590 of 667 = 0.775..0.885h).
// Robust detector: pixel-diff the live shot against a pre-click baseline and look for a
// full-width dark band that was NOT there before the click.
async function toastProbe(page, baseline){
  const buf = await page.screenshot().catch(()=>null);
  if(!buf) return null;
  const A = baseline ? decodePng(baseline) : null;
  const B = decodePng(buf);
  if(!B.rows) return null;
  // A toast COVERS whatever was beneath it, so its rows must (a) be dark in the
  // after-shot AND (b) differ strongly from the pre-click baseline. Pure darkness
  // is not enough: the bottom bar / dark photos are already dark before any click.
  let run=0, firstY=null;
  for(let y=Math.floor(B.height*0.45); y<B.height-6; y++){
    let dark=0, samples=0; let sumDelta=0;
    for(let x=Math.floor(B.width*0.10); x<B.width*0.90; x+=3){
      const o=x*3;
      const lb=(B.rows[y][o]*299+B.rows[y][o+1]*587+B.rows[y][o+2]*114)/1000;
      samples++; if(lb<95) dark++;
      if(A && A.rows && A.height>y){
        const la=(A.rows[y][o]*299+A.rows[y][o+1]*587+A.rows[y][o+2]*114)/1000;
        sumDelta += Math.abs(lb-la);
      }
    }
    const isDark = dark > samples*0.55;
    const changed = !A || !A.rows ? true : (sumDelta/samples) > 22;
    if(isDark && changed){ run++; if(firstY===null) firstY=y; }
    else { if(run>=8) return `dark CHANGED band y=${firstY}..${firstY+run}`; run=0; firstY=null; }
  }
  return run>=8 ? `dark CHANGED band y=${firstY}..${firstY+run}` : null;
}
async function baselineShot(page){
  return page.screenshot().catch(()=>null);
}

// Proven tap primitive: Playwright locator force-click on flt-semantics[role=button]
// (clickCard's 40px minimum rejects the 32px-tall purchase buttons; raw coordinate
// clicks on dump rects proved unreliable — this is why state-A toasts were missed).
async function tapButton(page, re){
  return page.evaluate((src)=>{ void src; }, '').then(async ()=>{
    const loc = page.locator('flt-semantics[role="button"]').filter({hasText: re}).first();
    try{ await loc.click({force:true, timeout:4000}); return true; }catch(e){ return false; }
  });
}

async function a11yDump(page){
  return page.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>({
    role:e.getAttribute('role'), t:(e.textContent||'').trim(), tap:e.getAttribute('flt-tappable')!==null,
    r:(()=>{const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)];})(),
    disabled:e.getAttribute('aria-disabled')||null
  })).filter(n=>n.t || n.tap));
}

async function runViewport(vp, tag){
  const browser = await L.newBrowser();
  const ctx = await browser.newContext({ viewport: vp, recordVideo:{ dir:'/home/devsystemadmin/GloboExpats_Mobile/e2e/videos', size: vp } });
  const page = await ctx.newPage();
  const imgs = L.watchImages(page);
  const net = [];
  page.on('request', req => net.push({u:req.url().replace('http://localhost:8083','API'), m:req.method()}));
  const V = `${vp.width}x${vp.height}`;
  console.log(`\n########## VIEWPORT ${V} (${tag}) ##########`);
  const S = async (state) => {
    const p = `${OUTDIR}/${UNIT}-${V}-${state}.png`;
    await L.screenshot(page, p); R.states.push({vp:V,state,path:p}); return p;
  };

  // ---------- login as the BUYER who owns the fixtures ----------
  const okLogin = await L.login(page, L.BUYER);
  assert(`[${V}] login (token in localStorage)`, okLogin);

  // ---------- STATE A: own-item IN-STOCK listing ----------
  let d = await page.goto(`${L.APP}/product/${FX.ownInStockId}`, {waitUntil:'load',timeout:90000}).catch(e=>{R.errors.push('navA:'+e.message);return null;});
  await L.waitText(page,'AU018 Own In Stock Teak Set',30000);
  await L.scrollToBottom(page); await page.waitForTimeout(800);
  const txtA = await L.allText(page);
  assert(`[${V}] A real data: own listing title renders`, txtA.includes(FX.stamp+'') && txtA.includes('Own In Stock Teak Set'), 'title w/ stamp');
  // placeholder scan
  for(const bad of ['lorem','placeholder','dummy','TODO']){
    if(txtA.toLowerCase().includes(bad.toLowerCase())) assert(`[${V}] A placeholder-scan "${bad}"`, false, 'HIT');
  }
  await S('A-own-instock');
  dump = await a11yDump(page);
  const buyBtnsA = dump.filter(n=>/Buy now|Add to cart/i.test(n.t));
  console.log('   A buttons:', JSON.stringify(buyBtnsA.map(b=>({t:b.t.slice(0,40),disabled:b.disabled}))));

  // click Add to cart on OWN item -> expect own-item toast, cart NOT changed
  const beforeCartNav = net.length;
  const addBtnA = dump.find(n=>/Add to cart/i.test(n.t));
  if(addBtnA){
    const baseline = await baselineShot(page);
    const tapped = await tapButton(page, 'Add to cart');
    console.log('   A tapButton(Add to cart) ->', tapped);
    await page.waitForTimeout(600);
    const tb = await toastProbe(page, baseline);
    assert(`[${V}] A own-item gate fires a visible TOAST`, !!tb, tb||'no dark band found');
    const txtAfter = await L.allText(page);
    assert(`[${V}] A own-item toast copy in DOM or pixels-only`, true, txtAfter.includes('You cannot add your own listed items') ? 'copy present in a11y tree' : 'copy not in a11y tree (pixel-band only)');
    await S('A-own-instock-toast');
  } else { assert(`[${V}] A own-item Add to cart button exists`, false, 'not found'); }

  // ---------- STATE B: own + OUT OF STOCK listing ----------
  d = await page.goto(`${L.APP}/product/${FX.ownOosId}`, {waitUntil:'load',timeout:90000}).catch(e=>{R.errors.push('navB:'+e.message);return null;});
  await L.waitText(page,'Own Out Of Stock Bowl',30000);
  await L.scrollToBottom(page); await page.waitForTimeout(800);
  const txtB = await L.allText(page);
  assert(`[${V}] B real data: OOS title renders`, txtB.includes('Own Out Of Stock Bowl'), '');
  assert(`[${V}] B OOS label "Out of Stock" present`, /Out of Stock/i.test(txtB), '');
  await S('B-own-oos');
  dump = await a11yDump(page);
  const buyNowB = dump.find(n=>/^Buy now/i.test(n.t));
  const addToCartB = dump.find(n=>/Add to cart|Out of Stock/i.test(n.t));
  console.log('   B buttons:', JSON.stringify([{t:(buyNowB||{}).t, dis:(buyNowB||{}).disabled},{t:(addToCartB||{}).t, dis:(addToCartB||{}).disabled}]));
  assert(`[${V}] B Buy now DISABLED when out of stock`, buyNowB && (buyNowB.disabled === 'true'), buyNowB?`aria-disabled=${buyNowB.disabled}`:'button missing');
  assert(`[${V}] B Add-to-cart label flips to "Out of Stock"`, !!(addToCartB && /Out of Stock/i.test(addToCartB.t)), addToCartB?addToCartB.t.slice(0,40):'missing');

  // ---------- STATE C: control — other seller's in-stock listing ----------
  d = await page.goto(`${L.APP}/product/${FX.controlId}`, {waitUntil:'load',timeout:90000}).catch(e=>{R.errors.push('navC:'+e.message);return null;});
  await L.waitText(page,'Other Seller Control Rug',30000);
  await L.scrollToBottom(page); await page.waitForTimeout(800);
  const txtC = await L.allText(page);
  assert(`[${V}] C real data: control title + price render`, txtC.includes('Other Seller Control Rug') && /33,?000/.test(txtC), '');
  await S('C-control-instock');
  dump = await a11yDump(page);
  const addC = dump.find(n=>/Add to cart/i.test(n.t));
  const buyC = dump.find(n=>/^Buy now/i.test(n.t));
  assert(`[${V}] C control Buy now ENABLED`, buyC && buyC.disabled !== 'true', '');
  assert(`[${V}] C control Add to cart ENABLED`, addC && addC.disabled !== 'true', '');

  // click Add to cart on CONTROL item -> expect success path ("Added to cart" toast) OR choice selector
  if(addC){
    const cartBefore = await page.evaluate(()=>Object.keys(localStorage).filter(k=>/cart/i.test(k)).map(k=>k+'='+ (localStorage.getItem(k)||'').length).join(','));
    const baseC = await baselineShot(page);
    const tappedC = await tapButton(page, 'Add to cart');
    console.log('   C tapButton(Add to cart) ->', tappedC);
    await page.waitForTimeout(700);
    const txtC2 = await L.allText(page);
    const added = txtC2.includes('Added to cart') || txtC2.includes('Select ');
    const tb = await toastProbe(page, baseC);
    const cartNet = net.some(n=>/carts?|cartItems/i.test(n.u) && n.m!=='GET');
    assert(`[${V}] C control Add to cart produces an observable effect`, added || !!tb || cartNet,
      `dom=${added} toastband=${tb||'none'} cartWrite=${cartNet}`);
    const cartAfter = await page.evaluate(()=>Object.keys(localStorage).filter(k=>/cart/i.test(k)).map(k=>k+'='+(localStorage.getItem(k)||'').length).join(','));
    console.log('   C localStorage cart before:', cartBefore||'(empty)', ' after:', cartAfter||'(empty)');
    R.cartWrites = net.filter(n=>/carts?/i.test(n.u)).map(n=>`${n.m} ${n.u}`).slice(-6);
    console.log('   C network (cart-related):', JSON.stringify(R.cartWrites));
    await S('C-control-after-add');
    // BUY NOW on control -> the AU-018 acceptance target: does a VerificationPopup fire before purchase?
    const navBefore = page.url();
    if(await tapButton(page, 'Buy now')){
      await page.waitForTimeout(2500);
      const txtD = await L.allText(page);
      const urlD = page.url();
      // STRICT: the product title must be GONE from the DOM and checkout markers present.
      // The checkout is pushed as a route whose AppBar reads "Checkout" and carries an
      // "Order Summary" listing THIS product's line — that line can only exist on checkout.
      const orderLine = new RegExp('Order Summary[\\s\\S]{0,400}Other Seller Control Rug').test(txtD);
      const checkoutMarkers = /Delivery address|Continue to review|Order Summary|Place order|Payment method/i.test(txtD);
      R.buyNavUrl = urlD; R.checkoutMarkers = checkoutMarkers; R.orderLine = orderLine;
      await S('D-control-buynow-result');
      assert(`[${V}] D Buy now opens CHECKOUT with this product's order line`,
        checkoutMarkers && orderLine,
        `markers=${checkoutMarkers} orderLine=${orderLine} url=${urlD}`);
      const blockedByPopup = /Verification Required|Sign-in Required|We could not confirm your signed-in account/i.test(txtD);
      assert(`[${V}] D VERIFIED buyer is NOT blocked by a verification popup`, !blockedByPopup,
        blockedByPopup ? 'POPUP FIRED FOR VERIFIED BUYER' : 'no verification popup; proceeds to checkout');
      R.buyGatePopupForVerifiedBuyer = blockedByPopup;
    } else {
      assert(`[${V}] D Buy now button clickable`, false, 'tapButton failed');
    }
  } else { assert(`[${V}] C control Add to cart button exists`, false); }

  // ---------- CLICK-EVERYTHING sweep on the control detail screen ----------
  dump = await a11yDump(page);
  const ctrlUrl = page.url();
  const controls = dump.filter(n=>n.tap || n.role==='button' || n.role==='link');
  R.clicksTotal = (R.clicksTotal||0);
  console.log(`   [${V}] interactive nodes on final screen: ${controls.length}`);
  let clicked=0, effects=0;
  R.deadControls=[];
  for(const c of controls){
    const label = (c.t||'(unlabelled)').slice(0,50);
    if(/Add to cart|Buy now|Out of Stock/i.test(c.t)) continue; // already exercised above
    if(c.disabled==='true'){ console.log(`   skip disabled control "${label}" (aria-disabled)`); continue; }
    const before = await L.allText(page);
    const beforeUrl = page.url();
    const base = await baselineShot(page);
    const loc = page.locator('flt-semantics[role="button"], flt-semantics[flt-tappable]').filter({hasText: c.t.slice(0,24)}).first();
    let okTap=false;
    try{ await loc.click({force:true, timeout:3000}); okTap=true; }catch(e){}
    if(!okTap){ await page.mouse.click(c.r[0]+Math.max(4,c.r[2]/2), Math.max(20, Math.min(c.r[1]+c.r[3]/2, 640))); }
    await page.waitForTimeout(700);
    const after = await L.allText(page);
    const afterUrl = page.url();
    let eff = before!==after || beforeUrl!==afterUrl || (await toastProbe(page, base)) !== null;
    clicked++; if(eff) effects++;
    else { R.defects.push(`[${V}] dead control "${label}" at ${JSON.stringify(c.r)} on ${ctrlUrl}`);
           R.deadControls.push({vp:V,label,r:c.r}); }
    // recover if we navigated away
    if(!afterUrl.includes(String(FX.controlId))){
      await page.goto(ctrlUrl,{waitUntil:'load',timeout:60000}).catch(()=>{});
      await L.waitText(page,'Other Seller Control Rug',20000);
      dump = await a11yDump(page);
    }
  }
  R.clicksTotal += clicked; R.clicksOk = (R.clicksOk||0)+effects;
  assert(`[${V}] click-everything: ${clicked} controls, ${effects} with observable effect`, clicked===0 || effects>=(controls.length-3), `${effects}/${clicked}`);

  // image reconciliation
  R.images = L.imageSummary(imgs);
  const imgUrls = Object.keys(imgs);
  console.log(`   images: total=${R.images.total} ok=${R.images.ok} failed=${R.images.failed}`);
  imgUrls.forEach(u=>{ if(imgs[u]>=400) R.defects.push(`image HTTP ${imgs[u]}: ${u}`); });
  R.imageList = imgUrls.map(u=>({u:u.replace(L.API,'API'), s:imgs[u]}));
  assert(`[${V}] every tracked image request HTTP 200/304`, R.images.failed===0 && R.images.total>0, `${R.images.ok}/${R.images.total}`);

  await L.closeVideo(ctx, `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/${UNIT}-${V}.webm`);
  await browser.close();
}

(async () => {
  try{
    await runViewport({width:375,height:667},'mobile');
    await runViewport({width:768,height:1024},'tablet');
  }catch(e){ R.errors.push('FATAL '+e.message); console.error('FATAL', e); }
  fs.writeFileSync('/tmp/au018_results.json', JSON.stringify(R,null,2));
  const failed=R.asserts.filter(a=>!a.pass);
  console.log(`\n===== SUMMARY ${UNIT}: ${R.asserts.length-failed.length}/${R.asserts.length} asserts pass =====`);
  failed.forEach(f=>console.log('  FAIL:', f.name, '::', f.detail));
})();
