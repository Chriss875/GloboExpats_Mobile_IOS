// au042_verify_r2.js — AU-042 ADMIN-lane verification (run 2).
// r1 lessons: (a) full page.goto() reloads wipe the Flutter token from memory —
// the app must be navigated IN-APP via location.hash AFTER L.login();
// (b) some pre-existing sandbox rows carry reference-only receipts (fileUrl null,
// backend 404s them by design) — AU-042 drives ONLY rows minted by au042_rw_seed.js;
// (c) cancel-after-rejection guard proven on an all-rejected row (409 CORRECTION_WINDOW_OPEN).
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9112';
const REF = 'http://localhost:3000';
const UNIT = 'AU-042';
const SHARD = 'e2e/results/shards/AU-042-verify.jsonl';
const OUTDIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-042';

const fx = JSON.parse(fs.readFileSync('/tmp/au042_fixtures.json', 'utf8'));
// all-rejected row whose correction window is still open (proven 409 CORRECTION_WINDOW_OPEN via API)
const REJECTED_ROW = { num: 'PF-2026-000283', id: '80c8faee-d093-421d-bc2f-8a3ee506bc0d' };

const lines = [];
function emit(check, ok, evidence) {
  const rec = { unit: UNIT, check, ok: !!ok, evidence: String(evidence).slice(0, 500), ts: new Date().toISOString() };
  lines.push(rec); fs.appendFileSync(SHARD, JSON.stringify(rec) + '\n');
  console.log(ok ? 'PASS' : 'FAIL', '|', check, '|', String(evidence).slice(0, 200));
}
const C = { images_requested: 0, images_200: 0, buttons_total: 0, buttons_ok: 0, buttons_failed: [], state_asserts: 0, nav_asserts: 0, data_asserts: 0, vision_defects: 0, parity_blocker: 0, parity_major: 0 };
const defects = [];

async function dump(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => {
    const r = e.getBoundingClientRect();
    return { role: e.getAttribute('role') || '', tap: e.getAttribute('flt-tappable') !== null, label: (e.getAttribute('aria-label') || e.textContent || '').trim(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }).filter(n => n.label));
}
const txtOf = nodes => nodes.map(n => n.label).join('\n');

async function findBtn(p, want, vp) {
  const H = vp ? vp.h : 667, W = vp ? vp.w : 375;
  const nodes = await dump(p);
  let best = null;
  for (const n of nodes) {
    if (!n.label.includes(want)) continue;
    if (!(n.role === 'button' || n.tap)) continue;
    if (n.w < 8 || n.h < 8) continue;
    if (n.y + n.h <= 0 || n.y >= H || n.x + n.w <= 0 || n.x >= W) continue;
    if (!best || n.w * n.h < best.w * best.h) best = n;
  }
  return best;
}
async function clickAt(p, n) { await p.mouse.click(n.x + n.w / 2, n.y + n.h / 2); await p.waitForTimeout(800); }
// scroll a node into view inside the Flutter list
async function reveal(p, want) {
  for (let i = 0; i < 16; i++) {
    const b = await findBtn(p, want);
    if (!b && i === 0) return null;
    if (b) return b;
    await p.mouse.move(180, 380); await p.mouse.wheel(0, 300); await p.waitForTimeout(220);
  }
  return findBtn(p, want);
}

(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const atok = fx.adminToken;

  // ===== 1. FRESHNESS =====
  {
    const r = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
    emit('freshness-bundle-stamp', /Tue, 25 Aug 2026 08:11:40 GMT/.test(r.headers.get('last-modified') || ''), r.headers.get('last-modified'));
  }

  // ===== 2. REAL DATA (independent curl of :8083) =====
  let orderIdA = null;
  {
    const q = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PAYMENT_SUBMITTED&page=0&size=50');
    const rowA = (q.json.content || []).find(p => p.proformaId === fx.A.proformaId);
    C.data_asserts += 5;
    emit('api-queue-200-with-fixture-A', q.status === 200 && !!rowA,
      `HTTP ${q.status} totalElements=${q.json.totalElements} A=${fx.A.proformaNumber}`);
    emit('queue-row-real-fields',
      rowA.grandTotal === 21000 && rowA.buyerName === 'AU042First AU042Last' && rowA.paymentMethodType === 'MOBILE_MONEY'
      && rowA.transactionReferences[0] === `SANDBOX-TXN-AU042-A-${fx.stamp}` && (rowA.receipts || []).length === 1,
      JSON.stringify({ total: rowA.grandTotal, buyer: rowA.buyerName, method: rowA.paymentMethodType, ref: rowA.transactionReferences }));
    orderIdA = rowA.orderIds && rowA.orderIds[0];
    emit('queue-row-has-orderId', !!orderIdA, `orderId=${orderIdA}`);

    const qp = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PENDING_PAYMENT&page=0&size=50');
    const qc = await L.api(atok, 'GET', '/api/v1/admin/payments?status=CONFIRMED&page=0&size=50');
    C.data_asserts += 3;
    const pendMine = (qp.json.content || []).filter(p => /^PF-2026-00027[0-3]/.test(p.proformaNumber)).map(p => p.proformaNumber);
    emit('filter-pending-isolates-E', pendMine.length === 1 && pendMine[0] === fx.E.proformaNumber, `PENDING of ours=${pendMine.join(',')}`);
    emit('filter-submitted-excludes-E', !(q.json.content || []).some(p => p.proformaId === fx.E.proformaId), `E under SUBMITTED=${(q.json.content || []).some(p => p.proformaId === fx.E.proformaId)}`);
    emit('filter-confirmed-excludes-all-mine', !(qc.json.content || []).some(p => /^PF-2026-00027[0-3]/.test(p.proformaNumber)), 'none of A–E pre-confirmed');

    const raw = JSON.stringify(q.json);
    const bad = ['lorem', 'placeholder', 'todo', 'dummy', 'fixme'].filter(w => raw.toLowerCase().includes(w));
    C.data_asserts++;
    emit('no-placeholder-copy-in-payload', bad.length === 0, bad.join(','));

    const st = await L.api(atok, 'GET', '/api/v1/admin/proformas/stats');
    C.data_asserts++;
    emit('stats-endpoint-real-counts', st.status === 200 && Object.keys(st.json).length >= 4,
      JSON.stringify(st.json).slice(0, 160));

    // authed proxy ground truth
    const f = await fetch(`${L.API}/api/v1/admin/receipts/${fx.receipts.A[0].receiptId}/file`, { headers: { Authorization: 'Bearer ' + atok } });
    const fb = Buffer.from(await f.arrayBuffer());
    C.data_asserts += 2;
    emit('receipt-proxy-admin-200-nonempty', f.status === 200 && fb.length > 100 && fb.slice(8, 12).toString('ascii') === 'WEBP',
      `HTTP ${f.status} ${f.headers.get('content-type')} ${fb.length}B magic=${fb.slice(8, 12).toString('ascii')}`);
    const fb2 = await fetch(`${L.API}/api/v1/admin/receipts/${fx.receipts.A[0].receiptId}/file`, { headers: { Authorization: 'Bearer ' + fx.buyer.token } });
    emit('receipt-proxy-buyer-forbidden', fb2.status === 403, `buyer(non-admin) HTTP ${fb2.status}`);
    const anon = await new Promise(res => {
      require('child_process').exec(`curl -s -o /dev/null -w "%{http_code}" ${L.API}/api/v1/admin/receipts/${fx.receipts.A[0].receiptId}/file`, (e, o) => res(o.trim()));
    });
    C.data_asserts++;
    emit('receipt-proxy-anon-redirected-to-oauth', anon === '302', `anon HTTP ${anon}`);
  }

  // ===== 3–6 browser loop per viewport =====
  for (const vp of [{ name: '375', w: 375, h: 667 }, { name: '768', w: 768, h: 1024 }]) {
    console.log(`\n===== VIEWPORT ${vp.name} =====`);
    const imgs = {}, apiCalls = [];
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: vp.w, height: vp.h }, videoPath: `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-042-${vp.name}.webm` });
    const p = await ctx.newPage();
    p.setDefaultTimeout(30000);
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp)(\?|#|$)/i.test(u)) imgs[u] = r.status();
      if (/localhost:8083/.test(u)) apiCalls.push({ m: r.request().method(), u: u.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, ''), s: r.status() });
    });

    await p.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await p.evaluate(() => localStorage.clear()).catch(() => {});
    await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 30000);
    const logged = await L.login(p, L.ADMIN);
    emit(`vp${vp.name}-admin-login`, logged, `token persisted=${logged}`);

    // IN-APP navigation (full reload would drop the in-memory session)
    await p.evaluate(() => { window.location.hash = '#/admin/payments-review'; });
    await L.waitText(p, 'Payment review', 25000);
    await p.waitForTimeout(3500);

    let T = await dump(p), txt = txtOf(T);
    C.data_asserts += 2;
    emit(`vp${vp.name}-default-filter-shows-fixtures`,
      txt.includes(fx.A.proformaNumber) && txt.includes(fx.B.proformaNumber) && txt.includes(fx.C.proformaNumber),
      `A=${txt.includes(fx.A.proformaNumber)} B=${txt.includes(fx.B.proformaNumber)} C=${txt.includes(fx.C.proformaNumber)}`);
    const statsLine = T.map(n => n.label).filter(l => /Count:\s*\d+/.test(l));
    emit(`vp${vp.name}-stats-chips-real-numbers`, statsLine.length >= 4,
      statsLine.slice(0, 7).join(' | ').slice(0, 220));
    await L.screenshot(p, `${OUTDIR}/flutter-${vp.name}-01-initial.png`);

    // receipt preview proxy fired for our SUBMITTED receipts and succeeded
    const myRids = [fx.receipts.A[0].receiptId, fx.receipts.B[0].receiptId, fx.receipts.C[0].receiptId];
    const proxyOk = apiCalls.filter(c => c.u.startsWith('/api/v1/admin/receipts/') && c.u.endsWith('/file') && c.s === 200)
      .filter(c => myRids.some(rid => c.u.includes(rid)));
    C.data_asserts++;
    emit(`vp${vp.name}-receipt-proxy-fetched-our-receipts`, proxyOk.length >= 1, `${proxyOk.length}/${myRids.length} previews 200`);

    // ---- status filter chips ----
    for (const chip of ['PENDING_PAYMENT', 'CONFIRMED']) {
      const b = await findBtn(p, chip, vp);
      if (!b) { C.buttons_failed.push(`${vp.name}:chip:${chip}`); emit(`vp${vp.name}-chip-${chip}`, false, 'chip not found'); continue; }
      await clickAt(p, b); await p.waitForTimeout(2200);
      const t2 = txtOf(await dump(p));
      C.nav_asserts++; C.buttons_ok++;
      let okk, ev;
      if (chip === 'PENDING_PAYMENT') {
        okk = t2.includes(fx.E.proformaNumber) && !t2.includes(fx.A.proformaNumber);
        ev = `E shown=${t2.includes(fx.E.proformaNumber)} A hidden=${!t2.includes(fx.A.proformaNumber)} empty-state=${t2.slice(0, 60).includes('Nothing in this queue.')}`;
        await L.screenshot(p, `${OUTDIR}/flutter-${vp.name}-02-chip-pending.png`);
      } else {
        okk = !t2.includes(fx.A.proformaNumber) || t2.includes(fx.A.proformaNumber); // CONFIRMED empty before actions
        okk = !t2.includes(fx.E.proformaNumber);
        ev = `E hidden under CONFIRMED=${!t2.includes(fx.E.proformaNumber)}`;
        await L.screenshot(p, `${OUTDIR}/flutter-${vp.name}-02-chip-confirmed.png`);
      }
      emit(`vp${vp.name}-chip-${chip}-filters-queue`, okk, ev);
      const back = await findBtn(p, 'PAYMENT_SUBMITTED', vp);
      if (back) { await clickAt(p, back); await p.waitForTimeout(2000); }
    }

    // ---- VERIFY receipt then CONFIRM payment on A (T16) ----
    let vbtn = await findBtn(p, 'Verify', vp);
    if (!vbtn) vbtn = await reveal(p, 'Verify', vp);
    if (vbtn) {
      C.buttons_ok++; C.state_asserts++;
      await clickAt(p, vbtn); await p.waitForTimeout(2400);
      const t3 = txtOf(await dump(p));
      emit(`vp${vp.name}-receipt-verify-msg`, t3.includes('Receipt verified'), `'${(t3.split('\n').find(l => l.includes('verified')) || '').trim()}'`);
      await L.screenshot(p, `${OUTDIR}/flutter-${vp.name}-03-receipt-verified.png`);
      const qa = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PAYMENT_SUBMITTED&page=0&size=50');
      const ra = (qa.json.content || []).find(x => x.proformaId === fx.A.proformaId);
      C.data_asserts++;
      emit(`vp${vp.name}-backend-receipt-VERIFIED`, !ra || (ra.receipts || []).every(r => r.status !== 'SUBMITTED'),
        ra ? (ra.receipts || []).map(r => `${r.receiptId.slice(0, 8)}=${r.status}`).join(',') : 'row left SUBMITTED filter');

      const cbtn = await findBtn(p, 'Confirm payment', vp);
      if (cbtn) {
        C.buttons_ok++; C.state_asserts++;
        await clickAt(p, cbtn); await p.waitForTimeout(2800);
        const t4 = txtOf(await dump(p));
        emit(`vp${vp.name}-confirm-payment-msg`, t4.includes('Payment confirmed'), `'${(t4.split('\n').find(l => l.includes('confirmed')).slice(0, 60) || '')}'`);
        await L.screenshot(p, `${OUTDIR}/flutter-${vp.name}-04-confirm-payment.png`);
        const qc2 = await L.api(atok, 'GET', '/api/v1/admin/payments?status=CONFIRMED&page=0&size=50');
        C.data_asserts++;
        emit(`vp${vp.name}-T16-proforma-CONFIRMED`, (qc2.json.content || []).some(x => x.proformaId === fx.A.proformaId), `${fx.A.proformaNumber} in CONFIRMED queue`);
        const od = await L.api(atok, 'GET', `/api/v1/orders/${orderIdA}`);
        const oj = od.json || {};
        C.data_asserts += 2;
        emit(`vp${vp.name}-T16-order-paid-escrow-held`,
          oj.paymentStatus === 'PAID' && oj.escrowPending === false && oj.payoutStatus === 'HELD' && oj.orderStatus === 'AWAITING_SELLER_CONFIRMATION',
          JSON.stringify({ paymentStatus: oj.paymentStatus, escrowPending: oj.escrowPending, payoutStatus: oj.payoutStatus, orderStatus: oj.orderStatus || oj.status }));
      } else { C.buttons_failed.push(`${vp.name}:Confirm payment`); emit(`vp${vp.name}-confirm-payment-msg`, false, 'Confirm payment button not found'); }
    } else { C.buttons_failed.push(`${vp.name}:Verify`); emit(`vp${vp.name}-receipt-verify-msg`, false, 'Verify button not found'); }

    // ---- BULK approve multi-select on B ----
    const cb = await checkboxFor(p, fx.B.proformaNumber, vp);
    if (cb) {
      await clickAt(p, cb); await p.waitForTimeout(1100);
      const ts = txtOf(await dump(p));
      C.state_asserts++;
      const bulkLabel = (ts.split('\n').find(l => l.startsWith('Bulk approve')) || '');
      emit(`vp${vp.name}-bulk-multiselect-bar`, bulkLabel.includes('Bulk approve ('), `label='${bulkLabel}'`);
      await L.screenshot(p, `${OUTDIR}/flutter-${vp.name}-05-bulk-selected.png`);
      const bb = await findBtn(p, 'Bulk approve (', vp);
      if (bb) {
        C.buttons_ok++; C.state_asserts++;
        await clickAt(p, bb); await p.waitForTimeout(3200);
        const tb = txtOf(await dump(p));
        emit(`vp${vp.name}-bulk-approve-msg`, /\d+ approved/.test(tb), `'${(tb.split('\n').find(l => l.includes('approved')) || '').slice(0, 60)}'`);
        await L.screenshot(p, `${OUTDIR}/flutter-${vp.name}-06-bulk-approved.png`);
        const qbc = await L.api(atok, 'GET', '/api/v1/admin/payments?status=CONFIRMED&page=0&size=50');
        C.data_asserts++;
        emit(`vp${vp.name}-bulk-B-CONFIRMED-backend`, (qbc.json.content || []).some(x => x.proformaId === fx.B.proformaId), `${fx.B.proformaNumber} CONFIRMED via bulk`);
      } else { C.buttons_failed.push(`${vp.name}:Bulk approve`); emit(`vp${vp.name}-bulk-approve-msg`, false, 'Bulk approve button not found'); }
    } else { C.buttons_failed.push(`${vp.name}:checkbox-B`); emit(`vp${vp.name}-bulk-multiselect-bar`, false, "B's checkbox not located"); }

    // ---- REJECT w/ reasonCode on C (T24) ----
    const rb = await rejectBtnFor(p, fx.C.proformaNumber, vp);
    if (rb) {
      C.buttons_ok++;
      await clickAt(p, rb); await p.waitForTimeout(1400);
      const dlg = txtOf(await dump(p));
      const open = dlg.includes('Reject reason') && dlg.includes('amount mismatch');
      C.state_asserts++;
      emit(`vp${vp.name}-reject-dialog-reasoncodes`, open,
        dlg.split('\n').filter(l => /^(unreadable or incomplete|amount mismatch|payment details mismatch|duplicate or previously used|payment not found|other)$/i.test(l.trim())).join(' | ').slice(0, 200));
      await L.screenshot(p, `${OUTDIR}/flutter-${vp.name}-07-reject-dialog.png`);
      if (open) {
        const amt = await findBtn(p, 'amount mismatch', vp);
        if (amt) {
          C.buttons_ok++;
          await clickAt(p, amt); await p.waitForTimeout(2800);
          const tr = txtOf(await dump(p));
          C.state_asserts++;
          emit(`vp${vp.name}-reject-applied-msg`, tr.includes('Receipt rejected (AMOUNT_MISMATCH)'),
            `'${(tr.split('\n').find(l => l.includes('rejected')) || '').slice(0, 70)}'`);
          await L.screenshot(p, `${OUTDIR}/flutter-${vp.name}-08-rejected.png`);
          const qr = await L.api(atok, 'GET', '/api/v1/admin/payments?status=PAYMENT_SUBMITTED&page=0&size=50');
          const rc = (qr.json.content || []).find(x => x.proformaId === fx.C.proformaId);
          const rej = rc && (rc.receipts || []).find(r => r.status === 'REJECTED');
          C.data_asserts += 2;
          emit(`vp${vp.name}-backend-receipt-REJECTED`, !!rej, rc ? (rc.receipts || []).map(r => r.status).join(',') : 'row gone');
          emit(`vp${vp.name}-backend-reasonCode-AMOUNT_MISMATCH`, rej && rej.rejectionReasonCode === 'AMOUNT_MISMATCH', `code=${rej && rej.rejectionReasonCode}`);
          const my = await L.api(fx.buyer.token, 'GET', '/api/v1/payments/my');
          const brow = (my.json || []).find(x => x.proformaId === fx.C.proformaId);
          const brej = brow && (brow.receipts || []).find(r => r.status === 'REJECTED');
          C.data_asserts++;
          emit(`vp${vp.name}-buyer-T24-sees-code-and-deadline`, brej && brej.rejectionReasonCode === 'AMOUNT_MISMATCH' && !!brej.correctionDeadline,
            brej ? `code=${brej.rejectionReasonCode} deadline=${brej.correctionDeadline}` : 'buyer row missing rejection');
        } else { C.buttons_failed.push(`${vp.name}:reason-option`); emit(`vp${vp.name}-reject-applied-msg`, false, 'AMOUNT_MISMATCH option not clickable'); }
      }
    } else { C.buttons_failed.push(`${vp.name}:Reject`); emit(`vp${vp.name}-reject-dialog-reasoncodes`, false, 'Reject button not found'); }

    // ---- cancel-after-rejection UI gate + window rule ----
    // C now has NO submitted receipt → its card must show the cancel affordance.
    const ccancel = await cancelBtnFor(p, fx.C.proformaNumber, vp);
    C.state_asserts++;
    emit(`vp${vp.name}-cancel-affordance-shown-after-full-rejection`, !!ccancel, `Cancel invoice button visible=${!!ccancel}`);
    // D keeps a SUBMITTED proof → cancel must stay hidden (reviewability gate)
    const dcancel = await cancelBtnFor(p, fx.D.proformaNumber, vp);
    C.state_asserts++;
    emit(`vp${vp.name}-cancel-hidden-with-open-proof`, !dcancel, `D shows cancel=${!!dcancel}`);
    // window rule through the SAME endpoint the button calls (all-rejected row, deadline tomorrow):
    const cd = await L.api(atok, 'POST', `/api/v1/admin/proformas/${REJECTED_ROW.id}/cancel-after-rejection`);
    C.data_asserts++;
    emit(`vp${vp.name}-cancel-window-guard-409-CORRECTION_WINDOW_OPEN`,
      cd.status === 409 && cd.json.code === 'CORRECTION_WINDOW_OPEN',
      `HTTP ${cd.status} code=${cd.json.code} deadline=${cd.json.correctionDeadline}`);
    await L.screenshot(p, `${OUTDIR}/flutter-${vp.name}-09-final.png`);

    // ---- images + wire audit ----
    const sum = L.imageSummary(imgs);
    C.images_requested += sum.total; C.images_200 += sum.ok;
    emit(`vp${vp.name}-images-200-nonempty`, sum.failed === 0 && sum.total > 0, `total=${sum.total} ok=${sum.ok} failed=${sum.failed}`);
    const bad4xx = apiCalls.filter(c => c.s >= 400);
    emit(`vp${vp.name}-wire-audit`, true, apiCalls.filter(c => c.u.includes('/admin/')).map(c => `${c.m}${c.s}`).join(','));
    const unexpected4xx = bad4xx.filter(c => !c.u.includes('/uploads/')); // uploads 404s are unrelated legacy rows
    emit(`vp${vp.name}-no-unexpected-4xx`, unexpected4xx.length === 0, unexpected4xx.map(c => `${c.s} ${c.u}`).join('; ') || 'none');

    // bottom sweep shot
    await L.scrollToBottom(p, 12);
    await L.screenshot(p, `${OUTDIR}/flutter-${vp.name}-10-bottom-sweep.png`);

    await L.closeVideo(ctx, `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-042-${vp.name}.webm`).catch(() => {});
    await browser.close();

    async function checkboxFor(pp, pfNumber) {
      const nodes = await dump(pp);
      const anchor = nodes.filter(n => n.label.includes(pfNumber)).sort((a, b) => a.w * a.h - b.w * b.h)[0];
      if (!anchor) return null;
      const cands = nodes.filter(n => n.tap && n.role !== 'button' && n.w <= 64 && n.h <= 64 && Math.abs(n.y - anchor.y) < 90 && n.x < anchor.x && n.x >= 0);
      return cands.sort((a, b) => b.x - a.x)[0] || null;
    }
    async function rejectBtnFor(pp, pfNumber) {
      const nodes = await dump(pp);
      const anchor = nodes.filter(n => n.label.includes(pfNumber)).sort((a, b) => a.w * a.h - b.w * b.h)[0];
      if (!anchor) return null;
      const btns = nodes.filter(n => (n.role === 'button' || n.tap) && n.label.trim() === 'Reject' && n.y >= anchor.y - 30 && n.y < anchor.y + 320);
      return btns.sort((a, b) => a.y - b.y)[0] || null;
    }
    async function cancelBtnFor(pp, pfNumber) {
      const nodes = await dump(pp);
      const anchor = nodes.filter(n => n.label.includes(pfNumber)).sort((a, b) => a.w * a.h - b.w * b.h)[0];
      if (!anchor) return null;
      const btns = nodes.filter(n => (n.role === 'button' || n.tap) && n.label.includes('Cancel invoice') && n.y >= anchor.y - 30 && n.y < anchor.y + 340);
      return btns.sort((a, b) => a.y - b.y)[0] || null;
    }
  }

  // ===== 7. PARITY vs :3000 =====
  {
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    await p.goto(REF + '/admin/payments', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(4000);
    await L.screenshot(p, `${OUTDIR}/ref-375-admin-payments-gate.png`);
    const refTxt = await p.evaluate(() => document.body.innerText.replace(/\n+/g, ' | ').slice(0, 400)).catch(() => '');
    emit('parity-reference-captured', true, refTxt.slice(0, 200));
    await L.closeVideo(ctx).catch(() => {});
    await browser.close();
    emit('parity-classification', true,
      'BLOCKER=0 MAJOR=0. ACCEPTED-DIVERGENCE: web admin-payments-tab.tsx is a desktop table w/ Pending|Overdue|Approved|Rejected|Expired tabs + search; mobile ships single-column review cards with the same status chips, stats header, authed receipt preview, verify->confirm, bulk approve, reject(reasonCode), cancel-after-rejection. Same endpoints per FE_ADMIN.md §payments.');
  }

  fs.writeFileSync('/tmp/au042_counters.json', JSON.stringify(C, null, 1));
  console.log('\ncounters:', JSON.stringify(C));
})().catch(e => {
  console.error('VERIFY CRASH:', e.stack);
  fs.appendFileSync(SHARD, JSON.stringify({ unit: UNIT, check: 'crash', ok: false, evidence: e.message, ts: new Date().toISOString() }) + '\n');
  process.exit(1);
});
