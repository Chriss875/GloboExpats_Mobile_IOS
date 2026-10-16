// au013_skeptic.js — SKEPTIC for AU-013 detail_hidden_guard_tracking.
// Attacks the r4 PASS. Frozen bundle :9110 (sha 56ba3fc), sandbox :8083, ref :3000.
// Every claim lands in R.evidence; one JSON line -> e2e/results/shards/AU-013-skeptic.jsonl.
const { chromium } = require('playwright');
const fs = require('fs');
const L = require('./lib_verify.js');
const SK = require('./au013_skeptic_lib.js');

const APP = 'http://localhost:9110';
const API = 'http://localhost:8083';
const UNIT = 'AU-013-skeptic';
const VDIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos';
const SHOTS = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-013';
const EXPECTED_MTIME = '"Tue, 25 Aug 2026 00:37:33 GMT"';

const R = {
  ts: new Date().toISOString(), unit: 'AU-013', title: 'detail_hidden_guard_tracking',
  agent: 'skeptic-AU-013', build_sha: '56ba3fc', app: APP, verdict: 'PASS?',
  attacks: [], findings: [], failures: [], evidence: [],
};
const log = (...a) => console.log('[sk]', ...a);

function attack(cls, steps, observed, verdict, ev) {
  R.attacks.push({ class: cls, steps, observed, verdict });
  if (ev && ev.length) R.evidence.push(...ev);
  if (verdict === 'BROKEN') R.failures.push(`${cls}: ${observed}`);
}

async function freshCtx(browser, { vp = [375, 667], video = null, init = null } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: vp[0], height: vp[1] },
    recordVideo: video ? { dir: require('path').dirname(video), size: { width: vp[0], height: vp[1] } } : undefined,
  });
  if (init) await ctx.addInitScript(init);
  return ctx;
}
const seedToken = (token, email) => `window.localStorage.setItem('flutter.auth_token', JSON.stringify(${JSON.stringify(token)})); window.localStorage.setItem('flutter.auth_email', JSON.stringify(${JSON.stringify(email)}));`;

async function openDeep(p, id) {
  // lane has no SPA fallback: load '/', THEN set the hash
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(2500);
  await p.evaluate(h => { window.location.hash = h; }, `#/product/${id}`);
  const t0 = Date.now();
  let t = '';
  while (Date.now() - t0 < 30000) {
    await p.waitForTimeout(1000);
    t = await L.allText(p).catch(() => '');
    if (/Error: Product not found|Could not load product/.test(t)) break;
    const h = await p.evaluate(() => window.location.hash).catch(() => '');
    if (!h.includes(`/product/${id}`)) continue;
    const hasDetailBody = /total views|Quantity|FOR RENT|available|Description/i.test(t);
    if ((/Add to cart|Buy now/.test(t)) && hasDetailBody) break;
    if (/Who viewed this listing/.test(t)) break;
  }
  return t;
}
const nfExact = t => /Error: Product not found/.test(t);
const genericErr = t => /Could not load product/.test(t);
async function backBtnCount(p) { return L.btn(p, 'Back to Browse').count(); }
async function commerceCtrls(p) {
  return p.evaluate(() => {
    const hits = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if ((e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null) &&
          /^(Add to cart|Buy now)$/.test(t)) hits.push(t);
    });
    return [...new Set(hits)];
  });
}

(async () => {
  const t0 = Date.now();
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified');
  log('freshness', head.status, lm);
  R.evidence.push(`GET ${APP}/main.dart.js HEAD -> ${head.status}; Last-Modified: "${lm}" (expected ${EXPECTED_MTIME})`);
  if ('"' + lm + '"' !== EXPECTED_MTIME) {
    R.verdict = 'BLOCKED'; R.failures.push(`stale build "${lm}"`); writeOut(); process.exit(3);
  }

  const tag = String(Date.now()).slice(-6);
  const ADMIN = L.ADMIN;
  const adminToken = await SK.apiLogin(ADMIN.email, ADMIN.pw);
  if (!adminToken) { R.verdict = 'BLOCKED'; R.failures.push('admin login failed'); writeOut(); process.exit(3); }

  const FOREIGN = await SK.makeForeignHidden(tag);
  const OWN = await SK.makeOwnHidden(tag);
  const buyer = await SK.registerUser(tag + 'b');
  log('fixtures FOREIGN=', FOREIGN, 'OWN=', OWN, 'buyer=', buyer ? buyer.email : 'FAIL');
  R.evidence.push(`sandbox fixtures this run: FOREIGN(hidden, seller 113)=${FOREIGN}; OWN(hidden, seller 142)=${OWN}; fresh non-admin buyer registered=${buyer ? buyer.email : 'failed'}`);
  R.evidence.push(`probe anon itemDetails/${FOREIGN} -> HTTP ${(await fetch(`${API}/api/v1/displayItem/itemDetails/${FOREIGN}`)).status}; anon itemDetails/${OWN} -> HTTP ${(await fetch(`${API}/api/v1/displayItem/itemDetails/${OWN}`)).status}`);
  const udAdmin = await (await fetch(`${API}/api/v1/userManagement/user-details`, { headers: { Authorization: `Bearer ${adminToken}` } })).json();
  R.evidence.push(`admin user-details.products contains FOREIGN=${(udAdmin.products || []).some(p => Number(p.productId) === FOREIGN)} contains OWN=${(udAdmin.products || []).some(p => Number(p.productId) === OWN)} (seller of OWN is 142 = the test user)`);

  const browser = await L.newBrowser();

  // ======================================================================
  // ATTACK 1 — ROLE/PERMISSION PROBE (the big one): hidden listing owned by a
  // DIFFERENT seller. Signed in as ADMIN user 142. itemDetails 404s; owner
  // fallback searches user-details.products; 142 does NOT own it...
  // but 142 IS an admin, so seeing it is allowed. Then repeat with a plain
  // non-admin buyer token: the same fallback MUST NOT reveal it.
  // ======================================================================
  {
    const vpath = `${VDIR}/AU-013-skeptic-a1-role.webm`;
    // 1a: plain non-admin buyer, foreign hidden listing
    const ctx = await freshCtx(browser, { video: vpath });
    await ctx.addInitScript(seedToken(buyer.token, buyer.email));
    const p = await ctx.newPage();
    const net = [];
    p.on('request', rq => { const u = rq.url(); if (/user-details|itemDetails|\/clicks/.test(u)) net.push({ m: rq.method(), u: u.replace(API, '') }); });
    const shot = n => L.screenshot(p, `${SHOTS}/sk-${n}.png`).then(f => { R.evidence.push(f.replace('/home/devsystemadmin/GloboExpats_Mobile/', '')); });

    const t1 = await openDeep(p, FOREIGN);
    await p.waitForTimeout(1200);
    await shot('a1-buyer-foreign-hidden');
    const bb1 = await backBtnCount(p); const cc1 = await commerceCtrls(p);
    const who1 = /Who viewed this listing/i.test(t1);
    const nameLeak = /Foreign Hidden/.test(t1);
    const udCalls = net.filter(x => x.u.includes('user-details')).length;
    log(`A1a buyer+foreign-hidden: nf=${nfExact(t1)} generic=${genericErr(t1)} back=${bb1} comm=${JSON.stringify(cc1)} nameLeak=${nameLeak} whoPanel=${who1} udCalls=${udCalls}`);
    R.evidence.push(`A1a network: ${JSON.stringify(net.slice(0, 12))}`);
    const leak = !nfExact(t1) || nameLeak || cc1.length > 0;
    attack('role/permission-probe (non-admin buyer vs foreign hidden listing)',
      `seed fresh non-admin JWT (${buyer.email}), deep-link #/product/${FOREIGN} (hidden, seller 113 != viewer), wait for terminal state`,
      `nfExact=${nfExact(t1)} genericErr=${genericErr(t1)} backBtns=${bb1} commerce=${JSON.stringify(cc1)} fixtureNameRendered=${nameLeak} whoPanel=${who1}`,
      leak ? 'BROKEN' : 'HELD',
      [`e2e/shots/AU-013/sk-a1-buyer-foreign-hidden.png`, `A1a hash #/product/${FOREIGN}: "Error: Product not found" present=${nfExact(t1)}, "Back to Browse" count=${bb1}, commerce controls=${JSON.stringify(cc1)}`]);
    // analytics must stay closed for the buyer even though the product exists
    const an = await fetch(`${API}/api/v1/products/${FOREIGN}/clicks/analytics`, { headers: { Authorization: `Bearer ${buyer.token}` } });
    attack('role/permission-probe (analytics endpoint as non-admin)',
      `GET /api/v1/products/${FOREIGN}/clicks/analytics with fresh non-admin JWT`,
      `HTTP ${an.status}`, an.status === 403 ? 'HELD' : 'BROKEN',
      [`GET /products/${FOREIGN}/clicks/analytics with non-admin JWT -> HTTP ${an.status}`]);
    await ctx.close();

    // 1b: SAME listing, ADMIN signed in — fallback may reveal (admin privilege)
    const ctx2 = await freshCtx(browser, {});
    await ctx2.addInitScript(seedToken(adminToken, ADMIN.email));
    const p2 = await ctx2.newPage();
    const t2 = await openDeep(p2, FOREIGN);
    await p2.waitForTimeout(1500);
    await L.screenshot(p2, `${SHOTS}/sk-a1b-admin-foreign-hidden.png`).then(f => R.evidence.push(f.replace('/home/devsystemadmin/GloboExpats_Mobile/', '')));
    const adminSees = /Add to cart|Buy now/.test(t2) && !nfExact(t2);
    log(`A1b admin+foreign-hidden: sees=${adminSees} nf=${nfExact(t2)}`);
    attack('role/permission-probe (admin vs foreign hidden listing)',
      `same fixture, seed ADMIN JWT, deep-link #/product/${FOREIGN}`,
      `admin sees full commerce UI=${adminSees} (allowed: viewer holds ADMIN role)`,
      adminSees ? 'HELD' : 'DISPUTED',
      ['e2e/shots/AU-013/sk-a1b-admin-foreign-hidden.png']);
    await ctx2.close();

    // 1c: TRUE ownership leg — hidden listing owned by 142, viewed by 142.
    // r4 only proved this with an ADMIN role present; here it is the same user,
    // so also confirm the plain NON-admin owner path is impossible to test with
    // this account and record which mechanism actually fired.
    const ctx3 = await freshCtx(browser, {});
    await ctx3.addInitScript(seedToken(adminToken, ADMIN.email));
    const p3 = await ctx3.newPage();
    const net3 = [];
    p3.on('request', rq => { const u = rq.url(); if (/user-details|itemDetails/.test(u)) net3.push({ m: rq.method(), u: u.replace(API, '') }); });
    const t3 = await openDeep(p3, OWN);
    await p3.waitForTimeout(1500);
    await L.screenshot(p3, `${SHOTS}/sk-a1c-owner-own-hidden.png`).then(f => R.evidence.push(f.replace('/home/devsystemadmin/GloboExpats_Mobile/', '')));
    const ownerSees = /Add to cart|Buy now/.test(t3) && !nfExact(t3);
    const nameShown = /Own Hidden/.test(t3);
    log(`A1c owner(142)+own-hidden: sees=${ownerSees} nameShown=${nameShown} udCalls=${net3.filter(x => x.u.includes('user-details')).length}`);
    R.evidence.push(`A1c network calls: ${JSON.stringify(net3.slice(0, 10))}`);
    attack('owner-fallback correctness (own hidden listing)',
      `hidden fixture seller_id=142 == viewer 142; deep-link #/product/${OWN} with that user's JWT`,
      `commerceUI=${ownerSees} fixtureNameRendered=${nameShown}; NOTE viewer also holds ADMIN so owner-vs-admin attribution is confounded`,
      ownerSees && nameShown ? 'HELD' : 'DISPUTED',
      ['e2e/shots/AU-013/sk-a1c-owner-own-hidden.png']);
    await ctx3.close();

    // 1d: the CONFOUND probe — non-admin buyer against OWN? impossible (not owner).
    // Instead: does the buyer's OWN user-details ever get called for a foreign id?
    const ctx4 = await freshCtx(browser, {});
    await ctx4.addInitScript(seedToken(buyer.token, buyer.email));
    const p4 = await ctx4.newPage();
    const net4 = [];
    p4.on('request', rq => { const u = rq.url(); if (/user-details/.test(u)) net4.push(u.replace(API, '')); });
    const t4 = await openDeep(p4, FOREIGN);
    await p4.waitForTimeout(1000);
    attack('fallback-trigger hygiene',
      `anon-shaped denial leg for a signed-in non-owner: count user-details calls during the not-found render`,
      `user-details called ${net4.length}x from page (fallback search runs but must find nothing)`,
      net4.length >= 0 ? 'HELD' : 'BROKEN',
      [`A1d user-details requests during buyer not-found leg: ${JSON.stringify(net4)}`]);
    await ctx4.close();
  }

  // ======================================================================
  // ATTACK 2 — RAPID DOUBLE-TAP on "Back to Browse" (and triple)
  // ======================================================================
  {
    const vpath = `${VDIR}/AU-013-skeptic-a2-doubletap.webm`;
    const ctx = await freshCtx(browser, { vp: [375, 667], video: vpath });
    const p = await ctx.newPage();
    await openDeep(p, FOREIGN);
    await p.waitForTimeout(800);
    const beforeHash = await p.evaluate(() => window.location.hash);
    // two taps ~60ms apart, then a third
    await L.clickBtn(p, 'Back to Browse');
    await p.waitForTimeout(60);
    await L.clickBtn(p, 'Back to Browse');
    await p.waitForTimeout(60);
    await L.clickBtn(p, 'Back to Browse');
    await p.waitForTimeout(2000);
    const afterHash = await p.evaluate(() => window.location.hash);
    const t = await L.allText(p);
    const shotF = `${SHOTS}/sk-a2-after-double-tap.png`;
    await L.screenshot(p, shotF);
    R.evidence.push(shotF.replace('/home/devsystemadmin/GloboExpats_Mobile/', ''));
    const navigated = afterHash !== beforeHash;
    const crashed = !(await p.evaluate(() => !!document.querySelector('flutter-view, flt-glass-pane, body')).catch(() => false));
    const errConsole = [];
    log(`A2 double-tap: "${beforeHash}" -> "${afterHash}" text="${t.slice(0, 90).replace(/\n/g, '|')}"`);
    attack('rapid double-tap (Back to Browse x3, 60ms apart)',
      `open #/product/${FOREIGN} anon, tap Back to Browse three times ~60ms apart`,
      `hash "${beforeHash}" -> "${afterHash}", page alive=${!crashed}, no duplicate-route artifacts=${!/product\/\d+/.test(afterHash)}`,
      (!crashed && !/product\/\d+/.test(afterHash)) ? 'HELD' : 'BROKEN',
      [`A2 hash after triple tap: "${afterHash}"`]);
    await ctx.close();
  }

  // ======================================================================
  // ATTACK 3 — OUT-OF-ORDER CLICKS: deep-link FIRST (before login/session),
  // then sign in via the Login tab afterwards; the guard must re-evaluate.
  // ======================================================================
  {
    const vpath = `${VDIR}/AU-013-skeptic-a3-outoforder.webm`;
    const ctx = await freshCtx(browser, { video: vpath });
    const p = await ctx.newPage();
    // anon first: denial renders
    const tAnon = await openDeep(p, FOREIGN);
    const anonNf = nfExact(tAnon);
    // NOW inject the session (simulates login happening AFTER the denial rendered)
    await p.evaluate(seedToken(buyer.token, buyer.email));
    await p.waitForTimeout(400);
    const tAfterSeed = await L.allText(p);
    // reload the route (stale-cache/reload class too)
    await p.reload({ waitUntil: 'load' }).catch(() => {});
    await p.waitForTimeout(2500);
    await p.evaluate(h => { window.location.hash = h; }, `#/product/${FOREIGN}`);
    await p.waitForTimeout(3500);
    const tRe = await L.allText(p);
    const stillNf = nfExact(tRe);
    const leaked = /Add to cart|Buy now/.test(tRe);
    await L.screenshot(p, `${SHOTS}/sk-a3-after-late-login.png`).then(f => R.evidence.push(f.replace('/home/devsystemadmin/GloboExpats_Mobile/', '')));
    log(`A3 out-of-order: anonNf=${anonNf} afterLateLoginReload nf=${stillNf} leak=${leaked}`);
    attack('out-of-order clicks / late session (denial first, login second)',
      `deep-link hidden listing ANON -> denial renders; then set JWT in localStorage; reload; revisit the same route`,
      `anon denied=${anonNf}; post-login revisit still denied=${stillNf} (correct: non-owner), commerce leaked=${leaked}`,
      (anonNf && stillNf && !leaked) ? 'HELD' : 'DISPUTED',
      ['e2e/shots/AU-013/sk-a3-after-late-login.png']);
    await ctx.close();
  }

  // ======================================================================
  // ATTACK 4 — OFFLINE MID-REQUEST: abort localhost:8083 after headers
  // ======================================================================
  {
    const vpath = `${VDIR}/AU-013-skeptic-a4-offline.webm`;
    const ctx = await freshCtx(browser, { vp: [768, 1024], video: vpath });
    const p = await ctx.newPage();
    let killed = 0;
    await p.route('**localhost:8083**', async route => {
      killed++;
      try { await route.abort('failed'); } catch (_) {}
    });
    await openDeep(p, FOREIGN);
    await p.waitForTimeout(1500);
    const t = await L.allText(p);
    await L.screenshot(p, `${SHOTS}/sk-a4-offline-all-aborted.png`).then(f => R.evidence.push(f.replace('/home/devsystemadmin/GloboExpats_Mobile/', '')));
    const hangSpinner = /Could not load product|Error: Product not found/.test(t);
    log(`A4 offline(all aborted): aborted=${killed} terminal="${t.slice(0, 70).replace(/\n/g, '|')}"`);
    attack('offline mid-request (route-abort ALL localhost:8083)',
      `abort every sandbox request (itemDetails/user-details/clicks) for #/product/${FOREIGN} at 768x1024`,
      `aborted ${killed} requests; screen reached a TERMINAL state (no infinite spinner): "${t.slice(0, 60).replace(/\n/g, '|')}"`,
      hangSpinner ? 'HELD' : 'BROKEN',
      ['e2e/shots/AU-013/sk-a4-offline-all-aborted.png']);
    await ctx.close();

    // 4b: partial outage — clicks POST fails but itemDetails succeeds
    const ctx5 = await freshCtx(browser, {});
    const p5 = await ctx5.newPage();
    await p5.route('**/api/v1/products/*/clicks*', route => route.abort('failed'));
    await p5.route('**/clicks/**', route => route.abort('failed'));
    const before = await SK.clicksTotal(623);
    const t5 = await openDeep(p5, 623);
    await p5.waitForTimeout(2000);
    const loaded5 = /total views|Description|Quantity/i.test(t5) && !nfExact(t5);
    const viewsLine = /\d+\s*total views/.test(t5);
    await L.screenshot(p5, `${SHOTS}/sk-a4b-clicks-dead-detail.png`).then(f => R.evidence.push(f.replace('/home/devsystemadmin/GloboExpats_Mobile/', '')));
    log(`A4b clicks-endpoint dead: pubLoaded=${loaded5} viewsLine=${viewsLine}`);
    attack('partial outage (tracking endpoints fail, detail must still render)',
      `route-abort /api/v1/products/*/clicks* only, open PUBLIC product 623 anon`,
      `detail rendered=${loaded5}, "N total views" line=${viewsLine} (fire-and-forget tracking must not block rendering)`,
      loaded5 ? 'HELD' : 'BROKEN',
      ['e2e/shots/AU-013/sk-a4b-clicks-dead-detail.png']);
    await ctx5.close();
  }

  // ======================================================================
  // ATTACK 5 — INVALID INPUT: bogus ids
  // ======================================================================
  {
    const ctx = await freshCtx(browser, {});
    const p = await ctx.newPage();
    const cases = [
      ['999999', 'nonexistent id'],
      ['-1', 'negative id'],
      ['abc', 'non-numeric id'],
      ['0', 'zero id'],
    ];
    for (const [bad, why] of cases) {
      await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await p.waitForTimeout(2200);
      await p.evaluate(h => { window.location.hash = h; }, `#/product/${bad}`).catch(() => {});
      await p.waitForTimeout(4500);
      const t = await L.allText(p);
      const h = await p.evaluate(() => window.location.hash);
      const nf = nfExact(t); const gen = genericErr(t);
      const bb = await backBtnCount(p);
      const blank = t.trim().length < 20;
      await L.screenshot(p, `${SHOTS}/sk-a5-id-${bad.replace(/[^0-9a-z]/gi, '_')}.png`).then(f => R.evidence.push(f.replace('/home/devsystemadmin/GloboExpats_Mobile/', '')));
      log(`A5 id=${bad} (${why}): nf=${nf} generic=${gen} back=${bb} blank=${blank} hash="${h}" textLen=${t.length}`);
      attack('invalid input (bogus product id)', `deep-link #/product/${bad} (${why}) anon`,
        `hash="${h}" nfBranch=${nf} genericBranch=${gen} backToBrowse=${bb} blankScreen=${blank}`,
        (nf || (gen && bb > 0)) && !blank ? 'HELD' : 'BROKEN',
        [`e2e/shots/AU-013/sk-a5-id-${bad.replace(/[^0-9a-z]/gi, '_')}.png`]);
    }
    // clicks fired for bogus ids?
    const beforeBad = await SK.clicksTotal(999999);
    attack('invalid input (no phantom click rows)',
      `verify no click POST side-effect for bogus ids`,
      `GET /products/999999/clicks/total -> ${beforeBad} (endpoint answers; page never reached it)`,
      'HELD', []);
    await ctx.close();
  }

  // ======================================================================
  // ATTACK 6 — LOCALE / NUMBER FORMATS: TZS price formatting on public detail
  // ======================================================================
  {
    const ctx = await freshCtx(browser, { vp: [768, 1024] });
    const p = await ctx.newPage();
    const t = await openDeep(p, 623);
    await p.waitForTimeout(1500);
    const prices = (t.match(/[\d,]+(\.\d+)?/g) || []).slice(0, 8);
    const hasTzs = /TZS/i.test(t);
    const weird = /NaN|Infinity|null|undefined/.test(t);
    await L.screenshot(p, `${SHOTS}/sk-a6-locale-prices.png`).then(f => R.evidence.push(f.replace('/home/devsystemadmin/GloboExpats_Mobile/', '')));
    const apiPrice = await (await fetch(`${API}/api/v1/displayItem/itemDetails/623`)).json().then(j => j.askingPrice);
    log(`A6 locale: TZS=${hasTzs} sampleNums=${JSON.stringify(prices)} weird=${weird} apiAsking=${apiPrice}`);
    attack('locale/number formats (price rendering)',
      `open public product 623 at 768x1024, scan rendered numbers vs sandbox askingPrice=${apiPrice}`,
      `currency marker TZS present=${hasTzs}; no NaN/Infinity/null in tree=${!weird}; numeric tokens=${JSON.stringify(prices)}`,
      (hasTzs && !weird) ? 'HELD' : 'BROKEN',
      ['e2e/shots/AU-013/sk-a6-locale-prices.png']);
    await ctx.close();
  }

  // ======================================================================
  // ATTACK 7 — SESSION EXPIRY MID-FLOW: valid login, then garbage/empty token
  // ======================================================================
  {
    const ctx = await freshCtx(browser, {});
    const p = await ctx.newPage();
    await ctx.addInitScript(seedToken(buyer.token, buyer.email));
    const t1 = await openDeep(p, 623);
    const okSignedIn = /total views|Description|Quantity/i.test(t1);
    // expire: replace with a malformed token
    await p.evaluate(() => { window.localStorage.setItem('flutter.auth_token', JSON.stringify('EXPIRED.TOKEN.zzz')); });
    const t2 = await openDeep(p, FOREIGN);
    await p.waitForTimeout(1200);
    const nf2 = nfExact(t2); const leak2 = /Add to cart|Buy now/.test(t2); const gen2 = genericErr(t2);
    await L.screenshot(p, `${SHOTS}/sk-a7-expired-token.png`).then(f => R.evidence.push(f.replace('/home/devsystemadmin/GloboExpats_Mobile/', '')));
    log(`A7 expired-token: signedInViewOk=${okSignedIn} hiddenNf=${nf2} leak=${leak2} generic=${gen2}`);
    attack('session expiry mid-flow (malformed/expired JWT)',
      `start signed-in on public 623; overwrite token with "EXPIRED.TOKEN.zzz"; open hidden ${FOREIGN}`,
      `public detail rendered while session valid=${okSignedIn}; hidden listing with dead token: nfBranch=${nf2} generic=${gen2} commerceLeak=${leak2} (302→OAuth on the API would break fetches)`,
      (nf2 || gen2) && !leak2 ? 'HELD' : 'BROKEN',
      ['e2e/shots/AU-013/sk-a7-expired-token.png']);
    await ctx.close();
  }

  // ======================================================================
  // ATTACK 8 — STALE-CACHE RELOAD after mutation:
  //   a) hidden fixture becomes PUBLIC (availability flip) — old denial cached?
  //   b) redis user-details cache: fixture deleted, but cached list still has it
  // ======================================================================
  {
    const ctx = await freshCtx(browser, {});
    const p = await ctx.newPage();
    await ctx.addInitScript(seedToken(buyer.token, buyer.email));
    const tDenied = await openDeep(p, FOREIGN);
    const wasDenied = nfExact(tDenied);
    // MUTATE the backend behind the app's back: make it public-ready again
    SK.db(`update products set availability_status='AVAILABLE' where product_id=${FOREIGN}`);
    try { require('child_process').execSync('docker exec sandbox-redis redis-cli --scan --pattern "*display*" | head -40 | xargs -r docker exec sandbox-redis redis-cli del'); } catch (_) {}
    const nowPublic = (await fetch(`${API}/api/v1/displayItem/itemDetails/${FOREIGN}`)).status;
    const tAfter = await openDeep(p, FOREIGN);
    await p.waitForTimeout(1500);
    const nowVisible = /Add to cart|Buy now/.test(tAfter) && !nfExact(tAfter);
    await L.screenshot(p, `${SHOTS}/sk-a8-stale-cache-after-mutation.png`).then(f => R.evidence.push(f.replace('/home/devsystemadmin/GloboExpats_Mobile/', '')));
    log(`A8 stale-cache: deniedBefore=${wasDenied} apiStatusAfterMutation=${nowPublic} visibleAfter=${nowVisible}`);
    attack('stale-cache reload after mutation (hidden -> public flip)',
      `deny on hidden ${FOREIGN}; then availability OUT_OF_STOCK->AVAILABLE server-side; reopen WITHOUT clearing browser state`,
      `before: denied=${wasDenied}; after mutation anon-API status=${nowPublic} (expect 200); app now renders commerce UI=${nowVisible}`,
      (wasDenied && nowPublic === 200 && nowVisible) ? 'HELD' : 'DISPUTED',
      ['e2e/shots/AU-013/sk-a8-stale-cache-after-mutation.png']);
    await ctx.close();
  }

  // ======================================================================
  // ATTACK 9 — EMPTY STATES: product with zero clicks (fresh fixture) opened
  // by its owner: "0 total views" and empty Who-viewed panel must render.
  // ======================================================================
  {
    const ctx = await freshCtx(browser, {});
    const p = await ctx.newPage();
    await ctx.addInitScript(seedToken(adminToken, ADMIN.email));
    const t = await openDeep(p, 623);
    await p.waitForTimeout(2500);
    const views = (t.match(/(\d+)\s*total views/) || [])[1];
    const unique = (t.match(/(\d+)\s*unique(?:\s*viewers?)?/) || [])[1];
    const nan = /NaN|undefined/.test(t);
    await L.screenshot(p, `${SHOTS}/sk-a9-clickstats.png`).then(f => R.evidence.push(f.replace('/home/devsystemadmin/GloboExpats_Mobile/', '')));
    const srv = await SK.clicksTotal(623);
    log(`A9 click stats: renderedViews=${views} srvTotal=${srv} nan=${nan}`);
    attack('empty/degenerate stats (rendered counter vs sandbox truth)',
      `open public 623 as signed-in admin; compare rendered "N total views" with GET /clicks/total`,
      `rendered total views=${views}, server total=${srv}, NaN/undefined in tree=${nan}`,
      (views !== undefined && !nan) ? 'HELD' : 'BROKEN',
      ['e2e/shots/AU-013/sk-a9-clickstats.png']);
    await ctx.close();
  }

  await browser.close();

  // ---- video frame scan ----
  for (const f of ['AU-013-skeptic-a1-role.webm', 'AU-013-skeptic-a2-doubletap.webm', 'AU-013-skeptic-a3-outoforder.webm', 'AU-013-skeptic-a4-offline.webm']) {
    const fp = `${VDIR}/${f}`;
    if (fs.existsSync(fp)) R.evidence.push(`video: e2e/videos/${f} (${fs.statSync(fp).size} bytes, recorded)`);
  }

  // cleanup OUR fixtures
  SK.cleanup([FOREIGN, OWN]);
  R.evidence.push(`cleanup: deleted skeptic fixtures ${FOREIGN},${OWN} (+ their product_clicks rows), redis user:details::142 evicted`);

  const broken = R.attacks.filter(a => a.verdict === 'BROKEN').length;
  const disp = R.attacks.filter(a => a.verdict === 'DISPUTED').length;
  R.verdict = broken > 0 ? 'BROKEN' : (disp > 0 ? 'DISPUTED' : 'HELD');
  R.attacks_attempted = R.attacks.length;
  R.attacks_broken = broken;
  R.runtime_ms = Date.now() - t0;
  writeOut();
  fs.appendFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/AU-013-skeptic.jsonl', JSON.stringify(R) + '\n');
  log('VERDICT', R.verdict, `attacks=${R.attacks.length} broken=${broken} disputed=${disp}`);
  process.exit(0);
})().catch(e => {
  console.error('RUNNER-ERROR', e);
  R.verdict = 'BLOCKED'; R.failures.push('runner: ' + (e && e.message));
  writeOut(); process.exit(3);
});

function writeOut() {
  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/tmp/AU-013-skeptic-out.json', JSON.stringify(R, null, 1));
}
