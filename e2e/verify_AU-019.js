// verify_AU-019.js — Contact-seller WhatsApp row (Wave 1 P0)
// Acceptance: whatsappNumber rendered as call/chat action row when present;
// absent field hides block entirely. One product WITH and one WITHOUT whatsappNumber.
// Frozen bundle :9103 (sha 7866a11, Last-Modified must equal contract value).
// NO gemini (Rule 16): PNGs read natively after this script exits.
const { chromium } = require('playwright');
const fs = require('fs');
const L = require('./lib_verify.js');

const UNIT = 'AU-019';
const APP = 'http://localhost:9103'; // FROZEN bundle under test
const REF = 'http://localhost:3000';
const EXPECTED_MTIME = 'Sat, 22 Aug 2026 22:39:02 GMT';
const SHOTS = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-019';
const VDIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos';

async function curlDetail(id) {
  const r = await fetch('http://localhost:8083/api/v1/displayItem/itemDetails/' + id);
  return r.json();
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(VDIR, { recursive: true });
  const log = (...a) => console.log('[au019]', ...a);
  const R = {
    freshness: null, probes: {}, images: {},
    buttons: { total: 0, ok: 0, effects: [], failed: [] },
    asserts: [], navAsserts: 0, stateAsserts: 0, dataAsserts: 0,
    shots: [], failures: [], consoleErrors: [],
  };

  // ---------- (1) FRESHNESS ----------
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified') || '';
  R.freshness = { status: head.status, lastModified: lm, ok: lm === EXPECTED_MTIME };
  log('freshness', JSON.stringify(R.freshness));
  if (!R.freshness.ok) R.failures.push('stale-build: Last-Modified ' + lm + ' != ' + EXPECTED_MTIME);

  // ---------- (2) REAL DATA probes (independent curl of the entity) ----------
  // Pick products from the live sandbox API: one WITH whatsappNumber, one WITHOUT.
  let withId = null, withoutId = null;
  const list = await fetch('http://localhost:8083/api/v1/products/get-all-products?size=60&page=0').then(r => r.json());
  for (const p of list.content || []) {
    if (!withId && p.whatsappNumber) withId = p.productId;
    if (!withoutId && !p.whatsappNumber) withoutId = p.productId;
    if (withId && withoutId) break;
  }
  const dWith = await curlDetail(withId);
  const dWithout = await curlDetail(withoutId);
  R.probes = {
    withId, withWa: dWith.whatsappNumber, withName: dWith.productName,
    withoutId, withoutWa: dWithout.whatsappNumber, withoutName: dWithout.productName,
  };
  log('probes', JSON.stringify(R.probes));
  if (!dWith.whatsappNumber) R.failures.push('probe-fail: no sandbox product with whatsappNumber found');
  R.dataAsserts += 2;

  const wire = (p) => {
    p.on('console', m => { if (m.type() === 'error') R.consoleErrors.push(m.text().slice(0, 160)); });
    p.on('pageerror', e => R.consoleErrors.push(('pageerror:' + e).slice(0, 160)));
  };
  const watch = L.watchImages;

  async function openDetail(p, id) {
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 40000);
    // SPA deep-link via client router: navigate in-page through history API is not enough for
    // GoRouter on web; use the app's own search box instead -> click a card. Simpler robust path:
    // goto / then push route by evaluating window history is unreliable; use direct URL load
    // (server is SPA-aware? :9103 is SimpleHTTP -> deep link 404s). So navigate via UI search.
    const si = p.locator('input[type="text"]').first();
    await si.click({ force: true }).catch(() => {});
    await p.keyboard.type(dWith.productName.split(' ').slice(0, 2).join(' '), { delay: 40 }).catch(() => {});
    await p.waitForTimeout(1200);
  }

  const browser = await L.newBrowser();
  const results = {};

  for (const [key, id, expectWa] of [['with', withId, dWith.whatsappNumber], ['without', withoutId, null]]) {
    const vpath = VDIR + '/' + UNIT + '-' + key + '-375.webm';
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: vpath });
    const p = await ctx.newPage();
    wire(p); watch(p);
    const imgs = R.images;

    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 45000);
    await p.waitForTimeout(1500);

    // login (real sandbox creds from harness)
    const logged = await L.login(p, L.BUYER);
    log(key, 'login=' + logged);

    // Navigate to the product detail via SEARCH (real user path; SPA server has no rewrite)
    const q = (key === 'with' ? dWith.productName : dWithout.productName).split(' ').slice(0, 3).join(' ');
    // find the search field on home
    const searchSel = 'input[type="text"]';
    await p.locator(searchSel).first().click({ force: true }).catch(() => {});
    await p.waitForTimeout(300);
    await p.keyboard.type(q, { delay: 30 });
    await p.keyboard.press('Enter');
    await p.waitForTimeout(2500);
    const afterSearchText = await L.allText(p);
    const foundCard = afterSearchText.toLowerCase().includes((key === 'with' ? dWith.productName : dWithout.productName).toLowerCase().slice(0, 20));
    log(key, 'search-results=' + foundCard);

    // open detail: tap the product card whose text contains the product name prefix
    const nameFrag = (key === 'with' ? dWith.productName : dWithout.productName).slice(0, 18);
    let opened = false;
    for (let attempt = 0; attempt < 3 && !opened; attempt++) {
      opened = await L.clickCard(p, nameFrag);
      await p.waitForTimeout(1800);
      const t = await L.allText(p);
      if (/Add to cart|Add to Cart/i.test(t)) break;
      opened = false;
      await p.goto(APP + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await L.waitText(p, 'Buy now', 30000);
      await p.locator(searchSel).first().click({ force: true }).catch(() => {});
      await p.keyboard.type(q, { delay: 30 }); await p.keyboard.press('Enter');
      await p.waitForTimeout(2200);
    }
    const detailText = await L.allText(p);
    const onDetail = /Add to cart|Add to Cart/i.test(detailText);
    log(key, 'onDetail=' + onDetail);
    results[key] = { onDetail };

    if (onDetail) {
      // ---- acceptance assert A1/A2: WhatsApp row presence/absence ----
      const waRowPresent = /WhatsApp/i.test(detailText) && new RegExp(expectWa ? expectWa.replace(/[+]/g, '\\+') : '$^').test(detailText);
      const waLabelPresent = /WhatsApp/i.test(detailText);
      const numberShown = expectWa ? detailText.includes(expectWa) : null;
      results[key].waLabelPresent = waLabelPresent;
      results[key].numberShown = numberShown;
      R.asserts.push({ key, check: 'whatsapp-row-present', expected: !!expectWa, actual: waLabelPresent });
      R.stateAsserts++;
      if (expectWa) { R.asserts.push({ key, check: 'whatsapp-number-shown', expected: expectWa, actual: numberShown }); R.dataAsserts++; }

      await L.screenshot(p, SHOTS + '/flutter-375-detail-' + key + '.png');

      // scroll full page to catch any contact row further down
      await L.scrollToBottom(p, 16);
      await p.waitForTimeout(800);
      const fullText = await L.allText(p);
      results[key].waAfterFullScroll = /WhatsApp/i.test(fullText);
      results[key].numberAfterFullScroll = expectWa ? fullText.includes(expectWa) : null;
      await L.screenshot(p, SHOTS + '/flutter-375-detail-' + key + '-scrolled.png');

      // ---- click EVERY interactive control on this screen (rule 4) ----
      const btns = await L.listButtons(p);
      results[key].buttonsTotal = btns.length;
      R.buttons.total += btns.length;
      for (const b of btns.slice(0, 30)) {
        if (b.kind === 'input') continue;
        const ok = await Promise.race([
          L.clickBtn(p, b.label.slice(0, 25) || 'x'),
          new Promise(r => setTimeout(() => false, 5000)),
        ]);
        await p.waitForTimeout(700);
        const t2 = await L.allText(p);
        const changed = t2 !== detailText;
        R.buttons.effects.push({ screen: key, label: b.label.slice(0, 40), clicked: ok, effect: ok && changed ? 'state-change' : (ok ? 'clicked-no-visible-change' : 'click-failed') });
        if (ok) R.buttons.ok++; else R.buttons.failed.push(key + ':' + b.label.slice(0, 30));
        // back to detail if we navigated away
        if (!/Add to cart|Add to Cart/i.test(await L.allText(p))) {
          await p.goBack({ timeout: 15000 }).catch(() => {});
          await p.waitForTimeout(1000);
          if (!/Add to cart|Add to Cart/i.test(await L.allText(p))) break; // lost the screen; stop sweep
        }
      }
      await L.screenshot(p, SHOTS + '/flutter-375-after-clicks-' + key + '.png');
    } else {
      R.failures.push(key + ': could not open product detail for productId=' + id + ' via search "' + q + '"');
    }

    // tablet viewport render of same state
    const ctx2 = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: VDIR + '/' + UNIT + '-' + key + '-768.webm' });
    const p2 = await ctx2.newPage(); wire(p2); watch(p2);
    await p2.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p2, 'Buy now', 45000);
    await L.login(p2, L.BUYER);
    await p2.locator('input[type="text"]').first().click({ force: true }).catch(() => {});
    await p2.keyboard.type(q, { delay: 25 }); await p2.keyboard.press('Enter');
    await p2.waitForTimeout(2500);
    const opened2 = await L.clickCard(p2, nameFrag);
    await p2.waitForTimeout(2000);
    const t2 = await L.allText(p2);
    const onDetail2 = /Add to cart|Add to Cart/i.test(t2);
    results[key].tabletOnDetail = onDetail2;
    results[key].tabletWaLabel = /WhatsApp/i.test(t2);
    results[key].tabletNumber = expectWa ? t2.includes(expectWa) : null;
    if (onDetail2) {
      await L.screenshot(p2, SHOTS + '/flutter-768-detail-' + key + '.png');
      await L.scrollToBottom(p2, 14);
      const f2 = await L.allText(p2);
      results[key].tabletWaAfterScroll = /WhatsApp/i.test(f2);
      await L.screenshot(p2, SHOTS + '/flutter-768-detail-' + key + '-scrolled.png');
    }
    await L.closeVideo(ctx2, VDIR + '/' + UNIT + '-' + key + '-768.webm');
    await L.closeVideo(ctx, vpath);
  }

  // ---------- reference pair shots (:3000, same viewport, same entity) ----------
  for (const [key, id] of [['with', withId], ['without', withoutId]]) {
    const ctx3 = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
    const p3 = await ctx3.newPage();
    await p3.goto(REF + '/product/' + id, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await p3.waitForTimeout(6000);
    await p3.screenshot({ path: SHOTS + '/ref-375-detail-' + key + '.png' }).catch(() => {});
    R.shots.push(SHOTS + '/ref-375-detail-' + key + '.png');
    // does the reference render the seller whatsapp row?
    const refTxt = await p3.evaluate(() => document.body.innerText).catch(() => '');
    results[key] = results[key] || {};
    results[key].refHasNumber = dWith.whatsappNumber ? String(refTxt).includes(String(key === 'with' ? dWith.whatsappNumber : '')) : null;
    results[key].refWhatsappBtn = /whatsapp/i.test(String(refTxt));
    await ctx3.close();
  }

  await browser.close();

  // ---------- image summary ----------
  const imgs = Object.entries(R.images);
  const broken = imgs.filter(([, s]) => !(s === 200 || s === 304)).map(([u, s]) => u.slice(-50) + ' -> ' + s);

  const line = {
    ts: new Date().toISOString(), unit: UNIT, title: 'Contact-seller WhatsApp row', wave: 'verify',
    agent: 'verifier-AU-019', build_sha: '7866a11', build_mtime: R.freshness.lastModified,
    viewport: '375x667+768x1024',
    verdict: 'PENDING_VISION', // orchestrator finalizes after native PNG read
    checks: {
      real_data: true, real_data_probe: JSON.stringify(R.probes),
      images_requested: imgs.length, images_200: imgs.length - broken.length, images_broken: broken,
      buttons_total: R.buttons.total, buttons_ok: R.buttons.ok, buttons_failed: R.buttons.failed,
      state_asserts: R.asserts.length, nav_asserts: R.navAsserts, data_asserts: R.dataAsserts,
      vision_defects: null, vision_findings: ['PENDING native PNG read'],
      parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
    },
    attacks_attempted: 0, attacks_broken: 0,
    failures: R.failures.concat(broken), evidence: R.shots,
    runtime_ms: Date.now() - t0,
  };
  fs.mkdirSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards', { recursive: true });
  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/raw-AU-019.json', JSON.stringify({ line, results, asserts: R.asserts, effects: R.buttons.effects, consoleErrors: R.consoleErrors }, null, 2));
  console.log('RESULTS-JSON');
  console.log(JSON.stringify({ results, asserts: R.asserts, failures: R.failures, images: imgs.length, consoleErrors: R.consoleErrors }, null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
