// au034_skeptic_sk14.js — SKEPTIC attacks on AU-034 against FROZEN lane :9131 (sha e694463).
// The canonical PASS was produced on :9112 @858b0ef; nothing here trusts it.
// Attacks: fresh-build data re-render, group membership vs INDEPENDENT (reference-source)
// computation, rapid double-taps, out-of-order/back-out sequences, empty-state block hiding,
// offline mid-request + retry, session expiry, hostile deep-link ids, TZS/timestamp formats,
// role/unauthenticated probes.
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9131';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-034';
const SHOT_DIR = `${ROOT}/e2e/shots/${UNIT}`;
const SELLER_EMAIL = 'au054seller1787624747348@gmail.com';
const OUT = { attacks: [], network: [], images: {} };
function log(...a) { console.log('[au034-sk14]', ...a); }
function rec(attack, pass, detail, evidence) {
  OUT.attacks.push({ attack, result: pass ? 'HELD' : 'BROKEN', detail, evidence });
  log(pass ? 'HELD ' : 'BRKN ', attack, '::', detail);
}
async function dumpText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n'));
}
async function shot(p, vp, state) {
  const f = `${SHOT_DIR}/${UNIT}-sk14-${vp}-${state}.png`; await L.screenshot(p, f); return f;
}

// ---- INDEPENDENT expected-group model, ported from the JUDGE:
// GloboExpats_Frontend/lib/order-delivery-deadline.ts getOrderDeliveryDeadline +
// dashboard/page.tsx getOrderStatusGroup (explicit deadline -> trip -> windows -> pref date/slot).
function parseTs(v) { if (typeof v !== 'string' || !v.trim()) return null; const d = Date.parse(v); return Number.isFinite(d) ? d : null; }
const SLOT_END = { MORNING: [10, 12], AFTERNOON: [12, 16], EVENING: [16, 20] };
function refDeadlineMs(o) {
  const explicit = [o.fulfillmentDeadline, o.deliveryDeadline, o.deliveryDueAt, o.promisedDeliveryAt].map(parseTs).find(v => v !== null && v !== undefined);
  if (explicit !== undefined) return explicit;
  const wins = Array.isArray(o.preferredDeliveryWindows) ? o.preferredDeliveryWindows : [];
  const ends = wins.map(w => {
    const se = SLOT_END[String(w.slot || '').toUpperCase()]; if (!se || !/^\d{4}-\d{2}-\d{2}$/.test(String(w.date || ''))) return null;
    return Date.parse(`${w.date}T${String(se[1]).padStart(2, '0')}:00:00+03:00`);
  }).filter(v => v !== null);
  if (ends.length > 0) return Math.max(...ends);
  const date = String(o.preferredDeliveryDate ?? '').trim(), slot = String(o.preferredDeliverySlot ?? '').trim().toUpperCase();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const se = SLOT_END[slot]; if (!se) return null;
  const t = Date.parse(`${date}T${String(se[1]).padStart(2, '0')}:00:00+03:00`);
  return Number.isFinite(t) ? t : null;
}
function refGroup(o, now = Date.now()) {
  const s = String(o.status ?? '').toUpperCase().replace(/[\s-]+/g, '_'); const N = s === 'CONFIRMED' ? 'COMPLETED' : s;
  const rental = (o.items || []).some(i => i && i.rentalBooking);
  const done = rental ? (N === 'COMPLETED') : ['COMPLETED', 'DELIVERED', 'PICKED_UP'].includes(N);
  if (done) return 'completed';
  if (['CANCELLED', 'FAILED', 'EXPIRED'].includes(N)) return 'cancelled';
  const dl = refDeadlineMs(o);
  if (dl !== null && dl < now) return 'overdue';
  return 'ongoing';
}
const EAT = 3 * 3600e3, MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function refStamp(iso) { const d = new Date(Date.parse(iso) + EAT); return `${String(d.getUTCDate()).padStart(2, '0')} ${MON[d.getUTCMonth()]}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; }
function fmtAmt(n) { return 'TSh ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

async function clickChip(p, label) {
  const loc = p.locator('flt-semantics[role="button"]', { hasText: label }).first();
  try { await loc.click({ timeout: 6000 }); await p.waitForTimeout(700); return true; } catch (e) { return false; }
}
async function visibleNums(p) {
  const t = await dumpText(p);
  return (t.match(/ORD-\d{4}-\d{6}/g) || []);
}

(async () => {
  // ---------- ground truth straight from the sandbox ----------
  const bt = await L.apiLogin(L.BUYER);
  const stok = await L.apiLogin({ email: SELLER_EMAIL, pw: 'StrongPass!1' });
  const bAll = (await L.api(bt, 'GET', '/api/v1/orders')).json;
  const sAll = (await L.api(stok, 'GET', '/api/v1/orders')).json;
  const expBuyer = bAll.map(o => ({ num: o.orderNumber, group: refGroup(o), type: o.orderType, stamp: refStamp(o.createdAt), total: fmtAmt(o.totalAmount), status: o.status }));
  const expSeller = sAll.map(o => ({ num: o.orderNumber, group: refGroup(o), type: o.orderType, stamp: refStamp(o.createdAt), total: fmtAmt(o.totalAmount) }));
  fs.writeFileSync(`${ROOT}/e2e/tmp/AU-034-sk14-groundtruth.json`, JSON.stringify({ expBuyer, expSeller }, null, 1));
  log('ground truth buyer:', expBuyer.map(e => `${e.num}:${e.group}`).join(' '), '| seller:', expSeller.map(e => `${e.num}:${e.group}`).join(' '));

  const browser = await L.newBrowser();

  // =====================================================================
  // ATTACK 1+2+9: frozen-lane fresh render, group membership, formats (buyer, 375)
  // =====================================================================
  {
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: `${ROOT}/e2e/videos/${UNIT}-sk14-375.webm` });
    const page = await ctx.newPage();
    const imgs = L.watchImages(page);
    let ordersStatuses = [];
    page.on('response', r => { const u = r.url(); if (/\/api\/v1\/orders(\?|$)/.test(u)) ordersStatuses.push(r.status()); });

    await page.goto(APP + '/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(page, 'Welcome back', 30000);
    const gated = /login\?returnUrl=\/orders/.test(page.url());
    const ei = page.locator('input[type="text"]').first(); const pi = page.locator('input[type="password"]').first();
    await ei.click({ force: true }); await page.waitForTimeout(250); await page.keyboard.type(L.BUYER.email);
    await pi.click({ force: true }); await page.waitForTimeout(250); await page.keyboard.type(L.BUYER.pw);
    await L.clickBtn(page, 'Log in');
    let landed = false;
    for (let i = 0; i < 30; i++) { await page.waitForTimeout(800); const t = await dumpText(page); if ((await L.isLoggedIn(page)) && !t.includes('Welcome back')) { landed = true; break; } }
    await page.waitForTimeout(2000);
    rec('unauth-deep-link-/orders-gates-to-login', gated && landed, `gated=${gated} landedOnOrders=${landed}`, 'video sk14-375');

    let txt = await dumpText(page);
    const nums = await visibleNums(page);
    const uniq = [...new Set(nums)];
    rec('A1-frozen-build-renders-current-sandbox-orders', ordersStatuses.length > 0 && ordersStatuses.every(s => s === 200) && expBuyer.every(e => uniq.includes(e.num)),
      `api=${JSON.stringify(ordersStatuses)} rendered=${uniq.length}/${expBuyer.length}`, await shot(page, '375', 'a1-buying-all'));

    // every total + EAT stamp verbatim
    const missTotals = expBuyer.filter(e => !txt.includes(e.total)).map(e => `${e.num}:${e.total}`);
    const missStamps = expBuyer.filter(e => !txt.includes(e.stamp)).map(e => `${e.num}:${e.stamp}`);
    rec('A9-tzs-separators-and-EAT-stamps-match-independent-model', missTotals.length === 0 && missStamps.length === 0,
      `missingTotals=${JSON.stringify(missTotals)} missingStamps=${JSON.stringify(missStamps)}`, 'same shot');

    // ATTACK 2: group membership with TODAY's statuses (incl. DELIVERED 000020 + 2 new orders)
    const want = g => expBuyer.filter(e => e.group === g).map(e => e.num).sort();
    const groupProbe = {};
    for (const g of ['Ongoing', 'Overdue', 'Completed', 'Cancelled']) {
      await clickChip(page, g);
      await page.waitForTimeout(400);
      const got = [...new Set(await visibleNums(page))].sort();
      groupProbe[g] = got.join(',');
      await shot(page, '375', `a2-${g.toLowerCase()}`);
    }
    const grpOk = ['Ongoing', 'Overdue', 'Completed', 'Cancelled'].every(g => groupProbe[g] === want(g.toLowerCase()).join(','));
    rec('A2-group-membership-matches-reference-model-live', grpOk,
      `want Ongoing=[${want('ongoing')}] Overdue=[${want('overdue')}] Completed=[${want('completed')}] Cancelled=[${want('cancelled')}] | got ${JSON.stringify(groupProbe)}`,
      'shots a2-*');
    await clickChip(page, 'All'); await page.waitForTimeout(500);

    // =====================================================================
    // ATTACK 3: rapid double/triple taps on chips + row
    // =====================================================================
    const before = page.url();
    const chip = page.locator('flt-semantics[role="button"]', { hasText: 'Completed' }).first();
    await chip.click({ delay: 0 }).catch(() => {});
    await chip.click({ timeout: 800 }).catch(() => {});
    await chip.click({ timeout: 800 }).catch(() => {});
    await page.waitForTimeout(900);
    const tRapid = await dumpText(page);
    const completedOnly = [...new Set(await visibleNums(page))].sort().join(',');
    rec('A3-rapid-triple-tap-completed-chip-stable', completedOnly === want('completed').join(',') && !(await hasCrash(tRapid)),
      `after 3 fast taps -> [${completedOnly}] url=${page.url().slice(0, 60)}`, await shot(page, '375', 'a3-rapid-completed'));

    // double-tap a ROW (detail must open once; back returns once)
    await clickChip(page, 'All'); await page.waitForTimeout(600);
    const rowTarget = expBuyer[0].num;
    const rowLoc = page.locator(`flt-semantics[flt-tappable]`, { hasText: rowTarget }).first();
    let dblOk = true;
    try { await rowLoc.dblclick({ timeout: 6000 }); } catch (e) { dblOk = false; }
    await page.waitForTimeout(1200);
    const inDetail = (await dumpText(page));
    const detailOpen = /Placed on|Order items|Timeline|Status history|Total/i.test(inDetail) && !inDetail.includes('Buying');
    await page.waitForTimeout(300);
    // second rapid tap while already navigating
    await page.mouse.click(190, 300); await page.waitForTimeout(1000);
    const depth1 = 1; // single detail push; back button presence proves stack depth
    const backBtn = page.locator('flt-semantics[role="button"]', { hasText: 'Back' }).first();
    await backBtn.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(700);
    const backTxt = await dumpText(page);
    const backToList = backTxt.includes('ORD-');
    rec('A3-row-double-tap-single-detail-back-once', dblOk && detailOpen && depth1 <= 2 && backToList,
      `dblclick ok=${dblOk} detailOpen=${detailOpen} stackDepth~${depth1} backRestoresList=${backToList}`, await shot(page, '375', 'a3-back-to-list'));

    // =====================================================================
    // ATTACK 4: out-of-order sequence w/ mid-flow back-outs
    // =====================================================================
    await clickChip(page, 'Overdue'); await page.waitForTimeout(500);
    const ovRow = want('overdue')[0];
    const r1 = page.locator('flt-semantics[flt-tappable]', { hasText: ovRow }).first();
    await r1.click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(1100);
    const d1 = await dumpText(page);
    const openedDetail = d1.includes(ovRow);
    await page.locator('flt-semantics[role="button"]', { hasText: 'Back' }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(700);
    // filter still Overdue after returning? (state retention)
    const afterBack = [...new Set(await visibleNums(page))].sort().join(',');
    rec('A4-row-detail-back-preserves-active-filter', openedDetail && afterBack === want('overdue').join(','),
      `opened ${ovRow}=${openedDetail}; after back filter=Overdue rows=[${afterBack}]`, await shot(page, '375', 'a4-after-backout'));

    // =====================================================================
    // ATTACK 5: empty-state blocks hide entirely (selling side of buyer)
    // =====================================================================
    await clickChip(page, 'All'); await page.waitForTimeout(400);
    await clickChip(page, 'Selling'); await page.waitForTimeout(900);
    const sellTxt = await dumpText(page);
    const leak = (sellTxt.match(/ORD-\d{4}-\d{6}/g) || []);
    const emptyMsg = sellTxt.includes('no selling orders yet');
    rec('A5-empty-selling-side-hides-all-blocks', emptyMsg && leak.length === 0 && !sellTxt.includes('TSh'),
      `emptyMsg=${emptyMsg} leakedRows=${JSON.stringify(leak)} anyTotals=${sellTxt.includes('TSh')}`, await shot(page, '375', 'a5-selling-empty'));
    // empty GROUP inside populated tab
    await clickChip(page, 'Buying'); await page.waitForTimeout(400);
    await clickChip(page, 'Cancelled'); await page.waitForTimeout(700);
    const cnums = [...new Set(await visibleNums(page))];
    rec('A5b-cancelled-group-scoped-exactly', JSON.stringify(cnums.sort()) === JSON.stringify(want('cancelled')),
      `got=${cnums.join(',')}`, await shot(page, '375', 'a5b-cancelled'));

    // =====================================================================
    // ATTACK 7: session expiry — clear token + reload
    // =====================================================================
    await page.evaluate(() => { try { localStorage.removeItem('flutter.auth_token'); } catch (e) {} });
    await page.reload({ waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(3500);
    const tExp = await dumpText(page);
    const gatedAgain = /login|Welcome back|Log in/i.test(tExp) || /login/.test(page.url());
    rec('A7-token-clear-plus-reload-gates-list', gatedAgain && !tExp.includes('ORD-2026-'),
      `url=${page.url().slice(0, 70)} ordersLeaked=${tExp.includes('ORD-2026-')}`, await shot(page, '375', 'a7-session-expired'));

    await L.closeVideo(ctx, `${ROOT}/e2e/videos/${UNIT}-sk14-375.webm`);
  }

  // =====================================================================
  // ATTACK 6: offline mid-request + retry (fresh context, 375)
  // =====================================================================
  {
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: `${ROOT}/e2e/videos/${UNIT}-sk14-offline.webm` });
    const page = await ctx.newPage();
    await page.goto(APP + '/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(page, 'Welcome back', 30000);
    const ei = page.locator('input[type="text"]').first(); const pi = page.locator('input[type="password"]').first();
    await ei.click({ force: true }); await page.waitForTimeout(200); await page.keyboard.type(L.BUYER.email);
    await pi.click({ force: true }); await page.waitForTimeout(200); await page.keyboard.type(L.BUYER.pw);
    // cut the network right as we submit
    await ctx.setOffline(true);
    await L.clickBtn(page, 'Log in');
    await page.waitForTimeout(6000);
    const tOff = await dumpText(page);
    const offShot = await shot(page, '375', 'a6-offline-login');
    // go back online and retry
    await ctx.setOffline(false);
    await page.waitForTimeout(1500);
    if (!tOff.includes('ORD-')) {
      await L.clickBtn(page, 'Log in').catch(() => {});
      await page.waitForTimeout(8000);
    }
    const tRe = await dumpText(page);
    const recovered = tRe.includes('ORD-2026-');
    rec('A6-offline-honest-failure-then-recovers', !tOff.includes('ORD-2026-') && recovered,
      `offline showedOrders=${tOff.includes('ORD-2026-')} errShown=${/could not|error|retry|failed|check your connection/i.test(tOff)} recovered=${recovered}`,
      `${offShot} , ${await shot(page, '375', 'a6-recovered')}`);
    await L.closeVideo(ctx, `${ROOT}/e2e/videos/${UNIT}-sk14-offline.webm`);
  }

  // =====================================================================
  // ATTACK 8 + 10: hostile deep links + seller role probe (768 tablet)
  // =====================================================================
  {
    const ctx = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: `${ROOT}/e2e/videos/${UNIT}-sk14-768.webm` });
    const page = await ctx.newPage();

    const tGarbage = null;
    const tg = await dumpText(page);
    await shot(page, '768', 'a8-deeplink-500char-unauth');
    // 8b: emoji/script id
    await page.goto(APP + `/orders/${encodeURIComponent('<script>alert(1)</script>🚀')}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3500);
    const ts = await dumpText(page);
    await shot(page, '768', 'a8-deeplink-script-emoji');
    rec('A8-hostile-deep-links-no-crash-no-leak', tg.length > 0 && ts.length > 0 && !tg.includes('ORD-2026-') && !ts.includes('ORD-2026-'),
      `500-char id page alive=${tg.length > 0}, leaked=${tg.includes('ORD-2026-')}; script/emoji id alive=${ts.length > 0}, xssRendered=${ts.includes('<script>')}`,
      'shots a8-*');

    // 10: seller role on the same frozen lane — split + seller-perspective labels
    await page.goto(APP + '/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(page, 'Welcome back', 30000);
    const ei2 = page.locator('input[type="text"]').first(); const pi2 = page.locator('input[type="password"]').first();
    await ei2.click({ force: true }); await page.waitForTimeout(200); await page.keyboard.type(SELLER_EMAIL);
    await pi2.click({ force: true }); await page.waitForTimeout(200); await page.keyboard.type('StrongPass!1');
    await L.clickBtn(page, 'Log in');
    let slanded = false;
    for (let i = 0; i < 30; i++) { await page.waitForTimeout(800); const t = await dumpText(page); if ((await L.isLoggedIn(page)) && !t.includes('Welcome back')) { slanded = true; break; } }
    await page.waitForTimeout(2200);
    let st = await dumpText(page);
    // default landing tab for a pure seller should be Buying (empty) per split semantics
    const buySideEmpty = st.includes('no buying orders yet');
    await clickChip(page, 'Selling'); await page.waitForTimeout(1000);
    st = await dumpText(page);
    const snums = [...new Set(await visibleNums(page))].sort();
    const wantSeller = expSeller.map(e => e.num).sort();
    const labelsOk = expSeller.every(e => st.includes(e.stamp) && st.includes(e.total));
    rec('A10-seller-role-split-and-labels-live', slanded && JSON.stringify(snums) === JSON.stringify(wantSeller) && labelsOk,
      `landed=${slanded} defaultBuyEmpty=${buySideEmpty} selling=[${snums}] want=[${wantSeller}] stamps+totals ok=${labelsOk}`,
      await shot(page, '768', 'a10-seller-selling'));
    await L.closeVideo(ctx, `${ROOT}/e2e/videos/${UNIT}-sk14-768.webm`);
  }

  // ---------- wrap ----------
  const broken = OUT.attacks.filter(a => a.result === 'BROKEN');
  fs.writeFileSync(`${ROOT}/e2e/tmp/AU-034-sk14-out.json`, JSON.stringify(OUT, null, 1));
  log('DONE attacks=', OUT.attacks.length, 'broken=', broken.length);
  for (const b of broken) log('BROKEN:', b.attack, '::', b.detail);
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

// ---- helpers ----
function hasCrash(t) { return /unhandled|exception|renderflex overflowed|error:/i.test(t); }
