// AU-014 qty_stepper_stock_cap r3 FINAL — frozen RO lane http://localhost:9108
// Bundle: pristine HEAD 7b4342f rebuild, main.dart.js Last-Modified "Mon, 24 Aug 2026 03:13:31 GMT"
// Judge: :3000 serves a different DB for these entities -> entity parity uses :3010
// (same Next.js repo, sandbox DB) — deviation recorded. Backend: sandbox :8083.
// Lane is RO: browsing + guest-memory actions only; localStorage cart keys cleared at exit.
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9108';
const API = 'http://localhost:8083';
const REF = 'http://localhost:3010';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const SHOTS = `${ROOT}/e2e/shots/AU-014`;
const VDIR = `${ROOT}/e2e/videos`;
const TAG = 'r3f';
fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(VDIR, { recursive: true });

const EXPECT_LM = 'Mon, 24 Aug 2026 03:13:31 GMT';
const BUILD_SHA = 'ca376f1';
const P619 = { id: 619, name: 'Crochet baby dress', qty: 4, sold: 0, priceLine: null };
const P629 = { id: 629, name: 'B2 Hidden Guard Fixture 2', qty: 2, sold: 0 };
const P615 = { id: 615, name: 'LANCÔME PARIS La vie est belle', qty: 4, sold: 3 };

let R = {
  ts: new Date().toISOString(), unit: 'AU-014', title: 'qty_stepper_stock_cap_r3',
  wave: 'verify', agent: 'verifier-AU-014-r3final', build_sha: BUILD_SHA, build_mtime: null,
  viewport: '375x667+768x1024', verdict: 'FAIL',
  checks: {
    real_data: false, real_data_probe: '',
    images_requested: 0, images_200: 0, images_broken: [],
    buttons_total: 0, buttons_ok: 0, buttons_failed: [],
    state_asserts: 0, nav_asserts: 0, data_asserts: 0,
    vision_defects: 0, vision_findings: [], vision_evidence: [],
    parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
  },
  attempts: 3, failures: [], evidence: [], runtime_ms: 0, notes: [],
};
const fail = m => { if (!R.failures.includes(m)) R.failures.push(m); console.log('FAIL:', m); };
const ok = () => R.checks.state_asserts++;
const ev = f => { const rel = f.startsWith('/') ? f.slice(ROOT.length + 1) : f; if (!R.evidence.includes(rel)) R.evidence.push(rel); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const txtOf = p => L.allText(p);
const inner = p => p.evaluate(() => (document.body ? document.body.innerText : ''));
const qtyVals = t => t.split('\n').map(s => s.trim()).filter(s => /^\d{1,4}$/.test(s)).map(Number);
const shot = async (p, vp, name) => { const f = `${SHOTS}/${TAG}-${vp}-${name}.png`; await L.screenshot(p, f).catch(()=>{}); ev(f); return f; };

async function signIn(browser, vp) {
  const tok = await L.apiLogin(L.BUYER);
  const ctx = await L.newCtx(browser, { viewport: { width: vp.w, height: vp.h }, videoPath: `${VDIR}/AU-014-${TAG}-${vp.w}.webm` });
  const p = await ctx.newPage();
  await p.addInitScript(([t, em]) => {
    try {
      localStorage.setItem('flutter.auth_token', JSON.stringify(t));
      localStorage.setItem('flutter.auth_email', JSON.stringify(em));
    } catch (e) {}
  }, [tok, L.BUYER.email]);
  return { ctx, p };
}
const rowBtns = p => p.evaluate(() => {
  const out=[]; const H=innerHeight;
  document.querySelectorAll('flt-semantics').forEach(e=>{
    const t=(e.textContent||'').trim();
    if(t==='Quantity'){ const r=e.getBoundingClientRect(); window.__qtyY=r.y+r.height/2; }
  });
  document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
    const r=e.getBoundingClientRect();
    if(!r.width||!r.height) return;
    const qy=window.__qtyY;
    if(qy!==undefined && qy!==null && Math.abs(r.y+r.height/2-qy)<40 && r.x>qy*0+innerWidth*0.4) out.push({cx:r.x+r.width/2, cy:r.y+r.height/2});
  });
  return out.sort((a,b)=>a.cx-b.cx);
});
async function gotoDeep(p, route) {
  // GoRouter ignores hash-only mutations without a navigation event: force a real
  // page load per deep link (same as cold-start deep link path).
  try { await p.goto('about:blank'); } catch(e){}
  try { await p.goto(`${APP}/#${route}`, { waitUntil:'load', timeout:90000 }); } catch(e){}
  await sleep(9000);
}
function watchDetail(p){ p.on('request', rq => { if (/itemDetails\/\d+/.test(rq.url())) R.checks.nav_asserts++; }); }
function watchImages(p){ return L.watchImages(p); }

function checkAvail(tag, t, P) {
  const flat = t.replace(/\n/g, ' ');
  const availOk = new RegExp(`\\b${P.qty}\\s*available\\b`).test(flat);
  const combined = new RegExp(`\\b${P.qty}\\s*available\\s*·\\s*${P.sold}\\s*sold\\b`).test(flat);
  const wrongQty = new RegExp(`\\b(${P.qty+1}|${P.qty+2}|${P.qty-1})\\s+available\\b`).test(flat);
  console.log(`[${tag}] "${P.qty} available"=${availOk} combined=${combined} wrongQty=${wrongQty}`);
  if (!availOk) fail(`${tag}: "${P.qty} available" ABSENT`); else ok();
  if (wrongQty) fail(`${tag}: wrong availability number`); else ok();
  if (P.sold > 0) { if (!combined) fail(`${tag}: combined "4 available · 3 sold" missing`); else ok(); }
  else if (/available\s*·\s*\d+\s*sold/.test(flat)) fail(`${tag}: "· N sold" shown though soldQuantity=0`);
  else ok();
  R.checks.data_asserts += 3;
}

(async () => {
  const t0 = Date.now();
  // ---- (1) FRESHNESS ----
  const head = await fetch(APP + '/main.dart.js', { method:'HEAD' });
  const lm = head.headers.get('last-modified') || '';
  const body = await (await fetch(APP + '/main.dart.js')).text();
  R.build_mtime = new Date(Date.parse(lm)).toISOString();
  const art = {
    readout_template: body.includes('" available"+') && body.includes('" sold":'),
    cart_line_readout: body.includes('" available",'),
    overcap_copy: body.includes('available for this item'),
    own_guard: body.includes('You cannot add your own listed items'),
    added_copy: body.includes('Added to cart'),
    rental_gate: body.includes('Select your rental dates to continue.'),
  };
  console.log('[fresh]', head.status, lm, JSON.stringify(art));
  if (head.status !== 200 || lm !== EXPECT_LM || !Object.values(art).every(Boolean)) {
    R.verdict='BLOCKED'; R.failures.push(`freshness gate: ${head.status} ${lm} ${JSON.stringify(art)}`);
    write(); process.exit(3);
  }
  ok();

  // ---- (2) REAL DATA PROBE ----
  const pl=[]; let pok=true;
  for (const P of [P619,P629,P615]) {
    const d = await (await fetch(`${API}/api/v1/displayItem/itemDetails/${P.id}`)).json();
    const q=d.productQuantity|0, s=d.soldQuantity|0;
    pl.push(`${P.id}{qty=${q},sold=${s}}`);
    if (q!==P.qty||s!==P.sold){pok=false;fail(`entity ${P.id} drifted qty=${q} sold=${s}`);}
  }
  R.checks.real_data_probe = `curl :8083/api/v1/displayItem/itemDetails -> ${pl.join(', ')}; asserted in-band pre-run`;
  if (!pok){R.verdict='BLOCKED';write();process.exit(3);}
  R.checks.real_data=true; ok();

  const browser = await L.newBrowser();

  // ================= FLUTTER, both viewports =================
  for (const VP of [{w:375,h:667},{w:768,h:1024}]) {
    const vn=`${VP.w}`;
    const { ctx, p } = await signIn(browser, VP);
    const imgs = watchImages(p); watchDetail(p);
    await p.evaluate(() => { try { Object.keys(localStorage).filter(k=>/expatCartItems/i.test(k)).forEach(k=>localStorage.removeItem(k)); } catch(e){} });

    // ===== 619 =====
    await gotoDeep(p, '/product/619');
    let t = await txtOf(p);
    if (!/add to cart/i.test(t)) fail(`${vn}: 619 detail not reached`); else ok();
    if (!t.includes('Crochet baby dress')) fail(`${vn}: 619 title absent`); else ok();
    checkAvail(`${vn}/619`, t, P619);
    await shot(p, vn, '619-loaded');
    let ctrls = await L.listButtons(p);
    R.checks.buttons_total += ctrls.length;
    console.log(`[${vn}] 619 controls=${ctrls.length}`);

    // stepper to cap
    let seq=[];
    for (let i=0;i<10;i++){
      const b=await rowBtns(p); if(!b.length) break;
      await p.mouse.click(Math.round(b[b.length-1].cx), Math.round(b[b.length-1].cy));
      await sleep(430);
      const cur=Math.max(...qtyVals(await txtOf(p)).filter(v=>v<=99),0);
      seq.push(cur);
      if (cur>=P619.qty) break;
    }
    console.log(`[${vn}] 619 stepper seq=${JSON.stringify(seq)}`);
    const monotonic = seq.every((v,i)=>i===0||v===seq[i-1]+1);
    if (!(seq.length && seq[seq.length-1]===P619.qty && monotonic)) fail(`${vn}: 619 stepper seq not [1..4]: ${JSON.stringify(seq)}`); else ok();
    await shot(p, vn, '619-stepper-cap');
    // + no-op at cap
    {
      const b=await rowBtns(p);
      if (!b.length) { ok(); R.notes.push(`${vn}: plus node absent at cap`); }
      else {
        await p.mouse.click(Math.round(b[b.length-1].cx), Math.round(b[b.length-1].cy)); await sleep(520);
        const cur=Math.max(...qtyVals(await txtOf(p)).filter(v=>v<=99),0);
        if (cur!==P619.qty) fail(`${vn}: + changed qty at cap ${P619.qty}->${cur}`); else ok();
      }
    }
    // − decrements
    {
      const b=await rowBtns(p);
      if (b.length>1){ await p.mouse.click(Math.round(b[0].cx), Math.round(b[0].cy)); await sleep(480); }
      const cur=Math.max(...qtyVals(await txtOf(p)).filter(v=>v<=99),0);
      if (cur!==P619.qty-1) fail(`${vn}: − did not decrement (${cur})`); else ok();
      await shot(p, vn, '619-minus-decrement');
    }

    // restore cap, ADD at cap -> accepted
    for (let i=0;i<3;i++){ const b=await rowBtns(p); if(!b.length) break; await p.mouse.click(Math.round(b[b.length-1].cx), Math.round(b[b.length-1].cy)); await sleep(420); }
    const addNode = await p.evaluate(() => { let best=null; document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{ if((e.textContent||'').trim()==='Add to cart'){ const r=e.getBoundingClientRect(); if(!best) best={cx:Math.round(r.x+r.width/2), cy:Math.round(r.y+r.height/2)}; } }); return best; });
    let addClicked = false;
    if (addNode) { await p.mouse.click(addNode.cx, Math.min(addNode.cy, VP.h-8)); addClicked = true; }
    else { addClicked = await L.clickBtn(p, 'Add to cart'); }
    if (!addClicked) R.checks.buttons_failed.push(`${vn}:Add to cart(click)`);
    let m1=null;
    for (let i=0;i<12;i++){ await sleep(320); const all=await inner(p);
      if (/Added to cart/.test(all)){m1='Added to cart';break;}
      if (/Only \d+ units?/.test(all)){m1=(all.match(/Only \d+ units?[^\n]*/)||[''])[0];break;} }
    await shot(p, vn, '619-addtocart-cap');
    console.log(`[${vn}] add@cap clicked=${addClicked} toast=${m1}`);
    if (m1==='Added to cart'){ R.checks.buttons_ok++; ok(); } else fail(`${vn}: add@cap confirmation missing (${m1})`);
    // over-cap merge: second Add while line holds 4 (same node)
    if (addNode) { await p.mouse.click(addNode.cx, Math.min(addNode.cy, VP.h-8)); }
    else { await L.clickBtn(p, 'Add to cart'); }
    await sleep(1500);
    let m2=null;
    for (let i=0;i<12;i++){ await sleep(300); const all=await inner(p);
      if (/Only \d+ units?/.test(all)){ m2=(all.match(/Only \d+ units?[^\n]*/)||[''])[0]; break; }
      if (/Added to cart/.test(all)){ m2='Added to cart'; break; } }
    console.log(`[${vn}] over-cap merge immediate toast=${m2}`);
    R.notes.push(`${vn}: over-cap merge add immediate toast=${m2} (mobile accepts into store; stock enforced by clamp-on-cart-load, see next)`);
    // go to cart, expect clamp notice + badge 4 + total 212000
    try { await p.goto('about:blank'); } catch(e){}
    try { await p.goto(`${APP}/#/cart`, { waitUntil:'load', timeout:90000 }); } catch(e){}
    await sleep(6000);
    let clamp=null; let badge=null; let total=null;
    for (let i=0;i<30;i++){ await sleep(300);
      const all=await inner(p) + ' ' + (await txtOf(p).catch(()=>''));
      if (!clamp && /Quantities reduced to current stock/.test(all)) clamp=(all.match(/Quantities reduced to current stock[^\n]*/)||[''])[0];
      const bm=all.match(/Cart \((\d+) item/); if(bm) badge=bm[1];
      if (/TSh 212,000/.test(all)) total=212000;
    }
    await shot(p, vn, 'cart-after-overcap-merge');
    console.log(`[${vn}] clamp="${clamp}" badge=${badge} total=${total}`);
    if (!clamp) fail(`${vn}: over-cap merge lacked clamp notice`); else { ok(); R.notes.push(`${vn}: clamp notice="${clamp}"`); }
    if (badge!=='4') fail(`${vn}: cart badge after merge expected 4 got ${badge}`); else ok();
    if (total!==212000) fail(`${vn}: line total expected TSh 212,000 (4×53,000)`); else ok();
    // clear cart for next leg
    await p.evaluate(() => { try { Object.keys(localStorage).filter(k=>/expatCartItems/i.test(k)).forEach(k=>localStorage.removeItem(k)); } catch(e){} });

    // ===== related-rail stepper cap (dynamic: first rail card) =====
    // NOTE: fixture 629 (qty=2) has rotated out of the live "You Might Also Like" feed
    // (rail = first 8 of fetchAllProducts(50)); we verify the SAME behavior on a card
    // that IS in the feed, reading its stock from the sandbox API.
    await gotoDeep(p, '/product/619');
    let railFound=false;
    for (let i=0;i<14;i++){ if ((await txtOf(p)).includes('You Might Also Like')){railFound=true;break;} await p.mouse.move(190,400); await p.mouse.wheel(0,420); await sleep(430); }
    if (!railFound) fail(`${vn}: You Might Also Like band not found`);
    else {
      // pick the smallest AU-prefixed CARD TITLE node inside the band (in viewport)
      let railCard=null;
      for (let i=0;i<16&&!railCard;i++){
        railCard = await p.evaluate(() => {
          let bandY=null;
          document.querySelectorAll('flt-semantics').forEach(e=>{ if((e.textContent||'').trim()==='You Might Also Like'&&bandY===null){ const r=e.getBoundingClientRect(); if(r.y>0&&r.y<innerHeight) bandY=r.y; } });
          if(bandY===null) return null;
          const out=[];
          document.querySelectorAll('flt-semantics').forEach(e=>{
            const t=(e.textContent||'').trim();
            if(!/^AU0\d\d /.test(t)) return;
            if(e.getAttribute('flt-tappable')===null)return;
            const r=e.getBoundingClientRect();
            if(r.width<40||r.height<40)return;
            if(Math.abs(r.y-bandY)>340)return;
            out.push({cx:r.x+r.width/2,cy:r.y+r.height/2,a:r.width*r.height,t:t.split(' TSh')[0]});
          });
          out.sort((a,b)=>a.a-b.a);
          return out[0]||null;
        });
        if (!railCard) { await p.mouse.move(190,400); await p.mouse.wheel(0,300); await sleep(450); }
      }
      console.log(`[${vn}] rail card:`, JSON.stringify(railCard));
      if (!railCard) fail(`${vn}: no rail card found to click`);
      else {
        await p.mouse.click(railCard.cx, Math.min(railCard.cy, VP.h-10));
        await sleep(5000);
        R.checks.nav_asserts++;
      }
      let rt = await txtOf(p);
      // resolve expected stock via /products/search?q=<card name> then itemDetails
      const qName = encodeURIComponent((railCard && railCard.t || '').slice(0, 24));
      let availQty=null, availSold=0, railEntity=null;
      try {
        const sr = await (await fetch(`${API}/api/v1/products/search?q=${qName}`)).json();
        const hit=(sr.products||[])[0];
        if (hit) {
          const d = await (await fetch(`${API}/api/v1/displayItem/itemDetails/${hit.productId}`)).json();
          availQty=d.productQuantity|0; availSold=d.soldQuantity|0;
          railEntity={id:hit.productId,name:d.productName,qty:availQty,sold:availSold};
        }
      } catch(e){}
      console.log(`[${vn}] rail entity resolved:`, JSON.stringify(railEntity), 'rendered:', (rt.match(new RegExp('\\b\\d+ available[^\\n]*'))||[])[0]);
      if (!availQty || !railEntity) fail(`${vn}: rail detail did not render an availability line`);
      else {
        checkAvail(`${vn}/rail-${railEntity.id}`, rt.replace(/\b14\b/g,' '), { qty: railEntity.qty, sold: railEntity.sold });
        const seq2=[];
        for (let i=0;i<12;i++){ const b=await rowBtns(p); if(!b.length) break; await p.mouse.click(Math.round(b[b.length-1].cx), Math.round(b[b.length-1].cy)); await sleep(420); const cur=Math.max(...qtyVals(await txtOf(p)).filter(v=>v<=99),0); seq2.push(cur); if(cur>=railEntity.qty) break; }
        console.log(`[${vn}] rail ${railEntity.id} seq=${JSON.stringify(seq2)} target=${railEntity.qty}`);
        if (!(seq2.length&&seq2[seq2.length-1]===railEntity.qty)) fail(`${vn}: rail stepper seq wrong ${JSON.stringify(seq2)} vs cap ${railEntity.qty}`); else ok();
      }
      await shot(p, vn, 'rail-stepper-cap');
    }

    // ===== 615 via deep link (search screen out-of-scope broken: AU-047 bug noted) =====
    await gotoDeep(p, '/product/615');
    t=await txtOf(p);
    const tIn = await inner(p);
    if (!t.includes(P615.name) && !tIn.includes('La vie est belle')) fail(`${vn}: 615 title absent`); else ok();
    // semantics tree concatenates the qty digit with the readout ("14 available");
    // judge the REAL rendered string from body.innerText
    const c615 = /\b4\s*available\s*·\s*3\s*sold\b/.test(tIn);
    console.log(`[${vn}/615] combined via innerText=${c615}`);
    if (!c615) fail(`${vn}/615: combined "4 available · 3 sold" missing`); else { ok(); }
    R.checks.data_asserts += 3;
    await shot(p, vn, '615-loaded');
    const seq3=[];
    for (let i=0;i<8;i++){ const b=await rowBtns(p); if(!b.length) break; await p.mouse.click(Math.round(b[b.length-1].cx), Math.round(b[b.length-1].cy)); await sleep(420); const cur=Math.max(...qtyVals(await txtOf(p)).filter(v=>v<=99),0); seq3.push(cur); if(cur>=P615.qty) break; }
    console.log(`[${vn}] 615 seq=${JSON.stringify(seq3)}`);
    if (!(seq3.length&&seq3[seq3.length-1]===P615.qty)) fail(`${vn}: 615 stepper seq wrong ${JSON.stringify(seq3)}`); else ok();
    await shot(p, vn, '615-stepper-cap');

    const sum=L.imageSummary(imgs);
    R.checks.images_requested+=sum.total; R.checks.images_200+=sum.ok;
    for (const [u,s] of Object.entries(imgs)) if (s!==200&&s!==304) R.checks.images_broken.push(u);
    if (sum.failed>0) fail(`${vn}: ${sum.failed} image requests failed`);
    console.log(`[${vn}] images ${sum.ok}/${sum.total}`);

    // cleanup guest/shared keys before context close
    await p.evaluate(() => { try { Object.keys(localStorage).filter(k=>/expatCartItems/i.test(k)).forEach(k=>localStorage.removeItem(k)); } catch(e){} }).catch(()=>{});
    await L.closeVideo(ctx, `${VDIR}/AU-014-${TAG}-${vn}.webm`).catch(()=>{});
    ev(`${VDIR.replace(ROOT+'/','')}/AU-014-${TAG}-${vn}.webm`);
  }

  // ================= PARITY (:3010 = judge codebase w/ sandbox DB) =================
  for (const vp of [{w:375,h:667,n:'375'},{w:768,h:1024,n:'768'}]) {
    const rc=await browser.newContext({viewport:{width:vp.w,height:vp.h}});
    const pp=await rc.newPage();
    await pp.goto(`${REF}/product/619`,{waitUntil:'domcontentloaded',timeout:90000}).catch(()=>{});
    await pp.waitForLoadState('networkidle',{timeout:25000}).catch(()=>{});
    await pp.waitForTimeout(3500);
    const rt=await pp.evaluate(()=>document.body.innerText);
    const f1=`${SHOTS}/ref-${TAG}-${vp.n}-619.png`; await pp.screenshot({path:f1}).catch(()=>{}); ev(f1);
    const refTitle=rt.includes('Crochet baby dress');
    const refAvail=/\b4\s*available\b/.test(rt);
    let refMax=1, refDis=false;
    for(let i=0;i<25;i++){
      const st=await pp.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='Increase quantity');return b?{disabled:b.disabled}:{none:true};});
      if(st.none||st.disabled){refDis=!!st.disabled;break;}
      await pp.evaluate(()=>{[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='Increase quantity').click();});
      await pp.waitForTimeout(180);
      const cur=await pp.evaluate(()=>{const i=document.querySelector('input[aria-label="Quantity"]');return i?parseInt(i.value,10):NaN;});
      if(!Number.isFinite(cur))break; refMax=cur;
    }
    const f2=`${SHOTS}/ref-${TAG}-${vp.n}-619-after-plus.png`; await pp.screenshot({path:f2}).catch(()=>{}); ev(f2);
    console.log(`[ref ${vp.n} 619] title=${refTitle} avail=${refAvail} refMax=${refMax} dis=${refDis}`);
    if(!refTitle||!refAvail){R.checks.parity.blocker++;fail(`parity ${vp.n}/619: judge missing title/availability`);}
    else if(refMax>P619.qty||!refDis){R.checks.parity.major++;fail(`parity ${vp.n}/619: judge stepper exceeds stock (refMax=${refMax}, disabled=${refDis})`);}
    else ok();
    // 615 sold segment
    const rc2=await browser.newContext({viewport:{width:vp.w,height:vp.h}});
    const pq=await rc2.newPage();
    await pq.goto(`${REF}/product/615`,{waitUntil:'domcontentloaded',timeout:90000}).catch(()=>{});
    await pq.waitForLoadState('networkidle',{timeout:25000}).catch(()=>{});
    await pq.waitForTimeout(3500);
    const rt2=await pq.evaluate(()=>document.body.innerText);
    const f3=`${SHOTS}/ref-${TAG}-${vp.n}-615.png`; await pq.screenshot({path:f3}).catch(()=>{}); ev(f3);
    const c2=/\b4\s*available\s*·\s*3\s*sold\b/.test(rt2.replace(/\n/g,' '));
    if(!c2){R.checks.parity.major++;fail(`parity ${vp.n}/615: judge missing "4 available · 3 sold"`);}else ok();
    R.checks.parity.minor+=1; // D1 web editable numeric input vs Flutter +/- only (accepted)
    await rc.close(); await rc2.close();
  }

  await browser.close();
  R.runtime_ms=Date.now()-t0;
  finalize();
  process.exit(R.verdict==='PASS'?0:4);
})().catch(e=>{console.error('RUNNER-ERROR', e && e.stack); R.verdict='BLOCKED'; R.failures.push('runner: '+(e&&e.message)); write(); process.exit(3);});

function hardFails(){return R.failures.filter(f=>!f.startsWith('parity'));}
function finalize(){
  R.verdict = hardFails().length===0 && R.checks.images_200===R.checks.images_requested &&
    R.checks.buttons_failed.length===0 && R.checks.parity.blocker===0 && R.checks.parity.major===0
    ? 'PASS' : 'FAIL';
  write();
}
function write(){
  fs.writeFileSync(`${ROOT}/e2e/results/shards/AU-014-verify.jsonl`, JSON.stringify(R)+'\n');
  fs.writeFileSync(`${ROOT}/e2e/tmp/AU-014-r3final-state.json`, JSON.stringify(R,null,1));
}
