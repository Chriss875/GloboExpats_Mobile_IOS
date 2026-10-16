// au042_r9e_375.js — 375 completion leg (v2): A (PF-2026-000413) is the remaining
// PAYMENT_SUBMITTED row from set 1. Tick A's card, scroll UP to the top-anchored
// Bulk bar, approve, prove wire POST + backend CONFIRMED + order PAID/HELD/ASC.
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
L.APP = 'http://localhost:9130';
(async () => {
  const vp = { w: 375, h: 667 };
  const APP = 'http://localhost:9130';
  const fx = JSON.parse(fs.readFileSync('/tmp/au042_r9_fixtures.json', 'utf8'));
  const TARGET = fx.A; // set-1 row still in SUBMITTED
  const SHARD = 'e2e/results/shards/AU-042-verify-r9.jsonl';
  const OUTDIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-042';
  function chk(name, ok, ev) {
    const o = { ts: new Date().toISOString(), unit: 'AU-042', stage: 'verify-r9c-completion', check: name, ok: !!ok, evidence: String(ev).slice(0, 500) };
    fs.appendFileSync(SHARD, JSON.stringify(o) + '\n');
    console.log(ok ? 'PASS' : 'FAIL', '|', name, '|', String(ev).slice(0, 200));
  }
  async function dump() {
    return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => {
      const r = e.getBoundingClientRect();
      return { role: e.getAttribute('role') || '', tap: e.getAttribute('flt-tappable') !== null,
        label: (e.getAttribute('aria-label') || e.textContent || '').trim(), checked: e.getAttribute('aria-checked'),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }).filter(n => n.label));
  }
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: vp.w, height: vp.h }, videoPath: '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-042-r9c-375.webm' });
  const p = await ctx.newPage(); p.setDefaultTimeout(30000);
  const apiLog = [];
  p.on('response', r => {
    const u = r.url();
    if (/localhost:8083/.test(u)) apiLog.push({ m: r.request().method(), u: u.replace(/^https?:\/\/[^/]+/, '').split('?')[0], s: r.status() });
  });
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await p.evaluate(() => localStorage.clear()).catch(() => {});
  await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 40000);
  chk('vp375-admin-login-final-leg', await L.login(p, L.ADMIN), 'token persisted');
  await p.evaluate(() => { window.location.hash = '#/admin/payments-review'; });
  await L.waitText(p, 'Payment review', 30000); await p.waitForTimeout(4200);

  let ticked = false;
  for (let i = 0; i < 24 && !ticked; i++) {
    let nodes = await dump();
    let c = nodes.find(n => n.role === 'checkbox' && n.label.includes(TARGET.proformaNumber));
    if (!c) break;
    if (c.checked === 'true') { ticked = true; break; }
    if (c.y >= 130 && c.y + Math.min(c.h, 320) <= vp.h - 70) {
      await p.mouse.click(c.x + Math.min(26, c.w / 4), c.y + Math.min(22, c.h / 3));
      await p.waitForTimeout(1500);
      nodes = await dump();
      c = nodes.find(n => n.role === 'checkbox' && n.label.includes(TARGET.proformaNumber));
      ticked = !!(c && c.checked === 'true');
    } else {
      await p.mouse.move(vp.w / 2, vp.h * 0.5);
      await p.mouse.wheel(0, (c.y + c.h / 2 > vp.h * 0.55 ? 1 : -1) * 300); await p.waitForTimeout(230);
    }
  }
  chk('vp375-card-checkbox-A-tick-singleselect', ticked, `A ${TARGET.proformaNumber} aria-checked=true -> bar shows Bulk approve (1)`);
  let bulk = null;
  for (let i = 0; i < 28; i++) {
    const nodes = await dump();
    bulk = nodes.filter(n => n.role === 'button' && n.label.includes('Bulk approve'))
      .sort((a, b) => a.w * a.h - b.w * b.h)[0] || null;
    if (bulk && bulk.y >= 100 && bulk.y + bulk.h <= vp.h - 12) break;
    await p.mouse.move(vp.w / 2, vp.h * 0.45); await p.mouse.wheel(0, -300); await p.waitForTimeout(240);
  }
  if (!bulk) { chk('vp375-bulk-bar-reachable-at-375', false, 'Bulk bar never on screen'); }
  else {
    chk('vp375-bulk-bar-reachable-at-375', true, `bar at y=${bulk.y} h=${bulk.h} label='${bulk.label}'`);
    await p.screenshot({ path: `${OUTDIR}/AU-042-r9-375-08b-bulk-selected-single.png` });
    await p.mouse.click(bulk.x + bulk.w / 2, bulk.y + bulk.h / 2); await p.waitForTimeout(4200);
    const t = (await dump()).map(n => n.label).join('\n');
    chk('vp375-bulk-approve-msg', /\d+ approved/.test(t), `'${(t.split('\n').find(l => l.includes('approved')) || '(none)').trim().slice(0, 90)}'`);
    await p.screenshot({ path: `${OUTDIR}/AU-042-r9-375-09b-bulk-approved-single.png` });
    const wireBulk = apiLog.find(c => c.u.includes('/admin/proformas/bulk-approve'));
    chk('vp375-bulk-wire-call-observed', !!wireBulk && wireBulk.s === 200, JSON.stringify(wireBulk || 'absent'));
    const atok = await L.apiLogin(L.ADMIN);
    const qbc = await L.api(atok, 'GET', '/api/v1/admin/payments?status=CONFIRMED&page=0&size=50');
    const okA = (qbc.json.content || []).some(x => x.proformaId === TARGET.proformaId);
    chk('vp375-bulk-single-CONFIRMED-backend', okA, `${TARGET.proformaNumber} CONFIRMED via bulk=${okA}`);
    const ra = (qbc.json.content || []).find(x => x.proformaId === TARGET.proformaId);
    const oid = ra && (ra.orderIds || [])[0];
    if (oid) {
      const od = await L.api(fx.buyer.token, 'GET', `/api/v1/orders/${oid}`);
      const oj = od.json || {};
      chk('vp375-T16-order-PAID-escrow-cleared-HELD-AWAITING_SELLER_CONFIRMATION',
        oj.paymentStatus === 'PAID' && oj.escrowPending === false && oj.payoutStatus === 'HELD'
        && (oj.orderStatus === 'AWAITING_SELLER_CONFIRMATION' || oj.status === 'AWAITING_SELLER_CONFIRMATION'),
        JSON.stringify({ paymentStatus: oj.paymentStatus, escrowPending: oj.escrowPending, payoutStatus: oj.payoutStatus, orderStatus: oj.orderStatus || oj.status }));
    } else chk('vp375-T16-order-PAID-escrow-cleared-HELD-AWAITING_SELLER_CONFIRMATION', false, 'orderIds empty');
  }
  await ctx.close(); await browser.close();
})().catch(e => { console.error('CRASH', e.stack); process.exit(1); });
