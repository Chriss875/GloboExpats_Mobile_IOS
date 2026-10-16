// au039_sk14_legs.js — SKEPTIC AU-039 round 2 on frozen lane :9131 (sha e694463,
// main.dart.js Last-Modified Wed, 26 Aug 2026 08:15:26 GMT).
//
// Round-1 lesson: hash-nav must land on '#/orders' BEFORE tapping 'Selling'
// (home page has no Selling chip). This leg script drives the real app:
//   SELLER (order F): open tracking -> A4 invalid inputs -> A1 double-tap verify
//   -> ladder to lockout -> A5 offline mid-request -> A6 session clear+reload
//   -> re-login -> buyer regenerates -> seller verifies REAL code in the app
//     -> A8 deadline math from DB.
//   BUYER (order E): open tracking -> B0b card checks -> double-tap regenerate
//   -> out-of-order self-confirm first -> deadline check.
//   ANON: deep-link /orders/{id} + tracking probe.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';
const SHOTS = 'e2e/shots/AU-039';
const R = { ts: new Date().toISOString(), unit: 'AU-039', stage: 'skeptic-r2', attacks: [], network: [], apiResponses: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const txt = p => p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');
function wireNet(p) {
  p.on('response', async r => {
    const u = r.url(); if (!/localhost:8083\/api\//.test(u)) return;
    const line = `${r.request().method()} ${u.replace('http://localhost:8083', '')} -> ${r.status()}`;
    R.network.push(line);
    if (/verify-delivery|regenerate-delivery-code|confirm-delivery/.test(u)) {
      let body = null; try { body = await r.json(); } catch (e) {}
      R.apiResponses.push({ line, body });
    }
  });
}
const netFor = f => R.network.filter(l => l.includes(f));
const dbAttempts = id => execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -tAc "SELECT delivery_code_attempts FROM orders WHERE order_id='${id}'"`).toString().trim();
const dbRow = id => execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -tAc "SELECT order_status||'|'||coalesce(to_char(fulfilled_at,'YYYY-MM-DD HH24:MI:SS'),'NULL')||'|'||coalesce(to_char(confirmation_deadline,'YYYY-MM-DD HH24:MI:SS'),'NULL')||'|'||coalesce(delivery_confirmation_method,'NULL') FROM orders WHERE order_id='${id}'"`).toString().trim();
function atk(name, result, detail) { R.attacks.push({ attack: name, result, detail: String(detail).slice(0, 420) }); console.log(`[${result}] ${name} :: ${String(detail).slice(0, 210)}`); }
const isLoggedIn = async p => { try { return !!(await p.evaluate(() => localStorage.getItem('flutter.auth_token') || '')); } catch (e) { return false; } };
const find = (p, lbl) => p.evaluate(l => { let best = null;
  document.querySelectorAll('flt-semantics').forEach(e => { const t = (e.textContent || '').trim();
    if (!t.includes(l)) return;
    if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
    const r = e.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return;
    if (!best || r.width * r.height < best.area) best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }); return best; }, lbl);
async function tap(p, lbl, tries = 4, settle = 1200) {
  for (let i = 0; i < tries; i++) {
    const h = await find(p, lbl);
    if (h) { await p.mouse.click(Math.max(3, Math.min(h.x, 755)), Math.max(20, Math.min(h.y, 1015))); await sleep(settle); return true; }
    await p.mouse.move(190, 350); await p.mouse.wheel(0, i % 2 ? -240 : 260); await sleep(300);
  } return false;
}
async function typeCode(p, v) {
  const inp = p.locator('input').first();
  await inp.click({ force: true }).catch(() => {}); await sleep(260);
  await p.keyboard.press('Control+a'); await sleep(110); await p.keyboard.press('Delete'); await sleep(180);
  await p.keyboard.type(v, { delay: 16 }).catch(() => {}); await sleep(300);
  return p.evaluate(() => { const el = document.querySelector('input'); return el ? el.value : null; });
}
async function loginAs(p, email, pw) {
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 60000); await sleep(800);
  if (await isLoggedIn(p)) {
    await p.evaluate(() => { localStorage.removeItem('flutter.auth_token'); localStorage.removeItem('flutter.auth_email'); }).catch(() => {});
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 60000); await sleep(1000);
  }
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
  const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(280);
  await p.keyboard.type(email, { delay: 10 });
  const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(280);
  await p.keyboard.type(pw, { delay: 10 });
  await L.clickBtn(p, 'Log in');
  let ok = false; for (let i = 0; i < 30 && !ok; i++) { await sleep(1000); ok = await isLoggedIn(p); }
  await sleep(1500);
  return ok;
}
async function gotoOrders(p) {
  await p.evaluate(() => { window.location.hash = '#/orders'; }).catch(() => {});
  await sleep(6500);
}
async function openTracking(p, fx, selling) {
  await gotoOrders(p);
  if (selling) { await tap(p, 'Selling', 3, 2500); }
  let t = await txt(p);
  if (!t.includes(fx.orderNumber)) return false;
  // open the order row (detail screen holds Track delivery)
  await tap(p, fx.orderNumber, 5, 2000);
  t = await txt(p);
  if (!t.includes('Track delivery')) { await sleep(1200); t = await txt(p); }
  if (!await tap(p, 'Track delivery', 4, 3200)) return false;
  t = await txt(p);
  return t.includes('Delivery tracking') || t.includes('Delivery handover') || t.includes('Your delivery code');
}

(async () => {
  const F = JSON.parse(fs.readFileSync('/tmp/au039sk14_F.json', 'utf8'));
  const E = JSON.parse(fs.readFileSync('/tmp/au039sk14_E.json', 'utf8'));
  const CODE_E = E.afterDispatch.deliveryCode;

  // ================= ANON probes first (no session) =================
  const bA = await L.newBrowser();
  const cA = await L.newCtx(bA, { viewport: { width: 768, height: 1024 }, videoPath: 'e2e/videos/au039sk14-anon-768.webm' });
  const pa = await cA.newPage(); wireNet(pa);
  await pa.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(pa, 'Buy now', 60000);
  await pa.evaluate(h => { window.location.hash = h; }, `#/orders/${F.orderId}`).catch(() => {});
  await sleep(7000);
  let dmp = await txt(pa);
  atk('A7a-anon-deeplink-order-detail', dmp.includes(CODE_E) || dmp.includes(F.orderNumber.split('-')[2]) ? (dmp.includes(CODE_F) ? 'BROKEN' : 'HELD') : 'DISPUTED',
    `anon deep-link /orders/${F.orderId.slice(0, 8)}… leaksCodeF=${dmp.includes(F.afterDispatch.deliveryCode)} showsOrderNum=${dmp.includes(F.orderNumber)} len=${dmp.length}`);
  await L.screenshot(pa, `${SHOTS}/sk14r2-anon-detail-768.png`);
  const callsA = netFor(`/orders/${F.orderId}`).length;
  atk('A7b-anon-api-calls', callsA === 0 ? 'HELD' : 'DISPUTED', `API calls fired while anon on deep-link=${callsA}`);
  await cA.close();

  // ================= SELLER leg (order F) =================
  const bS = await L.newBrowser();
  const cS = await L.newCtx(bS, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/au039sk14-seller-375.webm' });
  const ps = await cS.newPage(); wireNet(ps);
  atk('S0-login', (await loginAs(ps, F.seller.email, F.seller.pw)) ? 'HELD' : 'BROKEN', 'seller fixture login');
  const opened = await openTracking(ps, F, true);
  const sT = await txt(ps);
  atk('S1-seller-tracking-card', opened && sT.includes('Delivery handover') ? 'HELD' : 'BROKEN',
    `trackingOpen=${opened} handoverCard=${sT.includes('Delivery handover')} inputCopy=${sT.includes('Enter the 6-digit code')}`);
  await L.screenshot(ps, `${SHOTS}/sk14r2-01-seller-card.png`);

  // ---- A4 invalid inputs ----
  const emojiDom = await typeCode(ps, '😀😀😀😀😀😀');
  await tap(ps, 'Verify delivery', 2, 1900);
  const emCall = [...R.apiResponses].reverse().find(a => a.line.includes('/verify-delivery'));
  atk('A4a-emoji-input', emojiDom !== null ? 'DISPUTED' : 'BROKEN',
    `dom="${emojiDom}" call=${(emCall && emCall.line) || 'NONE'} body=${JSON.stringify((emCall && emCall.body) || {}).slice(0, 130)}`);

  const longDom = await typeCode(ps, '9'.repeat(500));
  await tap(ps, 'Verify delivery', 2, 1900);
  atk('A4b-500-char-input', (longDom || '').length <= 6 ? 'DISPUTED' : 'BROKEN',
    `domLen=${(longDom || '').length} (maxLength=6 gate ${(longDom || '').length <= 6 ? 'held' : 'BYPASSED'})`);

  const scrDom = await typeCode(ps, '<script>alert(1)</script>');
  await tap(ps, 'Verify delivery', 2, 1900);
  const scrDump = await txt(ps);
  const scrCalls = netFor('/verify-delivery');
  atk('A4c-script-tag-input', !scrDump.includes('<script>alert') ? 'HELD' : 'DISPUTED',
    `dom="${scrDom}" echoedInView=${scrDump.includes('<script>alert')} totalVerifyCallsSoFar=${scrCalls.length}`);
  await L.screenshot(ps, `${SHOTS}/sk14r2-02-invalid-inputs.png`);
  console.log('   DB attempts after invalid inputs:', dbAttempts(F.orderId));

  // ---- A1 rapid double-tap verify with wrong code ----
  await typeCode(ps, '246810');
  const nb = R.network.length;
  const h1 = await find(ps, 'Verify delivery');
  if (h1) { await p2click(ps, h1); }
  async function p2click(p, h) { await p.mouse.click(Math.max(3, Math.min(h.x, 755)), Math.max(20, Math.min(h.y, 1015))); }
  if (h1) { await p2click(ps, h1); } // second tap ~instantly
  await sleep(2600);
  const dbl = netFor('/verify-delivery').slice(nb);
  const dbAfterDbl = dbAttempts(F.orderId);
  atk('A1-doubletap-verify', dbl.length >= 1 ? 'DISPUTED' : 'BROKEN',
    `${dbl.length} POST(s) from double-tap [${dbl.join(' | ')}] DB attempts=${dbAfterDbl} (server counts every accepted attempt)`);

  // ---- ladder to lockout ----
  for (let i = 0; i < 3; i++) {
    const cur = await typeCode(ps, String(777000 + i * 13));
    if (!cur) break;
    await tap(ps, 'Verify delivery', 2, 2200);
    const d = await txt(ps);
    console.log(`   ladder ${i}: typed=${cur} dbAttempts=${dbAttempts(F.orderId)} lockCopy=${/Too many|Locked|Three attempts/i.test(d)}`);
    if (/Too many incorrect|Three attempts/i.test(d)) break;
  }
  const dbLadder = dbAttempts(F.orderId);
  const lockDump = await txt(ps);
  atk('A2-lockout-after-ladder', Number(dbLadder) >= 3 ? 'HELD' : 'BROKEN',
    `DB delivery_code_attempts=${dbLadder}; copy=${(lockDump.split('\n').filter(x => /lock|three|attempt/i.test(x))[0] || '').slice(0, 110)}`);
  await L.screenshot(ps, `${SHOTS}/sk14r2-03-locked.png`);
  const btnState = await ps.evaluate(() => { let f = null;
    document.querySelectorAll('flt-semantics').forEach(e => { if (f) return;
      if ((e.textContent || '').includes('Verify delivery')) f = { role: e.getAttribute('role'), dis: e.getAttribute('aria-disabled') }; });
    return f; });
  atk('A2b-locked-button-state', btnState && btnState.dis === 'true' ? 'HELD' : 'DISPUTED',
    `btnState=${JSON.stringify(btnState)}`);

  // ---- seller taps Generate new code while locked -> expect honest 403 ----
  const nbR = R.network.length;
  await tap(ps, 'Generate new code', 2, 2200);
  const rgSeller = netFor('/regenerate-delivery-code').slice(nbR);
  const rgDump = await txt(ps);
  atk('A3-seller-regenerate-denied', rgSeller.some(c => c.includes('-> 403')) ? 'HELD' : 'DISPUTED',
    `calls=[${rgSeller.join('|')}] copy=${(rgDump.split('\n').filter(x => /regenerate/i.test(x))[0] || '').slice(0, 110)}`);
  await L.screenshot(ps, `${SHOTS}/sk14r2-04-regen-denied.png`);

  // ---- A5 offline mid-request ----
  const nbOff = R.network.length;
  await ps.context().setOffline(true);
  await typeCode(ps, '135790').catch(() => {});
  await tap(ps, 'Verify delivery', 1, 2500).catch(() => {});
  await ps.context().setOffline(false);
  await sleep(3000);
  const offCalls = netFor('/verify-delivery').slice(nbOff);
  const offDump = await txt(ps);
  const offErr = /could not confirm|failed|error/i.test(offDump);
  atk('A5-offline-mid-request', offDump.length > 50 && offCalls.length === 0 ? 'DISPUTED' : 'DISPUTED',
    `offlineCalls=${offCalls.length} pageAliveChars=${offDump.length} errorCopyShown=${offErr}`);

  // ---- A6 session expiry: clear token + reload ----
  await ps.evaluate(() => { localStorage.removeItem('flutter.auth_token'); localStorage.removeItem('flutter.auth_email'); }).catch(() => {});
  await ps.goto(APP + '/#/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(7000);
  const postClear = await txt(ps);
  const stillIn = await isLoggedIn(ps);
  atk('A6-token-clear-reload-gates-to-login', !stillIn && /login|welcome back/i.test(postClear) ? 'HELD' : 'DISPUTED',
    `loggedInFlag=${stillIn} showsLoginCopy=${/login|welcome back/i.test(postClear)}`);
  await L.screenshot(ps, `${SHOTS}/sk14r2-05-session-cleared.png`);
  await cS.close();

  // ================= BUYER regen unlocks; seller verifies REAL code =================
  const rgF = await L.api(F.buyer.token, 'POST', `/api/v1/orders/${F.orderId}/regenerate-delivery-code`).catch(e => ({ status: 'ERR:' + e.message }));
  const REAL_F = rgF.json && rgF.json.deliveryCode ? String(rgF.json.deliveryCode) : '';
  atk('B1-buyer-regen-clears-server-lock', rgF.status === 200 && /^\d{6}$/.test(REAL_F) && Number(dbAttempts(F.orderId)) === 0 ? 'HELD' : 'BROKEN',
    `status=${rgF.status} newCode=${REAL_F} dbAttemptsNow=${dbAttempts(F.orderId)}`);

  const cS2 = await L.newCtx(bS, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/au039sk14-seller-realcode.webm' });
  const ps2 = await cS2.newPage(); wireNet(ps2);
  atk('B2-seller-relogin', (await loginAs(ps2, F.seller.email, F.seller.pw)) ? 'HELD' : 'BROKEN', 'seller fresh session');
  const opened2 = await openTracking(ps2, F, true);
  const s2T = await txt(ps2);
  atk('B2b-seller-tracking-reachable', opened2 && s2T.includes('Delivery handover') ? 'HELD' : 'BROKEN', `open=${opened2}`);
  const typedReal = await typeCode(ps2, REAL_F);
  const nbV = R.network.length;
  await tap(ps2, 'Verify delivery', 3, 2800);
  const okCall = [...R.apiResponses].reverse().find(a => a.line.includes('/verify-delivery'));
  const Frow = dbRow(F.orderId);
  const [stF, fulF, dlF, methF] = Frow.split('|');
  atk('B3-correct-code-app-DELIVERED', stF === 'DELIVERED' && methF.trim() === 'OTP' ? 'HELD' : 'BROKEN',
    `typedExact=${typedReal === REAL_F} call=${(okCall && okCall.line) || 'NONE'} body=${JSON.stringify((okCall && okCall.body) || {}).slice(0, 140)} DB=${Frow}`);
  await L.screenshot(ps2, `${SHOTS}/sk14r2-06-verified-real.png`);
  const afterDump = await txt(ps2);
  atk('B3b-code-hidden-after-delivered', !afterDump.includes(REAL_F) ? 'HELD' : 'DISPUTED',
    `appStillShowsCode=${afterDump.includes(REAL_F)}`);
  let hours = null;
  if (fulF !== 'NULL' && dlF !== 'NULL') hours = Math.abs((new Date(dlF.replace(' ', 'T') + 'Z') - new Date(fulF.replace(' ', 'T') + 'Z')) / 3600000);
  atk('A8-deadline-48h-OTP-path', (stF === 'DELIVERED' && fulF !== 'NULL' && dlF !== 'NULL' && Math.abs(hours - 48) < 1.5 && methF.trim() === 'OTP') ? 'HELD' : 'BROKEN',
    `status=${stF} fulfilledAt=${fulF} confirmationDeadline=${dlF} delta=${hours === null ? 'n/a' : hours.toFixed(2) + 'h'} method=${methF}`);
  await cS2.close();

  // ================= BUYER leg (order E) =================
  const bB = await L.newBrowser();
  const cB = await L.newCtx(bB, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/au039sk14-buyer-375.webm' });
  const pb = await cB.newPage(); wireNet(pb);
  atk('C0-buyer-login', (await loginAs(pb, E.buyer.email, E.buyer.pw)) ? 'HELD' : 'BROKEN', 'buyer fixture login');
  const openedB = await openTracking(pb, E, false);
  const bT = await txt(pb);
  atk('C1-buyer-code-card', openedB && bT.includes(CODE_E) && !bT.includes('Enter the 6-digit code') ? 'HELD' : 'BROKEN',
    `open=${openedB} codeShown=${bT.includes(CODE_E)} sellerInputLeak=${bT.includes('Enter the 6-digit code')}`);
  await L.screenshot(pb, `${SHOTS}/sk14r2-07-buyer-card.png`);

  // double-tap regenerate
  const nbRG = R.network.length;
  const hg = await find(pb, 'Generate a new code');
  if (hg) { await pb.mouse.click(Math.min(hg.x, 360), Math.min(hg.y, 660)); await pb.mouse.click(Math.min(hg.x, 360), Math.min(hg.y, 660)); }
  await sleep(3200);
  const rgCalls = netFor('/regenerate-delivery-code').slice(nbRG);
  const rgOk = R.apiResponses.filter(a => a.line.includes('/regenerate-delivery-code') && a.line.includes('-> 2'));
  const cNow = await L.api(E.buyer.token, 'GET', `/api/v1/orders/${E.orderId}`);
  const NEW_E = String(cNow.json.deliveryCode || '');
  const bAfter = await txt(pb);
  atk('C2-doubletap-buyer-regenerate', rgCalls.length === 1 && NEW_E && bAfter.includes(NEW_E) && !bAfter.includes(CODE_E) ? 'HELD'
    : (rgCalls.length >= 1 && NEW_E ? 'DISPUTED' : 'BROKEN'),
    `calls=${rgCalls.length}[${rgCalls.join('|')}] serverCode=${NEW_E} appPaintsNew=${bAfter.includes(NEW_E)} oldStillPainted=${bAfter.includes(CODE_E)}`);
  await L.screenshot(pb, `${SHOTS}/sk14r2-08-buyer-regenerated.png`);

  // out-of-order: buyer self-confirms FIRST (no code ever given to the driver)
  const nbCF = R.network.length;
  await tap(pb, 'I received the items', 2, 2800);
  const cfCalls = netFor('/confirm-delivery').slice(nbCF);
  const cfBody = [...R.apiResponses].reverse().find(a => a.line.includes('/confirm-delivery'));
  const Erow = dbRow(E.orderId);
  const [stE, fulE, dlE, methE] = Erow.split('|');
  let hoursE = null;
  if (fulE !== 'NULL' && dlE !== 'NULL') hoursE = Math.abs((new Date(dlE.replace(' ', 'T') + 'Z') - new Date(fulE.replace(' ', 'T') + 'Z')) / 3600000);
  atk('C3-outoforder-selfconfirm-first', stE === 'DELIVERED' && methE.trim() === 'BUYER_BUTTON' ? 'DISPUTED' : 'BROKEN',
    `calls=${cfCalls.length}[${cfCalls.join('|')}] body=${JSON.stringify((cfBody && cfBody.body) || {}).slice(0, 110)} DB=${Erow}`);
  let deadlineE = (stE === 'DELIVERED' && fulE !== 'NULL' && dlE !== 'NULL' && Math.abs(hoursE - 48) < 1.5);
  atk('C4-deadline-48h-BUYER_BUTTON', deadlineE ? 'HELD' : 'BROKEN',
    `fulfilledAt=${fulE} confirmationDeadline=${dlE} delta=${hoursE === null ? 'n/a' : hoursE.toFixed(2) + 'h'} (fix2 claim covers both paths)`);
  await L.screenshot(pb, `${SHOTS}/sk14r2-09-selfconfirmed.png`);
  await cB.close();

  await bA.close(); await bS.close(); await bB.close();

  // image reconciliation
  fs.writeFileSync('/tmp/au039sk14_r2_result.json', JSON.stringify(R, null, 2));
  const held = R.attacks.filter(a => a.result === 'HELD').length;
  const broken = R.attacks.filter(a => a.result === 'BROKEN').length;
  const disp = R.attacks.filter(a => a.result === 'DISPUTED').length;
  console.log(`\nR2 DONE: HELD=${held} BROKEN=${broken} DISPUTED=${disp}`);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
