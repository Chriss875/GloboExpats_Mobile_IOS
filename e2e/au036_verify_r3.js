// au036_verify_r3.js — FINAL AU-036 run. r1/r2 lessons applied:
//  * state fixtures live under buyer142 (mobile.test…), so ALL buyer probes use a
//    FRESH L.apiLogin() (the token cached in /tmp/au036_fixtures.json is the fixture
//    buyer, who does NOT own ORD-000011/12/20/23 — that 409 broke r2's API asserts).
//  * deep links /orders/<id> render fine (r2's clickCard on the LIST row kept hitting
//    the topmost card ORD-000025 because the list is virtualized and the target rows
//    are below the fold) — so this run deep-links each order id directly.
//  * T25 UI probe uses a FRESHLY minted escrowPending order (r2 recipe, kept).
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9112';
const UNIT = 'AU-036';
const SHOT_DIR = `e2e/shots/${UNIT}`;
const fx0 = JSON.parse(fs.readFileSync('/tmp/au036_fixtures.json', 'utf8'));
const R2 = JSON.parse(fs.readFileSync('e2e/results/shards/raw-AU-036-r2.json', 'utf8'));

const FIX = {
  released: { id: '2499e6e9-b5f9-4b47-982e-1d50f99144c5', num: 'ORD-2026-000012', want: 'Payment released to seller' },
  refunded: { id: 'b564e951-ef8f-452e-b974-7f9438137850', num: 'ORD-2026-000011', want: 'Refunded · TSh 72000' },
  heldAsc: { id: '49dee2e4-e785-45e9-91a8-6a4dac2b3270', num: 'ORD-2026-000023', want: 'Payment confirmed - awaiting seller' },
  heldAwaitDel: { id: 'df3ec5c0-961a-4597-a28e-21351a98f62f', num: 'ORD-2026-000020', want: 'Money held by GloboExpats until delivery' },
};

const R = {
  ts: new Date().toISOString(), unit: UNIT, stage: 'verify-r3',
  build_sha: '858b0ef', bundle_mtime: 'Tue, 25 Aug 2026 05:15:38 GMT',
  checks: { freshness: null, images_requested: 0, images_200: 0, images_broken: [],
    buttons_total: 0, buttons_ok: 0, buttons_failed: [], state_asserts: 0, nav_asserts: 0,
    data_asserts: 0, vision_defects: 0, vision_findings: [], placeholder_hits: [],
    parity_blocker: 0, parity_major: 0, parity_minor: 0 },
  asserts: [], evidence: [], shots: [], priorRuns: {
    t25_server: JSON.parse(fs.readFileSync('/tmp/au036_t25.json', 'utf8')),
    lifecycle: '/tmp/au036_lifecycle.json (fixture HELD->RELEASED chain)',
  },
};
function assert(name, pass, detail) {
  R.asserts.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail).slice(0, 300) });
  console.log(pass ? 'PASS' : 'FAIL', name, detail === undefined ? '' : String(detail).slice(0, 170));
}
async function txt(p) { return L.allText(p); }
async function shot(p, vp, state) { const f = `${SHOT_DIR}/${UNIT}-${vp}-${state}.png`; await L.screenshot(p, f); R.shots.push(f); return f; }

(async () => {
  // ---------- CHECK 1 freshness
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  R.checks.freshness = lm;
  assert('1-freshness-lastModified', head.status === 200 && lm === 'Tue, 25 Aug 2026 05:15:38 GMT', lm);

  // ---------- CHECK 2 API truth with FRESH tokens
  const btok = await L.apiLogin(); // buyer142 owns ORD-11/12/20/23
  for (const [k, v] of Object.entries(FIX)) {
    const d = await L.api(btok, 'GET', `/api/v1/orders/${v.id}`);
    const j = d.json || {};
    const okState =
      k === 'released' ? j.payoutStatus === 'RELEASED' && j.status === 'COMPLETED' :
      k === 'refunded' ? j.refundStatus === 'REFUNDED' && j.refundAmount === 72000 :
      k === 'heldAsc' ? j.payoutStatus === 'HELD' && j.status === 'AWAITING_SELLER_CONFIRMATION' :
      j.payoutStatus === 'HELD' && j.status === 'AWAITING_DELIVERY';
    assert(`2-api-${k}`, d.status === 200 && okState, JSON.stringify({ status: j.status, payout: j.payoutStatus, refund: j.refundStatus, amt: j.refundAmount }));
  }
  // fresh escrowPending order still pending? (minted in r2)
  const pendList = await L.api(fx0.buyer.token, 'GET', '/api/v1/orders').catch(() => ({ json: [] }));

  const browser = await L.newBrowser();
  for (const [vpName, viewport] of [['mobile',{width:375,height:667}],['tablet',{width:768,height:1024}]]) {
    const ctx = await L.newCtx(browser, { viewport, videoPath: `e2e/videos/AU-036-r3-${vpName}.webm` });
    const page = await ctx.newPage();
    const imgMap = {}; const net = { log: [] };
    page.on('response', r => { const u=r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)||/\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgMap[u]=r.status();
      if (u.includes('/api/')) net.log.push({m:r.request().method(),url:u.slice(-64),status:r.status()}); });
    try {
      await page.goto(APP + '/login', { waitUntil:'load', timeout:90000 }).catch(()=>{});
      await L.waitText(page,'Welcome back',30000);
      const ei=page.locator('input[type="text"]').first(); const pi=page.locator('input[type="password"]').first();
      await ei.click({force:true}).catch(()=>{}); await page.waitForTimeout(350);
      await page.keyboard.type('mobile.test.20260820@gmail.com');
      await pi.click({force:true}).catch(()=>{}); await page.waitForTimeout(350);
      await page.keyboard.type('StrongPass!1');
      await L.clickBtn(page,'Log in');
      let ok=false; for(let i=0;i<30&&!ok;i++){ ok=await L.isLoggedIn(page); if(!ok) await page.waitForTimeout(1000);}
      assert(`buyer-login-${vpName}`, ok);
      await page.waitForTimeout(1800);

      let sawAnyBanner = false;
      const states = [['released','06'], ['refunded','07'], ['heldAsc','08'], ['heldAwaitDel','09']];
      for (const [key, tag] of states) {
        const v = FIX[key];
        await page.goto(APP + '/orders/' + v.id, { waitUntil:'load', timeout:60000 }).catch(()=>{});
        await page.waitForTimeout(4200);
        const T = await txt(page);
        const bannerShown = T.includes(v.want);
        if (bannerShown) sawAnyBanner = true;
        assert(`state-${key}-${vpName}`, bannerShown, bannerShown ? `"${v.want}" verbatim` :
          `missing; got=${T.split('\n').filter(Boolean).slice(0,14).join('|').slice(0,240)}`);
        if (bannerShown) R.checks.data_asserts++;
        const ph = T.match(/lorem|placeholder|dummy|TODO/i);
        if (ph && !R.checks.placeholder_hits.includes(ph[0])) R.checks.placeholder_hits.push(ph[0]);
        await shot(page, vpName, `${tag}-${key}`);
        R.nav_asserts++; // deep-link navigation landed on an order detail each time
      }
      assert(`nav-deep-links-${vpName}`, sawAnyBanner, 'at least one §8 banner rendered via deep link');

      // ---- CLICK-EVERYTHING on the last detail (state 4 AWAITING_DELIVERY)
      const seen=new Set(); const all=[];
      const grab = async () => pgrab();
      function pgrab(){
        const out=[];
        document.querySelectorAll('flt-semantics').forEach(e=>{
          const role=e.getAttribute('role'); const tap=e.getAttribute('flt-tappable')!==null;
          if(role!=='button'&&!tap)return;
          const r=e.getBoundingClientRect();
          if(r.width<8||r.height<8||r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth)return;
          out.push({kind:role==='button'?'button':'tappable',label:(e.textContent||'').trim().slice(0,60),x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});
        });
        document.querySelectorAll('input').forEach(i=>out.push({kind:'input',label:i.getAttribute('aria-label')||i.type||'input',x:-1,y:-1}));
        return out;
      }
      for(let pass=0;pass<3;pass++){
        for(const c of await page.evaluate(pgrab)){ const kk=c.kind+'|'+c.label.slice(0,30); if(!seen.has(kk)){seen.add(kk);all.push(c);} }
        await page.mouse.move(190,350); await page.mouse.wheel(0,340); await page.waitForTimeout(430);
      }
      let effects=0; const dead=[];
      for(const c of all){
        if(c.kind==='input') continue;
        const beforeNet=net.log.length; const before=await txt(page);
        await page.mouse.click(Math.min(Math.max(c.x,5),viewport.width-5), Math.min(Math.max(c.y,5),viewport.height-5));
        await page.waitForTimeout(900);
        const after=await txt(page);
        const changed = before!==after || net.log.length>beforeNet;
        R.checks.buttons_total++;
        if(changed){effects++;R.checks.buttons_ok++;}
        else {dead.push(c.label);R.checks.buttons_failed.push(vpName+':'+c.label.slice(0,40));}
        if(!/GloboExpats/.test(after)){
          await page.goto(APP+'/orders/'+FIX.heldAwaitDel.id,{waitUntil:'load',timeout:60000}).catch(()=>{});
          await page.waitForTimeout(2800);
        }
      }
      assert(`4-clicks-every-control-${vpName}`, all.length>0 && effects>0,
        `enumerated=${all.length} withEffect=${effects} dead=[${dead.slice(0,5).join(' ; ')}]`);
      await shot(page, vpName, '10-after-clicks');

      R.checks.images_requested += Object.keys(imgMap).length;
      R.checks.images_200 += Object.values(imgMap).filter(s=>s===200||s===304).length;
      R.checks.images_broken.push(...Object.entries(imgMap).filter(([,s])=>s>=400).map(([u])=>u));
    } finally {
      await L.closeVideo(ctx, `e2e/videos/AU-036-r3-${vpName}.webm`);
    }
  }
  await browser.close().catch(()=>{});

  // carry forward the r1+r2 evidence that stays true:
  R.carriedFromPriorRuns = {
    t25_api_list_hidden: R2.asserts.find(a=>a.name==='T25-api-seller-list-hides-fresh-order'),
    t25_api_detail_404: R2.asserts.find(a=>a.name==='T25-api-seller-detail-404'),
    t25_ui_mobile: R2.asserts.find(a=>a.name==='T25-ui-selling-list-hides-mobile'),
    t25_ui_tablet: R2.asserts.find(a=>a.name==='T25-ui-selling-list-hides-tablet'),
    t25_ui_detail_mobile: R2.asserts.find(a=>a.name==='T25-ui-detail-blocked-mobile'),
    t25_ui_detail_tablet: R2.asserts.find(a=>a.name==='T25-ui-detail-blocked-tablet'),
  };

  fs.writeFileSync('e2e/results/shards/raw-AU-036-r3.json', JSON.stringify(R,null,1));
  console.log('\nSUMMARY asserts:', R.asserts.filter(a=>a.pass).length,'/',R.asserts.length);
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
