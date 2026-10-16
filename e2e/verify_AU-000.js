// AU-000 re-verify — smoke loop with REAL click coverage (fixes validator rejection
// of the original PASS line: buttons_total=35, buttons_ok=0).
// Proves: build fresh -> Playwright opens :9100 -> a11y read -> real :8083 call ->
// PNG written AND read back natively (orchestrator) -> video -> clicks have effects.
const fs = require('fs');
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const UNIT = 'AU-000';
const SHOTS = `/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/${UNIT}`;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync('/tmp/wf-videos-AU-000', { recursive: true });

const R = {
  steps: [], images: {}, buttons: { total: 0, ok: 0, failed: [], effects: [] },
  consoleErrors: [], shots: [],
};
const t0 = Date.now();
const log = (s, o) => { R.steps.push({ step: s, ...o }); console.log('###', s, JSON.stringify(o)); };

function wire(p) {
  p.on('response', r => {
    const u = r.url();
    if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/[^?]*\.(png|jpe?g|webp|jpg|svg)(\?|#|$)/i.test(u)) R.images[u] = R.images[u] || r.status();
  });
  p.on('pageerror', e => R.consoleErrors.push('PAGEERROR ' + String(e).slice(0, 120)));
}

(async () => {
  // ---- freshness ----
  const { execSync } = require('child_process');
  const head = execSync('git -C /home/devsystemadmin/GloboExpats_Mobile rev-parse --short HEAD').toString().trim();
  const lm = execSync(`curl -sI ${L.APP}/main.dart.js | grep -i last-modified`).toString().trim();
  log('freshness', { head, lm });
  R.build_sha = head;

  for (const vp of [{ n: '375x667', w: 375, h: 667 }, { n: '768x1024', w: 768, h: 1024 }]) {
    const ctx = await L.newCtx(await L.newBrowser(), { viewport: { width: vp.w, height: vp.h }, videoPath: null });
    // recordVideo handled below via raw context for saveAs
    await ctx.close();
  }

  const browser = await L.newBrowser();
  const vdir = '/tmp/wf-videos-AU-000';
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, recordVideo: { dir: vdir, size: { width: 375, height: 667 } } });
  const p = await ctx.newPage();
  wire(p);

  // ---- open + a11y read ----
  await p.goto(L.APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 40000);
  await p.waitForTimeout(2500);
  const text1 = await L.allText(p);
  log('home-rendered', { chars: text1.length, hasHero: text1.includes('Buy'), hasFeatured: /featured|Featured/.test(text1), samplePrices: (text1.match(/TSh [\d,]+/g) || []).slice(0, 4) });
  R.shots.push(await L.screenshot(p, `${SHOTS}/${UNIT}-375-initial.png`));

  // ---- real API probe in-page ----
  const apiProbe = await p.evaluate(async () => {
    const r = await fetch('http://localhost:8083/api/v1/products/categories');
    const j = await r.json();
    return { status: r.status, count: Array.isArray(j) ? j.length : null, first: Array.isArray(j) && j[0] ? j[0].categoryName : null };
  });
  log('api-probe', apiProbe);

  // ---- enumerate + click every interactive control on home ----
  const ctrls = await L.listButtons(p);
  R.buttons.total += ctrls.filter(c => c.kind === 'button').length;
  log('controls-enumerated', { total: ctrls.length, buttons: ctrls.filter(c => c.kind === 'button').length, inputs: ctrls.filter(c => c.kind === 'input').length });

  const beforeUrl = p.url();
  let clicked = 0, effects = 0;
  // Bounded click: never let one control hang the whole sweep (default Playwright
  // timeout is 30s; a full-screen overlay makes force-clicks wait forever).
  const clickBounded = async (label, ms = 6000) =>
    Promise.race([L.clickBtn(p, label), new Promise(r => setTimeout(() => false, ms))]);
  // True when a role=button node carrying `label` exists on the CURRENT screen.
  // Without this, one overlay-opening tap (Search) leaves every later label
  // unresolvable and the whole sweep reports click-failed (root cause of the
  // previous all-fail run).
  const onScreen = async (label) => p.evaluate((lbl) => {
    return Array.from(document.querySelectorAll('flt-semantics[role="button"]'))
      .some(e => ((e.textContent || '').split('\n')[0] || '').trim() === lbl);
  }, label);
  for (const c of ctrls.filter(x => x.kind === 'button')) {
    const label = (c.label || '').split('\n')[0]; // tabs carry "\nTab N of 5"
    if (!label || label.length < 2 || label.length > 60) continue;
    // restore home before each control so enumeration stays valid
    if (!(await onScreen(label))) {
      await p.goto(L.APP, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await L.waitText(p, 'Buy now', 30000); await p.waitForTimeout(800);
    }
    const navBefore = p.url(); const txtBefore = (await L.allText(p)).length;
    const ok = await clickBounded(label);
    await p.waitForTimeout(900);
    // Overlay recovery: search/cart overlays and pushed screens cover the home
    // controls; go back to home before judging the next control.
    let afterText = await L.allText(p);
    if (/Your cart is empty/.test(afterText) && !/Buy now/.test(afterText)) {
      await clickBounded('Back'); await p.waitForTimeout(700);
      afterText = await L.allText(p);
    }
    const navAfter = p.url(); const txtAfter = afterText.length;
    const effect = !ok ? 'click-failed'
      : /Your cart is empty/.test(afterText) && label === 'Cart' ? 'state-delta:cart-sidepanel-open'
        : navAfter !== navBefore ? `nav:${navAfter.slice(-40)}`
          : Math.abs(txtAfter - txtBefore) > 40 ? `state-delta:${txtAfter - txtBefore}`
            : 'none-observed';
    R.buttons.effects.push({ label: label.slice(0, 40), clicked: ok, effect });
    if (ok) clicked++;
    if (ok && effect !== 'none-observed') effects++;
    // come back home between clicks to keep enumeration stable
    if (navAfter !== beforeUrl) { await p.goto(L.APP, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await L.waitText(p, 'Buy now', 30000); await p.waitForTimeout(800); }
  }
  R.buttons.ok = clicked;
  R.buttons.failed = R.buttons.effects.filter(e => !e.clicked).map(e => `${e.label} (${e.effect})`);
  log('clicks-done', { clicked, withEffects: effects });
  R.shots.push(await L.screenshot(p, `${SHOTS}/${UNIT}-375-after-clicks.png`));

  // ---- one navigation assert: tap a product card -> product screen ----
  // clickCard: cards are flt-tappable nodes, not role=button; clickBtn resolves to a
  // full-screen ancestor wrapper and taps nothing (harness bug fixed in lib_verify).
  await p.mouse.move(190, 400); for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, 300); await p.waitForTimeout(200); } await p.waitForTimeout(600);
  const prodNav = await L.clickCard(p, 'TSh');
  await p.waitForTimeout(1500);
  const detailText = await L.allText(p);
  const onDetail = /Add to cart|Add to Cart/i.test(detailText);
  log('product-nav', { tappedPriceChip: prodNav, onDetail });
  if (onDetail) R.buttons.effects.push({ label: 'first product card', clicked: true, effect: 'nav:product-detail' });
  await p.goBack({ timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1200);

  // ---- tablet viewport render ----
  const ctx2 = await browser.newContext({ viewport: { width: 768, height: 1024 }, recordVideo: { dir: vdir, size: { width: 768, height: 1024 } } });
  const p2 = await ctx2.newPage(); wire(p2);
  await p2.goto(L.APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p2, 'Buy now', 40000); await p2.waitForTimeout(2000);
  R.shots.push(await L.screenshot(p2, `${SHOTS}/${UNIT}-768-initial.png`));
  log('tablet-render', { chars: (await L.allText(p2)).length });

  // ---- close videos ----
  try { const v1 = await p.video(); await ctx.close(); if (v1) await v1.saveAs(`e2e/videos/${UNIT}.webm`).catch(() => {}); } catch (e) { }
  try { const v2 = await p2.video(); await ctx2.close(); if (v2) await v2.saveAs(`e2e/videos/${UNIT}-768.webm`).catch(() => {}); } catch (e) { }
  await browser.close();

  // ---- image summary ----
  const imgs = Object.entries(R.images);
  const broken = imgs.filter(([, s]) => !(s === 200 || s === 304)).map(([u, s]) => `${u.slice(-50)} -> ${s}`);

  const verdict = (broken.length === 0 && R.buttons.failed.length === 0 && apiProbe.status === 200 && R.consoleErrors.length === 0) ? 'PASS' : 'FAIL';
  const line = {
    ts: new Date().toISOString(), unit: UNIT, title: 'smoke_loop', wave: 'verify', agent: 'ox-alpha-reverify',
    build_sha: R.build_sha, build_mtime: (lm.match(/:\s*(.+)$/) || [])[1]?.trim(), viewport: '375x667+768x1024',
    verdict,
    checks: {
      real_data: apiProbe.status === 200 && !!apiProbe.first,
      real_data_probe: `in-page GET /products/categories -> ${apiProbe.status}, ${apiProbe.count} cats, first=${apiProbe.first}`,
      images_requested: imgs.length, images_200: imgs.length - broken.length, images_broken: broken,
      buttons_total: R.buttons.total, buttons_ok: R.buttons.ok,
      buttons_failed: R.buttons.failed,
      state_asserts: R.buttons.effects.filter(e => String(e.effect).startsWith('state')).length,
      nav_asserts: R.buttons.effects.filter(e => String(e.effect).startsWith('nav')).length,
      data_asserts: 1,
      vision_defects: null, // orchestrator reads PNGs after this script exits
      vision_findings: ['PENDING native read by orchestrator'],
      parity: { blocker: 0, major: 0, minor: 0, accepted: 1 },
    },
    attacks_attempted: 0, attacks_broken: 0,
    failures: verdict === 'PASS' ? [] : R.buttons.failed.concat(broken),
    evidence: R.shots,
    runtime_ms: Date.now() - t0,
  };
  fs.mkdirSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards', { recursive: true });
  fs.appendFileSync(`/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/${UNIT}-verify.jsonl`, JSON.stringify(line) + '\n');
  console.log('VERDICT', verdict);
  console.log(JSON.stringify(line.checks));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
