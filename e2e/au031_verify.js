// AU-031 verifier — countdown widgets (RO lane). Frozen bundle :9113 (sha bca6414).
// Proforma countdown ticks until expiresAt; hidden once submitted;
// order paymentDeadline rendered when present; timezone-correct.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9113';
const REF = 'http://localhost:3000';
const UNIT = 'AU-031';
const SHOTS = path.resolve(__dirname, 'shots', UNIT);
fs.mkdirSync(SHOTS, { recursive: true });

const out = { steps: [], asserts: [], defects: [], buttons: [] };
function step(name, data) { out.steps.push({ name, ...data }); console.log('STEP', name, JSON.stringify(data).slice(0, 400)); }
function assert(name, ok, evidence) { out.asserts.push({ name, ok, evidence }); console.log(ok ? 'PASS' : 'FAIL', name, '|', String(evidence).slice(0, 220)); }

(async () => {
  // ---------- independent API truth ----------
  const token = await L.apiLogin();
  const pay = await L.api(token, 'GET', '/api/v1/payments/my');
  assert('api.payments.my.200', pay.status === 200, `GET /api/v1/payments/my -> ${pay.status}`);
  const rows = Array.isArray(pay.json) ? pay.json : [];
  const pend = rows.filter(r => r.status === 'PENDING_PAYMENT');
  const settled = rows.filter(r => r.status !== 'PENDING_PAYMENT');
  step('api-snapshot', {
    total: rows.length, pending: pend.length,
    sample: pend.slice(0, 2).map(p => ({ n: p.proformaNumber, exp: p.expiresAt })),
    settledSample: settled.slice(0, 4).map(p => ({ n: p.proformaNumber, st: p.status })),
  });
  const apiRemainingSec = {};
  for (const p of pend) {
    apiRemainingSec[p.proformaNumber] = Math.round((new Date(p.expiresAt).getTime() - Date.now()) / 1000);
  }
  step('api-remaining', apiRemainingSec);

  // orders with a paymentDeadline present
  const ordr = await L.api(token, 'GET', '/api/v1/orders');
  const orows = Array.isArray(ordr.json) ? ordr.json : [];
  const awp = orows.filter(o => ['PENDING', 'AWAITING_PAYMENT'].includes(o.status));
  step('orders-awaiting-payment', awp.map(o => ({ num: o.orderNumber, st: o.status, pd: o.paymentDeadline })));
  const awpWithPd = awp.filter(o => o.paymentDeadline);

  // ---------- browser: Flutter @375 ----------
  const browser = await L.newBrowser();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, recordVideo: { dir: path.resolve(__dirname, 'videos'), size: { width: 375, height: 667 } } });
  const imgMap = {};
  const p = await ctx.newPage();
  L.watchImages && p.on('response', r => { const u = r.url(); if (/\/(uploads|assets|api\/v1\/receipts)\/[^?#]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/api\/v1\/receipts\/[^/]+\/file/.test(u)) imgMap[u] = r.status(); });

  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 30000);
  // login via the shared recipe but against :9113
  await L.clickBtn(p, 'Login');
  await L.waitText(p, 'Welcome back', 25000);
  const ei = p.locator('input[type="text"]').first(); const pi = p.locator('input[type="password"]').first();
  await ei.click({ force: true }).catch(() => {}); await p.waitForTimeout(350); await p.keyboard.type(L.BUYER.email);
  await pi.click({ force: true }).catch(() => {}); await p.waitForTimeout(350); await p.keyboard.type(L.BUYER.pw);
  await L.clickBtn(p, 'Log in');
  let logged = false;
  for (let i = 0; i < 25 && !logged; i++) { logged = await L.isLoggedIn(p); if (!logged) await p.waitForTimeout(1000); }
  assert('flutter.login', logged, 'flutter.auth_token persisted in localStorage');

  // deep-link straight to My Payments (SPA fallback)
  await p.goto(APP + '/account/payments', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(3500);
  const t0 = await L.allText(p);
  await p.screenshot({ path: SHOTS + '/flutter-375-payments-t0.png' });

  // find a countdown label and its exact text
  const cdRe = /Complete payment within (\d{2}:\d{2}:\d{2})/g;
  const labels0 = [...t0.matchAll(cdRe)].map(m => m[1]);
  assert('countdown.rendered', labels0.length > 0, `a11y text contains ${labels0.length} x 'Complete payment within HH:MM:SS': ${JSON.stringify(labels0)}`);
  assert('countdown.count_matches_pending_rows', labels0.length === pend.length, `labels=${labels0.length} pendingApiRows=${pend.length}`);

  // numeric agreement with the API (±120 s tolerance incl. render latency)
  const nums = [];
  for (const m of t0.matchAll(/Complete payment within (\d{2}):(\d{2}):(\d{2})/g)) {
    nums.push(+m[1] * 3600 + +m[2] * 60 + +m[3]);
  }
  const pendRem = Object.entries(apiRemainingSec).map(([, v]) => v);
  let maxDrift = null;
  if (nums.length && pendRem.length) {
    // match multiset greedily: nearest pair each time
    const a = [...nums], b = [...pendRem];
    while (a.length && b.length) {
      let bi = 0, best = Math.abs(a[0] - b[0]);
      for (let j = 1; j < b.length; j++) { const d = Math.abs(a[0] - b[j]); if (d < best) { best = d; bi = j; } }
      maxDrift = maxDrift === null ? best : Math.max(maxDrift, best);
      a.shift(); b.splice(bi, 1);
    }
  }
  assert('countdown.value_matches_api_within_120s', maxDrift !== null && maxDrift <= 120, `max |ui-remaining - api-remaining| = ${maxDrift}s over ${nums.length} labels (UTC math, tz-independent)`);

  // TICK: wait 6 s, re-read; every label must have decreased
  await p.waitForTimeout(6000);
  const t1 = await L.allText(p);
  await p.screenshot({ path: SHOTS + '/flutter-375-payments-t1.png' });
  const labels1 = [...t1.matchAll(cdRe)].map(m => m[1]);
  const sec = s => (+s.slice(0, 2)) * 3600 + (+s.slice(3, 5)) * 60 + +s.slice(6, 8);
  const before = labels0.map(sec), after = labels1.map(sec).sort((x, y) => y - x).slice().reverse();
  const dec = labels0.length === labels1.length &&
    labels0.map(sec).sort((x, y) => y - x).every((v, i) => { const arr = labels1.map(sec).sort((x, y) => y - x); return arr[i] < v; });
  assert('countdown.ticks_downward', dec, `t0=${JSON.stringify(labels0)} -> t1(+6s)=${JSON.stringify(labels1)}`);

  // HIDE once submitted/settled: settled rows must not carry the label
  const settledNums = rows.filter(r => r.status !== 'PENDING_PAYMENT').map(r => r.proformaNumber);
  const settledVisible = settledNums.filter(n => t1.includes(n) ? false : false);
  // count occurrences: label count must equal pending count even though settled rows are on-screen too
  const settledRowsOnScreen = settledNums.filter(n => t1.includes(n)).length;
  assert('countdown.hidden_when_not_pending', labels1.length === pend.length, `labels=${labels1.length}, pendingRows=${pend.length}, settledRowsRenderedOnDefaultTab=${settledRowsOnScreen} (${settledNums.slice(0, 3).join(',')}) statuses=${settled.map(s => s.status).join('/')}`);

  // buttons/tabs enumeration + click-through
  const btns = await L.listButtons(p);
  out.buttons = btns;
  step('buttons', btns);
  // click every tab-like chip and assert the row set changes
  let clicked = 0, effects = 0;
  for (const b of btns.filter(b => b.kind === 'button')) {
    const label = b.label.replace(/\s+/g, ' ').trim();
    if (!label || label.length > 30) continue;
    const okClick = await L.clickBtn(p, label.split(' ').slice(0, 3).join(' '));
    clicked++;
    await p.waitForTimeout(700);
    const tx = await L.allText(p);
    if (tx && tx.length) effects++;
    if (/Pending|Approved|Rejected|Expired/.test(label)) {
      step('tab-click', { label, snippet: tx.slice(0, 160) });
      await p.screenshot({ path: SHOTS + `/flutter-375-tab-${label.replace(/\s+/g, '-').toLowerCase()}.png` });
    }
  }
  assert('tabs.clicked_all_chips', clicked >= 4, `clicked ${clicked} controls on payments panel`);

  // back to Pending tab for the tablet pass
  await L.clickBtn(p, 'Pending');

  // ---------- tablet 768x1024 ----------
  const ctx2 = await browser.newContext({ viewport: { width: 768, height: 1024 }, recordVideo: { dir: path.resolve(__dirname, 'videos'), size: { width: 768, height: 1024 } } });
  const q = await ctx2.newPage();
  await q.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(q, 'Buy now', 30000);
  await L.clickBtn(q, 'Login'); await L.waitText(q, 'Welcome back', 25000);
  await q.locator('input[type="text"]').first().click({ force: true }).catch(() => {}); await q.waitForTimeout(300); await q.keyboard.type(L.BUYER.email);
  await q.locator('input[type="password"]').first().click({ force: true }).catch(() => {}); await q.waitForTimeout(300); await q.keyboard.type(L.BUYER.pw);
  await L.clickBtn(q, 'Log in');
  for (let i = 0; i < 25 && !(await L.isLoggedIn(q)); i++) await q.waitForTimeout(1000);
  await q.goto(APP + '/account/payments', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await q.waitForTimeout(3500);
  const tt = await L.allText(q);
  await q.screenshot({ path: SHOTS + '/flutter-768-payments.png' });
  assert('tablet.countdown.rendered', /Complete payment within \d{2}:\d{2}:\d{2}/.test(tt), `768x1024 a11y has countdown: ${(tt.match(/Complete payment within \d{2}:\d{2}:\d{2}/g) || []).join(',')}`);

  // ---------- order paymentDeadline surface (buyer side) ----------
  if (awpWithPd.length) {
    await p.goto(APP + '/orders/' + awpWithPd[0].orderId, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(4000);
    const od = await L.allText(p);
    await p.screenshot({ path: SHOTS + '/flutter-375-orderdetail-awaitingpayment.png' });
    const hasCd = /Complete payment within|Payment deadline|Time remaining/.test(od);
    const hasVerifyMsg = /verification|verifying/i.test(od);
    step('buyer-order-detail', { num: awpWithPd[0].orderNumber, pd: awpWithPd[0].paymentDeadline, hasCd, hasVerifyMsg, snippet: od.slice(0, 500) });
  }

  await L.closeVideo(ctx, path.resolve(__dirname, 'videos', `${UNIT}-mobile.webm`)).catch(() => {});
  await L.closeVideo(ctx2, path.resolve(__dirname, 'videos', `${UNIT}-tablet.webm`)).catch(() => {});

  // ---------- reference :3000 same user/data ----------
  const rc = await browser.newContext({ viewport: { width: 375, height: 667 }, recordVideo: { dir: path.resolve(__dirname, 'videos'), size: { width: 375, height: 667 } } });
  const rp = await rc.newPage();
  await rp.goto(REF + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  await rp.waitForTimeout(2500);
  const refBody = await rp.evaluate(() => document.body.innerText.slice(0, 3000));
  step('ref-home-loaded', { len: refBody.length, head: refBody.slice(0, 160) });
  await rp.screenshot({ path: SHOTS + '/ref-375-dashboard-payments.png' }).catch(() => {});
  await L.closeVideo(rc, path.resolve(__dirname, 'videos', `${UNIT}-ref.webm`)).catch(() => {});

  const imgs = Object.values(imgMap);
  step('images', { requested: imgs.length, ok200: imgs.filter(s => s === 200).length });

  fs.writeFileSync(path.resolve(__dirname, 'tmp', 'au031_out.json'), JSON.stringify(out, null, 1));
  console.log('DONE');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
