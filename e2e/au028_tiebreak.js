// au028_tiebreak.js — TIEBREAKER probes for the 4 DISPUTED AU-028 findings.
// Lane under judgement: http://localhost:9116 (frozen bundle 293688a).
// R1 A3 empty-cart gate parity · R2/R3 ctx-A/B "cart not filled" · R4 de-DE totals/windows.
const fs = require('fs');
const K = require('./au028_sk_lib.js');
const L = K.L;
K.APP = 'http://localhost:9116';   // <- judgement lane (overrides 9112)
L.APP = K.APP;
const SHOT = 'e2e/shots/AU-028';
const sleep = K.sleep;

function snapText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .map(e => e.textContent || '').join('\n'));
}
async function priceScan(p) {
  const t = await snapText(p);
  return {
    prices: (t.match(/TSh\s*[0-9][0-9.,]*/g) || []).slice(0, 16),
    today: /\bToday\b/.test(t),
    tomorrow: /\bTomorrow\b/.test(t),
    hasTotalsCard: t.includes('Order totals'),
    hasWindows: t.includes('When should we deliver'),
    hasSummary: t.includes('Order Summary'),
    len: t.length,
  };
}

(async () => {
  const out = {};
  fs.mkdirSync(SHOT, { recursive: true });

  // ---------- API sanity: fixture prices + stray pending proformas ----------
  const all = await fetch(L.API + '/api/v1/products/get-all-products').then(r => r.json());
  const rows = (all.content || []).filter(x => [K.fx.productId1, K.fx.productId2].includes(x.productId));
  out.fixtures = rows.map(r => ({ id: r.productId, ask: r.askingPrice, name: r.productName }));
  console.log('FIXTURES', JSON.stringify(out.fixtures));
  await K.cancelAllPending('tiebreak-pre').catch(e => console.log('preCancelErr', e.message));

  // ================= CTX-1: default locale — R1 empty gate + R2/R3 refill =====
  {
    const browser = await L.newBrowser();
    const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const p = await context.newPage();
    const calls = await K.watchCalls(p);
    await p.goto(K.APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    // NOTE: the skeptic's fixture buyer (530) is stale on THIS lane's origin —
    // use the canonical BUYER creds from lib_verify for the UI login.
    await p.evaluate(() => { try { localStorage.removeItem('flutter.auth_token'); } catch (e) {} });
    const li = await L.login(p, L.BUYER);
    console.log('login=', li);
    if (!li) throw new Error('login failed');

    // ---- R1: empty-cart checkout gate ------------------------------------
    let lines = await K.persistedCart(p);
    for (let i = 0; i < 5 && lines.length; i++) {
      await K.hashNav(p, '#/cart'); await sleep(1200);
      await K.clickBtnVisible(p, 'Remove'); await sleep(700);
      lines = await K.persistedCart(p);
    }
    console.log('cleared cart, lines=', lines.length);
    const pfBefore = calls.pf.length;
    await K.hashNav(p, '#/checkout'); await sleep(2000);
    const s1 = await priceScan(p);
    console.log('EMPTY step1:', JSON.stringify(s1));
    await L.screenshot(p, SHOT + '/sk-tb-01-empty-step1.png');
    await L.scrollToBottom(p, 8); await sleep(300);
    await K.clickBtnVisible(p, 'Continue to review'); await sleep(1600);
    const t2 = await snapText(p);
    out.R1 = {
      summaryOnEmpty: s1.hasSummary,
      emptyErr: t2.includes('Your cart is empty'),
      stayedStep1: !/Amount due|PF-\d{4}/.test(t2),
      noPost: calls.pf.length === pfBefore,
    };
    await L.screenshot(p, SHOT + '/sk-tb-02-empty-after-continue.png');
    console.log('R1:', JSON.stringify(out.R1));

    // ---- R2/R3: can the APP really hold a 2-line cart? -------------------
    const filled = await K.fillBothLines(p);       // robust fill w/ persistence asserts
    const lines2 = await K.persistedCart(p);
    out.R23 = { fillOk: filled, nLines: lines2.length,
      ids: lines2.map(l => l.productId), prices: lines2.map(l => l.price) };
    console.log('R23:', JSON.stringify(out.R23));

    // reach review for the default-locale baseline
    const atReview = await K.goToReview(p, { waitTotals: true });
    await sleep(1800);
    out.baseReview = await priceScan(p);
    console.log('BASE review:', JSON.stringify(out.baseReview));
    await L.screenshot(p, SHOT + '/sk-tb-03-base-review.png');

    await K.cancelAllPending('tiebreak-ctx1').catch(() => {});
    const v = p.video(); await context.close(); if (v) await v.saveAs('e2e/videos/AU-028-tiebreak-a.webm').catch(() => {});
    await browser.close();
  }

  // ================= CTX-2: de-DE + Africa/Nairobi on :9116 ==================
  {
    const browser = await L.newBrowser();
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 }, locale: 'de-DE', timezoneId: 'Africa/Nairobi',
    });
    const p = await context.newPage();
    await p.goto(K.APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 45000);
    out.deHome = await priceScan(p);            // locale effect visible w/o login
    console.log('DE home prices:', JSON.stringify(out.deHome.prices.slice(0, 6)));
    const li = await L.login(p, L.BUYER);
    console.log('de login=', li);
    if (!li) throw new Error('de login failed');
    await K.patchPrice(K.fx.productId1, K.P1, 18000, 8); await sleep(500);
    const filled = await K.fillBothLines(p);
    console.log('de fill=', filled);
    const atReview = await K.goToReview(p, { waitTotals: false });
    await sleep(2200);
    out.deReview = await priceScan(p);
    console.log('DE review:', JSON.stringify(out.deReview));
    await L.screenshot(p, SHOT + '/sk-tb-04-dede-review.png');
    await K.cancelAllPending('tiebreak-ctx2').catch(() => {});
    await K.patchPrice(K.fx.productId1, K.P1, 18000, 8);
    const v = p.video(); await context.close(); if (v) await v.saveAs('e2e/videos/AU-028-tiebreak-dede.webm').catch(() => {});
    await browser.close();
  }

  // ================= CTX-3: reference :3000 under the SAME de-DE =============
  {
    const browser = await L.newBrowser();
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 }, locale: 'de-DE', timezoneId: 'Africa/Nairobi',
    });
    const p = await context.newPage();
    await p.goto(L.REF + '/browse', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await sleep(6000);
    const body = await p.evaluate(() => document.body.innerText).catch(() => '');
    out.refBrowse = {
      url: p.url(),
      prices: (body.match(/TSh\s*[0-9][0-9.,]*/g) || []).slice(0, 10),
      dotGrouped: /[0-9]\.[0-9]{3}\b/.test(body) && !/[0-9],[0-9]{3}/.test(body.match(/TSh[^0-9]*[0-9.,]+/) || ['']),
      sample: (body.match(/TSh[^\n]{0,18}/g) || []).slice(0, 8),
    };
    console.log('REF browse:', JSON.stringify(out.refBrowse));
    await L.screenshot(p, SHOT + '/sk-tb-05-ref-dede-browse.png');
    // reference checkout gate under de-DE (logged-out -> login wall; structural only)
    await p.goto(L.REF + '/checkout', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await sleep(4000);
    const body2 = await p.evaluate(() => document.body.innerText).catch(() => '');
    out.refCheckout = { url: p.url(),
      emptyGate: body2.includes('Your checkout is empty') || body2.includes('Add items to your cart'),
      sample: (body2.match(/[^\n]*(empty|cart|Log in|sign in)[^\n]*/gi) || []).slice(0, 6) };
    console.log('REF checkout:', JSON.stringify(out.refCheckout));
    await context.close(); await browser.close();
  }

  fs.writeFileSync('/tmp/au028_tiebreak_out.json', JSON.stringify(out, null, 1));
  console.log('TIEBREAK PROBES DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
