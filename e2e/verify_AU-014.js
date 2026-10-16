// verify_AU-014.js — AU-014 qty_stepper_stock_cap (P0). Reference /product/[id].
// Criteria: stepper capped at productQuantity; "{n} available · {sold} sold" matches
// sandbox values; over-cap impossible (add-to-cart rejects).
// Frozen bundle http://localhost:9106 (sha 1490456). Reference :3000 is the judge.
//
// NAVIGATION REALITY (probed): :9106 is plain http.server — /product/N deep links 404.
// In-app path only: Home → Search IconButton fires query → results grid → tap card → detail.
const L = require('./lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9106';
const REF = 'http://localhost:3000';
const API = 'http://localhost:8083';
const UNIT = 'AU-014';
const SHOTS = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-014';
const VDIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos';
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(VDIR, { recursive: true });

const P1 = { id: 611, name: 'CeraVe Intensive Moisturising Lotion', qty: 6 };  // small stock
const P2 = { id: 599, name: 'Itel 2160', qty: 100 };
const log = (...a) => console.log('[au014]', ...a);
const R = {
  freshness: null, images: {}, clicks: [], asserts: [],
  buttonsTotal: 0, buttonsOk: 0, buttonsFailed: [], stateAsserts: 0,
  navAsserts: 0, dataAsserts: 0, visionFindings: [], consoleErrors: [],
  parity: { blocker: 0, major: 0, minor: 0, accepted: 0 }, failures: [], shots: [],
};

// ---------- in-app helpers (proven in verify_AU-020_021.js) ----------
async function searchOpen(page, query) {
  await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(page, 'Buy now', 45000);
  let opened = false;
  for (let i = 0; i < 4 && !opened; i++) { opened = await L.clickBtn(page, 'Search'); if (opened) await page.waitForTimeout(1200); }
  if (!opened) return false;
  const si = page.locator('input[type="text"]').first();
  await si.click({ force: true }).catch(() => {});
  await page.keyboard.type(query, { delay: 30 });
  await page.waitForTimeout(600);
  await L.clickBtn(page, 'Search');
  await page.waitForTimeout(3000);
  return true;
}
async function tapText(page, frag, maxScroll = 12) {
  for (let i = 0; i < maxScroll; i++) {
    const pos = await page.evaluate((f) => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        const txt = e.textContent || '';
        if (txt.indexOf(f) === -1 || e.getAttribute('flt-tappable') === null) return;
        const r = e.getBoundingClientRect();
        if (r.width < 40 || r.height < 40) return;
        if (!best || r.width * r.height < best.area)
          best = { y: r.y, h: r.height, cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height };
      });
      return best;
    }, frag);
    if (pos && pos.y > 55 && (pos.y + pos.h) < 608) {
      await page.mouse.click(pos.cx, pos.cy); await page.waitForTimeout(900); return true;
    }
    await page.mouse.move(190, 400); await page.mouse.wheel(0, 300); await page.waitForTimeout(380);
  }
  return false;
}
async function tapButton(page, label, vh = 667) {
  for (let i = 0; i < 10; i++) {
    const pos = await page.evaluate((lbl) => {
      let best = null;
      document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
        const txt = (e.textContent || '').trim();
        if (!txt.includes(lbl)) return;
        const r = e.getBoundingClientRect();
        if (r.width < 20 || r.height < 15) return;
        if (!best || r.width * r.height < best.area)
          best = { x: r.x, y: r.y, h: r.height, cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height };
      });
      return best;
    }, label);
    if (pos) {
      if ((pos.y + pos.h) < vh - 25 && pos.y >= -1) {
        await page.mouse.click(pos.cx, Math.max(pos.cy, 12)); await page.waitForTimeout(800); return true;
      }
    }
    await page.mouse.move(190, 400); await page.mouse.wheel(0, 280); await page.waitForTimeout(350);
  }
  try { await L.btn(page, label.slice(0, 22)).click({ force: true, timeout: 4000 }); await page.waitForTimeout(600); return true; }
  catch (e) { return false; }
}
// qty shown by the stepper = the standalone integer a11y node nearest the +/- icons.
function qtyValues(txt) { return txt.split('\n').map(s => s.trim()).filter(s => /^\d{1,4}$/.test(s)).map(Number); }

(async () => {
  const t0 = Date.now();

  // ---------- (1) FRESHNESS ----------
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified') || '';
  R.freshness = { status: head.status, lastModified: lm, ok: lm === 'Sun, 23 Aug 2026 19:12:37 GMT' };
  log('freshness', JSON.stringify(R.freshness));
  if (!R.freshness.ok) { console.log('BLOCKED-stale-build'); process.exit(3); }

  // ---------- (2) REAL DATA probe ----------
  const d1 = await fetch(API + '/api/v1/displayItem/itemDetails/' + P1.id).then(r => r.json());
  const d2 = await fetch(API + '/api/v1/displayItem/itemDetails/' + P2.id).then(r => r.json());
  P1.qty = d1.productQuantity; P2.qty = d2.productQuantity;
  R.dataAsserts += 2;
  const probeOk = d1.productId === P1.id && P1.qty > 1 && P2.qty > 1;
  log('probe', JSON.stringify({ p1: { id: P1.id, qty: P1.qty, sold: d1.soldQuantity }, p2: { id: P2.id, qty: P2.qty } }));
  if (!probeOk) R.failures.push('backend-probe: unexpected itemDetails shape');

  // reference-side real data (its own dev backend — different dataset, sanctioned read-only browse)
  const refList = await fetch(REF + '/api/v1/products/get-all-products?page=0&size=40').then(r => r.json());
  const refProd = (refList.content || []).find(p => p.productStatus === 'APPROVED' && p.productQuantity >= 3 && p.productQuantity <= 60 && (p.soldQuantity | 0) === 0);
  if (!refProd) R.failures.push('reference-probe: no suitable APPROVED product on :3000');
  else log('ref probe', JSON.stringify({ id: refProd.productId, name: refProd.productName.slice(0, 26), qty: refProd.productQuantity, sold: refProd.soldQuantity }));

  // ---------- (5) SHOT helper ----------
  const shot = async (p, vp, name) => { const f = `${SHOTS}/flutter-${vp}-${name}.png`; await L.screenshot(p, f); R.shots.push(f); };

  const browser = await L.newBrowser();

  for (const VP of [{ w: 375, h: 667, n: '375' }, { w: 768, h: 1024, n: '768' }]) {
    const vpath = VDIR + `/${UNIT}-${VP.n}.webm`;
    const ctx = await L.newCtx(browser, { viewport: { width: VP.w, height: VP.h }, videoPath: vpath });
    const p = await ctx.newPage();
    p.on('pageerror', e => R.consoleErrors.push(VP.n + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') R.consoleErrors.push(VP.n + ' console: ' + m.text().slice(0, 150)); });
    Object.assign(R.images, L.watchImages(p));
    p.on('request', rq => { if (/itemDetails\/\d+/.test(rq.url())) R.navAsserts++; });

    // ---- open detail via real UI path ----
    const openedSearch = await searchOpen(p, P1.name);
    const resultsShown = (await L.allText(p)).includes(P1.name.slice(0, 18));
    let tapped = false, onDetail = false;
    if (resultsShown) {
      tapped = await tapText(p, P1.name.slice(0, 16));
      await page_wait(p, 1800);
      onDetail = /Add to cart/i.test(await L.allText(p));
    }
    R.navAsserts++;
    log(`[${VP.n}] search=${openedSearch} results=${resultsShown} tapped=${tapped} detail=${onDetail}`);
    if (!onDetail) {
      R.failures.push(`${VP.n}: could not open detail for ${P1.name} via search`);
      await shot(p, VP.n, 'nav-failed');
      await ctx.close(); continue;
    }
    await shot(p, VP.n, 'detail-loaded');

    // ---- REAL DATA: availability line present and matching sandbox values ----
    let txt = await L.allText(p);
    const availRe = new RegExp(`${P1.qty}\\s*available`);
    const soldSeg = /\d+\s*sold/;
    const availFound = availRe.test(txt), soldFound = soldSeg.test(txt);
    R.stateAsserts++;
    R.asserts.push({ unit: UNIT, check: `avail_text_${VP.n}`, expected: `"${P1.qty} available" (+ "· N sold")`, actual: availFound ? 'found' : 'ABSENT', ok: availFound });
    log(`[${VP.n}] "${P1.qty} available"=${availFound} "<n> sold" segment=${soldFound}`);

    // ---- CLICKS: enumerate all controls on detail ----
    const ctrls = await listCtrls(p);
    log(`[${VP.n}] controls`, JSON.stringify(ctrls.map(c => c.kind + ':' + c.label.slice(0, 28))));

    // ---- STEPPER CAP: click "+" up to 15 times; displayed qty must never exceed stock ----
    const beforeVals = qtyValues(txt);
    let clicks = 0, maxSeen = Math.max(...beforeVals.filter(v => v <= P1.qty + 50), 0);
    for (let i = 0; i < 15; i++) {
      const did = await tapPlus(p);
      if (!did) break;
      clicks++;
      await page_wait(p, 350);
      const t = await L.allText(p);
      const vals = qtyValues(t).filter(v => v < 10000);
      if (vals.length) maxSeen = Math.max(maxSeen, ...vals);
      if (/Only \d+ units? (are|is) available/.test(t)) break;   // rejection toast appeared
    }
    await shot(p, VP.n, `after-plus-x${clicks}`);
    const capHeld = maxSeen <= P1.qty;
    R.stateAsserts++;
    R.asserts.push({
      unit: UNIT, check: `stepper_cap_${VP.n}`,
      expected: `<= ${P1.qty} (productQuantity) after ${clicks} "+" clicks`,
      actual: `max displayed qty = ${maxSeen}`, ok: capHeld,
    });
    log(`[${VP.n}] cap: clicked + ${clicks}x, max qty shown=${maxSeen}, stock=${P1.qty}, held=${capHeld}`);

    // ---- OVER-CAP impossible: add-to-cart at capped/over qty must NOT accept ----
    let addedTxt = '', addClicked = false, toastTxt = null;
    if (maxSeen >= P1.qty) {           // only meaningful when we actually reached the cap
      addClicked = await tapButton(p, 'Add to cart', VP.h);
      await page_wait(p, 1500);
      addedTxt = await L.allText(p);
      await shot(p, VP.n, 'after-addtocart');
      const accepted = /Added to cart/.test(addedTxt);
      const toastM = addedTxt.match(/Only \d+ units? (?:are|is) available for this item\./);
      toastTxt = toastM ? toastM[0] : null;
      R.stateAsserts++;
      R.asserts.push({
        unit: UNIT, check: `overcap_add_${VP.n}`,
        expected: `rejection toast when qty>=stock (clicked=${addClicked})`,
        actual: accepted ? 'ACCEPTED (BUG)' : (toastTxt || 'no-toast/no-effect'),
        ok: !accepted && !!toastTxt,
      });
      log(`[${VP.n}] overcap add: clicked=${addClicked} accepted=${accepted} toast="${toastTxt}"`);
    }

    // ---- second product (different stock value) sanity ----
    const o2 = await searchOpen(p, P2.name);
    const shown2 = (await L.allText(p)).includes(P2.name.slice(0, 16));
    let onDetail2 = false, avail2 = false;
    if (shown2) {
      await tapText(p, P2.name.slice(0, 14));
      await page_wait(p, 1800);
      const t2 = await L.allText(p);
      onDetail2 = /Add to cart/i.test(t2);
      avail2 = new RegExp(`${P2.qty}\\s*available`).test(t2);
      await shot(p, VP.n, 'product-599');
    }
    R.stateAsserts++;
    R.asserts.push({ unit: UNIT, check: `prod2_${VP.n}`, expected: `detail loads + "${P2.qty} available"`, actual: `detail=${onDetail2} availLine=${avail2}`, ok: onDetail2 && avail2 });
    log(`[${VP.n}] prod2: detail=${onDetail2} "${P2.qty} available"=${avail2}`);

    // ---- IMAGES reconcile for this viewport ----
    const vals = Object.values(R.images);
    R.asserts.push({ unit: UNIT, check: `images_${VP.n}`, expected: 'all /uploads|assets image responses HTTP 200/304', actual: `total=${vals.length} ok=${vals.filter(s => s === 200 || s === 304).length} failed=${vals.filter(s => s >= 400).length}`, ok: vals.every(s => s === 200 || s === 304) });

    await L.closeVideo(ctx, vpath);
  }

  // ---------- (7) PARITY on :3000 (same viewport, its own backend data) ----------
  const rp = refProd || { productId: 0, productName: 'none', productQuantity: 1 };
  for (const vp of [375]) {
    const rc = await browser.newContext({ viewport: { width: vp, height: 667 } });
    const pp = await rc.newPage();
    await pp.goto(`${REF}/product/${rp.productId}`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await pp.waitForTimeout(8000);
    const rt = await pp.evaluate(() => document.body.innerText);
    const rf = `${SHOTS}/ref-${vp}-detail.png`;
    await pp.screenshot({ path: rf, fullPage: false }).catch(() => {});
    R.shots.push(rf);

    const refAvail = new RegExp(`${rp.productQuantity}\\s*available`).test(rt);
    const refSold = /\d+\s*sold/.test(rt);
    // reference stepper cap: find QuantityControl buttons (aria-label contains increment/decrement or +/-)
    let refMax = 1, refClicks = 0;
    for (let i = 0; i < 20; i++) {
      const did = await pp.evaluate(() => {
        const cands = [...document.querySelectorAll('button')].filter(b => {
          const al = (b.getAttribute('aria-label') || '') + ' ' + b.innerText;
          return /increment|\+/.test(al) && !/add to cart/i.test(al);
        });
        if (!cands.length) return false;
        cands[0].click(); return true;
      });
      if (!did) break;
      refClicks++; await pp.waitForTimeout(220);
      const cur = await pp.evaluate(() => {
        const m = document.body.innerText.match(/Quantity\s*\n?\s*(\d+)/);
        return m ? +m[1] : null;
      });
      if (cur === null) break;
      if (cur > refMax) refMax = cur; else break;   // stopped incrementing -> capped
    }
    const rf2 = `${SHOTS}/ref-${vp}-after-plus.png`;
    await pp.screenshot({ path: rf2, fullPage: false }).catch(() => {});
    R.shots.push(rf2);

    R.parity.blocker += refAvail && refSold ? 0 : 1;
    R.asserts.push({
      unit: 'REF', check: `ref_avail_line_${vp}`,
      expected: `"${rp.productQuantity} available" (+ sold seg) on :3000`,
      actual: `avail=${refAvail} soldSeg=${refSold} stepperMax=${refMax}/${rp.productQuantity}`,
      ok: refAvail,
    });
    log(`[ref] "${rp.productQuantity} available"=${refAvail} soldSeg=${refSold}; ref stepper max=${refMax} (stock ${rp.productQuantity}) after ${refClicks} clicks`);
    await rc.close();
  }

  await browser.close();
  R.runtime_ms = Date.now() - t0;
  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/tmp/AU-014-out.json', JSON.stringify(R, null, 1));
  const fails = R.asserts.filter(a => !a.ok);
  console.log('\n=== ASSERT SUMMARY === total=' + R.asserts.length + ' failed=' + fails.length);
  fails.forEach(f => console.log('FAIL ' + f.check + ': expected=' + f.expected + ' actual=' + f.actual));
})();

// ---- small local helpers ----
function page_wait(p, ms) { return p.waitForTimeout(ms); }
async function listCtrls(page) {
  return page.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const role = e.getAttribute('role'), tap = e.getAttribute('flt-tappable') === '';
      const t = (e.textContent || '').trim().slice(0, 60);
      if ((role === 'button' || tap) && t && !e.querySelector('input')) out.push({ kind: role === 'button' ? 'button' : 'tappable', label: t });
    });
    document.querySelectorAll('input').forEach(i => out.push({ kind: 'input', label: i.placeholder || i.type }));
    return out;
  });
}
async function tapPlus(page) {
  // The "+" IconButton: semantics label may be empty; find button nodes whose bbox sits right of the minus icon
  // Robust approach: the two IconButtons are adjacent siblings around the qty text node. Find the qty text node,
  // then the two button-role nodes vertically aligned with it; the one with larger x is "+".
  const target = await page.evaluate(() => {
    let qtyNode = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (qtyNode) return;
      if (/^\d{1,4}$/.test(t)) {
        const r = e.getBoundingClientRect();
        if (r.width > 0 && r.width < 120 && r.height > 0) qtyNode = { x: r.x, y: r.y, cy: r.y + r.height / 2, cx: r.x + r.width / 2, h: r.height };
      }
    });
    if (!qtyNode) return null;
    let plus = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      const r = e.getBoundingClientRect();
      const sameRow = Math.abs((r.y + r.height / 2) - qtyNode.cy) < Math.max(24, qtyNode.h * 0.9);
      const rightSide = (r.x + r.width / 2) > qtyNode.cx;
      if (sameRow && rightSide && r.width > 10 && r.height > 10 && (!plus || r.x < plus.x)) plus = { cx: r.x + r.width / 2, cy: r.y + r.height / 2, x: r.x };
    });
    return plus;
  });
  if (!target) return false;
  await page.mouse.click(target.cx, Math.max(target.cy, 10));
  return true;
}
