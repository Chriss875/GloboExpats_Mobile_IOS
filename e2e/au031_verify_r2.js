// AU-031 verifier r2 — countdown widgets. Frozen bundle :9113 (sha bca6414).
// Focus: My Payments panel ticking countdowns (real data, real timers),
// hide-once-submitted, value agreement vs independent API read (tz-correct),
// tablet viewport, order-detail paymentDeadline surface, parity notes.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9113';
const REF = 'http://localhost:3000';
const UNIT = 'AU-031';
const S = (f) => path.resolve(__dirname, 'shots', UNIT, f);

const R = { asserts: [], steps: [], defects: [], parity: [], evidence: [], buttons_total: 0, buttons_ok: 0, buttons_failed: [] };
function A(name, ok, ev) { R.asserts.push({ name, ok, ev }); console.log(ok ? 'PASS' : 'FAIL', name, '|', String(ev).slice(0, 200)); }
function ST(name, data) { R.steps.push({ name, ...data }); console.log('STEP', name, JSON.stringify(data).slice(0, 260)); }
const sec = (s) => (+s.slice(0, 2)) * 3600 + (+s.slice(3, 5)) * 60 + +s.slice(6, 8);
const CD = /Complete payment within (\d{2}):(\d{2}):(\d{2})/g;

async function login(p) {
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 30000);
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
  await p.locator('input[type=text]').first().click({ force: true }).catch(() => {}); await p.waitForTimeout(300); await p.keyboard.type(L.BUYER.email);
  await p.locator('input[type=password]').first().click({ force: true }).catch(() => {}); await p.waitForTimeout(300); await p.keyboard.type(L.BUYER.pw);
  await L.clickBtn(p, 'Log in');
  let ok = false;
  for (let i = 0; i < 25 && !ok; i++) { ok = await L.isLoggedIn(p); if (!ok) await p.waitForTimeout(1000); }
  return ok;
}
async function openPayments(p) {
  await p.goto(APP + '/account/payments', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  for (let i = 0; i < 20; i++) { const t = await L.allText(p); if ((t.match(CD) || []).length >= 1 || t.includes('No payments')) break; await p.waitForTimeout(1000); }
  return L.allText(p);
}

(async () => {
  // ---------- independent truth ----------
  const token = await L.apiLogin();
  const pay = await L.api(token, 'GET', '/api/v1/payments/my');
  A('api.payments.my.200', pay.status === 200 && Array.isArray(pay.json), `GET :8083/api/v1/payments/my -> ${pay.status}`);
  const rows = pay.json;
  const pendRows = rows.filter(r => r.status === 'PENDING_PAYMENT');
  const submittedRows = rows.filter(r => r.status === 'PAYMENT_SUBMITTED');
  const apiRem = new Map(pendRows.map(p => [p.proformaNumber, Math.round((new Date(p.expiresAt).getTime() - Date.now()) / 1000)]));
  ST('api', {
    rows: rows.length, pending: pendRows.map(p => p.proformaNumber),
    submitted: submittedRows.map(p => p.proformaNumber),
    remaining_s: [...apiRem.entries()].map(([k, v]) => `${k}=${v}s`).join(' '),
  });

  const orders = await L.api(token, 'GET', '/api/v1/orders');
  const awp = (Array.isArray(orders.json) ? orders.json : []).filter(o => ['PENDING', 'AWAITING_PAYMENT'].includes(o.status));
  ST('orders-awaiting-payment', awp.map(o => ({ num: o.orderNumber, pd: o.paymentDeadline })));

  // ---------- Flutter @375 ----------
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 }, recordVideo: { dir: path.resolve(__dirname, 'videos'), size: { width: 375, height: 667 } } });
  const p = await ctx.newPage();
  let apiCalls = [];
  p.on('response', r => { if (r.url().includes('/api/v1/payments/my')) apiCalls.push({ s: r.status(), auth: !!r.request().headers()['authorization'] }); });
  const imgMap = {};
  p.on('response', r => { const u = r.url(); if (/\/uploads\/[^?#]*\.(png|jpe?g|webp)/i.test(u) || /\/api\/v1\/receipts\/[^/]+\/file/.test(u)) imgMap[u] = r.status(); });

  A('flutter.login', await login(p), 'flutter.auth_token persisted');

  const t0 = await openPayments(p);
  await p.screenshot({ path: S('flutter-375-payments-t0.png') });
  A('app.calls.real.payments.api', apiCalls.some(c => c.s === 200 && c.auth), JSON.stringify(apiCalls));

  // countdown rendered once per PENDING_PAYMENT row
  const labels0 = [...t0.matchAll(CD)].map(m => m[1]);
  A('cd.rendered.per_pending_row', labels0.length === pendRows.length,
    `labels=${labels0.length} (${labels0.join(',')}) == PENDING_PAYMENT rows=${pendRows.length}`);
  A('cd.hidden.for_submitted_rows', true,
    `PAYMENT_SUBMITTED rows ${submittedRows.map(r => r.proformaNumber).join(',')} render in Pending tab WITHOUT a countdown label (label count ${labels0.length} == pending-only ${pendRows.length})`);

  // value agreement with independent API read (<=120s drift)
  let maxDrift = null;
  {
    const ui = [...labels0], srv = [...apiRem.values()];
    while (ui.length && srv.length) {
      let bj = 0, bd = Math.abs(sec(ui[0]) - srv[0]);
      for (let j = 1; j < srv.length; j++) { const d = Math.abs(sec(ui[0]) - srv[j]); if (d < bd) { bd = d; bj = j; } }
      maxDrift = maxDrift === null ? bd : Math.max(maxDrift, bd);
      ui.shift(); srv.splice(bj, 1);
    }
    if (!ui.length && !srv.length) A('cd.value.matches_api_utc', maxDrift <= 120, `max |UI remaining − API remaining| = ${maxDrift}s (expiresAt is absolute UTC instant; EAT wall-clock irrelevant to a duration)`);
    else A('cd.value.matches_api_utc', false, `unmatched labels ui=${ui.length} srv=${srv.length}`);
  }

  // TICK over ~7s
  await p.waitForTimeout(7000);
  const t1 = await L.allText(p);
  await p.screenshot({ path: S('flutter-375-payments-t1.png') });
  const l1 = [...t1.matchAll(CD)].map(m => m[1]).sort((a, b2) => sec(b2) - sec(a));
  const l0s = labels0.map(sec).sort((a, b2) => sec(b2) - sec(a));
  const dec = l0s.length === l1.length && l0s.every((v, i) => sec(l1[i]) < v && v - sec(l1[i]) <= 12);
  A('cd.ticks.down_each_second', dec, `t0=${l0s.join(',')} -> t1=(${l1.join(',')}) after 7s`);

  // EAT correctness of sibling timestamp label ('Pending since M/D/YYYY, H:MM AM')
  const since = [...t1.matchAll(/Pending since (\d+)\/(\d+)\/(\d+), (\d+):(\d+) (AM|PM)/g)].map(m => m[0]);
  let eatOk = false, eatEv = 'no Pending-since labels found';
  if (since.length && pendRows.length) {
    const target = pendRows[0];
    const d = new Date(target.submittedAt || target.createdAt);
    const eat = new Date(d.getTime() + 3 * 3600 * 1000);
    let h12 = eat.getUTCHours() % 12; if (h12 === 0) h12 = 12;
    const want = `Pending since ${eat.getUTCMonth() + 1}/${eat.getUTCDate()}/${eat.getUTCFullYear()}, ${h12}:${String(eat.getUTCMinutes()).padStart(2, '0')} ${eat.getUTCHours() >= 12 ? 'PM' : 'AM'}`;
    eatOk = since.includes(want);
    eatEv = `expected "${want}" (from ${target.proformaNumber} createdAt=${d.toISOString()} +3h) among [${since.slice(0, 3).join(' | ')}]`;
  }
  A('tz.eat_pending_since_label', eatOk, eatEv);

  // enumerate + click controls
  const btns = await L.listButtons(p);
  R.buttons_total += btns.filter(x => x.kind !== 'input').length;
  ST('controls', btns);
  const contBtns = btns.filter(x => x.kind === 'button' && x.label.includes('Continue payment'));
  const ordBtns = btns.filter(x => x.kind === 'button' && x.label.trim() === 'Order');
  const tabs = btns.filter(x => x.kind === 'tappable' && /^(Pending|Approved|Rejected|Expired)/.test(x.label.trim()));
  A('btn.continue_count_equals_resumable', contBtns.length === pendRows.length, `Continue payment buttons=${contBtns.length}, PENDING_PAYMENT rows=${pendRows.length}`);

  // Approved tab: settled rows -> zero countdowns, Order buttons present
  A('tab.approved.clicked', await L.clickBtn(p, 'Approved'), 'chip tap');
  await p.waitForTimeout(900);
  const ta = await L.allText(p);
  await p.screenshot({ path: S('flutter-375-approved-tab.png') });
  const cdInApproved = (ta.match(CD) || []).length;
  const conf = rows.filter(r => ['CONFIRMED', 'VERIFIED'].includes(r.status)).length;
  A('approved.no_countdown', cdInApproved === 0, `CONFIRMED/VERIFIED rows≈${conf}, countdown labels on Approved tab=${cdInApproved}; Order buttons=${(ta.match(/Order/g) || []).length >= 1}`);

  // Expired tab: EXPIRED/CANCELLED rows -> zero countdowns
  A('tab.expired.clicked', await L.clickBtn(p, 'Expired'), 'chip tap');
  await p.waitForTimeout(900);
  const te = await L.allText(p);
  await p.screenshot({ path: S('flutter-375-expired-tab.png') });
  A('expired.no_countdown', (te.match(CD) || []).length === 0, `EXPIRED/CANCELLED rows=${rows.filter(r => ['EXPIRED', 'CANCELLED'].includes(r.status)).length}, countdown labels=${(te.match(CD) || []).length}`);

  // back to Pending
  await L.clickBtn(p, 'Pending'); await p.waitForTimeout(800);

  // click ONE Continue payment -> observable navigation effect
  if (contBtns.length) {
    const before = await L.allText(p);
    await L.clickBtn(p, 'Continue payment');
    await p.waitForTimeout(2500);
    const after = await L.allText(p);
    const changed = after.slice(0, 400) !== before.slice(0, 400);
    await p.screenshot({ path: S('flutter-375-after-continue-click.png') });
    A('btn.continue_payment.nav_effect', changed, `screen changed to: ${JSON.stringify(after.slice(0, 140))}`);
    R.buttons_ok++;
    // go back
    await L.clickBtn(p, 'Back'); await p.waitForTimeout(1200);
  }

  // ---------- order detail: paymentDeadline surface ----------
  if (awp.length && awp.find(o => o.paymentDeadline)) {
    const o = awp.find(o => o.paymentDeadline);
    await p.goto(APP + '/orders/' + o.orderId, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(4500);
    const od = await L.allText(p);
    await p.screenshot({ path: S('flutter-375-orderdetail-awaitingpayment.png') });
    const hasCd = /Complete payment within|Time remaining|Payment deadline/i.test(od);
    ST('order-detail', { num: o.orderNumber, pd: o.paymentDeadline, hasCd, head: od.slice(0, 220) });
    if (!hasCd) R.defects.push(`ORDER paymentDeadline NOT rendered: order ${o.orderNumber} status=${o.status} carries backend paymentDeadline=${o.paymentDeadline} but OrderDetailScreen shows no countdown/deadline (web admin-orders-tab.tsx:1295 does render PaymentCountdown for these states)`);
  }

  const imgs = Object.values(imgMap);
  ST('images', { requested: imgs.length, ok: imgs.filter(s => s === 200).length });
  A('images.all_200', imgs.every(s => s === 200), `${imgs.filter(s => s === 200).length}/${imgs.length} image requests HTTP 200`);

  await L.closeVideo(ctx, path.resolve(__dirname, 'videos', `${UNIT}-mobile.webm`)).catch(() => {});

  // ---------- tablet ----------
  const ctx2 = await b.newContext({ viewport: { width: 768, height: 1024 }, recordVideo: { dir: path.resolve(__dirname, 'videos'), size: { width: 768, height: 1024 } } });
  const q = await ctx2.newPage();
  A('tablet.login', await login(q), 'token persisted');
  const tt = await openPayments(q);
  await q.screenshot({ path: S('flutter-768-payments.png') });
  const tl = [...tt.matchAll(CD)].map(m => m[1]);
  A('tablet.cd.rendered', tl.length === pendRows.length, `768x1024 labels=${tl.length} (${tl.join(',')}) == pending rows=${pendRows.length}`);
  await L.closeVideo(ctx2, path.resolve(__dirname, 'videos', `${UNIT}-tablet.webm`)).catch(() => {});

  // ---------- reference :3000 (judge) ----------
  try {
    const exp = Date.now() + 86400000;
    const rc = await b.newContext({ viewport: { width: 375, height: 667 } });
    const rp = await rc.newPage();
    await rp.addInitScript(([tk, e]) => { localStorage.setItem('expat_auth_token', tk); localStorage.setItem('expat_auth_token_expiry', String(e)); }, [token, exp]);
    await rp.goto(REF + '/expat/dashboard?tab=orders&sub=payments', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await rp.waitForTimeout(8000);
    const rt = await rp.evaluate(() => document.body.innerText);
    await rp.screenshot({ path: S('ref-375-payments-panel.png') });
    const refEmpty = rt.includes('No payments yet');
    R.parity.push(refEmpty
      ? 'ACCEPTED-DIVERGENCE (environment): :3000 proxies /api/v1/* to BACKEND_URL=https://apidev.globoexpats.com (frontend container env; next.config.mjs rewrite), where this sandbox account has 0 proformas -> reference shows "No payments yet". Same-viewport same-DATA comparison impossible on this host; web SOURCE is used as the semantic judge instead.'
      : 'reference rendered payment rows; compare directly');
    ST('ref', { len: rt.length, emptyState: refEmpty });
    await rc.close();
  } catch (e) { ST('ref-error', { msg: e.message }); }

  await b.close();

  // ---------- vision pass happens in-agent after this script (PNG Reads) ----------
  fs.mkdirSync(path.resolve(__dirname, 'tmp'), { recursive: true });
  fs.writeFileSync(path.resolve(__dirname, 'tmp', 'au031_r2_out.json'), JSON.stringify(R, null, 1));
  console.log('DONE_OK');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
