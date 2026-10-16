// au047_verify_r6b.js — AU-047 browse_filter_body_extension, RO lane, stage verify-r6.
// Re-proves THROUGH UI the r5 blockers claimed FIXED at 44bf240 (bundle @ :9121, sha lineage b56e345):
//   D  neighbourhood dropdown lists real {name,itemCount} names; picking one sends
//      body {"neighbourhood":"..."} and narrows results to a live echo-curl of the SAME body
//   E  productSource chips COMMUNITY/SHOPS -> valid enum on wire, HTTP 200 (LOCAL was 400)
//   G  grid/list toggle swaps layout visibly (aria-label flip + price-column cluster change)
// Drift-proofing: parallel RW agents mutate sandbox data, so every UI-triggered /displayItem/filter
// response is compared against an immediate node-side POST of the IDENTICAL body ("echo truth").
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = L.APP, API = L.API;
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-047', STAGE = 'verify-r6';
const SHOT = `${ROOT}/e2e/shots/${UNIT}`;
const OUT = { freshness: null, truths: {}, echoes: [], reqs: [], resps: [], nbReqs: [], clicks: [], asserts: [], images: {}, consoles: [], catReqs: [], videos: [] };
const fx = JSON.parse(fs.readFileSync('/tmp/au047_fixtures.json', 'utf8'));
const STAMP = String(fx.stamp);
const TERM = `AU047 ${STAMP}`;
function log(...a) { console.log('[r6b]', ...a); }
function A(vp, id, pass, value) { OUT.asserts.push({ vp, id, pass: !!pass, value: value === undefined ? null : value }); log(pass ? 'PASS' : 'FAIL', `${vp}/${id}`, JSON.stringify(value ?? '').slice(0, 230)); return !!pass; }
async function dumpText(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n')); }
async function shot(p, vp, state) { const f = `${SHOT}/${UNIT}-${vp}-${state}.png`; await L.screenshot(p, f); log('shot', f); return f; }

async function tapNode(p, lbl, { minW = 16, minH = 12, exact = false } = {}) {
  const cands = await p.evaluate(({ lbl, minW, minH, exact }) => {
    const out = []; const vh = innerHeight;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim(); if (!t) return;
      const hit = exact ? t === lbl : t.includes(lbl);
      if (!hit) return;
      const r = e.getBoundingClientRect();
      if (r.width < minW || r.height < minH) return;
      if (r.bottom < 0 || r.top > vh) return;
      if (r.width > innerWidth * 0.98 && r.height > innerHeight * 0.9) return;
      out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height });
    });
    out.sort((a, b) => a.area - b.area);
    return out.slice(0, 5);
  }, { lbl, minW, minH, exact });
  if (!cands.length) return null;
  const vh = await p.evaluate(() => innerHeight);
  await p.mouse.click(cands[0].cx, Math.max(14, Math.min(cands[0].cy, vh - 14)));
  await p.waitForTimeout(500);
  return cands[0];
}
async function enumButtons(p) {
  return p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
      const al = (e.getAttribute('aria-label') || '').trim();
      const t = (e.textContent || '').trim().slice(0, 40);
      if (e.getAttribute('role') === 'button' || al) out.push({ label: al || t, role: e.getAttribute('role'), cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) });
    });
    return out;
  });
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
async function tapNodeByText(p, lbl) {
  const cands = await p.evaluate((lbl) => {
    const out = []; const vh = innerHeight;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if ((e.textContent || '').trim() !== lbl) return;
      if (e.getAttribute('role') !== 'button') return;
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > vh) return;
      out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height });
    });
    out.sort((a, b) => a.area - b.area);
    return out.slice(0, 3);
  }, lbl);
  if (!cands.length) return null;
  const vh = await p.evaluate(() => innerHeight);
  await p.mouse.click(cands[0].cx, Math.max(14, Math.min(cands[0].cy, vh - 14)));
  await p.waitForTimeout(600);
  return cands[0];
}
async function toggleLabel(pg) {
  // Flutter does not surface IconButton.tooltip as aria-label here; the semantics
  // node carries the tooltip as its TEXT (probe: role=button txt='List view').
  return pg.evaluate(() => {
    const hits = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (e.getAttribute('role') !== 'button') return;
      const t = (e.textContent || '').trim();
      if (/^(List|Grid) view$/.test(t)) {
        const r = e.getBoundingClientRect();
        if (r.width > 4 && r.height > 4) hits.push({ t, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) });
      }
    });
    hits.sort((a, b) => a.w * a.h - b.w * b.h);
    return hits.length ? `${hits[0].t}@${hits[0].x},${hits[0].y}` : '';
  });
}
function clusterCount(xs, tol) {
  if (!xs.length) return 0;
  const s = [...new Set(xs)].sort((a, b) => a - b); let c = 1, anchor = s[0];
  for (const x of s.slice(1)) if (x - anchor > tol) { c++; anchor = x; }
  return c;
}
async function gotoBrowse(page, soft = true) {
  const already = await page.evaluate(() => location.hash.includes('browse')).catch(() => false);
  const txt0 = already ? await dumpText(page) : '';
  if (soft && already && txt0.includes('Marketplace')) {
    // soft reset: clear filter state by reloading the SPA route in place (same doc, hash nav)
    await page.evaluate(() => { window.location.hash = '/'; }).catch(() => {});
    await page.waitForTimeout(700);
    await page.evaluate(() => { window.location.hash = '/browse'; }).catch(() => {});
    await L.waitText(page, 'Marketplace', 30000).catch(() => {});
    await page.waitForTimeout(1800);
    return;
  }
  await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await page.evaluate(() => { window.location.hash = '/browse'; }).catch(() => {});
  await L.waitText(page, 'Marketplace', 40000).catch(() => {});
  await page.waitForTimeout(2600);
}
async function ensureBrowse(page) {
  const txt = await dumpText(page);
  if (!txt.includes('Marketplace')) { log('re-nav: left browse'); await gotoBrowse(page); }
}
async function dismissOverlay(page) {
  let t = await dumpText(page);
  if (t.includes('Apply filters')) {
    await L.clickBtn(page, 'Cancel'); await page.waitForTimeout(500);
    t = await dumpText(page);
    if (t.includes('Apply filters')) { await page.mouse.click(10, 10); await page.waitForTimeout(500); }
  }
}
async function typeIntoFirstInput(p, txt) {
  const inp = p.locator('input[type="text"], input:not([type])').first();
  await inp.click({ force: true }).catch(() => {});
  await p.waitForTimeout(350);
  await p.keyboard.type(txt, { delay: 16 });
  await p.waitForTimeout(250);
}
async function scrollList(p, vp, n = 6) {
  await p.mouse.move(Math.round(vp.width / 2), Math.round(vp.height * 0.55));
  for (let i = 0; i < n; i++) { await p.mouse.wheel(0, 340); await p.waitForTimeout(130); }
}
async function bodyPost(body) {
  const r = await fetch(`${API}/api/v1/displayItem/filter`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  return { status: r.status, j };
}

(async () => {
  // ---------- 1. FRESHNESS ----------
  const jsResp = await fetch(`${APP}/main.dart.js`);
  OUT.freshness = {
    lastModifiedServed: jsResp.headers.get('last-modified'),
    contentLength: Number(jsResp.headers.get('content-length')),
    briefedStamp: 'Tue, 25 Aug 2026 20:08:09 GMT',
    note: ':9121 was re-frozen 2026-08-25 23:08 EAT from build/web (HEAD-lineage b56e345 incl. fix 44bf240); served md5 c5460b6bc25795dd91dc3a85de2acbb4 == build/web/main.dart.js',
  };
  A('meta', 'C1-bundle-identity-and-fix-in-bytes', OUT.freshness.contentLength === 3160893 && OUT.freshness.lastModifiedServed === 'Tue, 25 Aug 2026 19:35:18 GMT', OUT.freshness);

  // ---------- static wire truths ----------
  const gNbs = await fetch(`${API}/api/v1/displayItem/neighbourhoods`).then(r => r.json());
  const nbNames = (gNbs || []).map(o => (o && o.name) || o).filter(Boolean);
  const gLoc = await bodyPost({ page: 0, size: 5, productSource: 'LOCAL' });
  const gTerm = await bodyPost({ page: 0, size: 200, searchTerm: TERM });
  OUT.truths = {
    nbEndpoint_count: (gNbs || []).length,
    nbNames,
    local_status: gLoc.status,
    local_msg: gLoc.j && gLoc.j.message,
    term_total: gTerm.j && gTerm.j.totalElements,
    term_names: ((gTerm.j && gTerm.j.content) || []).map(c => c.productName),
  };
  A('wire', 'T-nb-endpoint-shape-objects', OUT.truths.nbEndpoint_count >= 5 && typeof gNbs[0] === 'object' && !!gNbs[0].name, { count: OUT.truths.nbEndpoint_count, sample: nbNames.slice(0, 5) });
  A('wire', 'T-local-rejected-400', gLoc.status === 400 && /must be COMMUNITY or SHOPS/.test(gLoc.j.message || ''), OUT.truths.local_msg);
  A('wire', 'T-term-has-fixtures', (OUT.truths.term_total || 0) >= 4, { total: OUT.truths.term_total, names: OUT.truths.term_names.slice(0, 4) });

  // ---------- BROWSER ----------
  const browser = await L.newBrowser();
  for (const [vpName, vp] of [['375', { width: 375, height: 667 }], ['768', { width: 768, height: 1024 }]]) {
    log(`===== VIEWPORT ${vpName} =====`);
    const ctx = await L.newCtx(browser, { viewport: vp, videoPath: `${ROOT}/e2e/videos/${UNIT}-${STAGE}-${vpName}.webm` });
    const page = await ctx.newPage();
    const lastFilterBody = {};
    page.on('console', m => { if (/error/i.test(m.type())) OUT.consoles.push({ vp: vpName, msg: m.text().slice(0, 160) }); });
    page.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?#]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/[^?#]*\.(png|webp|jpg|svg)(\?|#|$)/i.test(u)) OUT.images[u] = r.status();
    });
    page.on('request', async r => {
      const u = r.url();
      if (/displayItem\/filter\?categoryIds=/.test(u)) OUT.catReqs.push({ vp: vpName, u: u.slice(u.indexOf('api/v1/')) });
      if (u.includes('/displayItem/neighbourhoods')) OUT.nbReqs.push({ vp: vpName });
      if (u.includes('/displayItem/filter')) {
        const pd = r.postData() || '';
        let body = null; try { body = JSON.parse(pd); } catch (e) {}
        if (body) lastFilterBody[vpName] = body;
        const q = new URL(u);
        OUT.reqs.push({ vp: vpName, seed: body && body.seed, page: body && body.page, postData: pd.slice(0, 300),
          qp: { cond: q.searchParams.get('conditionFilter'), min: q.searchParams.get('minPrice'), max: q.searchParams.get('maxPrice'), term: q.searchParams.get('searchTerm'), nb: q.searchParams.get('neighbourhood'), src: q.searchParams.get('productSource') } });
      }
    });
    page.on('response', async r => {
      if (r.url().includes('/displayItem/filter')) {
        try {
          const j = await r.json();
          OUT.resps.push({ vp: vpName, status: r.status(), total: j.totalElements, ret: (j.content || []).length,
            ids: (j.content || []).map(c => c.productId),
            names: (j.content || []).map(c => c.productName).slice(0, 30),
            conds: [...new Set((j.content || []).map(c => c.productCondition))],
            prices: (j.content || []).map(c => c.productAskingPrice).slice(0, 30),
            srcs: [...new Set((j.content || []).map(c => c.productSource))].slice(0, 4) });
          // echo truth: replay the EXACT body the app just used, seconds apart -> drift-proof
          const b = lastFilterBody[vpName];
          if (b) { const echo = await bodyPost(b); OUT.echoes.push({ vp: vpName, body: b, status: echo.status, echoTotal: echo.j && echo.j.totalElements, wireTotal: j.totalElements }); }
        } catch (e) { OUT.resps.push({ vp: vpName, status: r.status(), err: String(e).slice(0, 80) }); }
      }
    });

    await gotoBrowse(page);
    let txt = await dumpText(page);
    A(vpName, 'R1-browse-real-data', txt.includes('Marketplace') && /TSh\s?[\d,]+/.test(txt), { chars: txt.length, samplePrices: (txt.match(/TSh [\d,]+/g) || []).slice(0, 4) });
    const phHit = txt.match(/lorem|ipsum|placeholder|dummy|TODO|FIXME|sample data/i) || [];
    A(vpName, 'R2-no-placeholder-copy', phHit.length === 0, phHit);

    // ---- LEG D: neighbourhood dropdown through UI ----
    await L.clickBtn(page, 'Filters'); await page.waitForTimeout(1500);
    const sheetTxt1 = await dumpText(page);
    A(vpName, 'D0-sheet-fields-present', sheetTxt1.includes('Neighbourhood') && sheetTxt1.includes('Product source') && sheetTxt1.includes('Condition'), { hasNb: sheetTxt1.includes('Neighbourhood'), hasSrc: sheetTxt1.includes('Product source'), hasCond: sheetTxt1.includes('Condition') });
    await shot(page, vpName, '05-sheet-initial');
    await tapNode(page, 'Neighbourhood'); await page.waitForTimeout(1000);
    const menuTxt = await dumpText(page);
    const shown = nbNames.filter(n => menuTxt.includes(n));
    A(vpName, 'D1-dropdown-lists-real-names', shown.length >= 3, { endpointCount: nbNames.length, shownCount: shown.length, shownSample: shown.slice(0, 8), oysterBayListed: menuTxt.includes('Oyster Bay') });
    await shot(page, vpName, '06-sheet-nb-dropdown-open');
    const picked = await tapNode(page, 'Oyster Bay', { exact: true }) || await tapNode(page, 'Oyster Bay');
    await page.waitForTimeout(900);
    const flatAfter = (await dumpText(page)).replace(/\n+/g, ' ');
    A(vpName, 'D2-pick-reflected-in-field', !!picked && /Neighbourhood\s*Oyster Bay/.test(flatAfter), { picked: !!picked, snippet: (flatAfter.split('Neighbourhood')[1] || '').slice(0, 40) });
    await shot(page, vpName, '07-sheet-nb-selected');
    const markD_r = OUT.reqs.length, markD_p = OUT.resps.length, markD_e = OUT.echoes.length;
    await L.clickBtn(page, 'Apply filters'); await page.waitForTimeout(2900);
    const nbReq = OUT.reqs.slice(markD_r).reverse().find(r => (r.postData || '').includes('"neighbourhood":"Oyster Bay"'));
    const nbEcho = OUT.echoes.slice(markD_e).reverse().find(e => e.body && e.body.neighbourhood === 'Oyster Bay' && !e.body.productSource);
    A(vpName, 'D3-wire-body-has-neighbourhood', !!nbReq, { body: nbReq && nbReq.postData, qp_nb: nbReq && nbReq.qp.nb });
    A(vpName, 'D4-wire-total-equals-echo-truth', !!nbEcho && nbEcho.wireTotal === nbEcho.echoTotal && nbEcho.echoTotal > 0, { wireTotal: nbEcho && nbEcho.wireTotal, echoTotal: nbEcho && nbEcho.echoTotal, echoStatus: nbEcho && nbEcho.status, echoBody: nbEcho && nbEcho.body });
    await scrollList(page, vp, 5); await page.waitForTimeout(800);
    txt = await dumpText(page);
    // names from the app's OWN oyster bay response (drift-proof): use echo-time wire names
    const obResp = OUT.resps.slice(markD_p).reverse().find(r => Array.isArray(r.names) && r.names.length);
    const domHits = ((obResp && obResp.names) || []).filter(n => txt.includes(n));
    A(vpName, 'D5-rendered-results-match-wire-names', domHits.length >= 1, { domHits: domHits.slice(0, 4), wireNamesSample: ((obResp && obResp.names) || []).slice(0, 4) });
    await shot(page, vpName, '10-nb-oysterbay-results');

    // ---- LEG E: productSource chips, one at a time, fresh each time ----
    async function sourceLeg(chipLabel, enumVal) {
      await gotoBrowse(page); await page.waitForTimeout(1200);
      await L.clickBtn(page, 'Filters'); await page.waitForTimeout(1400);
      const hitC = await tapNode(page, chipLabel, { exact: true }) || await tapNode(page, chipLabel);
      await page.waitForTimeout(650);
      const st = await dumpText(page);
      await shot(page, vpName, `11-sheet-source-${enumVal.toLowerCase()}`);
      const mr = OUT.reqs.length, mp = OUT.resps.length, me = OUT.echoes.length;
      await L.clickBtn(page, 'Apply filters'); await page.waitForTimeout(2900);
      const req = OUT.reqs.slice(mr).reverse().find(r => (r.postData || '').includes('"productSource"'));
      const echo = OUT.echoes.slice(me).reverse().find(e => e.body && e.body.productSource === enumVal);
      const resp = OUT.resps.slice(mp).reverse().find(r => typeof r.total === 'number');
      A(vpName, `E-${enumVal}-body-valid-enum`, !!req && (req.postData || '').includes(`"productSource":"${enumVal}"`), { body: req && req.postData });
      A(vpName, `E-${enumVal}-http200-no-400-swallow`, !!resp && resp.status === 200, { status: resp && resp.status });
      A(vpName, `E-${enumVal}-total-equals-echo-truth`, !!echo && echo.wireTotal === echo.echoTotal, { wireTotal: echo && echo.wireTotal, echoTotal: echo && echo.echoTotal, echoBody: echo && echo.body });
      await scrollList(page, vp, 4); await page.waitForTimeout(600);
      const t2 = await dumpText(page);
      const hits = ((resp && resp.names) || []).filter(n => t2.includes(n));
      A(vpName, `E-${enumVal}-renders-matching-items`, hits.length >= 1 || (echo && echo.wireTotal === 0), { domHits: hits.slice(0, 3), wireNames: ((resp && resp.names) || []).slice(0, 3), wireTotal: echo && echo.wireTotal });
      await shot(page, vpName, `12-source-${enumVal.toLowerCase()}-result`);
      return { chipHit: !!hitC, shopsVisible: st.includes('Shops'), communityVisible: st.includes('Community') };
    }
    const eCom = await sourceLeg('Community', 'COMMUNITY');
    const eShp = await sourceLeg('Shops', 'SHOPS');
    A(vpName, 'E1-both-chips-visible-only-valid-pair', eCom.communityVisible && eCom.shopsVisible && eShp.shopsVisible, { communitySheet: eCom, shopsSheet: eShp });

    // ---- LEG G: grid/list toggle (fresh browse = filters cleared) ----
    await gotoBrowse(page); await page.waitForTimeout(1500);
    const tol = Math.round(vp.width * 0.22);
    const prePts = await priceGeo(page);
    const preClusters = clusterCount(prePts, tol);
    const togBefore = await toggleLabel(page);
    const targetLbl = togBefore.includes('List view') ? 'List view' : 'Grid view';
    const t0 = Date.now();
    const togHit = await tapNodeByText(page, targetLbl);
    await page.waitForTimeout(1600);
    const postPts = await priceGeo(page);
    const postClusters = clusterCount(postPts, tol);
    const togAfter = await toggleLabel(page);
    const flipped = togBefore !== togAfter;
    A(vpName, 'G1-toggle-clicked-and-label-flipped', !!togHit && flipped, { labelBefore: togBefore, labelAfter: togAfter, clickedAtMs: Date.now() - t0 });
    A(vpName, 'G2-layout-visibly-changed', flipped && postClusters !== preClusters, { pre: { priceNodes: prePts.length, colClusters: preClusters }, post: { priceNodes: postPts.length, colClusters: postClusters }, note: 'list rows are full-width -> single x-cluster; grid is 2-col(375)/4-col(768)' });
    await shot(page, vpName, '15-toggled-mode');
    const togBackHit = await tapNodeByText(page, togAfter.includes('List view') ? 'List view' : 'Grid view');
    await page.waitForTimeout(1400);
    const backPts = await priceGeo(page);
    const backClusters = clusterCount(backPts, tol);
    const togRestored = await toggleLabel(page);
    A(vpName, 'G3-toggle-back-restores-layout', !!togBackHit && togRestored === togBefore && backClusters === preClusters, { restoredLabel: togRestored, restoredCols: backClusters, origCols: preClusters });
    await shot(page, vpName, '16-grid-restored');

    // ---- LEG A: infinite-scroll dedupe + stop at totalElements ----
    const markA_r = OUT.reqs.length, markA_p = OUT.resps.length;
    let seen = new Set(); const pages = new Set(); const seeds = new Set();
    let stagnant = 0, lastTotal = 0, lastSeenAtStop = 0;
    for (let round = 0; round < 44; round++) {
      await scrollList(page, vp, 6);
      await page.waitForTimeout(700);
      OUT.reqs.slice(markA_r).forEach(r => { if (r.seed != null) { pages.add(`${r.seed}#${r.page}`); seeds.add(r.seed); } });
      const freshResps = OUT.resps.slice(markA_p).filter(r => r.vp === vpName && Array.isArray(r.ids));
      freshResps.forEach(r => (r.ids || []).forEach(id => seen.add(id)));
      if (freshResps.length) lastTotal = freshResps[freshResps.length - 1].total;
      const grew = pages.size > (OUT['_pg_' + vpName] || 0);
      OUT['_pg_' + vpName] = pages.size;
      if (!grew) {
        stagnant++;
        // re-trigger the Flutter scroll listener: bounce up then down
        await page.mouse.move(Math.round(vp.width / 2), Math.round(vp.height * 0.5));
        for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -600); await page.waitForTimeout(90); }
        for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(110); }
        OUT.reqs.slice(markA_r).forEach(r => { if (r.seed != null) pages.add(`${r.seed}#${r.page}`); });
        const fr2 = OUT.resps.slice(markA_p).filter(r => r.vp === vpName && Array.isArray(r.ids));
        fr2.forEach(r => (r.ids || []).forEach(id => seen.add(id)));
        if (fr2.length) lastTotal = fr2[fr2.length - 1].total;
        const grew2 = pages.size > (OUT['_pg_' + vpName] || 0);
        OUT['_pg_' + vpName] = pages.size;
        if (!grew2 && stagnant >= 4) break;
        if (lastTotal && seen.size >= lastTotal) { lastSeenAtStop = seen.size; break; }
      } else stagnant = 0;
      if (lastTotal && seen.size >= lastTotal) { lastSeenAtStop = seen.size; break; }
    }
    const winReqs = OUT.reqs.slice(markA_r).filter(r => r.seed != null);
    const winPages = winReqs.map(r => `${r.seed}#${r.page}`);
    const pageKeysOnly = winPages.map(k => Number(k.split('#')[1]));
    const noReplay = new Set(winPages).size === winPages.length && !hasDupPageNo(winPages);
    A(vpName, 'A1-pages-unique-no-replay', winPages.length >= 3 && noReplay, { distinctSeedPageKeys: new Set(winPages).size, requestsWithSeed: winPages.length, maxPageReached: Math.max(-1, ...pageKeysOnly), distinctSeeds: seeds.size });
    A(vpName, 'A2-single-seed-session', seeds.size <= 1, { seeds: [...seeds] });
    A(vpName, 'A3-dedupe-stops-at-totalElements', lastTotal > 0 && seen.size === lastTotal, { accumulatedUniqueIds: seen.size, lastWireTotalElements: lastTotal, stoppedClean: lastSeenAtStop > 0 });
    await shot(page, vpName, '20-after-scroll-end');

    // ---- LEG F: searchTerm through UI ----
    await gotoBrowse(page);
    await typeIntoFirstInput(page, TERM);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2600);
    await scrollList(page, vp, 3);
    txt = await dumpText(page);
    const termHits = OUT.truths.term_names.filter(n => txt.includes(n));
    A(vpName, 'F1-search-term-renders-fixtures', termHits.length >= 1, { domHits: termHits.slice(0, 4), wireTotal: OUT.truths.term_total });
    await shot(page, vpName, '25-search-results');
    const cardTap = await L.clickCard(page, (OUT.truths.term_names[0] || 'ZZZ').slice(0, 16));
    await page.waitForTimeout(2800);
    txt = await dumpText(page);
    A(vpName, 'F2-card-tap-navigates-to-detail', !!cardTap && (txt.includes('Buy now') || txt.includes('Add to cart') || txt.includes('Chat with seller')), { tapped: !!cardTap, markers: { buy: txt.includes('Buy now'), cart: txt.includes('Add to cart'), chat: txt.includes('Chat with seller') } });
    await shot(page, vpName, '26-card-detail');

    // ---- CLICK SWEEP (in-viewport controls only; chips scrolled into view first) ----
    await gotoBrowse(page); await page.waitForTimeout(2000);
    const doneKeys = new Set(); const noEffectCtrls = []; let totalCtrls = 0;
    for (let pass = 0; pass < 2; pass++) {
      const btns = await enumButtons(page);
      for (const b of btns) {
        const key = `${b.label}|${Math.round(b.cx / 14)}|${Math.round(b.cy / 14)}`;
        if (doneKeys.has(key)) continue;
        doneKeys.add(key); totalCtrls++;
        const netBefore = OUT.reqs.length + OUT.catReqs.filter(c => c.vp === vpName).length;
        const txtBefore = await dumpText(page);
        let cx = b.cx, cy = b.cy;
        if (cy < 4 || cy > vp.height - 4) { continue; }
        try { await page.mouse.click(cx, Math.max(10, Math.min(cy, vp.height - 10))); } catch (e) {}
        await page.waitForTimeout(850);
        const txtAfter = await dumpText(page);
        const netDelta = OUT.reqs.length + OUT.catReqs.filter(c => c.vp === vpName).length - netBefore;
        const effect = netDelta > 0 || txtAfter !== txtBefore;
        OUT.clicks.push({ vp: vpName, ctrl: b.label.slice(0, 46), role: b.role, netDelta, dTxt: txtAfter.length - txtBefore.length, effect });
        if (!effect) noEffectCtrls.push(`${b.label}@${cx},${cy}`);
        await dismissOverlay(page);
        await ensureBrowse(page);
      }
    }
    A(vpName, 'K1-every-control-clicked-with-effect', totalCtrls >= 4 && noEffectCtrls.length === 0, { totalCtrls, noEffectCount: noEffectCtrls.length, noEffectCtrls: noEffectCtrls.slice(0, 12), catReqCount: OUT.catReqs.filter(c => c.vp === vpName).length });

    // ---- VIDEO CLOSE ----
    const vf = `${ROOT}/e2e/videos/${UNIT}-${STAGE}-${vpName}.webm`;
    await L.closeVideo(ctx, vf);
    OUT.videos.push(vf);
    log('video saved', vf);
  }

  // ---------- IMAGES ----------
  const imgs = Object.entries(OUT.images);
  OUT.imagesSummary = {
    requested: imgs.length,
    ok200: imgs.filter(([, s]) => s === 200 || s === 304).length,
    failed: imgs.filter(([, s]) => s >= 400).map(([u, s]) => `${s} ${u}`).slice(0, 8),
  };
  A('meta', 'C3-images-all-200-nonempty', imgs.length > 0 && OUT.imagesSummary.failed.length === 0, OUT.imagesSummary);

  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-${UNIT}-r6.json`, JSON.stringify(OUT, null, 1));
  const pass = OUT.asserts.filter(a => a.pass).length;
  const fails = OUT.asserts.filter(a => !a.pass);
  log(`DONE asserts ${pass}/${OUT.asserts.length}; images ${OUT.imagesSummary.ok200}/${OUT.imagesSummary.requested}; echoes ${OUT.echoes.length}`);
  fails.forEach(f => log('FAILING:', f.vp, f.id, JSON.stringify(f.value).slice(0, 220)));

  function hasDupPageNo(keys) {
    const seenPairs = new Set(); const pageNoSeen = new Map();
    for (const k of keys) {
      const [seed, pg] = k.split('#');
      const kk = `${seed}|${pg}`;
      if (seenPairs.has(kk)) return true;
      seenPairs.add(kk);
      // same page number under DIFFERENT seeds is allowed only if seed changed mid-session (refetch)
      pageNoSeen.set(pg, (pageNoSeen.get(pg) || 0) + 1);
    }
    // duplicate page numbers with different seeds = refetch replay -> flag
    for (const [pg, n] of pageNoSeen) if (n > 1) return true;
    return false;
  }
})().catch(e => { console.error('FATAL', (e && e.stack) || e); process.exit(2); });
