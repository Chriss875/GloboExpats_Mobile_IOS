// au032_skeptic.js — adversarial overturn attempt for AU-032.
// Attacks: real View-Order-Details click | rapid double-taps | out-of-order/back-outs |
// offline mid-request + retry | invalid reference input | session expiry | stale reload |
// role probes. RW lane: mutates only what this script creates through the REAL sandbox API.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9112';
const UNIT = 'AU-032-skeptic';
const SHOT_DIR = 'e2e/shots/AU-032';
const fx = JSON.parse(fs.readFileSync('/tmp/au032_fixtures.json', 'utf8'));
const R = { ts: new Date().toISOString(), unit: 'AU-032', stage: 'skeptic', build_sha: '858b0ef',
  attacks_attempted: 0, attacks_broken: 0, findings: [], shots: [] };
function finding(cls, result, detail, ev) {
  R.findings.push({ class: cls, result, detail, evidence: ev || [] });
  R.attacks_attempted++;
  if (result === 'BROKEN') R.attacks_broken++;
  console.log(result.padEnd(8), cls, '::', detail.slice(0, 150));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => ''); }
async function findNode(p, label) {
  return p.evaluate((lbl) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      const isCtl = e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null;
      if (!isCtl) return;
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return;
      if (!best || r.width * r.height < best.area)
        best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), label: t.slice(0, 50), exact: t === lbl };
    });
    return best;
  }, label);
}
async function tap(p, label, tries = 3, maxX = 371, maxY = 663, preferExact = true) {
  for (let i = 0; i < tries; i++) {
    let hit = await findNode(p, label);
    if (hit && preferExact && !hit.exact) {
      // prefer an exact-label control (dialog FilledButton shares label with page TextButton)
      const ex = await p.evaluate((lbl) => {
        let best = null;
        document.querySelectorAll('flt-semantics').forEach(e => {
          if ((e.textContent || '').trim() !== lbl) return;
          if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
          const r = e.getBoundingClientRect();
          if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return;
          if (!best || r.width * r.height < best.area) best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        });
        return best ? { x: best.x, y: best.y } : null;
      }, label);
      if (ex) hit = ex;
    }
    if (hit) { await p.mouse.click(Math.max(3, Math.min(hit.x, maxX)), Math.max(20, Math.min(hit.y, maxY))); await sleep(900); return true; }
    await p.mouse.move(190, 350); await p.mouse.wheel(0, 240); await sleep(300);
  }
  return false;
}
async function visible(p, n) { return (await txt(p)).includes(n); }
async function waitText(p, n, tries = 20) { for (let i = 0; i < tries; i++) { if ((await txt(p)).includes(n)) return true; await sleep(1000); } return false; }
async function shot(p, name) { const f = `${SHOT_DIR}/AU-032-sk-${name}.png`; await L.screenshot(p, f); R.shots.push(f); return f; }
async function isLoggedIn(p) { try { return !!(await p.evaluate(() => localStorage.getItem('flutter.auth_token') || '')); } catch (e) { return false; } }
async function loginUi(p, cred) {
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000);
  if (await isLoggedIn(p)) return true;
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
  await p.locator('input[type="text"]').first().click({ force: true }); await sleep(300);
  await p.keyboard.type(cred.email, { delay: 10 });
  await p.locator('input[type="password"]').first().click({ force: true }); await sleep(300);
  await p.keyboard.type(cred.pw, { delay: 10 });
  await L.clickBtn(p, 'Log in');
  let ok = false; for (let i = 0; i < 30 && !ok; i++) { await sleep(1000); ok = await isLoggedIn(p); }
  return ok;
}
function watchApi(p) { const calls = []; p.on('response', r => { const u = r.url(); if (u.includes(':8083/api/')) calls.push(`${r.request().method()} ${u.split(':8083')[1]} -> ${r.status()}`); }); return calls; }
async function qty() { return (await L.api(fx.buyer.token, 'GET', `/api/v1/displayItem/itemDetails/${fx.productId}`)).json.productQuantity; }
// drive cart -> step1 -> step2 -> confirm -> payment step. Returns proforma number.
async function reachPaymentStep(p, tag) {
  await p.goto(`${APP}/product/${fx.productId}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await sleep(4500);
  await tap(p, 'Add to cart', 4);
  await sleep(800);
  await p.goto(`${APP}/cart`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await sleep(3000);
  await tap(p, 'Go to checkout', 3);
  await sleep(3200);
  if (!(await visible(p, 'Continue to review'))) { await p.goto(`${APP}/checkout`, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await sleep(3500); }
  await tap(p, 'Continue to review', 3);
  await waitText(p, 'When should we deliver', 16);
  await L.scrollToBottom(p, 16); await sleep(700);
  await clickChk(p, 'first'); await sleep(400);
  await clickChk(p, 'last'); await sleep(600);
  const ok = await tap(p, 'Confirm & proceed to payment', 2);
  await sleep(4200);
  let num = null;
  for (let i = 0; i < 12 && !num; i++) { const T = await txt(p); num = (T.match(/PF-\d{4}-\d{6}/) || [null])[0]; if (!num) await sleep(1000); }
  console.log(`[${tag}] payment step reached, invoice=${num}`);
  return num;
}
async function clickChk(p, which) {
  const t = await p.evaluate((which) => {
    const nodes = [...document.querySelectorAll('flt-semantics')].filter(e => e.getAttribute('role') === 'checkbox');
    const rows = nodes.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height, vis: r.y > 40 && (r.y + r.height) < innerHeight - 10 && r.width > 5 }; }).filter(b => b.vis);
    if (!rows.length) return null;
    const pick = which === 'last' ? rows[rows.length - 1] : rows[0];
    return { x: pick.x + 18, y: Math.min(Math.max(pick.y + pick.h / 2, 25), 660) };
  }, which);
  if (!t) return false;
  await p.mouse.click(t.x, t.y); await sleep(700);
  return true;
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.mkdirSync('e2e/results/shards', { recursive: true });

  // fresh login token (fixtures may be old)
  const relogin = await L.api(null, 'POST', '/api/v1/auth/login', { email: fx.buyer.email, password: fx.buyer.pw });
  fx.buyer.token = relogin.json.token || fx.buyer.token;

  // ================= ATTACK 1: real click on View Order Details =================
  {
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-032-skeptic-1.webm' });
    const p = await ctx.newPage(); const net = watchApi(p);
    try {
      assert(await loginUi(p, fx.buyer), 'sk1 login');
      const num = await reachPaymentStep(p, 'A1');
      // fill reference proof + tick + submit ONCE
      await tap(p, 'Enter reference', 2);
      await sleep(500);
      const refVal = 'SK1REF' + Date.now();
      const node = await findNode(p, 'Transaction reference number');
      if (node) { await p.mouse.click(Math.min(node.x, 371), Math.max(20, Math.min(node.y, 663))); await sleep(400); }
      else { await p.locator('input').last().click({ force: true }); }
      await p.keyboard.type(refVal, { delay: 12 });
      await L.scrollToBottom(p, 18); await sleep(600);
      await tap(p, 'I have completed the payment', 2); await sleep(300);
      await clickChk(p, 'last'); await sleep(500);
      const submits = [];
      // double-tap Submit rapidly (attack 1b folded in): two clicks ~80ms apart
      const s1 = await findNode(p, 'Submit Payment for Verification');
      if (s1) { await p.mouse.click(s1.x, s1.y); await sleep(60); await p.mouse.click(s1.x, s1.y).catch(()=>{}); }
      else { console.log('submit node not found'); }
      await sleep(5200);
      const T1 = await txt(p);
      const completionOk = T1.includes('Payment Submitted and Under review');
      const ordersBefore = (await L.api(fx.buyer.token, 'GET', '/api/v1/orders')).json.length;
      console.log('[A1] completion shown=', completionOk, '| invoice', num);
      // THE REAL CLICK the verifier skipped:
      const clicked = await tap(p, 'View Order Details', 3);
      await sleep(4500);
      const url = p.url();
      const T2 = await txt(p);
      const orderNumShown = (T2.match(/ORD-\d{4}-\d{6}/) || [null])[0];
      const serverOrder = (await L.api(fx.buyer.token, 'GET', '/api/v1/orders')).json;
      const mineNew = serverOrder.find(o => o.orderNumber === orderNumShown);
      const detail = mineNew ? await L.api(fx.buyer.token, 'GET', '/api/v1/orders/' + mineNew.orderId) : null;
      const detailOk = detail && detail.status === 200 && JSON.stringify(detail.json).includes(num);
      finding('real-click-view-order-details-navigates',
        clicked && /\/orders\//.test(url) && orderNumShown && detailOk ? 'HELD' : 'BROKEN',
        `clicked=${clicked} url=${url} orderNumShown=${orderNumShown} detailHasInvoice=${detailOk} (detail status ${detail && detail.status})`,
        [shot(p, 'a1-after-real-click')]);
      // duplicate-submit check (double-tap attack): exactly ONE new order vs before? count via payments/my rows for this invoice
      const pays = await L.api(fx.buyer.token, 'GET', '/api/v1/payments/my');
      const row = (Array.isArray(pays.json) ? pays.json : []).find(x => x.proformaNumber === num);
      const orderIdsForInvoice = row && row.orderIds ? row.orderIds.length : null;
      finding('rapid-double-tap-submit-single-order',
        orderIdsForInvoice === 1 ? 'HELD' : 'DISPUTED',
        `invoice ${num}: orderIds count=${orderIdsForInvoice} (expect exactly 1 after double-tap submit)`,
        []);
      // Continue Shopping pops to shell
      await tap(p, 'Continue Shopping', 2).catch(()=>{});
      await sleep(1500);
      // may have navigated; just record URL state
      console.log('[A1] after continue-shopping url=', p.url());
      R.findings[R.findings.length - 1].detail += '';
    } catch (e) { console.log('A1 ERR', e.message); }
    finally { await ctx.close().catch(()=>{}); await browser.close().catch(()=>{}); }
  }

  // ================= ATTACK 2: rapid double-tap CANCEL (dialog + page button) =================
  {
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-032-skeptic-2.webm' });
    const p = await ctx.newPage(); const net = watchApi(p);
    try {
      await loginUi(p, fx.buyer);
      const num = await reachPaymentStep(p, 'A2');
      const preQty = await qty();
      // open dialog, DOUBLE-tap the red dialog FilledButton 'Cancel invoice'
      await tap(p, 'Cancel invoice', 3);
      await sleep(900);
      const dlg = await visible(p, 'Cancel this invoice?');
      const dnode = await p.evaluate(() => {
        let best = null;
        document.querySelectorAll('flt-semantics').forEach(e => {
          if ((e.textContent || '').trim() !== 'Cancel invoice') return;
          if (e.getAttribute('role') !== 'button') return;
          const r = e.getBoundingClientRect();
          if (r.width < 4 || r.bottom < 0 || r.top > innerHeight) return;
          if (!best || r.width * r.height < best.area) best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        });
        return best;
      });
      if (dnode) { await p.mouse.click(dnode.x, dnode.y); await sleep(70); await p.mouse.click(dnode.x, dnode.y).catch(()=>{}); }
      await sleep(3200);
      const T = await txt(p);
      const cancels = net.filter(n => n.includes('/cancel')).length;
      let pf = null;
      const g = await L.api(fx.buyer.token, 'GET', '/api/v1/payments/my');
      const row = (Array.isArray(g.json) ? g.json : []).find(x => x.proformaNumber === num);
      if (row) { const d = await L.api(fx.buyer.token, 'GET', `/api/v1/proformas/${row.proformaId}`); pf = d.json; }
      const postQty = await qty();
      finding('rapid-double-tap-cancel-single-request',
        dlg && cancels === 1 && pf && pf.status === 'CANCELLED' ? 'HELD' : 'BROKEN',
        `dialog=${dlg}; network /cancel calls=${cancels} (expect 1); server status=${pf && pf.status}; stock ${preQty}->${postQty}`,
        [shot(p, 'a2-after-double-cancel'), ...net.filter(n=>n.includes('/cancel'))]);
      // back on review step?
      finding('cancel-returns-to-review-step',
        T.includes('Confirm & proceed to payment') ? 'HELD' : 'BROKEN',
        `review step visible=${T.includes('Confirm & proceed to payment')}`, []);
    } catch (e) { console.log('A2 ERR', e.message); }
    finally { await ctx.close().catch(()=>{}); await browser.close().catch(()=>{}); }
  }

  // ================= ATTACK 3: out-of-order — browser Back mid-payment, then resume/deep-link =================
  {
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-032-skeptic-3.webm' });
    const p = await ctx.newPage(); const net = watchApi(p);
    try {
      await loginUi(p, fx.buyer);
      const num = await reachPaymentStep(p, 'A3');
      const pays = await L.api(fx.buyer.token, 'GET', '/api/v1/payments/my');
      const row = (Array.isArray(pays.json) ? pays.json : []).find(x => x.proformaNumber === num);
      const pfId = row && row.proformaId;
      // go BACK in history (SPA) while invoice open
      await p.goBack(); await sleep(2500);
      const Tback = await txt(p);
      const backState = Tback.includes('Step 2 of 4') ? 'review' : Tback.includes('Cart') ? 'cart' : Tback.includes('Buy now') ? 'home' : '?';
      console.log('[A3] after goBack state~', backState, 'url=', p.url());
      // now deep-link straight into /checkout/success?proforma=<open PENDING invoice> (out-of-order route access)
      await p.goto(`${APP}/checkout/success?proforma=${pfId}`, { waitUntil: 'load', timeout: 60000 }).catch(()=>{});
      await sleep(5000);
      const Tsucc = await txt(p);
      const succShots = await shot(p, 'a3-success-deeplink-pending-invoice');
      // criteria C: receiving details present? reference value?
      const hasRecv = Tsucc.includes('Lipa Namba') && Tsucc.includes('7003 9305') && Tsucc.includes('Selcom');
      const refBlank = !Tsucc.includes(pfId) && !Tsucc.includes(num);
      // can we SUBMIT from this deep-linked page (does it mutate)?
      const refNode = await findNode(p, 'Transaction reference number');
      let submittedFromDeepLink = false;
      if (refNode) {
        await p.mouse.click(refNode.x, refNode.y); await sleep(400);
        await p.keyboard.type('SKDEEP' + Date.now(), { delay: 10 });
        await L.scrollToBottom(p, 18); await sleep(500);
        await tap(p, 'I have completed the payment', 2); await sleep(300);
        await clickChk(p, 'last'); await sleep(500);
        const sb = await findNode(p, 'Submit Payment for Verification');
        if (sb) { await p.mouse.click(sb.x, sb.y); await sleep(5000); submittedFromDeepLink = true; }
      }
      const Tafter = await txt(p);
      const stAfter = row ? (await L.api(fx.buyer.token, 'GET', `/api/v1/proformas/${pfId}`)).json.status : null;
      finding('out-of-order-success-deeplink-on-open-invoice',
        (hasRecv && refBlank) ? 'DISPUTED' : (hasRecv ? 'HELD' : 'BROKEN'),
        `deep-linked open PENDING invoice ${num}: receiving-details=${hasRecv}; reference painted BLANK=${refBlank}` +
        `; submit-from-deeplink attempted=${submittedFromDeepLink}; server status after=${stAfter}`,
        [succShots]);
      // browser-back from success then forward again (history loop)
      await p.goBack(); await sleep(2000);
      const urlBack = p.url();
      console.log('[A3] back-from-success url=', urlBack);
    } catch (e) { console.log('A3 ERR', e.message); }
    finally { await ctx.close().catch(()=>{}); await browser.close().catch(()=>{}); }
  }

  // ================= ATTACK 4: offline mid-request then retry (cancel leg) =================
  {
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-032-skeptic-4.webm' });
    const p = await ctx.newPage(); const net = watchApi(p);
    try {
      await loginUi(p, fx.buyer);
      const num = await reachPaymentStep(p, 'A4');
      const preQty = await qty();
      await tap(p, 'Cancel invoice', 3);
      await sleep(900);
      const dlgVisible = await visible(p, 'Cancel this invoice?');
      // go OFFLINE right before confirming
      await ctx.setOffline(true);
      await tap(p, 'Cancel invoice', 2); // dialog confirm
      await sleep(3000);
      const offT = await txt(p);
      const offSnack = await L.hasSnackBar(p);
      const offShot = await shot(p, 'a4-offline-cancel-attempt');
      const cancelsWhileOff = net.filter(n => n.includes('/cancel')).filter(n => n.endsWith('-> 200')).length;
      // restore network, retry
      await ctx.setOffline(false);
      await sleep(1200);
      const stillDlg = await visible(p, 'Cancel this invoice?');
      // retry: reopen dialog if closed, confirm again
      if (!stillDlg) { await tap(p, 'Cancel invoice', 3); await sleep(900); }
      await tap(p, 'Cancel invoice', 2);
      await sleep(3200);
      const T2 = await txt(p);
      const g = await L.api(fx.buyer.token, 'GET', '/api/v1/payments/my');
      const row = (Array.isArray(g.json) ? g.json : []).find(x => x.proformaNumber === num);
      const st = row ? (await L.api(fx.buyer.token, 'GET', `/api/v1/proformas/${row.proformaId}`)).json.status : 'row-missing';
      const postQty = await qty();
      finding('offline-mid-cancel-then-retry',
        (dlgVisible && cancelsWhileOff === 0 && st === 'CANCELLED' && postQty >= preQty) ? 'HELD' : 'BROKEN',
        `dialog opened=${dlgVisible}; /cancel 200s while offline=${cancelsWhileOff} (expect 0); status after retry=${st}; stock ${preQty}->${postQty}`,
        [offShot, shot(p, 'a4-after-retry-cancel')]);
      finding('offline-cancel-user-feedback',
        (offT.includes('Could not cancel') || offSnack.found || offT.includes('Failed host lookup')) ? 'HELD' : 'DISPUTED',
        `offline error surfaced: copy-hits=[Could not cancel:${offT.includes('Could not cancel')} snackbar:${offSnack.found}]`,
        [offShot]);
    } catch (e) { console.log('A4 ERR', e.message); }
    finally { await ctx.close().catch(()=>{}); await browser.close().catch(()=>{}); }
  }

  // ================= ATTACK 5: invalid input in Transaction reference =================
  {
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-032-skeptic-5.webm' });
    const p = await ctx.newPage(); const net = watchApi(p);
    try {
      await loginUi(p, fx.buyer);
      const num = await reachPaymentStep(p, 'A5');
      await tap(p, 'Enter reference', 2); await sleep(500);
      const evil = '<script>alert(1)</script>' + '\u{1F480}' + 'Karibu sana mwanafunzi' + 'X'.repeat(430);
      const node = await findNode(p, 'Transaction reference number');
      if (node) { await p.mouse.click(node.x, node.y); await sleep(400); } else { await p.locator('input').last().click({ force: true }); }
      await p.keyboard.type(evil, { delay: 2 });
      await sleep(800);
      const valLen = await p.evaluate(() => { const i = [...document.querySelectorAll('input')].find(i => { const s = i.closest('flt-semantics'); return s && /Transaction reference/.test(s.textContent || ''); }); return i ? i.value.length : -1; });
      await L.scrollToBottom(p, 18); await sleep(500);
      await tap(p, 'I have completed the payment', 2); await sleep(300);
      await clickChk(p, 'last'); await sleep(400);
      const sub = await findNode(p, 'Submit Payment for Verification');
      if (sub) { await p.mouse.click(sub.x, sub.y); await sleep(5500); }
      const T = await txt(p);
      const pays = await L.api(fx.buyer.token, 'GET', '/api/v1/payments/my');
      const row = (Array.isArray(pays.json) ? pays.json : []).find(x => x.proformaNumber === num);
      const refs = row && row.transactionReferences;
      finding('invalid-input-reference-hostile-string',
        (sub && T.includes('Payment Submitted and Under review') && refs && refs.some(r => typeof r === 'string' && r.length >= 400)) ? 'HELD' :
        (sub && T.includes('Payment Submitted and Under review')) ? 'HELD' : 'DISPUTED',
        `typed ${evil.length}-char hostile ref (script+emoji+Swahili+pad); input held ${valLen} chars; submit clicked=${sub}; completion shown=${T.includes('Payment Submitted and Under review')}; server stored refs=${JSON.stringify(refs).slice(0,90)}${''}`,
        [shot(p, 'a5-hostile-ref-result')]);
    } catch (e) { console.log('A5 ERR', e.message); }
    finally { await ctx.close().catch(()=>{}); await browser.close().catch(()=>{}); }
  }

  // ================= ATTACK 6: session expiry mid-flow (token cleared before cancel+submit) =================
  {
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-032-skeptic-6.webm' });
    const p = await ctx.newPage(); const net = watchApi(p);
    try {
      await loginUi(p, fx.buyer);
      const num = await reachPaymentStep(p, 'A6');
      // kill the token mid-flow
      await p.evaluate(() => localStorage.removeItem('flutter.auth_token'));
      await sleep(600);
      await tap(p, 'Cancel invoice', 3);
      await sleep(900);
      const dlg = await visible(p, 'Cancel this invoice?');
      await tap(p, 'Cancel invoice', 2);
      await sleep(3200);
      const T = await txt(p);
      const cancelCalls = net.filter(n => n.includes('/cancel'));
      const g = await L.api(fx.buyer.token, 'GET', '/api/v1/payments/my');
      const row = (Array.isArray(g.json) ? g.json : []).find(x => x.proformaNumber === num);
      const st = row ? (await L.api(fx.buyer.token, 'GET', `/api/v1/proformas/${row.proformaId}`)).json.status : 'row-missing';
      finding('session-expiry-cancel-still-executes',
        (st === 'PENDING_PAYMENT' && cancelCalls.every(c => c.endsWith('401') || c.endsWith('403') || c.endsWith('302'))) ? 'HELD' : 'BROKEN',
        `after clearing token: dialog=${dlg}, /cancel calls=${JSON.stringify(cancelCalls)}, server status=${st} (must remain PENDING_PAYMENT)`,
        [shot(p, 'a6-expiry-cancel'), shot(p, 'a6-server-truth-check')]);
    } catch (e) { console.log('A6 ERR', e.message); }
    finally { await ctx.close().catch(()=>{}); await browser.close().catch(()=>{}); }
  }

  // ================= ATTACK 7: stale-cache reload after mutation =================
  {
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-032-skeptic-7.webm' });
    const p = await ctx.newPage();
    try {
      await loginUi(p, fx.buyer);
      // cancelled invoice from A2 exists. Reload its success page fresh (no cache).
      const g = await L.api(fx.buyer.token, 'GET', '/api/v1/payments/my');
      const rows = Array.isArray(g.json) ? g.json : [];
      const cancelledRow = rows.find(x => x.status === 'CANCELLED');
      if (!cancelledRow) { finding('stale-reload-after-cancel', 'DISPUTED', 'no CANCELLED invoice available to test reload', []); }
      else {
        await p.goto(`${APP}/checkout/success?proforma=${cancelledRow.proformaId}`, { waitUntil: 'load', timeout: 60000 }).catch(()=>{});
        await sleep(5000);
        await p.reload({ waitUntil: 'load' }).catch(()=>{});
        await sleep(5000);
        const T = await txt(p);
        finding('stale-reload-after-cancel-shows-cancelled-as-payable',
          T.includes('Submit Payment for Verification') && !T.includes('CANCELLED') ? 'BROKEN' : 'HELD',
          `reloaded /checkout/success for CANCELLED ${cancelledRow.proformaNumber}: shows submit button=${T.includes('Submit Payment for Verification')}; mentions cancelled=${T.includes('CANCELLED')}; receiving block=${T.includes('Lipa Namba')}`,
          [shot(p, 'a7-stale-reload-cancelled')]);
      }
    } catch (e) { console.log('A7 ERR', e.message); }
    finally { await ctx.close().catch(()=>{}); await browser.close().catch(()=>{}); }
  }

  // ================= ATTACK 8: role probe — SELLER token hits BUYER's cancel endpoint =================
  {
    const rel = await L.api(null, 'POST', '/api/v1/auth/login', { email: fx.seller.email, password: fx.seller.pw });
    const sellTok = rel.json.token;
    // find a live PENDING invoice owned by buyer
    const g = await L.api(fx.buyer.token, 'GET', '/api/v1/payments/my');
    const rows = Array.isArray(g.json) ? g.json : [];
    const pending = rows.find(x => x.status === 'PENDING_PAYMENT');
    if (!pending) { finding('role-probe-seller-cancels-buyer-invoice', 'DISPUTED', `no PENDING invoice left to probe (rows=${rows.length})`, []); }
    else {
      const asSeller = await L.api(sellTok, 'POST', `/api/v1/proformas/${pending.proformaId}/cancel`);
      const asSellerPay = await L.api(sellTok, 'POST', `/api/v1/proformas/${pending.proformaId}/submit-payment`, { transactionReferences: ['HACK'], paymentMethodType: 'MOBILE_MONEY' });
      const after = await L.api(fx.buyer.token, 'GET', `/api/v1/proformas/${pending.proformaId}`);
      const ok = after.status === 200 && after.json.status === 'PENDING_PAYMENT';
      finding('role-probe-seller-cancels-buyer-invoice',
        ok ? 'HELD' : 'BROKEN',
        `seller POST /proformas/${pending.proformaId}/cancel -> ${asSeller.status}; submit-payment -> ${asSellerPay.status}; buyer invoice still PENDING_PAYMENT=${ok}`,
        [`HTTP cancel=${asSeller.status} body=${JSON.stringify(asSeller.json).slice(0, 80)}`, `HTTP submit=${asSellerPay.status} body=${JSON.stringify(asSellerPay.json).slice(0, 80)}`]);
    }
  }

  R.finished = new Date().toISOString();
  fs.writeFileSync('e2e/results/shards/raw-AU-032-skeptic.json', JSON.stringify(R, null, 2));
  console.log('\nRAW -> e2e/results/shards/raw-AU-032-skeptic.json');
})().catch(e => { console.error('SKEPTIC FAIL', e); process.exit(1); });
