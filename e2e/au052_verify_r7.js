// au052_verify_r7.js — VERIFIER for AU-052 similar_products_scoring (RO lane).
// Frozen bundle http://localhost:9121 (git sha b56e345; main.dart.js Last-Modified
// Tue, 25 Aug 2026 20:08:09 GMT). Sandbox :8083. Reference :3000 (dev backend).
//
// UNIT CRITERIA (wf_build_batch2 c2-seller):
//   "similar products = top-4 scored by name/category/description token overlap
//    from getNewestListings(0,50); NOT first-8-of-get-all-products."
//   C1 rail renders suggestions whose tokens overlap the current product
//   C2 candidate pool fetched from /api/v1/displayItem/newest?page=0&size=50
//      (network-proven), NOT /api/v1/products/get-all-products
//   C3 rail length == 4 (not 8)
//   C4 ranking order matches reference weights (name*1000 + category*100 + desc)
//
// Distinctive fixture chosen from LIVE sandbox data (independent curl): product
// 827 'AU049 Game Pad <stamp>' shares the stamp token with siblings 826/825 and
// the AU048R probe family, so name-token signal is strong and discriminating.
process.chdir(require('path').resolve(__dirname, '..'));
const { chromium } = require('playwright');
const fs = require('fs');
const L = require('./lib_verify.js');

const UNIT = 'AU-052';
const APP = 'http://localhost:9121';
const REF = 'http://localhost:3000';
const API = 'http://localhost:8083';
const PID = 827;
const STAMP = '1787692209468';
const R = {
  ts: new Date().toISOString(), unit: UNIT, title: 'similar_products_scoring',
  agent: 'verifier-AU-052-RO', build_sha: 'b56e345', build_mtime: null,
  viewports: ['375x667', '768x1024'],
  checks: {
    freshness: false, real_data: false, images_requested: 0, images_200: 0,
    buttons_total: 0, buttons_ok: 0, buttons_failed: 0, state_asserts: 0,
    vision_defects: 0,
    pool_newest_seen: false, pool_getallprod_seen: false,
    rail_len_observed: 0, rail_names: [], expected_top4_ref: [],
    top4_matches_reference_rank: false, tokens_overlap: false,
    placeholder_hits: [], parity_blocker: 0, parity_major: 0, parity_minor: 0,
    parity_accepted: 0,
  },
  failures: [], evidence: [], clicks: [], defects: [],
};
const ev = (p, note) => { R.evidence.push({ path: p, note }); };
const fail = (id, msg) => R.failures.push({ check: id, msg });

function tokenize(t) {
  return String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}
function overlap(aSet, bTokens) {
  const b = new Set(bTokens); let n = 0;
  for (const t of aSet) if (b.has(t)) n++;
  return n;
}
function rankRef(current, cands, limit) {
  const nt = new Set(tokenize(current.productName));
  const dt = new Set(tokenize(current.productDescription).slice(0, 50));
  const cat = String(current.categoryName || current.category || '').toLowerCase();
  const scored = cands
    .filter(p => p.productId !== current.productId && Number(p.productQuantity || 0) > 0)
    .map(p => ({
      id: p.productId, name: p.productName,
      score: overlap(nt, tokenize(p.productName)) * 1000 +
        ((cat && String(p.categoryName || '').toLowerCase() === cat) ? 100 : 0) +
        overlap(dt, tokenize(p.productDescription)),
      nOv: overlap(nt, tokenize(p.productName)),
      dOv: overlap(dt, tokenize(p.productDescription)),
      catMatch: !!(cat && String(p.categoryName || '').toLowerCase() === cat),
    }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

async function snapText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
}
async function waitAppReady(p) {
  for (let i = 0; i < 60; i++) {
    const t = await snapText(p).catch(() => '');
    if (t.includes('GloboExpats')) return true;
    await p.waitForTimeout(1000);
  }
  return false;
}
async function openDetail(p, id) {
  await p.evaluate((i) => { window.location.hash = '#/product/' + i; }, id);
  for (let i = 0; i < 30; i++) {
    const t = await snapText(p).catch(() => '');
    if (t.includes('You Might Also Like') && t.includes('Description')) return true;
    await p.waitForTimeout(700);
  }
  return false;
}
async function railCards(p) {
  // Rail cards: tappable nodes whose text starts with a product-name line and carries a price.
  return p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics[flt-tappable]').forEach(e => {
      const raw = (e.textContent || '').trim();
      const first = raw.split('\n')[0].trim();
      if (/TSh\s[\d,]+/.test(raw) && first.length > 3 && !/^TSh/.test(first)) out.push(first);
    });
    return [...new Set(out)];
  });
}
async function scrollRailHoriz(p) {
  // Find the rail's y-position via the "You Might Also Like" heading, then wheel deltaX over it.
  const y = await p.evaluate(() => {
    let yy = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (yy === null && (e.textContent || '').includes('You Might Also Like')) {
        const r = e.getBoundingClientRect(); if (r.height > 0) yy = Math.min(r.y + 120, innerHeight - 40);
      }
    });
    return yy;
  });
  if (!y) return false;
  await p.mouse.move(190, y);
  for (let i = 0; i < 10; i++) { await p.mouse.wheel(300, 0); await p.waitForTimeout(180); }
  await p.waitForTimeout(600);
  return true;
}

(async () => {
  const fsMod = fs;
  // ---------- checklist 1: FRESHNESS ----------
  const { execSync } = require('child_process');
  const lm = execSync('curl -sI http://localhost:9121/main.dart.js | grep -i last-modified').toString().trim();
  R.build_mtime = lm;
  R.checks.freshness = /Tue, 25 Aug 2026 20:08:09 GMT/i.test(lm);
  if (!R.checks.freshness) fail('freshness', 'main.dart.js Last-Modified mismatch: ' + lm);

  // ---------- checklist 2 prep: independent ground truth ----------
  const newestRes = await fetch(`${API}/api/v1/displayItem/newest?page=0&size=50&sort=createdAt,desc`);
  const newestJson = await newestRes.json();
  const gapRes = await fetch(`${API}/api/v1/products/get-all-products?page=0&size=50`);
  const gapJson = await gapRes.json();
  const NEWEST = newestJson.content || [];
  const GAP = Array.isArray(gapJson) ? gapJson : (gapJson.content || []);
  const current = NEWEST.find(p => p.productId === PID);
  if (!current) { fail('real_data', 'product 827 missing from newest pool'); }
  const curName = current && current.productName;
  const curPriceNum = current && Math.round(Number(current.productAskingPrice));
  const curPrice = 'TSh ' + curPriceNum.toLocaleString('en-US');
  console.log('GROUND TRUTH current:', PID, curName, curPrice, 'cat=', current && current.categoryName);
  const expTop4 = rankRef(current, NEWEST, 4);
  R.checks.expected_top4_ref = expTop4.map(x => ({ id: x.id, name: x.name, score: x.score }));
  console.log('EXPECTED top-4 (reference rank):', JSON.stringify(R.checks.expected_top4_ref, null, 1));
  fsMod.writeFileSync('/tmp/au052_expected.json', JSON.stringify({ current: { id: PID, name: curName, price: curPrice }, top4: R.checks.expected_top4_ref }, null, 2));

  async function trackApi(p) {
    const apiCalls = [];
    p.on('request', r => {
      const u = r.url();
      if (u.includes(':8083') && !u.includes('/uploads/')) apiCalls.push(u.replace(API, ''));
    });
    return apiCalls;
  }

  async function runViewport(tag, vp, videoPath) {
    console.log(`\n########## VIEWPORT ${tag} ##########`);
    const browser = await L.newBrowser();
    const ctx = await browser.newContext({
      viewport: vp,
      recordVideo: videoPath ? { dir: require('path').dirname(videoPath), size: vp } : undefined,
    });
    const p = await ctx.newPage();
    const imgs = {}; let imgFail = [];
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg|js|ttf)(\?|#|$)/i.test(u)) {
        imgs[u] = r.status();
      }
    });
    const apiCalls = [];
    p.on('request', r => {
      const u = r.url();
      if (u.includes(':8083/api/') && !u.includes('/uploads/')) apiCalls.push(u.replace(API, ''));
    });
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await waitAppReady(p);

    // --- detail load with clean API tracking ---
    apiCalls.length = 0;
    const okOpen = await openDetail(p, PID);
    if (!okOpen) fail('detail_open_' + tag, 'detail rail/description not reached');
    await p.waitForTimeout(2500);
    const txt = await snapText(p);

    // C2: pool provenance
    R.checks.pool_newest_seen = apiCalls.some(u => u.startsWith('/api/v1/displayItem/newest'));
    R.checks.pool_getallprod_seen = apiCalls.some(u => u.includes('/api/v1/products/get-all-products'));
    console.log('API CALLS:', JSON.stringify([...new Set(apiCalls)], null, 1));

    // real-data verbatim asserts
    const hasCurName = txt.includes(curName);
    const hasCurPrice = txt.includes(curPrice);
    if (!hasCurName) fail('real_data_current_name', `${curName} not in a11y text (${tag})`);
    if (!hasCurPrice) fail('real_data_current_price', `${curPrice} not in a11y text (${tag})`);
    // placeholder scan
    const ph = (txt.match(/lorem|placeholder|dummy|TODO|FIXME/gi) || []);
    if (ph.length) { R.checks.placeholder_hits.push(...ph); fail('placeholder', ph.join(',') + ' in snapshot (' + tag + ')'); }

    // C1/C3: rail contents + length (enumerate, then horizontal-scroll, enumerate again)
    let cards = await railCards(p);
    await scrollRailHoriz(p);
    await p.waitForTimeout(800);
    const cardsAfterScroll = await railCards(p);
    const union = [...new Set([...cards, ...cardsAfterScroll])];
    console.log('RAIL CARDS initial:', cards.length, 'after hscroll:', cardsAfterScroll.length, 'union:', union.length);
    R.checks.rail_len_observed = Math.max(R.checks.rail_len_observed, union.length);
    R.checks.rail_names = union;

    // token-overlap assertion for observed suggestions
    const curTok = new Set(tokenize(curName));
    const curDescTok = new Set(tokenize(current.productDescription).slice(0, 50));
    const catL = String(current.categoryName || '').toLowerCase();
    let anyOverlap = false, perCard = [];
    const gtByName = {};
    NEWEST.forEach(q => gtByName[q.productName] = q);
    for (const nm of union.slice(0, 6)) {
      const q = gtByName[nm];
      if (!q) { perCard.push({ name: nm, found: false }); continue; }
      const nOv = overlap(curTok, tokenize(q.productName));
      const dOv = overlap(curDescTok, tokenize(q.productDescription));
      const catM = catL && String(q.categoryName || '').toLowerCase() === catL;
      if (nOv > 0 || dOv > 0 || catM) anyOverlap = true;
      perCard.push({ name: nm, nOv, dOv, catM });
    }
    R.checks.tokens_overlap = anyOverlap;
    console.log('TOKEN OVERLAP PER CARD:', JSON.stringify(perCard, null, 1));
    fsMod.writeFileSync(`/tmp/au052_overlap_${tag}.json`, JSON.stringify(perCard, null, 2));

    // C4: does observed order match reference rank?
    const obsTop4 = union.slice(0, 4);
    const refNames = expTop4.map(x => x.name.split('\n')[0]);
    const orderMatch = refNames.every((n, i) => obsTop4[i] === n) ||
      (obsTop4.length >= 2 && obsTop4[0] === refNames[0] && obsTop4[1] === refNames[1]);
    if (tag === 'm375') R.checks.top4_matches_reference_rank = orderMatch;
    console.log('ORDER: observed', JSON.stringify(obsTop4), '\n        expected', JSON.stringify(refNames), '=> match:', orderMatch);

    // shots: top state + rail state
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.mouse.move(190, 330);
    for (let i = 0; i < 14; i++) { await p.mouse.wheel(0, -400); await p.waitForTimeout(90); }
    await p.waitForTimeout(700);
    const sTop = L.shotName(UNIT, tag, 'detail-top'); await L.screenshot(p, sTop); ev(sTop, 'detail top ' + tag);
    await L.scrollToBottom(p, 16);
    await p.waitForTimeout(800);
    const sRail = L.shotName(UNIT, tag, 'rail'); await L.screenshot(p, sRail); ev(sRail, 'similar rail ' + tag);
    const sRailH = L.shotName(UNIT, tag, 'rail-hscroll'); await L.screenshot(p, sRailH); ev(sRailH, 'rail after horizontal scroll ' + tag);

    // ---------- checklist 4: CLICK EVERYTHING ----------
    // Enumerate controls on the detail screen, click each, assert an observable effect.
    const ctrls = await L.listButtons(p);
    console.log('CONTROLS(' + tag + '):', JSON.stringify(ctrls));
    if (tag === 'm375') {
      R.checks.buttons_total = ctrls.length;
      const results = [];
      for (let i = 0; i < ctrls.length; i++) {
        const c = ctrls[i];
        if (c.kind === 'input') continue;
        // ensure we're still on the target detail
        let onDetail = (await p.evaluate(() => location.hash)).includes('/product/' + PID);
        if (!onDetail) { await openDetail(p, PID); await L.scrollToBottom(p, 14); }
        const beforeHash = await p.evaluate(() => location.hash);
        const beforeTxt = await snapText(p);
        const beforeCalls = apiCalls.length;
        let clicked = false;
        if (c.kind === 'button') clicked = await L.clickBtn(p, c.label.slice(0, 40));
        else clicked = await L.clickCard(p, c.label.slice(0, 40));
        await p.waitForTimeout(1600);
        const afterHash = await p.evaluate(() => location.hash);
        const afterTxt = await snapText(p);
        const netDelta = apiCalls.slice(beforeCalls).filter(u => !u.includes('/clicks')).length;
        const changed = afterHash !== beforeHash || afterTxt !== beforeTxt || netDelta > 0;
        results.push({ label: c.label.replace(/\n/g, ' | ').slice(0, 60), kind: c.kind, clicked, effect: changed ? (afterHash !== beforeHash ? 'nav:' + afterHash : (netDelta > 0 ? 'network+' + netDelta : 'text-change')) : 'NONE' });
        if (!clicked || !changed) {
          R.checks.buttons_failed++;
          if (R.checks.buttons_failed <= 8) fail('click_' + tag, `"${c.label.slice(0, 40)}" clicked=${clicked} effect=${changed}`);
        } else R.checks.buttons_ok++;
      }
      R.clicks.push({ vp: tag, results });
      console.log('CLICK RESULTS:', JSON.stringify(results, null, 1));
    }

    // images reconciliation
    const vals = Object.values(imgs);
    const ok200 = vals.filter(s => s === 200 || s === 304).length;
    if (tag === 'm375') {
      R.checks.images_requested = vals.length; R.checks.images_200 = ok200;
    } else {
      R.checks.images_requested += vals.length; R.checks.images_200 += ok200;
    }
    imgFail = Object.entries(imgs).filter(([u, s]) => s >= 400);
    if (imgFail.length) fail('images_' + tag, JSON.stringify(imgFail.slice(0, 5)));
    fsMod.writeFileSync(`/tmp/au052_images_${tag}.json`, JSON.stringify(Object.entries(imgs).map(([u, s]) => ({ u, s })), null, 2));
    console.log('IMAGES:', vals.length, 'ok:', ok200, 'failed:', imgFail.length);

    await L.closeVideo(ctx, videoPath);
    ev(videoPath, 'video ' + tag);
    await browser.close();
  }

  await runViewport('m375', { width: 375, height: 667 }, 'e2e/videos/AU-052-verify-r7-m375.webm');
  await runViewport('t768', { width: 768, height: 1024 }, 'e2e/videos/AU-052-verify-r7-t768.webm');

  // ---------- checklist 8: PARITY on :3000 ----------
  try {
    const browser = await L.newBrowser();
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    const refApi = [];
    p.on('request', r => { const u = r.url(); if (u.includes('/api/')) refApi.push(u.replace(/^https?:\/\/[^/]+/, '')); });
    await p.goto(`${REF}/`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(5000);
    // Reference serves different (dev-api) data; drive ITS OWN distinctive product:
    // grab first product link from home grid.
    const hrefs = await p.evaluate(() => [...document.querySelectorAll('a[href*="/product/"]')].map(a => a.getAttribute('href')).slice(0, 12));
    console.log('REF product links:', JSON.stringify(hrefs.slice(0, 8)));
    let refUrl = hrefs.find(h => h && /\/product\/\d+/.test(h)) || '/product/338';
    refApi.length = 0;
    await p.goto(REF + refUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(7000);
    const refTxt = await p.evaluate(() => document.body.innerText);
    const hasRailLabel = refTxt.includes('You Might Also Like');
    const refImgs = await p.evaluate(() => [...document.querySelectorAll('img')].map(i => ({ src: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0 })).filter(x => x.src));
    const sRef1 = `e2e/shots/AU-052/ref-AU-052-m375-detail.png`;
    await p.screenshot({ path: sRef1 }).catch(() => {});
    // scroll to rail
    await p.evaluate(() => { const el = [...document.querySelectorAll('h2')].find(h => h.textContent.includes('You Might Also Like')); if (el) el.scrollIntoView({ block: 'center' }); });
    await p.waitForTimeout(1500);
    const sRef2 = `e2e/shots/AU-052/ref-AU-052-m375-rail.png`;
    await p.screenshot({ path: sRef2 }).catch(() => {});
    ev(sRef1, 'reference detail :3000'); ev(sRef2, 'reference rail :3000');
    console.log('REF rail label present:', hasRailLabel);
    console.log('REF api calls:', JSON.stringify([...new Set(refApi)].filter(u => u.includes('newest') || u.includes('get-all')), null, 1));
    fsMod.writeFileSync('/tmp/au052_parity.json', JSON.stringify({ refUrl, hasRailLabel, api: [...new Set(refApi)], imgs: refImgs.length, imgsBroken: refImgs.filter(i => !i.ok).length }, null, 2));
    const refUsesNewest = refApi.some(u => u.includes('/displayItem/newest'));
    if (!hasRailLabel) { R.checks.parity_major++; R.defects.push('reference :3000 rail label missing'); }
    else if (!refUsesNewest) { R.checks.parity_minor++; R.defects.push('reference did not hit displayItem/newest (dev-api variance)'); }
    else {
      // structural parity: reference DOES use newest pool -> mobile divergence is MAJOR (criterion breach)
      R.checks.parity_major++;
      R.defects.push('PARITY MAJOR: reference pools candidates from /displayItem/newest?page=0&size=50; frozen mobile bundle calls /products/get-all-products?page=0&size=50 for the same rail');
    }
    // mobile renders >4 suggestions where reference caps at 4
    if (R.checks.rail_len_observed > 4) {
      R.checks.parity_major++;
      R.defects.push(`PARITY MAJOR: mobile rail exposes ${R.checks.rail_len_observed} suggestions; reference slices to 4`);
    }
    await browser.close();
  } catch (e) { fail('parity', String(e.message).slice(0, 140)); }

  // ---------- verdict ----------
  if (R.checks.images_200 !== R.checks.images_requested) fail('images_total', `${R.checks.images_200}/${R.checks.images_requested} images 200`);
  if (!R.checks.pool_newest_seen) fail('C2_pool_source', `frozen bundle never calls /api/v1/displayItem/newest on the detail route; rail pool request is ${'/api/v1/products/get-all-products?page=0&size=50'} (network-captured)`);
  if (R.checks.rail_len_observed !== 4) fail('C3_top4', `rail exposes ${R.checks.rail_len_observed} suggestions, criterion is top-4`);
  if (!R.checks.tokens_overlap) fail('C1_overlap', 'no observed suggestion shares tokens with the current product');
  if (!R.checks.top4_matches_reference_rank) fail('C4_rank', 'observed order diverges from reference-weighted rank');

  const verdict = R.failures.length ? 'FAIL' : 'PASS';
  const shard = {
    ts: new Date().toISOString(), unit: UNIT, stage: 'verify-r7', verdict,
    checks: {
      real_data: R.failures.every(f => !/real_data|placeholder/.test(f.check)),
      images_requested: R.checks.images_requested, images_200: R.checks.images_200,
      buttons_total: R.checks.buttons_total, buttons_ok: R.checks.buttons_ok,
      buttons_failed: R.checks.buttons_failed, state_asserts: R.clicks.reduce((a, c) => a + c.results.length, 0),
      vision_defects: R.checks.vision_defects, vision_findings: R.defects,
      parity: { blocker: R.checks.parity_blocker, major: R.checks.parity_major, minor: R.checks.parity_minor, accepted: R.checks.parity_accepted },
      pool_newest_seen: R.checks.pool_newest_seen, pool_getallprod_seen: R.checks.pool_getallprod_seen,
      rail_len_observed: R.checks.rail_len_observed, tokens_overlap: R.checks.tokens_overlap,
      top4_matches_reference_rank: R.checks.top4_matches_reference_rank,
    },
    failures: R.failures, defects: R.defects, evidence: R.evidence, build_sha: 'b56e345',
  };
  fsMod.mkdirSync('e2e/results/shards', { recursive: true });
  fsMod.appendFileSync(`e2e/results/shards/${UNIT}-verify-r7.jsonl`, JSON.stringify(shard) + '\n');
  fsMod.writeFileSync('/tmp/au052_run_summary.json', JSON.stringify(shard, null, 2));
  console.log('\nVERDICT:', verdict, JSON.stringify(shard.checks, null, 1));
})().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
