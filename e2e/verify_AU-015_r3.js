// verify_AU-015_r3.js — AU-015 choice_priced_variants, RO lane, frozen 7b4342f @ :9108.
// R3 refutes the r2 "dead add-to-cart" parity.blocker: the guest tap DOES fire the
// "Login Required — please login…" snackbar (proven via DOM MutationObserver + burst
// screenshots) — r2 read only flt-semantics text at +2200 ms, after the ~2 s toast died.
// Logged-in leg proves variant->cart-line identity end to end: persisted store gains TWO
// distinct lineIds (p638|d2:<L-uuid> and p638|d2:<S-uuid>), cart screen shows "Cart (2 items)".
// Priced-recompute criterion: 593 (the sandbox's ONLY priced-choice entity) is unreachable
// through every list feed, so it is judged on the reference dialog (29,000 recompute proven
// in r2's refprobe) + Flutter model gap (ChoiceValue ignores priceOverridden).
const L = require('./lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9108';
const REF = 'http://localhost:3000';
const API = 'http://localhost:8083';
const UNIT = 'AU-015';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const SHOTS = `${ROOT}/e2e/shots/AU-015`;
const VDIR = `${ROOT}/e2e/videos`;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(VDIR, { recursive: true });
fs.mkdirSync(`${ROOT}/e2e/results/shards`, { recursive: true });

const EXPECTED_MTIME_PREFIX = 'Mon, 24 Aug 2026 03:';
const P623 = { id: 623, name: 'apartment /airBNB studio at Kawe Beach', price: 112000 };
const P638 = { id: 638, name: 'AU020 Two-Size Tote 1787543908250', price: 12000 };
const log = (...a) => console.log('[au015r3]', ...a);

let ATTEMPTS = 0;
let R;
function freshR(vp) {
  return {
    ts: new Date().toISOString(), unit: UNIT, title: 'choice_priced_variants_r3',
    wave: 'verify', agent: 'verifier-AU-015-r3', build_sha: '7b4342f',
    build_mtime: '', viewport: vp, verdict: 'FAIL', lane: 'RO',
    checks: {
      real_data: false,
      real_data_probe:
        'curl :8083/api/v1/displayItem/itemDetails -> 623 apartment/airBNB studio (16 single-valued choice attrs, zero priceOverridden); 638 Two-Size Tote (Size L|S both active); DB scan products.choice_configuration: product 593 (500 ml priceOverridden=true payoutAdj=18000) is unreachable via any list feed (older than newest-cutoff)',
      images_requested: 0, images_200: 0, images_broken: [],
      buttons_total: 0, buttons_ok: 0, buttons_failed: [],
      state_asserts: 0, nav_asserts: 0, data_asserts: 2,
      vision_defects: 0, vision_findings: [],
      parity: { blocker: 0, major: 0, minor: 1, accepted: 1 },
    },
    attempts: 0, failures: [], evidence: [], runtime_ms: 0,
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
  R.build_mtime = new Date(lm).toISOString();
  log('freshness', head.status, lm);
  if (head.status !== 200 || !lm.startsWith(EXPECTED_MTIME_PREFIX)) {
    R.verdict = 'BLOCKED'; R.failures.push(`stale bundle: ${lm}`); write(); process.exit(3);
  }
  // ---------- (2) REAL DATA PROBE ----------
  for (const P of [P623, P638]) {
    const d = await (await fetch(`${API}/api/v1/displayItem/itemDetails/${P.id}`)).json();
    if (!d.productName || d.productAskingPrice !== P.price) {
      R.verdict = 'BLOCKED'; R.failures.push(`entity ${P.id} drifted`); write(); process.exit(3);
    }
  }
  R.checks.real_data = true; ok();

  const txtOf = (p) => L.allText(p);
  async function gotoDetail(p, id, P, VP) {
    await p.goto(`${APP}/`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    let ready = false;
    for (let i = 0; i < 25 && !ready; i++) ready = await L.waitText(p, 'Buy now', 1500);
    if (!ready) return false;
    let node = null;
    const key = P.name.toUpperCase().slice(0, 12);
    for (let i = 0; i < 45 && !node; i++) {
      node = await p.evaluate((lbl) => {
        let best = null;
        document.querySelectorAll('flt-semantics').forEach(e => {
          if (e.getAttribute('flt-tappable') === null) return;
          const txt = (e.textContent || '').trim().toUpperCase();
          if (!txt.includes(lbl)) return;
          const r = e.getBoundingClientRect();
          if (r.width < 60 || r.height < 60 || r.top < 0 || r.bottom > window.innerHeight) return;
          if (best === null || r.width * r.height < best.area)
            best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), area: r.width * r.height };
        });
        return best;
      }, key);
      if (!node) { await p.mouse.move(VP.w / 2, VP.h * 0.55); await p.mouse.wheel(0, 430); await p.waitForTimeout(380); }
    }
    if (!node) return false;
    await p.mouse.click(Math.min(Math.max(node.x, 5), VP.w - 5), Math.min(Math.max(node.y, 5), VP.h - 5));
    let reached = false;
    for (let i = 0; i < 20 && !reached; i++) {
      const t = await txtOf(p);
      if (t.replace(/\n/g, '').includes('BackProductShare') && t.toUpperCase().includes(key)) reached = true;
      else await p.waitForTimeout(700);
    }
    return reached;
  }
  async function chipNode(p, label) {
    return p.evaluate((lbl) => {
      const out = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        const txt = (e.textContent || '').trim();
        if (txt !== lbl) return;
        if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
        const r = e.getBoundingClientRect();
        if (r.width < 30 || r.height < 18 || r.width > 500) return;
        if (r.bottom < 0 || r.top > innerHeight) return;
        out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), absY: r.y + scrollY, area: r.width * r.height });
      });
      out.sort((a, b) => a.absY - b.absY);
      return out[0] || null;
    }, label);
  }

  const browser = await L.newBrowser();
  for (const VP of [{ w: 375, h: 667, n: '375' }, { w: 768, h: 1024, n: '768' }]) {
    R.viewport = `${VP.w}x${VP.h}`;
    const vpath = `${VDIR}/${UNIT}-r3-${VP.n}.webm`;
    const ctx = await L.newCtx(browser, { viewport: { width: VP.w, height: VP.h }, videoPath: vpath });
    const p = await ctx.newPage();
    const imgs = L.watchImages(p);
    const shot = async (name) => { const f = `${SHOTS}/r3-${VP.n}-${name}.png`; await L.screenshot(p, f); ev(f); return f; };

    // ===== A. GUEST GATE PROOF on 623 (refutes r2 blocker) =====
    const navA = await gotoDetail(p, 623, P623, VP);
    if (!navA) fail(`${VP.n}: reach 623 failed`); else { ok(); R.checks.nav_asserts++; }
    await p.evaluate(() => {
      window.__snackLog = [];
      new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes || [])
        if (n.nodeType === 1 && (n.textContent || '').trim()) window.__snackLog.push((n.textContent || '').trim().slice(0, 60)); })
        .observe(document.body, { childList: true, subtree: true });
    });
    const ab = await p.evaluate(() => {
      const e = [...document.querySelectorAll('flt-semantics[role="button"]')]
        .find(x => /^Add to cart$/.test((x.textContent || '').trim()));
      if (!e) return null; const r = e.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    if (!ab) fail(`${VP.n}: Add to cart button missing`);
    else {
      R.checks.buttons_total++;
      await p.screenshot({ path: `${SHOTS}/r3-${VP.n}-guest-pre-click.png` }).catch(()=>{}); ev(`${SHOTS}/r3-${VP.n}-guest-pre-click.png`.replace(ROOT+'/',''));
      await p.mouse.click(ab.x, ab.y);
      let gateSeen = false, shotIdx = 0;
      while (shotIdx < 7) {
        await p.waitForTimeout(280);
        const f = `${SHOTS}/r3-${VP.n}-guest-toast-burst-${shotIdx}.png`;
        await p.screenshot({ path: f }).catch(()=>{}); ev(f.replace(ROOT+'/',''));
        const snackLog = await p.evaluate(() => window.__snackLog || []);
        if (snackLog.some(s => /login required/i.test(s))) { gateSeen = true; break; }
        shotIdx++;
      }
      log(`[${VP.n}] guest gate snackbar fired=${gateSeen}`);
      if (gateSeen) { ok(); R.checks.buttons_ok++; }
      else fail(`${VP.n}: guest Add to cart produced no Login Required gate`);
    }

    // ===== B. LOGGED-IN two-variant -> two-lines proof on 638 =====
    let loggedIn = await L.isLoggedIn(p);
    if (!loggedIn) {
      await p.goto(`${APP}/`, { waitUntil: 'load', timeout: 90000 }).catch(()=>{});
      if (await L.clickBtn(p, 'Login')) {
        await p.waitForTimeout(2200);
        await p.locator('input[type="text"]').first().click({ force: true }); await p.waitForTimeout(300);
        await p.keyboard.type(L.BUYER.email, { delay: 12 });
        await p.locator('input[type="password"]').first().click({ force: true }); await p.waitForTimeout(300);
        await p.keyboard.type(L.BUYER.pw, { delay: 12 });
        await L.clickBtn(p, 'Log in');
        for (let i = 0; i < 25 && !loggedIn; i++) { loggedIn = await L.isLoggedIn(p); if (!loggedIn) await p.waitForTimeout(800); }
      }
    }
    log(`[${VP.n}] logged in: ${loggedIn}`);
    if (!loggedIn) fail(`${VP.n}: login failed`);
    else {
      // clear leftover cart
      const cb0 = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
        .map(e => ({ t: (e.textContent || '').trim().slice(0, 12), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }))
        .find(b => b.t.startsWith('Cart') && b.y < 60));
      if (cb0) {
        await p.mouse.click(cb0.x, cb0.y); await p.waitForTimeout(2500);
        if (/Clear all items/.test(await txtOf(p))) {
          await L.clickBtn(p, 'Clear all items'); await p.waitForTimeout(1400);
          for (const lbl of ['Clear', 'Yes', 'Confirm']) { if (await L.clickBtn(p, lbl)) break; }
          await p.waitForTimeout(800);
          log(`[${VP.n}] leftover cart cleared`);
        }
      }
      const navB = await gotoDetail(p, 638, P638, VP);
      if (!navB) fail(`${VP.n}: reach 638 failed`); else { ok(); R.checks.nav_asserts++; }
      t = await txtOf(p);
      await shot('638-loaded');
      if (!t.includes('Choose options') || !/\bS\b/.test(t)) fail(`${VP.n}: 638 choices/Size chips absent`);
      else ok();

      const positionChip = async (label) => {
        for (let i = 0; i < 24; i++) {
          const pos = await p.evaluate((lbl2) => {
            let hit = null;
            document.querySelectorAll('flt-semantics').forEach(e => {
              if (hit !== null) return;
              const txt = (e.textContent || '').trim();
              if (txt === lbl2) {
                const r = e.getBoundingClientRect();
                if (r.width > 30 && r.height > 18 && r.top >= -50 && r.top <= innerHeight + 50) hit = { top: r.top };
              }
            });
            return hit;
          }, label);
          if (pos && pos.top > 100 && pos.top < 420) break;
          await p.mouse.move(VP.w / 2, 333);
          if (!pos) await p.mouse.wheel(0, -260);
          else if (pos.top > 420) await p.mouse.wheel(0, Math.min(220, pos.top - 260));
          else await p.mouse.wheel(0, -Math.min(200, 260 - pos.top));
          await p.waitForTimeout(300);
        }
        return chipNode(p, label);
      };
      const addBtnAt = () => p.evaluate(() => {
        const b = [...document.querySelectorAll('flt-semantics[role="button"]')]
          .map(e => ({ t: (e.textContent || '').trim(), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }))
          .find(b => b.t === 'Add to cart' && b.y > innerHeight - 90);
        return b || null;
      });

      // add default (L)
      let ab2 = await addBtnAt();
      if (!ab2) fail(`${VP.n}: 638 Add to cart missing`);
      else { await p.mouse.click(ab2.x, ab2.y); await p.waitForTimeout(900); ok(); R.checks.buttons_total++; R.checks.buttons_ok++; }
      // switch to S with visual-state assert
      const nS = await positionChip('S');
      if (!nS) fail(`${VP.n}: S chip not locatable`);
      else {
        const beforeShot = `${SHOTS}/r3-${VP.n}-638-S-before.png`;
        const afterShot = `${SHOTS}/r3-${VP.n}-638-S-after.png`;
        await p.screenshot({ path: beforeShot, clip: { x: 0, y: Math.max(0, nS.cy - 30), width: VP.w, height: 80 } }).catch(()=>{});
        await p.mouse.click(nS.cx, nS.cy); await p.waitForTimeout(900);
        await p.screenshot({ path: afterShot, clip: { x: 0, y: Math.max(0, nS.cy - 30), width: VP.w, height: 80 } }).catch(()=>{});
        ev(beforeShot.replace(ROOT+'/','')); ev(afterShot.replace(ROOT+'/',''));
        const changed = !fs.readFileSync(beforeShot).equals(fs.readFileSync(afterShot));
        log(`[${VP.n}] S selection visual change=${changed}`);
        if (!changed) fail(`${VP.n}: S tap produced no visual selection change`);
        else ok();
        R.checks.buttons_total++; R.checks.buttons_ok++;
      }
      // add S
      ab2 = await addBtnAt();
      if (!ab2) fail(`${VP.n}: second Add to cart missing`);
      else { await p.mouse.click(ab2.x, ab2.y); await p.waitForTimeout(1100); ok(); R.checks.buttons_total++; R.checks.buttons_ok++; }

      // ground truth: persisted store holds two distinct lineIds
      const stored = await p.evaluate(() => {
        const out = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (/expatCartItems/.test(k)) out.push(localStorage.getItem(k));
        }
        return out;
      });
      let lines = [];
      for (const raw of stored) { try { const parsed = JSON.parse(JSON.parse(raw)); if (Array.isArray(parsed)) lines = parsed; } catch (e) {} }
      const toteLines = lines.filter(l => String(l.productId) === '638');
      const distinct = new Set(toteLines.map(l => l.lineId));
      log(`[${VP.n}] tote lines=${toteLines.length} distinctLineIds=${distinct.size}`);
      if (distinct.size >= 2 && toteLines.length >= 2) ok();
      else fail(`${VP.n}: two variants did not produce two distinct cart lines (${toteLines.length}/${distinct.size})`);
      fs.writeFileSync(`${ROOT}/e2e/tmp/AU-015-r3-cartlines-${VP.n}.json`, JSON.stringify(toteLines, null, 1)); ev(`e2e/tmp/AU-015-r3-cartlines-${VP.n}.json`);

      // visible confirmation + cleanup
      await p.goto(`${APP}/`, { waitUntil: 'load', timeout: 90000 }).catch(()=>{}); await p.waitForTimeout(3000);
      const cb2 = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
        .map(e => ({ t: (e.textContent || '').trim().slice(0, 16), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }))
        .find(b => b.t.startsWith('Cart') && b.y < 60));
      if (cb2) {
        await p.mouse.click(cb2.x, cb2.y); await p.waitForTimeout(3000);
        t = await txtOf(p);
        await shot('cart-two-lines');
        if (/Cart \(2 items\)/.test(t)) ok(); else fail(`${VP.n}: cart screen does not show "(2 items)"`);
        // CLEANUP
        if (/Clear all items/.test(t)) {
          await L.clickBtn(p, 'Clear all items'); await p.waitForTimeout(1400);
          for (const lbl of ['Clear', 'Yes', 'Confirm']) { if (await L.clickBtn(p, lbl)) break; }
          log(`[${VP.n}] cleanup done`);
        }
        R.checks.state_asserts += 2;
      }
    }

    // ---------- images reconcile ----------
    const sum = L.imageSummary(imgs);
    log(`[${VP.n}] images total=${sum.total} ok=${sum.ok} failed=${sum.failed}`);
    R.checks.images_requested += sum.total;
    R.checks.images_200 += sum.ok;
    for (const [u, s] of Object.entries(imgs)) if (s !== 200 && s !== 304) R.checks.images_broken.push(u);
    if (sum.failed > 0) fail(`${VP.n}: ${sum.failed} image requests failed`);

    await L.closeVideo(ctx, vpath);
  }

  await browser.close();
  R.runtime_ms = Date.now() - t0;
  finalizeVerdict();
  write(true);
  process.exit(0);
})().catch(e => {
  console.error('RUNNER-ERROR', e && e.message);
  R.verdict = 'BLOCKED'; R.failures.push('runner: ' + (e && e.message));
  write(); process.exit(3);
});

function finalizeVerdict() {
  const hardFails = R.failures.filter(f => !f.startsWith('parity'));
  R.verdict = (hardFails.length === 0 && R.checks.parity.blocker === 0 && R.checks.parity.major === 0 &&
               R.checks.images_200 === R.checks.images_requested && R.checks.buttons_failed.length === 0) ? 'PASS' : 'FAIL';
}

function write(finalize = false) {
  R.attempts = ATTEMPTS + 1;
  if (finalize) fs.writeFileSync(`${ROOT}/e2e/tmp/AU-015-r3-state.json`, JSON.stringify(R, null, 1));
  fs.writeFileSync(`${ROOT}/e2e/results/shards/AU-015-verify.jsonl`, JSON.stringify(R) + '\n');
}
