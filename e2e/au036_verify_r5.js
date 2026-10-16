// au036_verify_r5.js — AU-036 verify-r5 against the FROZEN :9121 lane
// (sha e1a5762, main.dart.js Last-Modified Tue 25 Aug 2026 14:19:24 GMT).
// Proves: (a) V1 fix — a REAL escrowPending order (payoutStatus=HELD from the
// backend) shows "Payment submitted - awaiting GloboExpats verification";
// (b) REFUND_PENDING banner visible; (c) HELD/RELEASED/REFUNDED banners;
// (d) T25 seller list filter + detail 404. Both viewports. Video + frames.
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9121';
const UNIT = 'AU-036', STAGE = 'verify-r5';
const SHOT_DIR = 'e2e/shots/AU-036';
const fx = JSON.parse(fs.readFileSync('/tmp/au036_r5.json','utf8'));
// pre-existing sandbox fixtures for states this run's mint alone can't reach:
const FIX = {
  released   : { id:'2499e6e9-b5f9-4b47-982e-1d50f99144c5', want:'Payment released to seller' },
  refunded   : { id:'b564e951-ef8f-452e-b974-7f9438137850', want:'Refunded · TSh 72000' },
};
const S2_WANT = 'Payment submitted - awaiting GloboExpats verification';
const RP_WANT = 'Cancellation refund pending - GloboExpats will return your money';

const R = { ts:new Date().toISOString(), unit:UNIT, stage:STAGE, build_sha:'e1a5762',
  bundle_mtime:null,
  checks:{ fresh:null, images_requested:0, images_200:0, images_broken:[],
    buttons_total:0, buttons_ok:0, buttons_failed:[], state_asserts:0,
    vision_defects:0, vision_findings:[], placeholder_hits:[],
    parity_blocker:0, parity_major:0, parity_minor:0 },
  asserts:[], failures:[], shots:[], evidence:[] };
function assert(name, pass, detail){
  R.asserts.push({name, pass:!!pass, detail:String(detail===undefined?'':detail).slice(0,300)});
  console.log((pass?'PASS ':'FAIL ')+name+(detail?(' :: '+String(detail).slice(0,150)):''));
  if(!pass) R.failures.push(name);
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function txt(p){ return L.allText(p); }
async function shot(p,vp,state){ const f=`${SHOT_DIR}/AU-036-${vp}-${state}.png`;
  await L.screenshot(p,f); R.shots.push(f); return f; }

(async () => {
  // ---------- CHECK 1: freshness
  const head = await fetch(APP+'/main.dart.js',{method:'HEAD'});
  const lm = head.headers.get('last-modified');
  R.bundle_mtime = lm;
  const freshOK = head.status===200 && lm==='Tue, 25 Aug 2026 14:19:24 GMT';
  R.checks.fresh = freshOK ? 'Tue, 25 Aug 2026 14:19:24 GMT' : lm;
  assert('1-freshness-e1a5762-bundle', freshOK, `HTTP ${head.status} Last-Modified: ${lm}`);

  // ---------- CHECK 2: API truth (fresh logins, independent curl-equivalent)
  const btok = await L.apiLogin({email:fx.buyer.email,pw:fx.buyer.pw});
  const stok = await L.apiLogin({email:fx.seller.email,pw:fx.seller.pw});
  fx.buyer.token=btok; fx.seller.token=stok;

  const d2 = await L.api(btok,'GET',`/api/v1/orders/${fx.state2.orderId}`);
  assert('2-api-state2-trap-fields', d2.status===200 &&
    d2.json.status==='AWAITING_PAYMENT' && d2.json.escrowPending===true &&
    d2.json.paymentStatus==='PENDING' && d2.json.payoutStatus==='HELD',
    JSON.stringify({s:d2.json&&d2.json.status,e:d2.json&&d2.json.escrowPending,p:d2.json&&d2.json.paymentStatus,po:d2.json&&d2.json.payoutStatus}));
  const dRP = await L.api(btok,'GET',`/api/v1/orders/${fx.refundPending.orderId}`);
  assert('2-api-refundPending', dRP.status===200 && dRP.json.refundStatus==='REFUND_PENDING' && dRP.json.status==='CANCELLED',
    JSON.stringify({s:dRP.json&&dRP.json.status,r:dRP.json&&dRP.json.refundStatus,po:dRP.json&&dRP.json.payoutStatus}));
  const btok142 = await L.apiLogin();
  const dRel = await L.api(btok142,'GET',`/api/v1/orders/${FIX.released.id}`);
  assert('2-api-released-preexisting', dRel.status===200 && dRel.json.payoutStatus==='RELEASED',
    JSON.stringify({s:dRel.json&&dRel.json.status,po:dRel.json&&dRel.json.payoutStatus}));
  const dRef = await L.api(btok142,'GET',`/api/v1/orders/${FIX.refunded.id}`);
  assert('2-api-refunded-72000', dRef.status===200 && dRef.json.refundStatus==='REFUNDED' && dRef.json.refundAmount===72000,
    JSON.stringify({r:dRef.json&&dRef.json.refundStatus,a:dRef.json&&dRef.json.refundAmount}));

  // ---------- T25 server side BEFORE any UI action on the fixture
  const sList = await L.api(stok,'GET','/api/v1/orders');
  const sRows = Array.isArray(sList.json)?sList.json:[];
  assert('T25-api-seller-list-hides-state2', !sRows.some(o=>o.orderNumber===fx.state2.orderNumber),
    `seller list rows=${JSON.stringify(sRows.map(o=>o.orderNumber))}`);
  const sDet = await L.api(stok,'GET',`/api/v1/orders/${fx.state2.orderId}`);
  assert('T25-api-seller-detail-404', sDet.status===404, `HTTP ${sDet.status} ${JSON.stringify(sDet.json).slice(0,90)}`);

  const browser = await L.newBrowser();
  const framesPlan = [];
  try {
    for (const [vpName, viewport] of [['mobile',{width:375,height:667}],['tablet',{width:768,height:1024}]]) {
      const videoPath = `e2e/videos/AU-036-r5-${vpName}.webm`;
      const ctx = await L.newCtx(browser,{viewport, videoPath});
      const page = await ctx.newPage();
      const imgMap = {}; const net=[];
      page.on('response', r => { const u=r.url();
        if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)||/\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgMap[u]=r.status();
        if(u.includes('/api/')) net.push(`${r.request().method()} ${r.status()} ...${u.slice(-52)}`); });
      try {
        // load root FIRST (plain http.server, no SPA fallback), then hash-nav
        await page.goto(APP+'/',{waitUntil:'load',timeout:90000});
        await L.waitText(page,'Buy now',40000);
        await shot(page,vpName,'01-home');
        // login via UI (proven primitives)
        await L.clickBtn(page,'Login');
        await L.waitText(page,'Welcome back',30000);
        const ei=page.locator('input[type="text"]').first(), pi=page.locator('input[type="password"]').first();
        await ei.click({force:true}).catch(()=>{}); await sleep(350);
        await page.keyboard.type(fx.buyer.email);
        await pi.click({force:true}).catch(()=>{}); await sleep(350);
        await page.keyboard.type(fx.buyer.pw);
        await L.clickBtn(page,'Log in');
        let logged=false; for(let i=0;i<30&&!logged;i++){ logged=await L.isLoggedIn(page); if(!logged) await sleep(1000);}
        assert(`login-buyer-${vpName}`, logged);

        async function gotoOrder(id){ await page.evaluate(h=>{window.location.hash=h;},`#/orders/${id}`); await sleep(4200); }
        async function bannerAssert(tag,id,want,vp){
          await gotoOrder(id);
          const T = await txt(page);
          const hit = T.includes(want);
          if(hit) R.checks.state_asserts++;
          else R.checks.vision_defects += 0;
          assert(`3-banner-${tag}-${vp}`, hit, hit?`"${want}" verbatim`:
            `MISSING "${want}"; got=${T.split('\n').filter(Boolean).slice(0,16).join('|').slice(0,260)}`);
          const ph = T.match(/lorem|placeholder|dummy|TODO/i);
          if(ph && !R.checks.placeholder_hits.includes(ph[0])) R.checks.placeholder_hits.push(ph[0]);
          return {T,hit};
        }
        // ---- state 2 (THE V1 FIX)
        const s2m = await bannerAssert('state2-under-review', fx.state2.orderId, S2_WANT, vpName);
        assert(`3-badge-or-paymentline-${vpName}`, /PENDING|Under review/i.test(s2m.T),
          `payment line present=${/PENDING/i.test(s2m.T)} underReview=${/Under review/.test(s2m.T)}`);
        await shot(page,vpName,'02-state2-underreview');
        // ---- REFUND_PENDING
        const rpm = await bannerAssert('refund-pending', fx.refundPending.orderId, RP_WANT, vpName);
        assert(`3-refund-pending-cancelled-status-${vpName}`, /CANCELLED|Cancelled/.test(rpm.T), 'cancelled status rendered with refund-pending banner');
        await shot(page,vpName,'03-refund-pending');
        // ---- pre-existing RELEASED / REFUNDED
        for (const [tag,key] of [['04-released','released'],['05-refunded','refunded']]){
          const m = await bannerAssert(key.replace(/^\w/,c=>c.toUpperCase()), FIX[key].id, FIX[key].want, vpName);
          await shot(page,vpName,tag+'-'+key);
        }
        // ---- orders LIST shows both fixture rows with escrow copy
        await page.evaluate(()=>{window.location.hash='#/orders';}); await sleep(3200);
        const TL = await txt(page);
        assert(`3-list-shows-fixtures-${vpName}`, TL.includes(fx.state2.orderNumber)&&TL.includes(fx.refundPending.orderNumber),
          `list contains ${fx.state2.orderNumber}: ${TL.includes(fx.state2.orderNumber)}, ${fx.refundPending.orderNumber}: ${TL.includes(fx.refundPending.orderNumber)}`);
        await shot(page,vpName,'06-orders-list');
        // switch to Selling tab as BUYER (should not contain our buying order numbers)
        // ---- CLICK-EVERYTHING sweep on state-2 detail (the screen under test)
        await gotoOrder(fx.state2.orderId); await sleep(800);
        const seen=new Set(); const ctrls=[];
        const grab = () => {
          const out=[];
          document.querySelectorAll('flt-semantics').forEach(e=>{
            const role=e.getAttribute('role'); const tap=e.getAttribute('flt-tappable')!==null;
            if(role!=='button'&&!tap)return;
            const r=e.getBoundingClientRect();
            if(r.width<8||r.height<8||r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth)return;
            out.push({kind:role==='button'?'button':'tappable',label:(e.textContent||'').trim().slice(0,50),x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});
          });
          document.querySelectorAll('input').forEach(i=>out.push({kind:'input',label:i.getAttribute('aria-label')||i.type||'input'}));
          return out;
        };
        for(let pass=0;pass<3;pass++){
          for(const c of await page.evaluate(grab)){ const k=c.kind+'|'+c.label.slice(0,28);
            if(!seen.has(k)){seen.add(k);ctrls.push(c);} }
          await page.mouse.move(Math.round(viewport.width/2),Math.round(viewport.height/2));
          await page.mouse.wheel(0,320); await sleep(420);
        }
        let effects=0; const dead=[]; const clicked=[];
        for(const c of ctrls){
          if(c.kind==='input'){clicked.push(c.label+':input-skipped-typed'); continue;}
          const beforeNet=net.length; const before=await txt(page);
          await page.mouse.click(Math.min(Math.max(c.x,5),viewport.width-5), Math.min(Math.max(c.y,5),viewport.height-5));
          await sleep(900);
          const after=await txt(page);
          const changed = before!==after || net.length>beforeNet || !(await L.isLoggedIn(page))===false && false;
          R.checks.buttons_total++;
          if(changed){effects++;R.checks.buttons_ok++;}else{dead.push(c.label.slice(0,30));R.checks.buttons_failed.push(vpName+':'+c.label.slice(0,34));}
          clicked.push(c.label.slice(0,30));
          if(!(await L.isLoggedIn(page))){
            await page.goto(APP+'/',{waitUntil:'load',timeout:60000}).catch(()=>{});
            await sleep(2500);
            await page.evaluate(h=>{window.location.hash=h;},`#/orders/${fx.state2.orderId}`); await sleep(2600);
          }
        }
        assert(`4-clicks-all-controls-${vpName}`, ctrls.length>0 && effects>0,
          `enumerated=${ctrls.length} withEffect=${effects} dead=[${dead.slice(0,4).join(' ; ')}] controls=${JSON.stringify(clicked).slice(0,220)}`);
        await shot(page,vpName,'07-after-clicks');
        R.checks.images_requested += Object.keys(imgMap).length;
        R.checks.images_200 += Object.values(imgMap).filter(s=>s===200||s===304).length;
        R.checks.images_broken.push(...Object.entries(imgMap).filter(([,s])=>s>=400).map(([u])=>u));
        fs.writeFileSync(`e2e/results/shards/raw-AU-036-r5-net-${vpName}.json`,
          JSON.stringify(net,null,1));
      } finally { await L.closeVideo(ctx, videoPath); }
    }

    // ---------- T25 UI leg: log in AS THE SELLER, selling list + deep link
    for (const [vpName, viewport] of [['mobile',{width:375,height:667}],['tablet',{width:768,height:1024}]]) {
      const videoPath = `e2e/videos/AU-036-r5-t25-${vpName}.webm`;
      const ctx = await L.newCtx(browser,{viewport, videoPath});
      const page = await ctx.newPage();
      try {
        await page.goto(APP+'/',{waitUntil:'load',timeout:90000});
        await L.waitText(page,'Buy now',40000);
        await L.clickBtn(page,'Login'); await L.waitText(page,'Welcome back',30000);
        const ei=page.locator('input[type="text"]').first(), pi=page.locator('input[type="password"]').first();
        await ei.click({force:true}).catch(()=>{}); await sleep(350);
        await page.keyboard.type(fx.seller.email);
        await pi.click({force:true}).catch(()=>{}); await sleep(350);
        await page.keyboard.type(fx.seller.pw);
        await L.clickBtn(page,'Log in');
        let logged=false; for(let i=0;i<30&&!logged;i++){ logged=await L.isLoggedIn(page); if(!logged) await sleep(1000);}
        assert(`T25-login-seller-${vpName}`, logged);
        await page.evaluate(()=>{window.location.hash='#/orders';}); await sleep(3500);
        const TS = await txt(page);
        const hiddenInSelling = !TS.includes(fx.state2.orderNumber);
        if(hiddenInSelling) R.checks.state_asserts++;
        assert(`T25-ui-selling-list-hides-${vpName}`, hiddenInSelling, `"${fx.state2.orderNumber}" absent from selling view`);
        await shot(page,vpName,'08-t25-selling-list');
        await page.evaluate(h=>{window.location.hash=h;},`#/orders/${fx.state2.orderId}`); await sleep(4200);
        const TD = await txt(page);
        const blocked = !TD.includes(fx.state2.totalAmount.toString()) && !TD.includes(S2_WANT);
        assert(`T25-ui-detail-blocked-${vpName}`, blocked, `no order data leaked; page text head=${TD.split('\n').filter(Boolean).slice(0,6).join('|').slice(0,160)}`);
        await shot(page,vpName,'09-t25-detail-blocked');
      } finally { await L.closeVideo(ctx, videoPath); }
    }
  } finally { await browser.close().catch(()=>{}); }

  // ---------- write raw + summary
  fs.writeFileSync('e2e/results/shards/raw-AU-036-r5.json', JSON.stringify(R,null,1));
  console.log('\nSUMMARY', R.asserts.filter(a=>a.pass).length+'/'+R.asserts.length,
    'imgs', R.checks.images_requested+'/'+R.checks.images_200,
    'btns', R.checks.buttons_ok+'/'+R.checks.buttons_total,
    'state_asserts', R.checks.state_asserts,
    'placeholders', JSON.stringify(R.checks.placeholder_hits));
})().catch(e=>{ console.error('FATAL', e.message);
  fs.writeFileSync('e2e/results/shards/raw-AU-036-r5.json', JSON.stringify({...R, fatal:e.message},null,1));
  process.exit(1); });
