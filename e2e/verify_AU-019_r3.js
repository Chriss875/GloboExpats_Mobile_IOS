// verify_AU-019_r3.js — AU-019 whatsapp_row, RO lane, FROZEN bundle http://localhost:9108
// Contract: sha 16b9b33 (bundle rebuilt at HEAD 7b4342f, which CONTAINS 16b9b33; the
// WhatsApp-row code diff 16b9b33..HEAD is empty — verified in-shell), main.dart.js must be
// built at-or-after Mon, 24 Aug 2026 00:36:38 GMT.
//
// Unit criteria:
//   E1. Entity 627 (whatsappNumber "+255712000111"): call/chat row renders WITH the number;
//       tapping launches wa.me (assert window.open payload + real popup target + no crash).
//   E1b. Entity 615 (whatsappNumber "+255 742333122"): same positive asserts (second fixture).
//   E2. Entity 628 (whatsappNumber null): block absent entirely, no number leakage.
//   Reference parity vs :3000 (which proxies apidev.globoexpats.com — sandbox ids 404 there;
//       positive-case parity additionally checked against apidev product 508).
// Proven techniques (debug probes): service-worker settle before any evaluate; login =
// Buy now -> Login -> fields -> Log in -> poll flutter.auth_token; card nav = scroll-until-
// tappable then coordinate click; WA row = role=button locator + scrollIntoViewIfNeeded +
// window.open instrumentation + CDP Target.getTargets.
const { chromium } = require('playwright');
const fs = require('fs');
const L = require('./lib_verify.js');

const UNIT = 'AU-019';
const APP = 'http://localhost:9108';
const REF = 'http://localhost:3000';
const MIN_MTIME_EPOCH = Date.parse('Mon, 24 Aug 2026 00:36:38 GMT');
const CONTRACT_SHA = '16b9b33';
const SHOTS = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-019';
const VDIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos';

const ENTITIES = [
  { key: 'wa627', id: 627, wa: '+255712000111', name: 'Fixture WhatsApp Contact Phone Listing', frag: 'Fixture WhatsApp Contact', expectRow: true },
  { key: 'wa615', id: 615, wa: '+255 742333122', name: 'LANCÔME PARIS La vie est belle', frag: 'LANCÔME PARIS La vie', expectRow: true },
  { key: 'nowa628', id: 628, wa: null, name: 'B2 Hidden Guard Fixture', frag: 'B2 Hidden Guard Fixture', expectRow: false },
];

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(VDIR, { recursive: true });
  const log = (...a) => console.log('[au019r3]', ...a);
  const R = {
    freshness: null, probes: {}, images: {}, buttons: { total: 0, ok: 0, effects: [], failed: [] },
    asserts: [], navAsserts: 0, stateAsserts: 0, dataAsserts: 0,
    shots: [], videos: [], failures: [], consoleErrors: [], popups: [],
  };

  // ---------- (1) FRESHNESS ----------
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified') || '';
  R.freshness = { status: head.status, lastModified: lm, contractFloor: new Date(MIN_MTIME_EPOCH).toUTCString(), contractSha: CONTRACT_SHA, ok: head.status === 200 && Date.parse(lm) >= MIN_MTIME_EPOCH };
  log('freshness', JSON.stringify(R.freshness));
  if (!R.freshness.ok) R.failures.push(`stale-build: Last-Modified "${lm}" predates contract floor`);

  // ---------- (2) REAL DATA probes ----------
  for (const e of ENTITIES) {
    const r = await fetch('http://localhost:8083/api/v1/displayItem/itemDetails/' + e.id).then(x => x.json());
    e.apiWa = r.whatsappNumber === undefined ? 'ABSENT_KEY' : r.whatsappNumber;
    const match = (e.wa === null) ? (r.whatsappNumber == null) : (String(r.whatsappNumber).replace(/\s/g, '') === e.wa.replace(/\s/g, ''));
    R.probes[e.key] = { id: e.id, apiName: r.productName, apiWa: e.apiWa, matchesExpectation: match };
    if (!match) R.failures.push(`probe-fail ${e.key}: api wa=${JSON.stringify(e.apiWa)} expected ${JSON.stringify(e.wa)}`);
    R.dataAsserts++;
  }
  log('probes', JSON.stringify(R.probes));

  const wire = (p) => {
    p.on('console', m => { if (m.type() === 'error') R.consoleErrors.push(m.text().slice(0, 200)); });
    p.on('pageerror', err => R.consoleErrors.push(('pageerror:' + err).slice(0, 200)));
    p.on('popup', pop => { R.popups.push(pop.url()); log('POPUP-EVENT ->', pop.url().slice(0, 90)); });
  };
  const watch = L.watchImages;

  // ---------- proven primitives ----------
  async function bootAndLogin(p) {
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    let tok = null;
    for (let i = 0; i < 20 && !tok; i++) {           // settle SW-install reload
      await p.waitForTimeout(1500);
      tok = await p.evaluate(() => { try { return localStorage.getItem('flutter.auth_token'); } catch (e) { return null; } }).catch(() => null);
    }
    if (tok && tok.length > 10) return true;
    if (!(await L.waitText(p, 'Buy now', 30000))) return false;
    await p.waitForTimeout(1500);
    if (!(await L.clickBtn(p, 'Login'))) return false;
    await p.waitForTimeout(2200);
    const ei = p.locator('input[type="text"]').first();
    await ei.click({ force: true }).catch(() => {}); await p.waitForTimeout(400);
    await p.keyboard.type(L.BUYER.email);
    const pi = p.locator('input[type="password"]').first();
    await pi.click({ force: true }).catch(() => {}); await p.waitForTimeout(300);
    await p.keyboard.type(L.BUYER.pw);
    await p.waitForTimeout(300);
    if (!(await L.clickBtn(p, 'Log in'))) return false;
    for (let i = 0; i < 25; i++) {
      await p.waitForTimeout(1200);
      tok = await p.evaluate(() => { try { return localStorage.getItem('flutter.auth_token'); } catch (e) { return null; } }).catch(() => null);
      if (tok && tok.length > 10) return true;
    }
    return false;
  }

  // scroll-until the card is tappable+onscreen, then coordinate-click; returns true when
  // the detail screen is actually up (/Add to cart/ marker).
  async function openCardByScroll(p, frag) {
    for (let round = 0; round < 14; round++) {
      const c = await p.evaluate((f) => {
        let best = null;
        document.querySelectorAll('flt-semantics').forEach(e => {
          if (e.getAttribute('flt-tappable') === null) return;
          const tx = (e.textContent || '').trim();
          if (!tx.includes(f)) return;
          const r = e.getBoundingClientRect();
          if (r.width < 40 || r.height < 40 || r.bottom < 0 || r.top > innerHeight - 20) return;
          if (!best || r.width * r.height < best.area)
            best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height };
        });
        return best;
      }, frag);
      if (c) {
        await p.mouse.click(c.cx, Math.min(c.cy, 640));
        await p.waitForTimeout(2500);
        if (/Add to cart/i.test(await L.allText(p))) return true;
      }
      await p.mouse.move(190, 400);
      await p.mouse.wheel(0, 500);
      await p.waitForTimeout(650);
    }
    return false;
  }

  // search path (Flutter exposes a DOM input only while its field holds focus)
  async function searchFor(p, q) {
    const okSearch = await L.clickBtn(p, 'Search');
    await p.waitForTimeout(1200);
    const inp = p.locator('input[type="text"]').first();
    if (await inp.count() === 0) { log('no dom input after Search tap'); return false; }
    await inp.click({ force: true }).catch(() => {});
    await p.waitForTimeout(500);
    await p.keyboard.type(q, { delay: 35 });
    await p.keyboard.press('Enter');
    await p.waitForTimeout(2600);
    return true;
  }

  async function openDetail(p, ent) {
    // strategy A: search then scroll-find
    const searched = await searchFor(p, ent.name.split(' ').slice(0, 3).join(' ')).catch(() => false);
    if (searched && await openCardByScroll(p, ent.frag)) return true;
    // strategy B: back home, scroll the grid itself
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 30000);
    await p.waitForTimeout(2500);
    return openCardByScroll(p, ent.frag);
  }

  // ---------- WA-row tap with full launch-chain evidence ----------
  async function tapWaRow(p, ctx, ent, vk) {
    const st = {};
    const btnLoc = p.locator('flt-semantics[role="button"]').filter({ hasText: 'WhatsApp seller' }).first();
    st.nodePresent = (await btnLoc.count()) > 0;
    st.rowLabel = st.nodePresent ? ((await btnLoc.textContent().catch(() => '')) || '').trim() : null;
    if (!st.nodePresent) return st;
    await btnLoc.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(800);
    const bb = await btnLoc.boundingBox().catch(() => null);
    st.bboxAfterScroll = bb ? { x: Math.round(bb.x), y: Math.round(bb.y), w: Math.round(bb.width), h: Math.round(bb.height) } : null;
    if (!bb) return st;
    await p.evaluate(() => {
      window.__openLog = [];
      const orig = window.open;
      window.open = function (u, n, f) { window.__openLog.push(String(u)); return orig ? orig.call(window, u, n, f) : null; };
    }).catch(() => {});
    st.clicked = await btnLoc.click({ force: true, timeout: 6000 }).then(() => true).catch(() => false);
    await p.waitForTimeout(2800);
    st.openCalls = await p.evaluate(() => (window && window.__openLog) || ['eval-failed']).catch(() => ['eval-failed']);
    st.expectedUrl = 'https://wa.me/' + ent.wa.replace(/[^0-9]/g, '');
    st.launched = (st.openCalls || []).some(u => u.startsWith('https://wa.me/') && u.replace(/[^0-9]/g, '').includes(st.expectedUrl.replace(/[^0-9]/g, '')));
    // strongest evidence: an actual popup target navigating to whatsapp.com
    const cdp = await ctx.newCDPSession(p).catch(() => null);
    if (cdp) {
      const tg = await cdp.send('Target.getTargets').catch(() => null);
      st.targets = tg ? tg.targetInfos.filter(t => t.type === 'page').map(t => t.url.slice(0, 100)) : null;
    } else st.targets = null;
    st.popupNavigated = (st.targets || []).some(u => /whatsapp\.(com|gov)/.test(u) || u.startsWith('https://wa.me'));
    st.noErrorSnackbar = !/Could not open WhatsApp/i.test(await L.allText(p));
    st.appResponsive = await p.evaluate(() => !!document.querySelector('flt-semantics')).catch(() => false);
    R.asserts.push({
      check: 'wa-tap-launches-wame', entity: ent.id, viewport: vk, rowLabel: st.rowLabel,
      openCalls: st.openCalls, expectedUrl: st.expectedUrl, launched: st.launched,
      popupNavigated: st.popupNavigated, targets: st.targets, noErrorSnackbar: st.noErrorSnackbar,
    });
    R.navAsserts++;
    if (!st.launched) R.failures.push(`${ent.key}@${vk}: tap produced no wa.me window.open (log=${JSON.stringify(st.openCalls)})`);
    else if (!st.popupNavigated) R.failures.push(`${ent.key}@${vk}: wa.me requested but no popup target reached whatsapp.com (targets=${JSON.stringify(st.targets)})`);
    if (!st.noErrorSnackbar) R.failures.push(`${ent.key}@${vk}: "Could not open WhatsApp" snackbar after tap`);
    return st;
  }

  const browser = await L.newBrowser();
  const results = {};

  for (const ent of ENTITIES) {
    results[ent.key] = {};
    for (const [vk, vw, vh] of [['375', 375, 667], ['768', 768, 1024]]) {
      const vpath = `${VDIR}/${UNIT}-${ent.key}-${vk}.webm`;
      const ctx = await L.newCtx(browser, { viewport: { width: vw, height: vh }, videoPath: vpath });
      const p = await ctx.newPage();
      wire(p); watch(p);
      const st = {};

      st.loggedIn = await bootAndLogin(p);
      if (!st.loggedIn) {
        R.failures.push(`${ent.key}@${vk}: login failed`);
      } else {
        st.opened = await openDetail(p, ent);
        if (!st.opened) {
          R.failures.push(`${ent.key}@${vk}: could not open product ${ent.id} detail`);
          await L.screenshot(p, `${SHOTS}/flutter-${vk}-${ent.key}-OPENFAIL.png`);
        } else {
          const detailText = await L.allText(p);
          // scroll whole page so any below-fold block enters the semantics-visible set
          await L.scrollToBottom(p, vk === '375' ? 16 : 14);
          await p.waitForTimeout(900);
          const fullText = await L.allText(p);
          st.waLabelVisibleSomewhere = /WhatsApp seller/i.test(fullText);
          st.numberVisibleSomewhere = ent.wa ? fullText.includes(ent.wa) : null;
          st.strayNumbers = ent.expectRow ? null :
            [...new Set([...fullText.matchAll(/\+?255[\s\d]{9,}/g)].map(m => m[0].trim()))];
          R.stateAsserts++;
          R.asserts.push({
            check: `wa-block-${ent.expectRow ? 'present' : 'absent'}`, entity: ent.id, viewport: vk,
            labelSeen: st.waLabelVisibleSomewhere, numberSeen: st.numberVisibleSomewhere,
            strayNumbers: st.strayNumbers,
          });
          if (ent.expectRow) {
            R.dataAsserts++;
            if (!st.waLabelVisibleSomewhere) R.failures.push(`${ent.key}@${vk}: WhatsApp row label missing on detail`);
            if (!st.numberVisibleSomewhere) R.failures.push(`${ent.key}@${vk}: number "${ent.wa}" not rendered`);
            st.tap = await tapWaRow(p, ctx, ent, vk);
            await L.screenshot(p, `${SHOTS}/flutter-${vk}-${ent.key}-after-wa-tap.png`);
            R.shots.push(`${SHOTS}/flutter-${vk}-${ent.key}-after-wa-tap.png`);
            if (!st.tap.clicked) R.buttons.failed.push(`${ent.key}@${vk}:WhatsApp seller (click-failed)`);
          } else {
            if (st.waLabelVisibleSomewhere) R.failures.push(`${ent.key}@${vk}: WhatsApp row VISIBLE though entity has no whatsappNumber — block must be hidden entirely`);
            if ((st.strayNumbers || []).length > 0) R.failures.push(`${ent.key}@${vk}: stray numbers rendered: ${st.strayNumbers.join('|')}`);
          }
          await L.screenshot(p, `${SHOTS}/flutter-${vk}-${ent.key}-detail.png`);
          R.shots.push(`${SHOTS}/flutter-${vk}-${ent.key}-detail.png`);
        }
      }
      results[ent.key][vk] = st;
      await L.closeVideo(ctx, vpath);
      R.videos.push(vpath);
    }
  }

  // ---------- reference parity (:3000 = THE JUDGE, proxies apidev) ----------
  // Sandbox entities 615/627/628 do not exist on apidev -> judge shows its own not-found
  // state for them (captured as evidence of the backend mismatch, not a Flutter defect).
  // Positive-case parity uses apidev product 508 (Samsung A17, whatsappNumber present):
  // proves whether the JUDGE itself renders any per-listing whatsapp contact row.
  const refResults = {};
  for (const [rk, rid] of [['wa627', 627], ['nowa628', 628], ['ref-apidev-wa508', 508]]) {
    const ctx3 = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
    const p3 = await ctx3.newPage(); wire(p3);
    await p3.goto(`${REF}/product/${rid}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await p3.waitForTimeout(9000);
    await p3.screenshot({ path: `${SHOTS}/ref-375-${rk}.png` }).catch(() => {});
    R.shots.push(`${SHOTS}/ref-375-${rk}.png`);
    const txt = await p3.evaluate(() => document.body.innerText).catch(() => '');
    refResults[rk] = {
      titleSeen: txt.includes('Globoexpats'),
      notFound: /Product not found/i.test(txt),
      anyWhatsappLabel: /whatsapp/i.test(txt),
      numbers: [...new Set([...txt.matchAll(/\+?255[\s\d]{9,}/g)].map(m => m[0].trim()))].slice(0, 4),
    };
    await ctx3.close();
  }
  results.ref = refResults;
  log('ref', JSON.stringify(refResults));

  await browser.close();

  // ---------- images summary ----------
  const imgs = Object.entries(R.images);
  const broken = imgs.filter(([, s]) => !(s === 200 || s === 304)).map(([u, s]) => u.slice(-60) + ' -> ' + s);

  const line = {
    ts: new Date().toISOString(), unit: UNIT, title: 'Contact-seller WhatsApp row (AU-019)', wave: 'verify',
    agent: 'verifier-AU-019-r3', build_sha: CONTRACT_SHA, build_mtime: R.freshness.lastModified,
    viewport: '375x667+768x1024',
    verdict: 'PENDING_VISION',
    checks: {
      real_data: true, real_data_probe: JSON.stringify(R.probes),
      images_requested: imgs.length, images_200: imgs.length - broken.length, images_broken: broken,
      buttons_total: R.buttons.total, buttons_ok: R.buttons.ok, buttons_failed: R.buttons.failed,
      state_asserts: R.asserts.length, nav_asserts: R.navAsserts, data_asserts: R.dataAsserts,
      vision_defects: null, vision_findings: ['PENDING native PNG read'],
      parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
    },
    attacks_attempted: 0, attacks_broken: 0,
    failures: R.failures.concat(broken), evidence: R.shots.concat(R.videos),
    runtime_ms: Date.now() - t0,
  };
  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/raw-AU-019-r3.json',
    JSON.stringify({ line, results, asserts: R.asserts, effects: R.buttons.effects, consoleErrors: R.consoleErrors.slice(0, 40), popups: R.popups }, null, 2));
  console.log('RESULTS-JSON');
  console.log(JSON.stringify({ results, asserts: R.asserts, failures: R.failures, images: imgs.length, broken, popups: R.popups }, null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
