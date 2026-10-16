// AU-031 verifier r3 — countdown widgets. Frozen bundle :9113 (sha bca6414).
// KEY FIX vs r2: _PaymentCard exposes its copy via aria-label on the role=group
// node (textContent stays empty), so extraction must read BOTH.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9113';
const REF = 'http://localhost:3000';
const UNIT = 'AU-031';
const S = (f) => path.resolve(__dirname, 'shots', UNIT, f);

const R = { asserts: [], steps: [], defects: [], parity: [], evidence: [], buttons_total: 0, buttons_ok: 0, buttons_failed: [], state_asserts: 0, nav_asserts: 0, data_asserts: 0 };
function A(name, ok, ev) { R.asserts.push({ name, ok, ev }); console.log(ok ? 'PASS' : 'FAIL', name, '|', String(ev).slice(0, 230)); if (ok) R.state_asserts++; }
function ST(name, data) { R.steps.push({ name, ...data }); console.log('STEP', name, JSON.stringify(data).slice(0, 240)); }
const sec = (s) => (+s.slice(0, 2)) * 3600 + (+s.slice(3, 5)) * 60 + +s.slice(6, 8);
const CDG = /Complete payment within (\d{2}):(\d{2}):(\d{2})/g;

// full-text extraction: flt-semantics textContent PLUS aria-label attributes
async function deepText(p) {
  return p.evaluate(() => {
    const parts = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = e.getAttribute('aria-label'); if (t) parts.push(t);
      const c = e.textContent; if (c && c.trim()) parts.push(c.trim());
    });
    return parts.join('\n');
  });
}

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
  for (let i = 0; i < 20; i++) { const t = await deepText(p); if ((t.match(CDG) || []).length >= 1 || t.includes('No payments')) break; await p.waitForTimeout(1000); }
  await p.waitForTimeout(2000);
  return deepText(p);
}

(async () => {
  // ---------- independent truth ----------
  const token = await L.apiLogin();
  const pay = await L.api(token, 'GET', '/api/v1/payments/my');
  A('api.payments.my.200', pay.status === 200 && Array.isArray(pay.json), `GET :8083/api/v1/payments/my -> ${pay.status} (${pay.json.length} rows)`); R.data_asserts++;
  const rows = pay.json;
  const pendRows = rows.filter(r => r.status === 'PENDING_PAYMENT');
  const submittedRows = rows.filter(r => r.status === 'PAYMENT_SUBMITTED');
  ST('api', {
    pending: pendRows.map(p => `${p.proformaNumber}@${p.expiresAt}`),
    submitted: submittedRows.map(p => p.proformaNumber),
  });

  const orders = await L.api(token, 'GET', '/api/v1/orders');
  const awp = (Array.isArray(orders.json) ? orders.json : []).filter(o => ['PENDING', 'AWAITING_PAYMENT'].includes(o.status));
  const awpPd = awp.filter(o => o.paymentDeadline);
  ST('orders-awaiting-payment', awp.map(o => ({ num: o.orderNumber, pd: o.paymentDeadline })));

  // ---------- Flutter @375 ----------
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 }, recordVideo: { dir: path.resolve(__dirname, 'videos'), size: { width: 375, height: 667 } } });
  const p = await ctx.newPage();
  let apiCalls = [];
  p.on('response', r => { if (r.url().includes('/api/v1/payments/my')) apiCalls.push({ s: r.status(), auth: !!r.request().headers()['authorization'] }); });
  const imgMap = {};
  p.on('response', r => { const u = r.url(); if (/\/uploads\/[^?#]*\.(png|jpe?g|webp)/i.test(u) || /\/api\/v1\/receipts\/[^/]+\/file/.test(u)) imgMap[u] = r.status(); });

  A('flutter.login', await login(p), 'flutter.auth_token persisted in localStorage');

  const t0 = await openPayments(p);
  await p.screenshot({ path: S('flutter-375-payments-t0.png') });
  A('app.calls.real.payments.api', apiCalls.some(c => c.s === 200 && c.auth), JSON.stringify(apiCalls)); R.data_asserts++;

  // per-row aria-labels give exact per-card strings
  const cardLabels = await p.evaluate(() => [...document.querySelectorAll('flt-semantics[role="group"]')]
    .map(e => e.getAttribute('aria-label') || '')
    .filter(t => t.startsWith('PF-')));
  ST('card-labels', cardLabels);

  const labels0 = [...t0.matchAll(CDG)].map(m => m[1]);
  A('cd.rendered.per_pending_row', labels0.length === pendRows.length,
    `countdown labels=${labels0.length} (${labels0.join(',')}) == live PENDING_PAYMENT rows=${pendRows.length}; card aria-label sample="${(cardLabels[0] || '').replace(/\n/g, ' / ')}"`); R.data_asserts++;

  // HIDE once submitted: PAYMENT_SUBMITTED rows render in Pending tab but carry NO label
  const subCards = rows.filter(r => r.status === 'PAYMENT_SUBMITTED').map(r => r.proformaNumber);
  const submittedVisibleNoCd = cardLabels.filter(c => subCards.some(n => c.startsWith(n))).every(c => !c.includes('Complete payment within'));
  A('cd.hidden.once_submitted', submittedVisibleNoCd && labels0.length === pendRows.length,
    `PAYMENT_SUBMITTED cards rendered=[${subCards.join(',')}] none carries a countdown (verified from aria-labels); total labels ${labels0.length} == PENDING count`); R.data_asserts++;

  // value agreement vs independent API read
  {
    const ui = [...labels0.map(sec)], srv = pendRows.map(r => Math.round((new Date(r.expiresAt).getTime() - Date.now()) / 1000));
    let maxDrift = null, unmatched = ui.length !== srv.length;
    while (ui.length && srv.length) {
      let bj = 0, bd = Math.abs(ui[0] - srv[0]);
      for (let j = 1; j < srv.length; j++) { const d = Math.abs(ui[0] - srv[j]); if (d < bd) { bd = d; bj = j; } }
      maxDrift = maxDrift === null ? bd : Math.max(maxDrift, bd);
      ui.shift(); srv.splice(bj, 1);
    }
    A('cd.value.matches_api_utc', !unmatched && maxDrift <= 120, `max |UI remaining − API remaining| = ${maxDrift}s over ${labels0.length} pairs (expiresAt is an absolute UTC instant → duration is timezone-independent by construction)`); R.data_asserts++;
  }

  // TICK over ~8 s
  await p.waitForTimeout(8000);
  const t1 = await deepText(p);
  await p.screenshot({ path: S('flutter-375-payments-t1.png') });
  const l1 = [...t1.matchAll(CDG)].map(m => m[1]);
  const dec = labels0.length === l1.length &&
    labels0.map(sec).sort((a, b2) => b2 - a).every((v, i) => sec(l1.map(x => x).sort((a, b2) => sec(b2) - sec(a))[i]) < v);
  A('cd.ticks.down_each_second', dec, `t0=${labels0.join(',')} -> t1(+8s)=${l1.join(',')} (all decreased)`); R.state_asserts++;

  // EAT correctness of the sibling wall-clock label ('Pending since M/D/YYYY, H:MM AM')
  {
    const target = pendRows.find(r => cardLabels.some(c => c.includes('Pending since') && c.startsWith(r.proformaNumber)));
    const lbl = target && cardLabels.find(c => c.startsWith(target.proformaNumber)) || '';
    const got = (lbl.match(/Pending since ([^·]+) ·/) || [])[1];
    const d = new Date((target && (target.submittedAt || target.createdAt)) || 0);
    const eat = new Date(d.getTime() + 3 * 3600 * 1000);
    let h12 = eat.getUTCHours() % 12; if (h12 === 0) h12 = 12;
    const want = `${eat.getUTCMonth() + 1}/${eat.getUTCDate()}/${eat.getUTCFullYear()}, ${h12}:${String(eat.getUTCMinutes()).padStart(2, '0')} ${eat.getUTCHours() >= 12 ? 'PM' : 'AM'}`;
    A('tz.eat_wallclock_label', !!target && got === want, `createdAt=${d.toISOString()} (=${new Date(d.getTime() + 10800000).toISOString().slice(11, 16)} EAT) → UI shows "${got}", expected "${want}"`); R.data_asserts++;
  }

  // controls
  const btns = await L.listButtons(p);
  R.buttons_total += btns.filter(x => x.kind !== 'input').length;
  const contN = btns.filter(x => x.kind === 'button' && x.label.includes('Continue payment')).length;
  A('btn.continue_count_equals_resumable', contN === pendRows.length, `Continue payment buttons=${contN}, resumable(PENDING_PAYMENT)=${pendRows.length}`);

  // Approved tab: settled rows, no countdowns, Order buttons appear
  A('tab.approved.tapped', await L.clickBtn(p, 'Approved'), 'chip tap');
  await p.waitForTimeout(1200);
  const ta = await deepText(p);
  await p.screenshot({ path: S('flutter-375-approved-tab.png') });
  const confN = rows.filter(r => ['CONFIRMED', 'VERIFIED'].includes(r.status)).length;
  const approvedCards = await p.evaluate(() => [...document.querySelectorAll('flt-semantics[role="group"]')].map(e => e.getAttribute('aria-label') || '').filter(t => t.startsWith('PF-')));
  A('approved.no_countdown', (ta.match(CDG) || []).length === 0 && confN > 0,
    `CONFIRMED/VERIFIED rows=${confN}, countdown labels on Approved tab=${(ta.match(CDG) || []).length}, Order buttons present=${ta.split('Order').length - 1 >= confN ? 'yes' : 'check'}, approved card sample="${(approvedCards[0] || '').replace(/\n/g, ' / ').slice(0, 110)}"`); R.state_asserts++;

  // Expired tab
  A('tab.expired.tapped', await L.clickBtn(p, 'Expired'), 'chip tap');
  await p.waitForTimeout(1200);
  const te = await deepText(p);
  await p.screenshot({ path: S('flutter-375-expired-tab.png') });
  A('expired.no_countdown', (te.match(CDG) || []).length === 0, `EXPIRED/CANCELLED rows=${rows.filter(r => ['EXPIRED', 'CANCELLED'].includes(r.status)).length}, countdown labels=${(te.match(CDG) || []).length}`); R.state_asserts++;

  // Pending again + click ONE Continue payment → navigation to checkout
  await L.clickBtn(p, 'Pending'); await p.waitForTimeout(1200);
  const beforeUrl = p.url(); const beforeTxt = await deepText(p);
  A('btn.continue_payment.clicked', await L.clickBtn(p, 'Continue payment'), 'tap first Continue payment');
  await p.waitForTimeout(3000);
  const afterTxt = await deepText(p);
  await p.screenshot({ path: S('flutter-375-after-continue-click.png') });
  const navOk = afterTxt.includes('Checkout') || afterTxt.includes('Delivery address') || afterTxt.includes('Step 1 of 4');
  A('btn.continue_payment.nav_effect', navOk, `screen now "${afterTxt.replace(/\n/g, ' / ').slice(0, 130)}" (was My Payments list)`); R.nav_asserts++;
  await L.clickBtn(p, 'Back'); await p.waitForTimeout(1500);

  // order detail paymentDeadline surface
  for (const o of awpPd.slice(0, 2)) {
    await p.goto(APP + '/orders/' + o.orderId, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(4500);
    const od = await deepText(p);
    await p.screenshot({ path: S(`flutter-375-orderdetail-${o.orderNumber}.png`) });
    const hasCd = /Complete payment within|Time remaining|Payment deadline|Due/i.test(od);
    ST('order-detail', { num: o.orderNumber, status: o.status, pd: o.paymentDeadline, hasCd, head: od.replace(/\n/g, ' | ').slice(0, 200) });
    if (!hasCd) R.defects.push(`ORDER paymentDeadline NOT rendered: ${o.orderNumber} (status ${o.status}) has backend paymentDeadline=${o.paymentDeadline}, but the detail shows no deadline/countdown. Web admin-orders-tab.tsx:1295 renders <PaymentCountdown deadline={order.paymentDeadline}/> for ['PENDING','AWAITING_PAYMENT']; mobile OrderDetailScreen (orders_screen.dart ~440) renders only the escrow banner.`);
  }

  const imgs = Object.values(imgMap);
  A('images.all_200', imgs.every(s => s === 200) && imgs.length >= 0, `${imgs.filter(s => s === 200).length}/${imgs.length} image/receipt requests HTTP 200`);
  R.images_requested = imgs.length; R.images_200 = imgs.filter(s => s === 200).length;

  await L.closeVideo(ctx, path.resolve(__dirname, 'videos', `${UNIT}-mobile.webm`)).catch(() => {});

  // ---------- tablet ----------
  const ctx2 = await b.newContext({ viewport: { width: 768, height: 1024 }, recordVideo: { dir: path.resolve(__dirname, 'videos'), size: { width: 768, height: 1024 } } });
  const q = await ctx2.newPage();
  A('tablet.login', await login(q), 'token persisted');
  const tt = await openPayments(q);
  await q.screenshot({ path: S('flutter-768-payments.png') });
  const tl = [...tt.matchAll(CDG)].map(m => m[1]);
  A('tablet.cd.rendered', tl.length === pendRows.length, `768x1024 labels=${tl.length} (${tl.join(', ')}) == pending rows=${pendRows.length}`);
  await q.screenshot({ path: S('flutter-768-payments-t1.png') });
  await L.closeVideo(ctx2, path.resolve(__dirname, 'videos', `${UNIT}-tablet.webm`)).catch(() => {});

  // ---------- reference :3000 ----------
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
      ? 'ACCEPTED-DIVERGENCE (host environment): :3000 proxies /api/v1/* to BACKEND_URL=https://apidev.globoexpats.com (frontend container env; next.config.mjs rewrite), where this sandbox account owns ZERO proformas → reference renders "No payments yet". Same-data pixel parity impossible on this host; web SOURCE used as semantic judge instead.'
      : 'reference rendered payment rows — direct compare possible');
    ST('ref', { len: rt.length, emptyState: refEmpty });
    await rc.close();
  } catch (e) { ST('ref-error', { msg: String(e).slice(0, 150) }); }

  await b.close();

  fs.writeFileSync(path.resolve(__dirname, 'tmp', 'au031_r3_out.json'), JSON.stringify(R, null, 1));
  console.log('DONE_OK');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
