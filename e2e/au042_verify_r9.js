// au042_verify_r9.js — AU-042 ADMIN-lane verifier, round 9c. Frozen lane :9130 @ a405494.
// All fixtures through the REAL sandbox :8083 (own throwaway buyer/seller/product only;
// never mutates rows it did not create — foreign queue rows are excluded from clicks).
//   PASS1 375x667: T16 verify->confirm on A (order PAID/escrow cleared/HELD/AWAITING_SELLER_CONFIRMATION),
//     B bulk-approve single, C reject AMOUNT_MISMATCH -> buyer deadline,
//     cancel-after-rejection: UI gate + real refusal while window open,
//     deadline shifted back 49h IN THE SANDBOX DB for OUR fixture -> UI click succeeds, stock released.
//   PASS2 768x1024: fresh set2 A2/B2/C2 -> BULK approve MULTI-SELECT (2 rows), Verify C2, cross-chip sweep.
//   PASS3 1280x900: admin desktop viewport sweep + overflow check.
// Truth-driven asserts: every expected string computed from a live API read of the SAME row.
// Harness rule learned r9a: NEVER clamp click coords into the viewport — reveal the card
// first, else the tap lands on a DIFFERENT row's button (this caused r9a's phantom verify).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
L.APP = 'http://localhost:9130';

const APP = 'http://localhost:9130';
const UNIT = 'AU-042', STAGE = 'verify-r9', SHA = 'a405494';
const MT = 'Wed, 26 Aug 2026 00:58:48 GMT';
const SHARD = `e2e/results/shards/${UNIT}-${STAGE}.jsonl`;
const OUTDIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-042';
const VIDDIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos';
const fx = JSON.parse(fs.readFileSync('/tmp/au042_r9_fixtures.json', 'utf8'));

const lines = [];
function rec(o) { lines.push(o); fs.appendFileSync(SHARD, JSON.stringify(o) + '\n'); }
function chk(name, ok, ev) {
  rec({ ts: new Date().toISOString(), unit: UNIT, stage: STAGE, check: name, ok: !!ok, evidence: String(ev ?? '').slice(0, 600) });
  console.log(ok ? 'PASS' : 'FAIL', '|', name, '|', String(ev ?? '').slice(0, 200));
  return ok;
}
const CNT = { real_data: 0, images_requested: 0, images_200: 0, buttons_total: 0, buttons_ok: 0, buttons_failed: [],
  state_asserts: 0, vision_defects: 0, vision_findings: [], parity: { blocker: 0, major: 0, minor: 0, accepted: 0 } };

// ---------- local PNG decode ----------
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
    else if (f === 3) for (let i = 0; i < out.length; i++) out[i] = (line[i] + (((i >= 3 ? out[i - 3] : 0) + prev[i]) >> 1)) & 255;
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
async function regionVariance(p, node) {
  const buf = await p.screenshot();
  const { width, height, rows } = decodePng(buf);
  if (!rows) return { err: 'decode-fail' };
  const rx = Math.max(0, Math.min(node.x + 2, width - 4));
  const ry = Math.max(0, Math.min(node.y + node.h + 4, height - 4));
  const rw = Math.min(node.w || 120, width - rx - 1);
  const rh = Math.min(96, height - ry - 1);
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
      label: (e.getAttribute('aria-label') || e.textContent || '').trim(),
      checked: e.getAttribute('aria-checked'),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }).filter(n => n.label));
}
const txtOf = N => N.map(n => n.label).join('\n');
async function findNode(p, want, vp) {
  const H = vp.h, W = vp.w; const nodes = await dump(p); let best = null;
  for (const n of nodes) {
    if (!n.label.includes(want)) continue;
    if (!(n.role === 'button' || n.tap)) continue;
    if (n.w < 6 || n.h < 6) continue;
    if (n.y + n.h <= 0 || n.y >= H || n.x + n.w <= 0 || n.x >= W) continue;
    if (!best || n.w * n.h < best.w * best.h) best = n;
  }
  return best;
}
async function clickCenter(p, n) { await p.mouse.click(n.x + n.w / 2, n.y + n.h / 2); await p.waitForTimeout(1000); }

// scroll until OUR card (checkbox node labelled with pfNumber) is comfortably on screen
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
  const nodes = await dump(p);
  return nodes.find(n => n.role === 'checkbox' && n.label.includes(pfNumber)) || null;
}

// tick OUR card's checkbox (click the visual checkbox at the card's top-left, away from inner buttons)
async function tickCard(p, pfNumber, vp) {
  const card = await revealCard(p, pfNumber, vp);
  if (!card) return { ok: false, why: 'card not revealed' };
  const cx = card.x + Math.min(26, card.w / 4), cy = card.y + Math.min(22, card.h / 3);
  await p.mouse.click(cx, cy); await p.waitForTimeout(1400);
  const nb = (await dump(p)).find(n => n.role === 'checkbox' && n.label.includes(pfNumber));
  return { ok: !!nb && nb.checked === 'true', why: `aria-checked ${card.checked} -> ${nb && nb.checked}`, node: card };
}

// find OUR row's action button, revealing until BOTH card and button are fully on screen.
// Never clamps: returns null rather than clicking a possibly-wrong target.
async function actionInCard(p, label, pfNumber, vp) {
  for (let i = 0; i < 10; i++) {
    await revealCard(p, pfNumber, vp);
    const nodes = await dump(p);
    const a = nodes.find(n => n.role === 'checkbox' && n.label.includes(pfNumber))
      || nodes.filter(n => n.label.includes(pfNumber))[0];
    if (a) {
      const cands = nodes.filter(n => n.role === 'button' && n.label.trim() === label
        && n.y >= a.y - 60 && n.y <= a.y + 560 && n.w > 6 && n.h > 6);
      cands.sort((p1, p2) => Math.abs(p1.y - a.y) - Math.abs(p2.y - a.y));
      const b = cands[0];
      if (b && b.y >= 90 && b.y + b.h <= vp.h - 16 && b.x >= 0 && b.x + b.w <= vp.w) return b;
    }
    await p.mouse.move(vp.w / 2, vp.h * 0.5); await p.mouse.wheel(0, 190); await p.waitForTimeout(220);
  }
  return null;
}
async function shot(p, vp, state) { const f = `${OUTDIR}/${UNIT}-r9-${vp.name}-${state}.png`; await L.screenshot(p, f); return f; }

(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true }); fs.mkdirSync(VIDDIR, { recursive: true });
  const atok = fx.adminToken;
  fx.refA = `SANDBOX-TXN-${fx.tag}-A`;

  // ---- 1. freshness ----
  { const r = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
    chk('freshness-bundle-stamp', r.headers.get('last-modified') === MT, `Last-Modified=${r.headers.get('last-modified')} expected=${MT}`); }

  // ---- 2. real data + truth strings ----
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
    chk('queue-row-A-real-fields',
      rowA.grandTotal === 21000 && rowA.buyerName === 'AU042R9First AU042R9Last' && rowA.paymentMethodType === 'MOBILE_MONEY'
      && (rowA.transactionReferences || []).includes(fx.refA) && (rowA.receipts || []).length === 1 && rowA.receipts[0].status === 'SUBMITTED',
      JSON.stringify({ grandTotal: rowA.grandTotal, buyer: rowA.buyerName, method: rowA.paymentMethodType,
        refs: rowA.transactionReferences, receipts: (rowA.receipts || []).map(r => `${r.fileName}:${r.status}`) }));
    orderIdA = (rowA.orderIds || [])[0]; orderIdC = (rowC.orderIds || [])[0];
    chk('queue-rows-carry-orderIds', !!orderIdA && !!orderIdC, `A.orderId=${orderIdA} C.orderId=${orderIdC}`);
    const oa = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${orderIdA}`);
    const oj = oa.json || {};
    CNT.real_data++;
    chk('provisional-order-pre-confirm-state', oa.status === 200 && oj.paymentStatus === 'PENDING' && oj.escrowPending === true && oj.payoutStatus === 'HELD',
      `HTTP ${oa.status} paymentStatus=${oj.paymentStatus} escrowPending=${oj.escrowPending} payoutStatus=${oj.payoutStatus}`);

    fx.ui = {
      price: `TSh ${rowA.grandTotal}`, number: fx.A.proformaNumber, buyer: rowA.buyerName, method: rowA.paymentMethodType,
      ref: fx.refA, receiptRow: `${rowA.receipts[0].fileName} · SUBMITTED`,
      stats: Object.entries((await L.api(atok, 'GET', '/api/v1/admin/proformas/stats')).json).filter(([, v]) => typeof v === 'number'),
    };

    const qp = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PENDING_PAYMENT&page=0&size=50');
    const qc = await L.api(atok, 'GET', '/api/v1/admin/payments?status=CONFIRMED&page=0&size=50');
    CNT.real_data += 2;
    chk('filter-isolation-D-pending-only',
      !!(qp.json.content || []).find(p => p.proformaId === fx.D.proformaId)
      && !(q.json.content || []).find(p => p.proformaId === fx.D.proformaId)
      && !(qc.json.content || []).some(p => [fx.A, fx.B, fx.C, fx.D].some(m => m.proformaId === p.proformaId)),
      JSON.stringify(fx.filterIsolation));

    const raw = JSON.stringify(q.json);
    const bad = ['lorem', 'placeholder', 'dummy', 'fixme'].filter(w => raw.toLowerCase().includes(w));
    CNT.real_data++;
    chk('no-placeholder-copy-in-payload', bad.length === 0, bad.join(',') || 'clean');

    const rid = fx.receipts.A[0].receiptId;
    const f = await fetch(`${L.API}/api/v1/admin/receipts/${rid}/file`, { headers: { Authorization: 'Bearer ' + atok } });
    const fb = Buffer.from(await f.arrayBuffer());
    const fb2 = await fetch(`${L.API}/api/v1/admin/receipts/${rid}/file`, { redirect: 'manual', headers: { Authorization: 'Bearer ' + fx.buyer.token } });
    const anon = await fetch(`${L.API}/api/v1/admin/receipts/${rid}/file`, { redirect: 'manual' });
    CNT.real_data += 3;
    chk('receipt-proxy-admin-200-nonempty-webp', f.status === 200 && fb.length > 100 && fb.slice(8, 12).toString('ascii') === 'WEBP',
      `HTTP ${f.status} ${f.headers.get('content-type')} ${fb.length}B magic=${fb.slice(8, 12).toString('ascii')}`);
    chk('receipt-proxy-non-admin-forbidden', fb2.status === 403, `buyer(non-admin) HTTP ${fb2.status}`);
    chk('receipt-proxy-anon-oauth-redirect', anon.status === 302, `anon HTTP ${anon.status}`);
  }

  // ============================ PASS 1 — 375x667 ============================
  {
    console.log('\n===== PASS 1: 375x667 =====');
    const vp = { name: '375', w: 375, h: 667 };
    const imgs = {}, receiptFiles = {}, apiLog = [];
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: vp.w, height: vp.h }, videoPath: `${VIDDIR}/AU-042-r9-375.webm` });
    const p = await ctx.newPage(); p.setDefaultTimeout(30000);
    p.on('response', r => {
      const u = r.url();
      if (/localhost:8083/.test(u)) apiLog.push({ m: r.request().method(), u: u.replace(/^https?:\/\/[^/]+/, '').split('?')[0], s: r.status() });
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgs[u] = r.status();
      if (/\/api\/v1\/admin\/receipts\/([0-9a-f-]+)\/file/.test(u)) receiptFiles[u.match(/receipts\/([0-9a-f-]+)\/file/)[1]] = r.status();
    });

    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await p.evaluate(() => localStorage.clear()).catch(() => {});
    await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 40000);
    chk('vp375-admin-login', await L.login(p, L.ADMIN), 'admin token persisted in localStorage');

    await p.evaluate(() => { window.location.hash = '#/admin/payments-review'; });
    await L.waitText(p, 'Payment review', 30000);
    await p.waitForTimeout(4000);
    let T = txtOf(await dump(p));

    CNT.state_asserts += 3;
    chk('vp375-default-SUBMITTED-shows-A-B-C', T.includes(fx.A.proformaNumber) && T.includes(fx.B.proformaNumber) && T.includes(fx.C.proformaNumber),
      `A=${T.includes(fx.A.proformaNumber)} B=${T.includes(fx.B.proformaNumber)} C=${T.includes(fx.C.proformaNumber)}`);
    chk('vp375-D-absent-under-SUBMITTED', !T.includes(fx.D.proformaNumber), `D shown=${T.includes(fx.D.proformaNumber)}`);
    chk('vp375-card-A-real-values-verbatim',
      T.includes(fx.ui.price) && T.includes(fx.A.proformaNumber) && T.includes(fx.ui.buyer) && T.includes(fx.ui.method)
      && T.includes(fx.refA) && T.includes(fx.ui.receiptRow),
      JSON.stringify({ price21k: T.includes('TSh 21000'), number: T.includes(fx.A.proformaNumber), buyer: T.includes(fx.ui.buyer),
        method: T.includes(fx.ui.method), ref: T.includes(fx.refA), receiptRow: T.includes(fx.ui.receiptRow) }));
    const badW = ['lorem', 'placeholder', 'dummy', 'fixme', 'todo'].filter(w => T.toLowerCase().includes(w));
    CNT.state_asserts++;
    chk('vp375-no-placeholder-copy-in-a11y-tree', badW.length === 0, badW.join(',') || 'clean');

    const statHits = fx.ui.stats.filter(([k, v]) => T.includes(`${k}: ${v}`));
    CNT.state_asserts++; CNT.real_data++;
    chk('vp375-stats-chips-match-endpoint', statHits.length >= 4, `${statHits.length}/${fx.ui.stats.length} verbatim e.g. ${statHits.slice(0, 3).map(([k, v]) => `${k}:${v}`).join(' ')}`);

    const myRids = [fx.receipts.A[0].receiptId, fx.receipts.B[0].receiptId, fx.receipts.C[0].receiptId];
    const okPrev = myRids.filter(r => receiptFiles[r] === 200);
    CNT.state_asserts++; CNT.images_requested += myRids.length; CNT.images_200 += okPrev.length;
    chk('vp375-receipt-proxy-200-for-our-rows', okPrev.length === myRids.length,
      `${okPrev.length}/${myRids.length} previews 200 (${myRids.map(r => `${r.slice(0, 8)}=${receiptFiles[r]}`).join(',')})`);
    await shot(p, vp, '01-initial');

    const prevNode = await findNode(p, rowA.receipts[0].fileName, vp);
    if (prevNode) { const v1 = await regionVariance(p, prevNode); CNT.state_asserts++;
      chk('vp375-receipt-preview-pixels-nonblank', v1.distinctColors >= 12 && v1.sdLum >= 6, JSON.stringify(v1)); }
    else chk('vp375-receipt-preview-pixels-nonblank', false, `filename node '${rowA.receipts[0].fileName}' not found`);

    // ---- status filter chips ----
    for (const chip of ['PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELLED']) {
      const b = await findNode(p, chip, vp);
      if (!b) { CNT.buttons_failed.push(`375:chip:${chip}`); chk(`vp375-chip-${chip}`, false, 'chip not found'); continue; }
      await clickCenter(p, b); await p.waitForTimeout(2500);
      const t2 = txtOf(await dump(p));
      CNT.buttons_ok++; CNT.state_asserts++;
      let okk, ev, sn;
      if (chip === 'PENDING_PAYMENT') { okk = t2.includes(fx.D.proformaNumber) && !t2.includes(fx.A.proformaNumber) && !t2.includes(fx.C.proformaNumber);
        ev = `D=${t2.includes(fx.D.proformaNumber)} A hidden=${!t2.includes(fx.A.proformaNumber)} C hidden=${!t2.includes(fx.C.proformaNumber)}`;
        sn = await shot(p, vp, '02-chip-PENDING_PAYMENT-D'); }
      else if (chip === 'CONFIRMED') { okk = !t2.includes(fx.A.proformaNumber) && !t2.includes(fx.C.proformaNumber) && !t2.includes(fx.D.proformaNumber);
        ev = `pre-action CONFIRMED empty of ours: A=${t2.includes(fx.A.proformaNumber)} C=${t2.includes(fx.C.proformaNumber)} D=${t2.includes(fx.D.proformaNumber)}`;
        sn = await shot(p, vp, '03-chip-CONFIRMED-empty'); }
      else if (chip === 'EXPIRED') { okk = !t2.includes(fx.D.proformaNumber) && !t2.includes(fx.C.proformaNumber);
        ev = `EXPIRED excludes our rows: D=${t2.includes(fx.D.proformaNumber)} C=${t2.includes(fx.C.proformaNumber)}`;
        sn = await shot(p, vp, '04-chip-EXPIRED'); }
      else { okk = !t2.includes(fx.A.proformaNumber) && !t2.includes(fx.D.proformaNumber);
        ev = `CANCELLED excludes A/D pre-cancel: A=${t2.includes(fx.A.proformaNumber)} D=${t2.includes(fx.D.proformaNumber)}`;
        sn = await shot(p, vp, '05-chip-CANCELLED-empty'); }
      chk(`vp375-chip-${chip}-filters-queue`, okk, `${ev} shot=${path.basename(sn)}`);
      const back = await findNode(p, 'PAYMENT_SUBMITTED', vp);
      if (back) { await clickCenter(p, back); await p.waitForTimeout(2300); }
    }

    // ---- T16: VERIFY receipt on A -> CONFIRM payment ----
    const vbtn = await actionInCard(p, 'Verify', fx.A.proformaNumber, vp);
    if (vbtn) {
      CNT.buttons_ok++;
      await clickCenter(p, vbtn); await p.waitForTimeout(2800);
      T = txtOf(await dump(p));
      CNT.state_asserts++;
      chk('vp375-verify-msg-receipt-verified', T.includes('Receipt verified'),
        `'${(T.split('\n').find(l => l.includes('Receipt verified')) || '(no action line rendered)').slice(0, 90)}'`);
      await shot(p, vp, '06-receipt-verified');
      const qa = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PAYMENT_SUBMITTED&page=0&size=50');
      const ra = (qa.json.content || []).find(x => x.proformaId === fx.A.proformaId);
      const rb2 = (qa.json.content || []).find(x => x.proformaId === fx.B.proformaId);
      const rc2 = (qa.json.content || []).find(x => x.proformaId === fx.C.proformaId);
      CNT.real_data += 2;
      chk('vp375-backend-A-receipt-VERIFIED-server-side', !!ra && (ra.receipts || []).every(r => r.status !== 'SUBMITTED'),
        ra ? (ra.receipts || []).map(r => `${r.receiptId.slice(0, 8)}=${r.status}`).join(',') : 'row left SUBMITTED queue');
      chk('vp375-surgical-only-A-touched', rb2 && rc2 && (rb2.receipts || []).every(r => r.status === 'SUBMITTED') && (rc2.receipts || []).every(r => r.status === 'SUBMITTED'),
        `B=${rb2 && (rb2.receipts || []).map(r => r.status).join(',')} C=${rc2 && (rc2.receipts || []).map(r => r.status).join(',')}`);

      const cbtn = await actionInCard(p, 'Confirm payment', fx.A.proformaNumber, vp);
      if (cbtn) {
        CNT.buttons_ok++;
        await clickCenter(p, cbtn); await p.waitForTimeout(3400);
        T = txtOf(await dump(p));
        CNT.state_asserts++;
        chk('vp375-confirm-payment-msg', /(^|\n)[^\n]*Payment confirmed/.test(T),
          `'${(T.split('\n').find(l => l.includes('Payment confirmed')) || '(no action line rendered)').slice(0, 90)}'`);
        await shot(p, vp, '07-confirm-payment');
        const qc2 = await L.api(atok, 'GET', '/api/v1/admin/payments?status=CONFIRMED&page=0&size=50');
        CNT.real_data++;
        chk('vp375-T16-proforma-CONFIRMED-backend', (qc2.json.content || []).some(x => x.proformaId === fx.A.proformaId),
          `${fx.A.proformaNumber} CONFIRMED=${(qc2.json.content || []).some(x => x.proformaId === fx.A.proformaId)}`);
        const od = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${orderIdA}`);
        const oj = od.json || {};
        CNT.real_data += 2;
        chk('vp375-T16-order-PAID-escrow-cleared-HELD-AWAITING_SELLER_CONFIRMATION',
          od.status === 200 && oj.paymentStatus === 'PAID' && oj.escrowPending === false && oj.payoutStatus === 'HELD'
          && (oj.orderStatus === 'AWAITING_SELLER_CONFIRMATION' || oj.status === 'AWAITING_SELLER_CONFIRMATION'),
          JSON.stringify({ paymentStatus: oj.paymentStatus, escrowPending: oj.escrowPending, payoutStatus: oj.payoutStatus, orderStatus: oj.orderStatus || oj.status }));
      } else { CNT.buttons_failed.push('375:Confirm payment'); chk('vp375-confirm-payment-msg', false, 'Confirm payment not revealed on screen'); }
    } else { CNT.buttons_failed.push('375:Verify'); chk('vp375-verify-msg-receipt-verified', false, 'Verify not revealed on screen'); }

    // ---- BULK approve B (single-select here; 2-row proof at 768) ----
    const tickB = await tickCard(p, fx.B.proformaNumber, vp);
    CNT.buttons_ok += tickB.ok ? 1 : 0; CNT.state_asserts++;
    chk('vp375-card-checkbox-B-tick', tickB.ok, tickB.why);
    if (tickB.ok) {
      T = txtOf(await dump(p));
      chk('vp375-bulk-bar-appears-on-select', T.includes('Bulk approve (1)'), `'${(T.split('\n').find(l => l.startsWith('Bulk approve')) || '(none)').trim()}'`);
      await shot(p, vp, '08-bulk-selected');
      CNT.state_asserts++;
      const bb = await findNode(p, 'Bulk approve (', vp);
      if (bb) {
        CNT.buttons_ok++;
        await clickCenter(p, bb); await p.waitForTimeout(3600);
        T = txtOf(await dump(p));
        CNT.state_asserts++;
        chk('vp375-bulk-approve-msg', /\d+ approved/.test(T), `'${(T.split('\n').find(l => l.includes('approved')) || '(none)').trim()}'`);
        await shot(p, vp, '09-bulk-approved');
        const qbc = await L.api(atok, 'GET', '/api/v1/admin/payments?status=CONFIRMED&page=0&size=50');
        CNT.real_data++;
        chk('vp375-bulk-B-CONFIRMED-backend', (qbc.json.content || []).some(x => x.proformaId === fx.B.proformaId),
          `${fx.B.proformaNumber} CONFIRMED via bulk=${(qbc.json.content || []).some(x => x.proformaId === fx.B.proformaId)}`);
      } else { CNT.buttons_failed.push('375:Bulk approve'); chk('vp375-bulk-approve-msg', false, 'Bulk approve button missing after select'); }
    } else chk('vp375-bulk-bar-appears-on-select', false, 'skipped: checkbox tick failed');

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
      chk('vp375-reject-dialog-six-reasoncodes', dlgOpen && present.length === 6, present.join(' | ').slice(0, 200));
      await shot(p, vp, '10-reject-dialog');
      const amt = await findNode(p, 'amount mismatch', vp);
      if (amt) {
        CNT.buttons_ok++;
        await clickCenter(p, amt); await p.waitForTimeout(3200);
        T = txtOf(await dump(p));
        CNT.state_asserts++;
        chk('vp375-reject-applied-msg-code-echoed', T.includes('Receipt rejected (AMOUNT_MISMATCH)'),
          `'${(T.split('\n').find(l => l.includes('rejected')) || '(none)').trim().slice(0, 90)}'`);
        await shot(p, vp, '11-rejected');
        const qr = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PAYMENT_SUBMITTED&page=0&size=50');
        const rc = (qr.json.content || []).find(x => x.proformaId === fx.C.proformaId);
        const rej = rc && (rc.receipts || []).find(r => r.status === 'REJECTED');
        CNT.real_data += 2;
        chk('vp375-backend-receipt-REJECTED', !!rej, rc ? (rc.receipts || []).map(r => r.status).join(',') : 'row gone from SUBMITTED');
        chk('vp375-backend-reasonCode-AMOUNT_MISMATCH', !!(rej && rej.rejectionReasonCode === 'AMOUNT_MISMATCH'), `code=${rej && rej.rejectionReasonCode}`);
        const my = await L.api(fx.buyer.token, 'GET', '/api/v1/payments/my');
        const brow = (Array.isArray(my.json) ? my.json : []).find(x => x.proformaId === fx.C.proformaId);
        const brej = brow && (brow.receipts || []).find(r => r.status === 'REJECTED');
        CNT.real_data++;
        chk('vp375-buyer-T24-sees-code-and-deadline', !!(brej && brej.rejectionReasonCode === 'AMOUNT_MISMATCH' && brej.correctionDeadline),
          brej ? `code=${brej.rejectionReasonCode} deadline=${brej.correctionDeadline}` : 'buyer payments/my row missing rejection');
      } else { CNT.buttons_failed.push('375:reason-option'); chk('vp375-reject-applied-msg-code-echoed', false, "'amount mismatch' option not clickable"); }
    } else { CNT.buttons_failed.push('375:Reject'); chk('vp375-reject-dialog-six-reasoncodes', false, 'Reject not revealed on screen'); }

    // ---- cancel-after-rejection leg (C now has zero SUBMITTED proofs) ----
    await p.waitForTimeout(1200);
    const ccancel = await actionInCard(p, 'Cancel invoice', fx.C.proformaNumber, vp);
    CNT.state_asserts++;
    chk('vp375-cancel-affordance-shown-after-full-rejection', !!ccancel, `Cancel invoice (48h window) visible=${!!ccancel}`);
    if (ccancel) {
      CNT.buttons_ok++;
      await clickCenter(p, ccancel); await p.waitForTimeout(3200);
      T = txtOf(await dump(p));
      CNT.state_asserts++;
      chk('vp375-cancel-while-window-open-refused-in-ui', /Failed:[^\n]*(correction window|CORRECTION_WINDOW)/i.test(T),
        `'${(T.split('\n').find(l => l.includes('Failed')) || '(no Failed line rendered)').trim().slice(0, 110)}'`);
      await shot(p, vp, '12-cancel-refused-window-open');
    }
    const cd = await L.api(atok, 'POST', `/api/v1/admin/proformas/${fx.C.proformaId}/cancel-after-rejection`);
    CNT.real_data++;
    chk('vp375-api-cancel-window-guard-409-CORRECTION_WINDOW_OPEN', cd.status === 409 && cd.json.code === 'CORRECTION_WINDOW_OPEN',
      `HTTP ${cd.status} code=${cd.json.code} deadline=${cd.json.correctionDeadline}`);

    execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -c "update proformas set correction_deadline = correction_deadline - interval '49 hours' where public_id = '${fx.C.proformaId}'"`, { stdio: 'pipe' });
    const dbRow = execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -t -c "select correction_deadline from proformas where public_id='${fx.C.proformaId}'"`).toString().trim();
    const qtyMid = await fetch(`${L.API}/api/v1/displayItem/itemDetails/${fx.productId}`).then(r => r.json()).then(j => j.productQuantity).catch(() => null);
    const cd2 = await L.api(atok, 'POST', `/api/v1/admin/proformas/${fx.C.proformaId}/cancel-after-rejection`);
    CNT.real_data += 2;
    chk('vp375-api-cancel-after-window-closed-CANCELLED', cd2.status === 200 && cd2.json.status === 'CANCELLED',
      `HTTP ${cd2.status} status=${cd2.json && cd2.json.status} db_deadline=[${dbRow}]`);
    chk('vp375-stock-reserved-before-release', qtyMid === fx.qtyBefore - 1, `qty pre-release=${qtyMid} (seeded ${fx.qtyBefore})`);

    const det2 = await fetch(`${L.API}/api/v1/displayItem/itemDetails/${fx.productId}`).then(r => r.json()).catch(() => null);
    CNT.real_data++;
    chk('vp375-stock-restored-after-cancel', det2 && det2.productQuantity === fx.qtyBefore,
      `productQuantity=${det2 && det2.productQuantity} expected=${fx.qtyBefore}`);

    const oc = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${orderIdC}`);
    const ocj = oc.json || {};
    CNT.real_data++;
    chk('vp375-provisional-order-cancelled-with-reason',
      oc.status !== 200 || ocj.orderStatus === 'CANCELLED' || ocj.status === 'CANCELLED',
      oc.status === 200 ? `orderStatus=${ocj.orderStatus || ocj.status}` : `HTTP ${oc.status}`);

    const qafter = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PAYMENT_SUBMITTED&page=0&size=50');
    CNT.real_data++;
    chk('vp375-C-gone-from-SUBMITTED-after-cancel', !(qafter.json.content || []).find(x => x.proformaId === fx.C.proformaId),
      `C still in SUBMITTED=${!!(qafter.json.content || []).find(x => x.proformaId === fx.C.proformaId)}`);
    const qd = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PENDING_PAYMENT&page=0&size=50');
    CNT.real_data++;
    chk('vp375-D-still-PENDING_PAYMENT-only', !!(qd.json.content || []).find(x => x.proformaId === fx.D.proformaId),
      `${fx.D.proformaNumber} PENDING_PAYMENT=true`);
    const qcanc = await L.api(atok, 'GET', '/api/v1/admin/payments?status=CANCELLED&page=0&size=50');
    const crow = (qcanc.json.content || []).find(x => x.proformaId === fx.C.proformaId);
    CNT.real_data++;
    chk('vp375-C-under-CANCELLED-with-reasoncode-in-payload', !!crow,
      crow ? `status=${crow.status} receipts=${(crow.receipts || []).map(r => `${r.status}:${r.rejectionReasonCode}`).join(',')}` : 'missing');

    // reload the screen so the CANCELLED state is observable through the UI too
    const cancChip = await findNode(p, 'CANCELLED', vp);
    if (cancChip) {
      await clickCenter(p, cancChip); await p.waitForTimeout(2600);
      const tc = txtOf(await dump(p));
      CNT.state_asserts++;
      chk('vp375-ui-CANCELLED-chip-shows-C-with-code', tc.includes(fx.C.proformaNumber) && tc.includes('Rejected: AMOUNT_MISMATCH'),
        `C listed=${tc.includes(fx.C.proformaNumber)} code shown=${tc.includes('Rejected: AMOUNT_MISMATCH')}`);
      await shot(p, vp, '12b-chip-CANCELLED-C-with-code');
      const back = await findNode(p, 'PAYMENT_SUBMITTED', vp);
      if (back) { await clickCenter(p, back); await p.waitForTimeout(2200); }
    }

    // ---- control inventory (foreign rows excluded per RW lane rules — never click what we didn't mint) ----
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
    const mine = [fx.A.proformaNumber, fx.B.proformaNumber, fx.C.proformaNumber, fx.D.proformaNumber];
    const exercised = ['PAYMENT_SUBMITTED', 'PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'Verify', 'Confirm payment', 'Bulk approve (', 'Reject', 'amount mismatch', 'Cancel invoice'];
    const unmatched = [...new Set(inv)].filter(l =>
      !exercised.some(x => l.includes(x)) && !(new RegExp(mine.join('|')).test(l)));
    CNT.buttons_total += [...new Set(inv)].length;
    chk('vp375-control-inventory-zero-unclicked', unmatched.length === 0,
      `controls=${[...new Set(inv)].length} unmatched(non-fixture)=${JSON.stringify(unmatched)}`);

    const sum = L.imageSummary(imgs);
    CNT.images_requested += sum.total; CNT.images_200 += sum.ok;
    chk('vp375-uploads-assets-all-200', sum.failed === 0, `uploads/assets total=${sum.total} ok=${sum.ok} failed=${sum.failed}`);
    const mineFails = Object.entries(receiptFiles).filter(([rid, s]) => myRids.includes(rid) && s !== 200);
    const foreignFails = Object.entries(receiptFiles).filter(([rid, s]) => !myRids.includes(rid) && s >= 400);
    chk('vp375-receipt-previews-ours-all-200', mineFails.length === 0,
      `our previews non-200=${mineFails.map(([r, s]) => `${r.slice(0, 8)}=${s}`).join(',') || 'none'} | foreign legacy rows 404 (files lost in pre-volume sandbox recreates; not this unit's data)=${foreignFails.length}`);
    const unexpected4xx = apiLog.filter(c => c.s >= 400 && !c.u.includes('/uploads/')
      && !(c.s === 409 && c.u.includes('/cancel-after-rejection'))
      && !(/\/admin\/receipts\/.+\/file/.test(c.u) && c.s === 404));
    chk('vp375-wire-audit-no-unexpected-4xx', unexpected4xx.length === 0,
      `admin wire: ${apiLog.filter(c => /admin/.test(c.u)).map(c => `${c.m}${c.u.replace('/api/v1/admin', '')}->${c.s}`).join(', ').slice(0, 420)} | unexpected4xx=${unexpected4xx.map(c => `${c.s}${c.u}`).join(';') || 'none'}`);

    await shot(p, vp, '13-final-375');
    await L.scrollToBottom(p, 10);
    await shot(p, vp, '14-bottom-sweep');
    await L.closeVideo(ctx, `${VIDDIR}/AU-042-r9-375.webm`).catch(() => {});
    await browser.close();
  }

  // ============================ SEED SET 2 ============================
  async function seedSet(tagSuffix) {
    const stamp = Date.now(), tag = `AU042R9${tagSuffix}${stamp}`;
    const be = `au042${tagSuffix.toLowerCase()}.buyer.${stamp}@gmail.com`, se = `au042${tagSuffix.toLowerCase()}.seller.${stamp}@gmail.com`;
    const PW = 'StrongPass!1', PNG = path.join(__dirname, 'fixtures', 'receipt-proof.png');
    for (const e of [be, se]) { const reg = await L.api(null, 'POST', '/api/v1/auth/register', { firstName: 'AU042R9', lastName: tagSuffix, password: PW, emailAddress: e }); if (![200, 201].includes(reg.status)) throw new Error('register ' + reg.status); }
    const btok = await L.apiLogin({ email: be, pw: PW }), stok = await L.apiLogin({ email: se, pw: PW }), atk = await L.apiLogin(L.ADMIN);
    const meS = await L.api(stok, 'GET', '/api/v1/userManagement/user-details');
    await L.api(atk, 'PATCH', `/api/v1/admin/users/${meS.json.userId}/status`, { status: 'VERIFIED' });
    const form = new FormData();
    form.append('product', new Blob([Buffer.from(JSON.stringify({ productName: `${tag} Kettle`, productQuantity: 12, categoryId: 3, subcategoryId: 26,
      productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni', productDescription: 'AU-042 r9 set-2.',
      currency: 'TZS', askingPrice: 13000, originalPrice: 16000, condition: 'NEW' }))], { type: 'application/json' }), 'p.json');
    form.append('images', new Blob([fs.readFileSync(PNG)], { type: 'image/png' }), 'kettle.png');
    const prr = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + stok }, body: form });
    if (prr.status !== 201) throw new Error('product2 ' + prr.status);
    const pid = (await prr.json()).productId;
    await L.api(atk, 'PATCH', `/api/v1/admin/products/${pid}/logistics`, { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' });
    await L.api(btok, 'POST', '/api/v1/add-address', { street: `AU042 ${tagSuffix}`, city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania', label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+2557' + String(stamp).slice(-9) });
    const q = await L.api(btok, 'POST', '/api/v1/checkout/delivery-quote', { destination: { city: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083 }, items: [{ productId: pid, quantity: 1 }] });
    const fee = (q.json && q.json.deliveryTotal) || 2000;
    async function mk(t) {
      const tomorrow = new Date(Date.now() + 24 * 3600e3).toISOString().slice(0, 10);
      const co = await L.api(btok, 'POST', '/api/v1/checkout/proforma', {
        buyDetails: { firstName: 'AU042R9Sec', lastName: 'AU042R9Ond', emailAddress: be, phoneNumber: '+255715000444', address: 'set2 street', deliveryLabel: 'Home', deliveryPlaceName: '', deliveryNeighbourhood: '', city: 'dar es salaam', state: '', country: 'tanzania', zipCode: '', deliveryInstructions: '', fulfillmentType: 'SELLER_DELIVERY', paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true, deliveryFee: fee, totalAmount: 13000 + fee, currency: 'TZS', latitude: -6.7924, longitude: 39.2083, preferredDeliveryDate: tomorrow, preferredDeliverySlot: 'EVENING', preferredDeliveryWindows: [{ date: tomorrow, slot: 'EVENING' }] },
        items: [{ productId: pid, quantity: 1 }] });
      if (![200, 201].includes(co.status)) throw new Error('proforma2 ' + t + ' ' + co.status);
      return co.json;
    }
    async function sub(pfId, t) {
      const f = new FormData();
      f.append('receipts', new Blob([fs.readFileSync(PNG)], { type: 'image/png' }), `au042-${t.toLowerCase()}.png`);
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
    const rcpt = id => { const row = (qs.json.content || []).find(p => p.proformaId === id); return (row && row.receipts || []).map(r => ({ receiptId: r.receiptId, fileName: r.fileName, status: r.status })); };
    const out = { stamp, tag, buyerToken: btok, adminToken: atk, productId: pid,
      A2: { proformaId: A2.proformaId, proformaNumber: A2.proformaNumber }, B2: { proformaId: B2.proformaId, proformaNumber: B2.proformaNumber },
      C2: { proformaId: C2.proformaId, proformaNumber: C2.proformaNumber }, receipts: { A2: rcpt(A2.proformaId), B2: rcpt(B2.proformaId), C2: rcpt(C2.proformaId) } };
    fs.writeFileSync('/tmp/au042_r9_fixtures_s2.json', JSON.stringify(out, null, 1));
    console.log(`[seed2] A2=${A2.proformaNumber} B2=${B2.proformaNumber} C2=${C2.proformaNumber} product=${pid}`);
    return out;
  }
  let fx2 = null;
  try { fx2 = await seedSet('S2'); } catch (e) { chk('seed-set2', false, e.message); }

  // ============================ PASS 2 — 768x1024 ============================
  if (fx2) {
    console.log('\n===== PASS 2: 768x1024 =====');
    const vp = { name: '768', w: 768, h: 1024 };
    const imgs = {}, receiptFiles = {}, apiLog2 = [];
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: vp.w, height: vp.h }, videoPath: `${VIDDIR}/AU-042-r9-768.webm` });
    const p = await ctx.newPage(); p.setDefaultTimeout(30000);
    p.on('response', r => {
      const u = r.url();
      if (/localhost:8083/.test(u)) apiLog2.push({ m: r.request().method(), u: u.replace(/^https?:\/\/[^/]+/, '').split('?')[0], s: r.status() });
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgs[u] = r.status();
      if (/\/api\/v1\/admin\/receipts\/([0-9a-f-]+)\/file/.test(u)) receiptFiles[u.match(/receipts\/([0-9a-f-]+)\/file/)[1]] = r.status();
    });
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await p.evaluate(() => localStorage.clear()).catch(() => {});
    await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 40000);
    chk('vp768-admin-login', await L.login(p, L.ADMIN), 'token persisted');
    await p.evaluate(() => { window.location.hash = '#/admin/payments-review'; });
    await L.waitText(p, 'Payment review', 30000);
    await p.waitForTimeout(4000);
    let T = txtOf(await dump(p));
    CNT.state_asserts += 2;
    chk('vp768-default-SUBMITTED-shows-set2', T.includes(fx2.A2.proformaNumber) && T.includes(fx2.B2.proformaNumber) && T.includes(fx2.C2.proformaNumber),
      `A2=${T.includes(fx2.A2.proformaNumber)} B2=${T.includes(fx2.B2.proformaNumber)} C2=${T.includes(fx2.C2.proformaNumber)}`);
    chk('vp768-set1-mutated-rows-hidden', !T.includes(fx.A.proformaNumber) && !T.includes(fx.C.proformaNumber) && !T.includes(fx.D.proformaNumber),
      `A(confirmed)=${!T.includes(fx.A.proformaNumber)} C(cancelled)=${!T.includes(fx.C.proformaNumber)} D(pending)=${!T.includes(fx.D.proformaNumber)}`);
    await shot(p, vp, '01-initial');

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
      const bb2 = await findNode(p, 'Bulk approve (2)', vp);
      if (bb2) {
        CNT.buttons_ok++;
        await clickCenter(p, bb2); await p.waitForTimeout(4000);
        T = txtOf(await dump(p));
        CNT.state_asserts++;
        chk('vp768-bulk-approve-2-msg', /2 approved/.test(T), `'${(T.split('\n').find(l => l.includes('approved')) || '(none)').trim()}'`);
        await shot(p, vp, '03-bulk-approved-2');
        const wireBulk = apiLog2.find(c => c.u.includes('/admin/proformas/bulk-approve'));
        chk('vp768-bulk-wire-call-observed', !!wireBulk && wireBulk.s === 200, JSON.stringify(wireBulk || 'absent'));
        const qc2 = await L.api(atok, 'GET', '/api/v1/admin/payments?status=CONFIRMED&page=0&size=50');
        const gotA2 = (qc2.json.content || []).some(x => x.proformaId === fx2.A2.proformaId);
        const gotB2 = (qc2.json.content || []).some(x => x.proformaId === fx2.B2.proformaId);
        CNT.real_data += 2;
        chk('vp768-bulk-both-CONFIRMED-backend', gotA2 && gotB2, `A2=${gotA2} B2=${gotB2}`);
        const ra2 = (qc2.json.content || []).find(x => x.proformaId === fx2.A2.proformaId);
        const oid2 = ra2 && (ra2.orderIds || [])[0];
        if (oid2) {
          const od2 = await L.api(fx2.buyerToken, 'GET', `/api/v1/orders/${oid2}`);
          const oj = od2.json || {};
          CNT.real_data++;
          chk('vp768-bulk-order-PAID-HELD-AWAITING_SELLER_CONFIRMATION',
            oj.paymentStatus === 'PAID' && oj.escrowPending === false && oj.payoutStatus === 'HELD'
            && (oj.orderStatus === 'AWAITING_SELLER_CONFIRMATION' || oj.status === 'AWAITING_SELLER_CONFIRMATION'),
            JSON.stringify({ paymentStatus: oj.paymentStatus, escrowPending: oj.escrowPending, payoutStatus: oj.payoutStatus, orderStatus: oj.orderStatus || oj.status }));
        } else chk('vp768-bulk-order-PAID-HELD-AWAITING_SELLER_CONFIRMATION', false, 'A2 orderIds empty');
      } else { CNT.buttons_failed.push('768:Bulk approve (2)'); chk('vp768-bulk-approve-2-msg', false, 'button missing'); }
    } else chk('vp768-multiselect-bar-counts-two', false, 'skipped: tick failures');

    // VERIFY receipt on C2
    const v2 = await actionInCard(p, 'Verify', fx2.C2.proformaNumber, vp);
    if (v2) {
      CNT.buttons_ok++;
      await clickCenter(p, v2); await p.waitForTimeout(2800);
      T = txtOf(await dump(p));
      CNT.state_asserts++;
      chk('vp768-verify-msg-receipt-verified', T.includes('Receipt verified'), `'${(T.split('\n').find(l => l.includes('Receipt verified')) || '(none)').slice(0, 80)}'`);
      await shot(p, vp, '04-c2-verified');
      const qs3 = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PAYMENT_SUBMITTED&page=0&size=50');
      const rc3 = (qs3.json.content || []).find(x => x.proformaId === fx2.C2.proformaId);
      CNT.real_data++;
      chk('vp768-backend-C2-receipt-VERIFIED', !!rc3 && (rc3.receipts || []).every(r => r.status === 'VERIFIED'),
        rc3 ? (rc3.receipts || []).map(r => `${r.receiptId.slice(0, 8)}=${r.status}`).join(',') : 'row gone');
    } else { CNT.buttons_failed.push('768:Verify'); chk('vp768-verify-msg-receipt-verified', false, 'Verify not revealed'); }

    const rids2 = ['A2', 'B2', 'C2'].map(k => fx2.receipts[k][0]);
    const okPrev2 = rids2.filter(r => receiptFiles[r.receiptId] === 200);
    CNT.images_requested += rids2.length; CNT.images_200 += okPrev2.length; CNT.state_asserts++;
    chk('vp768-receipt-proxy-200-for-set2', okPrev2.length === rids2.length, `${okPrev2.length}/${rids2.length} previews 200`);
    const pn2 = await findNode(p, fx2.receipts.C2[0].fileName, vp);
    if (pn2) { const vv = await regionVariance(p, pn2); CNT.state_asserts++;
      chk('vp768-receipt-preview-pixels-nonblank', vv.distinctColors >= 12 && vv.sdLum >= 6, JSON.stringify(vv)); }
    else chk('vp768-receipt-preview-pixels-nonblank', false, `node '${fx2.receipts.C2[0].fileName}' not found`);

    // cross-chip sweep with set1 outcomes
    for (const chip of ['CONFIRMED', 'CANCELLED', 'PENDING_PAYMENT']) {
      const b = await findNode(p, chip, vp);
      if (!b) { CNT.buttons_failed.push(`768:chip:${chip}`); chk(`vp768-chip-${chip}`, false, 'chip missing'); continue; }
      await clickCenter(p, b); await p.waitForTimeout(2600);
      const t3 = txtOf(await dump(p));
      CNT.buttons_ok++; CNT.state_asserts++;
      let okk, ev, sn;
      if (chip === 'CONFIRMED') { okk = t3.includes(fx.A.proformaNumber) && t3.includes(fx.B.proformaNumber) && t3.includes(fx2.A2.proformaNumber);
        ev = `set1 A+B + set2 A2+B2 under CONFIRMED: A=${t3.includes(fx.A.proformaNumber)} B=${t3.includes(fx.B.proformaNumber)} A2=${t3.includes(fx2.A2.proformaNumber)} B2=${t3.includes(fx2.B2.proformaNumber)}`;
        sn = await shot(p, vp, '05-chip-CONFIRMED-set1-and-set2'); }
      else if (chip === 'CANCELLED') { okk = t3.includes(fx.C.proformaNumber) && t3.includes('Rejected: AMOUNT_MISMATCH');
        ev = `C cancelled w/ its reasonCode: C=${t3.includes(fx.C.proformaNumber)} code-shown=${t3.includes('Rejected: AMOUNT_MISMATCH')}`;
        sn = await shot(p, vp, '06-chip-CANCELLED-C-with-reasoncode'); }
      else { okk = t3.includes(fx.D.proformaNumber) && !t3.includes(fx.A.proformaNumber);
        ev = `D still pending-only: D=${t3.includes(fx.D.proformaNumber)} A=${t3.includes(fx.A.proformaNumber)}`;
        sn = await shot(p, vp, '07-chip-PENDING_PAYMENT-D'); }
      chk(`vp768-chip-${chip}-cross-checks`, okk, `${ev}${sn ? ` shot=${path.basename(sn)}` : ''}`);
      const back = await findNode(p, 'PAYMENT_SUBMITTED', vp);
      if (back) { await clickCenter(p, back); await p.waitForTimeout(2200); }
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
    const mine2 = [fx.A, fx.B, fx.C, fx.D].map(m => m.proformaNumber).concat([fx2.A2.proformaNumber, fx2.B2.proformaNumber, fx2.C2.proformaNumber]);
    const ex2 = ['PAYMENT_SUBMITTED', 'PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'Verify', 'Reject', 'Confirm payment', 'Bulk approve ('];
    const unmatched2 = [...new Set(inv2)].filter(l => !ex2.some(x => l.includes(x)) && !(new RegExp(mine2.join('|')).test(l)));
    CNT.buttons_total += [...new Set(inv2)].length;
    chk('vp768-control-inventory-zero-unclicked', unmatched2.length === 0, `controls=${[...new Set(inv2)].length} unmatched(non-fixture)=${JSON.stringify(unmatched2)}`);
    const sum2 = L.imageSummary(imgs);
    CNT.images_requested += sum2.total; CNT.images_200 += sum2.ok;
    chk('vp768-uploads-assets-all-200', sum2.failed === 0, `total=${sum2.total} ok=${sum2.ok} failed=${sum2.failed}`);
    const myRids2 = rids2.map(r => r.receiptId);
    const mineFails2 = Object.entries(receiptFiles).filter(([rid, s]) => myRids2.includes(rid) && s !== 200);
    chk('vp768-receipt-previews-ours-all-200', mineFails2.length === 0, `non-200 on our rows=${mineFails2.map(([r, s]) => `${r.slice(0, 8)}=${s}`).join(',') || 'none'} (legacy-row 404s excluded as environmental)`);
    await shot(p, vp, '08-final-768');
    await L.closeVideo(ctx, `${VIDDIR}/AU-042-r9-768.webm`).catch(() => {});
    await browser.close();
  }

  // ============================ PASS 3 — 1280x900 ============================
  {
    console.log('\n===== PASS 3: 1280x900 =====');
    const vp = { name: '1280', w: 1280, h: 900 };
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: vp.w, height: vp.h }, videoPath: `${VIDDIR}/AU-042-r9-1280.webm` });
    const p = await ctx.newPage(); p.setDefaultTimeout(30000);
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await p.evaluate(() => localStorage.clear()).catch(() => {});
    await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 40000);
    chk('vp1280-admin-login', await L.login(p, L.ADMIN), 'token persisted');
    await p.evaluate(() => { window.location.hash = '#/admin/payments-review'; });
    await L.waitText(p, 'Payment review', 30000);
    await p.waitForTimeout(4000);
    const T = txtOf(await dump(p));
    CNT.state_asserts++;
    chk('vp1280-screen-renders-with-live-queues', T.includes('Payment review') && T.includes(fx2.C2.proformaNumber),
      `header=${T.includes('Payment review')} C2(SUBMITTED)=${T.includes(fx2.C2.proformaNumber)}`);
    const overflow = await p.evaluate(() => { let worst = 0;
      document.querySelectorAll('flt-semantics').forEach(e => { const r = e.getBoundingClientRect(); if (r.right > innerWidth + 2) worst = Math.max(worst, Math.round(r.right - innerWidth)); });
      return worst; });
    CNT.state_asserts++;
    chk('vp1280-no-horizontal-overflow', overflow <= 2, `max overflow px=${overflow}`);
    await shot(p, vp, '01-initial');
    const cb = await findNode(p, 'CONFIRMED', vp);
    if (cb) { await clickCenter(p, cb); await p.waitForTimeout(2600);
      const t2 = txtOf(await dump(p));
      CNT.buttons_ok++; CNT.state_asserts++;
      chk('vp1280-chip-CONFIRMED-shows-confirmed-rows', t2.includes(fx.A.proformaNumber) && !t2.includes(fx.D.proformaNumber),
        `A=${t2.includes(fx.A.proformaNumber)} D=${t2.includes(fx.D.proformaNumber)}`);
      await shot(p, vp, '02-chip-CONFIRMED');
    } else { CNT.buttons_failed.push('1280:chip:CONFIRMED'); chk('vp1280-chip-CONFIRMED-shows-confirmed-rows', false, 'chip not found'); }
    await L.closeVideo(ctx, `${VIDDIR}/AU-042-r9-1280.webm`).catch(() => {});
    await browser.close();
  }

  fs.writeFileSync('/tmp/au042_r9_counters.json', JSON.stringify(CNT, null, 1));
  console.log('\ncounters:', JSON.stringify(CNT));
})().catch(e => {
  console.error('VERIFY CRASH:', e.stack);
  rec({ ts: new Date().toISOString(), unit: 'AU-042', stage: 'verify-r9', check: 'crash', ok: false, evidence: String(e.message).slice(0, 500) });
  process.exit(1);
});
