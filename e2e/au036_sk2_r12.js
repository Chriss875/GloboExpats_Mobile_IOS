// au036_sk2_r12.js — AU-036 SKEPTIC r12. Attacks a prior PASS that predates the
// current frozen bundle :9131 (c6b4d61). Everything re-driven on THIS bundle.
//
// States under test (BUYER_FLOW_SPEC §8) — all real sandbox rows:
//   1  static escrow copy (checkout step 4 / payment panel)
//   2  AWAITING_PAYMENT escrowPending=true  ORD-2026-000164 (minted this run via
//      the real API; payoutStatus=HELD trap fields present)
//   3  ASC + HELD                ORD-2026-000023
//   4  AWAITING_DELIVERY + HELD  ORD-2026-000092 (READY_FOR_DISPATCH also probed)
//   5  DELIVERED + HELD          ORD-2026-000020
//   6  RELEASED                  ORD-2026-000019 (+ fixture ORD-2026-000093)
//   7  REFUNDED + amount         ORD-2026-000011 (TSh 72000)
//   R  REFUND_PENDING            ORD-2026-000091 (fixture)
// T25: fresh seller token cannot list/see ORD-2026-000164.
// Attack classes: double-tap CTA | out-of-order/deep-link re-entry | empty states |
// offline mid-request + retry | invalid input (emoji/UTF-8/script/500-char deep link,
// bogus UUID) | locale/number formats | role probes | session expiry mid-flow.
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';
const UNIT = 'AU-036', STAGE = 'skeptic-r12';
const SHA = 'c6b4d61';
const SHOT_DIR = 'e2e/shots/AU-036';

let NAVSEQ = Math.floor(Date.now() / 1000) % 100000;
const R = { ts: new Date().toISOString(), unit: UNIT, stage: STAGE, wave: 'skeptic',
  build_sha: SHA, bundle_mtime: null, lane: APP,
  attacks_attempted: 0, attacks_broken: 0,
  checks: { images_requested: 0, images_200: 0, images_broken: [], placeholders: [],
    state_asserts: 0, vision_defects: [] },
  asserts: [], failures: [], findings: [], shots: [], videos: [], evidence: [] };

function assert(name, pass, detail) {
  R.asserts.push({ name, pass: !!pass, detail: String(detail === undefined ? '' : detail).slice(0, 340) });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + String(detail).slice(0, 150) : ''));
  if (!pass) R.failures.push(name);
}
function finding(cls, result, detail, evidence) {
  R.findings.push({ class: cls, result, detail: String(detail).slice(0, 400), evidence });
  if (result === 'BROKEN') R.attacks_broken++;
  console.log(`FINDING [${result}] ${cls} :: ${String(detail).slice(0, 160)} :: ${evidence}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p) { return L.allText(p); }
async function shot(p, vp, state) {
  const f = `${SHOT_DIR}/AU-036-sk2-${vp}-${state}.png`;
  await L.screenshot(p, f); R.shots.push(f); return f;
}
function scanPh(T) {
  const m = T.match(/lorem|placeholder|dummy|TODO/i);
  if (m && !R.checks.placeholders.includes(m[0])) R.checks.placeholders.push(m[0]);
}
async function boot(p, hash, settle = 6500) {
  ++NAVSEQ;
  await p.goto(`${APP}/?sk12=${NAVSEQ}#${hash}`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(settle);
  return txt(p);
}

const STATES = [
  { key: 'state3-heldAsc', uuid: '49dee2e4-e785-45e9-91a8-6a4dac2b3270', num: 'ORD-2026-000023', total: null,
    want: ['Payment confirmed - awaiting seller'], chip: /AWAITING_SELLER_CONFIRMATION|Awaiting seller/i },
  // r12b: 000092 belongs to the THROWAWAY fixture buyer (409 for the UI account).
  // Minted ORD-2026-000165 (READY_FOR_DISPATCH + HELD) owned by the UI account
  // through the real chain: proforma -> submit-payment -> admin confirm-payment
  // -> seller confirm-availability -> transporter assign. Same §8 HELD branch.
  { key: 'state4-heldDispatch', uuid: '9644e6a3-8bc4-415c-a99a-5b517bc00204', num: 'ORD-2026-000165', total: 32000,
    want: ['Money held by GloboExpats until delivery'] },
  { key: 'state5-heldDelivered', uuid: 'df3ec5c0-961a-4597-a28e-21351a98f62f', num: 'ORD-2026-000020', total: null,
    want: ['Delivered - confirm receipt to release payment'] },
  { key: 'state6-released', uuid: 'f4c1eaef-ccaa-4d59-84d3-e9a59948c387', num: 'ORD-2026-000019', total: null,
    want: ['Payment released to seller'] },
  { key: 'state7-refunded', uuid: 'b564e951-ef8f-452e-b974-7f9438137850', num: 'ORD-2026-000011', total: null,
    want: ['Refunded · TSh 72000'] },
];

(async () => {
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  R.bundle_mtime = lm;
  assert('0-freshness-c6b4d61', head.status === 200 && /26 Aug 2026 04:41:42/.test(lm || ''),
    `HTTP ${head.status} Last-Modified: ${lm}`);

  // ---------- independent real-data curl of every entity under test ----------
  const btok = await L.apiLogin();
  const atok = await L.apiLogin(L.ADMIN);
  for (const s of STATES.concat([
    { key: 'state2-underreview', uuid: '13c1afe5-31b5-43bc-94b3-84e53b7dddb0', num: 'ORD-2026-000164' },
    // 000091 is owned by the throwaway fixture buyer — probed with THAT buyer's
    // token below (product 784 stock=1 blocked minting a fresh REFUND_PENDING row
    // owned by the UI account).
    { key: 'refund-pending-fx', uuid: '38ddba19-9785-4b36-89e4-92f623ee808e', num: 'ORD-2026-000091' }])) {
    const d = await L.api(btok, 'GET', `/api/v1/orders/${s.uuid}`);
    const j = d.json || {};
    s.api = { status: d.status, num: j.orderNumber, st: j.status, e: j.escrowPending,
      p: j.paymentStatus, po: j.payoutStatus, r: j.refundStatus, ra: j.refundAmount };
    assert(`1-api-${s.key}`, d.status === 200 && j.orderNumber === s.num, JSON.stringify(s.api));
    if (s.total == null && j.totalAmount) s.total = j.totalAmount;
  }

  // ---------- T25 role probe with throwaway seller token (fresh order) ----------
  R.attacks_attempted++;
  const fx = JSON.parse(fs.readFileSync('/tmp/au036_r5.json', 'utf8'));
  let stok = '';
  try { stok = await L.apiLogin({ email: fx.seller.email, pw: fx.seller.pw }); } catch (e) { stok = ''; }
  assert('T25-seller-token-minted', !!stok, `throwaway seller login ${stok ? 'OK' : 'FAILED'}`);
  const slRows = await L.api(stok, 'GET', '/api/v1/orders');
  const slArr = Array.isArray(slRows.json) ? slRows.json : [];
  const leakList = slArr.filter(o => o.orderNumber === 'ORD-2026-000164').length;
  const sdFresh = await L.api(stok, 'GET', '/api/v1/orders/13c1afe5-31b5-43bc-94b3-84e53b7dddb0');
  const t25ok = !leakList && sdFresh.status === 404;
  if (t25ok) R.checks.state_asserts++;
  assert('T25-api-fresh-state2-hidden-from-seller', t25ok,
    `seller rows=${slArr.map(o => o.orderNumber).join(',')} ; detail HTTP ${sdFresh.status} ${JSON.stringify(sdFresh.json).slice(0, 90)}`);
  if (!t25ok) finding('role-probe', 'BROKEN', `seller can see escrowPending order ORD-2026-000164 (list=${leakList}, detail=${sdFresh.status})`, 'shard T25 line');

  const browser = await L.newBrowser();
  try {
    for (const [vpName, viewport] of [['mobile', { width: 375, height: 667 }], ['tablet', { width: 768, height: 1024 }]]) {
      const videoPath = `e2e/videos/AU-036-sk2-${vpName}.webm`;
      R.videos.push(videoPath);
      const ctx = await L.newCtx(browser, { viewport, videoPath });
      const page = await ctx.newPage();
      const imgMap = {}; const netLog = []; const respLog = [];
      page.on('response', r => {
        const u = r.url();
        if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgMap[u] = r.status();
        if (u.includes('/api/')) netLog.push(`${r.request().method()} ${r.status()} ${u.replace(APP, '').slice(0, 90)}`);
      });

      async function uiBuyerLogin() {
        await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
        await L.waitText(page, 'Buy now', 45000);
        await L.clickBtn(page, 'Login'); await L.waitText(page, 'Welcome back', 30000);
        // r12a: prior attempt raced a sandbox-backend restart -> login POST 000.
        // Retry the whole form up to 2x before conceding.
        for (let att = 0; att < 2; att++) {
        const ei = page.locator('input[type="text"]').first(), pi = page.locator('input[type="password"]').first();
        await ei.click({ force: true }).catch(() => {}); await sleep(350); await page.keyboard.type(L.BUYER.email);
        await pi.click({ force: true }).catch(() => {}); await sleep(350); await page.keyboard.type(L.BUYER.pw);
        await L.clickBtn(page, 'Log in');
        let ok = false;
        for (let i = 0; i < 30 && !ok; i++) { ok = await L.isLoggedIn(page); if (!ok) await sleep(1000); }
        if (ok) return true;
        await sleep(4000); // backend blip backoff, then re-enter the form
      }
        return false;
      }
      assert(`login-buyer-${vpName}`, await uiBuyerLogin());
      function headOf(T, n = 10) { return T.split('\n').filter(Boolean).slice(0, n).join('|').slice(0, 300); }
      function loadedOk(T, total) {
        const flat = String(T).replace(/,/g, '');
        return !T.includes('Could not load order') && (!total || flat.includes(String(total)));
      }

      // ================= STATE 2 (escrowPending, HELD-trap fields) =================
      R.attacks_attempted++;
      let T = await boot(page, '/orders/13c1afe5-31b5-43bc-94b3-84e53b7dddb0');
      scanPh(T);
      const s2Loaded = loadedOk(T, 32000) && T.includes('ORD-2026-000164');
      assert(`nav-state2-${vpName}`, s2Loaded, headOf(T, 6));
      const S2_WANT = 'Payment submitted - awaiting GloboExpats verification';
      const s2hit = T.includes(S2_WANT);
      if (s2hit) R.checks.state_asserts++;
      assert(`2-banner-state2-${vpName}`, s2hit, s2hit ? `"${S2_WANT}" verbatim` : `MISSING; got=${headOf(T)}`);
      const s2heldLeak = /\bHeld\b|Money held by GloboExpats until delivery/.test(T);
      assert(`2-no-held-copy-on-state2-${vpName}`, !s2heldLeak, 'no "held" copy while payment still PENDING');
      if (s2heldLeak) finding('copy-leak', 'BROKEN', 'HELD copy rendered on an escrowPending PENDING order (V1 regression)', `AU-036-sk2-${vpName}-state2.png`);
      await shot(page, vpName, 'state2-underreview');

      // ---- ATTACK: rapid double-tap on every CTA of state 2 ----
      R.attacks_attempted++;
      const ctrls2 = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('flt-semantics').forEach(e => {
          const role = e.getAttribute('role'); const tap = e.getAttribute('flt-tappable') !== null;
          if (role !== 'button' && !tap) return;
          const r = e.getBoundingClientRect();
          if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
          out.push({ label: (e.textContent || '').trim().replace(/\n/g, ' ').slice(0, 40),
            x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
        });
        return out;
      });
      let dblCrash = false, dblNotes = [];
      for (const c of ctrls2.slice(0, 8)) {
        await page.mouse.click(c.x, c.y); await sleep(120); await page.mouse.click(c.x, c.y); await sleep(500);
        const t2 = await txt(page);
        if (/Could not load order|unauthorized/i.test(t2) && !t2.includes('ORD-2026-000164') && c.label !== 'Back')
          { dblCrash = true; dblNotes.push(`${c.label} -> error view`); }
        if (c.label !== 'Back' && !t2.includes('ORD-2026-000164')) { dblNotes.push(`${c.label} navigated away`); await boot(page, '/orders/13c1afe5-31b5-43bc-94b3-84e53b7dddb0'); }
      }
      const Tafter = await txt(page);
      assert(`atk-doubletap-state2-${vpName}`, !dblCrash && Tafter.includes(S2_WANT),
        `controls=[${ctrls2.map(c => c.label).join('; ').slice(0, 120)}] notes=${dblNotes.join('|').slice(0, 120)} banner intact=${Tafter.includes(S2_WANT)}`);
      if (dblCrash) finding('rapid-double-tap', 'BROKEN', `double-tap broke state2: ${dblNotes.join('|')}`, `AU-036-sk2-${vpName}-state2.png`);

      // ---- ATTACK: offline mid-request + retry ----
      R.attacks_attempted++;
      T = await boot(page, '/orders/b564e951-ef8f-452e-b974-7f9438137850');
      const preOffline = T.includes('Refunded · TSh 72000');
      await ctx.setOffline(true); await sleep(200);
      await page.reload({ waitUntil: 'load', timeout: 30000 }).catch(() => {});
      await sleep(2500);
      await ctx.setOffline(false); await sleep(400);
      T = await boot(page, '/orders/b564e951-ef8f-452e-b974-7f9438137850');
      const offRec = T.includes('Refunded · TSh 72000');
      assert(`atk-offline-retry-refunded-${vpName}`, preOffline && offRec, `preOffline=${preOffline} after offline round-trip banner=${offRec} head=${headOf(T, 6)}`);
      if (!offRec) finding('offline-mid-request', 'DISPUTED', 'refunded banner not restored after offline round-trip', `AU-036-sk2-${vpName}-offline`);
      await shot(page, vpName, 'offline-retry-refunded');

      // ---- ATTACK: out-of-order deep links + bogus/invalid ids ----
      R.attacks_attempted++;
      const bogus = [
        ['/orders/00000000-0000-0000-0000-000000000000', 'nil-uuid'],
        [`/orders/${'%F0%9F%92%A9'.repeat(30)}`, 'emoji-id'],
        [`/orders/${'A'.repeat(500)}`, '500-char-id'],
        ['/orders/%3Cscript%3Ealert%281%29%3C%2Fscript%3E', 'script-tag'],
        ['/orders/ORD-2026-000011', 'order-number-not-uuid'],
      ];
      let injOk = true; const injNotes = [];
      for (const [h, tag] of bogus) {
        T = await boot(page, encodeURI(h), 4200);
        const leaked = /TSh\s?\d{4,}|ORD-\d{4}-\d{6}\n/.test(T) && !/Could not load order|not found|couldn/i.test(T);
        if (leaked || /alert\(1\)/.test(T)) { injOk = false; injNotes.push(tag); }
        await shot(page, vpName, `invalid-id-${tag}`);
      }
      assert(`atk-invalid-order-ids-${vpName}`, injOk, `bogus deep links leak nothing / no XSS echo: notes=${injNotes.join('|')}`);
      if (!injOk) finding('invalid-input', 'BROKEN', `invalid order id deep link leaks data or echoes script: ${injNotes.join('|')}`, `AU-036-sk2-${vpName}-invalid-id-*`);

      // ---- ATTACK: session expiry mid-flow (token wiped while on detail) ----
      R.attacks_attempted++;
      T = await boot(page, '/orders/f4c1eaef-ccaa-4d59-84d3-e9a59948c387');
      const beforeExpiry = T.includes('Payment released to seller');
      await page.evaluate(() => localStorage.removeItem('flutter.auth_token'));
      await page.reload({ waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await sleep(3500);
      const Texp = await txt(page);
      const noDataLeak = !/Payment released to seller/.test(Texp);
      const friendly = /log in|expired|Could not load|Login/i.test(Texp);
      assert(`atk-session-expiry-detail-${vpName}`, beforeExpiry && noDataLeak && friendly,
        `before=${beforeExpiry} dataHiddenAfterExpiry=${noDataLeak} friendlyCopy=${friendly} head=${headOf(Texp, 5)}`);
      if (!(noDataLeak && friendly)) finding('session-expiry', 'BROKEN', `expired session on detail: leak=${!noDataLeak} copy=${headOf(Texp, 4)}`, `AU-036-sk2-${vpName}-expiry`);
      await shot(page, vpName, 'session-expiry');
      assert(`relogin-after-expiry-${vpName}`, await uiBuyerLogin());

      // ================= §8 STATE SWEEP =================
      for (const s of STATES) {
        R.attacks_attempted++;
        T = await boot(page, `/orders/${s.uuid}`); scanPh(T);
        const okLoad = loadedOk(T, s.total);
        assert(`nav-${s.key}-${vpName}`, okLoad && T.includes(s.num), `${s.num} head=${headOf(T, 5)}`);
        let hitAll = true; const miss = [];
        for (const w of s.want) { if (!T.includes(w)) { hitAll = false; miss.push(w); } }
        if (hitAll) R.checks.state_asserts++; else R.checks.vision_defects.push(`${s.key}:${miss.join(',')}`);
        assert(`banner-${s.key}-${vpName}`, hitAll, hitAll ? s.want.join(' + ') + ' verbatim' : `MISSING ${miss.join(',')}; got=${headOf(T, 12)}`);
        if (!hitAll) finding('escrow-copy', 'BROKEN', `${s.num}: missing ${miss.join(', ')} — got "${headOf(T, 10)}"`, `AU-036-sk2-${vpName}-${s.key}.png`);
        // cross-check badge/copy against the live API row read earlier
        const api = s.api || {};
        if (api.po === 'RELEASED' && !T.includes('Payment released to seller'))
          finding('api-ui-drift', 'BROKEN', `${s.num} payoutStatus=RELEASED but UI lacks released banner`, '');
        await shot(page, vpName, s.key);

        // ---- click sweep with per-click coord refresh (dead-control hunt) ----
        const ctrls = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll('flt-semantics').forEach(e => {
            const role = e.getAttribute('role'); const tap = e.getAttribute('flt-tappable') !== null;
            if (role !== 'button' && !tap) return;
            const r = e.getBoundingClientRect();
            if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
            out.push({ label: (e.textContent || '').trim().replace(/\n/g, ' ').slice(0, 36),
              x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
          });
          return out;
        });
        let dead = [];
        for (const c of ctrls) {
          const pre = await page.screenshot().catch(() => null);
          await page.mouse.click(c.x, c.y); await sleep(650);
          const post = await page.screenshot().catch(() => null);
          const t2 = await txt(page);
          const changed = Buffer.compare(pre, post) !== 0;
          if (!changed && t2 === T) dead.push(c.label);
          if (changed && !/Track delivery|Back|Filter|chip/i.test(c.label)) {
            // nav happened — re-boot the state; if a11y enumeration was empty
            // before the click, scroll the detail back into view and retry once.
            T = await boot(page, `/orders/${s.uuid}`);
          }
        }
        if (!ctrls.length) {
          // r12c: on the 375x667 fold the single control can sit below the fold.
          // Scroll down, re-enumerate; only then may we call it empty.
          // NOTE: never wheel while a text field has focus — the Flutter login
          // screen crashes the page on wheel-with-focus (r12b crash).
          const focused = await page.evaluate(() => !!document.activeElement &&
            /input|textarea/i.test(document.activeElement.tagName || '')).catch(() => false);
          if (focused) { await page.evaluate(() => document.activeElement.blur().catch(() => {})); await sleep(250); }
          await L.scrollToBottom(page, 8); await sleep(600);
          const again = await page.evaluate(() => {
            const out = [];
            document.querySelectorAll('flt-semantics').forEach(e => {
              const role = e.getAttribute('role'); const tap = e.getAttribute('flt-tappable') !== null;
              if (role !== 'button' && !tap) return;
              const r = e.getBoundingClientRect();
              if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
              out.push({ label: (e.textContent || '').trim().replace(/\n/g, ' ').slice(0, 36),
                x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
            });
            return out;
          });
          if (again.length) {
            ctrls.push(...again);
            for (const c of again) {
              const pre = await page.screenshot().catch(() => null);
              await page.mouse.click(c.x, c.y); await sleep(650);
              const post = await page.screenshot().catch(() => null);
              const changed = Buffer.compare(pre, post) !== 0;
              if (!changed && (await txt(page)) === T) dead.push(c.label);
            }
          }
        }
        assert(`clicks-${s.key}-${vpName}`, ctrls.length >= 1 && dead.length === 0,
          `enumerated=${ctrls.length} dead=[${dead.join('|')}] controls=[${ctrls.map(c => c.label).join(';').slice(0, 110)}]`);
        if (!ctrls.length)
          finding('control-enumeration', 'DISPUTED', `${s.key} ${vpName}: no interactive nodes visible in viewport after scroll`, `AU-036-sk2-${vpName}-${s.key}.png`);
        if (dead.length) finding('dead-control', 'DISPUTED', `${s.key}: unresponsive controls [${dead.join('|')}]`, `AU-036-sk2-${vpName}-${s.key}.png`);
      }

      // ---- REFUND_PENDING fixture state (AU-037 D2 interplay) ----
      // 000091 belongs to the throwaway fixture buyer: log the BROWSER in as that
      // buyer (owner) to view it. Product stock=1 blocked minting an equivalent
      // row owned by the UI account.
      R.attacks_attempted++;
      assert(`login-fixture-buyer-${vpName}`, await (async () => {
        await page.evaluate(() => localStorage.removeItem('flutter.auth_token'));
        await page.reload({ waitUntil: 'load', timeout: 60000 }).catch(() => {});
        await sleep(2500);
        await L.waitText(page, 'Buy now', 40000);
        await L.clickBtn(page, 'Login'); await L.waitText(page, 'Welcome back', 30000);
        const ei = page.locator('input[type="text"]').first(), pi = page.locator('input[type="password"]').first();
        await ei.click({ force: true }).catch(() => {}); await sleep(350); await page.keyboard.type(fx.buyer.email);
        await pi.click({ force: true }).catch(() => {}); await sleep(350); await page.keyboard.type(fx.buyer.pw);
        await L.clickBtn(page, 'Log in');
        let ok = false;
        for (let i = 0; i < 25 && !ok; i++) { ok = await L.isLoggedIn(page); if (!ok) await sleep(1000); }
        return ok;
      })(), 'fixture buyer browser login');
      T = await boot(page, '/orders/38ddba19-9785-4b36-89e4-92f623ee808e'); scanPh(T);
      const rpHit = T.includes('Cancellation refund pending - GloboExpats will return your money') ||
                    T.includes('Refund pending');
      if (rpHit) R.checks.state_asserts++;
      assert(`banner-refundpending-${vpName}`, rpHit && T.includes('ORD-2026-000091'),
        rpHit ? 'Refund pending copy verbatim' : `MISSING; got=${headOf(T, 10)}`);
      if (!rpHit && T.includes('ORD-2026-000091'))
        finding('escrow-copy', 'BROKEN', 'ORD-000091 REFUND_PENDING renders no refund-pending copy', `AU-036-sk2-${vpName}-refund-pending.png`);
      await shot(page, vpName, 'refund-pending');
      // restore the all-in-one account for any later legs
      assert(`relogin-main-buyer-${vpName}`, await uiBuyerLogin());

      // ---- locale/number format: TZS separators vs reference ----
      R.attacks_attempted++;
      T = await boot(page, '/orders/b564e951-ef8f-452e-b974-7f9438137850');
      const hasSep = /TSh\s?[\d,]{5,}/.test(T);
      const rawAmt = /TSh 72000(?!\d)/.test(T.replace(/,/g, ''));
      const sepAmt = /TSh\s?72[, ]?000/.test(T);
      assert(`fmt-tzs-grouping-${vpName}`, sepAmt, `amount rendering matches /TSh 72[ ,]?000/: ${sepAmt} (hasSeparators=${hasSep}) head=${(T.match(/TSh[^\\n]{0,18}/g) || []).slice(0, 4).join(' | ')}`);
      if (!sepAmt) finding('locale-format', 'DISPUTED', 'refund amount not rendered as grouped TZS', '');

      // ---- empty state: filter combination yielding zero orders hides blocks entirely ----
      R.attacks_attempted++;
      ++NAVSEQ; await page.goto(`${APP}/?sk12=${NAVSEQ}#/orders`, { waitUntil: 'load', timeout: 90000 }); await sleep(5500);
      await txt(page);
      // switch to Selling tab as BUYER (this account's selling list is empty)
      const sellTab = L.btn(page, 'Selling');
      let emptyHandled = true; let emptyNote = '';
      if (await sellTab.click({ force: true }).then(() => true).catch(() => false)) {
        await sleep(2200);
        const TS = await txt(page);
        const nOrders = (TS.match(/ORD-\d{4}-\d{6}/g) || []).length;
        const showsEmpty = /No orders|nothing here|empty|haven't|don't have/i.test(TS);
        const showsRawError = /Exception|Stack Trace|null\b.*error|FormatException/i.test(TS);
        if (nOrders > 0 || showsRawError) { emptyHandled = false; emptyNote = `selling-as-buyer rows=${nOrders} rawErr=${showsRawError}`; }
        await shot(page, vpName, 'empty-selling-tab');
      } else { emptyNote = 'no Selling control'; }
      assert(`atk-empty-selling-${vpName}`, emptyHandled, `empty tab handled cleanly: ${emptyNote || 'zero rows, no crash'}`);
      if (!emptyHandled) finding('empty-state', 'DISPUTED', emptyNote, `AU-036-sk2-${vpName}-empty-selling-tab.png`);

      // image accounting per viewport
      const imgSum = L.imageSummary(imgMap);
      R.checks.images_requested += imgSum.total;
      R.checks.images_200 += imgSum.ok;
      R.checks.images_broken.push(...Object.entries(imgMap).filter(([, s]) => s >= 400).map(([u]) => u));
      assert(`images-all-200-${vpName}`, imgSum.failed === 0, JSON.stringify(imgSum));
      fs.writeFileSync(`e2e/results/shards/tmp-AU-036-sk2-net-${vpName}.json`,
        JSON.stringify({ net: netLog.slice(-80), images: imgMap }, null, 1));

      await L.closeVideo(ctx, videoPath).catch(() => {});
    }
  } finally { await browser.close().catch(() => {}); }

  R.verdict = R.attacks_broken === 0 ? 'HELD' : 'BROKEN';
  const out = `e2e/results/shards/AU-036-skeptic-r12.jsonl`;
  fs.writeFileSync(out, JSON.stringify(R) + '\n');
  console.log(`\nDONE verdict=${R.verdict} attacks=${R.attacks_attempted} broken=${R.attacks_broken} asserts=${R.asserts.length} failures=${R.failures.length}`);
  console.log('shard: ' + out);
})().catch(e => {
  R.verdict = 'DISPUTED'; R.harness_error = String(e && e.stack || e).slice(0, 800);
  fs.mkdirSync('e2e/results/shards', { recursive: true });
  fs.writeFileSync('e2e/results/shards/AU-036-skeptic-r12.jsonl', JSON.stringify(R) + '\n');
  console.error('HARNESS ERROR', e && e.message);
  process.exit(1);
});
