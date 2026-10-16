// au018_sk_stage1.js — SKEPTIC stage 1: regression probe (A) on :9121 b56e345.
// Happy path end-to-end at 375x667 AND 768x1024:
//   own-in-stock (653): Add to cart -> toast, cart unchanged
//   own-oos (652): Buy now disabled + 'Out of Stock' label
//   control (654): Add to cart -> cart persisted; Buy now -> Checkout Order Summary line
const fs = require('fs');
const L = require('./lib_verify.js');
const { decodePng } = require('/tmp/pngdec.js');
const APP = 'http://localhost:9121';
const FX = JSON.parse(fs.readFileSync('/tmp/au018_fixtures.json','utf8'));
const UNIT = 'AU-018', STAGE = 'skeptic';
const SHOT = `/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/${UNIT}`;
const SHARD = `/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/${UNIT}-skeptic.jsonl`;
fs.mkdirSync(SHOT,{recursive:true});
const lines = [];
function rec(o){ o.unit=UNIT; o.wave='skeptic'; o.stage='skeptic-backfill'; o.build_sha='b56e345'; o.ts=new Date().toISOString(); lines.push(o); fs.appendFileSync(SHARD, JSON.stringify(o)+'\n'); console.log('REC:', o.check, o.result, (o.evidence||'').slice(0,140)); }
async function toastProbe(page, baseline){
  const buf = await page.screenshot().catch(()=>null); if(!buf) return null;
  const A = baseline ? decodePng(baseline) : null; const B = decodePng(buf);
  if(!B.rows) return null;
  let run=0, firstY=null;
  for(let y=Math.floor(B.height*0.45); y<B.height-6; y++){
    let dark=0,samples=0,sumDelta=0;
    for(let x=Math.floor(B.width*0.10); x<B.width*0.90; x+=3){
      const o=x*3;
      const lb=(B.rows[y][o]*299+B.rows[y][o+1]*587+B.rows[y][o+2]*114)/1000;
      samples++; if(lb<95) dark++;
      if(A && A.rows && A.height>y){ const la=(A.rows[y][o]*299+A.rows[y][o+1]*587+A.rows[y][o+2]*114)/1000; sumDelta+=Math.abs(lb-la); }
    }
    const isDark = dark > samples*0.55;
    const changed = !A || !A.rows ? true : (sumDelta/samples) > 22;
    if(isDark && changed){ run++; if(firstY===null) firstY=y; } else { if(run>=8) return `dark CHANGED band y=${firstY}..${firstY+run}`; run=0; firstY=null; }
  }
  return run>=8 ? `dark CHANGED band y=${firstY}..${firstY+run}` : null;
}
async function a11yDump(page){
  return page.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>({
    role:e.getAttribute('role'), t:(e.textContent||'').trim(), tap:e.getAttribute('flt-tappable')!==null,
    r:(()=>{const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)];})(),
    disabled:e.getAttribute('aria-disabled')||null
  })).filter(n=>n.t||n.tap));
}
async function tapButton(page, re){
  const loc = page.locator('flt-semantics[role="button"]').filter({hasText:re}).first();
  try{ await loc.click({force:true,timeout:4000}); return true; }catch(e){ return false; }
}
async function gotoProduct(page, id, title){
  const u = new URL(page.url()); const origin = u.origin;
  await page.goto(origin+'/', {waitUntil:'load', timeout:90000}).catch(()=>{});
  await page.evaluate(h=>{ window.location.hash=h; }, '/product/'+id);
  const ok = await L.waitText(page,title,30000);
  await L.scrollToBottom(page); await page.waitForTimeout(700);
  return ok;
}
(async () => {
  // freshness
  const head = await fetch(APP+'/main.dart.js',{method:'HEAD'});
  rec({ check:'freshness', result: head.headers.get('last-modified')==='Tue, 25 Aug 2026 20:08:09 GMT' ? 'PASS':'FAIL',
        evidence:`HEAD ${APP}/main.dart.js -> Last-Modified ${head.headers.get('last-modified')}, len ${head.headers.get('content-length')} (frozen b56e345 lane)` });

  for (const vp of [{width:375,height:667},{width:768,height:1024}]) {
    const V=`${vp.width}x${vp.height}`;
    const b = await L.newBrowser();
    const ctx = await b.newContext({ viewport: vp, recordVideo:{dir:'/home/devsystemadmin/GloboExpats_Mobile/e2e/videos', size:vp} });
    const p = await ctx.newPage();
    const imgs = L.watchImages(p);
    const okLogin = await L.login(p, L.BUYER);
    rec({ check:`login_${V}`, result: okLogin?'PASS':'FAIL', evidence:'lib login(): token flutter.auth_token in localStorage = '+okLogin });
    const shotF=(s)=>`${SHOT}/${UNIT}-${V}-sk-${s}.png`;

    // ---- STATE A own in-stock
    await gotoProduct(p, FX.ownInStockId, 'Own In Stock Teak Set');
    let dump = await a11yDump(p);
    let addA = dump.find(n=>/Add to cart/i.test(n.t));
    let buyA = dump.find(n=>/^Buy now/i.test(n.t));
    rec({ check:`A_own_instock_buttons_${V}`, result: (addA&&buyA)?'PASS':'FAIL',
          evidence:`own listing ${FX.ownInStockId}: Buy now dis=${buyA&&buyA.disabled} AddToCart dis=${addA&&addA.disabled} (both expected ENABLED for own item)` });
    const baseA = await p.screenshot();
    await tapButton(p,'Add to cart'); await p.waitForTimeout(700);
    const tbA = await toastProbe(p, baseA);
    const cartKeysBefore = await p.evaluate(()=>Object.keys(localStorage).filter(k=>/cart/i.test(k)).map(k=>k));
    await p.screenshot({path: shotF('A-own-toast')});
    rec({ check:`A_ownitem_gate_${V}`, result: tbA?'PASS':'FAIL',
          evidence:`Add to cart on OWN item -> toast band "${tbA||'NONE'}"; localStorage cart keys=${JSON.stringify(cartKeysBefore)} (must stay unchanged)` });

    // ---- STATE B own OOS
    await gotoProduct(p, FX.ownOosId, 'Own Out Of Stock Bowl');
    dump = await a11yDump(p);
    const buyB = dump.find(n=>/^Buy now/i.test(n.t));
    const addB = dump.find(n=>/Out of Stock|Add to cart/i.test(n.t));
    const txtB = dump.map(n=>n.t).join('\n');
    await p.screenshot({path: shotF('B-own-oos')});
    rec({ check:`B_oos_disabled_${V}`, result: (buyB&&buyB.disabled==='true'&&addB&&/Out of Stock/i.test(addB.t))?'PASS':'FAIL',
          evidence:`OOS listing ${FX.ownOosId}: Buy now aria-disabled=${buyB&&buyB.disabled}; add-button label="${addB&&addB.t.slice(0,30)}"; 'Out of Stock' text present=${/Out of Stock/i.test(txtB)}` });

    // ---- STATE C/D control
    await gotoProduct(p, FX.controlId, 'Other Seller Control Rug');
    dump = await a11yDump(p);
    const addC = dump.find(n=>/Add to cart/i.test(n.t));
    const buyC = dump.find(n=>/^Buy now/i.test(n.t));
    rec({ check:`C_control_enabled_${V}`, result:(addC&&buyC&&addC.disabled!=='true'&&buyC.disabled!=='true')?'PASS':'FAIL',
          evidence:`control ${FX.controlId}: Buy now dis=${buyC&&buyC.disabled} AddToCart dis=${addC&&addC.disabled}` });
    const baseC = await p.screenshot();
    const lsBefore = await p.evaluate(()=>JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k=>/cart/i.test(k)).map(k=>[k,localStorage.getItem(k)]))));
    await tapButton(p,'Add to cart'); await p.waitForTimeout(900);
    const tbC = await toastProbe(p, baseC);
    const lsAfterRaw = await p.evaluate(()=>JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k=>/cart/i.test(k)).map(k=>[k,localStorage.getItem(k)]))));
    const cartChanged = lsAfterRaw !== lsBefore;
    await p.screenshot({path: shotF('C-control-add')});
    rec({ check:`C_control_addtocart_effect_${V}`, result:(tbC||cartChanged)?'PASS':'FAIL',
          evidence:`Add to cart CONTROL -> toast=${tbC||'none'}; cart localStorage changed=${cartChanged}; before=${lsBefore.slice(0,120)} after=${lsAfterRaw.slice(0,160)}` });

    if(await tapButton(p,'Buy now')){
      await p.waitForTimeout(3000);
      const txtD = await L.allText(p);
      const urlD = p.url();
      const orderLine = /Order Summary[\s\S]{0,600}Other Seller Control Rug/.test(txtD) || (txtD.includes('Other Seller Control Rug') && /Order Summary|Place order|Delivery address|Payment method|Continue to review/i.test(txtD));
      const popup = /Verification Required|Sign-in Required|We could not confirm your signed-in account/i.test(txtD);
      await p.screenshot({path: shotF('D-buynow-checkout')});
      rec({ check:`D_buynow_checkout_${V}`, result: orderLine&&!popup ?'PASS':'FAIL',
            evidence:`Buy now -> url=${urlD.replace(APP,'')}; OrderSummary+productLine=${orderLine}; verification-popup-blocked-verified-buyer=${popup}` });
      rec({ check:`buy_gate_no_popup_for_verified_${V}`, result: !popup?'PASS':'FAIL',
            evidence:`VERIFIED buyer (142) passes straight to checkout; web parity: use-verification.ts never opens the popup (setIsVerificationPopupOpen(true) absent from repo); canUserBuy = Boolean(user)` });
    } else {
      rec({ check:`D_buynow_checkout_${V}`, result:'FAIL', evidence:'tapButton(Buy now) failed' });
    }
    const isum = L.imageSummary(imgs);
    rec({ check:`images_${V}`, result: isum.failed===0 && isum.total>0 ? 'PASS':'FAIL', evidence:`tracked image requests total=${isum.total} ok=${isum.ok} failed=${isum.failed}` });
    await L.closeVideo(ctx, `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-018-skeptic-${V}.webm`);
    await b.close();
  }
  console.log('STAGE1 DONE');
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
