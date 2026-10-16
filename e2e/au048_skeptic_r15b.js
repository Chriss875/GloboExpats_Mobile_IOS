// au048_skeptic_r15b.js — AU-048 SKEPTIC: attack the verifier PASS with >=6 attack classes.
// RO lane on FROZEN :9131. Each attack tries to break a PASS claim; every outcome recorded.
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9131';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const TOKEN = 'AU048R71787692116574';
const GT = JSON.parse(fs.readFileSync('/tmp/au048_widgets.json', 'utf8'));
const CC = {}; for (const k of Object.keys(GT)) CC[Number(k)] = GT[k].cc;

const OUT = { attacks: [], verdict: 'HELD' };
function log(...a) { console.log('[sk]', ...a); }
function rec(id, name, broken, detail) {
  OUT.attacks.push({ id, name, broken: !!broken, detail });
  log(broken ? 'BROKEN' : 'held  ', id, name, JSON.stringify(detail).slice(0, 220));
}
async function dump(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')); }
// visual order read
async function vorder(p) {
  return p.evaluate(() => {
    const rows = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim(); const m = t.match(/Probe Widget (\d+)/); if (!m) return;
      let child = false; e.querySelectorAll('flt-semantics').forEach(c => { if ((c.textContent || '').includes('Probe Widget')) child = true; });
      if (child) return;
      const pm = t.match(/TSh ([\d,]+)/);
      rows.push({ w: Number(m[1]), p: pm ? Number(pm[1].replace(/,/g, '')) : null, y: e.getBoundingClientRect().y });
    });
    rows.sort((a, b) => a.y - b.y);
    const seen = new Set(); const out = [];
    for (const r of rows) { if (!seen.has(r.w)) { seen.add(r.w); out.push(r); } }
    return out;
  });
}
function mono(a, d) { for (let i = 1; i < a.length; i++) if (d > 0 ? a[i] < a[i - 1] : a[i] > a[i - 1]) return false; return true; }

(async () => {
  // ---- A1 freshness forgery: is the lane really serving e694463? mtime + size + content probe ----
  {
    const h = await fetch(`${APP}/main.dart.js`, { method: 'HEAD' });
    const lm = h.headers.get('last-modified'); const len = h.headers.get('content-length');
    const body = await (await fetch(`${APP}/main.dart.js`)).text();
    const marker = body.includes('trackSearch') && body.includes('Highest Rating') && body.includes('Trending');
    rec('A1', 'freshness-forgery-mtime+content-markers',
      !(lm === 'Wed, 26 Aug 2026 08:15:26 GMT' && marker),
      { lastModified: lm, len, hasTrackSearchAndSortMarkers: marker });
  }
  // ---- A2 seed drift: ground truth changed under us? ----
  async function g(body) {
    const r = await fetch(`${L.API}/api/v1/displayItem/filter`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.json();
  }
  {
    const j = await g({ searchTerm: TOKEN, page: 0, size: 100 });
    rec('A2', 'seed-drift-total-still-31', j.totalElements !== 31,
      { totalElements: j.totalElements });
  }
  // ---- A3 sort is fake: does 'Price: High to Low' just reverse page-0 instead of sorting all? ----
  {
    const b = await L.newBrowser();
    const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    await p.goto(`${APP}/#/,`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await p.goto(`${APP}/#/search?q=${encodeURIComponent(TOKEN)}`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await p.waitForTimeout(9000);
    let T = await dump(p);
    const loaded = T.includes('Probe Widget');
    if (!loaded) {
      // fall back to UI login-free path: results should still render publicly
      await p.goto(`${APP}/#/search?q=${encodeURIComponent(TOKEN)}`, { waitUntil: 'reload', timeout: 60000 }).catch(() => {});
      await p.waitForTimeout(8000);
      T = await dump(p);
    }
    const cards = await vorder(p);
    const prices = cards.map(c => c.p).filter(x => x !== null);
    rec('A3', 'server-order-not-sorted-asc-baseline(client-sort-needed)',
      mono(prices, 1), { n: prices.length, first6: prices.slice(0, 6) });

    // open sort menu, pick Price: Low to High, re-read
    const btn = p.locator('flt-semantics[role="button"]', { hasText: 'Sort' }).first();
    await btn.click({ force: true }).catch(() => {}); await p.waitForTimeout(700);
    const menuTxt = await dump(p);
    rec('A4', 'sort-menu-options-missing-any-of-six',
      !(['Relevance', 'Price: Low to High', 'Price: High to Low', 'Newest', 'Highest Rating', 'Trending']
        .every(o => menuTxt.includes(o))),
      { missing: ['Relevance', 'Price: Low to High', 'Price: High to Low', 'Newest', 'Highest Rating', 'Trending'].filter(o => !menuTxt.includes(o)) });

    // pick Price: Low to High via smallest node
    const cands = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim(); if (!t.includes('Price: Low to High')) return;
        let child = false; e.querySelectorAll('flt-semantics').forEach(c => { if ((c.textContent || '').includes('Price: Low')) child = true; });
        if (child) return;
        const r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
        out.push({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
      });
      return out.slice(0, 3);
    });
    for (const c of cands) { await p.mouse.click(c.x, Math.min(c.y, 650)); break; }
    await p.waitForTimeout(1800);
    const after = await vorder(p);
    const ap = after.map(c => c.p).filter(x => x !== null);
    const sortedAll = mono(ap, 1);
    rec('A5', 'price-asc-not-truly-sorted-after-pick', !sortedAll,
      { n: ap.length, first8: ap.slice(0, 8), last3: ap.slice(-3) });

    // Trending check: top must be widget 9 (cc 238)
    await btn.click({ force: true }).catch(() => {}); await p.waitForTimeout(700);
    const tc = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim(); if (!t.includes('Trending')) return;
        let child = false; e.querySelectorAll('flt-semantics').forEach(c => { if ((c.textContent || '').includes('Trending')) child = true; });
        if (child) return;
        const r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
        out.push({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
      });
      return out.slice(0, 3);
    });
    for (const c of tc) { await p.mouse.click(c.x, Math.min(c.y, 650)); break; }
    await p.waitForTimeout(1800);
    const trd = await vorder(p);
    rec('A6', 'trending-top-not-highest-clickcount-widget9',
      !(trd.length && trd[0].w === 9), { top5: trd.slice(0, 5).map(c => `${c.w}(cc${CC[c.w]})`) });

    // ---- A7 trackSearch spam: type a zero term, wait past settle, count calls ----
    const calls = [];
    p.on('request', r => { if (/displayItem\/filter/.test(r.url())) {
      let body = {}; try { body = JSON.parse(r.postData() || '{}'); } catch (e) {}
      if (body.trackSearch) calls.push({ term: body.searchTerm, ts: Date.now() });
    } });
    const ZERO = 'zzattack' + Math.floor(Math.random() * 1e6);
    const inp = p.locator('input[type="text"]').first();
    await inp.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
    await inp.click({ force: true }).catch(() => {}); await p.waitForTimeout(300);
    for (let i = 0; i < 50; i++) await p.keyboard.press('Backspace');
    await p.keyboard.type(ZERO, { delay: 9 }); await p.keyboard.press('Enter');
    await p.waitForTimeout(7000);
    const tzero = await dump(p);
    rec('A7', 'tracksearch-not-fired-or-duplicated-for-zero-term',
      !(calls.filter(c => c.term === ZERO).length === 1 && tzero.includes('No results found.')),
      { calls: calls.filter(c => c.term === ZERO), emptyState: tzero.includes('No results found.') });

    // ---- A8 request-board suggestion fabricated by harness? read raw DOM text ----
    rec('A8', 'request-board-suggestion-absent-in-real-dom', !tzero.includes('Request Board'),
      { domHasRequestBoard: tzero.includes('Request Board'),
        couldnFind: tzero.includes("We couldn't find") });

    // ---- A9 deep-link field restore lie: query param vs field value ----
    await p.evaluate(t => { window.location.hash = '/search?q=' + encodeURIComponent(t); }, TOKEN);
    await p.waitForTimeout(5000);
    const fv = await p.evaluate(() => { const i = document.querySelector('input[type="text"]'); return i ? i.value : null; });
    rec('A9', 'deep-link-q-not-restored-in-field', fv !== TOKEN, { fieldValue: fv });

    // ---- A10 images: any fixture image request failing? ----
    const imgs = {};
    p.on('response', r => { const u = r.url(); if (/\/uploads\/[^?#]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) imgs[u] = r.status(); });
    await p.evaluate(() => { window.location.hash = '/search?q=' + encodeURIComponent(TOKEN); });
    await p.waitForTimeout(8000);
    const bad = Object.entries(imgs).filter(([, s]) => s >= 400);
    rec('A10', 'fixture-image-request-fails', bad.length > 0 || Object.keys(imgs).length === 0,
      { tracked: Object.keys(imgs).length, failing: bad });

    await b.close();
  }

  OUT.attacks_broken = OUT.attacks.filter(a => a.broken).length;
  OUT.verdict = OUT.attacks_broken === 0 ? 'HELD' : 'BROKEN';
  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/raw-AU-048-skeptic-r15b.json',
    JSON.stringify(OUT, null, 1));
  log(`DONE attacks=${OUT.attacks.length} broken=${OUT.attacks_broken} verdict=${OUT.verdict}`);
})().catch(e => { console.error('SKEPTIC FAILED', e); process.exit(1); });
