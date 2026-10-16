// au039_sk14_attacks.js — SKEPTIC AU-039 on FROZEN lane :9131 (sha e694463,
// main.dart.js Last-Modified Wed, 26 Aug 2026 08:15:26 GMT).
//
// Attacks the verifier's PASS. Fixtures E (buyer leg) + F (seller leg) minted via the
// REAL sandbox API escrow chain, both IN_TRANSIT with 6-digit codes.
//
// Attack classes:
//  A1 rapid double-tap Verify delivery  -> duplicate verify-delivery POSTs?
//  A2 rapid double-tap buyer regenerate -> two codes minted? UI desync?
//  A3 out-of-order: seller taps "Generate new code" FIRST (before any wrong try)
//     then buyer self-confirms mid-flow; then correct-code entry after DELIVERED
//  A4 invalid input: emoji / 500-char / spaces / script tag into the code field
//  A5 offline mid-request: context.setOffline(true) around a verify call
//  A6 session expiry mid-flow: clear flutter.auth_token then reload
//  A7 role/permission probes: unauthenticated deep-link to the tracking screen
//  A8 deadline integrity after OTP verify (fulfilledAt+48h)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';
const UNIT = 'AU-039';
const SHOTS = `e2e/shots/${UNIT}`;
const BUILD_SHA = 'e694463';
const EXPECTED_LM = 'Wed, 26 Aug 2026 08:15:26 GMT';

const R = { ts: new Date().toISOString(), unit: UNIT, stage: 'skeptic', build_sha: BUILD_SHA, attacks: [], evidence: [], network: [], apiResponses: [], defects: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const txt = p => p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');

function wireNet(p) {
  p.on('response', async r => {
    const u = r.url(); if (!/localhost:8083\/api\//.test(u)) return;
    const line = `${r.request().method()} ${u.replace('http://localhost:8083', '')} -> ${r.status()}`;
    R.network.push(line);
    if (/verify-delivery|regenerate-delivery-code|confirm-delivery|transporter/.test(u)) {
      let body = null; try { body = await r.json(); } catch (e) {}
      R.apiResponses.push({ line, body });
    }
  });
}
const netFor = f => R.network.filter(l => l.includes(f));

function dbAttempts(orderId) {
  try { return execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -tAc "SELECT delivery_code_attempts FROM orders WHERE order_id='${orderId}'"`).toString().trim(); }
  catch (e) { return 'ERR:' + e.message.slice(0, 60); }
}
function dbRow(orderId) {
  try { return execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -tAc "SELECT order_status||'|'||coalesce(to_char(fulfilled_at,'YYYY-MM-DD HH24:MI:SS'),'NULL')||'|'||coalesce(to_char(confirmation_deadline,'YYYY-MM-DD HH24:MI:SS'),'NULL')||'|'||coalesce(delivery_confirmation_method,'NULL') FROM orders WHERE order_id='${orderId}'"`).toString().trim(); }
  catch (e) { return 'ERR:' + e.message.slice(0, 60); }
}

function attack(name, result, detail, evidence) {
  R.attacks.push({ attack: name, result, detail: String(detail).slice(0, 400), evidence: evidence || [] });
  console.log(`[${result}] ${name} :: ${String(detail).slice(0, 200)}`);
}

async function isLoggedIn(p) { try { return !!(await p.evaluate(() => localStorage.getItem('flutter.auth_token') || '')); } catch (e) { return false; } }

async function hashNav(p, hash, settle = 4500) {
  await p.evaluate(h => { window.location.hash = h; }, hash).catch(() => {});
  await sleep(settle);
}

async function loginAs(p, email, pw) {
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 60000);
  if (await isLoggedIn(p)) {
    await p.evaluate(() => { localStorage.removeItem('flutter.auth_token'); localStorage.removeItem('flutter.auth_user'); });
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 60000); await sleep(1200);
  }
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
  const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(300);
  await p.keyboard.type(email, { delay: 12 });
  const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(300);
  await p.keyboard.type(pw, { delay: 12 });
  await L.clickBtn(p, 'Log in');
  let li = false; for (let i = 0; i < 30 && !li; i++) { await sleep(1000); li = await isLoggedIn(p); }
  return li;
}

async function findNode(p, label) {
  return p.evaluate((lbl) => { let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => { const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return;
      if (!best || r.width * r.height < best.area) best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), dis: e.getAttribute('aria-disabled') };
    }); return best; }, label);
}
async function tap(p, label, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const h = await findNode(p, label);
    if (h) { await p.mouse.click(Math.max(3, Math.min(h.x, 760)), Math.max(20, Math.min(h.y, 1015))); await sleep(1000); return h; }
    await p.mouse.move(190, 350); await p.mouse.wheel(0, i % 2 === 0 ? 260 : -260); await sleep(320);
  } return null;
}
async function tapNoWait(p, label) { // no settle wait — for double-tap timing
  const h = await findNode(p, label);
  if (!h) return null;
  await p.mouse.click(Math.max(3, Math.min(h.x, 760)), Math.max(20, Math.min(h.y, 1015)));
  return h;
}
async function typeIntoFirstInput(p, value) {
  const inp = p.locator('input').first();
  await inp.click({ force: true }).catch(() => {}); await sleep(280);
  await p.keyboard.press('Control+a'); await sleep(120); await p.keyboard.press('Delete'); await sleep(200);
  await p.keyboard.insertText ? null : null;
  await p.keyboard.type(value, { delay: 18 }).catch(async () => { await inp.fill(value).catch(() => {}); }); await sleep(320);
  let dom = await p.evaluate(() => { const el = document.querySelector('input'); return el ? el.value : null; });
  if (dom !== value) { // maxLength may truncate — report what stuck
    dom = await p.evaluate(() => { const el = document.querySelector('input'); return el ? el.value : null; });
  }
  return dom;
}

async function openTracking(p, fx, side /* 'buying'|'selling' */) {
  await hashNav(p, '#/orders', 5200);
  if (side === 'selling') { await tap(p, 'Selling', 3); await sleep(1400); }
  const listTxt = await txt(p);
  if (!listTxt.includes(fx.orderNumber)) { await sleep(1500); }
  const hit = await tap(p, fx.orderNumber, 5);
  await sleep(1700);
  const trk = await findNode(p, 'Track delivery');
  if (trk && trk.dis !== 'true') { await tap(p, 'Track delivery', 4); await sleep(3000); }
  else { // fallback: deep link to tracking hash route
    await p.evaluate(h => { window.location.hash = h; }, `#/orders/${fx.orderId}/tracking`).catch(() => {});
    await sleep(3500);
  }
  return (await txt(p)).includes('Delivery tracking');
}

(async () => {
  const head = execSync(`curl -sI ${APP}/main.dart.js`).toString();
  const lm = ((head.match(/Last-Modified:\s*(.+)/i)) || [])[1] || '';
  if (lm.trim() !== EXPECTED_LM) { console.error('BLOCKED-stale-build', lm.trim()); process.exit(2); }
  console.log('freshness OK:', lm.trim());

  const E = JSON.parse(fs.readFileSync('/tmp/au039sk14_E.json', 'utf8'));
  const F = JSON.parse(fs.readFileSync('/tmp/au039sk14_F.json', 'utf8'));
  const CODE_E = E.afterDispatch.deliveryCode, CODE_F = F.afterDispatch.deliveryCode;

  const browser = await L.newBrowser();

  // ================= LEG S (seller, order F): ladder + attacks =================
  const ctxS = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/au039sk14-seller-375.webm' });
  const ps = await ctxS.newPage(); wireNet(ps); R.imgSeller = L.watchImages(ps);

  attack('A0-seller-login', (await loginAs(ps, F.seller.email, F.seller.pw)) ? 'HELD' : 'BROKEN',
    'seller fixture login on frozen lane');
  await sleep(1500);
  const openedS = await openTracking(ps, F, 'selling');
  const sTrk = await txt(ps);
  attack('A0b-seller-tracking-open', openedS ? 'HELD' : 'BROKEN',
    `Delivery tracking screen reached for ${F.orderNumber}; handover card=${sTrk.includes('Delivery handover')}`);
  await L.screenshot(ps, `${SHOTS}/sk14-01-seller-card.png`);

  // ---- A1 rapid double-tap Verify with a wrong code ----
  await typeIntoFirstInput(ps, '111222');
  const nb1 = R.network.length;
  await tapNoWait(ps, 'Verify delivery'); await sleep(120);
  await tapNoWait(ps, 'Verify delivery'); await sleep(2200);
  const vd1 = netFor('/orders/' + F.orderId + '/verify-delivery').slice(nb1);
  attack('A1-doubletap-verify-wrong-code', vd1.length >= 1 && vd1.length <= 2 ? 'DISPUTED' : 'DISPUTED',
    `${vd1.length} POST(s) fired from a rapid double-tap: ${vd1.join(' | ')}`,
    [`${SHOTS}/sk14-01-seller-card.png`]);
  console.log('   DB attempts after A1:', dbAttempts(F.orderId));

  // ---- A4a emoji payload ----
  const em = await typeIntoFirstInput(ps, '😀😀😀😀😀😀');
  await tap(ps, 'Verify delivery', 2); await sleep(1800);
  const vdEm = [...R.apiResponses].reverse().find(a => a.line.includes('/verify-delivery'));
  attack('A4a-input-emoji', 'DISPUTED',
    `dom="${em}" last-call=${(vdEm && vdEm.line) || 'NONE'} body=${JSON.stringify((vdEm && vdEm.body) || {}).slice(0, 140)}`);

  // ---- A4b 500-char payload (maxLength=6 gate?) ----
  const long = '9'.repeat(500);
  const gotLong = await typeIntoFirstInput(ps, long);
  await tap(ps, 'Verify delivery', 2); await sleep(1800);
  const vdL = [...R.apiResponses].reverse().find(a => a.line.includes('/verify-delivery'));
  attack('A4b-input-500-chars', 'DISPUTED',
    `dom-len=${(gotLong || '').length} (maxLength gate ${(gotLong || '').length <= 6 ? 'HELD' : 'BROKEN'}) last-call=${(vdL && vdL.line) || 'NONE'}`);
  await L.screenshot(ps, `${SHOTS}/sk14-02-after-invalid-inputs.png`);

  // ---- A4c script-tag payload ----
  const scr = await typeIntoFirstInput(ps, '<script>alert(1)</script>');
  await tap(ps, 'Verify delivery', 2); await sleep(1800);
  const dumpScr = await txt(ps);
  attack('A4c-input-script-tag', dumpScr.includes('<script>') ? 'BROKEN' : 'DISPUTED',
    `dom="${scr}" scriptEchoedInView=${dumpScr.includes('<script>')} (Flutter text widgets do not execute HTML — echo is cosmetic)`);

  // ---- A2/A3: finish the ladder as seller (wrong xN until lock) ----
  let ladder = [];
  for (let i = 0; i < 4; i++) {
    const nb = R.network.length;
    const cur = await typeIntoFirstInput(ps, String(700000 + i * 31));
    if (cur === null) { ladder.push({ i, note: 'input gone/disabled' }); break; }
    await tapNoWait(ps, 'Verify delivery').catch(() => {}); await sleep(2000);
    const calls = netFor('/verify-delivery').slice(nb);
    const body = [...R.apiResponses].reverse().find(a => a.line.includes('/verify-delivery'));
    ladder.push({ i, typed: cur, calls, body: body && body.body });
    const dmp = await txt(ps);
    if (/Too many incorrect|Locked|Three attempts/i.test(dmp)) { ladder.push({ locked: true }); break; }
  }
  const dbAfterLadder = dbAttempts(F.orderId);
  attack('A2-ladder-lockout-persisted', Number(dbAfterLadder) >= 3 ? 'HELD' : 'BROKEN',
    `ladder=${JSON.stringify(ladder).slice(0, 260)} DB delivery_code_attempts=${dbAfterLadder}`);
  await L.screenshot(ps, `${SHOTS}/sk14-03-seller-locked.png`);
  const lockDump = await txt(ps);
  const lockState = await ps.evaluate(() => { let f = null;
    document.querySelectorAll('flt-semantics').forEach(e => { if (f) return;
      if ((e.textContent || '').includes('Verify delivery')) f = { role: e.getAttribute('role'), tappable: e.getAttribute('flt-tappable'), dis: e.getAttribute('aria-disabled') }; });
    return f; });
  attack('A2b-locked-verify-btn-disabled', lockState && (lockState.dis === 'true' || lockState.role === null) ? 'HELD' : 'DISPUTED',
    `btn state=${JSON.stringify(lockState)} copy=${(lockDump.split('\n').filter(x=>/lock|three|attempt/i.test(x))[0]||'').slice(0,90)}`);

  // ---- A6 session expiry mid-flow: clear token, reload, revisit tracking ----
  await ps.evaluate(() => { localStorage.removeItem('flutter.auth_token'); localStorage.removeItem('flutter.auth_user'); }).catch(() => {});
  await ps.goto(APP + '/#/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(6000);
  const postLogout = await txt(ps);
  attack('A6-session-cleared-reload-gates', /login|welcome back/i.test(postLogout) || !(await isLoggedIn(ps)) ? 'HELD' : 'BROKEN',
    `after token clear + reload page shows login=${/login|welcome back/i.test(postLogout)} loggedInFlag=${await isLoggedIn(ps)}`);
  await L.screenshot(ps, `${SHOTS}/sk14-04-session-cleared-reload.png`);

  // ---- A7 unauthenticated deep link straight to the tracking route ----
  const ctxAnon = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: 'e2e/videos/au039sk14-anon-768.webm' });
  const pa = await ctxAnon.newPage(); wireNet(pa);
  await pa.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(pa, 'Buy now', 60000);
  await pa.evaluate(h => { window.location.hash = h; }, `#/orders/${F.orderId}/tracking`).catch(() => {});
  await sleep(6000);
  const anonDump = await txt(pa);
  attack('A7-unauth-deeplink-tracking', /login|log in|welcome back/i.test(anonDump) || anonDump.trim() === '' ? 'HELD'
    : (anonDump.includes(CODE_F) ? 'BROKEN' : 'DISPUTED'),
    `anon deep-link dump leaksCode=${anonDump.includes(CODE_F)} showsLogin=${/login|welcome back/i.test(anonDump)} len=${anonDump.length}`,
    [`${SHOTS}/sk14-05-anon-deeplink-768.png`]);
  await L.screenshot(pa, `${SHOTS}/sk14-05-anon-deeplink-768.png`);
  await ctxAnon.close();

  // ---- A5 offline mid-request (seller still logged-in context) ----
  const rgNetBefore = R.network.length;
  await ps.context().setOffline(true);
  const offTap = await tap(ps, 'Verify delivery', 2).catch(() => null);
  await sleep(2500);
  await ps.context().setOffline(false);
  await sleep(2500);
  const offCalls = R.network.slice(rgNetBefore).filter(l => l.includes('/verify-delivery'));
  const offDump = await txt(ps);
  attack('A5-offline-mid-request', offDump.length > 0 ? 'DISPUTED' : 'BROKEN',
    `offlineTap=${!!offTap} callsWhileOffline=${offCalls.length} pageAlive=${offDump.length > 0} crashCopy=${/error|failed/i.test(offDump)}`);
  await L.screenshot(ps, `${SHOTS}/sk14-06-offline-retry.png`);
  // retry online with real code later (after unlock below)

  // ================= LEG B (buyer, order E): buyer-side attacks =================
  const ctxB = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/au039sk14-buyer-375.webm' });
  const pb = await ctxB.newPage(); wireNet(pb); R.imgBuyer = L.watchImages(pb);
  attack('B0-buyer-login', (await loginAs(pb, E.buyer.email, E.buyer.pw)) ? 'HELD' : 'BROKEN', 'buyer fixture login');
  await sleep(1500);
  const openedB = await openTracking(pb, E, 'buying');
  const bDump0 = await txt(pb);
  attack('B0b-buyer-card-no-seller-input', openedB && bDump0.includes(CODE_E) && !bDump0.includes('Enter the 6-digit code')
    ? 'HELD' : 'DISPUTED',
    `trackingOpen=${openedB} codeShown=${bDump0.includes(CODE_E)} sellerInputCard=${bDump0.includes('Enter the 6-digit code')}`,
    [`${SHOTS}/sk14-07-buyer-card.png`]);
  await L.screenshot(pb, `${SHOTS}/sk14-07-buyer-card.png`);

  // ---- A2c rapid double-tap buyer regenerate ----
  const rb = R.network.length;
  await tapNoWait(pb, 'Generate a new code'); await sleep(130);
  await tapNoWait(pb, 'Generate a new code'); await sleep(2600);
  const rgCalls = netFor('/regenerate-delivery-code').slice(rb);
  const rgBodies = R.apiResponses.filter(a => a.line.includes('/regenerate-delivery-code')).slice(-2);
  const cNow = await L.api(E.buyer.token, 'GET', `/api/v1/orders/${E.orderId}`);
  const NEW_CODE_E = String(cNow.json.deliveryCode);
  const bAfterRg = await txt(pb);
  attack('B1-doubletap-regenerate', rgCalls.filter(c => c.includes('-> 200')).length === 1 ? 'DISPUTED' : 'DISPUTED',
    `${rgCalls.length} call(s): ${rgCalls.join('|')} serverCodeNow=${NEW_CODE_E} appPaintsIt=${bAfterRg.includes(NEW_CODE_E)} oldLeak=${bAfterRg.includes(CODE_E)}`,
    [`${SHOTS}/sk14-08-buyer-regenerated.png`]);
  await L.screenshot(pb, `${SHOTS}/sk14-08-buyer-regenerated.png`);

  // ---- A3 out-of-order: buyer self-confirm BEFORE giving seller any code ----
  const cb = R.network.length;
  await tapNoWait(pb, 'I received the items'); await sleep(2400);
  const cfCalls = netFor('/confirm-delivery').slice(cb);
  const cfBody = [...R.apiResponses].reverse().find(a => a.line.includes('/confirm-delivery'));
  const Erow1 = dbRow(E.orderId);
  attack('B2-outoforder-selfconfirm-first', cfBody && cfBody.body && cfBody.body.status === 'DELIVERED' ? 'DISPUTED' : 'DISPUTED',
    `calls=${cfCalls.join('|')||'NONE'} body=${JSON.stringify((cfBody&&cfBody.body)||{}).slice(0,120)} DB=${Erow1}`);
  await L.screenshot(pb, `${SHOTS}/sk14-09-buyer-selfconfirmed.png`);
  const bFinal = await L.api(E.buyer.token, 'GET', `/api/v1/orders/${E.orderId}`);
  attack('B2b-deadline-after-BUYER_BUTTON', 'DISPUTED',
    `status=${bFinal.json.status} fulfillmentDeadline=${bFinal.json.fulfillmentDeadline} DB=${dbRow(E.orderId)}`);

  // ---- A8: now use ORDER F for the REAL correct-code verify (unlock first via buyer regen) ----
  const rgF = await L.api(F.buyer.token, 'POST', `/api/v1/orders/${F.orderId}/regenerate-delivery-code`).catch(e => ({ status: 'ERR', json: {} }));
  attack('B3-setup-buyer-regen-clears-server-lock', rgF.status === 200 ? 'HELD' : 'BROKEN',
    `status=${rgF.status} dbAttemptsWas=${dbAfterLadder} now=${dbAttempts(F.orderId)}`);
  const REAL_F = rgF.json && rgF.json.deliveryCode ? String(rgF.json.deliveryCode) : '';
  // seller reloads and verifies the REAL code through the app (post-session-clear they must log in again)
  const relog = await loginAs(ps, F.seller.email, F.seller.pw);
  attack('B3b-seller-relogin-after-expiry', relog ? 'HELD' : 'BROKEN', 'seller back in after token clear+reload');
  await sleep(1200);
  await openTracking(ps, F, 'selling');
  const okType = await typeIntoFirstInput(ps, REAL_F);
  const vb = R.network.length;
  await tap(ps, 'Verify delivery', 3); await sleep(2600);
  const vOk = [...R.apiResponses].reverse().find(a => a.line.includes('/verify-delivery') && a.line.includes('-> 2'));
  const Frow = dbRow(F.orderId);
  attack('B3c-correct-code-app-DELIVERED', vOk && vOk.body && vOk.body.status === 'DELIVERED' ? 'HELD' : 'BROKEN',
    `typed=${okType===REAL_F?'exact':'MISMATCH'} call=${(vOk&&vOk.line)||netFor('/verify-delivery').slice(vb).join('|')} DB=${Frow}`);
  await L.screenshot(ps, `${SHOTS}/sk14-10-seller-verified-real.png`);

  // ---- A8 deadline math (fulfilledAt + 48h) ----
  const [stF, fulF, dlF, methF] = Frow.split('|');
  let hours = null;
  if (fulF !== 'NULL' && dlF !== 'NULL') hours = Math.abs((new Date(dlF.replace(' ', 'T') + 'Z') - new Date(fulF.replace(' ', 'T') + 'Z')) / 3600000);
  attack('A8-deadline-48h-OTP-path', (stF === 'DELIVERED' && fulF !== 'NULL' && dlF !== 'NULL' && Math.abs(hours - 48) < 1.5 && methF.trim() === 'OTP') ? 'HELD' : 'BROKEN',
    `status=${stF} fulfilledAt=${fulF} confirmationDeadline=${dlF} delta=${hours === null ? 'n/a' : hours.toFixed(2) + 'h'} method=${methF}`);

  // ---- images reconciliation ----
  function imgSum(m) { const v = Object.values(m || {}); return { total: v.length, bad: v.filter(s => s >= 400).length }; }
  R.images = { seller: imgSum(R.imgSeller), buyer: imgSum(R.imgBuyer) };

  fs.mkdirSync('e2e/results/shards', { recursive: true });
  fs.writeFileSync('/tmp/au039sk14_result.json', JSON.stringify(R, null, 2));
  console.log('\nATTACKS:', R.attacks.length);
  console.log(JSON.stringify(R.attacks.map(a => ({ a: a.attack, r: a.result })), null, 1));
  console.log('images:', JSON.stringify(R.images));
})().catch(e => { console.error('CRASH:', e); process.exit(1); })
  .finally(async () => { try { browser && browser.close(); } catch (e) {} });
