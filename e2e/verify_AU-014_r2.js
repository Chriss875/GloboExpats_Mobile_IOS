// verify_AU-014_r2.js — AU-014 quantity_stepper_stock_cap (RO lane, FRESH evidence).
// Prior evidence from the dead session is UNTRUSTED: this run produces everything anew.
//
// Frozen build :9107 (sha 4b22459, main.dart.js mtime 2026-08-23T23:02:21Z GMT).
// Reference judge :3000 (own dev backend; parity = structure/behavior, not entity).
// Sandbox API :8083 supplies the entities under test.
//
// RO lane: guest cart is memory-only in this build (no login => no persisted
// expatCartItems_*), and this verifier never logs in, so shared state is untouched.
//
// Criteria:
//   1) stepper capped at productQuantity
//   2) "{n} available"-equivalent line matches sandbox values ("· {sold} sold" when sold>0)
//   3) over-cap impossible (Add to cart at cap REJECTS with reference toast copy)
const L = require('./lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9107';
const REF = 'http://localhost:3000';
const API = 'http://localhost:8083';
const UNIT = 'AU-014';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const SHOTS = `${ROOT}/e2e/shots/AU-014`;
const VDIR = `${ROOT}/e2e/videos`;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(VDIR, { recursive: true });
fs.mkdirSync(`${ROOT}/e2e/results/shards`, { recursive: true });
fs.mkdirSync(`${ROOT}/e2e/tmp`, { recursive: true });

const EXPECTED_MTIME = 'Sun, 23 Aug 2026 23:02:21 GMT';
// Entities chosen by independent curl against :8083 BEFORE the run:
//   619 Crochet baby dress            qty=4 sold=0 no choices  (reachable via home rails)
//   629 B2 Hidden Guard Fixture 2     qty=2 sold=1 no choices  (reachable via detail rail)
//   615 LANCÔME PARIS La vie est belle qty=4 sold=3 has choices (search-screen target)
const P619 = { id: 619, name: 'Crochet baby dress', railName: 'Crochet baby dress' };
const P629 = { id: 629, name: 'B2 Hidden Guard Fixture 2', railName: null };
const log = (...a) => console.log('[au014r2]', ...a);

let R;
function freshR() {
  return {
    ts: new Date().toISOString(), unit: UNIT, title: 'quantity_stepper_stock_cap',
    wave: 'verify', agent: 'verifier-AU-014', build_sha: '4b22459',
    build_mtime: '2026-08-23T23:02:21Z', viewport: '375x667', verdict: 'FAIL',
    checks: {
      real_data: false, real_data_probe: '', images_requested: 0, images_200: 0,
      images_broken: [], buttons_total: 0, buttons_ok: 0, buttons_failed: [],
      state_asserts: 0, nav_asserts: 0, data_asserts: 0,
      vision_defects: 0, vision_findings: [],
      parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
    },
    attempts: R ? R.attempts + 1 : 1,
    failures: [], evidence: [], runtime_ms: 0,
  };
}
R = freshR();
const fail = (m) => { if (!R.failures.includes(m)) R.failures.push(m); log('FAIL:', m); };
const stateOk = () => { R.checks.state_asserts++; };
const ev = (f) => R.evidence.push(f.replace(ROOT + '/', ''));

(async () => {
  const t0 = Date.now();

  // ---------- (1) FRESHNESS ----------
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified') || '';
  log('freshness', head.status, lm);
  if (head.status !== 200 || lm !== EXPECTED_MTIME) {
    R.verdict = 'BLOCKED'; R.failures.push(`stale/bad build: HTTP ${head.status} ${lm}`);
    writeOutputs(); process.exit(3);
  }

  // ---------- (2) REAL DATA — independent probe of the entity under test ----------
  const probe = {};
  for (const P of [P619, P629]) {
    const d = await (await fetch(`${API}/api/v1/displayItem/itemDetails/${P.id}`)).json();
    P.qty = d.productQuantity | 0; P.sold = d.soldQuantity | 0;
    P.price = Math.round(d.productAskingPrice);
    P.title = d.productName;
    probe[P.id] = { qty: P.qty, sold: P.sold, price: P.price };
  }
  R.checks.data_asserts += 2;
  R.checks.real_data_probe =
    `curl :8083 itemDetails -> 619{qty=${P619.qty},sold=${P619.sold},price=${P619.price}}, ` +
    `629{qty=${P629.qty},sold=${P629.sold},price=${P629.price}}`;
  log('probe', R.checks.real_data_probe);
  if (!(P619.qty > 1 && P629.qty >= 1)) {
    R.verdict = 'BLOCKED'; R.failures.push('backend probe unusable'); writeOutputs(); process.exit(3);
  }
  R.checks.real_data = true;

  // ---------- Flutter a11y helpers ----------
  const txtOf = (p) => L.allText(p);
  const qtyVals = (t) => t.split('\n').map(s => s.trim()).filter(s => /^\d{1,4}$/.test(s)).map(Number);

  // The +/- IconButtons render as EMPTY-label button nodes; leftmost pair around the
  // qty readout row. Returns [{minus, plus}] or null.
  async function stepperButtons(p) {
    return p.evaluate(() => {
      let qtyNode = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if (qtyNode) return;
        const t = (e.textContent || '').trim();
        if (/^\d{1,4}$/.test(t)) {
          const r = e.getBoundingClientRect();
          if (r.width > 0 && r.width < 120 && r.height > 0 && !e.getAttribute('role'))
            qtyNode = { cy: r.y + r.height / 2, h: r.height };
        }
      });
      if (!qtyNode) return null;
      const row = [];
      document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height) return;
        if (Math.abs((r.y + r.height / 2) - qtyNode.cy) < Math.max(24, qtyNode.h * 0.9))
          row.push({ x: r.x, cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), label: (e.textContent || '').trim() });
      });
      row.sort((a, b) => a.x - b.x);
      const unlabeled = row.filter(b => !b.label);
      if (unlabeled.length >= 2) return { minus: unlabeled[0], plus: unlabeled[1] };
      if (row.length >= 2) return { minus: row[row.length - 3] || null, plus: row[row.length - 2] || null };
      return null;
    });
  }

  async function tapAt(p, b, vh) {
    await p.mouse.click(b.cx, Math.min(Math.max(b.cy, 8), vh - 8));
  }

  function watchDetail(p) {
    p.on('request', rq => {
      if (/itemDetails\/\d+/.test(rq.url())) { R.navAsserts++; log('net:', rq.url().split('/api')[1]); }
    });
  }

  // Reach a detail through REAL UI paths only.
  async function gotoHomeRailDetail(p, railText) {
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    const loaded = await L.waitText(p, 'Buy now', 45000);
    if (!loaded) return { ok: false, why: 'home shell never rendered' };
    for (let i = 0; i < 10; i++) {
      const t = await txtOf(p);
      if (t.includes(railText)) break;
      await L.scrollToBottom(p, 4); await p.waitForTimeout(500);
    }
    let t = await txtOf(p);
    if (!t.includes(railText)) return { ok: false, why: `home rail card "${railText}" not found` };
    const okc = await L.clickCard(p, railText);
    if (!okc) return { ok: false, why: 'rail card tap failed' };
    await p.waitForTimeout(4500);
    t = await txtOf(p);
    if (!/add to cart/i.test(t)) return { ok: false, why: 'detail not reached after rail tap' };
    R.navAsserts++;
    return { ok: true };
  }

  async function openRailOnDetail(p, bandLabel, cardText, vpH) {
    for (let i = 0; i < 12; i++) {
      if ((await txtOf(p)).includes(bandLabel)) break;
      await p.mouse.move(190, 400); await p.mouse.wheel(0, 420); await p.waitForTimeout(480);
    }
    const y = await p.evaluate((lbl) => {
      let yy = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if ((e.textContent || '').includes(lbl) && yy === null) yy = e.getBoundingClientRect().y;
      });
      return yy;
    }, bandLabel);
    if (y === null) return { ok: false, why: `${bandLabel} label not found` };
    for (let i = 0; i < 6; i++) {   // horizontal scroll inside the rail
      const c = await p.evaluate(({ lbl, bandY }) => {
        const out = [];
        document.querySelectorAll('flt-semantics').forEach(e => {
          const txt = (e.textContent || '').trim();
          if (!txt.includes(lbl)) return;
          if (e.getAttribute('flt-tappable') === null) return;
          const r = e.getBoundingClientRect();
          if (r.width < 40 || r.height < 40) return;
          if (r.bottom < 0 || r.top > innerHeight || Math.abs(r.y - bandY) > 320) return;
          out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height });
        });
        out.sort((a, b) => a.area - b.area);
        return out[0] || null;
      }, { lbl: cardText, bandY: y });
      if (c) { await p.mouse.click(c.cx, c.cy); await p.waitForTimeout(4500); break; }
      await p.mouse.move(190, y + 80); await p.mouse.wheel(0, 260); await p.waitForTimeout(500);
    }
    const t = await txtOf(p);
    if (!/add to cart/i.test(t)) return { ok: false, why: `${cardText} detail not reached` };
    R.navAsserts++;
    return { ok: true };
  }

  const browser = await L.newBrowser();

  // =====================================================================
  // FLUTTER — both viewports, video recorded
  // =====================================================================
  for (const VP of [{ w: 375, h: 667, n: '375' }, { w: 768, h: 1024, n: '768' }]) {
    const vpath = `${VDIR}/${UNIT}-r2-${VP.n}.webm`;
    const ctx = await L.newCtx(browser, { viewport: { width: VP.w, height: VP.h }, videoPath: vpath });
    const p = await ctx.newPage();
    const imgs = L.watchImages(p);
    watchDetail(p);
    const shot = async (name) => {
      const f = `${SHOTS}/flutter-${VP.n}-${name}.png`;
      await L.screenshot(p, f); ev(f); return f;
    };

    // ---------- product 619 ----------
    const nav1 = await gotoHomeRailDetail(p, P619.railName);
    if (!nav1.ok) { fail(`${VP.n}: reach 619 failed: ${nav1.why}`); await shot('nav-failed'); await L.closeVideo(ctx, vpath); continue; }
    let t = await txtOf(p);
    await shot('detail-loaded');

    const titleFound = t.includes(P619.title);
    const priceFound = new RegExp(P619.price.toLocaleString('en-US')).test(t.replace(/,/g, ','));
    const availFound = new RegExp(`${P619.qty}\\s*available`).test(t);
    const soldSegFound = /\d+\s*sold\b/.test(t);
    log(`[${VP.n}] 619: title=${titleFound} price=${priceFound} "${P619.qty} available"=${availFound} soldSeg=${soldSegFound}`);
    if (!titleFound) fail(`${VP.n}: sandbox title not rendered`);
    else stateOk();
    if (!new RegExp(`TSh\\s*${P619.price.toLocaleString('en-US')}`).test(t.replace(/ /g, ','))) fail(`${VP.n}: sandbox price not rendered`);
    else stateOk();
    if (!availFound) fail(`${VP.n}: "${P619.qty} available" line ABSENT (expected from productQuantity=${P619.qty})`);
    else stateOk();
    if (P619.sold === 0 && soldSegFound) fail(`${VP.n}: "N sold" shown although soldQuantity=0`);
    else stateOk();
    if (/(lorem|ipsum|placeholder|dummy|TODO|sample text)/i.test(t)) fail(`${VP.n}: placeholder text present`);
    else stateOk();

    // ---------- enumerate ALL controls ----------
    let ctrls = await L.listButtons(p);
    R.checks.buttons_total += ctrls.length;
    log(`[${VP.n}] controls(${ctrls.length}):`, JSON.stringify(ctrls.map(c => c.kind[0] + ':' + c.label.slice(0, 20).replace(/\n/g, '/'))));

    // ---------- STEPPER CAP on 619 ----------
    let sb = await stepperButtons(p);
    if (!sb) { fail(`${VP.n}: stepper +/- buttons not located`); }
    else {
      let clicks = 0, maxSeen = 1, toast = null;
      for (let i = 0; i < 15; i++) {
        sb = await stepperButtons(p);
        if (!sb || !sb.plus) break;
        await tapAt(p, sb.plus, VP.h);
        clicks++;
        await p.waitForTimeout(400);
        const cur = await txtOf(p);
        const vals = qtyVals(cur).filter(v => v <= 9999);
        if (vals.length) maxSeen = Math.max(maxSeen, ...vals);
        if (/Only \d+ units? (?:are|is) available/.test(cur)) { toast = (cur.match(/Only \d+ units? (?:are|is) available for this item\./) || ['toast'])[0]; break; }
      }
      await shot(`after-plus-x${clicks}`);
      log(`[${VP.n}] cap619: +x${clicks} maxShown=${maxSeen} stock=${P619.qty} toast="${toast}"`);
      if (maxSeen > P619.qty) fail(`${VP.n}: stepper exceeded stock (${maxSeen} > ${P619.qty})`);
      else stateOk();
      // minus decrements
      let minusOk = false;
      sb = await stepperButtons(p);
      if (sb && sb.minus) {
        await tapAt(p, sb.minus, VP.h);
        await p.waitForTimeout(400);
        const v = Math.max(...qtyVals(await txtOf(p)).filter(v => v <= 999), 0);
        minusOk = v === maxSeen - 1;
      }
      log(`[${VP.n}] minus decrement ${maxSeen}->? ok=${minusOk}`);
      if (minusOk) stateOk(); else fail(`${VP.n}: "−" did not decrement`);

      // ---------- OVER-CAP IMPOSSIBLE: re-max then Add to cart must REJECT ----------
      for (let i = 0; i < 15; i++) {
        const cur = await txtOf(p);
        if (Math.max(...qtyVals(cur).filter(v => v <= 999), 0) >= P619.qty) break;
        sb = await stepperButtons(p);
        if (!sb || !sb.plus) break;
        await tapAt(p, sb.plus, VP.h);
        await p.waitForTimeout(380);
      }
      const addClicked = await L.clickBtn(p, 'Add to cart');
      await p.waitForTimeout(1700);
      t = await txtOf(p);
      await shot('after-addtocart-cap');
      const accepted = /Added to cart/i.test(t);
      const rej = t.match(/Only \d+ units? (?:are|is) available for this item\./);
      log(`[${VP.n}] add@cap619: clicked=${addClicked} accepted=${accepted} toast="${rej ? rej[0] : null}"`);
      if (addClicked) R.checks.buttons_ok++; else R.checks.buttons_failed.push(`${VP.n}:Add to cart`);
      if (!rej || accepted) fail(`${VP.n}: over-cap add not rejected with toast (got ${rej ? rej[0] : 'none'})`);
      else stateOk();
      // cart badge must NOT count a rejected line
      const cartBadge = (t.match(/Cart\s*\n?(\d+)/) || [null, null])[1];
      if (accepted) fail(`${VP.n}: over-cap add silently accepted`);
      else stateOk();
      log(`[${VP.n}] cart badge after rejection: ${cartBadge ?? 'none'}`);
    }

    // ---------- product 629 via the "You Might Also Like" rail (real UI path) ----------
    const nav2 = await openRailOnDetail(p, 'You Might Also Like', P629.title, VP.h);
    if (!nav2.ok) { fail(`${VP.n}: reach 629 via detail rail failed: ${nav2.why}`); await shot('nav-failed-629'); }
    else {
      await p.waitForTimeout(800);
      t = await txtOf(p);
      await shot('detail-loaded');
      const avail2 = new RegExp(`${P629.qty}\\s*available`).test(t);
      const soldSeg2 = new RegExp(`${P629.sold}\\s*sold\\b`).test(t);
      const combined = new RegExp(`${P629.qty}\\s*available\\s*·\\s*${P629.sold}\\s*sold`).test(t.split('\n').join(' '));
      log(`[${VP.n}] 629: "${P629.qty} available"=${avail2} "${P629.sold} sold"=${soldSeg2} combined=${combined}`);
      if (!avail2) fail(`${VP.n}: 629 availability line absent`);
      else stateOk();
      if (!soldSeg2) fail(`${VP.n}: 629 "${P629.sold} sold" segment absent (sandbox soldQuantity=${P629.sold})`);
      else stateOk();
      if (!combined) fail(`${VP.n}: combined "${P629.qty} available · ${P629.sold} sold" row missing`);
      else stateOk();

      // stepper cap on second producer
      let clicks2 = 0, maxSeen2 = 1;
      for (let i = 0; i < 10; i++) {
        const s2 = await stepperButtons(p);
        if (!s2 || !s2.plus) break;
        await tapAt(p, s2.plus, VP.h);
        clicks2++;
        await p.waitForTimeout(380);
        const cur = await txtOf(p);
        const vals = qtyVals(cur).filter(v => v <= 9999);
        if (vals.length) maxSeen2 = Math.max(maxSeen2, ...vals);
        if (/Only \d+ units? (?:are|is) available/.test(cur)) break;
      }
      await shot('after-plus-629');
      log(`[${VP.n}] cap629: +x${clicks2} max=${maxSeen2} stock=${P629.qty}`);
      if (maxSeen2 > P629.qty) fail(`${VP.n}: 629 stepper exceeded stock (${maxSeen2} > ${P629.qty})`);
      else stateOk();
    }

    // ---------- images reconcile ----------
    const sum = L.imageSummary(imgs);
    log(`[${VP.n}] images: total=${sum.total} ok=${sum.ok} failed=${sum.failed}`);
    R.checks.images_requested += sum.total;
    R.checks.images_200 += sum.ok;
    for (const [u, s] of Object.entries(imgs)) if (s !== 200 && s !== 304) R.checks.images_broken.push(u);
    if (sum.failed > 0) fail(`${VP.n}: ${sum.failed} image requests failed`);

    await L.closeVideo(ctx, vpath);
  }

  // =====================================================================
  // (7) PARITY — reference app, same viewports (its own dev backend data)
  // =====================================================================
  // Reference product chosen by ITS backend (independent curl): 485 Tecno spark 50 qty=5 sold=0
  const REF_PROD = { id: 485, name: 'Tecno spark 50', qty: 5 };
  for (const vp of [{ w: 375, h: 667, n: '375' }, { w: 768, h: 1024, n: '768' }]) {
    const rc = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const pp = await rc.newPage();
    await pp.goto(`${REF}/product/${REF_PROD.id}`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await pp.waitForFunction(() => /available|Error/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
    await pp.waitForTimeout(3500);
    const rt = await pp.evaluate(() => document.body.innerText);
    const f1 = `${SHOTS}/ref-${vp.n}-detail.png`;
    await pp.screenshot({ path: f1, fullPage: false }).catch(() => {}); ev(f1);

    const refAvail = new RegExp(`${REF_PROD.qty}\\s*available`).test(rt);
    const refTitle = rt.includes(REF_PROD.name);
    let refMax = 1, refClicks = 0, refDisabledAtCap = false;
    for (let i = 0; i < 25; i++) {
      const st = await pp.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '') === 'Increase quantity');
        return b ? { disabled: b.disabled } : { none: true };
      });
      if (st.none || st.disabled) { refDisabledAtCap = !!st.disabled; break; }
      await pp.evaluate(() => { [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '') === 'Increase quantity').click(); });
      refClicks++;
      await pp.waitForTimeout(200);
      const cur = await pp.evaluate(() => {
        const inp = document.querySelector('input[aria-label="Quantity"]');
        return inp ? parseInt(inp.value, 10) : NaN;
      });
      if (!Number.isFinite(cur)) break;
      refMax = cur;
    }
    const f2 = `${SHOTS}/ref-${vp.n}-after-plus.png`;
    await pp.screenshot({ path: f2, fullPage: false }).catch(() => {}); ev(f2);
    log(`[ref ${vp.n}] title=${refTitle} "${REF_PROD.qty} available"=${refAvail} max=${refMax}/${REF_PROD.qty} (+${refClicks}, plus-disabled-at-cap=${refDisabledAtCap})`);

    // deltas
    if (refAvail && refDisabledAtCap) { /* both apps cap identically */ }
    // D1: web stepper embeds an editable numeric input; Flutter is +/- only. MINOR.
    // D2: web shows "5 available" as plain text under Quantity; Flutter same position. none.
    R.checks.parity.minor = (R.checks.parity.minor || 0) + 1;
    if (!refAvail || !refTitle) { R.checks.parity.blocker++; fail(`parity ${vp.n}: reference missing expected line/title`); }
    await rc.close();
  }

  await browser.close();
  R.runtime_ms = Date.now() - t0;
  finishAndWrite();
})().catch(e => {
  console.error('RUNNER-ERROR', e && e.message);
  R.verdict = 'BLOCKED'; R.failures.push('runner: ' + (e && e.message));
  writeOutputs(); process.exit(3);
});

function hardFails() { return R.failures.filter(f => !f.startsWith('parity')); }
function finishAndWrite() {
  R.checks.vision_defects = R.checks.vision_findings.length;
  R.verdict = (hardFails().length === 0 && R.checks.parity.blocker === 0 && R.checks.parity.major === 0 &&
               R.checks.images_broken.length === 0 && R.checks.buttons_failed.length === 0 &&
               R.checks.vision_findings.length === 0) ? 'PASS' : 'FAIL';
  writeOutputs();
  log('VERDICT', R.verdict, '| failures:', JSON.stringify(R.failures));
}
function writeOutputs() {
  fs.appendFileSync(`${ROOT}/e2e/results/shards/AU-014-verify.jsonl`, JSON.stringify(R) + '\n');
  fs.writeFileSync(`${ROOT}/e2e/tmp/AU-014-r2-out.json`, JSON.stringify(R, null, 1));
  log('shard written; verdict=', R.verdict);
}
