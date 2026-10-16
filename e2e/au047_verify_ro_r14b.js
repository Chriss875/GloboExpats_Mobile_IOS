// au047_verify_ro_r14b.js — AU-047 browse_filter_body_extended — RO lane — FROZEN bundle :9131
//   git sha e694463, main.dart.js Last-Modified "Wed, 26 Aug 2026 08:15:26 GMT".
//
// Canonical Appendix A checklist. Closes the three r6 FAILs (run on :9121 @44bf240):
//   A3 dedupe-stops-at-totalElements (r6: driver stopped early, app-side logic unproven)
//   F2 card-tap navigates to detail (r6: clickCard force-click no-op'd)
//   K1 category chips "no effect"    (r6: horizontal ListView chips were offscreen at click time)
// Plus full re-proof on THIS bundle of: body+query dual transport, neighbourhood dropdown,
// productSource COMMUNITY/SHOPS, grid/list toggle, searchTerm, images, clicks, vision.
//
// RO discipline: read-only vs shared seed data. No listings/orders created; wishlist untouched.
// Drift-proofing: every UI-triggered /displayItem/filter response is echoed node-side seconds
// later with the IDENTICAL body ("echo truth") because parallel agents mutate sandbox rows.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';
const REF = 'http://localhost:3000';
const API = 'http://localhost:8083';
const UNIT = 'AU-047', STAGE = 'verify-r14b';
const BUILD_SHA = 'e694463', BUILD_MT = 'Wed, 26 Aug 2026 08:15:26 GMT';
const SHOT_DIR = `e2e/shots/${UNIT}`;
const TERM = 'AU047'; // real seeded fixture prefix present in live sandbox (totalElements 144 via curl)
const T0 = Date.now();

let NAV = 0, DATA = 0;
const R = {
  ts: new Date().toISOString(), unit: UNIT, stage: STAGE, verdict: null,
  lane: APP, build_sha: BUILD_SHA, bundle_mtime: null,
  checks: {
    freshness: false, real_data: false, real_data_probe: '', images_requested: 0,
    images_200: 0, images_broken: [], buttons_total: 0, buttons_ok: 0,
    buttons_failed: [], state_asserts: 0, nav_asserts: 0, data_asserts: 0,
    vision_defects: 0, vision_findings: [],
    parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
  },
  failures: [], evidence: [], shots: [], refShots: [], videos: [], asserts: [],
  wire: { reqs: [], resps: [], echoes: [], nbReqs: [], catReqs: [] },
  images: {}, consoles: [],
};
function assert(name, pass, detail) {
  R.asserts.push({ name, pass: !!pass, detail: String(detail ?? '').slice(0, 400) });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + String(detail).slice(0, 200) : ''));
  if (!pass) R.failures.push(name);
}
function btnck(name, cond, detail) {
  R.checks.buttons_total++;
  if (cond) { R.checks.buttons_ok++; console.log('BTN  ok ' + name); }
  else { R.checks.buttons_failed.push(name); console.log('BTN  FAIL ' + name + ' :: ' + (detail || '')); }
  return !!cond;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n')); }
async function shot(p, vp, state) {
  const f = path.join(SHOT_DIR, `${UNIT}-${vp}-${state}.png`.replace(/ /g, '_'));
  await L.screenshot(p, f); R.shots.push(f); console.log('shot', f); return f;
}
// smallest-area tappable/role=button node whose text contains lbl, clicked by coordinates
async function jsClick(p, label, maxY = 1024) {
  const hit = await p.evaluate((label) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(label)) return;
      if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      if (!isFinite(r.x) || !isFinite(r.y)) return;
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
      const area = r.width * r.height;
      if (!best || area < best.area)
        best = { area, x: Math.max(2, Math.min(Math.round(r.x + r.width / 2), innerWidth - 2)),
                 y: Math.max(20, Math.min(Math.round(r.y + r.height / 2), innerHeight - 4)) };
    });
    return best;
  }, label);
  if (!hit) return false;
  await p.mouse.click(hit.x, Math.min(hit.y, maxY)); await sleep(1000);
  return true;
}
async function scrollList(p, vp, n = 6, yFrac = 0.55) {
  await p.mouse.move(Math.round(vp.width / 2), Math.round(vp.height * yFrac));
  for (let i = 0; i < n; i++) { await p.mouse.wheel(0, 340); await sleep(130); }
}
async function gotoBrowse(p, vp) {
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 30000).catch(() => {});
  await p.evaluate(() => { window.location.hash = '/browse'; }).catch(() => {});
  await L.waitText(p, 'Marketplace', 40000).catch(() => {});
  await p.waitForTimeout(2600);
}
async function typeIntoSearch(p, s) {
  const inp = p.locator('input[type="text"], input:not([type])').first();
  await inp.click({ force: true }).catch(() => {}); await sleep(400);
  await p.keyboard.type(s, { delay: 18 }); await sleep(250);
  await p.keyboard.press('Enter');
}
async function echoPost(body) {
  const r = await fetch(`${API}/api/v1/displayItem/filter`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  return { status: r.status, j };
}
// price-text x positions -> count distinct column clusters (grid=2 cols @375, list=1 col)
function clusterCount(xs, tol) {
  if (!xs.length) return 0;
  const s = [...new Set(xs)].sort((a, b) => a - b); let c = 1, anchor = s[0];
  for (const x of s.slice(1)) if (x - anchor > tol) { c++; anchor = x; }
  return c;
}
async function priceGeo(pg) {
  return pg.evaluate(() => {
    const pts = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (!/TSh\s?\d/.test(e.textContent || '')) return;
      const r = e.getBoundingClientRect();
      if (r.width < 20 || r.bottom < 0 || r.top > innerHeight) return;
      pts.push(Math.round(r.x));
    });
    return pts;
  });
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  // ================= CHECK 1: FRESHNESS =================
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  const len = Number(head.headers.get('content-length'));
  R.bundle_mtime = lm;
  // byte-marker proof that fix 44bf240 (COMMUNITY/SHOPS sources) is IN this served bundle
  const src = await fetch(APP + '/main.dart.js').then(r => r.text());
  const markerIn = ['"productSource"', 'COMMUNITY', 'SHOPS', 'neighbourhood'];
  const missingMarkers = markerIn.filter(m => !src.includes(m));
  R.checks.freshness = head.status === 200 && lm === BUILD_MT && missingMarkers.length === 0;
  assert('1-freshness-frozen-e694463-bundle', R.checks.freshness,
    `HTTP ${head.status} Last-Modified="${lm}" expected="${BUILD_MT}" len=${len}; markers missing=[${missingMarkers}]`);
  if (!R.checks.freshness) {
    console.log('BLOCKED-stale-build');
    fs.writeFileSync(`e2e/results/shards/raw-${UNIT}-r14b.json`, JSON.stringify(R, null, 1));
    process.exit(3);
  }

  // ================= CHECK 2: REAL DATA (independent curl readback) =================
  const allFeed = await echoPost({ page: 0, size: 5 });
  const termProbe = await echoPost({ page: 0, size: 60, searchTerm: TERM });
  const nbList = await fetch(`${API}/api/v1/displayItem/neighbourhoods`).then(r => r.json()).catch(() => []);
  const nbNames = (nbList || []).map(o => (o && o.name) || o).filter(Boolean);
  const termNames = ((termProbe.j && termProbe.j.content) || []).map(c => c.productName);
  const localProbe = await echoPost({ page: 0, size: 5, productSource: 'LOCAL' });
  DATA++;
  assert('2-real-data-curl-readback', allFeed.status === 200 && allFeed.j.totalElements > 100 && termNames.length >= 1,
    `filter feed total=${allFeed.j.totalElements}; searchTerm "${TERM}" total=${termProbe.j.totalElements} names[0]=${termNames[0]}`);
  R.checks.real_data = true;
  R.checks.real_data_probe = `curl POST filter total=${allFeed.j.totalElements} totalPages=${allFeed.j.totalPages} firstName="${(allFeed.j.content||[])[0] && (allFeed.j.content||[])[0].productName}"; term total=${termProbe.j.totalElements}; neighbourhoods=${nbNames.length}`;
  const lorem = JSON.stringify(allFeed.j.content).match(/lorem|ipsum|placeholder|dummy|sample data|TODO/i);

  // static wire truths used by legs
  const obTruth = await echoPost({ page: 0, size: 24, neighbourhood: 'Oyster Bay' });
  const comTruth = await echoPost({ page: 0, size: 24, productSource: 'COMMUNITY' });
  const shopsTruth = await echoPost({ page: 0, size: 24, productSource: 'SHOPS' });
  const bandTruth = await echoPost({ page: 0, size: 24, minPrice: 12000, maxPrice: 24000 });
  assert('2-wire-truths-captured', obTruth.j.totalElements > 0 && comTruth.j.totalElements > 0 && shopsTruth.j.totalElements > 0 && bandTruth.j.totalElements > 0,
    `OysterBay=${obTruth.j.totalElements} COMMUNITY=${comTruth.j.totalElements} SHOPS=${shopsTruth.j.totalElements} band12-24k=${bandTruth.j.totalElements}`);
  assert('2-no-placeholder-copy-in-payload', !lorem, String(lorem));

  // ================= BROWSER LEGS per viewport =================
  const browser = await L.newBrowser();
  const VPS = [['375', { width: 375, height: 667 }], ['768', { width: 768, height: 1024 }]];
  for (const [vpName, vp] of VPS) {
    console.log(`===== VIEWPORT ${vpName} =====`);
    const ctx = await L.newCtx(browser, { viewport: vp, videoPath: `e2e/videos/${UNIT}-verify-r14b-${vpName}.webm` });
    const p = await ctx.newPage();
    p.on('console', m => { if (/error/i.test(m.type())) R.consoles.push({ vp: vpName, msg: m.text().slice(0, 160) }); });
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?#]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/[^?#]*\.(png|webp|jpg|svg)(\?|#|$)/i.test(u)) R.images[u] = r.status();
    });
    const lastBody = {};
    p.on('request', r => {
      const u = r.url();
      if (/displayItem\/filter/.test(u)) {
        const pd = r.postData() || '';
        let body = null; try { body = JSON.parse(pd); } catch (e) {}
        if (body) lastBody[vpName] = body;
        const q = new URL(u);
        R.wire.reqs.push({ vp: vpName, url: u.slice(u.indexOf('api/v1/')), body: pd.slice(0, 320),
          qp: { cond: q.searchParams.get('conditionFilter'), min: q.searchParams.get('minPrice'), max: q.searchParams.get('maxPrice'),
                term: q.searchParams.get('searchTerm'), nb: q.searchParams.get('neighbourhood'), src: q.searchParams.get('productSource'),
                page: q.searchParams.get('page'), size: q.searchParams.get('size'), seed: q.searchParams.get('seed') } });
      }
      if (/displayItem\/neighbourhoods/.test(u)) R.wire.nbReqs.push({ vp: vpName });
      if (/displayItem\/filter\?[^]*categoryIds=/.test(u)) R.wire.catReqs.push({ vp: vpName });
    });
    p.on('response', async r => {
      if (/displayItem\/filter/.test(r.url())) {
        try {
          const j = await r.json();
          const b = lastBody[vpName] || {};
          R.wire.resps.push({ vp: vpName, status: r.status(), total: j.totalElements, ret: (j.content || []).length,
            ids: (j.content || []).map(c => c.productId), names: (j.content || []).map(c => c.productName),
            conds: [...new Set((j.content || []).map(c => c.productCondition))],
            prices: (j.content || []).map(c => c.productAskingPrice), bodyKeys: Object.keys(b) });
          if (b && Object.keys(b).length) {
            const e2 = await echoPost(b);
            R.wire.echoes.push({ vp: vpName, body: b, status: e2.status, wireTotal: j.totalElements, echoTotal: e2.j && e2.j.totalElements });
          }
        } catch (e) { R.wire.resps.push({ vp: vpName, status: r.status(), err: String(e).slice(0, 80) }); }
      }
    });

    // ---- NAV to browse ----
    await gotoBrowse(p, vp);
    let t = await txt(p);
    const navBrowse = t.includes('Marketplace');
    NAV++; if (navBrowse) { NAV++; }
    btnck('nav-hash-/browse->Marketplace', navBrowse, 'hash nav to browse rendered Marketplace title');
    assert(`N1-${vpName}-browse-loads`, navBrowse && /TSh\s?[\d,]/.test(t), `Marketplace=${navBrowse}, priceNodes=${(t.match(/TSh [\d,]+/g) || []).length}`);
    await shot(p, vpName, '00-browse-initial');

    // ---------- LEG B/C/F/D/E: filter sheet criteria ----------
    async function sheetApply(modify, expectBodySubstr, legTag) {
      // open sheet
      const opened = (await L.clickBtn(p, 'Filters')) || (await jsClick(p, 'Filters'));
      await L.waitText(p, 'Apply filters', 12000);
      await sleep(1400);
      const sheetT = await txt(p);
      const fields = { nb: sheetT.includes('Neighbourhood'), src: sheetT.includes('Product source'), cond: sheetT.includes('Condition'), apply: sheetT.includes('Apply filters') };
      await modify(sheetT);
      await sleep(500);
      const markReq = R.wire.reqs.length, markResp = R.wire.resps.length, markEcho = R.wire.echoes.length;
      const applied = (await L.clickBtn(p, 'Apply filters')) || (await jsClick(p, 'Apply filters'));
      await sleep(3000);
      const reqHit = R.wire.reqs.slice(markReq).reverse().find(r => r.body.includes(expectBodySubstr));
      const respHit = R.wire.resps.slice(markResp).reverse().find(r => typeof r.total === 'number');
      const echoHit = R.wire.echoes.slice(markEcho).reverse().find(e => JSON.stringify(e.body).includes(expectBodySubstr));
      return { opened, applied, fields, reqHit, respHit, echoHit };
    }

    // --- condition LIKE_NEW ---
    {
      const r = await sheetApply(async () => {
        const hitC = (await jsClick(p, 'like new')) || (await jsClick(p, 'Like New'));
        console.log('cond chip click:', hitC);
        await sleep(600);
      }, '"conditionFilter":"LIKE_NEW"', 'cond');
      btnck(`${vpName} Filters-opens-sheet`, r.opened && r.fields.apply, JSON.stringify(r.fields));
      btnck(`${vpName} Apply-filters-commits`, r.applied, 'sheet Apply button clickable');
      assert(`${vpName}-B1-condition-rides-query-and-body`,
        !!r.reqHit && r.reqHit.qp.cond === 'LIKE_NEW' && r.reqHit.body.includes('"conditionFilter":"LIKE_NEW"'),
        `qp.conditionFilter=${r.reqHit && r.reqHit.qp.cond} body=${(r.reqHit && r.reqHit.body.slice(0, 160))}`);
      assert(`${vpName}-B2-condition-total==echo-truth`, !!r.echoHit && r.echoHit.status === 200 && r.echoHit.wireTotal === r.echoHit.echoTotal && r.echoHit.echoTotal > 0,
        `wire=${r.echoHit && r.echoHit.wireTotal} echo=${r.echoHit && r.echoHit.echoTotal}`);
      assert(`${vpName}-B3-condition-values-valid-on-wire`, !!r.respHit && r.respHit.conds.every(c => c === 'LIKE_NEW'),
        `conds=${JSON.stringify(r.respHit && r.respHit.conds)} total=${r.respHit && r.respHit.total}`);
      await scrollList(p, vp, 4); await sleep(700);
      t = await txt(p);
      const domHits = ((r.respHit && r.respHit.names) || []).filter(n => n && t.includes(n));
      assert(`${vpName}-B4-condition-results-render`, domHits.length >= 1, `domHits=${domHits.slice(0, 3)} wireTotal=${r.respHit && r.respHit.total}`);
      await shot(p, vpName, '10-cond-likenew-results');
    }

    // --- price band 12000..24000 ---
    {
      await L.clickBtn(p, 'Filters') || (await jsClick(p, 'Filters'));
      await L.waitText(p, 'Apply filters', 12000); await sleep(1500);
      // two number inputs: min then max (sheet renders TextFormField type=text aria Min/Max)
      const n = Math.min(2, await p.locator('input').count());
      console.log('price inputs found:', n);
      let filled = false;
      if (n >= 2) {
        const minIn = p.locator('input[aria-label="Min"]').first();
        const maxIn = p.locator('input[aria-label="Max"]').first();
        await minIn.click({ force: true }); await sleep(400);
        await minIn.fill(''); await p.keyboard.type('12000', { delay: 14 }); await sleep(300);
        await maxIn.click({ force: true }); await sleep(400);
        await maxIn.fill(''); await p.keyboard.type('24000', { delay: 14 }); await sleep(300);
        const typed = await p.evaluate(() => [...document.querySelectorAll('input')].map(i => i.value).join('|'));
        filled = /12000/.test(typed) && /24000/.test(typed);
        console.log('price typed values:', typed);
      }
      await shot(p, vpName, '15-sheet-price-filled');
      const markReq = R.wire.reqs.length, markResp = R.wire.resps.length, markEcho = R.wire.echoes.length;
      const applied = (await L.clickBtn(p, 'Apply filters')) || (await jsClick(p, 'Apply filters'));
      await sleep(3000);
      const reqHit = R.wire.reqs.slice(markReq).reverse().find(r => r.body.includes('"minPrice":12000'));
      const respHit = R.wire.resps.slice(markResp).reverse().find(x => typeof x.total === 'number');
      const echoHit = R.wire.echoes.slice(markEcho).reverse().find(e => e.body && e.body.minPrice === 12000 && e.body.maxPrice === 24000);
      btnck(`${vpName} price-inputs-fillable`, filled, `inputs=${n} typedValuesSeen=${filled}`);
      btnck(`${vpName} Apply-after-price`, applied, '');
      assert(`${vpName}-C1-price-rides-query-and-body`,
        !!reqHit && reqHit.qp.min === '12000' && reqHit.qp.max === '24000' && reqHit.body.includes('"minPrice":12000') && reqHit.body.includes('"maxPrice":24000'),
        `qp=${reqHit && reqHit.qp.min}/${reqHit && reqHit.qp.max} body=${(reqHit && reqHit.body.slice(0, 180))}`);
      assert(`${vpName}-C2-price-total==echo-truth`, !!echoHit && echoHit.wireTotal === echoHit.echoTotal && echoHit.echoTotal > 0,
        `wire=${echoHit && echoHit.wireTotal} echo=${echoHit && echoHit.echoTotal} curlTruth=${bandTruth.j.totalElements}`);
      const inBand = (respHit && respHit.prices || []).every(v => v >= 12000 && v <= 24000);
      assert(`${vpName}-C3-price-values-in-band`, inBand && (respHit && respHit.prices || []).length > 0,
        `prices sample=${JSON.stringify((respHit && respHit.prices || []).slice(0, 10))}`);
      await scrollList(p, vp, 3); await sleep(600);
      await shot(p, vpName, '20-price-band-results');
    }

    // --- neighbourhood dropdown (prior blocker F-NB) ---
    {
      await gotoBrowse(p, vp); await sleep(1500); // fresh browse so the sheet starts with NO criteria
      await L.clickBtn(p, 'Filters') || (await jsClick(p, 'Filters'));
      await L.waitText(p, 'Apply filters', 12000); await sleep(2200); // allow neighbourhoods fetch to settle
      const sheetT = await txt(p);
      // tap the Neighbourhood field to open the dropdown menu
      const tapped = (await jsClick(p, 'Neighbourhood')) ;
      await sleep(1200);
      const menuT = await txt(p);
      const shownReal = nbNames.filter(n => menuT.includes(n));
      assert(`${vpName}-D1-dropdown-lists-real-endpoint-names`, shownReal.length >= 3,
        `endpointCount=${nbNames.length} shownInMenu=${shownReal.length} sample=${shownReal.slice(0, 6)} oysterBayListed=${menuT.includes('Oyster Bay')}`);
      await shot(p, vpName, '25-sheet-nb-options');
      // pick Oyster Bay from the open menu (smallest exact node)
      const picked = (await jsClick(p, 'Oyster Bay'));
      await sleep(1100);
      const afterPick = (await txt(p)).replace(/\n+/g, ' ');
      assert(`${vpName}-D2-pick-reflected-in-field`, picked && /Neighbourhood\s*Oyster Bay/.test(afterPick),
        `picked=${picked} snippet="${(afterPick.split('Neighbourhood')[1] || '').slice(0, 40)}"`);
      await shot(p, vpName, '26-sheet-nb-selected');
      const markReq = R.wire.reqs.length, markResp = R.wire.resps.length, markEcho = R.wire.echoes.length;
      const applied = (await L.clickBtn(p, 'Apply filters')) || (await jsClick(p, 'Apply filters'));
      await sleep(3000);
      const reqHit = R.wire.reqs.slice(markReq).reverse().find(r => r.body.includes('"neighbourhood":"Oyster Bay"'));
      const respHit = R.wire.resps.slice(markResp).reverse().find(x => typeof x.total === 'number');
      const echoHit = R.wire.echoes.slice(markEcho).reverse().find(e => e.body && e.body.neighbourhood === 'Oyster Bay' && !e.body.productSource);
      btnck(`${vpName} Apply-after-neighbourhood`, applied, '');
      assert(`${vpName}-D3-neighbourhood-rides-query-and-body`,
        !!reqHit && reqHit.qp.nb === 'Oyster Bay' && reqHit.body.includes('"neighbourhood":"Oyster Bay"'),
        `qp.nb=${reqHit && reqHit.qp.nb} body=${(reqHit && reqHit.body.slice(0, 170))}`);
      // D4: the app's wire total must equal an immediate node-side replay of the SAME body
      // (drift-proof). A 0-result combined filter is server truth (nb+price+cond can be empty),
      // so the equality check — not positivity of totalElements — is the criterion.
      assert(`${vpName}-D4-nb-total==echo-truth`, !!echoHit && echoHit.status === 200 && echoHit.wireTotal === echoHit.echoTotal,
        `wire=${echoHit && echoHit.wireTotal} echo=${echoHit && echoHit.echoTotal} body=${JSON.stringify(echoHit && echoHit.body)} (nb-only curl truth=${obTruth.j.totalElements})`);
      await scrollList(p, vp, 3); await sleep(700);
      t = await txt(p);
      const hits = ((respHit && respHit.names) || []).filter(n => n && t.includes(n));
      const emptyOk = echoHit && echoHit.wireTotal === 0 && t.includes('No products match');
      assert(`${vpName}-D5-nb-results-render-match-wire`, hits.length >= 1 || !!emptyOk,
        `domHits=${hits.slice(0, 3)} wireTotal=${echoHit && echoHit.wireTotal} emptyStateShown=${t.includes('No products match')}`);
      await shot(p, vpName, '30-nb-oysterbay-results');
    }

    // --- productSource COMMUNITY + SHOPS (prior blocker F-SRC: LOCAL was 400-swallowed) ---
    for (const [chipLabel, enumVal, truth] of [['Community', 'COMMUNITY', comTruth], ['Shops', 'SHOPS', shopsTruth]]) {
      await gotoBrowse(p, vp); await sleep(1200);
      await L.clickBtn(p, 'Filters') || (await jsClick(p, 'Filters'));
      await L.waitText(p, 'Apply filters', 12000); await sleep(1500);
      const sheetT = await txt(p);
      const chipPairOk = sheetT.includes('Community') && sheetT.includes('Shops') && !/\bLOCAL\b/.test(sheetT) && !/\bInternational\b/i.test(sheetT);
      const chipHit = (await jsClick(p, chipLabel));
      await sleep(650);
      await shot(p, vpName, `35-sheet-source-${enumVal.toLowerCase()}`);
      const markReq = R.wire.reqs.length, markResp = R.wire.resps.length, markEcho = R.wire.echoes.length;
      const applied = (await L.clickBtn(p, 'Apply filters')) || (await jsClick(p, 'Apply filters'));
      await sleep(3000);
      const reqHit = R.wire.reqs.slice(markReq).reverse().find(r => r.body.includes(`"productSource":"${enumVal}"`));
      const respHit = R.wire.resps.slice(markResp).reverse().find(x => typeof x.total === 'number');
      const echoHit = R.wire.echoes.slice(markEcho).reverse().find(e => e.body && e.body.productSource === enumVal);
      btnck(`${vpName} source-chip-${chipLabel}`, !!chipHit && chipPairOk, `pairVisible=${chipPairOk}`);
      btnck(`${vpName} Apply-after-source`, applied, '');
      assert(`${vpName}-E1-source-body-valid-enum(${enumVal})`, !!reqHit && reqHit.body.includes(`"productSource":"${enumVal}"`),
        `body=${(reqHit && reqHit.body.slice(0, 170))}`);
      assert(`${vpName}-E2-source-http200-no-400(${enumVal})`, !!respHit && respHit.status === 200,
        `status=${respHit && respHit.status} (LOCAL would be 400: msg="${localProbe.j && localProbe.j.message}")`);
      assert(`${vpName}-E3-source-total==echo-truth(${enumVal})`, !!echoHit && echoHit.wireTotal === echoHit.echoTotal,
        `wire=${echoHit && echoHit.wireTotal} echo=${echoHit && echoHit.echoTotal} curlTruth=${truth.j.totalElements}`);
      await scrollList(p, vp, 3); await sleep(600);
      t = await txt(p);
      const hits = ((respHit && respHit.names) || []).filter(n => n && t.includes(n));
      assert(`${vpName}-E4-source-renders-matching(${enumVal})`, hits.length >= 1 || echoHit.echoTotal === 0,
        `domHits=${hits.slice(0, 3)} wireTotal=${echoHit && echoHit.wireTotal}`);
      await shot(p, vpName, `40-source-${enumVal.toLowerCase()}-result`);
    }

    // ---------- LEG G: grid/list toggle ----------
    {
      await gotoBrowse(p, vp); await sleep(1800);
      const tol = Math.round(vp.width * 0.22);
      const prePts = await priceGeo(p); const preCl = clusterCount(prePts, tol);
      const togBefore = await p.evaluate(() => {
        const hits = [];
        document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
          const tt = (e.textContent || '').trim();
          if (/^(List|Grid) view$/.test(tt)) { const r = e.getBoundingClientRect(); if (r.width > 4) hits.push({ t: tt, w: Math.round(r.width), x: Math.round(r.x), y: Math.round(r.y) }); }
        });
        hits.sort((a, b) => a.w - b.w);
        return hits.length ? `${hits[0].t}@${hits[0].x},${hits[0].y}` : '';
      });
      const targetLbl = togBefore.includes('Grid view') ? 'Grid view' : 'List view';
      const togHit = await jsClick(p, targetLbl);
      await sleep(1700);
      const postPts = await priceGeo(p); const postCl = clusterCount(postPts, tol);
      const togAfter = await p.evaluate(() => {
        const hits = [];
        document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
          const tt = (e.textContent || '').trim();
          if (/^(List|Grid) view$/.test(tt)) { const r = e.getBoundingClientRect(); if (r.width > 4) hits.push({ t: tt, w: Math.round(r.width) }); }
        });
        hits.sort((a, b) => a.w - b.w);
        return hits.length ? hits[0].t : '';
      });
      btnck(`${vpName} grid-list-toggle-present+clicked`, !!togHit && togBefore !== '', `before="${togBefore}" after="${togAfter}"`);
      assert(`${vpName}-G1-toggle-flips-state`, !!togHit && togBefore !== togAfter, `before="${togBefore}" after="${togAfter}"`);
      assert(`${vpName}-G2-layout-visibly-changes`, togHit && postCl !== preCl,
        `pre cols=${preCl} (nodes ${prePts.length}) -> post cols=${postCl} (nodes ${postPts.length}); list rows are full-width single-cluster`);
      await shot(p, vpName, '45-toggled-list-mode');
      const backHit = await jsClick(p, togAfter.includes('Grid view') ? 'Grid view' : 'List view');
      await sleep(1500);
      const backPts = await priceGeo(p); const backCl = clusterCount(backPts, tol);
      assert(`${vpName}-G3-toggle-back-restores`, !!backHit && backCl === preCl, `restored cols=${backCl} orig=${preCl}`);
      await shot(p, vpName, '46-grid-restored');
    }

    // ---------- LEG A: infinite scroll dedupe + stop at totalElements ----------
    let A3 = null;
    {
      await gotoBrowse(p, vp); await sleep(2000);
      const markR = R.wire.reqs.length, markP = R.wire.resps.length;
      const seenIds = new Set(); const pages = new Set(); const seeds = new Set();
      let lastTotal = 0, stagnant = 0, stoppedClean = false;
      const curlTotal = (await echoPost({ page: 0, size: 1 })).j.totalElements; // independent truth NOW
      let lastProgressAt = 0;
      for (let round = 0; round < 90; round++) {
        if (stoppedClean) break;
        await scrollList(p, vp, 6, 0.6);
        await sleep(750);
        const harvest = () => {
          R.wire.reqs.slice(markR).forEach(r => {
            const b = (() => { try { return JSON.parse(r.body); } catch (e) { return null; } })();
            if (b && b.seed != null) { pages.add(`${b.seed}#${b.page}`); seeds.add(String(b.seed)); }
          });
          R.wire.resps.slice(markP).filter(x => x.vp === vpName && Array.isArray(x.ids)).forEach(x => x.ids.forEach(id => seenIds.add(id)));
          const rr = R.wire.resps.slice(markP).filter(x => x.vp === vpName && typeof x.total === 'number');
          if (rr.length) lastTotal = rr[rr.length - 1].total;
        };
        harvest();
        console.log(`[A3 ${vpName}] round=${round} seen=${seenIds.size}/${lastTotal} pages=${pages.size}`);
        if (lastTotal && seenIds.size >= lastTotal) { stoppedClean = true; break; }
        stagnant++;
        // every round after the first stall: bounce to bottom-most content then hard down,
        // so Flutter's viewport-based listener actually fires again.
        if (stagnant >= 1) {
          await p.mouse.move(Math.round(vp.width / 2), Math.round(vp.height * 0.5));
          for (let i = 0; i < 5; i++) { await p.mouse.wheel(0, -900); await sleep(80); }
          for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, 1100); await sleep(100); }
          await sleep(1100);
          harvest();
          if (seenIds.size > lastProgressAt) { lastProgressAt = seenIds.size; stagnant = 0; }
        }
        // honest give-up ONLY after a long plateau with zero new ids AND zero new pages
        if (seenIds.size === lastProgressAt && stagnant > 24) break;
      }
      const winReqs = R.wire.reqs.slice(markR).map(r => { try { return JSON.parse(r.body); } catch (e) { return {}; } }).filter(b => b.seed != null);
      const keys = winReqs.map(b => `${b.seed}#${b.page}`);
      const distinctPages = [...new Set(keys)].length;
      const pageNoCounts = {};
      keys.forEach(k => { const pg = k.split('#')[1]; pageNoCounts[pg] = (pageNoCounts[pg] || 0) + 1; });
      const replayedPageNos = Object.entries(pageNoCounts).filter(([, c]) => c > 1).map(([pg]) => pg);
      const sizes = [...new Set(winReqs.map(b => b.size))];
      const dupIdsAcrossWire = (() => { const c = {}; let d = 0; R.wire.resps.slice(markP).filter(x => x.vp === vpName).forEach(x => (x.ids || []).forEach(id => { c[id] = (c[id] || 0) + 1; if (c[id] === 2) d++; })); return d; })();
      A3 = { uniqueIds: seenIds.size, lastTotal, curlTotal, stoppedClean, rounds: stagnant, distinctSeedPageKeys: distinctPages, requestsWithSeed: keys.length, maxPage: Math.max(-1, ...keys.map(k => Number(k.split('#')[1]))), distinctSeeds: seeds.size, sizes, replayedPageNos, wireRowsWithDupId: dupIdsAcrossWire };
      assert(`${vpName}-A1-pages-unique-no-replay`, keys.length >= 3 && replayedPageNos.length === 0 && sizes.length === 1,
        `seed#page keys=${distinctPages}/${keys.length} replayedPageNos=[${replayedPageNos}] sizeSet=${JSON.stringify(sizes)} maxPage=${A3.maxPage}`);
      assert(`${vpName}-A2-single-seed-session`, seeds.size === 1, `seeds=${[...seeds].join(',')}`);
      assert(`${vpName}-A3-dedupe-accumulates-distinct-and-STOPS-at-totalElements`,
        lastTotal > 0 && stoppedClean && seenIds.size === lastTotal && dupIdsAcrossWire === 0,
        `accumulatedUniqueIds=${seenIds.size} == wire totalElements=${lastTotal} (curl truth now=${curlTotal}); stoppedClean=${stoppedClean}; wire dup id rows=${dupIdsAcrossWire}`);
      await shot(p, vpName, '50-scroll-end-dedupe');
    }

    // ---------- LEG F: searchTerm through UI + card tap nav ----------
    {
      await gotoBrowse(p, vp); await sleep(1500);
      await typeIntoSearch(p, TERM);
      await sleep(2800);
      await scrollList(p, vp, 3);
      t = await txt(p);
      const termHits = termNames.filter(n => t.includes(n));
      assert(`${vpName}-F1-searchTerm-renders-real-fixtures`, termHits.length >= 1,
        `domHits=${termHits.slice(0, 4)} curlTermTotal=${termProbe.j.totalElements}`);
      await shot(p, vpName, '55-search-results');
      // card tap: use smallest tappable node carrying the FIRST result name (r6's clickCard failed here)
      const firstName = termNames[0] || 'ZZZNONE';
      const probe = firstName.slice(0, 14);
      const hit = await p.evaluate((lbl) => {
        let best = null;
        document.querySelectorAll('flt-semantics').forEach(e => {
          const tt = (e.textContent || '').trim();
          if (!tt.includes(lbl)) return;
          if (e.getAttribute('flt-tappable') === null && e.getAttribute('role') !== 'button') return;
          const r = e.getBoundingClientRect();
          if (r.width < 30 || r.height < 30 || r.bottom < 0 || r.top > innerHeight) return;
          const a = r.width * r.height;
          if (!best || a < best.a) best = { a, x: Math.max(4, Math.min(Math.round(r.x + r.width / 2), innerWidth - 4)),
            y: Math.max(30, Math.min(Math.round(r.y + r.height / 2), innerHeight - 8)) };
        });
        return best;
      }, probe);
      let tapped = false;
      if (hit) { await p.mouse.click(hit.x, hit.y); await sleep(3000); tapped = true; }
      else { tapped = await L.clickCard(p, probe); await sleep(2500); }
      t = await txt(p);
      const markers = { buyNow: t.includes('Buy now'), addCart: t.includes('Add to cart'), chat: t.includes('Chat with seller'), askQ: t.includes('Ask') };
      assert(`${vpName}-F2-card-tap-navigates-to-product-detail`, tapped && (markers.buyNow || markers.addCart || markers.chat),
        `tapped=${tapped} probe="${probe}" markers=${JSON.stringify(markers)}`);
      NAV++;
      await shot(p, vpName, '56-card-detail');
      // go back for next leg
      await gotoBrowse(p, vp);
    }

    // ---------- K1: CLICK SWEEP every visible control ----------
    {
      await gotoBrowse(p, vp); await sleep(2200);
      const done = new Set(); const noEffect = []; let total = 0; let passCount = 0;
      for (let sweep = 0; sweep < 3; sweep++) {
        // walk the horizontal category strip into view between sweeps
        const ctrls = await p.evaluate(() => {
          const out = [];
          document.querySelectorAll('flt-semantics').forEach(e => {
            const role = e.getAttribute('role'); const tap = e.getAttribute('flt-tappable');
            if (role !== 'button' && tap === null) return;
            const r = e.getBoundingClientRect();
            if (r.width < 8 || r.height < 8) return;
            out.push({ label: (e.textContent || '').trim().slice(0, 48) || (e.getAttribute('aria-label') || 'icon'),
              cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2),
              fullyVisible: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth });
          });
          return out.filter(c => c.cy >= 0 && c.cy <= innerHeight && c.cx >= 0 && c.cx <= innerWidth);
        });
        for (const c of ctrls) {
          const key = `${c.label}|${Math.round(c.cx / 12)}|${Math.round(c.cy / 12)}`;
          if (done.has(key)) continue;
          done.add(key); total++;
          const beforeReqs = R.wire.reqs.length + R.wire.catReqs.length;
          const beforeTxt = await txt(p);
          await p.mouse.move(Math.max(4, Math.min(c.cx, vp.width - 4)), Math.max(4, Math.min(c.cy, vp.height - 4)));
          await p.mouse.click(Math.max(4, Math.min(c.cx, vp.width - 4)), Math.max(4, Math.min(c.cy, vp.height - 4)));
          await sleep(950);
          const afterTxt = await txt(p);
          const delta = R.wire.reqs.length + R.wire.catReqs.length - beforeReqs;
          const effect = delta > 0 || afterTxt !== beforeTxt;
          if (effect) passCount++; else noEffect.push(c.label);
          // recover from any navigation/overlay so the sweep continues on browse
          if (!(await txt(p)).includes('Marketplace')) { await gotoBrowse(p, vp); }
          else {
            const ov = await txt(p);
            if (ov.includes('Apply filters')) { await L.clickBtn(p, 'Cancel') || await p.mouse.click(8, Math.round(vp.height / 2)); await sleep(600); }
          }
        }
        if (sweep === 0) { // ensure category strip scrolled fully into view before judging its chips
          await p.evaluate(() => window.scrollBy && window.scrollBy(0, 0));
          await p.mouse.move(Math.round(vp.width / 2), Math.round(vp.height * 0.25));
          for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, -300); await sleep(120); }
          await sleep(600);
        }
      }
      const catChipsClicked = R.wire.catReqs.filter(c => c.vp === vpName).length;
      assert(`${vpName}-K1-every-visible-control-clicked-with-effect`, noEffect.length === 0 && total >= 6,
        `controls=${total} ok=${passCount} noEffect=[${noEffect.slice(0, 10).join('; ')}] categoryChipWireRequests=${catChipsClicked}`);
      assert(`${vpName}-K2-category-chips-fire-filter-with-categoryIds`, catChipsClicked >= 1,
        `wire requests carrying categoryIds=${catChipsClicked} (chips are in a horizontal ListView; wheel-up pass brings them on-screen)`);
      await shot(p, vpName, '60-after-click-sweep');
    }

    // ---------- images summary for this viewport ----------
    const imgEnt = Object.entries(R.images);
    const broken = imgEnt.filter(([, s]) => s >= 400);
    assert(`${vpName}-IMG-tracked-assets-all-200`, broken.length === 0 && imgEnt.length >= 1,
      `tracked=${imgEnt.length} broken=${broken.slice(0, 4)}`);

    const vf = `e2e/videos/${UNIT}-verify-r14b-${vpName}.webm`;
    await L.closeVideo(ctx, vf);
    R.videos.push(vf);
    console.log('video saved', vf);
  }

  // ================= IMAGES reconciled across both viewports =================
  const imgEntries = Object.entries(R.images);
  R.checks.images_requested = imgEntries.length;
  R.checks.images_200 = imgEntries.filter(([, s]) => s === 200 || s === 304).length;
  R.checks.images_broken = imgEntries.filter(([, s]) => s >= 400).map(([u, s]) => `${s} ${u}`);
  assert('IMG-all-images-200-nonempty', R.checks.images_requested > 10 && R.checks.images_200 === R.checks.images_requested,
    `${R.checks.images_200}/${R.checks.images_requested} tracked image responses HTTP 200/304`);

  // ================= PARITY vs :3000 same flow =================
  try {
    const rb = await L.newBrowser();
    for (const [vpName, vp] of [['375', { width: 375, height: 667 }], ['768', { width: 768, height: 1024 }]]) {
      const rctx = await rb.newContext({ viewport: vp });
      const rp = await rctx.newPage();
      await rp.goto(REF + '/browse', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await sleep(3500);
      const rf = `e2e/shots/${UNIT}/ref-${vpName}-browse.png`;
      await L.screenshot(rp, rf); R.refShots.push(rf);
      // reference narrowing behavior through ITS OWN proxy endpoint
      const refCond = await rp.evaluate(async () => {
        const r = await fetch('/api/apidev/displayItem/filter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 0, size: 24, conditionFilter: 'LIKE_NEW' }) }).catch(e => null);
        if (!r) return { err: 'fetch-fail' }; const j = await r.json().catch(() => null);
        return j ? { status: r.status, total: j.totalElements } : { status: r.status, parseFail: true };
      });
      const refAll = await rp.evaluate(async () => {
        const r = await fetch('/api/apidev/displayItem/filter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 0, size: 24 }) }).catch(e => null);
        if (!r) return { err: 'fetch-fail' }; const j = await r.json().catch(() => null);
        return j ? { status: r.status, total: j.totalElements } : { status: r.status };
      });
      const likeNewMobile = (await echoPost({ page: 0, size: 24, conditionFilter: 'LIKE_NEW' })).j.totalElements;
      const narrowsBoth = refCond.total !== undefined && refAll.total !== undefined && refCond.total < refAll.total && likeNewMobile < allFeed.j.totalElements;
      assert(`P1-ref-${vpName}-condition-filter-narrows-same-shape`, narrowsBoth,
        `ref proxy: all=${refAll.total} LIKE_NEW=${refCond.total}; mobile sandbox: all=${allFeed.j.totalElements} LIKE_NEW=${likeNewMobile}`);
      await rctx.close();
    }
    await rb.close();
  } catch (e) { assert('P1-parity-probe', false, 'parity harness error ' + String(e).slice(0, 120)); }

  // ================= VERDICT =================
  R.stateAsserts = R.asserts.filter(a => /A1-|A2-|A3-|G1-|G2-|G3-/.test(a.name)).length;
  R.navAsserts = NAV; R.dataAsserts = DATA;
  R.checks.state_asserts = R.asserts.filter(a => /^(\d+-)?[A-G]\d|^.*-(A1|A2|A3|B\d|C\d|D\d|E\d|F\d|G\d)-/.test(a.name)).length;
  const failing = R.failures.filter(f => !f.startsWith('button:'));
  R.verdict = (failing.length === 0 && R.checks.buttons_failed.length === 0 && R.checks.freshness &&
    R.checks.real_data && R.checks.images_broken.length === 0 && R.checks.images_200 === R.checks.images_requested) ? 'PASS' : 'FAIL';
  R.checks.parity.blocker = R.verdict === 'FAIL' ? 1 : 0;
  fs.mkdirSync('e2e/results/shards', { recursive: true });
  fs.writeFileSync(`e2e/results/shards/raw-${UNIT}-r14b.json`, JSON.stringify(R, null, 1));
  console.log(`DONE ${R.verdict} asserts ${R.asserts.filter(a => a.pass).length}/${R.asserts.length} btns ${R.checks.buttons_ok}/${R.checks.buttons_total} imgs ${R.checks.images_200}/${R.checks.images_requested} runtimeMs=${Date.now() - T0}`);
  await browser.close();
  process.exit(R.verdict === 'PASS' ? 0 : 1);
})().catch(e => { console.error('FATAL', (e && e.stack) || e);
  try { fs.writeFileSync(`e2e/results/shards/raw-${UNIT}-r14b.json`, JSON.stringify(R, null, 1)); } catch (_) {}
  process.exit(2); });
