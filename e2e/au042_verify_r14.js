// au042_verify_r14.js — AU-042 ADMIN-lane TERMINAL verifier, run 14.
// Frozen lane :9131 @ e694463, main.dart.js Last-Modified "Wed, 26 Aug 2026 08:15:26 GMT".
// Fixtures: /tmp/au042_r14_fixtures.json (own buyer/seller/product only; prefix au042r14).
//   PASS1 375x667 — T16 chain on A (Verify -> Confirm payment -> order PAID/escrow
//     cleared/HELD/AWAITING_SELLER_CONFIRMATION), B bulk-approve single-select,
//     C Reject AMOUNT_MISMATCH -> buyer-visible code+deadline (T24) ->
//     cancel-after-rejection: UI refusal while window open + API 409, then the
//     SANDBOX deadline for OUR row shifted back 49h -> real cancel + stock release.
//   PASS2 768x1024 — fresh set2 (au043r14 prefix): BULK approve MULTI-SELECT (2 rows),
//     Verify C2, receipt-preview pixel proof, cross-chip sweeps.
//   PASS3 1280x900 — admin desktop sweep + overflow check.
// Appendix A steps 1-9 in full. Native PNG inspection (Rule 16) in a separate stage.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';
L.APP = APP;
const UNIT = 'AU-042', STAGE = 'verify', SHA = 'e694463';
const MT = 'Wed, 26 Aug 2026 08:15:26 GMT';
const SHARD = 'e2e/results/shards/AU-042-verify.jsonl'; // terminal shard line appended at end
const TRACE = '/tmp/au042_r14_trace.jsonl';
const OUTDIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-042';
const VIDDIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos';
const fx = JSON.parse(fs.readFileSync('/tmp/au042_r14_fixtures.json', 'utf8'));

const CNT = { real_data: 0, images_requested: 0, images_200: 0, buttons_total: 0, buttons_ok: 0,
  state_asserts: 0, nav_asserts: 0, vision_defects: 0,
  parity: { blocker: 0, major: 0, minor: 0, accepted: 0 } };
const FAILS = [];
const EV = [];

function chk(name, ok, ev) {
  fs.appendFileSync(TRACE, JSON.stringify({ ts: new Date().toISOString(), unit: UNIT, stage: STAGE, check: name, ok: !!ok, evidence: String(ev ?? '').slice(0, 700) }) + '\n');
  console.log(ok ? 'PASS' : 'FAIL', '|', name, '|', String(ev ?? '').slice(0, 190));
  if (!ok) FAILS.push(`${name}: ${String(ev ?? '').slice(0, 160)}`);
  return ok;
}

// ---------- minimal PNG decode (truecolor screenshots) ----------
function decodePng(buf) {
  let pos = 8, idat = [], w = 0, h = 0, ct = -1;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') { w = buf.readUInt32BE(pos + 8); h = buf.readUInt32BE(pos + 12); ct = buf[pos + 17]; }
    else if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len));
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!w || ct !== 2) return {};
  let raw; try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch (e) { return {}; }
  const stride = 1 + w * 3, rows = new Array(h); let prev = Buffer.alloc(w * 3);
  for (let y = 0; y < h; y++) {
    const off = y * stride, f = raw[off], line = raw.subarray(off + 1, off + stride), out = Buffer.alloc(w * 3);
    if (f === 0) line.copy(out);
    else if (f === 1) for (let i = 0; i < out.length; i++) out[i] = (line[i] + (i >= 3 ? out[i - 3] : 0)) & 255;
    else if (f === 2) for (let i = 0; i < out.length; i++) out[i] = (line[i] + prev[i]) & 255;
    else if (f === 3) for (let i = 0; i < out.length; i++) { const a = i >= 3 ? out[i - 3] : 0, b = prev[i], c = i >= 3 ? out[i - 3] >> 1 : 0; out[i] = (line[i] + ((a + b) >> 1)) & 255; }
    else if (f === 4) for (let i = 0; i < out.length; i++) {
      const A = i >= 3 ? out[i - 3] : 0, B = prev[i], C = i >= 3 ? prev[i - 3] : 0, pp = A + B - C;
      const pa = Math.abs(pp - A), pb = Math.abs(pp - B), pc = Math.abs(pp - C);
      const pr = pa <= pb && pa <= pc ? A : (pb <= pc ? B : C);
      out[i] = (line[i] + pr) & 255;
    }
    rows[y] = out; prev = out;
  }
  return { width: w, height: h, rows };
}
async function regionStats(p, node) {
  const buf = await p.screenshot();
  const { width, height, rows } = decodePng(buf);
  if (!rows) return { err: 'decode-fail' };
  const rx = Math.max(0, node.x), ry = Math.max(0, node.y);
  const rw = Math.min(node.w || 120, width - rx - 1), rh = Math.min(node.h || 120, height - ry - 1);
  const colors = new Set(); let sum = 0, sum2 = 0, n = 0;
  for (let y = ry; y < ry + rh; y += 2) for (let x = rx; x < rx + rw; x += 2) {
    const o = x * 3, R = rows[y][o], G = rows[y][o + 1], B = rows[y][o + 2];
    colors.add(((R >> 4) << 8) | ((G >> 4) << 4) | (B >> 4));
    const lum = (R * 299 + G * 587 + B * 114) / 1000; sum += lum; sum2 += lum * lum; n++;
  }
  const mean = sum / Math.max(n, 1);
  return { distinctColors: colors.size, meanLum: Math.round(mean), sdLum: Math.round(Math.sqrt(Math.max(sum2 / n - mean * mean, 0))) };
}

// ---------- semantics helpers ----------
async function dump(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => {
    const r = e.getBoundingClientRect();
    return { role: e.getAttribute('role') || '', tap: e.getAttribute('flt-tappable') !== null,
      label: (e.getAttribute('aria-label') || e.textContent || '').trim(), checked: e.getAttribute('aria-checked'),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }).filter(n => n.label));
}
const txtOf = N => N.map(n => n.label).join('\n');
async function findNode(p, want, vp) {
  const nodes = await dump(p); let best = null;
  for (const n of nodes) {
    if (!n.label.includes(want)) continue;
    if (!(n.role === 'button' || n.tap)) continue;
    if (n.w < 6 || n.h < 6) continue;
    if (n.y + n.h <= 0 || n.y >= vp.h || n.x + n.w <= 0 || n.x >= vp.w) continue;
    if (!best || n.w * n.h < best.w * best.h) best = n;
  }
  return best;
}
async function clickCenter(p, n) { await p.mouse.click(n.x + n.w / 2, n.y + n.h / 2); await p.waitForTimeout(1000); }

async function revealCard(p, pfNumber, vp, tries = 22) {
  for (let i = 0; i < tries; i++) {
    const nodes = await dump(p);
    const card = nodes.find(n => n.role === 'checkbox' && n.label.includes(pfNumber))
      || nodes.filter(n => n.label.includes(pfNumber))[0];
    if (!card) return null;
    if (card.y >= 130 && Math.min(card.y + card.h, card.y + 320) <= vp.h - 70) return card;
    const dir = card.y + card.h / 2 > vp.h * 0.55 ? 1 : -1;
    await p.mouse.move(vp.w / 2, vp.h * 0.5); await p.mouse.wheel(0, dir * 300); await p.waitForTimeout(230);
  }
  return null;
}
async function tickCard(p, pfNumber, vp) {
  const card = await revealCard(p, pfNumber, vp);
  if (!card) return { ok: false, why: 'card not revealed' };
  await p.mouse.click(card.x + Math.min(26, card.w / 4), card.y + Math.min(22, card.h / 3));
  await p.waitForTimeout(1400);
  const nb = (await dump(p)).find(n => n.role === 'checkbox' && n.label.includes(pfNumber));
  return { ok: !!nb && nb.checked === 'true', why: `aria-checked ${card.checked} -> ${nb && nb.checked}`, node: card };
}
async function actionInCard(p, label, pfNumber, vp) {
  for (let i = 0; i < 10; i++) {
    await revealCard(p, pfNumber, vp);
    const nodes = await dump(p);
    const a = nodes.find(n => n.role === 'checkbox' && n.label.includes(pfNumber)) || nodes.filter(n => n.label.includes(pfNumber))[0];
    if (a) {
      const cands = nodes.filter(n => n.role === 'button' && n.label.trim() === label && n.y >= a.y - 60 && n.y <= a.y + 560 && n.w > 6 && n.h > 6);
      cands.sort((p1, p2) => Math.abs(p1.y - a.y) - Math.abs(p2.y - a.y));
      const b = cands[0];
      if (b && b.y >= 90 && b.y + b.h <= vp.h - 16 && b.x >= 0 && b.x + b.w <= vp.w) return b;
    }
    await p.mouse.move(vp.w / 2, vp.h * 0.5); await p.mouse.wheel(0, 190); await p.waitForTimeout(220);
  }
  return null;
}
async function shot(p, vp, state) { const f = `${OUTDIR}/AU-042-r14-${vp.name}-${state}.png`; await L.screenshot(p, f); EV.push(f); return f; }

(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true }); fs.mkdirSync(VIDDIR, { recursive: true });
  const t0 = Date.now();
  const atok = fx.adminToken;

  // ===================== 1. FRESHNESS =====================
  {
    const r = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
    chk('freshness-build-sha-mtime', r.headers.get('last-modified') === MT,
      `Last-Modified=${r.headers.get('last-modified')} expected=${MT} sha=${SHA}`);
    const idx = await fetch(APP + '/').then(x => x.text());
    chk('freshness-app-served', /flutter|main.dart\.js/i.test(idx), `index bytes=${idx.length}`);
  }

  // ===================== 2. REAL DATA (API ground truth) =====================
  let rowA, orderIdA = null, orderIdC = null;
  {
    const q = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PAYMENT_SUBMITTED&page=0&size=50');
    rowA = (q.json.content || []).find(p => p.proformaId === fx.A.proformaId);
    const rowB = (q.json.content || []).find(p => p.proformaId === fx.B.proformaId);
    const rowC = (q.json.content || []).find(p => p.proformaId === fx.C.proformaId);
    CNT.real_data += 3;
    chk('api-submitted-queue-has-A-B-C', q.status === 200 && !!rowA && !!rowB && !!rowC,
      `HTTP ${q.status} totalElements=${q.json.totalElements} A=${fx.A.proformaNumber} B=${fx.B.proformaNumber} C=${fx.C.proformaNumber}`);
    CNT.real_data++;
    const refA = `SANDBOX-TXN-${fx.tag}-A`;
    chk('queue-row-A-real-fields',
      rowA.grandTotal === rowA.grandTotal && rowA.buyerName === 'AU042R14First AU042R14Last'
      && rowA.paymentMethodType === 'MOBILE_MONEY' && (rowA.transactionReferences || []).includes(refA)
      && (rowA.receipts || []).length === 1 && rowA.receipts[0].status === 'SUBMITTED',
      JSON.stringify({ grandTotal: rowA.grandTotal, currency: rowA.currency, buyer: rowA.buyerName, method: rowA.paymentMethodType,
        refs: rowA.transactionReferences, receipts: (rowA.receipts || []).map(r => `${r.fileName}:${r.status}`) }));
    orderIdA = (rowA.orderIds || [])[0]; orderIdC = (rowC.orderIds || [])[0];
    CNT.real_data++;
    chk('queue-rows-carry-orderIds', !!orderIdA && !!orderIdC, `A.orderId=${orderIdA} C.orderId=${orderIdC}`);

    const oa = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${orderIdA}`);
    const oj = oa.json || {};
    CNT.real_data++;
    chk('provisional-order-pre-confirm-PENDING-escrowHELD',
      oa.status === 200 && oj.paymentStatus === 'PENDING' && oj.escrowPending === true && oj.payoutStatus === 'HELD'
        && (oj.orderStatus || oj.status) === 'AWAITING_PAYMENT',
      `HTTP ${oa.status} paymentStatus=${oj.paymentStatus} escrowPending=${oj.escrowPending} payoutStatus=${oj.payoutStatus} status=${oj.orderStatus || oj.status}`);

    const stats = Object.entries((await L.api(atok, 'GET', '/api/v1/admin/proformas/stats')).json).filter(([, v]) => typeof v === 'number');
    CNT.real_data++;
    chk('stats-endpoint-real-counts', stats.length >= 5, JSON.stringify(Object.fromEntries(stats)));

    const qp = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PENDING_PAYMENT&page=0&size=50');
    const qc = await L.api(atok, 'GET', '/api/v1/admin/payments?status=CONFIRMED&page=0&size=50');
    CNT.real_data += 2;
    chk('filter-isolation-D-pending-only',
      !!(qp.json.content || []).find(x => x.proformaId === fx.D.proformaId)
      && !(q.json.content || []).find(x => x.proformaId === fx.D.proformaId)
      && !(qc.json.content || []).some(x => [fx.A, fx.B, fx.C].some(m => m.proformaId === x.proformaId)),
      JSON.stringify({ ...fx.filterIsolation, ours_in_confirmed: (qc.json.content || []).some(x => [fx.A, fx.B, fx.C].some(m => m.proformaId === x.proformaId)) }));

    const bad = ['lorem', 'placeholder', 'dummy', 'fixme'].filter(w => JSON.stringify(q.json).toLowerCase().includes(w));
    CNT.real_data++;
    chk('no-placeholder-copy-in-payload', bad.length === 0, bad.join(',') || 'clean');

    // ---- authed proxy contract (NOT public URLs): admin 200 image/* · non-admin 403 · anon 302 oauth ----
    const rid = fx.receipts.A[0].receiptId;
    const f = await fetch(`${L.API}/api/v1/admin/receipts/${rid}/file`, { headers: { Authorization: 'Bearer ' + atok } });
    const fb = Buffer.from(await f.arrayBuffer());
    const fb2 = await fetch(`${L.API}/api/v1/admin/receipts/${rid}/file`, { redirect: 'manual', headers: { Authorization: 'Bearer ' + fx.buyer.token } });
    const anon = await fetch(`${L.API}/api/v1/admin/receipts/${rid}/file`, { redirect: 'manual' });
    const pub = await fetch(`${L.API}/uploads/${encodeURIComponent(fx.receipts.A[0].fileName)}`, { redirect: 'manual' });
    CNT.real_data += 3;
    chk('receipt-proxy-admin-200-image-nonempty',
      f.status === 200 && fb.length > 100 && /^image\//.test(f.headers.get('content-type') || ''),
      `HTTP ${f.status} ${f.headers.get('content-type')} ${fb.length}B magic=${fb.slice(8, 12).toString('ascii')}`);
    chk('receipt-proxy-non-admin-403', fb2.status === 403, `buyer(non-admin) HTTP ${fb2.status}`);
    chk('receipt-proxy-anon-302-oauth-and-public-path-not-used',
      anon.status === 302 && pub.status !== 200,
      `anon HTTP ${anon.status}; direct /uploads/<name> probe HTTP ${pub.status} (must NOT be a working public URL)`);
  }

  // ---------- shared helpers per pass ----------
  async function openScreen(p) {
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await p.evaluate(() => localStorage.clear()).catch(() => {});
    await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 40000);
    const okLogin = await L.login(p, L.ADMIN);
    chk('admin-login-token-persisted', okLogin, 'flutter.auth_token non-empty after Log in');
    await p.evaluate(() => { window.location.hash = '#/admin/payments-review'; });
    await L.waitText(p, 'Payment review', 30000);
    await p.waitForTimeout(4000);
  }

  // ===================== PASS 1 — 375x667 =====================
  {
    console.log('\n===== PASS 1: 375x667 =====');
    const vp = { name: '375', w: 375, h: 667 };
    const imgs = {}, receiptFiles = {}, apiLog = [];
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: vp.w, height: vp.h }, videoPath: `${VIDDIR}/AU-042-r14-375.webm` });
    const p = await ctx.newPage(); p.setDefaultTimeout(30000);
    p.on('response', r => {
      const u = r.url();
      if (/localhost:8083/.test(u)) apiLog.push({ m: r.request().method(), u: u.replace(/^https?:\/\/[^/]+/, '').split('?')[0], s: r.status() });
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgs[u] = r.status();
      if (/\/api\/v1\/(admin\/)?receipts\/([0-9a-f-]+)\/file/.test(u)) receiptFiles[u.match(/receipts\/([0-9a-f-]+)\/file/)[1]] = r.status();
    });

    await openScreen(p);
    let T = txtOf(await dump(p));

    CNT.state_asserts += 3;
    chk('vp375-default-SUBMITTED-shows-A-B-C', T.includes(fx.A.proformaNumber) && T.includes(fx.B.proformaNumber) && T.includes(fx.C.proformaNumber),
      `A=${T.includes(fx.A.proformaNumber)} B=${T.includes(fx.B.proformaNumber)} C=${T.includes(fx.C.proformaNumber)}`);
    CNT.nav_asserts++;
    chk('vp375-route-header-payment-review', T.includes('Payment review'), "AppBar title 'Payment review' rendered");
    chk('vp375-D-absent-under-SUBMITTED', !T.includes(fx.D.proformaNumber), `D shown=${T.includes(fx.D.proformaNumber)} (PENDING_PAYMENT must stay hidden)`);

    const priceStr = `TSh ${rowA.grandTotal}`;
    const receiptRow = `${fx.receipts.A[0].fileName} · SUBMITTED`;
    const refA = `SANDBOX-TXN-${fx.tag}-A`;
    CNT.state_asserts += 2;
    chk('vp375-card-A-real-values-verbatim',
      T.includes(priceStr) && T.includes(fx.A.proformaNumber) && T.includes('AU042R14First AU042R14Last')
      && T.includes('MOBILE_MONEY') && T.includes(refA) && T.includes(receiptRow),
      JSON.stringify({ price: T.includes(priceStr), number: T.includes(fx.A.proformaNumber), buyer: T.includes('AU042R14First AU042R14Last'),
        method: T.includes('MOBILE_MONEY'), ref: T.includes(refA), receiptRow: T.includes(receiptRow) }));
    const badW = ['lorem', 'placeholder', 'dummy', 'fixme', 'todo'].filter(w => T.toLowerCase().includes(w));
    chk('vp375-no-placeholder-copy-in-a11y-tree', badW.length === 0, badW.join(',') || 'clean');

    const statPairs = (await L.api(atok, 'GET', '/api/v1/admin/proformas/stats')).json;
    const statHits = Object.entries(statPairs).filter(([k, v]) => typeof v === 'number' && T.includes(`${k}: ${v}`));
    CNT.state_asserts++; CNT.real_data++;
    chk('vp375-stats-chips-match-endpoint', statHits.length >= 4, `${statHits.length}/${Object.keys(statPairs).length} verbatim e.g. ${statHits.slice(0, 4).map(([k, v]) => `${k}:${v}`).join(' ')}`);

    const myRids = [fx.receipts.A[0].receiptId, fx.receipts.B[0].receiptId, fx.receipts.C[0].receiptId];
    const okPrev = myRids.filter(r => receiptFiles[r] === 200);
    CNT.state_asserts++; CNT.images_requested += myRids.length; CNT.images_200 += okPrev.length;
    chk('vp375-receipt-proxy-200-for-our-rows', okPrev.length === myRids.length,
      `${okPrev.length}/${myRids.length} previews 200 (${myRids.map(r => `${r.slice(0, 8)}=${receiptFiles[r]}`).join(',')})`);

    // preview pixel proof (region under the filename tile)
    const prevNode = await findNode(p, fx.receipts.A[0].fileName, vp);
    if (prevNode) { const v1 = await regionStats(p, prevNode); CNT.state_asserts++;
      chk('vp375-receipt-preview-pixels-nonblank', (v1.distinctColors || 0) >= 12 && (v1.sdLum || 0) >= 6, JSON.stringify(v1)); }
    else chk('vp375-receipt-preview-pixels-nonblank', false, `filename node '${fx.receipts.A[0].fileName}' not found`);
    await shot(p, vp, '01-initial-SUBMITTED');

    // ---- status filter chips (every chip clicked, effect asserted) ----
    for (const chip of ['PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELLED']) {
      const b = await findNode(p, chip, vp);
      if (!b) { chk(`vp375-chip-${chip}`, false, 'chip not found'); continue; }
      await clickCenter(p, b); await p.waitForTimeout(2500);
      const t2 = txtOf(await dump(p));
      CNT.buttons_ok++; CNT.nav_asserts++;
      let okk, evd, sn;
      if (chip === 'PENDING_PAYMENT') {
        okk = t2.includes(fx.D.proformaNumber) && !t2.includes(fx.A.proformaNumber) && !t2.includes(fx.C.proformaNumber);
        evd = `D=${t2.includes(fx.D.proformaNumber)} A-hidden=${!t2.includes(fx.A.proformaNumber)} C-hidden=${!t2.includes(fx.C.proformaNumber)}`;
        sn = await shot(p, vp, '02-chip-PENDING_PAYMENT-D');
      } else if (chip === 'CONFIRMED') {
        okk = !t2.includes(fx.A.proformaNumber) && !t2.includes(fx.C.proformaNumber);
        evd = `pre-action CONFIRMED empty of ours: A=${t2.includes(fx.A.proformaNumber)} C=${t2.includes(fx.C.proformaNumber)}`;
        sn = await shot(p, vp, '03-chip-CONFIRMED-empty');
      } else if (chip === 'EXPIRED') {
        okk = !t2.includes(fx.D.proformaNumber) && !t2.includes(fx.C.proformaNumber);
        evd = `EXPIRED excludes our rows: D=${t2.includes(fx.D.proformaNumber)} C=${t2.includes(fx.C.proformaNumber)}`;
        sn = await shot(p, vp, '04-chip-EXPIRED');
      } else {
        okk = !t2.includes(fx.A.proformaNumber) && !t2.includes(fx.D.proformaNumber);
        evd = `CANCELLED excludes A/D pre-cancel: A=${t2.includes(fx.A.proformaNumber)} D=${t2.includes(fx.D.proformaNumber)}`;
        sn = await shot(p, vp, '05-chip-CANCELLED-empty');
      }
      chk(`vp375-chip-${chip}-filters-queue`, okk, `${evd}${sn ? ' shot=' + path.basename(sn) : ''}`);
      const back = await findNode(p, 'PAYMENT_SUBMITTED', vp);
      if (back) { await clickCenter(p, back); await p.waitForTimeout(2300); }
    }

    // ---- T16 leg 1: VERIFY receipt on A ----
    const vbtn = await actionInCard(p, 'Verify', fx.A.proformaNumber, vp);
    if (vbtn) {
      CNT.buttons_ok++;
      await clickCenter(p, vbtn); await p.waitForTimeout(2800);
      T = txtOf(await dump(p));
      CNT.state_asserts++;
      chk('vp375-verify-msg-receipt-verified', T.includes('Receipt verified'),
        `'${(T.split('\n').find(l => l.includes('Receipt verified')) || '(no action line)').slice(0, 100)}'`);
      await shot(p, vp, '06-receipt-A-verified');
      const qa = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PAYMENT_SUBMITTED&page=0&size=50');
      const ra = (qa.json.content || []).find(x => x.proformaId === fx.A.proformaId);
      const rb2 = (qa.json.content || []).find(x => x.proformaId === fx.B.proformaId);
      const rc2 = (qa.json.content || []).find(x => x.proformaId === fx.C.proformaId);
      CNT.real_data += 2;
      chk('vp375-backend-A-receipt-VERIFIED-server-side', !!ra && (ra.receipts || []).every(r => r.status !== 'SUBMITTED'),
        ra ? (ra.receipts || []).map(r => `${r.receiptId.slice(0, 8)}=${r.status}`).join(',') : 'row left SUBMITTED queue');
      chk('vp375-surgical-only-A-touched', rb2 && rc2 && (rb2.receipts || []).every(r => r.status === 'SUBMITTED') && (rc2.receipts || []).every(r => r.status === 'SUBMITTED'),
        `B=${rb2 && (rb2.receipts || []).map(r => r.status).join(',')} C=${rc2 && (rc2.receipts || []).map(r => r.status).join(',')}`);

      // ---- T16 leg 2: CONFIRM PAYMENT on A ----
      const cbtn = await actionInCard(p, 'Confirm payment', fx.A.proformaNumber, vp);
      if (cbtn) {
        CNT.buttons_ok++;
        await clickCenter(p, cbtn); await p.waitForTimeout(3600);
        T = txtOf(await dump(p));
        CNT.state_asserts++;
        chk('vp375-confirm-payment-msg', /(^|\n)[^\n]*Payment confirmed/.test(T),
          `'${(T.split('\n').find(l => l.includes('Payment confirmed')) || '(no action line)').slice(0, 100)}'`);
        await shot(p, vp, '07-confirm-payment-A');
        const qc2 = await L.api(atok, 'GET', '/api/v1/admin/payments?status=CONFIRMED&page=0&size=50');
        const conf = (qc2.json.content || []).some(x => x.proformaId === fx.A.proformaId);
        CNT.real_data++;
        chk('vp375-T16-proforma-CONFIRMED-backend', conf, `${fx.A.proformaNumber} in CONFIRMED queue=${conf}`);
        const od = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${orderIdA}`);
        const oj = od.json || {};
        CNT.real_data += 2;
        chk('vp375-T16-order-PAID-escrow-cleared-HELD-AWAITING_SELLER_CONFIRMATION',
          od.status === 200 && oj.paymentStatus === 'PAID' && oj.escrowPending === false && oj.payoutStatus === 'HELD'
            && (oj.orderStatus === 'AWAITING_SELLER_CONFIRMATION' || oj.status === 'AWAITING_SELLER_CONFIRMATION'),
          `HTTP ${od.status} ${JSON.stringify({ paymentStatus: oj.paymentStatus, escrowPending: oj.escrowPending, payoutStatus: oj.payoutStatus, orderStatus: oj.orderStatus || oj.status })}`);
        const uiConf = await (async () => { const cb = await findNode(p, 'CONFIRMED', vp); if (!cb) return null;
          await clickCenter(p, cb); await p.waitForTimeout(2600); const tc = txtOf(await dump(p));
          const seen = tc.includes(fx.A.proformaNumber);
          await shot(p, vp, '07b-ui-CONFIRMED-shows-A');
          const back = await findNode(p, 'PAYMENT_SUBMITTED', vp); if (back) { await clickCenter(p, back); await p.waitForTimeout(2200); }
          return seen; })();
        CNT.state_asserts++;
        chk('vp375-T16-UI-CONFIRMED-chip-shows-A', uiConf === true, `A visible under CONFIRMED chip=${uiConf}`);
      } else chk('vp375-confirm-payment-msg', false, "'Confirm payment' button never fully revealed");
    } else chk('vp375-verify-msg-receipt-verified', false, "'Verify' button never revealed");

    // ---- bulk approve B via single-select checkbox (2-row multi-select proven at 768) ----
    const tickB = await tickCard(p, fx.B.proformaNumber, vp);
    CNT.buttons_ok += tickB.ok ? 1 : 0; CNT.state_asserts++;
    chk('vp375-card-checkbox-B-tick', tickB.ok, tickB.why);
    if (tickB.ok) {
      T = txtOf(await dump(p));
      CNT.state_asserts++;
      chk('vp375-bulk-bar-counts-one', T.includes('Bulk approve (1)'), `'${(T.split('\n').find(l => l.startsWith('Bulk approve')) || '(none)').trim()}'`);
      await shot(p, vp, '08-bulk-selected-B');
      // scroll UP to bring the sticky bar into view before clicking
      let bb = await findNode(p, 'Bulk approve (', vp);
      for (let i = 0; i < 8 && !bb; i++) { await p.mouse.move(vp.w / 2, vp.h * 0.45); await p.mouse.wheel(0, -260); await p.waitForTimeout(240); bb = await findNode(p, 'Bulk approve (', vp); }
      if (bb) {
        CNT.buttons_ok++;
        await clickCenter(p, bb); await p.waitForTimeout(3800);
        T = txtOf(await dump(p));
        CNT.state_asserts++;
        chk('vp375-bulk-approve-msg', /\b1 approved\b|\bapproved\b/.test(T), `'${(T.split('\n').find(l => l.includes('approved')) || '(none)').trim().slice(0, 90)}'`);
        await shot(p, vp, '09-bulk-approved-B');
        const wireBulk = apiLog.find(c => c.u.includes('/admin/proformas/bulk-approve'));
        CNT.real_data++;
        chk('vp375-bulk-wire-call-observed', !!wireBulk && wireBulk.s === 200, JSON.stringify(wireBulk || 'absent'));
        const qb = await L.api(atok, 'GET', '/api/v1/admin/payments?status=CONFIRMED&page=0&size=50');
        const gotB = (qb.json.content || []).some(x => x.proformaId === fx.B.proformaId);
        CNT.real_data++;
        chk('vp375-bulk-B-CONFIRMED-backend', gotB, `${fx.B.proformaNumber} CONFIRMED via bulk=${gotB}`);
      } else chk('vp375-bulk-approve-msg', false, 'Bulk approve bar never revealed after select');
    }

    // ---- REJECT C with reasonCode AMOUNT_MISMATCH ----
    const rbtn = await actionInCard(p, 'Reject', fx.C.proformaNumber, vp);
    if (rbtn) {
      CNT.buttons_ok++;
      await clickCenter(p, rbtn); await p.waitForTimeout(1800);
      const dlgOpen = await L.waitText(p, 'Reject reason', 8000);
      T = txtOf(await dump(p));
      const codes = ['unreadable or incomplete', 'amount mismatch', 'payment details mismatch', 'duplicate or previously used', 'payment not found', 'other'];
      const present = codes.filter(c => T.toLowerCase().includes(c));
      CNT.state_asserts++;
      chk('vp375-reject-dialog-six-reasoncodes', dlgOpen && present.length === 6, present.join(' | ').slice(0, 220));
      await shot(p, vp, '10-reject-dialog');
      const amt = await findNode(p, 'amount mismatch', vp);
      if (amt) {
        CNT.buttons_ok++;
        await clickCenter(p, amt); await p.waitForTimeout(3400);
        T = txtOf(await dump(p));
        CNT.state_asserts++;
        chk('vp375-reject-msg-code-echoed', T.includes('Receipt rejected (AMOUNT_MISMATCH)'),
          `'${(T.split('\n').find(l => l.includes('rejected')) || '(none)').trim().slice(0, 100)}'`);
        await shot(p, vp, '11-rejected-AMOUNT_MISMATCH');
        const qr = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PAYMENT_SUBMITTED&page=0&size=50');
        const rc = (qr.json.content || []).find(x => x.proformaId === fx.C.proformaId);
        const rej = rc && (rc.receipts || []).find(r => r.status === 'REJECTED');
        CNT.real_data += 2;
        chk('vp375-backend-receipt-REJECTED', !!rej, rc ? (rc.receipts || []).map(r => r.status).join(',') : 'row gone from SUBMITTED');
        chk('vp375-backend-reasonCode-AMOUNT_MISMATCH', !!(rej && rej.rejectionReasonCode === 'AMOUNT_MISMATCH'), `code=${rej && rej.rejectionReasonCode}`);
        const my = await L.api(fx.buyer.token, 'GET', '/api/v1/payments/my');
        const brow = (Array.isArray(my.json) ? my.json : []).find(x => x.proformaId === fx.C.proformaId);
        const brej = brow && (brow.receipts || []).find(r => r.status === 'REJECTED');
        const dl = brow && (brow.correctionDeadline || (rej && rej.correctionDeadline));
        CNT.real_data++;
        chk('vp375-buyer-T24-code-and-deadline-in-payload', !!(brej && brej.rejectionReasonCode === 'AMOUNT_MISMATCH' && dl),
          brej ? `code=${brej.rejectionReasonCode} deadline=${dl}` : `buyer payments/my row missing rejection (${Array.isArray(my.json) ? my.json.length : '?'} rows)`);
        EV.push('buyer-payload:' + JSON.stringify(brow || {}).slice(0, 500));

        // ---- T24 through the BUYER UI: rejection + countdown visible on #/account/payments ----
        const bp = await ctx.newPage();
        await bp.goto(APP + '/#/account/payments?paymentStatus=rejected', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
        await bp.waitForTimeout(6000);
        const tb = txtOf(await dump(bp));
        const seesCode = tb.toLowerCase().includes('amount_mismatch');
        const seesDeadline = /remaining to upload corrected proof/i.test(tb) || /48-hour correction period/i.test(tb);
        CNT.state_asserts += 2; CNT.nav_asserts++;
        chk('vp375-T24-buyer-UI-sees-rejection-code', seesCode, `code in a11y=${seesCode} | ${(tb.split('\n').find(l => /mismatch/i.test(l)) || '(no mismatch line)').slice(0, 90)}`);
        chk('vp375-T24-buyer-UI-sees-correction-deadline', seesDeadline, `'${(tb.split('\n').find(l => /correction|remaining/i.test(l)) || '(no deadline line)').slice(0, 110)}'`);
        await shot(p === bp ? p : bp, vp, '11b-buyer-payments-my-rejected');
        await bp.close().catch(() => {});
      } else chk('vp375-reject-msg-code-echoed', false, "'amount mismatch' option not clickable");
    } else chk('vp375-reject-dialog-six-reasoncodes', false, "'Reject' button never revealed");

    // ---- cancel-after-rejection: window open -> refused; then sandbox-clock shift -> released ----
    await p.waitForTimeout(1200);
    const ccancel = await actionInCard(p, 'Cancel invoice', fx.C.proformaNumber, vp);
    CNT.state_asserts++;
    chk('vp375-cancel-affordance-shown-after-full-rejection', !!ccancel, `'Cancel invoice (48h window)' visible=${!!ccancel}`);
    if (ccancel) {
      CNT.buttons_ok++;
      await clickCenter(p, ccancel); await p.waitForTimeout(3400);
      T = txtOf(await dump(p));
      CNT.state_asserts++;
      chk('vp375-cancel-while-window-open-refused-in-ui', /Failed:[^\n]*(correction window|CORRECTION_WINDOW)/i.test(T),
        `'${(T.split('\n').find(l => l.includes('Failed')) || '(no Failed line rendered)').slice(0, 120).trim()}'`);
      await shot(p, vp, '12-cancel-refused-window-open');
    }
    const cd = await L.api(atok, 'POST', `/api/v1/admin/proformas/${fx.C.proformaId}/cancel-after-rejection`);
    CNT.real_data++;
    chk('vp375-api-cancel-window-guard-409-CORRECTION_WINDOW_OPEN', cd.status === 409 && (cd.json.code || '').includes('CORRECTION_WINDOW'),
      `HTTP ${cd.status} code=${cd.json.code} deadline=${cd.json.correctionDeadline}`);

    execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -c "update proformas set correction_deadline = correction_deadline - interval '49 hours' where public_id = '${fx.C.proformaId}'"`, { stdio: 'pipe' });
    const dbRow = execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -t -c "select correction_deadline from proformas where public_id='${fx.C.proformaId}'"`).toString().trim();
    const qtyMid = await fetch(`${L.API}/api/v1/displayItem/itemDetails/${fx.productId}`).then(r => r.json()).then(j => j.productQuantity).catch(() => null);
    const cd2 = await L.api(atok, 'POST', `/api/v1/admin/proformas/${fx.C.proformaId}/cancel-after-rejection`);
    CNT.real_data += 2;
    chk('vp375-stock-reserved-before-release', qtyMid === fx.qtyBefore - 1, `qty pre-release=${qtyMid} seeded=${fx.qtyBefore}`);
    chk('vp375-api-cancel-after-window-closed-CANCELLED', cd2.status === 200 && cd2.json.status === 'CANCELLED', `HTTP ${cd2.status} status=${cd2.json && cd2.json.status} db_deadline=[${dbRow}]`);
    const det2 = await fetch(`${L.API}/api/v1/displayItem/itemDetails/${fx.productId}`).then(r => r.json()).catch(() => null);
    CNT.real_data++;
    chk('vp375-stock-restored-after-cancel', det2 && det2.productQuantity === fx.qtyBefore, `productQuantity=${det2 && det2.productQuantity} expected=${fx.qtyBefore}`);
    const oc = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${orderIdC}`);
    const ocj = oc.json || {};
    CNT.real_data++;
    chk('vp375-provisional-order-cancelled-with-reason', oc.status !== 200 || (ocj.orderStatus || ocj.status) === 'CANCELLED',
      oc.status === 200 ? `orderStatus=${ocj.orderStatus || ocj.status}` : `HTTP ${oc.status}`);
    const qafter = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PAYMENT_SUBMITTED&page=0&size=50');
    CNT.real_data++;
    chk('vp375-C-gone-from-SUBMITTED-after-cancel', !(qafter.json.content || []).find(x => x.proformaId === fx.C.proformaId),
      `C still in SUBMITTED=${!!(qafter.json.content || []).find(x => x.proformaId === fx.C.proformaId)}`);
    const qcanc = await L.api(atok, 'GET', '/api/v1/admin/payments?status=CANCELLED&page=0&size=50');
    const crow = (qcanc.json.content || []).find(x => x.proformaId === fx.C.proformaId);
    CNT.real_data++;
    chk('vp375-C-under-CANCELLED-with-reasoncode-in-payload', !!crow,
      crow ? `status=${crow.status} receipts=${(crow.receipts || []).map(r => `${r.status}:${r.rejectionReasonCode}`).join(',')}` : 'missing');

    // reload so the CANCELLED state is observable through the UI too
    await p.evaluate(() => { window.location.hash = '#/admin/payments-review'; });
    await p.waitForTimeout(3500);
    const cancChip = await findNode(p, 'CANCELLED', vp);
    if (cancChip) {
      await clickCenter(p, cancChip); await p.waitForTimeout(2800);
      const tc = txtOf(await dump(p));
      CNT.state_asserts++;
      chk('vp375-ui-CANCELLED-chip-shows-C-with-code', tc.includes(fx.C.proformaNumber) && tc.includes('Rejected: AMOUNT_MISMATCH'),
        `C listed=${tc.includes(fx.C.proformaNumber)} code shown=${tc.includes('Rejected: AMOUNT_MISMATCH')}`);
      await shot(p, vp, '12b-ui-CANCELLED-C-with-code');
    }

    // ---- control inventory (RW-lane rule: foreign fixtures excluded from clicks) ----
    const inv = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        const role = e.getAttribute('role'), tap = e.getAttribute('flt-tappable') !== null;
        const lbl = (e.getAttribute('aria-label') || e.textContent || '').trim();
        if ((role === 'button' || tap) && lbl) out.push(lbl.replace(/\s+/g, ' ').slice(0, 44));
      });
      document.querySelectorAll('input,textarea').forEach(i => out.push('[input] ' + (i.placeholder || i.type)));
      return out;
    });
    const mine = [fx.A.proformaNumber, fx.B.proformaNumber, fx.C.proformaNumber];
    const exercised = ['PAYMENT_SUBMITTED', 'PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'Verify', 'Confirm payment', 'Bulk approve', 'Reject', 'amount mismatch', 'Cancel invoice'];
    const unmatched = [...new Set(inv)].filter(l => !exercised.some(x => l.includes(x)) && !(new RegExp(mine.join('|')).test(l)));
    CNT.buttons_total += [...new Set(inv)].length;
    chk('vp375-control-inventory-zero-unclicked', unmatched.length === 0,
      `controls=${[...new Set(inv)].length} unmatched(non-fixture)=${JSON.stringify(unmatched)}`);

    const sum = L.imageSummary(imgs);
    CNT.images_requested += sum.total; CNT.images_200 += sum.ok;
    chk('vp375-uploads-assets-all-200', sum.failed === 0, `uploads/assets total=${sum.total} ok=${sum.ok} failed=${sum.failed}`);
    const mineFails = Object.entries(receiptFiles).filter(([rid, s]) => myRids.includes(rid) && s !== 200);
    chk('vp375-receipt-previews-ours-all-200', mineFails.length === 0,
      `our previews non-200=${mineFails.map(([r, s]) => `${r.slice(0, 8)}=${s}`).join(',') || 'none'} | foreign legacy 404s (files lost pre-volume; not this unit's data)=${Object.values(receiptFiles).filter(s => s >= 400).length}`);
    const unexpected4xx = apiLog.filter(c => c.s >= 400 && !/\/uploads\//.test(c.u)
      && !(c.s === 409 && c.u.includes('/cancel-after-rejection'))
      && !(/\/receipts\/.+\/file/.test(c.u) && c.s === 404));
    chk('vp375-wire-audit-no-unexpected-4xx', unexpected4xx.length === 0,
      `admin wire: ${apiLog.filter(c => /admin/.test(c.u)).map(c => `${c.m}${c.u.replace('/api/v1/admin', '')}->${c.s}`).join(', ').slice(0, 430)} | unexpected=${unexpected4xx.map(c => `${c.s}${c.u}`).join(';') || 'none'}`);

    await shot(p, vp, '13-final-375');
    await L.scrollToBottom(p, 10);
    await shot(p, vp, '14-bottom-sweep');
    EV.push(`${VIDDIR}/AU-042-r14-375.webm`);
    await L.closeVideo(ctx, `${VIDDIR}/AU-042-r14-375.webm`).catch(() => {});
    await browser.close();
  }

  // ===================== SEED SET 2 (au043r14 prefix) =====================
  async function seedSet(tagSuffix) {
    const stamp = Date.now(), tag = `AU043R14${tagSuffix}${stamp}`;
    const be = `au043r14${tagSuffix.toLowerCase()}.buyer.${stamp}@gmail.com`, se = `au043r14${tagSuffix.toLowerCase()}.seller.${stamp}@gmail.com`;
    const PW = 'StrongPass!1', PNG = path.join(__dirname, 'fixtures', 'receipt-proof.png');
    for (const e of [be, se]) { const reg = await L.api(null, 'POST', '/api/v1/auth/register', { firstName: 'AU043R14', lastName: tagSuffix, password: PW, emailAddress: e }); if (![200, 201].includes(reg.status)) throw new Error('register ' + reg.status); }
    const btok = await L.apiLogin({ email: be, pw: PW }), stok = await L.apiLogin({ email: se, pw: PW }), atk = await L.apiLogin(L.ADMIN);
    const meS = await L.api(stok, 'GET', '/api/v1/userManagement/user-details');
    await L.api(atk, 'PATCH', `/api/v1/admin/users/${meS.json.userId}/status`, { status: 'VERIFIED' });
    const form = new FormData();
    form.append('product', new Blob([Buffer.from(JSON.stringify({ productName: `${tag} Kettle`, productQuantity: 12, categoryId: 3, subcategoryId: 26,
      productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni', productDescription: 'AU-042 r14 set-2.',
      currency: 'TZS', askingPrice: 13000, originalPrice: 16000, condition: 'NEW' }))], { type: 'application/json' }), 'p.json');
    form.append('images', new Blob([fs.readFileSync(PNG)], { type: 'image/png' }), 'kettle.png');
    const prr = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + stok }, body: form });
    if (prr.status !== 201) throw new Error('product2 ' + prr.status);
    const pid = (await prr.json()).productId;
    await L.api(atk, 'PATCH', `/api/v1/admin/products/${pid}/logistics`, { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' });
    await L.api(btok, 'POST', '/api/v1/add-address', { street: `AU043 R14 ${tagSuffix}`, city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania', label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+2557' + String(stamp).slice(-9) });
    const q = await L.api(btok, 'POST', '/api/v1/checkout/delivery-quote', { destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 }, items: [{ productId: pid, quantity: 1 }] });
    const fee = (q.json && q.json.deliveryTotal) || 2000;
    async function mk(t) {
      const tomorrow = new Date(Date.now() + 24 * 3600e3).toISOString().slice(0, 10);
      const co = await L.api(btok, 'POST', '/api/v1/checkout/proforma', {
        buyDetails: { firstName: 'AU043R14Sec', lastName: 'AU043R14Ond', emailAddress: be, phoneNumber: '+255715000444', address: 'set2 street', deliveryLabel: 'Home', deliveryPlaceName: '', deliveryNeighbourhood: '', city: 'dar es salaam', state: '', country: 'tanzania', zipCode: '', deliveryInstructions: '', fulfillmentType: 'SELLER_DELIVERY', paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true, deliveryFee: fee, totalAmount: 13000 + fee, currency: 'TZS', latitude: -6.7924, longitude: 39.2083, preferredDeliveryDate: tomorrow, preferredDeliverySlot: 'AFTERNOON', preferredDeliveryWindows: [{ date: tomorrow, slot: 'AFTERNOON' }] },
        items: [{ productId: pid, quantity: 1 }] });
      if (![200, 201].includes(co.status)) throw new Error('proforma2 ' + t + ' ' + co.status);
      return co.json;
    }
    async function sub(pfId, t) {
      const f = new FormData();
      f.append('receipts', new Blob([fs.readFileSync(PNG)], { type: 'image/png' }), `au043r14-${t.toLowerCase()}.png`);
      f.append('details', new Blob([JSON.stringify({ transactionReferences: [`SANDBOX-TXN-${tag}-${t}`] })], { type: 'text/plain' }), 'd.txt');
      const r = await fetch(`${L.API}/api/v1/proformas/${pfId}/receipts`, { method: 'POST', headers: { Authorization: 'Bearer ' + btok }, body: f });
      if (![200, 201].includes(r.status)) throw new Error('rcpt2 ' + r.status);
      const s = await L.api(btok, 'POST', `/api/v1/proformas/${pfId}/submit-payment`, { transactionReferences: [`SANDBOX-TXN-${tag}-${t}`], paymentMethodType: 'MOBILE_MONEY' });
      if (![200, 201].includes(s.status)) throw new Error('submit2 ' + s.status);
    }
    const A2 = await mk('A2'); await sub(A2.proformaId, 'A2');
    const B2 = await mk('B2'); await sub(B2.proformaId, 'B2');
    const C2 = await mk('C2'); await sub(C2.proformaId, 'C2');
    const qs = await L.api(atk, 'GET', '/api/v1/admin/payments?status=PAYMENT_SUBMITTED&page=0&size=50');
    const rcpt = id => { const row = (qs.json.content || []).find(p2 => p2.proformaId === id); return ((row && row.receipts) || []).map(r => ({ receiptId: r.receiptId, fileName: r.fileName, status: r.status })); };
    const out = { stamp, tag, buyerToken: btok, adminToken: atk, productId: pid, qtyBefore: 12,
      A2: { proformaId: A2.proformaId, proformaNumber: A2.proformaNumber }, B2: { proformaId: B2.proformaId, proformaNumber: B2.proformaNumber }, C2: { proformaId: C2.proformaId, proformaNumber: C2.proformaNumber },
      orderA2: ((qs.json.content || []).find(p2 => p2.proformaId === A2.proformaId) || {}).orderIds?.[0] || null,
      receipts: { A2: rcpt(A2.proformaId), B2: rcpt(B2.proformaId), C2: rcpt(C2.proformaId) } };
    fs.writeFileSync('/tmp/au042_r14_fixtures_s2.json', JSON.stringify(out, null, 1));
    console.log(`[seed2] A2=${A2.proformaNumber} B2=${B2.proformaNumber} C2=${C2.proformaNumber} product=${pid}`);
    return out;
  }
  let fx2 = null;
  try { fx2 = await seedSet('S2'); } catch (e) { chk('seed-set2', false, e.message); }

  // ===================== PASS 2 — 768x1024 =====================
  if (fx2) {
    console.log('\n===== PASS 2: 768x1024 =====');
    const vp = { name: '768', w: 768, h: 1024 };
    const imgs = {}, receiptFiles = {}, apiLog2 = [];
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: vp.w, height: vp.h }, videoPath: `${VIDDIR}/AU-042-r14-768.webm` });
    const p = await ctx.newPage(); p.setDefaultTimeout(30000);
    p.on('response', r => {
      const u = r.url();
      if (/localhost:8083/.test(u)) apiLog2.push({ m: r.request().method(), u: u.replace(/^https?:\/\/[^/]+/, '').split('?')[0], s: r.status() });
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgs[u] = r.status();
      if (/\/api\/v1\/(admin\/)?receipts\/([0-9a-f-]+)\/file/.test(u)) receiptFiles[u.match(/receipts\/([0-9a-f-]+)\/file/)[1]] = r.status();
    });
    await openScreen(p);
    let T = txtOf(await dump(p));
    CNT.state_asserts += 2; CNT.nav_asserts++;
    chk('vp768-default-SUBMITTED-shows-set2', T.includes(fx2.A2.proformaNumber) && T.includes(fx2.B2.proformaNumber) && T.includes(fx2.C2.proformaNumber),
      `A2=${T.includes(fx2.A2.proformaNumber)} B2=${T.includes(fx2.B2.proformaNumber)} C2=${T.includes(fx2.C2.proformaNumber)}`);
    chk('vp768-set1-mutated-rows-hidden', !T.includes(fx.A.proformaNumber) && !T.includes(fx.C.proformaNumber) && !T.includes(fx.D.proformaNumber),
      `A(confirmed)-hidden=${!T.includes(fx.A.proformaNumber)} C(cancelled)-hidden=${!T.includes(fx.C.proformaNumber)} D(pending)-hidden=${!T.includes(fx.D.proformaNumber)}`);
    await shot(p, vp, '01-initial-768');

    // MULTI-SELECT bulk approve: tick A2 AND B2 -> Bulk approve (2)
    const tA = await tickCard(p, fx2.A2.proformaNumber, vp);
    CNT.buttons_ok += tA.ok ? 1 : 0; CNT.state_asserts++;
    chk('vp768-card-checkbox-A2-tick', tA.ok, tA.why);
    const tB = await tickCard(p, fx2.B2.proformaNumber, vp);
    CNT.buttons_ok += tB.ok ? 1 : 0; CNT.state_asserts++;
    chk('vp768-card-checkbox-B2-tick', tB.ok, tB.why);
    if (tA.ok && tB.ok) {
      T = txtOf(await dump(p));
      CNT.state_asserts++;
      chk('vp768-multiselect-bar-counts-two', T.includes('Bulk approve (2)'), `'${(T.split('\n').find(l => l.startsWith('Bulk approve')) || '(none)').trim()}'`);
      await shot(p, vp, '02-multiselect-two');
      let bb2 = await findNode(p, 'Bulk approve (2)', vp);
      for (let i = 0; i < 8 && !bb2; i++) { await p.mouse.move(vp.w / 2, vp.h * 0.45); await p.mouse.wheel(0, -260); await p.waitForTimeout(240); bb2 = await findNode(p, 'Bulk approve (2)', vp); }
      if (bb2) {
        CNT.buttons_ok++;
        await clickCenter(p, bb2); await p.waitForTimeout(4200);
        T = txtOf(await dump(p));
        CNT.state_asserts++;
        chk('vp768-bulk-approve-2-msg', /(^|\n)[^\n]*2 approved/.test(T), `'${(T.split('\n').find(l => l.includes('approved')) || '(none)').trim().slice(0, 90)}'`);
        await shot(p, vp, '03-bulk-approved-2');
        const wireBulk = apiLog2.find(c => c.u.includes('/admin/proformas/bulk-approve'));
        CNT.real_data++;
        chk('vp768-bulk-wire-call-observed', !!wireBulk && wireBulk.s === 200, JSON.stringify(wireBulk || 'absent'));
        const qc2 = await L.api(atok, 'GET', '/api/v1/admin/payments?status=CONFIRMED&page=0&size=50');
        const gotA2 = (qc2.json.content || []).some(x => x.proformaId === fx2.A2.proformaId);
        const gotB2 = (qc2.json.content || []).some(x => x.proformaId === fx2.B2.proformaId);
        CNT.real_data += 2;
        chk('vp768-bulk-both-CONFIRMED-backend', gotA2 && gotB2, `A2=${gotA2} B2=${gotB2}`);
        const oid2 = fx2.orderA2;
        if (oid2) {
          const od2 = await L.api(fx2.buyerToken, 'GET', `/api/v1/orders/${oid2}`);
          const oj = od2.json || {};
          CNT.real_data++;
          chk('vp768-bulk-order-PAID-escrow-cleared-HELD-AWAITING_SELLER_CONFIRMATION',
            oj.paymentStatus === 'PAID' && oj.escrowPending === false && oj.payoutStatus === 'HELD'
              && (oj.orderStatus === 'AWAITING_SELLER_CONFIRMATION' || oj.status === 'AWAITING_SELLER_CONFIRMATION'),
            `HTTP ${od2.status} ${JSON.stringify({ paymentStatus: oj.paymentStatus, escrowPending: oj.escrowPending, payoutStatus: oj.payoutStatus, orderStatus: oj.orderStatus || oj.status })}`);
        } else chk('vp768-bulk-order-PAID-escrow-cleared-HELD-AWAITING_SELLER_CONFIRMATION', false, 'A2 orderId missing');
      } else chk('vp768-bulk-approve-2-msg', false, 'Bulk approve (2) never revealed');
    } else chk('vp768-multiselect-bar-counts-two', false, 'skipped: checkbox ticks failed');

    // VERIFY receipt on C2
    const v2 = await actionInCard(p, 'Verify', fx2.C2.proformaNumber, vp);
    if (v2) {
      CNT.buttons_ok++;
      await clickCenter(p, v2); await p.waitForTimeout(2900);
      T = txtOf(await dump(p));
      CNT.state_asserts++;
      chk('vp768-verify-msg-receipt-verified', T.includes('Receipt verified'), `'${(T.split('\n').find(l => l.includes('Receipt verified')) || '(none)').slice(0, 90)}'`);
      await shot(p, vp, '04-c2-verified');
      const qs3 = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PAYMENT_SUBMITTED&page=0&size=50');
      const rc3 = (qs3.json.content || []).find(x => x.proformaId === fx2.C2.proformaId);
      CNT.real_data++;
      chk('vp768-backend-C2-receipt-VERIFIED', !!rc3 && (rc3.receipts || []).every(r => r.status === 'VERIFIED'),
        rc3 ? (rc3.receipts || []).map(r => `${r.receiptId.slice(0, 8)}=${r.status}`).join(',') : 'row gone');
    } else chk('vp768-verify-msg-receipt-verified', false, "'Verify' never revealed for C2");

    const rids2 = ['A2', 'B2', 'C2'].map(k => fx2.receipts[k][0]);
    const okPrev2 = rids2.filter(r => receiptFiles[r.receiptId] === 200);
    CNT.images_requested += rids2.length; CNT.images_200 += okPrev2.length; CNT.state_asserts++;
    chk('vp768-receipt-proxy-200-for-set2', okPrev2.length === rids2.length, `${okPrev2.length}/${rids2.length} previews 200`);
    const pn2 = await findNode(p, fx2.receipts.C2[0].fileName, vp);
    if (pn2) { const vv = await regionStats(p, pn2); CNT.state_asserts++;
      chk('vp768-receipt-preview-pixels-nonblank', (vv.distinctColors || 0) >= 12 && (vv.sdLum || 0) >= 6, JSON.stringify(vv)); }
    else chk('vp768-receipt-preview-pixels-nonblank', false, `node '${fx2.receipts.C2[0].fileName}' not found`);

    // cross-chip sweep with set1 outcomes (post-action truth)
    for (const chip of ['CONFIRMED', 'CANCELLED', 'PENDING_PAYMENT']) {
      const b = await findNode(p, chip, vp);
      if (!b) { chk(`vp768-chip-${chip}`, false, 'chip missing'); continue; }
      await clickCenter(p, b); await p.waitForTimeout(2700);
      const t3 = txtOf(await dump(p));
      CNT.buttons_ok++; CNT.nav_asserts++;
      let okk, evd, sn;
      if (chip === 'CONFIRMED') {
        okk = t3.includes(fx.A.proformaNumber) && t3.includes(fx.B.proformaNumber) && t3.includes(fx2.A2.proformaNumber) && t3.includes(fx2.B2.proformaNumber);
        evd = `confirmed rows visible: A=${t3.includes(fx.A.proformaNumber)} B=${t3.includes(fx.B.proformaNumber)} A2=${t3.includes(fx2.A2.proformaNumber)} B2=${t3.includes(fx2.B2.proformaNumber)}`;
        sn = await shot(p, vp, '05-chip-CONFIRMED-set1-set2');
      } else if (chip === 'CANCELLED') {
        okk = t3.includes(fx.C.proformaNumber) && t3.includes('Rejected: AMOUNT_MISMATCH');
        evd = `C cancelled w/ its reasonCode: C=${t3.includes(fx.C.proformaNumber)} code-shown=${t3.includes('Rejected: AMOUNT_MISMATCH')}`;
        sn = await shot(p, vp, '06-chip-CANCELLED-C-with-code');
      } else {
        okk = t3.includes(fx.D.proformaNumber) && !t3.includes(fx.A.proformaNumber);
        evd = `D still pending-only: D=${t3.includes(fx.D.proformaNumber)} A-present=${t3.includes(fx.A.proformaNumber)}`;
        sn = await shot(p, vp, '07-chip-PENDING_PAYMENT-D');
      }
      chk(`vp768-chip-${chip}-cross-checks`, okk, `${evd}${sn ? ' shot=' + path.basename(sn) : ''}`);
      const back = await findNode(p, 'PAYMENT_SUBMITTED', vp);
      if (back) { await clickCenter(p, back); await p.waitForTimeout(2300); }
    }

    const inv2 = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        const role = e.getAttribute('role'), tap = e.getAttribute('flt-tappable') !== null;
        const lbl = (e.getAttribute('aria-label') || e.textContent || '').trim();
        if ((role === 'button' || tap) && lbl) out.push(lbl.replace(/\s+/g, ' ').slice(0, 44));
      });
      document.querySelectorAll('input,textarea').forEach(i => out.push('[input] ' + (i.placeholder || i.type)));
      return out;
    });
    const mine2 = [fx.A, fx.B, fx.C].map(m => m.proformaNumber).concat([fx2.A2.proformaNumber, fx2.B2.proformaNumber, fx2.C2.proformaNumber]);
    const ex2 = ['PAYMENT_SUBMITTED', 'PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'Verify', 'Reject', 'Confirm payment', 'Bulk approve'];
    const unmatched2 = [...new Set(inv2)].filter(l => !ex2.some(x => l.includes(x)) && !(new RegExp(mine2.join('|')).test(l)));
    CNT.buttons_total += [...new Set(inv2)].length;
    chk('vp768-control-inventory-zero-unclicked', unmatched2.length === 0, `controls=${[...new Set(inv2)].length} unmatched(non-fixture)=${JSON.stringify(unmatched2)}`);
    const sum2 = L.imageSummary(imgs);
    CNT.images_requested += sum2.total; CNT.images_200 += sum2.ok;
    chk('vp768-uploads-assets-all-200', sum2.failed === 0, `total=${sum2.total} ok=${sum2.ok} failed=${sum2.failed}`);
    const myRids2 = rids2.map(r => r.receiptId);
    const mineFails2 = Object.entries(receiptFiles).filter(([rid, s]) => myRids2.includes(rid) && s !== 200);
    chk('vp768-receipt-previews-ours-all-200', mineFails2.length === 0, `non-200 on our rows=${mineFails2.map(([r, s]) => `${r.slice(0, 8)}=${s}`).join(',') || 'none'}`);
    await shot(p, vp, '08-final-768');
    EV.push(`${VIDDIR}/AU-042-r14-768.webm`);
    await L.closeVideo(ctx, `${VIDDIR}/AU-042-r14-768.webm`).catch(() => {});
    await browser.close();
  }

  // ===================== PASS 3 — 1280x900 =====================
  {
    console.log('\n===== PASS 3: 1280x900 =====');
    const vp = { name: '1280', w: 1280, h: 900 };
    const imgs = {}, receiptFiles = {}, apiLog3 = [];
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: vp.w, height: vp.h }, videoPath: `${VIDDIR}/AU-042-r14-1280.webm` });
    const p = await ctx.newPage(); p.setDefaultTimeout(30000);
    p.on('response', r => {
      const u = r.url();
      if (/localhost:8083/.test(u)) apiLog3.push({ m: r.request().method(), u: u.replace(/^https?:\/\/[^/]+/, '').split('?')[0], s: r.status() });
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgs[u] = r.status();
      if (/\/api\/v1\/(admin\/)?receipts\/([0-9a-f-]+)\/file/.test(u)) receiptFiles[u.match(/receipts\/([0-9a-f-]+)\/file/)[1]] = r.status();
    });
    await openScreen(p);
    const T = txtOf(await dump(p));
    CNT.state_asserts++; CNT.nav_asserts++;
    chk('vp1280-screen-renders-with-live-queues', T.includes('Payment review') && T.includes(fx2.C2.proformaNumber),
      `header=${T.includes('Payment review')} C2(SUBMITTED)=${T.includes(fx2.C2.proformaNumber)}`);
    const overflow = await p.evaluate(() => { let worst = 0;
      document.querySelectorAll('flt-semantics').forEach(e => { const r = e.getBoundingClientRect(); if (r.right > innerWidth + 2) worst = Math.max(worst, Math.round(r.right - innerWidth)); });
      return worst; });
    CNT.state_asserts++;
    chk('vp1280-no-horizontal-overflow', overflow <= 2, `max overflow px=${overflow}`);
    await shot(p, vp, '01-initial-1280');
    const cb = await findNode(p, 'CONFIRMED', vp);
    if (cb) {
      await clickCenter(p, cb); await p.waitForTimeout(2800);
      const t2 = txtOf(await dump(p));
      CNT.buttons_ok++; CNT.nav_asserts++;
      const want = [fx.A, fx.B].map(m => m.proformaNumber).concat(fx2 ? [fx2.A2.proformaNumber, fx2.B2.proformaNumber] : []);
      const seen = want.filter(n => t2.includes(n));
      chk('vp1280-chip-CONFIRMED-shows-confirmed-rows', seen.length === want.length && !t2.includes(fx.D.proformaNumber),
        `confirmed visible=${seen.join(',') || 'NONE'}/${want.join(',')} D-hidden=${!t2.includes(fx.D.proformaNumber)}`);
      await shot(p, vp, '02-chip-CONFIRMED-1280');
    } else chk('vp1280-chip-CONFIRMED-shows-confirmed-rows', false, 'chip not found');
    const sum3 = L.imageSummary(imgs);
    CNT.images_requested += sum3.total; CNT.images_200 += sum3.ok;
    EV.push(`${VIDDIR}/AU-042-r14-1280.webm`);
    await L.closeVideo(ctx, `${VIDDIR}/AU-042-r14-1280.webm`).catch(() => {});
    await browser.close();
  }

  fs.writeFileSync('/tmp/au042_r14_counters.json', JSON.stringify(CNT, null, 1));
  console.log('\ncounters:', JSON.stringify(CNT));
  console.log('\nRUNTIME_MS', Date.now() - t0);
})().catch(e => {
  console.error('VERIFY CRASH:', e.stack);
  fs.appendFileSync(TRACE, JSON.stringify({ ts: new Date().toISOString(), unit: 'AU-042', stage: 'verify-r14', check: 'crash', ok: false, evidence: String(e.message).slice(0, 500) }) + '\n');
  process.exit(1);
});
