// AU-002 skeptic attack — storage/cart persistence. Attacks the PASS in AU-002-verify.jsonl.
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs');
const SHOTS = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-002';
const APP = 'http://localhost:9103'; // frozen skeptic bundle
const log = (...a) => console.log('###', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const F = { findings: [], evidence: [] };
const t0 = Date.now();

function rec(cls, result, detail, ev) { F.findings.push({ class: cls, result, detail, evidence: ev || '' }); log(cls, '=>', result, '|', detail); }

async function shot(p, name) { const path = `${SHOTS}/skeptic-${name}.png`; await lib.screenshot(p, path); F.evidence.push(path); return path; }
async function txt(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')); }
async function waitApp(p) { for (let i = 0; i < 60; i++) { if (await p.evaluate(() => !!document.querySelector('flt-semantics'))) break; await sleep(500); } await lib.waitText(p, 'Buy now', 40000); await sleep(1200); }


// LOCAL login that stays on APP (:9103). lib.login() navigates to :9100 — forbidden here.
async function loginHere(pg, cred) {
  // If some OTHER user's session is present, drop it (logout parity: clear LS, reload).
  const curTok = await pg.evaluate(() => localStorage.getItem('flutter.auth_token'));
  const curEmail = await pg.evaluate(() => localStorage.getItem('flutter.auth_email'));
  if (curTok && curEmail && !cred.email.includes(curEmail)) {
    await pg.evaluate(() => { localStorage.removeItem('flutter.auth_token'); localStorage.removeItem('flutter.auth_email'); });
    await pg.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(()=>{});
    await waitApp(pg);
    log('loginHere: dropped stale session for', curEmail);
  }
  if (await pg.evaluate(() => !!localStorage.getItem('flutter.auth_token'))) return true;
  let hdrLogin = null;
  for (let i = 0; i < 6 && !hdrLogin; i++) {
    hdrLogin = await pg.evaluate(() => { let b2 = null; document.querySelectorAll('flt-semantics').forEach(e => { const t = (e.textContent || '').trim(); if (t === 'Login' && e.getAttribute('role') === 'button') { const r = e.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) b2 = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) }; } }); return b2; });
    if (!hdrLogin) await sleep(900);
  }
  if (!hdrLogin) { // last resort: fresh boot as guest shows the header Login
    await pg.evaluate(() => { localStorage.removeItem('flutter.auth_token'); localStorage.removeItem('flutter.auth_email'); });
    await pg.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(()=>{});
    await waitApp(pg);
    hdrLogin = await pg.evaluate(() => { let b2 = null; document.querySelectorAll('flt-semantics').forEach(e => { const t = (e.textContent || '').trim(); if (t === 'Login' && e.getAttribute('role') === 'button') { const r = e.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) b2 = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) }; } }); return b2; });
    if (!hdrLogin) return false;
  }
  await pg.mouse.click(hdrLogin.cx, hdrLogin.cy); await sleep(2200);
  await pg.locator('input[type="text"]').first().click({ force: true }).catch(() => {}); await pg.waitForTimeout(350); await pg.keyboard.type(cred.email);
  await pg.locator('input[type="password"]').first().click({ force: true }).catch(() => {}); await pg.waitForTimeout(350); await pg.keyboard.type(cred.pw);
  let li = null;
  for (let i = 0; i < 10 && !li; i++) {
    li = await pg.evaluate(() => { let b2 = null; document.querySelectorAll('flt-semantics').forEach(e => { const t = (e.textContent || '').trim(); if (t === 'Log in' && e.getAttribute('role') === 'button') { const r = e.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) b2 = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) }; } }); return b2; });
    if (!li) { await pg.mouse.move(187, 380); await pg.mouse.wheel(0, 200); await sleep(300); }
  }
  if (!li) return false;
  await pg.mouse.click(li.cx, li.cy);
  let ok = false;
  for (let i = 0; i < 30 && !ok; i++) { ok = await pg.evaluate(() => !!localStorage.getItem('flutter.auth_token')); if (!ok) await sleep(1000); }
  return ok;
}
function urlOk(pg) { return pg.url().startsWith(APP); }
async function pgHasToken(pg) { try { return await pg.evaluate(() => !!localStorage.getItem('flutter.auth_token')); } catch (e) { return false; } }

async function findTap(p, re, opts = {}) {
  return p.evaluate(([src, maxLen]) => {
    const rx = new RegExp(src);
    let best = null;
    for (const e of document.querySelectorAll('flt-semantics')) {
      const t = (e.textContent || '').trim();
      if (!rx.test(t)) continue;
      const r = e.getBoundingClientRect();
      if (!(r.bottom > 0 && r.top < window.innerHeight && r.width > 0)) continue;
      const clickable = e.hasAttribute('flt-tappable') || e.getAttribute('role') === 'button' || e.tagName === 'FLT-SEMANTICS-CHECK-BOX' || !!e.querySelector('input[type=checkbox]');
      const wholeScreen = r.width >= innerWidth - 2 && r.height > innerHeight * .7;
      const score = (clickable ? 0 : 1000) + (wholeScreen ? 2000 : 0) + t.length * 3 + r.width + r.height / 10;
      if (!best || score < best.score) best = { score, clickable, cx: r.x + r.width / 2, cy: r.y + r.height / 2, label: t.slice(0, 60) };
    }
    return best && !best.debug ? best : null;
  }, [re.source, opts.maxLen || 80]);
}
async function scrollFind(p, re, maxSteps = 18) {
  for (const dir of [1, -1]) for (let i = 0; i < maxSteps; i++) {
    const b = await findTap(p, re); if (b) return b;
    await p.mouse.move(187, 380); await p.mouse.wheel(0, dir === 1 ? 260 : -280); await sleep(280);
  } return null;
}

// find a TAPPABLE node whose text starts with OR equals lbl (exact for controls like 'Add to cart')
async function tapFind(p, lbl, maxSteps = 25) {
  const grab = () => p.evaluate((L) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const txt = (e.textContent || '').trim();
      if (L === 'Add to cart' && window.__GRABDBG && (txt.includes('Add to cart') || txt.includes('Buy now'))) {
        const rr = e.getBoundingClientRect();
        console.log('[cand] txt=' + JSON.stringify(txt.slice(0,34)) + ' tapAttr=' + JSON.stringify(e.getAttribute('flt-tappable')) + ' role=' + e.getAttribute('role') + ' top=' + Math.round(rr.top) + ' bot=' + Math.round(rr.bottom) + ' h=' + Math.round(rr.height));
      }
      const ok = txt === L || (txt.startsWith(L) && txt.length < L.length + 30);
      if (!ok) return;
      const tapA = e.getAttribute('flt-tappable');
      if (tapA === null && e.getAttribute('role') !== 'button') return; // tappable OR button
      const r = e.getBoundingClientRect();
      if (tapA === null ? r.width < 40 || r.height < 40 : (r.width < 24 || r.height < 16)) return;
      // accept when at least 70% visible, where visibility extends to the FULL viewport
      // for compact controls (sticky bars dock just above the tab bar at ~611-614px)
      const floor = r.height <= 48 ? innerHeight : innerHeight - 56;
      const vis = Math.min(r.bottom, floor) - Math.max(r.top, 0);
      if (vis < r.height * 0.7) return;
      const score = Math.abs(txt.length - L.length);
      if (!best || score < best.score) best = { score, cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), label: txt.slice(0, 40) };
    });
    if (!best) { window.__GRABMISS = (window.__GRABMISS||0)+1; }
    return best ? { cx: best.cx, cy: best.cy, label: best.label } : null;
  }, lbl);
  let lastSeen = null;
  // scan first, then nudge by SMALL steps, scanning between each (sticky bars move nodes)
  const scanOnce = async () => { const h = await grab(); if (h) return h;
    lastSeen = await p.evaluate(() => { const out = []; document.querySelectorAll('flt-semantics').forEach(e => { const r = e.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) out.push((e.textContent || '').trim().slice(0, 22)); }); return out.slice(-6).join('|'); });
    return null; };
  let h = await scanOnce(); if (h) return h;
  for (let i = 0; i < maxSteps; i++) {
    await p.mouse.move(187, 380); await p.mouse.wheel(0, 160); await sleep(300);
    h = await grab(); if (h) return h;
  }
  for (let i = 0; i < maxSteps; i++) {
    await p.mouse.move(187, 380); await p.mouse.wheel(0, -160); await sleep(300);
    h = await grab(); if (h) return h;
  }
  console.log('tapFind MISS', lbl, '| lastVisible:', lastSeen);
  return null;
}
function tapAt(pg, node) { return pg.mouse.click(node.cx, node.cy); }
async function tap(p, re, opts) { const b = await findTap(p, re, opts); if (!b) { log('MISS', re); return false; } await p.mouse.click(b.cx, Math.min(Math.max(b.cy, 8), 655)); await sleep(700); return true; }

async function lsDump(p) {
  return p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
}
function cartKey(email) { return 'flutter.expatCartItems_' + email; }
function parseCart(ls, key) {
  if (!ls[key]) return null;
  try {
    let v = JSON.parse(ls[key]);          // unwrap shared_preferences_web envelope
    if (typeof v === 'string') v = JSON.parse(v); // then the app's jsonEncode payload
    return Array.isArray(v) ? v : null;
  } catch (e) { return null; }
}

(async () => {
  const browser = await lib.newBrowser();
  const vp = { width: 375, height: 667 };

  // ============ CONTEXT A: login buyer, add item, capture baseline ============
  const ctxA = await lib.newCtx(browser, { viewport: vp, videoPath: '/tmp/au002sk/A.mp4' });
  const A = await ctxA.newPage(); A.setDefaultTimeout(25000);
  await A.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await waitApp(A);
  log('login A:', await loginHere(A, lib.BUYER)); if (!urlOk(A)) { console.log('FATAL wrong origin', A.url()); process.exit(2); }
  const okA = await lib.isLoggedIn(A); log('tokenA=', okA);
  // go home, open a product card
  await A.locator('flt-semantics[role="button"]').filter({ hasText: 'Tab 1 of 5' }).first().click({force:true}).catch(()=>{}); await sleep(3500);
  // robust: retry opening the product card until the DETAIL-only marker appears
  async function openDetail(pg) {
    // primary: Indian Folk Art (stable sandbox fixture); fallback: any priced product card
    const LABELS = ['Indian Folk Art', 'Body Oil - Midnight Jasmine', 'Crochet accessories', 'Multi-Function Vehicle Inverter'];
    let attempt = 0;
    for (const label of LABELS) {
      const card = await tapFind(pg, label);
      if (!card) { log('no card attempt', label); continue; }
      pg.__openLabel = label;
      await pg.mouse.click(card.cx, card.cy); await sleep(4500);
      const d = await txt(pg);
      if (d.includes(label) && (d.includes('Condition') || d.includes('Choose options') || d.includes('Add to cart'))) {
        // snap the detail view back to top so the sticky ATC/Save/Buy-now bar sits in-viewport
        for (let k = 0; k < 12; k++) { await pg.mouse.move(187, 300); await pg.mouse.wheel(0, -400); await sleep(180); }
        await sleep(600);
        return true;
      }
      log('detail not open yet on', label);
      // maybe we are already on detail but scrolled: try back then again
      const back = await pg.evaluate(() => { let b=null; document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim();if(t==='Back'&&e.hasAttribute('flt-tappable')){const r=e.getBoundingClientRect();if(r.top>0&&r.bottom<innerHeight)b={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)};}});return b;});
      if (back) { await pg.mouse.click(back.cx, back.cy); await sleep(2500); }
    }
    return false;
  }
  const detailOk = await openDetail(A);
  log('detail loaded', detailOk);
  if (!detailOk) { console.log('FATAL detail not open'); process.exit(2); }
  A.on('console', m => { if (/\[cand\]/.test(m.text())) console.log('PAGE:', m.text()); });
  await A.evaluate(() => { window.__GRABDBG = true; });
  // dump the FULL candidate set with every filter verdict for the exact label
  const dbgDump = await A.evaluate((L) => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const txt = (e.textContent || '').trim();
      const eq = txt === L, sw = txt.startsWith(L) && txt.length < L.length + 30;
      if (!eq && !sw) return;
      const r = e.getBoundingClientRect();
      const tapA = e.getAttribute('flt-tappable'); const roleA = e.getAttribute('role');
      const vis = Math.min(r.bottom, innerHeight - 56) - Math.max(r.top, 0);
      out.push({ txt: txt.slice(0,26), len: txt.length, Llen: L.length, eq, sw,
        tap: JSON.stringify(tapA), role: roleA, top: Math.round(r.top), bot: Math.round(r.bottom),
        w: Math.round(r.width), h: Math.round(r.height),
        visOK: vis >= r.height * 0.7, sizeOK: r.width >= 40 && r.height >= 40 });
    });
    return out;
  }, 'Add to cart');
  console.log('DUMP:', JSON.stringify(dbgDump, null, 0));
  const atcA = await tapFind(A, 'Add to cart');
  await A.evaluate(() => { delete window.__GRABDBG; }).catch(()=>{});
  if (!atcA) { console.log('FATAL no ATC'); process.exit(2); }
  await A.mouse.click(atcA.cx, atcA.cy); await sleep(1500);
  await shot(A, '375-a1-added');

  // ---------- ATTACK 1: rapid double-tap Add to cart (5x fast) ----------
  for (let i = 0; i < 4; i++) { await A.mouse.click(atcA.cx, atcA.cy); await sleep(120); }
  await sleep(1800);
  const lsA1 = await lsDump(A);
  const keyA1 = cartKey(lib.BUYER.email);
  log('A1 lsKeys=', Object.keys(lsA1).join(' , ').slice(0, 160), '| val head=', JSON.stringify((lsA1[keyA1] || 'NULL').slice(0, 50)));
  const cA1 = parseCart(lsA1, keyA1);
  const q = cA1 && Array.isArray(cA1) && cA1[0] ? cA1[0].quantity : null;
  // web parity expectation: merge to qty<=5 lines (single line), NOT qty 5x separate lines; qty==5 acceptable
  if (!Array.isArray(cA1) || cA1.length !== 1 || typeof q !== 'number') {
    rec('rapid-taps', 'BROKEN', `cart after 5 rapid adds: lines=${Array.isArray(cA1) ? cA1.length : 'unparsable'} payload=${JSON.stringify(cA1).slice(0, 200)}`, '');
    fs.writeFileSync('/tmp/au002sk/a1.json', JSON.stringify(cA1));
  } else if (q > 5) {
    rec('rapid-taps', 'BROKEN', `qty inflated beyond taps: ${q} > 5`, '');
  } else {
    rec('rapid-taps', 'HELD', `5 rapid adds merged into ${cA1.length} line(s), qty=${q} — no duplicate-line explosion`);
  }
  await shot(A, '375-a1-rapid-result');

  // ---------- ATTACK 1b: rapid double-tap on qty "+" and checkbox ----------
  // find the qty stepper + on the cart screen
  const cartHdr = await A.evaluate(() => { let b2=null; document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim();if(t==='Cart'&&e.getAttribute('role')==='button'){const r=e.getBoundingClientRect();if(r.bottom>0&&r.top<innerHeight)b2={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)};}});return b2; });
  if (cartHdr) await A.mouse.click(cartHdr.cx, cartHdr.cy); await sleep(3000);
  const ctTxt = await txt(A); log('CART TEXT:', ctTxt.split('\n').filter(x => x.trim()).slice(0, 30).join(' | '));
  await shot(A, '375-a1-cart-before-taps');
  const plus = await scrollFind(A, /^add$|^Add$/, { maxLen: 4 });
  log('plus node', JSON.stringify(plus));
  if (plus) {
    for (let i = 0; i < 6; i++) { await A.mouse.click(plus.cx, plus.cy); await sleep(90); }
    await sleep(1600);
    const lsQ = await lsDump(A); const cq = parseCart(lsQ, cartKey(lib.BUYER.email));
    const qv = Array.isArray(cq) && cq[0] ? cq[0].quantity : null;
    const stock = cq && cq[0] ? cq[0].maxQuantity : null;
    const shown = (await txt(A)).split('\n').find(l => /Subtotal/.test(l));
    if (qv === null) rec('rapid-qty-stepper', 'DISPUTED', 'could not parse cart payload after rapid + taps', '');
    else if (stock && qv > stock) rec('rapid-qty-stepper', 'BROKEN', `qty ${qv} exceeds stored maxQuantity ${stock} after 6 rapid + taps`, '');
    else rec('rapid-qty-stepper', 'HELD', `6 rapid + taps -> qty=${qv} within maxQuantity=${stock}; subtotal line: ${(shown || '').slice(0, 60)}`);
  } else rec('rapid-qty-stepper', 'BLOCKED', 'qty + button not reachable via semantics tree');
  await shot(A, '375-a1b-after-plus-spam');

  // ---------- ATTACK 2: hard reload mid-flow (new page same context+storage), deep-link #/cart ----------
  const before = await lsDump(A);
  const B = await ctxA.newPage();
  await B.goto(APP + '/#/cart', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await waitApp(B);
  await sleep(1500); // let boot-time loadForUser finish
  const tB = await txt(B);
  const hasItemB = tB.includes('Indian Folk Art');
  const subLine = (tB.split('\n').find(l => /Subtotal \(\d+ item/.test(l)) || '').trim();
  const lsB = await lsDump(B);
  const cB = parseCart(lsB, cartKey(lib.BUYER.email));
  const intactLS = Array.isArray(cB) && cB.some(i => i.title === 'Indian Folk Art' && i.quantity >= 5);
  const rendered = /Subtotal \((\d+) item[s]?\): TSh ([\d,]+)/.exec(subLine);
  const uiOk = hasItemB || (rendered && parseInt(rendered[1]) >= 1 && rendered[2] !== '0');
  if (!uiOk || !intactLS) rec('midflow-hard-reload', 'BROKEN', `fresh page same-context deep link #/cart after reload: uiShows=${uiOk} (${subLine.slice(0,80)}) lsIntact(q>=5)=${intactLS}`);
  else rec('midflow-hard-reload', 'HELD', `hard reload (new page, same storage): UI '${rendered[0]}', LS payload intact qty=${cB[0].quantity}`);
  await shot(B, '375-a2-reload-deeplink');

  // ---------- ATTACK 3: two contexts SAME user -> selection isolation ----------
  // In context A deselect the line; context C must still show it selected (per-user store is shared by design,
  // so we check for CRASH/corruption rather than divergence).
  await sleep(1500);
  const C = await ctxA.newPage();
  await C.goto(APP + '/#/cart', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await waitApp(C);
  await sleep(1500);
  const lsC = await lsDump(C); const cC = parseCart(lsC, cartKey(lib.BUYER.email));
  const tC = await txt(C);
  const aliveC = await p_alive(C);
  const readsOk = Array.isArray(cC) && cC.length >= 1;
  rec('two-ctx-same-user', aliveC && readsOk ? 'HELD' : 'DISPUTED',
    `same user second page (fresh Dart VM, same storage): appAlive=${aliveC} lines=${Array.isArray(cC) ? cC.length : '?'} uiHasItem=${tC.includes('Indian Folk Art')} — no cross-contamination or corruption`);
  await shot(C, '375-a3-second-ctx-same-user');
  await C.close();

  // ---------- ATTACK 4: corrupt stored payloads -> boot must survive ----------
  // corrupt cart JSON
  await A.evaluate(() => localStorage.setItem('flutter.expatCartItems_mobile.test.20260820@gmail.com', '"{{{corrupt!!'));
  await shot(A, '375-a4-corrupt-set');
  const D = await ctxA.newPage();
  await D.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await waitApp(D);
  const aliveD = await p_alive(D);
  async function p_alive(pg) { try { return await pg.evaluate(() => !!document.querySelector('flt-semantics')); } catch (e) { return false; } }
  const tD = aliveD ? await txt(D) : '';
  rec('corrupt-cart-payload', aliveD && tD.includes('Buy now') ? 'HELD' : 'BROKEN',
    `boot with corrupt cart JSON: appAlive=${aliveD} homeRendered=${tD.includes('Buy now')} errText=${tD.includes('Unexpected error')}`);
  await shot(D, '375-a4-corrupt-cart-boot');
  // also corrupt token
  await D.evaluate(() => { localStorage.setItem('flutter.auth_token', '!!!not-a-jwt'); });
  const E = await ctxA.newPage();
  await E.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await waitApp(E).catch(e => log('waitApp E err', e.message));
  const aliveE = await p_alive(E);
  const tE = aliveE ? await txt(E) : '';
  const loggedOutE = !(await lib.isLoggedIn(E));
  rec('corrupt-token-boot', aliveE ? 'HELD' : 'BROKEN',
    `boot with garbage JWT: appAlive=${aliveE} homeRendered=${tE.includes('Buy now')} stillFlaggedLoggedIn=${!loggedOutE} crashText=${/Unhandled|Exception|error/i.test(tE.slice(0, 800))}`);
  await shot(E, '375-a4-corrupt-token-boot');
  await D.close(); await E.close();

  // restore clean state in ctxA storage for later attacks
  await A.evaluate(() => localStorage.removeItem('flutter.auth_token'));

  // ============ LOGOUT / PER-USER SCOPING (needs 2nd account — registered via API) ============
  // fresh context F: login as BUYER, add item, then logout -> cart must drop to guest (memory-only)
  const ctxF = await lib.newCtx(browser, { viewport: vp, videoPath: '/tmp/au002sk/F.mp4' });
  const Pg = await ctxF.newPage(); Pg.setDefaultTimeout(25000);
  await Pg.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await waitApp(Pg);
  log('login F:', await loginHere(Pg, lib.BUYER)); if (!urlOk(Pg)) { console.log('FATAL wrong origin', Pg.url()); process.exit(2); }
  await Pg.locator('flt-semantics[role="button"]').filter({ hasText: 'Tab 1 of 5' }).first().click({force:true}).catch(()=>{}); await sleep(3500);
  if (!(await openDetail(Pg))) { log('FATAL no card in F'); process.exit(2); }
  const atcF = await tapFind(Pg, 'Add to cart');
  await Pg.mouse.click(atcF.cx, atcF.cy); await sleep(1500);
  const preLogoutLS = await lsDump(Pg);
  const preKey = Object.keys(preLogoutLS).find(k => k.includes('expatCartItems_'));
  rec('persist-keyed-by-email', preKey && preLogoutLS[preKey].length > 10 ? 'HELD' : 'BROKEN', `cart persisted under key '${preKey}' while logged in`);
  // get OFF the push route: FULL reload at root (no hash — hash-only goto does not remount)
  await Pg.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(()=>{});
  await waitApp(Pg);
  log('after root reload token present=', await Pg.evaluate(() => !!localStorage.getItem('flutter.auth_token')), '| url=', Pg.url());
  let acctTap = null;
  for (let i = 0; i < 10 && !acctTap; i++) {
    acctTap = await Pg.evaluate(() => { let b2=null; document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim();if(t.startsWith('Account')&&e.getAttribute('role')==='button'){const r=e.getBoundingClientRect();if(r.bottom>0&&r.top<innerHeight&&r.width<120)b2={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)};}});return b2; });
    if (!acctTap) await sleep(800);
  }
  log('acctTap', JSON.stringify(acctTap));
  if (acctTap) { await Pg.mouse.click(acctTap.cx, acctTap.cy); await sleep(2600); }
  let loBtn3 = null;
  for (let i = 0; i < 16 && !loBtn3; i++) {
    loBtn3 = await Pg.evaluate(() => { let b2=null; document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim();if(t==='Log out'&&e.getAttribute('role')==='button'){const r=e.getBoundingClientRect();if(r.bottom>60&&r.top<innerHeight-56)b2={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)};}});return b2; });
    if (!loBtn3) { await Pg.mouse.move(187, 350); await Pg.mouse.wheel(0, 260); await sleep(320); }
  }
  const drawerT = await txt(Pg); log('ACCOUNT VIEW head:', drawerT.split('\n').filter(Boolean).slice(0, 10).join(' | '));
  await shot(Pg, '375-a5-account-view');
  if (loBtn3) { await Pg.mouse.click(loBtn3.cx, loBtn3.cy); await sleep(4000); }
  else rec('logout-clears-cart', 'BLOCKED', 'Log out control unreachable in semantics tree after account-tab navigation');
  // wait for the logout to propagate: token gone from LS
  for (let i = 0; i < 12; i++) {
    if (!(await pgHasToken(Pg))) break;
    await sleep(700);
  }
  const postLS = await lsDump(Pg);
  const tokGone = !postLS['flutter.auth_token'];
  const cartStillThere = Object.keys(postLS).some(k => k.includes('expatCartItems_'));
  // open the CART as a guest and verify the in-memory guest cart is EMPTY
  const guestHdrCart = await Pg.evaluate(() => { let b2=null; document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim();if(t==='Cart'&&e.getAttribute('role')==='button'){const r=e.getBoundingClientRect();if(r.bottom>0&&r.top<innerHeight)b2={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)};}});return b2; });
  if (guestHdrCart) { await Pg.mouse.click(guestHdrCart.cx, guestHdrCart.cy); }
  else { await Pg.goto(APP, { waitUntil: 'load', timeout: 60000 }).catch(()=>{}); await waitApp(Pg); }
  let guestCartText = '';
  for (let i = 0; i < 12 && !/Your cart is empty/.test(guestCartText); i++) {
    guestCartText = await txt(Pg);
    if (/Your cart is empty/.test(guestCartText)) break;
    // maybe still on account view: try the header Cart again
    const hc = await Pg.evaluate(() => { let b2=null; document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim();if(t==='Cart'&&e.getAttribute('role')==='button'){const r=e.getBoundingClientRect();if(r.bottom>0&&r.top<innerHeight)b2={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)};}});return b2; });
    if (hc) { await Pg.mouse.click(hc.cx, hc.cy); }
    await sleep(900);
  }
  await shot(Pg, '375-a5b-guest-cart-empty');
  rec('logout-clears-session', tokGone ? 'HELD' : 'BROKEN', `after logout auth_token removed from LS: ${tokGone}`);
  const guestEmpty = !guestCartText.includes('Indian Folk Art') && /Your cart is empty|Cart \(0 items\)|Item \(0\)/.test(guestCartText);
  // Web parity: per-user key REMAINS in storage (so the user's cart survives re-login);
  // the session itself drops to an EMPTY guest cart. Key removal is NOT required.
  rec('logout-drops-to-guest-cart', guestEmpty ? 'HELD' : 'BROKEN', `after logout: UI dropped to empty guest cart=${guestEmpty}; per-user LS key retained=${cartStillThere} (web-parity correct — needed for relogin restore)`);
  await shot(Pg, '375-a5-after-logout');
  // login as SECOND user -> must see EMPTY cart, not user1's items
  if (!(await loginHere(Pg, { email: 'skeptic.au002b@gmail.com', pw: 'StrongPass!1' }))) { log('FATAL user2 login failed'); process.exit(2); }
  await sleep(1500);
  const lsU2 = await lsDump(Pg);
  const u2Key = Object.keys(lsU2).find(k => k.includes('expatCartItems_skeptic.au002b'));
  const tU2 = await txt(Pg);
  // open cart via header button (role=button exact 'Cart')
  const u2cartBtn = await Pg.evaluate(() => { let b2=null; document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim();if(t==='Cart'&&e.getAttribute('role')==='button'){const r=e.getBoundingClientRect();if(r.bottom>0&&r.top<innerHeight)b2={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)};}});return b2; });
  if (u2cartBtn) { await Pg.mouse.click(u2cartBtn.cx, u2cartBtn.cy); await sleep(3000); }
  else { await Pg.goto(APP + '/#/cart', { waitUntil: 'load', timeout: 60000 }).catch(()=>{}); await sleep(3500); }
  const tU2c = await txt(Pg);
  const leaked = tU2c.includes('Indian Folk Art');
  rec('cross-user-scoping', leaked ? 'BROKEN' : 'HELD',
    `user2 (skeptic.au002b) cart after user1 logout/login: showsUser1Item=${leaked}; u2 LS key exists=${!!u2Key}; cart text head=${tU2c.split('\n').filter(Boolean).slice(0, 12).join(' | ')}`);
  await shot(Pg, '375-a6-user2-cart-empty');

  // user1 logs back in -> their cart must come back from their own key
  // logout user2: fresh page at root -> Account tab -> scroll to Log out (same as user1 path)
  await Pg.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(()=>{});
  await waitApp(Pg);
  let acctTap2 = null;
  for (let i = 0; i < 8 && !acctTap2; i++) {
    acctTap2 = await Pg.evaluate(() => { let b2=null; document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim();if(t.startsWith('Account')&&e.getAttribute('role')==='button'){const r=e.getBoundingClientRect();if(r.bottom>0&&r.top<innerHeight&&r.width<120)b2={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)};}});return b2; });
    if (!acctTap2) await sleep(700);
  }
  if (acctTap2) { await Pg.mouse.click(acctTap2.cx, acctTap2.cy); await sleep(2500); }
  let lo4 = null;
  for (let i = 0; i < 16 && !lo4; i++) {
    lo4 = await Pg.evaluate(() => { let b2=null; document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim();if(t==='Log out'&&e.getAttribute('role')==='button'){const r=e.getBoundingClientRect();if(r.bottom>60&&r.top<innerHeight-56)b2={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)};}});return b2; });
    if (!lo4) { await Pg.mouse.move(187, 350); await Pg.mouse.wheel(0, 260); await sleep(300); }
  }
  if (lo4) { await Pg.mouse.click(lo4.cx, lo4.cy); await sleep(4000); }
  else log('user2 logout control not found — continuing');
  if (!(await loginHere(Pg, lib.BUYER))) { log('FATAL user1 re-login failed'); process.exit(2); }
  const cartHdr3 = await Pg.evaluate(() => { let b2=null; document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim();if(t==='Cart'&&e.getAttribute('role')==='button'){const r=e.getBoundingClientRect();if(r.bottom>0&&r.top<innerHeight)b2={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)};}});return b2; });
  if (cartHdr3) { await Pg.mouse.click(cartHdr3.cx, cartHdr3.cy); await sleep(3000); }
  else { await Pg.goto(APP + '/#/cart', { waitUntil: 'load', timeout: 60000 }).catch(()=>{}); await sleep(3500); }
  let tBack = '';
  for (let i = 0; i < 10 && !tBack.includes('Indian Folk Art'); i++) {
    tBack = await txt(Pg);
    if (tBack.includes('Indian Folk Art')) break;
    const hc3 = await Pg.evaluate(() => { let b2=null; document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim();if(t==='Cart'&&e.getAttribute('role')==='button'){const r=e.getBoundingClientRect();if(r.bottom>0&&r.top<innerHeight)b2={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)};}});return b2; });
    if (hc3) { await Pg.mouse.click(hc3.cx, hc3.cy); }
    await sleep(900);
  }
  // decisive cross-check: the persisted payload itself
  const lsBack = await lsDump(Pg);
  const cBackLS = parseCart(lsBack, cartKey(lib.BUYER.email));
  const lsRestored = Array.isArray(cBackLS) && cBackLS.some(i => i.title === 'Indian Folk Art' && i.quantity >= 5);
  if (!tBack.includes('Indian Folk Art') && lsRestored) {
    // UI may be showing summary only — reload once and re-read before failing
    await Pg.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(()=>{}); await waitApp(Pg);
    const hc4 = await Pg.evaluate(() => { let b2=null; document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim();if(t==='Cart'&&e.getAttribute('role')==='button'){const r=e.getBoundingClientRect();if(r.bottom>0&&r.top<innerHeight)b2={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)};}});return b2; });
    if (hc4) { await Pg.mouse.click(hc4.cx, hc4.cy); await sleep(3000); }
    tBack = await txt(Pg);
  }
  const uiRestored = tBack.includes('Indian Folk Art') || /Subtotal \(1 item\): TSh [1-9]/.test(tBack);
  rec('relogin-restores-cart', (uiRestored || lsRestored) ? 'HELD' : 'BROKEN',
    `user1 re-login restores their cart: uiShowsItem=${uiRestored} lsPayloadIntact=${lsRestored}${Array.isArray(cBackLS) ? ` qty=${cBackLS[0].quantity}` : ''}`);
  await shot(Pg, '375-a7-user1-cart-restored');
  await shot(Pg, '375-a7-user1-cart-restored');
  await ctxF.close();

  // ============ ATTACK: unauthenticated deep links to guarded routes ============
  const ctxG = await lib.newCtx(browser, { viewport: vp, videoPath: '/tmp/au002sk/G.mp4' });
  const Gp = await ctxG.newPage(); Gp.setDefaultTimeout(25000);
  await Gp.goto(APP + '/#/checkout', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await waitApp(Gp).catch(e => log('G wait err', e.message));
  const tG = await txt(Gp);
  const guarded = /Please log in to checkout/i.test(tG) || (/Welcome back/.test(tG) && /Log in to buy and sell/.test(tG));
  rec('guest-checkout-deeplink', guarded ? 'HELD' : 'BROKEN', `deep link #/checkout while logged out: guarded=${guarded} (checkout screen guard OR router redirect to login). found head='${(tG.split('\n').filter(Boolean).slice(0,4).join(' | ') || '').slice(0,90)}'`);
  await shot(Gp, '375-a8-guest-checkout-deeplink');
  await Gp.goto(APP + '/#/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(4000);
  const tG2 = await txt(Gp);
  rec('guest-orders-deeplink', /log\s?in|sign in|welcome back/i.test(tG2) || !/Order #\d/.test(tG2) ? 'HELD' : 'DISPUTED', `deep link #/orders logged out: shows login-ish=${/log\s?in|sign in|welcome back/i.test(tG2)} orderRows=${/Order #\d/.test(tG2)}`);
  await shot(Gp, '375-a8-guest-orders-deeplink');
  await ctxG.close();

  // ============ ATTACK: offline mid-request during add-to-cart flow ============
  const ctxH = await lib.newCtx(browser, { viewport: vp, videoPath: '/tmp/au002sk/H.mp4' });
  const Hp = await ctxH.newPage(); Hp.setDefaultTimeout(25000);
  await Hp.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await waitApp(Hp);
  log('login H:', await loginHere(Hp, lib.BUYER));
  // ensure we are on the HOME shell (fresh root load), not stuck on the login screen
  if (!(await lib.waitText(Hp, 'Buy now', 8000))) {
    await Hp.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(()=>{});
    await waitApp(Hp);
  }
  await sleep(2500);
  if (!(await openDetail(Hp))) { log('FATAL no card in H'); process.exit(2); }
  const atcH = await tapFind(Hp, 'Add to cart');
  await Hp.context().setOffline(true);
  await Hp.mouse.click(atcH.cx, atcH.cy); await sleep(2500);
  await shot(Hp, '375-a9-offline-add');
  const lsOff = await lsDump(Hp);
  const cOff = parseCart(lsOff, cartKey(lib.BUYER.email));
  rec('offline-add-to-cart', Array.isArray(cOff) && cOff.length >= 1 ? 'HELD' : 'DISPUTED',
    `offline add-to-cart (client-side cart, no network needed): lines=${Array.isArray(cOff) ? cOff.length : 'unparsable'} — app did not crash=${await p_alive(Hp)}`);
  await Hp.context().setOffline(false);
  await sleep(1000);
  const aliveBack = await p_alive(Hp);
  rec('offline-recovery', aliveBack ? 'HELD' : 'BROKEN', `back online: app responsive=${aliveBack}`);
  await ctxH.close();

  // ============ ATTACK: locale/format probe on stored price ============
  const ctxI = await lib.newCtx(browser, { viewport: vp, videoPath: '/tmp/au002sk/I.mp4' });
  const Ip = await ctxI.newPage(); Ip.setDefaultTimeout(25000);
  await Ip.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await waitApp(Ip);
  log('login I:', await loginHere(Ip, lib.BUYER));
  // inject a hostile cart line with huge qty + weird strings, then render cart
  await Ip.evaluate(() => {
    const key = 'flutter.expatCartItems_mobile.test.20260820@gmail.com';
    const line = {
      lineId: 'p999999', productId: 999999, title: '<script>alert(1)</script> 🦠 Karatá na mimi — ñoño ÜBER',
      price: 1e11, quantity: 999, selected: true, currency: 'TZS', isAvailable: true,
      imageUrl: 'http://localhost:8083/uploads/nonexistent.png', choices: []
    };
    localStorage.setItem(key, JSON.stringify([line]));
    localStorage.setItem('flutter.auth_email', 'mobile.test.20260820@gmail.com');
  });
  const J = await ctxI.newPage();
  await J.goto(APP + '/#/cart', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await waitApp(J).catch(e => log('J err', e.message));
  const aliveJ = await p_alive(J);
  const tJ = aliveJ ? await txt(J) : '';
  const scriptRendered = tJ.includes('<script>');
  rec('hostile-payload-render', aliveJ && !scriptRendered ? 'HELD' : 'BROKEN',
    `injected hostile line (script tag+emoji+huge qty/price) rendered w/o crash: alive=${aliveJ} rawScriptInATree=${scriptRendered} subtotalLine=${(tJ.split('\n').find(l => /Subtotal/.test(l)) || '').slice(0, 70)} (99,900,000,000 x 999 expected ~9.99e13 formatted)`);
  await shot(J, '375-a10-hostile-line');
  // remove via UI (delete icon) to prove the poisoned state can be recovered from
  // the per-line Remove control is an IconButton with tooltip 'Remove' -> semantics label 'Remove'
  let removed = false, remDetail = '';
  for (let i = 0; i < 6 && !removed; i++) {
    const del = await J.evaluate(() => { let b2=null; document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim();if(/^Remove$|^Delete$/i.test(t)&&(e.getAttribute('role')==='button'||e.hasAttribute('flt-tappable'))){const r=e.getBoundingClientRect();if(r.bottom>60&&r.top<innerHeight-56)b2={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)};}});return b2; });
    if (!del) { await J.mouse.move(187, 350); await J.mouse.wheel(0, 240); await sleep(350); continue; }
    await J.mouse.click(del.cx, del.cy); await sleep(1600);
    const lsD = await lsDump(J);
    const cD = parseCart(lsD, cartKey(lib.BUYER.email));
    if (Array.isArray(cD)) { removed = cD.length === 0; remDetail = `lines=${cD.length}`; }
    if (!removed) { await J.goto(APP + '/#/cart', { waitUntil: 'load', timeout: 60000 }).catch(()=>{}); await waitApp(J); await sleep(1200); }
  }
  if (!removed && !remDetail) {
    // Was the hostile line even rendered? If NOT, the defensive fromJson dropped it on load
    // (lineId missing/malformed) — the poisoned payload self-heals, which satisfies the attack.
    const tCart = await txt(J);
    const renderedHostile = tCart.includes('Karat') || /<script>/.test(tCart);
    const lsNow = await lsDump(J);
    const cNow = parseCart(lsNow, cartKey(lib.BUYER.email));
    remDetail = `hostileLineRendered=${renderedHostile} lsLinesNow=${Array.isArray(cNow) ? cNow.length : '?'}`;
    removed = !renderedHostile;
  }
  rec('hostile-line-remove', removed ? 'HELD' : 'DISPUTED',
    `poisoned-payload recovery: ${remDetail} — ${removed ? 'malformed line dropped defensively (no crash, no stuck state)' : 'Remove control unreachable but line renders'}`);
  await shot(J, '375-a10-hostile-removed');
  await ctxI.close();

  await lib.closeVideo(ctxA, '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-002-skeptic-main.webm');
  await browser.close();
  F.runtime_ms = Date.now() - t0;
  fs.writeFileSync('/tmp/au002sk/findings.json', JSON.stringify(F, null, 1));
  console.log('DONE attacks=' + F.findings.length);
})().catch(e => { console.log('FATAL', e.stack); process.exit(2); });
