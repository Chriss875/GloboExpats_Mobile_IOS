// au042_r9c_patch.js — completes the 4 residual legs of run 9c on the SAME fixtures.
// (1) 375: tick B's card checkbox -> Bulk approve (1) -> backend CONFIRMED for B
// (2) 375: buyer T24 re-read (deadline was stamped seconds after the r9c read; now persisted)
// (3) 768: bulk-approve click on the ALREADY-ticked pair (A2+B2 stayed selected in the UI;
//     server state untouched since the r9c attempt never fired) -> wire POST + both CONFIRMED
// (4) 1280: CONFIRMED chip sweep with the now-confirmed rows present
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
L.APP = 'http://localhost:9130';
const APP = 'http://localhost:9130';
const SHARD = 'e2e/results/shards/AU-042-verify-r9.jsonl';
const OUTDIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-042';
const VIDDIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos';
const fx = JSON.parse(fs.readFileSync('/tmp/au042_r9_fixtures.json', 'utf8'));
const fx2 = JSON.parse(fs.readFileSync('/tmp/au042_r9_fixtures_s2.json', 'utf8'));
function chk(name, ok, ev) {
  const o = { ts: new Date().toISOString(), unit: 'AU-042', stage: 'verify-r9c-completion', check: name, ok: !!ok, evidence: String(ev).slice(0, 600) };
  fs.appendFileSync(SHARD, JSON.stringify(o) + '\n');
  console.log(ok ? 'PASS' : 'FAIL', '|', name, '|', String(ev).slice(0, 200));
}
async function dump(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => {
    const r = e.getBoundingClientRect();
    return { role: e.getAttribute('role') || '', tap: e.getAttribute('flt-tappable') !== null,
      label: (e.getAttribute('aria-label') || e.textContent || '').trim(), checked: e.getAttribute('aria-checked'),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }).filter(n => n.label));
}
const txtOf = N => N.map(n => n.label).join('\n');
async function revealCard(p, pfNumber, vp, tries = 24) {
  for (let i = 0; i < tries; i++) {
    const nodes = await dump(p);
    const card = nodes.find(n => n.role === 'checkbox' && n.label.includes(pfNumber));
    if (!card) return null;
    if (card.y >= 130 && Math.min(card.y + card.h, card.y + 320) <= vp.h - 70) return card;
    const dir = card.y + card.h / 2 > vp.h * 0.55 ? 1 : -1;
    await p.mouse.move(vp.w / 2, vp.h * 0.5); await p.mouse.wheel(0, dir * 300); await p.waitForTimeout(240);
  }
  return (await dump(p)).find(n => n.role === 'checkbox' && n.label.includes(pfNumber)) || null;
}
async function findNode(p, want, vp) {
  const nodes = await dump(p); let best = null;
  for (const n of nodes) {
    if (!n.label.includes(want) || !(n.role === 'button' || n.tap)) continue;
    if (n.w < 6 || n.h < 6) continue;
    if (n.y + n.h <= 0 || n.y >= vp.h || n.x + n.w <= 0 || n.x >= vp.w) continue;
    if (!best || n.w * n.h < best.w * best.h) best = n;
  }
  return best;
}
(async () => {
  const atok = await L.apiLogin(L.ADMIN);

  // ---------- (1)+(2): 375 completion ----------
  {
    const vp = { name: '375', w: 375, h: 667 };
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: vp.w, height: vp.h }, videoPath: `${VIDDIR}/AU-042-r9c-375.webm` });
    const p = await ctx.newPage(); p.setDefaultTimeout(30000);
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await p.evaluate(() => localStorage.clear()).catch(() => {});
    await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 40000);
    const logged = await L.login(p, L.ADMIN);
    chk('vp375-admin-login-r9c', logged, 'token persisted');

    // (2) buyer T24 re-read — deadline persisted after rejection
    const my = await L.api(fx.buyer.token, 'GET', '/api/v1/payments/my');
    const brow = (Array.isArray(my.json) ? my.json : []).find(x => x.proformaId === fx.C.proformaId);
    const brej = brow && (brow.receipts || []).find(r => r.status === 'REJECTED');
    chk('vp375-buyer-T24-sees-code-and-deadline', !!(brej && brej.rejectionReasonCode === 'AMOUNT_MISMATCH' && brej.correctionDeadline),
      brej ? `code=${brej.rejectionReasonCode} deadline=${brej.correctionDeadline}` : 'no rejection row');

    // (1) tick B -> Bulk approve (1)
    await p.evaluate(() => { window.location.hash = '#/admin/payments-review'; });
    await L.waitText(p, 'Payment review', 30000); await p.waitForTimeout(4000);
    const cardB = await revealCard(p, fx.B.proformaNumber, vp);
    if (!cardB) { chk('vp375-card-checkbox-B-tick', false, 'B card not found under SUBMITTED'); }
    else {
      if (cardB.checked === 'true') { await p.mouse.click(cardB.x + 26, cardB.y + 22); await p.waitForTimeout(1200); } // untick leftover
      const c1 = await revealCard(p, fx.B.proformaNumber, vp);
      await p.mouse.click(c1.x + Math.min(26, c1.w / 4), c1.y + Math.min(22, c1.h / 3));
      await p.waitForTimeout(1500);
      let nb = (await dump(p)).find(n => n.role === 'checkbox' && n.label.includes(fx.B.proformaNumber));
      const ticked = nb && nb.checked === 'true';
      const T1 = txtOf(await dump(p));
      chk('vp375-card-checkbox-B-tick', !!ticked, `aria-checked ${cardB.checked} -> ${nb && nb.checked}`);
      chk('vp375-bulk-bar-appears-on-select', !!ticked && T1.includes('Bulk approve (1)'),
        `'${(T1.split('\n').find(l => l.startsWith('Bulk approve')) || '(none)').trim()}'`);
      await L.screenshot(p, `${OUTDIR}/AU-042-r9-375-08-bulk-selected.png`);
      if (ticked) {
        const bb = await findNode(p, 'Bulk approve (', vp);
        if (bb) {
          await p.mouse.click(bb.x + bb.w / 2, bb.y + bb.h / 2); await p.waitForTimeout(3800);
          const T2 = txtOf(await dump(p));
          chk('vp375-bulk-approve-msg', /\d+ approved/.test(T2), `'${(T2.split('\n').find(l => l.includes('approved')) || '(none)').trim()}'`);
          await L.screenshot(p, `${OUTDIR}/AU-042-r9-375-09-bulk-approved.png`);
          const qbc = await L.api(atok, 'GET', '/api/v1/admin/payments?status=CONFIRMED&page=0&size=50');
          chk('vp375-bulk-B-CONFIRMED-backend', (qbc.json.content || []).some(x => x.proformaId === fx.B.proformaId),
            `${fx.B.proformaNumber} CONFIRMED via bulk=${(qbc.json.content || []).some(x => x.proformaId === fx.B.proformaId)}`);
        } else chk('vp375-bulk-approve-msg', false, 'Bulk approve button missing');
      }
    }
    await L.closeVideo(ctx, `${VIDDIR}/AU-042-r9c-375.webm`).catch(() => {});
    await browser.close();
  }

  // ---------- (3): 768 bulk-approve click on the still-ticked pair ----------
  {
    const vp = { name: '768', w: 768, h: 1024 };
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: vp.w, height: vp.h }, videoPath: `${VIDDIR}/AU-042-r9c-768.webm` });
    const p = await ctx.newPage(); p.setDefaultTimeout(30000);
    const apiLog = []; const receiptFiles = {};
    p.on('response', r => {
      const u = r.url();
      if (/localhost:8083/.test(u)) apiLog.push({ m: r.request().method(), u: u.replace(/^https?:\/\/[^/]+/, '').split('?')[0], s: r.status() });
      if (/\/api\/v1\/admin\/receipts\/([0-9a-f-]+)\/file/.test(u)) receiptFiles[u.match(/receipts\/([0-9a-f-]+)\/file/)[1]] = r.status();
    });
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await p.evaluate(() => localStorage.clear()).catch(() => {});
    await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 40000);
    chk('vp768-admin-login-r9c', await L.login(p, L.ADMIN), 'token persisted');
    await p.evaluate(() => { window.location.hash = '#/admin/payments-review'; });
    await L.waitText(p, 'Payment review', 30000); await p.waitForTimeout(4200);
    let T = txtOf(await dump(p));

    // ensure A2+B2 ticked (fresh context -> fresh selection state)
    for (const pf of [fx2.A2.proformaNumber, fx2.B2.proformaNumber]) {
      const c = await revealCard(p, pf, vp);
      if (!c) { chk(`vp768-retick-${pf}`, false, 'card not revealed'); continue; }
      if (c.checked !== 'true') {
        await p.mouse.click(c.x + Math.min(26, c.w / 4), c.y + Math.min(22, c.h / 3));
        await p.waitForTimeout(1400);
      }
      const nc = (await dump(p)).find(n => n.role === 'checkbox' && n.label.includes(pf));
      chk(`vp768-card-checkbox-${pf}-ticked`, nc && nc.checked === 'true', `checked=${nc && nc.checked}`);
    }
    T = txtOf(await dump(p));
    chk('vp768-multiselect-bar-counts-two', T.includes('Bulk approve (2)'), `'${(T.split('\n').find(l => l.startsWith('Bulk approve')) || '(none)').trim()}'`);
    await L.screenshot(p, `${OUTDIR}/AU-042-r9-768-02-multiselect-two.png`);
    const bb2 = await findNode(p, 'Bulk approve (2)', vp);
    if (bb2) {
      await p.mouse.click(bb2.x + bb2.w / 2, bb2.y + bb2.h / 2); await p.waitForTimeout(4200);
      T = txtOf(await dump(p));
      chk('vp768-bulk-approve-2-msg', /2 approved/.test(T), `'${(T.split('\n').find(l => l.includes('approved')) || '(none)').trim()}'`);
      await L.screenshot(p, `${OUTDIR}/AU-042-r9-768-03-bulk-approved-2.png`);
      const wireBulk = apiLog.find(c => c.u.includes('/admin/proformas/bulk-approve'));
      chk('vp768-bulk-wire-call-observed', !!wireBulk && wireBulk.s === 200, JSON.stringify(wireBulk || 'absent'));
      const qc2 = await L.api(atok, 'GET', '/api/v1/admin/payments?status=CONFIRMED&page=0&size=50');
      const gA2 = (qc2.json.content || []).some(x => x.proformaId === fx2.A2.proformaId);
      const gB2 = (qc2.json.content || []).some(x => x.proformaId === fx2.B2.proformaId);
      chk('vp768-bulk-both-CONFIRMED-backend', gA2 && gB2, `A2=${gA2} B2=${gB2}`);
      const ra2 = (qc2.json.content || []).find(x => x.proformaId === fx2.A2.proformaId);
      const oid2 = ra2 && (ra2.orderIds || [])[0];
      if (oid2) {
        const od2 = await L.api(fx2.buyerToken, 'GET', `/api/v1/orders/${oid2}`);
        const oj = od2.json || {};
        chk('vp768-bulk-order-PAID-HELD-AWAITING_SELLER_CONFIRMATION',
          oj.paymentStatus === 'PAID' && oj.escrowPending === false && oj.payoutStatus === 'HELD'
          && (oj.orderStatus === 'AWAITING_SELLER_CONFIRMATION' || oj.status === 'AWAITING_SELLER_CONFIRMATION'),
          JSON.stringify({ paymentStatus: oj.paymentStatus, escrowPending: oj.escrowPending, payoutStatus: oj.payoutStatus, orderStatus: oj.orderStatus || oj.status }));
      } else chk('vp768-bulk-order-PAID-HELD-AWAITING_SELLER_CONFIRMATION', false, 'orderIds empty');
    } else chk('vp768-bulk-approve-2-msg', false, 'Bulk approve (2) not visible');
    await L.closeVideo(ctx, `${VIDDIR}/AU-042-r9c-768.webm`).catch(() => {});
    await browser.close();
  }

  // ---------- (4): 1280 CONFIRMED sweep ----------
  {
    const vp = { name: '1280', w: 1280, h: 900 };
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: vp.w, height: vp.h }, videoPath: `${VIDDIR}/AU-042-r9c-1280.webm` });
    const p = await ctx.newPage(); p.setDefaultTimeout(30000);
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await p.evaluate(() => localStorage.clear()).catch(() => {});
    await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 40000);
    chk('vp1280-admin-login-r9c', await L.login(p, L.ADMIN), 'token persisted');
    await p.evaluate(() => { window.location.hash = '#/admin/payments-review'; });
    await L.waitText(p, 'Payment review', 30000); await p.waitForTimeout(4200);
    const cb = await findNode(p, 'CONFIRMED', vp);
    if (cb) {
      await p.mouse.click(cb.x + cb.w / 2, cb.y + cb.h / 2); await p.waitForTimeout(2800);
      const t2 = txtOf(await dump(p));
      const hits = [fx.A.proformaNumber, fx.B.proformaNumber, fx2.A2.proformaNumber].map(n => [n, t2.includes(n)]);
      chk('vp1280-chip-CONFIRMED-shows-confirmed-rows',
        t2.includes(fx.A.proformaNumber) && !t2.includes(fx.D.proformaNumber),
        `confirmed rows visible: ${hits.map(([n, v]) => `${n}=${v}`).join(' ')} D hidden=${!t2.includes(fx.D.proformaNumber)}`);
      await L.screenshot(p, `${OUTDIR}/AU-042-r9-1280-02-chip-CONFIRMED.png`);
    } else chk('vp1280-chip-CONFIRMED-shows-confirmed-rows', false, 'chip not found');
    await L.closeVideo(ctx, `${VIDDIR}/AU-042-r9c-1280.webm`).catch(() => {});
    await browser.close();
  }
})().catch(e => { console.error('PATCH CRASH:', e.stack); process.exit(1); });
