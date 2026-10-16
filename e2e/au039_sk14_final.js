// au039_sk14_final.js — SKEPTIC AU-039 final targeted re-checks (fixture K).
// Re-attacks the 3 r3 BROKEN rows that could plausibly be driver artifacts, using
// L.clickCard (the lib's own tappable clicker, proven in r9) + longer settles:
//   F1 buyer tracking card shows the code (C2 recheck)
//   F2 double-tap buyer regenerate -> exactly how many POSTs? (C3 recheck)
//   F3 seller handover card reachable via Track delivery on the DETAIL screen (S2/B2 recheck)
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';
const SHOTS = 'e2e/shots/AU-039';
const R = { ts: new Date().toISOString(), unit: 'AU-039', stage: 'skeptic-final', attacks: [], network: [], apiResponses: [] };
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
function atk(n, r, d) { R.attacks.push({ attack: n, result: r, detail: String(d).slice(0, 420) }); console.log(`[${r}] ${n} :: ${String(d).slice(0, 220)}`); }
const isLoggedIn = async p => !!(await p.evaluate(() => localStorage.getItem('flutter.auth_token') || '').catch(() => ''));
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
  await sleep(1500); return ok;
}

(async () => {
  const K = JSON.parse(fs.readFileSync('/tmp/au039sk14_K.json', 'utf8'));
  const G = JSON.parse(fs.readFileSync('/tmp/au039sk14_G.json', 'utf8'));

  // ---------- F1/F2 BUYER leg with clickCard ----------
  const bB = await L.newBrowser();
  const cB = await L.newCtx(bB, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/au039sk14-buyer-final.webm' });
  const pb = await cB.newPage(); wireNet(pb);
  atk('F0-login', (await loginAs(pb, K.buyer.email, K.buyer.pw)) ? 'HELD' : 'BROKEN', 'buyer K login');
  await pb.evaluate(() => { window.location.hash = '#/orders'; }).catch(() => {});
  await sleep(7000);
  let t = await txt(pb);
  atk('F0b-list-shows-K', t.includes(K.orderNumber) ? 'HELD' : 'DISPUTED', `${K.orderNumber} in list=${t.includes(K.orderNumber)}`);
  const rowOk = await L.clickCard(pb, K.orderNumber).catch(() => false);
  await sleep(2500);
  t = await txt(pb);
  atk('F1-detail-shows-code', rowOk && t.includes(K.code) ? 'HELD' : 'BROKEN',
    `clickCard(row)=${!!rowOk} detailShowsCode=${t.includes(K.code)} (${K.orderNumber} / ${K.code})`,
    [`${SHOTS}/sk14f-01-detail-code.png`]);
  await L.screenshot(pb, `${SHOTS}/sk14f-01-detail-code.png`);
  const trkOk = await L.clickCard(pb, 'Track delivery').catch(() => false);
  await sleep(4500);
  t = await txt(pb);
  atk('F1b-buyer-tracking-card-code', trkOk && t.includes(K.code) ? 'HELD'
    : (trkOk && (t.includes('Your delivery code') || t.toLowerCase().includes('generate a new code')) ? 'DISPUTED' : 'BROKEN'),
    `clickCard(Track delivery)=${!!trkOk} codeOnTracking=${t.includes(K.code)} cardTitle=${t.includes('Your delivery code')} selfConfirm=${t.toLowerCase().includes('i received the items')}`,
    [`${SHOTS}/sk14f-02-tracking-card.png`]);
  await L.screenshot(pb, `${SHOTS}/sk14f-02-tracking-card.png`);

  // double-tap regenerate with clickBtn
  const nbRg = R.network.length;
  await L.clickBtn(pb, 'Generate a new code').catch(() => {});
  await L.clickBtn(pb, 'Generate a new code').catch(() => {});
  await sleep(3600);
  const rgCalls = netFor('/regenerate-delivery-code').slice(nbRg);
  const rgBodies = R.apiResponses.filter(a => a.line.includes('/regenerate-delivery-code')).slice(-2);
  const codes = rgBodies.map(a => a.body && a.body.deliveryCode).filter(Boolean);
  const cNow = await L.api(K.buyer.token, 'GET', `/api/v1/orders/${K.orderId}`);
  const NEW_K = String(cNow.json.deliveryCode || '');
  const bAfter = await txt(pb);
  atk('F2-doubletap-regenerate-clickbtn', rgCalls.length === 1 ? 'HELD' : 'DISPUTED',
    `${rgCalls.length} POST(s)[${rgCalls.join('|')}] distinctCodes=${codes.length}(${codes.join(',')}) serverNow=${NEW_K} appPaintsNew=${bAfter.includes(NEW_K)} oldPainted=${bAfter.includes(K.code)}`);
  await L.screenshot(pb, `${SHOTS}/sk14f-03-regenerated.png`);
  await cB.close();

  // ---------- F3 SELLER handover-card reachability (order G already DELIVERED — mint check on K's seller is same user as G? no, separate) ----------
  // use order K from the SELLER side: log in as K's seller
  const cS = await L.newCtx(bB, { viewport: { width: 768, height: 1024 }, videoPath: 'e2e/videos/au039sk14-seller-final.webm' });
  const ps = await cS.newPage(); wireNet(ps);
  await loginAs(ps, K.seller.email, K.seller.pw);
  await ps.evaluate(() => { window.location.hash = '#/orders'; }).catch(() => {});
  await sleep(7000);
  let st = await txt(ps);
  if (!st.includes(K.orderNumber)) { await L.clickBtn(ps, 'Selling').catch(() => {}); await sleep(2500); st = await txt(ps); }
  atk('F3a-seller-list-shows-K', st.includes(K.orderNumber) ? 'HELD' : 'DISPUTED', `seller list has ${K.orderNumber}=${st.includes(K.orderNumber)}`);
  const rowS = await L.clickCard(ps, K.orderNumber).catch(() => false);
  await sleep(2500);
  st = await txt(ps);
  const trkS = st.includes('Track delivery') ? await L.clickCard(ps, 'Track delivery').catch(() => false) : null;
  await sleep(4500);
  st = await txt(ps);
  atk('F3b-seller-handover-card', trkS && st.includes('Delivery handover') && st.includes('Verify delivery') ? 'HELD' : 'BROKEN',
    `rowTap=${!!rowS} trackTap=${!!trkS} handoverTitle=${st.includes('Delivery handover')} verifyBtn=${st.includes('Verify delivery')} inputCopy=${st.includes('Enter the 6-digit code')}`,
    [`${SHOTS}/sk14f-04-seller-handover.png`]);
  await L.screenshot(ps, `${SHOTS}/sk14f-04-seller-handover.png`);
  await cS.close();

  await bB.close();
  fs.writeFileSync('/tmp/au039sk14_final_result.json', JSON.stringify(R, null, 2));
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
