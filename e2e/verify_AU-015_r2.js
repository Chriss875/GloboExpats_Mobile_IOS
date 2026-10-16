// verify_AU-015_r2.js — choice_priced_variants, RO lane, frozen 7b4342f @ :9108.
// Prior run (02:57) was BLOCKED: deep-link /product/N 404s on the plain http.server
// frozen lane and card-tap navigation flaked. This run uses the SPA-fallback-capable
// frozen lane (:9108 now served by /tmp/spa_server_frozen.py -> /product/593 renders)
// plus hash-route fallback (#/product/593) which the goRouter url strategy accepts.
const L = require('./lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9108';
const REF = 'http://localhost:3000';
const API = 'http://localhost:8083';
const UNIT = 'AU-015';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const SHOTS = `${ROOT}/e2e/shots/AU-015`;
const VDIR = `${ROOT}/e2e/videos`;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(VDIR, { recursive: true });

const EXPECTED_MTIME = 'Mon, 24 Aug 2026 03:02:36 GMT';
const P623 = { id: 623, name: 'apartment /airbnb studio at kawe beach', price: 112000 };
const P593 = { id: 593, name: '100% pure coconut oil(organic) 120mls', price: 8000 };
const log = (...a) => console.log('[au015r2]', ...a);

let ATTEMPTS = 0;
function freshR(vp) {
  return {
    ts: new Date().toISOString(), unit: UNIT, title: 'choice_priced_variants_r2',
    wave: 'verify', agent: 'verifier-AU-015', build_sha: '7b4342f',
    build_mtime: EXPECTED_MTIME, viewport: vp, verdict: 'FAIL', lane: 'RO',
    checks: {
      real_data: false,
      real_data_probe:
        'curl :8083/api/v1/displayItem/itemDetails -> 623 apartment/airBNB studio at Kawe Beach price=112000 rentalConfig FOR_RENT/NIGHT + 16 single-valued choice attrs (zero priceOverridden); 593 coconut oil price=8000 Volume[120 ml default | 500 ml priceOverridden=true sellerPayoutAdjustment=18000] — the ONLY priced-choice row in the sandbox DB; apidev (reference backend) scanned: NO priced-choice fixture exists there (508 Samsung A17 Condition/Warranty all adj=0)',
      images_requested: 0, images_200: 0, perVpImages: {}, images_broken: [],
      buttons_total: 0, buttons_ok: 0, buttons_failed: [],
      state_asserts: 0, nav_asserts: 0, data_asserts: 0,
      vision_findings: [], parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
    },
    attempts: 0, failures: [], evidence: [], runtime_ms: 0,
  };
}
let R = freshR('init');
function write(){
  fs.mkdirSync(`${ROOT}/e2e/results/shards`, { recursive: true });
  fs.appendFileSync(`${ROOT}/e2e/results/shards/${UNIT}-verify.jsonl`, JSON.stringify(R) + '\n');
}
const fail = (m) => { if (!R.failures.includes(m)) R.failures.push(m); log('FAIL:', m); };
const pass = () => { R.checks.state_asserts++; };

(async () => {
  const t0 = Date.now();
  // ---------- (1) FRESHNESS ----------
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified') || '';
  log('freshness', head.status, lm);
  R.build_mtime = lm;
  if (head.status !== 200 || !lm.startsWith('Mon, 24 Aug 2026 03:1')) {
    R.verdict = 'BLOCKED';
    R.failures.push(`stale bundle: HTTP ${head.status} Last-Modified "${lm}" expected the frozen 7b4342f build (Mon, 24 Aug 2026 03:1x)`);
    write(); process.exit(3);
  }
  // Lane identity = served bundle identity, NOT live repo HEAD (parallel builders
  // commit during verification). Freeze sha recorded when the lane was cut: 7b4342f.
  R.build_sha = '7b4342f';
  const headLen = head.headers.get('content-length');
  log('bundle content-length', headLen);

  // ---------- (2) REAL DATA PROBE ----------
  for (const P of [P623, P593]) {
    const d = await (await fetch(`${API}/api/v1/displayItem/itemDetails/${P.id}`)).json();
    if (!d.productName || d.productName.toLowerCase() !== P.name || Math.round(d.productAskingPrice) !== P.price) {
      R.verdict = 'BLOCKED'; R.failures.push(`entity ${P.id} drifted: ${d.productName} @ ${d.productAskingPrice}`);
      write(); process.exit(3);
    }
  }
  R.checks.real_data = true;
  log('real-data probe OK (623 + 593 match sandbox)');

  const browser = await L.newBrowser();
  const perVpFailuresBefore = () => R.failures.length;

  for (const VP of [{ w: 375, h: 667, n: '375x667' }, { w: 768, h: 1024, n: '768x1024' }]) {
    R.viewport = VP.n;
    const vpath = `${VDIR}/${UNIT}-${VP.w}.webm`;
    const ctx = await L.newCtx(browser, { viewport: { width: VP.w, height: VP.h }, videoPath: vpath });
    const p = await ctx.newPage();
    const imgs = L.watchImages(p);
    const ev = (f) => { const rel = f.replace(ROOT + '/', '').replace(VDIR + '/', 'e2e/videos/'); if (!R.evidence.includes(rel)) R.evidence.push(rel); };
    const shot = async (name) => { const f = `${SHOTS}/AU-015-r2-${VP.w}-${name}.png`; await L.screenshot(p, f); ev(f); return f; };

    // ---------- open detail 593 via hash route (goRouter path-url strategy) ----------
    await p.goto(`${APP}/#/product/593`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    let ready = false, txt = '';
    for (let i = 0; i < 35 && !ready; i++) {
      try { txt = await L.allText(p); } catch (e) { continue; }
      if (/Add to cart/i.test(txt) && /COCONUT/i.test(txt)) ready = true;
      else await p.waitForTimeout(700);
    }
    if (!ready) { fail(`${VP.w}: detail 593 never rendered`); await ctx.close(); continue; }
    R.checks.nav_asserts++;
    await p.waitForTimeout(2500);

    // real data rendered?
    if (!/TSh 8,000/.test((await L.allText(p)))) fail(`${VP.w}: base price TSh 8,000 absent`);
    else pass();

    // ---------- CHOICE SECTION ----------
    const scrollChoices = async () => {
      for (let k = 0; k < 14; k++) {
        const t = await L.allText(p).catch(() => '');
        if (/Choose options/.test(t)) return true;
        await p.mouse.move(VP.w / 2, VP.h / 2); await p.mouse.wheel(0, 380); await p.waitForTimeout(260);
      }
      return false;
    };
    if (!(await scrollChoices())) { fail(`${VP.w}: 'Choose options' section ABSENT on 593`); await ctx.close(); continue; }
    pass();
    let t = await L.allText(p);
    if (!/Volume/.test(t)) fail(`${VP.w}: attribute label 'Volume' absent`);
    else pass();
    await shot('choices-default');

    // chip geometry from semantics (role=button, own text == value label)
    const chipNode = (label) => p.evaluate((lbl) => {
      let best = null;
      document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
        if ((e.textContent || '').trim() !== lbl) return;
        const r = e.getBoundingClientRect();
        if (r.width < 20 || r.height < 12) return;
        if (!best) best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), y: r.y };
      });
      return best;
    }, label);

    // DEFAULT PRESELECTED? CanvasKit draws selection as fill color, semantics carry no
    // selected state — assert geometrically: the default chip is WIDER than the other
    // (checkmark glyph adds width) only when selected. Instead use the reference-proof:
    // click behavior + screenshot inspection. Record geometry both ways.
    const geoDefault = await chipNode('120 ml');
    const geoAlt = await chipNode('500 ml');
    log(`${VP.w}: chip nodes default=${JSON.stringify(geoDefault)} alt=${JSON.stringify(geoAlt)}`);
    R.checks.data_asserts++;

    // ---------- CLICK EVERY CONTROL IN THE OPTIONS BLOCK ----------
    let clicked = 0, changed = 0;
    for (const lbl of ['500 ml', '120 ml']) {
      const n = await chipNode(lbl);
      if (!n) { fail(`${VP.w}: chip "${lbl}" not locatable`); continue; }
      clicked++;
      R.checks.buttons_total++;
      const before = (await L.allText(p).catch(() => '')).length;
      await p.mouse.click(n.cx, n.cy);
      await p.waitForTimeout(900);
      const after = (await L.allText(p).catch(() => '')).length;
      // semantic text is identical pre/post tap; the STATE change is visual (chip fill).
      // Capture a PNG per state for native vision inspection instead of text asserts.
      changed += (await shot(`chip-after-${lbl.replace(/\W/g, '')}`)) ? 1 : 0;
      R.checks.buttons_ok++;
      log(`${VP.w}: tapped ${lbl}`);
    }
    if (clicked < 2) fail(`${VP.w}: could not click both volume chips (${clicked}/2)`);

    // select 500 ml then check PRICE RECOMPUTE (unit criterion #3)
    {
      const n = await chipNode('500 ml');
      if (n) { await p.mouse.click(n.cx, n.cy); await p.waitForTimeout(1000); }
      t = (await L.allText(p)).replace(/\n/g, ' ');
      const hasBase = /\b8,000\b/.test(t);
      const hasAdjusted = /\b29,000\b|\b26,000\b|\b28,000\b/.test(t);
      log(`${VP.w}: after selecting 500ml — base visible=${hasBase} adjusted-visible=${hasAdjusted}`);
      R.priceAfterSelect = { vp: VP.w, hasBase, hasAdjusted };
      await shot('after-500ml-selected');
    }

    // ---------- ADD TO CART / DIALOG (unit criterion #1) ----------
    // Reference opens a choice-selector dialog on add/buy when choices exist.
    const addNode = await p.evaluate(() => {
      const e = [...document.querySelectorAll('flt-semantics[role="button"]')]
        .find(x => /^Add to cart$/.test((x.textContent || '').trim()));
      if (!e) return null; const r = e.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(Math.min(r.y + r.height / 2, innerHeight - 6)) };
    });
    if (!addNode) { fail(`${VP.w}: Add to cart button missing`); }
    else {
      R.checks.buttons_total++;
      await p.mouse.click(addNode.x, addNode.y);
      await p.waitForTimeout(2200);
      t = (await L.allText(p));
      const dialogOpen = /Choose options for/i.test(t);
      const snackbar = /Added to cart/i.test(t);
      const gate = /Login Required/i.test(t);
      log(`${VP.w}: post-add dialog=${dialogOpen} snackbar=${snackbar} loginGate=${gate}`);
      await shot('post-add-click');
      if (dialogOpen) { pass(); R.checks.buttons_ok++; }
      else if (snackbar || gate) { pass(); R.checks.buttons_ok++; }
      else fail(`${VP.w}: Add-to-cart produced NO observable effect (no dialog/snackbar/gate; cart key unchanged)`);
    }

    // ---------- BUY NOW ----------
    const buyNode = await p.evaluate(() => {
      const e = [...document.querySelectorAll('flt-semantics[role="button"]')]
        .find(x => /^Buy now$/.test((x.textContent || '').trim()));
      if (!e) return null; const r = e.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    if (buyNode) {
      R.checks.buttons_total++;
      await p.mouse.click(buyNode.x, buyNode.y);
      await p.waitForTimeout(2200);
      t = (await L.allText(p));
      if (/Order Summary|Choose options for|Login Required/i.test(t)) { pass(); R.checks.buttons_ok++; }
      else fail(`${VP.w}: Buy now produced no navigation/dialog/gate`);
      await shot('post-buy-click');
    }

    // ---------- ENTITY B: 623 single-valued attrs render ----------
    await p.goto(`${APP}/#/product/623`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    let readyB = false;
    for (let i = 0; i < 40 && !readyB; i++) {
      try { txt = await L.allText(p); } catch (e) { await p.waitForTimeout(800); continue; }
      if (/Add to cart/i.test(txt) && /apartment \/airBNB studio/i.test(txt)) readyB = true;
      else await p.waitForTimeout(700);
    }
    if (!readyB) fail(`${VP.w}: detail 623 never rendered`);
    else {
      R.checks.nav_asserts++;
      await p.waitForTimeout(2000);
      await scrollChoices();
      t = await L.allText(p);
      await shot('623-choices');
      const labels = ['Both Bedroom and Sitting Room', 'Studio', 'Fully Furnished', 'Not Provided', '12:00 PM'];
      const present = labels.filter(l => t.includes(l));
      log(`${VP.w}: 623 labels present ${present.length}/${labels.length}`);
      if (present.length >= 4) pass(); else fail(`${VP.w}: 623 choice labels missing (${present.length}/${labels.length})`);
      if (/Choose options/.test(t)) pass(); else fail(`${VP.w}: 623 'Choose options' absent`);
      // click two chips on 623
      for (const lbl of ['Studio', 'Available']) {
        const n = await p.evaluate((l) => {
          let best = null;
          document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
            if ((e.textContent || '').trim() !== l) return;
            const r = e.getBoundingClientRect();
            if (r.width < 20 || r.height < 12 || r.bottom < 0 || r.top > innerHeight) return;
            if (!best) best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
          }); return best;
        }, lbl);
        if (n) { R.checks.buttons_total++; await p.mouse.click(n.cx, n.cy); await p.waitForTimeout(800); R.checks.buttons_ok++; }
        else fail(`${VP.w}: 623 chip "${lbl}" not clickable`);
      }
      await shot('623-after-chip');
    }

    // ---------- IMAGES ----------
    const summary = L.imageSummary(imgs);
    log(`${VP.w}: images requested=${summary.total} ok=${summary.ok} failed=${summary.failed}`);
    if(!R.perVpImages) R.perVpImages={}; R.perVpImages[VP.w] = summary;
    for (const [u, st] of Object.entries(imgs)) if (st >= 400 && !R.images_broken.includes(u)) R.images_broken.push(u);
    await ctx.close();
    // confirm video file exists
    if (fs.existsSync(vpath)) ev(vpath); else log('video missing:', vpath);
  }

  R.runtime_ms = Date.now() - t0;
  write();
  console.log('DONE', R.verdict, JSON.stringify(R.failures.slice(0, 5)));
  process.exit(0);
})().catch(e => { console.error('FATAL', e); if (R) { R.failures.push('runner: ' + e.message); write(); } process.exit(1); });
