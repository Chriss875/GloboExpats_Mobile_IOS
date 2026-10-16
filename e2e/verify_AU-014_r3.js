// verify_AU-014_r3.js — AU-014 qty_stepper_stock_cap RE-VERIFY after fix 23b2ab4.
// Frozen build under test: http://localhost:9108 (sha 16b9b33,
// main.dart.js mtime Mon, 24 Aug 2026 00:36:38 GMT) — contains 23b2ab4
// (+ disabled at cap, "{n} available · {sold} sold" readout).
// Judge: Next.js reference http://localhost:3000 (same sandbox data).
// Sandbox API http://localhost:8083 supplies entities (probed BEFORE the run):
//   619 Crochet baby dress            qty=4 sold=0 imgs=3 whatsapp=yes (home rail)
//   629 B2 Hidden Guard Fixture 2     qty=2 sold=0 imgs=0 (related rail on 619)
//   615 LANCÔME PARIS La vie est belle qty=4 sold=3 imgs=1 whatsapp=yes (search screen)
// RO lane: this run never logs in (guest cart is memory-only) — shared state untouched.
const L = require('./lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9108';
const REF = 'http://localhost:3000';
const API = 'http://localhost:8083';
const UNIT = 'AU-014';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const SHOTS = `${ROOT}/e2e/shots/AU-014`;
const VDIR = `${ROOT}/e2e/videos`;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(VDIR, { recursive: true });
fs.mkdirSync(`${ROOT}/e2e/results/shards`, { recursive: true });

// Bundle is REBUILT by the builder lane as commits land; freshness here means
// (a) the served bundle still CONTAINS the 23b2ab4 fix artifacts and
// (b) it was produced at/after this verification wave started.
const MIN_MTIME_EPOCH = Date.parse('2026-08-24T00:36:38Z');
const BUILD_SHA = '701473b'; // git HEAD at run time (contains 23b2ab4)

const P619 = { id: 619, name: 'Crochet baby dress', qty: 4, sold: 0, price: 53000 };
const P629 = { id: 629, name: 'B2 Hidden Guard Fixture 2', qty: 2, sold: 0, price: 9000 };
const P615 = { id: 615, name: 'LANCÔME PARIS La vie est belle', qty: 4, sold: 3, price: 626000 };

const log = (...a) => console.log('[au014r3]', ...a);

let R;
function freshR(vp) {
  return {
    ts: new Date().toISOString(), unit: UNIT, title: 'qty_stepper_stock_cap_r2',
    wave: 'verify', agent: 'verifier-AU-014-r3', build_sha: BUILD_SHA,
    build_mtime: 'set-after-freshness', viewport: vp, verdict: 'FAIL',
    checks: {
      real_data: false, real_data_probe:
        `curl :8083 itemDetails -> 619{qty=4,sold=0,price=53000}, 629{qty=2,sold=0,price=9000}, 615{qty=4,sold=3,price=626000}`,
      images_requested: 0, images_200: 0, images_broken: [],
      buttons_total: 0, buttons_ok: 0, buttons_failed: [],
      state_asserts: 0, nav_asserts: 0, data_asserts: 3,
      vision_defects: 0, vision_findings: [],
      parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
    },
    attempts: R ? R.attempts + 1 : 1,
    failures: [], evidence: [], runtime_ms: 0,
  };
}
R = freshR('375x667');
const fail = (m) => { if (!R.failures.includes(m)) R.failures.push(m); log('FAIL:', m); };
const ok = () => { R.checks.state_asserts++; };
const ev = (f) => { const rel = f.replace(ROOT + '/', ''); if (!R.evidence.includes(rel)) R.evidence.push(rel); };

(async () => {
  const t0 = Date.now();

  // ---------- (1) FRESHNESS ----------
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified') || '';
  const mtEpoch = lm ? Date.parse(lm) : NaN;
  log('freshness', head.status, lm);
  const body = await (await fetch(APP + '/main.dart.js')).text();
  const hasFix = body.includes('" available"+q') || body.includes('available"+q');
  const hasGuard = body.includes('You cannot add your own listed items');
  if (head.status !== 200 || !Number.isFinite(mtEpoch) || mtEpoch < MIN_MTIME_EPOCH || !hasFix || !hasGuard) {
    R.verdict = 'BLOCKED';
    R.failures.push(`stale/bad bundle: HTTP ${head.status} ${lm} fixStrings=${hasFix}/${hasGuard}`);
    write(); process.exit(3);
  }

  // ---------- (2) REAL DATA PROBE (already curled pre-run; re-assert in-band) ----------
  for (const P of [P619, P629, P615]) {
    const d = await (await fetch(`${API}/api/v1/displayItem/itemDetails/${P.id}`)).json();
    const q = d.productQuantity | 0, s = d.soldQuantity | 0;
    if (q !== P.qty || s !== P.sold) {
      R.verdict = 'BLOCKED'; R.failures.push(`entity ${P.id} drifted: qty=${q} sold=${s}`);
      write(); process.exit(3);
    }
  }
  R.build_mtime = new Date(mtEpoch).toISOString();
  R.checks.real_data = true;
  ok();

  // ---------- Flutter a11y helpers ----------
  const txtOf = (p) => L.allText(p);
  // standalone integer nodes == candidate qty readouts
  const qtyVals = (t) => t.split('\n').map(s => s.trim()).filter(s => /^\d{1,4}$/.test(s)).map(Number);

  async function stepperButtons(p, vh) {
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
          row.push({ x: r.x, cx: Math.round(r.x + r.width / 2), cy: Math.min(Math.max(Math.round(r.y + r.height / 2), 8), (window.innerHeight || 800) - 8), label: (e.textContent || '').trim() });
      });
      row.sort((a, b) => a.x - b.x);
      const unlabeled = row.filter(b => !b.label);
      if (unlabeled.length >= 2) return { minus: unlabeled[0], plus: unlabeled[unlabeled.length - 1] };
      if (row.length >= 2) return { minus: row[row.length - 3] || null, plus: row[row.length - 2] || null };
      return null;
    });
  }

  function watchDetail(p) {
    p.on('request', rq => {
      if (/itemDetails\/\d+/.test(rq.url())) { R.checks.nav_asserts++; log('net:', rq.url().split('/api')[1]); }
    });
  }

  async function gotoHomeRailDetail(p, railText) {
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    if (!(await L.waitText(p, 'Buy now', 45000))) return { ok: false, why: 'home shell never rendered' };
    for (let i = 0; i < 10; i++) {
      if ((await txtOf(p)).includes(railText)) break;
      await L.scrollToBottom(p, 4); await p.waitForTimeout(500);
    }
    if (!(await txtOf(p)).includes(railText)) return { ok: false, why: `rail card "${railText}" not found` };
    if (!(await L.clickCard(p, railText))) return { ok: false, why: 'rail card tap failed' };
    await p.waitForTimeout(4500);
    if (!/add to cart/i.test(await txtOf(p))) return { ok: false, why: 'detail not reached after rail tap' };
    R.checks.nav_asserts++;
    return { ok: true };
  }

  async function openRelatedOnDetail(p, bandLabel, cardText, vh = 700) {
    for (let i = 0; i < 12; i++) {
      if ((await txtOf(p)).includes(bandLabel)) break;
      await p.mouse.move(190, 400); await p.mouse.wheel(0, 420); await p.waitForTimeout(480);
    }
    let y = null;
    for (let i = 0; i < 12 && y === null; i++) {
      y = await p.evaluate((lbl) => {
        let yy = null;
        document.querySelectorAll('flt-semantics').forEach(e => {
          if ((e.textContent || '').trim() === lbl && yy === null) yy = e.getBoundingClientRect().y;
        });
        return yy;
      }, bandLabel);
      if (y === null) { await p.mouse.move(190, 400); await p.mouse.wheel(0, 420); await p.waitForTimeout(480); }
    }
    if (y === null) return { ok: false, why: `${bandLabel} label not found` };
    if (y > vh - 200 || y < 0) { await p.mouse.move(190, 400); await p.mouse.wheel(0, Math.min(y - 220, 900)); await p.waitForTimeout(600); y = await p.evaluate((lbl) => { let yy = null; document.querySelectorAll('flt-semantics').forEach(e => { if ((e.textContent || '').trim() === lbl && yy === null) yy = e.getBoundingClientRect().y; }); return yy; }, bandLabel); }
    if (y === null) return { ok: false, why: `${bandLabel} not positioned` };
    for (let i = 0; i < 7; i++) {
      const c = await p.evaluate(({ lbl, bandY }) => {
        const out = [];
        document.querySelectorAll('flt-semantics').forEach(e => {
          const txt = (e.textContent || '').trim();
          if (!txt.includes(lbl)) return;
          if (e.getAttribute('flt-tappable') === null) return;
          const r = e.getBoundingClientRect();
          if (r.width < 40 || r.height < 40) return;
          if (r.bottom < 0 || r.top > 4000 || Math.abs(r.y - bandY) > 340) return;
          out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height });
        });
        out.sort((a, b) => a.area - b.area);
        return out[0] || null;
      }, { lbl: cardText, bandY: y });
      if (c) { await p.mouse.click(c.cx, c.cy); await p.waitForTimeout(4500); break; }
      await p.mouse.move(190, y + 80); await p.mouse.wheel(0, 260); await p.waitForTimeout(500);
    }
    if (!/add to cart/i.test(await txtOf(p))) return { ok: false, why: `${cardText} detail not reached` };
    R.checks.nav_asserts++;
    return { ok: true };
  }

  // ---------- availability readout assert ----------
  function checkAvail(tag, t, P) {
    const availRe = new RegExp(`${P.qty}\\s*available`);
    const combinedRe = new RegExp(`${P.qty}\\s*available\\s*·\\s*${P.sold}\\s*sold`);
    const availFound = availRe.test(t);
    const soldSeg = new RegExp(`\\b\\d+\\s*sold\\b`).test(t);
    const wrongQty = new RegExp(`\\b(${P.qty + 1}|${P.qty + 2})\\s+available\\b`).test(t);
    log(`[${tag}] ${P.id}: "${P.qty} available"=${availFound} anySoldSeg=${soldSeg} combined=${combinedRe.test(t.replace(/\n/g, ' '))}`);
    if (!availFound) fail(`${tag}: ${P.id} "${P.qty} available" line ABSENT`);
    else ok();
    if (wrongQty) fail(`${tag}: ${P.id} wrong availability number rendered`);
    else ok();
    if (P.sold > 0) {
      if (!combinedRe.test(t.replace(/\n/g, ' '))) fail(`${tag}: ${P.id} combined "${P.qty} available · ${P.sold} sold" missing`);
      else ok();
    } else if (new RegExp(`${P.qty}\\s*available\\s*·`).test(t.replace(/\n/g, ' '))) {
      fail(`${tag}: ${P.id} shows "· N sold" although soldQuantity=0`);
    } else ok();
    return { availFound };
  }

  const browser = await L.newBrowser();
  const perVp = {};

  // =====================================================================
  // FLUTTER — both viewports, video recorded
  // =====================================================================
  for (const VP of [{ w: 375, h: 667, n: '375' }, { w: 768, h: 1024, n: '768' }]) {
    const vpath = `${VDIR}/${UNIT}-r3-${VP.n}.webm`;
    const ctx = await L.newCtx(browser, { viewport: { width: VP.w, height: VP.h }, videoPath: vpath });
    const p = await ctx.newPage();
    const imgs = L.watchImages(p);
    watchDetail(p);
    const shot = async (name) => { const f = `${SHOTS}/flutter-${VP.n}-${name}.png`; await L.screenshot(p, f); ev(f); return f; };

    // ================= product 619 via home rail =================
    const nav1 = await gotoHomeRailDetail(p, P619.name);
    if (!nav1.ok) fail(`${VP.n}: reach 619 failed: ${nav1.why}`); else ok();
    let t = await txtOf(p);
    await shot('619-loaded');
    if (!(t.includes(P619.name))) fail(`${VP.n}: 619 title not rendered`); else ok();
    if (!new RegExp(`TSh\\s*${P619.price.toLocaleString('en-US').replace(/,/g, '\\s*,?\\s?')}`).test(t))
      fail(`${VP.n}: 619 price TSh ${P619.price.toLocaleString('en-US')} absent`); else ok();
    checkAvail(VP.n, t, P619);

    // enumerate all controls
    let ctrls = await L.listButtons(p);
    R.checks.buttons_total += ctrls.length;
    log(`[${VP.n}] controls(${ctrls.length}):`, JSON.stringify(ctrls.map(c => c.kind[0] + ':' + c.label.slice(0, 18).replace(/\n/g, '/'))));

    // ---------- STEPPER CAP on 619 ----------
    let sb = await stepperButtons(p, VP.h);
    if (!sb || !sb.plus) fail(`${VP.n}: stepper +/- not located`);
    else {
      let clicks = 0, maxSeen = 1, toast = null;
      for (let i = 0; i < 15; i++) {
        sb = await stepperButtons(p, VP.h);
        if (!sb || !sb.plus) break;
        await p.mouse.click(sb.plus.cx, sb.plus.cy);
        clicks++; await p.waitForTimeout(420);
        const cur = await txtOf(p);
        const vals = qtyVals(cur).filter(v => v <= 9999);
        if (vals.length) maxSeen = Math.max(maxSeen, ...vals.filter(v => v !== P619.price / 1000));
        if (/Only \d+ units? (?:are|is) available/.test(cur)) { toast = (cur.match(/Only \d+ units? (?:are|is) available[^"»]*/) || ['toast'])[0].trim(); break; }
      }
      await shot('619-plus-x' + clicks);
      log(`[${VP.n}] cap619: +x${clicks} maxShown=${maxSeen} stock=${P619.qty}`);
      if (maxSeen > P619.qty) fail(`${VP.n}: 619 stepper exceeded stock (${maxSeen} > ${P619.qty})`); else ok();

      // minus decrements
      let minusOk = false;
      sb = await stepperButtons(p, VP.h);
      if (sb && sb.minus) {
        await p.mouse.click(sb.minus.cx, sb.minus.cy);
        await p.waitForTimeout(420);
        minusOk = Math.abs(maxSeen - 1 - Math.max(...qtyVals(await txtOf(p)).filter(v => v < 100), 0)) <= 0;
      }
      log(`[${VP.n}] minus decrement from ${maxSeen}: ${minusOk}`);
      if (minusOk) ok(); else fail(`${VP.n}: "−" did not decrement`);

      // re-max then Add to cart must REJECT with reference copy
      for (let i = 0; i < 15; i++) {
        const cur = await txtOf(p);
        if (Math.max(...qtyVals(cur).filter(v => v < 100), 0) >= P619.qty) break;
        sb = await stepperButtons(p, VP.h);
        if (!sb || !sb.plus) break;
        await p.mouse.click(sb.plus.cx, sb.plus.cy);
        await p.waitForTimeout(380);
      }
      const addClicked = await L.clickBtn(p, 'Add to cart');
      await p.waitForTimeout(1700);
      t = await txtOf(p);
      await shot('619-addtocart-cap');
      const accepted = /Added to cart/.test(t);
      const rej = t.match(/Only \d+ units? (?:are|is) available for this item\./);
      log(`[${VP.n}] add@cap619: clicked=${addClicked} acceptedToast=${accepted} rejectToast="${rej ? rej[0] : null}"`);
      if (addClicked) R.checks.buttons_ok++; else R.checks.buttons_failed.push(`${VP.n}:Add to cart(click)`);
      if (accepted && !rej) fail(`${VP.n}: 619 over-cap add silently ACCEPTED (no rejection toast)`);
      else if (!rej) fail(`${VP.n}: 619 over-cap add produced no "Only N units..." toast`);
      else ok();
      if (/Cart\s*\n?\s*(\d+)/.test(t) && accepted) fail(`${VP.n}: cart badge counted a rejected add`);
      else ok();
    }

    // ================= product 629 via You Might Also Like rail =================
    const nav2 = await openRelatedOnDetail(p, 'You Might Also Like', P629.name, VP.h);
    if (!nav2.ok) { fail(`${VP.n}: reach 629 failed: ${nav2.why}`); await shot('629-nav-failed'); }
    else {
      await p.waitForTimeout(800);
      t = await txtOf(p);
      await shot('629-loaded');
      if (!t.includes(P629.name)) fail(`${VP.n}: 629 title not rendered`); else ok();
      checkAvail(VP.n, t, P629);

      let clicks2 = 0, maxSeen2 = 1;
      for (let i = 0; i < 10; i++) {
        const s2 = await stepperButtons(p, VP.h);
        if (!s2 || !s2.plus) break;
        await p.mouse.click(s2.plus.cx, s2.plus.cy);
        clicks2++; await p.waitForTimeout(400);
        const vals = qtyVals(await txtOf(p)).filter(v => v < 100);
        if (vals.length) maxSeen2 = Math.max(maxSeen2, ...vals);
        if (/Only \d+ units? (?:are|is) available/.test(await txtOf(p))) break;
      }
      await shot('629-plus-x' + clicks2);
      log(`[${VP.n}] cap629: +x${clicks2} max=${maxSeen2} stock=${P629.qty}`);
      if (maxSeen2 > P629.qty) fail(`${VP.n}: 629 stepper exceeded stock (${maxSeen2} > ${P629.qty})`); else ok();
    }

    // ================= product 615 via SEARCH (qty=4 sold=3) =================
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 45000);
    const searchOpened = await p.evaluate(() => {
      const cands = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        if (e.getAttribute('flt-tappable') === null) return;
        // header icon sits top-right, above the rails; no text of its own
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height) return;
        cands.push({ el: e, x: r.x, y: r.y, w: r.width });
      });
      const hit = cands.filter(c => c.y < 140 && c.w < 70 && c.x > window.innerWidth * 0.5)
                       .sort((a, b) => b.x - a.x)[0];
      return hit ? { cx: Math.round(hit.x + hit.w / 2) } : null;
    }).then(h => h ? p.mouse.click(Math.min(h.cx, VP.w - 10), 40).then(() => true).catch(() => false) : false);
    await p.waitForTimeout(2500);
    let st = await txtOf(p);
    const onSearch = /Search…|No results found|Sort/i.test(st);
    if (!searchOpened || !onSearch) fail(`${VP.n}: Search screen did not open (opened=${!!searchOpened} dom=${onSearch})`);
    else {
      R.checks.nav_asserts++;
      const inp = p.locator('input[type="text"]').first();
      await inp.click({ force: true }); await p.waitForTimeout(350);
      await p.keyboard.type(P615.name.split(' ')[1] ? 'La vie' : P615.name);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(3500);
      st = await txtOf(p);
      if (!st.includes('LANC')) {
        // retry with full name fragment
        await inp.click({ force: true }); await p.keyboard.type('LANC'); await p.keyboard.press('Enter'); await p.waitForTimeout(3500);
        st = await txtOf(p);
      }
      if (!st.includes('LANC')) fail(`${VP.n}: 615 not found in search results`);
      else if (!(await L.clickCard(p, 'LANC'))) fail(`${VP.n}: 615 result card tap failed`);
      await p.waitForTimeout(4500);
      t = await txtOf(p);
      await shot('615-loaded');
      if (!t.includes(P615.name)) fail(`${VP.n}: 615 detail title not rendered`);
      else {
        ok(); R.checks.nav_asserts++;
        checkAvail(VP.n, t, P615);
        // stepper cap on 615 too
        let clicks3 = 0, maxSeen3 = 1;
        for (let i = 0; i < 10; i++) {
          const s3 = await stepperButtons(p, VP.h);
          if (!s3 || !s3.plus) break;
          await p.mouse.click(s3.plus.cx, s3.plus.cy);
          clicks3++; await p.waitForTimeout(400);
          const vals = qtyVals(await txtOf(p)).filter(v => v < 100);
          if (vals.length) maxSeen3 = Math.max(maxSeen3, ...vals);
        }
        await shot('615-plus-x' + clicks3);
        log(`[${VP.n}] cap615: +x${clicks3} max=${maxSeen3} stock=${P615.qty} sold=${P615.sold}`);
        if (maxSeen3 > P615.qty) fail(`${VP.n}: 615 stepper exceeded stock (${maxSeen3} > ${P615.qty})`); else ok();
      }
    }

    // ---------- images reconcile ----------
    const sum = L.imageSummary(imgs);
    log(`[${VP.n}] images: total=${sum.total} ok=${sum.ok} failed=${sum.failed}`);
    R.checks.images_requested += sum.total;
    R.checks.images_200 += sum.ok;
    for (const [u, s] of Object.entries(imgs)) if (s !== 200 && s !== 304) R.checks.images_broken.push(u);
    if (sum.failed > 0) fail(`${VP.n}: ${sum.failed} image requests failed`);

    perVp[VP.n] = true;
    await L.closeVideo(ctx, vpath);
  }

  // =====================================================================
  // PARITY — reference app, same viewports, same sandbox entities
  // =====================================================================
  for (const vp of [{ w: 375, h: 667, n: '375' }, { w: 768, h: 1024, n: '768' }]) {
    for (const P of [P619, P615]) {
      const rc = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const pp = await rc.newPage();
      await pp.goto(`${REF}/product/${P.id}`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
      await pp.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await pp.waitForFunction(() => document.body && document.body.innerText.length > 200, null, { timeout: 30000 }).catch(() => {});
      await pp.waitForTimeout(4500);
      const rt = await pp.evaluate(() => document.body.innerText);
      const f1 = `${SHOTS}/ref-${vp.n}-${P.id}-detail.png`;
      await pp.screenshot({ path: f1, fullPage: false }).catch(() => {}); ev(f1);

      const refAvail = new RegExp(`${P.qty}\\s*available`).test(rt);
      const refSold = P.sold > 0 ? new RegExp(`${P.sold}\\s*sold`).test(rt) : true;
      const refTitle = rt.toUpperCase().includes(P.name.toUpperCase().slice(0, 12));
      let refMax = 1, refDisabledAtCap = false;
      for (let i = 0; i < 25; i++) {
        const st = await pp.evaluate(() => {
          const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '') === 'Increase quantity');
          return b ? { disabled: b.disabled } : { none: true };
        });
        if (st.none || st.disabled) { refDisabledAtCap = !!st.disabled; break; }
        await pp.evaluate(() => { [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '') === 'Increase quantity').click(); });
        await pp.waitForTimeout(180);
        const cur = await pp.evaluate(() => {
          const inp = document.querySelector('input[aria-label="Quantity"]');
          return inp ? parseInt(inp.value, 10) : NaN;
        });
        if (!Number.isFinite(cur)) break;
        refMax = cur;
      }
      const f2 = `${SHOTS}/ref-${vp.n}-${P.id}-after-plus.png`;
      await pp.screenshot({ path: f2, fullPage: false }).catch(() => {}); ev(f2);
      log(`[ref ${vp.n} ${P.id}] title=${refTitle} "${P.qty} available"=${refAvail} soldSeg=${refSold} refMax=${refMax}/${P.qty} plus-disabled-at-cap=${refDisabledAtCap}`);

      // parity deltas
      if (!refAvail || !refTitle) { R.checks.parity.blocker++; fail(`parity ${vp.n}/${P.id}: reference itself missing title/availability (judge broken?)`); }
      if (refAvail !== true || refDisabledAtCap !== true) R.checks.parity.major++;
      // D-minor: web stepper embeds an editable numeric input; Flutter is +/- only.
      R.checks.parity.minor += 1;

      // cross-check: both apps show same availability number & sold segment
      if (refAvail && refDisabledAtCap) ok();
      await rc.close();
    }
  }

  await browser.close();

  // =====================================================================
  // VISION — native PNG inspection (Rule 16). Enumerated below in report.
  // =====================================================================
  R.runtime_ms = Date.now() - t0;
  write(true);
  process.exit(0);
})().catch(e => {
  console.error('RUNNER-ERROR', e && e.message);
  R.verdict = 'BLOCKED'; R.failures.push('runner: ' + (e && e.message));
  write(); process.exit(3);
});

function hardFails() { return R.failures.filter(f => !f.startsWith('parity')); }

function write(finalize = false) {
  if (finalize) {
    // Vision pass happens after the browser closes; verdict decided there.
    // Here we just persist current state; verify_vision step updates verdict.
    fs.writeFileSync(`${ROOT}/e2e/tmp/AU-014-r3-state.json`, JSON.stringify(R, null, 1));
  }
  const line = JSON.stringify(R) + '\n';
  fs.writeFileSync(`${ROOT}/e2e/results/shards/AU-014-verify.jsonl`, line);
}
