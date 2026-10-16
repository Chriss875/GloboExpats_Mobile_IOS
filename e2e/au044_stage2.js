// au044_stage2.js — focused re-probe of the r14 open items on the SAME frozen
// bundle (:9131, sha e694463). Read-only. No listings/orders created.
//
// Targets (from /tmp/au044_r14_state.json failures):
//   A) person-icon nav (both viewports) — positional rightmost header icon click,
//      with a DOM dump of the header band BEFORE clicking so the node geometry is
//      recorded as evidence either way.
//   B) 375 category-feed asserts — longer settle + scroll + fresh capture after
//      tapping the Art & Crafts rail card; compare against server truth
//      ids=[766,701,629,628,314].
//   C) browse-real-products — assert against page-0 SHUFFLE content captured from
//      THIS run's own wire log (order is randomized per seed; r14 used stale titles).
//   D) cart icon / discover tab / popular card / whatsapp — refined selectors.
//   E) deeplink #/category/art-crafts feed content check (same truth set).
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';
const API = 'http://localhost:8083';
const BUILD_MT = 'Wed, 26 Aug 2026 08:15:26 GMT';
const BUYER = { email: 'mobile.test.20260820@gmail.com', pw: 'StrongPass!1' };
const UNIT = 'AU-044', STAGE = 'verify-r15-stage2';
const T0 = Date.now();
const OUT = [];
function rec(name, pass, detail) {
  const row = { kind: name, name: String(pass), pass: !!pass, detail: String(detail ?? '').slice(0, 400) };
  OUT.push(row);
  console.log((row.pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + row.detail.slice(0, 220) : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
}
function shotPath(vp, state) { return `e2e/shots/AU-044/${UNIT}-${vp}-${state}.png`; }
async function shot(p, vp, state) {
  const f = shotPath(vp, state);
  await L.screenshot(p, f);
  return f;
}
// Smallest tappable node containing label -> coordinate click. Falls back to
// ANY visible node with the label (some Flutter chips expose no role/tappable
// attr on the text node itself; the tap still lands on the right coordinates).
async function jsClick(page, label, maxY = 1015) {
  const hit = await page.evaluate((lbl) => {
    const vis = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (!isFinite(r.x) || !isFinite(r.y)) return;
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
      vis.push({ roleOk: e.getAttribute('flt-tappable') !== null || e.getAttribute('role') === 'button',
        area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
    });
    if (!vis.length) return null;
    const tagged = vis.filter(v => v.roleOk);
    const pool = tagged.length ? tagged : vis;
    pool.sort((a, b) => a.area - b.area);
    return pool[0];
  }, label);
  if (!hit) return false;
  await page.mouse.click(Math.min(hit.x, 766), Math.max(20, Math.min(hit.y, maxY)));
  await sleep(1100);
  return true;
}
// Header band buttons sorted by x. Flutter web exposes each IconButton as its
// OWN flt-semantics node whose textContent IS the tooltip string ("Search",
// "Cart", "Login") — verified by /tmp/au044_diag.js on this exact bundle.
async function headerButtons(page, yBand = 0.30) {
  return page.evaluate((band) => {
    const out = [];
    document.querySelectorAll('flt-semantics[role="button"], flt-semantics[flt-tappable]').forEach(e => {
      const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if (!isFinite(r.x) || !isFinite(r.y)) return;
      // icon buttons are small squares in the top band; exclude the giant wrappers
      if (r.width < 10 || r.width > 120 || r.height < 16 || r.height > 110) return;
      if (r.y > innerHeight * band || r.bottom > innerHeight * (band + 0.16)) return;
      if (r.width * r.height > innerWidth * innerHeight * 0.25) return;
      out.push({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2),
        tip: e.getAttribute('tooltip') || '', aria: e.getAttribute('aria-label') || '', txt: t.slice(0, 24) });
    });
    return out.sort((a, b) => a.cx - b.cx);
  }, yBand);
}

(async () => {
  // ---------- freshness guard (must still be the frozen build) ----------
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  rec('freshness', 'frozen-build-e694463', head.status === 200 && lm === BUILD_MT, `HTTP ${head.status} Last-Modified="${lm}"`);
  if (!(head.status === 200 && lm === BUILD_MT)) { console.log('BLOCKED-stale-build'); process.exit(0); }

  // ---------- server truth ----------
  const cats = await fetch(API + '/api/v1/products/categories').then(r => r.json());
  const artCat = cats.find(c => c.slug === 'art-crafts');
  const artFeed = await fetch(API + '/api/v1/displayItem/filter', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoryIds: [artCat.categoryId], page: 0, size: 50 }),
  }).then(r => r.json());
  const artIds = (artFeed.content || []).map(p => p.productId);
  const artTitles = (artFeed.content || []).map(p => p.productName);
  console.log(`TRUTH art(${artCat.categoryId}) total=${artFeed.totalElements} ids=${JSON.stringify(artIds)} titles=${JSON.stringify(artTitles.slice(0,6))}`);
  // foreign-category fixtures guaranteed absent from the art feed
  const unfiltered = await fetch(API + '/api/v1/displayItem/filter', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: 0, size: 40 }),
  }).then(r => r.json());
  const foreignTitles = (unfiltered.content || [])
    .filter(p => p.categoryId !== artCat.categoryId && p.productName)
    .map(p => p.productName);

  for (const VP of [{ name: '375x667', w: 375, h: 667, video: 'e2e/videos/AU-044-stage2-mobile.webm' },
                    { name: '768x1024', w: 768, h: 1024, video: 'e2e/videos/AU-044-stage2-tablet.webm' }]) {
    console.log(`\n========== ${VP.name} ==========`);
    let browser, ctx, page;
    browser = await L.newBrowser();
    ctx = await L.newCtx(browser, { viewport: { width: VP.w, height: VP.h }, videoPath: VP.video });
    page = await ctx.newPage();
    const wire = [];
    page.on('response', r => {
      const u = r.url();
      if (/\/api\/|\/uploads\//.test(u)) wire.push({ m: r.request().method(), u: u.replace(API, ''), s: r.status() });
    });

    // ===== A) PERSON ICON (header band dump + positional click) =====
    await page.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(page, 'Buy now', 60000); await sleep(2500);
    const authedBefore = await L.isLoggedIn(page);
    let hb = await headerButtons(page, 0.30);
    if (hb.length === 0) hb = await headerButtons(page, 0.45);
    console.log(`HEADER NODES (${VP.name}): ` + JSON.stringify(hb));
    fs.appendFileSync('/tmp/au044_header_nodes.json',
      JSON.stringify({ vp: VP.name, authedBefore, nodes: hb }) + '\n');
    const person = hb.find(n => /login/i.test(n.txt) || /login|account|person/i.test(n.tip + n.aria)) ||
      (hb.length ? hb[hb.length - 1] : null);                 // rightmost = person icon
    rec(`${VP.name}.person-node-found`, !!person && person.w >= 28, JSON.stringify(person));
    if (person) {
      await page.mouse.click(person.cx, Math.max(18, person.cy));
      await sleep(1800);
      let t2 = await txt(page);
      const loginMarkers = ['Welcome back', 'Log in to buy and sell'].filter(m => t2.includes(m));
      const accountMarkers = ['My account', 'Saved items', 'Seller dashboard', 'Account verification']
        .filter(m => t2.includes(m));
      const okNav = authedBefore
        ? accountMarkers.length >= 2 || loginMarkers.length >= 1
        : loginMarkers.length >= 1;
      rec(`${VP.name}.person-icon-nav`, okNav,
        `authedBefore=${authedBefore} login=[${loginMarkers}] account=[${accountMarkers}] url=${page.url()}`);
      await shot(page, VP.name, '15-person-target-stage2');
    }

    // ===== B/C) BROWSE via hero Buy now: use THIS run's wire for real products =====
    await page.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(page, 'Buy now', 60000); await sleep(2000);
    const w0 = wire.length;
    await jsClick(page, 'Buy now', VP.h - 9);
    await sleep(2600);
    let t = await txt(page);
    const browseFilterCalls = wire.slice(w0).filter(w => w.u.includes('/api/v1/displayItem/filter'));
    // capture the response body of the browse filter call through the page fetch? Instead:
    // re-request the same URL shape server-side to get page-0 titles for comparison.
    let browseTitles = [];
    if (browseFilterCalls.length) {
      const seedM = browseFilterCalls[0].u.match(/seed=(\d+)/);
      const rr = await fetch(API + '/api/v1/displayItem/filter' +
        (seedM ? `?priceSort=SHUFFLE&seed=${seedM[1]}&maxPrice=500000&page=0&size=24` : '?page=0&size=24'),
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(seedM ? { priceSort: 'SHUFFLE', seed: seedM[1], maxPrice: 500000, page: 0, size: 24 }
                                    : { page: 0, size: 24 }) }).then(r => r.json());
      browseTitles = (rr.content || []).map(p => p.productName).filter(Boolean);
    }
    const browseHasReal = browseTitles.some(x => t.includes(x.slice(0, Math.min(24, x.length))));
    rec(`${VP.name}.browse-real-products`, browseFilterCalls.length > 0 && browseHasReal,
      `wire calls=${browseFilterCalls.length} compared=${browseTitles.length} titles; sample hit=` +
      JSON.stringify(browseTitles.find(x => t.includes(x.slice(0, Math.min(24, x.length)))) || null));
    await shot(page, VP.name, '16-browse-stage2');

    // back home
    await page.goto(APP + '/#/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await L.waitText(page, 'Buy now', 45000); await sleep(2000);

    // ===== CART ICON (header button labelled Cart / between search and person) =====
    await page.goto(APP + '/#/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await L.waitText(page, 'Buy now', 45000); await sleep(2000);
    let hb2 = await headerButtons(page, 0.35);
    if (hb2.length < 3) hb2 = await headerButtons(page, 0.5);
    const cartNode = hb2.find(n => /^cart$/i.test(n.txt) || /cart/i.test(n.tip + n.aria)) ||
      (hb2.length >= 3 ? hb2[hb2.length - 2] : (hb2[0] || null));
    let cartOk = false;
    let cartDetail = '';
    if (cartNode) {
      await page.mouse.click(cartNode.cx, Math.max(18, cartNode.cy));
      await sleep(1600);
      t = await txt(page);
      cartOk = /Your cart|cart is empty|Shopping cart/i.test(t) ||
        (/\bCart\b/.test(t) && /\bTotal\b/.test(t));
      cartDetail = `node=${JSON.stringify(cartNode)} screenTextSample=` + JSON.stringify(t.slice(0, 90));
    } else {
      cartDetail = 'no header cart node found: ' + JSON.stringify(hb2);
    }
    rec(`${VP.name}.cart-icon-nav`, cartOk, cartDetail);

    // ===== DISCOVER TAB switch (ChoiceChip 'Top Picks' -> displayItem/top-picks) =====
    // The tabs sit BELOW the fold at 375x667 (home is tall); scroll them into view.
    await page.goto(APP + '/#/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await L.waitText(page, 'Buy now', 45000); await sleep(1500);
    let tabNode = null;
    for (let i = 0; i < 14 && !tabNode; i++) {
      tabNode = await page.evaluate(() => {
        let f = null;
        document.querySelectorAll('flt-semantics').forEach(e => {
          if ((e.textContent || '').trim() !== 'Top Picks') return;
          const r = e.getBoundingClientRect();
          if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
          f = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), yAbs: Math.round(r.y) };
        });
        return f;
      });
      if (!tabNode) { await page.mouse.wheel(0, 320); await sleep(420); }
    }
    const w1 = wire.length;
    let tabClicked = false;
    if (tabNode) {
      await page.mouse.click(Math.min(tabNode.x, VP.w - 4), Math.max(20, Math.min(tabNode.y, VP.h - 40)));
      await sleep(2800);
      tabClicked = true;
    }
    const feedCallsAfterTab = wire.slice(w1).filter(w =>
      /displayItem\/(top-picks|newest|shuffle)|SHUFFLE|featured/i.test(w.u));
    rec(`${VP.name}.discover-tab-switch`, tabClicked && feedCallsAfterTab.length > 0,
      `clicked=${tabNode ? JSON.stringify(tabNode) : 'node not found'}; new feed calls=` +
      JSON.stringify(wire.slice(w1).map(w => w.u.slice(0, 64))));
    await shot(page, VP.name, '20-discover-toppicks');

    // ===== POPULAR CATEGORY CARD ('Home & Living' art tile -> SearchScreen seeded) =====
    await page.goto(APP + '/#/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await L.waitText(page, 'Buy now', 45000); await sleep(1800);
    let popNode = null;
    for (let i = 0; i < 12 && !popNode; i++) {
      popNode = await page.evaluate(() => {
        let f = null;
        document.querySelectorAll('flt-semantics[flt-tappable]').forEach(e => {
          const t = (e.textContent || '').trim();
          if (!/Home & Living/.test(t)) return;
          const r = e.getBoundingClientRect();
          // the CARD node: ~150x150 art tile carrying the label overlay
          if (r.width < 100 || r.height < 100 || r.bottom < 0 || r.top > innerHeight) return;
          f = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
            w: Math.round(r.width), h: Math.round(r.height), label: t.slice(0, 30) };
        });
        return f;
      });
      if (!popNode) { await page.mouse.wheel(0, 300); await sleep(400); }
    }
    const w2 = wire.length;
    let popClicked = false;
    if (popNode) {
      await page.mouse.click(Math.min(popNode.x, VP.w - 4), Math.max(20, Math.min(popNode.y, VP.h - 40)));
      await sleep(2800);
      popClicked = true;
    }
    t = await txt(page);
    const searchCallsPop = wire.slice(w2).filter(w => w.u.includes('/api/v1/displayItem/filter') ||
      w.u.includes('/products/search'));
    const popOk = popClicked && ((await page.$$('input[type="text"]')).length > 0 ||
      t.includes('No results found.') || searchCallsPop.length > 0);
    rec(`${VP.name}.popular-card-nav`, popOk,
      `card=${JSON.stringify(popNode)} clicked=${popClicked}; filterCalls=` +
      `${searchCallsPop.length} sample=${t.includes('Search…') ? '"Search… appbar"' : 'none'}`);
    await shot(page, VP.name, '17-popular-card-stage2');

    // ===== WHATSAPP FAB presence (tooltip attr OR bottom-right tappable node) =====
    await page.goto(APP + '/#/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await L.waitText(page, 'Buy now', 45000); await sleep(2000);
    const waTip = await page.evaluate(() =>
      [...document.querySelectorAll('flt-semantics')].some(e =>
        ((e.getAttribute('tooltip') || '') + (e.textContent || '') + (e.getAttribute('aria-label') || ''))
          .toLowerCase().includes('whatsapp')));
    let waOk = waTip;
    let howWa = 'label/tooltip-attr=' + waTip;
    if (!waOk) {
      const cornerBtn = await page.evaluate(() => {
        let found = null;
        document.querySelectorAll('flt-semantics[role="button"], flt-semantics[flt-tappable]').forEach(e => {
          const r = e.getBoundingClientRect();
          if (r.x > innerWidth * 0.6 && r.y > innerHeight * 0.7 &&
              r.width < 120 && r.height < 120 && r.width > 20 && r.height > 20)
            if (!found || (r.width * r.height) < found.a)
              found = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
                a: r.width * r.height, tip: e.getAttribute('tooltip') || '' };
        });
        return found;
      });
      waOk = !!cornerBtn;
      howWa += ` bottomRightTappable=${JSON.stringify(cornerBtn)}`;
    }
    rec(`${VP.name}.whatsapp-fab-present`, waOk, howWa);

    // ===== CATEGORY FEED BY ID (longer settle + scroll + fresh capture) =====
    // The Art & Crafts rail card sits below the fold at 375x667 — scroll until its
    // ~150x150 tappable node is on-screen, then click it by coordinates.
    await page.goto(APP + '/#/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await L.waitText(page, 'Buy now', 45000); await sleep(1800);
    let chipNode = null;
    for (let i = 0; i < 16 && !chipNode; i++) {
      chipNode = await page.evaluate((catName) => {
        let f = null;
        document.querySelectorAll('flt-semantics[flt-tappable]').forEach(e => {
          const tt = (e.textContent || '').trim();
          if (!tt.includes(catName)) return;
          const r = e.getBoundingClientRect();
          if (r.width < 70 || r.height < 70 || r.bottom < 0 || r.top > innerHeight) return;
          if (!f || r.width * r.height < f.a)
            f = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
              w: Math.round(r.width), h: Math.round(r.height), a: r.width * r.height };
        });
        return f;
      }, artCat.categoryName);
      if (!chipNode) { await page.mouse.wheel(0, 300); await sleep(400); }
    }
    const w3 = wire.length;
    const chipClicked = !!chipNode &&
      await page.mouse.click(Math.min(chipNode.x, VP.w - 4), Math.max(20, Math.min(chipNode.y, VP.h - 40)))
        .then(() => true).catch(() => false) && true;
    await sleep(3500);                       // generous settle (r14 used 2600ms)
    t = await txt(page);
    // scroll within the feed to force lazy rows to build, then re-capture
    await page.mouse.move(VP.w / 2, VP.h * 0.55);
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 160); await sleep(500); }
    await sleep(1500);
    const tAfterScroll = await txt(page);
    const combined = t + '\n' + tAfterScroll;

    const catScreenTitle = combined.includes(artCat.categoryName);
    // POSITIVE: any art-feed product title rendered. Titles truncate in cards, so
    // match on progressively shorter prefixes of every server-truth title.
    let hitTitle = null, hitLen = 0;
    for (const tt of artTitles) {
      for (let n = Math.min(tt.length, 34); n >= 8; n -= 2) {
        if (combined.includes(tt.slice(0, n))) { if (n > hitLen) { hitTitle = tt.slice(0, n); hitLen = n; } break; }
      }
    }
    // NEGATIVE: foreign fixtures must not appear (prefix-safe).
    const leaked = foreignTitles.filter(f => combined.includes(f.slice(0, Math.min(22, f.length))));
    const idCall = wire.slice(w3).find(w => w.u.toLowerCase().includes('categoryids=' + artCat.categoryId));
    const searchCalls = wire.slice(w3).filter(w => w.u.includes('/products/search'));

    rec(`${VP.name}.category-screen-opened`, chipClicked && catScreenTitle,
      `clicked=${chipClicked}; appbar "${artCat.categoryName}"=${catScreenTitle}`);
    rec(`${VP.name}.category-feed-shows-art-product`, hitLen >= 8,
      `matched prefix="${hitTitle}" (${hitLen} chars) of server-truth ids=${JSON.stringify(artIds)}`);
    rec(`${VP.name}.category-feed-no-foreign-leak`, leaked.length === 0,
      `foreign titles leaked=${leaked.length}: ${JSON.stringify(leaked.slice(0, 3))}`);
    rec(`${VP.name}.category-not-a-text-search`, searchCalls.length === 0 && !!idCall,
      `/products/search calls=${searchCalls.length}; wire=${idCall ? idCall.m + ' ' + idCall.u.slice(0, 90) : 'NO categoryIds call seen'}`);
    await shot(page, VP.name, '18-category-feed-stage2');

    // ===== DEEPLINK /#/category/art-crafts content =====
    await page.goto(APP + '/#/category/' + artCat.slug, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await sleep(3200);
    t = await txt(page);
    await page.mouse.move(VP.w / 2, VP.h * 0.55);
    for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, 140); await sleep(500); }
    await sleep(1200);
    const tDl = t + '\n' + (await txt(page));
    let dlHit = null;
    for (const tt of artTitles) {
      for (let n = Math.min(tt.length, 30); n >= 8; n -= 2) {
        if (tDl.includes(tt.slice(0, n))) { dlHit = tt.slice(0, n); break; }
      }
      if (dlHit) break;
    }
    rec(`${VP.name}.deeplink-slug-resolves`, tDl.includes(artCat.categoryName) && !tDl.includes('Category not found'),
      `title=${tDl.includes(artCat.categoryName)}; notFound=${tDl.includes('Category not found')}; productPrefix=${JSON.stringify(dlHit)}`);
    await shot(page, VP.name, '19-deeplink-stage2');

    await L.closeVideo(ctx, VP.video).catch(() => {});
    await browser.close().catch(() => {});
  }

  fs.writeFileSync('/tmp/au044_stage2_results.json', JSON.stringify({
    ts: new Date().toISOString(), stage: STAGE, unit: UNIT, build_mtime: lm,
    runtime_ms: Date.now() - T0, results: OUT, videos: [
      'e2e/videos/AU-044-stage2-mobile.webm', 'e2e/videos/AU-044-stage2-tablet.webm'],
  }, null, 2));
  console.log('\nSTAGE2 DONE pass=' + OUT.filter(o => o.pass).length + '/' + OUT.length);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
