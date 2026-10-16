// au039_sk14_leg3.js — SKEPTIC AU-039 round 3: the interactive attacks that round 2
// could not reach (Track-delivery sub-screen). Uses L.clickCard (tappable-node clicker
// from lib_verify) for 'Track delivery' + order rows, and drives:
//   seller leg (order G): invalid inputs -> double-tap verify -> ladder to lockout
//     -> locked button state -> seller regenerate denied -> offline mid-request
//   buyer leg (order H): code card -> double-tap regenerate -> out-of-order self-confirm
//   anon: deep-link tracking route
// Fresh fixture G/H minted here through the REAL API escrow chain (au-039sk14 prefix).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';
const SHOTS = 'e2e/shots/AU-039';
const R = { ts: new Date().toISOString(), unit: 'AU-039', stage: 'skeptic-r3', attacks: [], network: [], apiResponses: [] };
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
function atk(name, result, detail, evidence) { R.attacks.push({ attack: name, result, detail: String(detail).slice(0, 420), evidence: evidence || [] }); console.log(`[${result}] ${name} :: ${String(detail).slice(0, 200)}`); }
const isLoggedIn = async p => { try { return !!(await p.evaluate(() => localStorage.getItem('flutter.auth_token') || '')); } catch (e) { return false; } };

// ---- fixture minting (real escrow chain, receipt upload + admin confirm-payment so
// escrow_pending=false and the seller legitimately sees the order) ----
const PNG = fs.readFileSync(path.join(__dirname, 'fixtures', 'receipt-proof.png'));
async function mintOrder(tag) {
  const STAMP = Date.now();
  const bEmail = `au-039sk14${tag}buyer${STAMP}@gmail.com`;
  const sEmail = `au-039sk14${tag}seller${STAMP}@gmail.com`;
  for (const e of [bEmail, sEmail]) await L.api(null, 'POST', '/api/v1/auth/register',
    { firstName: 'Sk14' + tag.toUpperCase() + 'R3', lastName: e === bEmail ? 'Buyer' : 'Seller', password: 'StrongPass!1', emailAddress: e });
  const btok = await L.apiLogin({ email: bEmail, pw: 'StrongPass!1' });
  const stok = await L.apiLogin({ email: sEmail, pw: 'StrongPass!1' });
  const atok = await L.apiLogin(L.ADMIN);
  const buid = (await L.api(btok, 'GET', '/api/v1/userManagement/user-details')).json.userId;
  const suid = (await L.api(stok, 'GET', '/api/v1/userManagement/user-details')).json.userId;
  await L.api(atok, 'PATCH', `/api/v1/admin/users/${suid}/status`, { status: 'VERIFIED' });
  // product
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify({
    productName: `au-039sk14 r3 ${tag} Lamp ${STAMP}`, productQuantity: 2, categoryId: 3, subcategoryId: 26,
    productCountry: 'Tanzania', productRegion: 'Dar es Salaam', productStreet: 'Mikocheni',
    productDescription: `AU-039 skeptic r3 fixture ${tag}.`, currency: 'TZS', askingPrice: 16000,
    originalPrice: 19000, condition: 'NEW',
  }))], { type: 'application/json' }), 'product.json');
  form.append('images', new Blob([PNG], { type: 'image/png' }), 'fixture.png');
  const pr = await fetch(`${L.API}/api/v1/products/post-product`, { method: 'POST', headers: { Authorization: 'Bearer ' + stok }, body: form });
  const pj = await pr.json().catch(() => null);
  const pid = pj.productId || pj.id || (pj.product && pj.product.productId);
  await L.api(atok, 'PATCH', `/api/v1/admin/products/${pid}/logistics`,
    { latitude: -6.7905, longitude: 39.2795, deliveryTransportMode: 'BODA', neighbourhood: 'Mikocheni' });
  await L.api(btok, 'POST', '/api/v1/add-address', {
    street: `au-039sk14 ${tag}r3 Street 9`, city: 'Dar es Salaam', region: 'Dar es Salaam', country: 'Tanzania',
    label: 'Home', latitude: -6.7924, longitude: 39.2083, isDefault: true, phoneNumber: '+255713000666' });
  const day = new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 10);
  const buyDetails = {
    firstName: 'Sk14R3' + tag.toUpperCase(), lastName: 'Skeptic', emailAddress: bEmail,
    phoneNumber: '+255713000666', address: `au-039sk14 ${tag}r3 Street 9`, city: 'Dar es Salaam',
    state: 'Dar es Salaam', country: 'Tanzania', zipCode: '', deliveryMethod: "Seller's delivery",
    paymentMethodType: 'MOBILE_MONEY', agreeToTerms: true, fulfillmentType: 'SELLER_DELIVERY',
    currency: 'TZS', latitude: -6.7924, longitude: 39.2083,
    preferredDeliveryWindows: [{ date: day, slot: 'EVENING' }],
  };
  const before = new Set(((await L.api(btok, 'GET', '/api/v1/orders')).json || []).map(o => o.orderId));
  const pf = await L.api(btok, 'POST', '/api/v1/checkout/proforma', { buyDetails, items: [{ productId: pid, quantity: 1 }] });
  await L.api(btok, 'POST', `/api/v1/proformas/${pf.json.proformaId}/submit-payment`,
    { transactionReferences: [`SK14R3-${tag}-${STAMP}`], paymentMethodType: 'MOBILE_MONEY' });
  const orderId = String(((await L.api(btok, 'GET', '/api/v1/orders')).json || []).filter(o => !before.has(o.orderId))[0].orderId);
  await L.api(atok, 'PATCH', `/api/v1/admin/orders/${orderId}/mark-paid`, {});
  // real payment evidence -> admin confirm-payment clears escrowPending
  const pubId = execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -tAc "SELECT g.proforma_id FROM proformas p JOIN proforma_seller_groups g ON g.proforma_id=p.id WHERE g.order_id='${orderId}'"`).toString().trim();
  const pubPublic = execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -tAc "SELECT public_id FROM proformas WHERE id=${pubId}"`).toString().trim();
  const rf = new FormData();
  rf.append('receipts', new Blob([PNG], { type: 'image/png' }), 'proof.png');
  rf.append('details', new Blob([Buffer.from(JSON.stringify({ transactionReferences: [`SK14R3-${tag}`] }))], { type: 'application/json' }));
  await fetch(`${L.API}/api/v1/proformas/${pubPublic}/receipts`, { method: 'POST', headers: { Authorization: 'Bearer ' + btok }, body: rf });
  await L.api(atok, 'POST', `/api/v1/admin/proformas/${pubPublic}/confirm-payment`, {});
  await L.api(stok, 'POST', `/api/v1/orders/${orderId}/confirm-availability`, {});
  const tr = await L.api(stok, 'POST', '/api/v1/transporters', {
    fullName: `au-039sk14 Rider r3${tag}`, phoneNumber: '+255715000555', whatsAppPhoneNumber: '+255715000555',
    vehicleType: 'MOTORBIKE', plateNumber: `T4K${String(STAMP).slice(-5)}`, active: true });
  await L.api(stok, 'POST', `/api/v1/orders/${orderId}/transporter`, { transporterId: tr.json.transporterId, note: 'sk14r3' });
  const dp = await L.api(atok, 'POST', `/api/v1/orders/${orderId}/dispatch`, {});
  const od = await L.api(btok, 'GET', `/api/v1/orders/${orderId}`);
  console.log(`[seed-r3:${tag}] dispatch=${dp.status} status=${od.json.status} code=${od.json.deliveryCode} num=${od.json.orderNumber}`);
  if (!/^\d{6}$/.test(String(od.json.deliveryCode))) throw new Error('no code');
  return { tag, buyer: { email: bEmail, pw: 'StrongPass!1', token: btok }, seller: { email: sEmail, pw: 'StrongPass!1', token: stok }, orderId, orderNumber: od.json.orderNumber, code: od.json.deliveryCode, proformaPublicId: pubPublic };
}

async function loginAs(p, email, pw) {
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 60000); await sleep(700);
  if (await isLoggedIn(p)) {
    await p.evaluate(() => { localStorage.removeItem('flutter.auth_token'); localStorage.removeItem('flutter.auth_email'); }).catch(() => {});
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 60000); await sleep(900);
  }
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
  const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(260);
  await p.keyboard.type(email, { delay: 9 });
  const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(260);
  await p.keyboard.type(pw, { delay: 9 });
  await L.clickBtn(p, 'Log in');
  let ok = false; for (let i = 0; i < 30 && !ok; i++) { await sleep(1000); ok = await isLoggedIn(p); }
  await sleep(1400); return ok;
}
// tappable/role-aware finder (accepts role=button OR flt-tappable)
const findAny = (p, lbl) => p.evaluate(l => { let best = null;
  document.querySelectorAll('flt-semantics').forEach(e => { const t = (e.textContent || '').trim();
    if (!t.includes(l)) return;
    if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
    const r = e.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return;
    if (!best || r.width * r.height < best.area) best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), role: e.getAttribute('role'), tap: e.getAttribute('flt-tappable') !== null };
  }); return best; }, lbl);
async function tap(p, lbl, tries = 4, settle = 1500) {
  for (let i = 0; i < tries; i++) {
    const h = await findAny(p, lbl);
    if (h) { await p.mouse.click(Math.max(3, Math.min(h.x, 755)), Math.max(20, Math.min(h.y, 1015))); await sleep(settle); return h; }
    await p.mouse.move(190, 350); await p.mouse.wheel(0, i % 2 ? -240 : 280); await sleep(320);
  } return null;
}
async function typeCode(p, v) {
  const inp = p.locator('input').first();
  await inp.click({ force: true }).catch(() => {}); await sleep(250);
  await p.keyboard.press('Control+a'); await sleep(100); await p.keyboard.press('Delete'); await sleep(170);
  await p.keyboard.type(v, { delay: 15 }).catch(() => {}); await sleep(300);
  return p.evaluate(() => { const el = document.querySelector('input'); return el ? el.value : null; });
}

(async () => {
  const head = execSync('curl -sI http://localhost:9131/main.dart.js').toString();
  const lm = ((head.match(/Last-Modified:\s*(.+)/i)) || [])[1] || '';
  if (lm.trim() !== 'Wed, 26 Aug 2026 08:15:26 GMT') { console.error('BLOCKED-stale-build', lm.trim()); process.exit(2); }
  console.log('freshness OK');

  // ================= ANON deep-link to the tracking route =================
  const Fprev = JSON.parse(fs.readFileSync('/tmp/au039sk14_F.json', 'utf8')); // DELIVERED now — use as anon probe target anyway
  const Eprev = JSON.parse(fs.readFileSync('/tmp/au039sk14_E.json', 'utf8'));
  const bAnon = await L.newBrowser();
  {
    const cA = await L.newCtx(bAnon, { viewport: { width: 768, height: 1024 }, videoPath: 'e2e/videos/au039sk14-anon-track.webm' });
    const pa = await cA.newPage(); wireNet(pa);
    await pa.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(pa, 'Buy now', 60000);
    await pa.evaluate(h => { window.location.hash = h; }, '#/orders').catch(() => {});
    await sleep(6500);
    const d0 = await txt(pa);
    atk('A7-anon-orders-route', /login|welcome back|sign in/i.test(d0) ? 'HELD' : 'DISPUTED',
      `anon #/orders dump shows login gate=${/login|welcome back|sign in/i.test(d0)} chars=${d0.length}`,
      [`${SHOTS}/sk14r3-anon-orders.png`]);
    await L.screenshot(pa, `${SHOTS}/sk14r3-anon-orders.png`);
    const calls = netFor('/api/v1/orders').length;
    atk('A7b-anon-no-authenticated-api', calls === 0 ? 'HELD' : 'DISPUTED', `orders api calls fired while anon=${calls}`);
    await cA.close();
  }
  await bAnon.close();

  // ================= SELLER leg on a fresh IN_TRANSIT order =================
  const G = await mintOrder('g');
  fs.writeFileSync('/tmp/au039sk14_G.json', JSON.stringify(G, null, 2));
  const bS = await L.newBrowser();
  const cS = await L.newCtx(bS, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/au039sk14-seller-r3.webm' });
  const ps = await cS.newPage(); wireNet(ps);
  atk('S0-login', (await loginAs(ps, G.seller.email, G.seller.pw)) ? 'HELD' : 'BROKEN', 'seller r3 login');
  // list -> selling tab -> row -> Track delivery (clickCard handles tappable rows)
  await ps.evaluate(() => { window.location.hash = '#/orders'; }).catch(() => {});
  await sleep(6500);
  let t = await txt(ps);
  if (!t.includes(G.orderNumber)) { const okTab = await tap(ps, 'Selling', 2, 2200); console.log('   tapped Selling:', !!okTab); await sleep(1200); t = await txt(ps); }
  atk('S1-selling-list-shows-order', t.includes(G.orderNumber) ? 'HELD' : 'BROKEN', `list shows ${G.orderNumber}=${t.includes(G.orderNumber)}`);
  const rowHit = await tap(ps, G.orderNumber, 4, 2400);
  t = await txt(ps);
  const trackHit = t.includes('Track delivery') ? await tap(ps, 'Track delivery', 3, 4000)
    : (await tap(ps, 'Track delivery', 4, 4000));
  t = await txt(ps);
  atk('S2-tracking-screen-handover-card', (trackHit && t.includes('Delivery handover')) ? 'HELD' : 'BROKEN',
    `rowTap=${!!rowHit} trackTap=${!!trackHit} handoverCard=${t.includes('Delivery handover')} inputCopy=${t.includes('Enter the 6-digit code')} verifyBtn=${t.includes('Verify delivery')}`,
    [`${SHOTS}/sk14r3-01-seller-handover.png`]);
  await L.screenshot(ps, `${SHOTS}/sk14r3-01-seller-handover.png`);

  // ---- A4 invalid inputs ----
  const emojiDom = await typeCode(ps, '😀😀😀😀😀😀');
  await tap(ps, 'Verify delivery', 1, 2000);
  const emBody = [...R.apiResponses].reverse().find(a => a.line.includes('/verify-delivery'));
  atk('A4a-emoji-input', emojiDom === '' || emojiDom === '0' ? 'HELD' : (emojiDom === null ? 'DISPUTED' : 'DISPUTED'),
    `emoji dom value="${emojiDom}" (number keyboard rejects emoji: empty=good) call=${(emBody && emBody.line) || 'NONE'}`);

  const longDom = await typeCode(ps, '9'.repeat(500));
  await tap(ps, 'Verify delivery', 1, 2000);
  atk('A4b-500-char-input', (longDom || '').length <= 6 && longDom !== null ? 'HELD' : (longDom === null ? 'DISPUTED' : 'BROKEN'),
    `domLen=${(longDom || '').length} maxLength=6 ${(longDom || '').length <= 6 ? 'held' : 'BYPASSED'}`);

  const scrDom = await typeCode(ps, '<script>alert(1)</script>');
  await tap(ps, 'Verify delivery', 1, 2000);
  const scrDump = await txt(ps);
  atk('A4c-script-tag-input', scrDom !== null && !scrDump.includes('<script>alert') ? 'DISPUTED' : 'DISPUTED',
    `dom="${scrDom}" echoedInView=${scrDump.includes('<script>alert')} verifyCallsSoFar=${netFor('/verify-delivery').length}`);
  await L.screenshot(ps, `${SHOTS}/sk14r3-02-invalid-inputs.png`);
  console.log('   DB attempts after A4:', dbAttempts(G.orderId));

  // ---- A1 rapid double-tap Verify with a definite wrong code ----
  const typedDbl = await typeCode(ps, '246810');
  const nb = R.network.length;
  const hV = await findAny(ps, 'Verify delivery');
  if (hV) { await ps.mouse.click(Math.min(hV.x, 360), Math.min(hV.y, 660)); await ps.mouse.click(Math.min(hV.x, 360), Math.min(hV.y, 660)); }
  await sleep(3000);
  const dblCalls = netFor('/verify-delivery').slice(nb);
  const dbAfterDbl = dbAttempts(G.orderId);
  atk('A1-doubletap-verify', dblCalls.length >= 1 ? 'DISPUTED' : 'BROKEN',
    `typed="${typedDbl}" ${dblCalls.length} POST(s)[${dblCalls.join('|')}] DB attempts after=${dbAfterDbl}`);

  // ---- ladder to lockout ----
  for (let i = 0; i < 3; i++) {
    const cur = await typeCode(ps, String(777000 + i * 17));
    if (cur === null) break;
    await tap(ps, 'Verify delivery', 1, 2300);
    const d = await txt(ps);
    console.log(`   ladder ${i}: typed=${cur} db=${dbAttempts(G.orderId)} lock=${/Too many|Locked|Three attempts/i.test(d)}`);
    if (/Too many incorrect|Three attempts/i.test(d)) break;
  }
  const dbLadder = Number(dbAttempts(G.orderId));
  const lockDump = await txt(ps);
  atk('A2-lockout-persists-server-side', dbLadder >= 3 ? 'HELD' : 'BROKEN',
    `DB delivery_code_attempts=${dbLadder}; lockCopy=${(lockDump.split('\n').filter(x => /lock|three|attempt/i.test(x))[0] || '').slice(0, 110)}`);
  await L.screenshot(ps, `${SHOTS}/sk14r3-03-locked.png`);

  const btnState = await ps.evaluate(() => { let f = null;
    document.querySelectorAll('flt-semantics').forEach(e => { if (f) return;
      if ((e.textContent || '').includes('Verify delivery')) f = { role: e.getAttribute('role'), dis: e.getAttribute('aria-disabled'), tap: e.getAttribute('flt-tappable') }; });
    return f; });
  atk('A2b-locked-verify-button-state', btnState && btnState.dis === 'true' ? 'HELD' : 'DISPUTED',
    `btnState=${JSON.stringify(btnState)} copyHasLocked=/Locked|Three attempts/i.test(dump)=${/Locked|Three attempts/i.test(lockDump)}`);

  // extra wrong tries while locked must not hit the server again
  const nbLockProbe = R.network.length;
  await typeCode(ps, '999999').catch(() => {});
  await tap(ps, 'Verify delivery', 1, 1800);
  const lockProbeCalls = netFor('/verify-delivery').slice(nbLockProbe);
  atk('A2c-locked-no-more-server-calls', lockProbeCalls.length === 0 ? 'HELD' : 'BROKEN',
    `verify calls fired while locked=${lockProbeCalls.length}[${lockProbeCalls.join('|')}]`);

  // ---- A3 seller regenerate while locked -> honest 403, no reset ----
  const nbRG = R.network.length;
  await tap(ps, 'Generate new code', 2, 2400);
  const rgSeller = netFor('/regenerate-delivery-code').slice(nbRG);
  const rgDump = await txt(ps);
  const dbAfterSellerRegen = dbAttempts(G.orderId);
  atk('A3-seller-regenerate-denied', rgSeller.some(c => c.includes('-> 403')) ? 'HELD' : 'DISPUTED',
    `calls=[${rgSeller.join('|')}] copy=${(rgDump.split('\n').filter(x => /regenerate/i.test(x))[0] || '').slice(0, 110)} dbAttemptsStill=${dbAfterSellerRegen}`);
  await L.screenshot(ps, `${SHOTS}/sk14r3-04-regen-denied.png`);

  // ---- A5 offline mid-request ----
  const nbOff = R.network.length;
  await ps.context().setOffline(true);
  await typeCode(ps, '135790').catch(() => {});
  await tap(ps, 'Verify delivery', 1, 2600).catch(() => {});
  await ps.context().setOffline(false);
  await sleep(3500);
  const offCalls = netFor('/verify-delivery').slice(nbOff);
  const offDump = await txt(ps);
  const stillAlive = offDump.includes('Delivery handover');
  atk('A5-offline-mid-request-no-crash', stillAlive && !/Unhandled exception/i.test(offDump) ? 'DISPUTED' : 'BROKEN',
    `offlineVerifyCalls=${offCalls.length} cardStillMounted=${stillAlive} crashCopy=${/Unhandled exception/i.test(offDump)} chars=${offDump.length}`);
  await L.screenshot(ps, `${SHOTS}/sk14r3-05-offline.png`);

  // ---- A6 session clear + reload mid-flow ----
  await ps.evaluate(() => { localStorage.removeItem('flutter.auth_token'); localStorage.removeItem('flutter.auth_email'); }).catch(() => {});
  await ps.goto(APP + '/#/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(7500);
  const postClear = await txt(ps);
  atk('A6-token-clear-reload-gates-to-login', !await isLoggedIn(ps) ? 'HELD' : 'BROKEN',
    `loggedInFlag=${await isLoggedIn(ps)} showsLoginCopy=${/login|welcome back/i.test(postClear)} ordersLeaked=${postClear.includes(G.orderNumber)}`,
    [`${SHOTS}/sk14r3-06-session-cleared.png`]);
  await L.screenshot(ps, `${SHOTS}/sk14r3-06-session-cleared.png`);
  await cS.close();

  // ---- buyer regenerates (clears server lock), seller verifies REAL code in app ----
  const rgG = await L.api(G.buyer.token, 'POST', `/api/v1/orders/${G.orderId}/regenerate-delivery-code`).catch(e => ({ status: 'ERR:' + e.message }));
  const REAL_G = rgG.json && rgG.json.deliveryCode ? String(rgG.json.deliveryCode) : '';
  atk('B1-buyer-regen-clears-lock-and-resets-counter', rgG.status === 200 && /^\d{6}$/.test(REAL_G) && Number(dbAttempts(G.orderId)) === 0 ? 'HELD' : 'BROKEN',
    `status=${rgG.status} newCode=${REAL_G} dbAttemptsNow=${dbAttempts(G.orderId)}`);

  const cS2 = await L.newCtx(bS, { viewport: { width: 768, height: 1024 }, videoPath: 'e2e/videos/au039sk14-seller-realcode-768.webm' });
  const ps2 = await cS2.newPage(); wireNet(ps2);
  await loginAs(ps2, G.seller.email, G.seller.pw);
  await ps2.evaluate(() => { window.location.hash = '#/orders'; }).catch(() => {});
  await sleep(6500);
  await tap(ps2, 'Selling', 2, 2200);
  await tap(ps2, G.orderNumber, 4, 2400);
  await tap(ps2, 'Track delivery', 4, 4200);
  const s2t = await txt(ps2);
  atk('B2-tablet-handover-card', s2t.includes('Delivery handover') ? 'HELD' : 'BROKEN', `tablet 768 handover card=${s2t.includes('Delivery handover')}`);
  await L.screenshot(ps2, `${SHOTS}/sk14r3-07-tablet-handover.png`);
  const typedReal = await typeCode(ps2, REAL_G);
  await tap(ps2, 'Verify delivery', 3, 3000);
  const okCall = [...R.apiResponses].reverse().find(a => a.line.includes('/verify-delivery'));
  const Grow = dbRow(G.orderId);
  const [stG, fulG, dlG, methG] = Grow.split('|');
  atk('B3-correct-code-in-app-DELIVERED-OTP', stG === 'DELIVERED' && methG.trim() === 'OTP' ? 'HELD' : 'BROKEN',
    `typedExact=${typedReal === REAL_G} call=${(okCall && okCall.line) || 'NONE'} body=${JSON.stringify((okCall && okCall.body) || {}).slice(0, 130)} DB=${Grow}`);
  await L.screenshot(ps2, `${SHOTS}/sk14r3-08-verified-real.png`);
  const afterOk = await txt(ps2);
  let hoursG = null;
  if (fulG !== 'NULL' && dlG !== 'NULL') hoursG = Math.abs((new Date(dlG.replace(' ', 'T') + 'Z') - new Date(fulG.replace(' ', 'T') + 'Z')) / 3600000);
  atk('A8-deadline-48h-after-app-OTP-verify', (stG === 'DELIVERED' && fulG !== 'NULL' && dlG !== 'NULL' && Math.abs(hoursG - 48) < 1.5 && methG.trim() === 'OTP') ? 'HELD' : 'BROKEN',
    `fulfilledAt=${fulG} confirmationDeadline=${dlG} delta=${hoursG === null ? 'n/a' : hoursG.toFixed(2) + 'h'} method=${methG} appStillShowsCode=${afterOk.includes(REAL_G)}`);
  await cS2.close();

  // ================= BUYER leg on fresh order H =================
  const H = await mintOrder('h');
  fs.writeFileSync('/tmp/au039sk14_H.json', JSON.stringify(H, null, 2));
  const bB = await L.newBrowser();
  const cB = await L.newCtx(bB, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/au039sk14-buyer-r3.webm' });
  const pb = await cB.newPage(); wireNet(pb);
  atk('C0-buyer-login', (await loginAs(pb, H.buyer.email, H.buyer.pw)) ? 'HELD' : 'BROKEN', 'buyer r3 login');
  await pb.evaluate(() => { window.location.hash = '#/orders'; }).catch(() => {});
  await sleep(6500);
  let bt = await txt(pb);
  if (!bt.includes(H.orderNumber)) { await tap(pb, 'Buying', 2, 2200); bt = await txt(pb); }
  const detailOpen = await tap(pb, H.orderNumber, 4, 2400);
  bt = await txt(pb);
  atk('C1-detail-shows-code-IN_TRANSIT', detailOpen && bt.includes(H.code) ? 'HELD' : 'BROKEN',
    `detailOpen=${!!detailOpen} detailShowsCode=${bt.includes(H.code)} (${H.orderNumber})`);
  await L.screenshot(pb, `${SHOTS}/sk14r3-09-detail-code.png`);
  const trkB = await tap(pb, 'Track delivery', 4, 4200);
  bt = await txt(pb);
  atk('C2-buyer-code-card-no-seller-input', trkB && bt.includes(H.code) && !bt.includes('Enter the 6-digit code') ? 'HELD' : 'BROKEN',
    `trackTap=${!!trkB} codeShown=${bt.includes(H.code)} sellerInputLeak=${bt.includes('Enter the 6-digit code')} selfConfirmPresent=${bt.toLowerCase().includes('i received the items')}`,
    [`${SHOTS}/sk14r3-10-buyer-card.png`]);
  await L.screenshot(pb, `${SHOTS}/sk14r3-10-buyer-card.png`);

  // C3 double-tap regenerate
  const nbRgB = R.network.length;
  const hG = await findAny(pb, 'Generate a new code');
  if (hG) { await pb.mouse.click(Math.min(hG.x, 360), Math.min(hG.y, 660)); await pb.mouse.click(Math.min(hG.x, 360), Math.min(hG.y, 660)); }
  await sleep(3400);
  const rgBCalls = netFor('/regenerate-delivery-code').slice(nbRgB);
  const rgBOk = R.apiResponses.filter(a => a.line.includes('/regenerate-delivery-code') && a.line.includes('-> 2'));
  const codes = rgBOk.map(a => a.body && a.body.deliveryCode).filter(Boolean);
  const cNow = await L.api(H.buyer.token, 'GET', `/api/v1/orders/${H.orderId}`);
  const NEW_H = String(cNow.json.deliveryCode || '');
  const bAfter = await txt(pb);
  atk('C3-doubletap-buyer-regenerate', rgBCalls.length === 1 && NEW_H && bAfter.includes(NEW_H) && !bAfter.includes(H.code) ? 'DISPUTED'
    : (rgBCalls.length >= 1 && NEW_H && bAfter.includes(NEW_H) ? 'DISPUTED' : 'BROKEN'),
    `double-tap fired ${rgBCalls.length} POST(s)[${rgBCalls.join('|')}] distinctCodes=${codes.length} serverNow=${NEW_H} appPaintsNew=${bAfter.includes(NEW_H)} oldPainted=${bAfter.includes(H.code)}`);
  await L.screenshot(pb, `${SHOTS}/sk14r3-11-regenerated.png`);

  // C4 out-of-order self-confirm FIRST (driver never got any code)
  const nbCf = R.network.length;
  await tap(pb, 'I received the items', 2, 3000);
  const cfCalls = netFor('/confirm-delivery').slice(nbCf);
  const cfBody = [...R.apiResponses].reverse().find(a => a.line.includes('/confirm-delivery'));
  const Hrow = dbRow(H.orderId);
  const [stH, fulH, dlH, methH] = Hrow.split('|');
  let hoursH = null;
  if (fulH !== 'NULL' && dlH !== 'NULL') hoursH = Math.abs((new Date(dlH.replace(' ', 'T') + 'Z') - new Date(fulH.replace(' ', 'T') + 'Z')) / 3600000);
  atk('C4-outoforder-selfconfirm-first-allowed', stH === 'DELIVERED' && methH.trim() === 'BUYER_BUTTON' ? 'DISPUTED' : 'BROKEN',
    `selfConfirm calls=${cfCalls.length} DB=${Hrow} (buyer can end the escrow without the OTP ever being used — parity question vs reference)`);
  let deadlineH = stH === 'DELIVERED' && fulH !== 'NULL' && dlH !== 'NULL' && Math.abs(hoursH - 48) < 1.5;
  atk('C5-deadline-48h-BUYER_BUTTON-path', deadlineH ? 'HELD' : 'BROKEN',
    `fulfilledAt=${fulH} confirmationDeadline=${dlH} delta=${hoursH === null ? 'n/a' : hoursH.toFixed(2) + 'h'}`);
  await L.screenshot(pb, `${SHOTS}/sk14r3-12-selfconfirmed.png`);
  await cB.close();

  await bS.close(); await bB.close();
  fs.writeFileSync('/tmp/au039sk14_r3_result.json', JSON.stringify(R, null, 2));
  const held = R.attacks.filter(a => a.result === 'HELD').length, broken = R.attacks.filter(a => a.result === 'BROKEN').length, disp = R.attacks.filter(a => a.result === 'DISPUTED').length;
  console.log(`\nR3 DONE: HELD=${held} BROKEN=${broken} DISPUTED=${disp}`);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
