// au045_skeptic_r14.js — attack the AU-045 verifier PASS claim (>=6 attack classes).
// Target: frozen lane :9131 (e694463). Verdict HELD = attacks fail to break the claim;
// BROKEN = an attack demonstrates the claimed behavior is false/unproven.
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9131', API = 'http://localhost:8083';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const BUYER = { email: 'mobile.test.20260820@gmail.com', pw: 'StrongPass!1' };
const OUT = { attacks: [], broken: 0, findings: [] };
function rec(name, result, detail) {
  OUT.attacks.push({ name, result, detail: String(detail).slice(0, 400) });
  if (result === 'BROKEN') OUT.broken++;
  console.log(`${result} ${name} :: ${String(detail).slice(0, 160)}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // ---- A1: freshness forgery — is the served bundle REALLY the frozen one? ----
  const h = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = h.headers.get('last-modified');
  rec('A1-freshness-mtime-forgery-check', lm === 'Wed, 26 Aug 2026 08:15:26 GMT' ? 'HELD' : 'BROKEN',
    `served Last-Modified="${lm}"`);
  const bodyTxt = await fetch(APP + '/main.dart.js').then(r => r.text());
  const hasAU045 = bodyTxt.includes('Top Picks') && bodyTxt.includes('SHUFFLE') && bodyTxt.includes('"seed"');
  rec('A1b-au045-code-in-served-bundle', hasAU045 ? 'HELD' : 'BROKEN',
    `Top Picks=${bodyTxt.includes('Top Picks')} SHUFFLE=${bodyTxt.includes('SHUFFLE')} seed=${bodyTxt.includes('"seed"')}`);

  // ---- A2: is "distinct lists" actually from distinct endpoints or a client-side re-sort
  // of ONE cached list? Compare wire paths + verify server payloads differ (curl truth).
  async function gq(qs, obj) { const r = await fetch(API + qs, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }); return r.json(); }
  const nw = await fetch(API + '/api/v1/displayItem/newest?page=0&size=24').then(r => r.json());
  const tp = await fetch(API + '/api/v1/displayItem/top-picks?page=0&size=24').then(r => r.json());
  const nwIds = nw.content.map(c => c.productId), tpIds = tp.content.map(c => c.productId);
  const serverDistinct = nwIds.filter(id => tpIds.includes(id)).length === 0;
  rec('A2-server-payloads-truly-distinct', serverDistinct ? 'HELD' : 'BROKEN',
    `newest∩toppicks page0 = ${nwIds.filter(id => tpIds.includes(id)).length}/24 ids`);

  // ---- A3: shuffle-seed determinism attack — same seed replayed MUST be identical,
  // different seeds MUST differ; and seed must NOT be constant across loads.
  const s1a = await gq('/api/v1/displayItem/filter?priceSort=SHUFFLE&seed=515151&page=0&size=24', { priceSort: 'SHUFFLE', seed: '515151', maxPrice: 500000, page: 0, size: 24 });
  const s1b = await gq('/api/v1/displayItem/filter?priceSort=SHUFFLE&seed=515151&page=0&size=24', { priceSort: 'SHUFFLE', seed: '515151', maxPrice: 500000, page: 0, size: 24 });
  const stable = JSON.stringify(s1a.content.map(c => c.productId)) === JSON.stringify(s1b.content.map(c => c.productId));
  rec('A3-same-seed-replay-stability', stable ? 'HELD' : 'BROKEN', `replay identical=${stable}`);
  const s2 = await gq('/api/v1/displayItem/filter?priceSort=SHUFFLE&seed=9999999&page=0&size=24', { priceSort: 'SHUFFLE', seed: '9999999', maxPrice: 500000, page: 0, size: 24 });
  const differs = JSON.stringify(s1a.content.map(c => c.productId)) !== JSON.stringify(s2.content.map(c => c.productId));
  rec('A3b-diff-seed-differs', differs ? 'HELD' : 'BROKEN', `diff-seed differs=${differs}`);

  // ---- A4: does the app ACTUALLY regenerate the seed per load, or reuse one?
  // Drive 2 fresh loads in a real browser and capture both filter bodies.
  {
    const b = await L.newBrowser();
    const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    const seenSeeds = [];
    p.on('request', req => {
      if (!/displayItem\/filter/.test(req.url())) return;
      let bd = {}; try { bd = JSON.parse(req.postData() || '{}'); } catch (e) {}
      if ((bd.priceSort || '') === 'SHUFFLE') seenSeeds.push(String(bd.seed));
    });
    for (let i = 0; i < 2; i++) {
      await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await L.waitText(p, 'Buy now', 60000);
      for (let k = 0; k < 20; k++) {
        const y = await p.evaluate(() => { let o = null; document.querySelectorAll('flt-semantics').forEach(e => { if (o !== null) return; if ((e.textContent || '').trim() === 'Featured' && (e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null)) o = Math.round(e.getBoundingClientRect().top); }); return o; });
        if (y !== null && y > 40 && y < 527) break;
        await p.mouse.move(187, 333); await p.mouse.wheel(0, 380); await sleep(260);
      }
      const before = seenSeeds.length;
      const c = await p.evaluate(() => { let hit = null; document.querySelectorAll('flt-semantics').forEach(e => { if (hit) return; if ((e.textContent || '').trim() === 'Featured' && (e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null)) { const r = e.getBoundingClientRect(); hit = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; } }); return hit; });
      if (c) { await p.mouse.click(c.x, c.y); }
      for (let k = 0; k < 12 && seenSeeds.length === before; k++) await sleep(400);
      await sleep(500);
    }
    await b.close();
    const uniq = [...new Set(seenSeeds)];
    rec('A4-app-seed-regenerated-per-load-click', seenSeeds.length >= 2 && uniq.length >= 2 ? 'HELD' : 'BROKEN',
      `captured seeds=${JSON.stringify(seenSeeds)} unique=${uniq.length}`);
  }

  // ---- A5: save toggle — try to BREAK the net-zero claim by checking server state
  // right now (must equal the pre-run baseline; no leaked writes).
  const tok = await L.apiLogin(BUYER);
  const wl = (await L.api(tok, 'GET', '/api/saved-products')).json.map(r => r.productId).sort((a, b) => a - b);
  const baseline = [338, 470, 481, 629, 870, 875, 876];
  rec('A5-ro-netzero-no-leaked-writes', JSON.stringify(wl) === JSON.stringify(baseline) ? 'HELD' : 'BROKEN',
    `wishlist now=${JSON.stringify(wl)} baseline=${JSON.stringify(baseline)}`);

  // ---- A6: duplicate/ghost rows — does the discover grid show items that are NOT in
  // the endpoint payload (stale cache / other-tab leftovers)?
  {
    const b = await L.newBrowser();
    const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    let newestPayloadTitles = null;
    p.on('response', res => {
      if (/displayItem\/newest\?page=0/.test(res.url()))
        res.json().then(j => { newestPayloadTitles = j.content.map(c => c.productName); }).catch(() => {});
    });
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 60000);
    for (let k = 0; k < 20; k++) {
      const y = await p.evaluate(() => { let o = null; document.querySelectorAll('flt-semantics').forEach(e => { if (o !== null) return; if ((e.textContent || '').trim() === 'Newest' && (e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null)) o = Math.round(e.getBoundingClientRect().top); }); return o; });
      if (y !== null && y > 40 && y < 527) break;
      await p.mouse.move(187, 333); await p.mouse.wheel(0, 380); await sleep(260);
    }
    await sleep(1500);
    const domCards = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim(); const m = t.match(/TSh ([\d,]+)/); if (!m) return;
        const r = e.getBoundingClientRect();
        if (r.width < 40 || r.height < 40 || r.bottom < 0 || r.top > innerHeight) return;
        out.push(t.split('\n')[0].slice(0, 44));
      });
      return [...new Set(out)];
    });
    for (let k = 0; k < 10 && !newestPayloadTitles; k++) await sleep(500);
    const ghosts = domCards.filter(n => !isHeader(n) && !newestPayloadTitles.some(t => t.startsWith(n.slice(0, Math.min(20, n.length)))));
    function isHeader(n) { return /marketplace|Buy\. Sell\.|expat/i.test(n); }
    rec('A6-grid-shows-only-endpoint-items', ghosts.length === 0 ? 'HELD' : 'BROKEN',
      `dom cards=${JSON.stringify(domCards)} ghosts(not in payload)=${JSON.stringify(ghosts)}`);
    await b.close();
  }

  // ---- A7: wire-shape attack — Featured request must carry criteria in BODY too
  // (AU-047 regression class): qs-only would mean unfiltered feed.
  {
    const b = await L.newBrowser();
    const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    let captured = null;
    p.on('request', req => {
      if (/displayItem\/filter/.test(req.url()) && !captured) {
        let bd = {}; try { bd = JSON.parse(req.postData() || '{}'); } catch (e) {}
        captured = { qsPriceSort: new URL(req.url()).searchParams.get('priceSort'), body: bd };
      }
    });
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 60000);
    for (let k = 0; k < 20; k++) {
      const y = await p.evaluate(() => { let o = null; document.querySelectorAll('flt-semantics').forEach(e => { if (o !== null) return; if ((e.textContent || '').trim() === 'Featured' && (e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null)) o = Math.round(e.getBoundingClientRect().top); }); return o; });
      if (y !== null && y > 40 && y < 527) break;
      await p.mouse.move(187, 333); await p.mouse.wheel(0, 380); await sleep(260);
    }
    const cc = await p.evaluate(() => { let hit = null; document.querySelectorAll('flt-semantics').forEach(e => { if (hit) return; if ((e.textContent || '').trim() === 'Featured' && (e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null)) { const r = e.getBoundingClientRect(); hit = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; } }); return hit; });
    if (cc) { await p.mouse.click(cc.x, cc.y); }
    for (let k = 0; k < 12 && !captured; k++) await sleep(400);
    const bodyBound = captured && captured.body.priceSort === 'SHUFFLE' && captured.body.seed != null && captured.body.maxPrice != null;
    rec('A7-filter-criteria-bound-in-body', bodyBound ? 'HELD' : 'BROKEN', JSON.stringify(captured));
    await b.close();
  }

  // ---- A8: parity attack — mobile Featured population vs web FEATURED_MAX_PRICE.
  const chunk = await fetch('http://localhost:3000/_next/static/chunks/1914-e3a1722f1822b5f6.js').then(r => r.text()).catch(() => '');
  const webCeiling = /maxPrice:2e5/.test(chunk);
  const mobCeiling = bodyTxt.includes('500000');
  rec('A8-featured-ceiling-parity-web200k-vs-mobile500k',
    (webCeiling && mobCeiling && webCeiling !== mobCeiling) ? 'BROKEN' : 'DISPUTED',
    `web chunk maxPrice:2e5=${webCeiling}; mobile bundle uses 500000=${mobCeiling} → mobile Featured includes TSh 200k–500k items the web home never shows`);

  OUT.verdict = OUT.broken === 0 ? 'HELD' : 'BROKEN';
  fs.writeFileSync('/tmp/au045r14/skeptic.json', JSON.stringify(OUT, null, 1));
  console.log(`\nSKEPTIC ${OUT.verdict} attacks=${OUT.attacks.length} broken=${OUT.broken}`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
