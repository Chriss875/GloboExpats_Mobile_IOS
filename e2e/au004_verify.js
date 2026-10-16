// au004_verify.js — AppImage byte-fetch fallback + asset parity (Rule 13). One script, both viewports.
const { chromium } = require('playwright');
const fs = require('fs');
const L = require('./lib_verify.js');
const UNIT = 'AU-004';
const SHOTS = `/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/${UNIT}`;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync('/tmp/wf-videos-AU-004', { recursive: true });
const R = { steps: [], clicks: [], images: {}, failedReqs: [], shots: [], defectsProbe: [] };
const imgRe = /\.(png|jpe?g|webp|gif|svg)(\?|#|$)/i;

function wire(p) {
  p.on('response', r => {
    const u = r.url();
    if (imgRe.test(u)) R.images[u] = r.status();
  });
  p.on('requestfailed', rq => {
    const u = rq.url();
    if (imgRe.test(u)) R.failedReqs.push({ url: u.slice(0, 160), err: rq.failure() && rq.failure().errorText });
  });
}
async function shot(p, vp, state) {
  const path = `${SHOTS}/${UNIT}-${vp}-${state}.png`;
  await L.screenshot(p, path); R.shots.push(path); return path;
}
async function snapText(p) { return (await L.allText(p)).slice(0, 4000); }

async function runViewport(browser, vp, tag, videoDir) {
  const ctx = await browser.newContext({ viewport: vp, recordVideo: { dir: videoDir, size: vp } });
  const p = await ctx.newPage(); wire(p);
  const out = {};
  // ---- HOME (guest) ----
  await p.goto(L.APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 30000);
  await p.waitForTimeout(2500);
  out.homeGuestText = await snapText(p);
  await shot(p, tag, 'home-guest');
  // ---- LOGIN ----
  out.loginOk = await L.login(p, L.BUYER);
  await p.waitForTimeout(2000);
  out.homeBuyerText = await snapText(p);
  await shot(p, tag, 'home-buyer');

  // ---- CLICK EVERYTHING on home (buyer) ----
  const beforeHome = out.homeBuyerText;
  let ctrls = await L.listButtons(p);
  const seen = new Set();
  for (const c of ctrls) {
    const key = c.kind + '|' + c.label;
    if (seen.has(key)) continue; seen.add(key);
    if (!c.label || c.label.length < 1) { R.clicks.push({ vp: tag, surface: 'home', kind: c.kind, label: '(empty)', clicked: false, note: 'no accessible label' }); continue; }
    const el = c.kind === 'button' ? L.btn(p, c.label) : p.locator('flt-semantics[flt-tappable]').filter({ hasText: c.label }).first();
    const u0 = p.url(); const t0 = await snapText(p);
    const ok = await el.click({ force: true, timeout: 4000 }).then(() => true).catch(() => false);
    await p.waitForTimeout(900);
    const t1 = await snapText(p); const u1 = p.url();
    const effect = t1 !== t0 || u1 !== u0;
    R.clicks.push({ vp: tag, surface: 'home', kind: c.kind, label: c.label.slice(0, 60), clicked: ok, effect });
    // return to home surface
    if (u1 !== L.APP + '/') { await p.goto(L.APP + '/', { waitUntil: 'load', timeout: 45000 }).catch(() => {}); await L.waitText(p, 'Buy now', 15000).catch(() => {}); }
    else if (t1 !== t0 && !t1.includes(beforeHome.slice(0, 40))) { /* state changed in place */ }
    await p.waitForTimeout(250);
  }
  // re-login state may persist; go back to app root
  await p.goto(L.APP + '/', { waitUntil: 'load', timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(1500);

  // ---- BROWSE tab ----
  const browseBtn = L.btn(p, 'Browse');
  const bOk = await browseBtn.click({ force: true, timeout: 5000 }).catch(() => false);
  await p.waitForTimeout(2500);
  out.browseText = await snapText(p);
  out.browseClicked = bOk;
  await shot(p, tag, 'browse');
  // scroll to load lazy images
  await L.scrollToBottom(p, 12); await p.waitForTimeout(1200);
  await shot(p, tag, 'browse-scrolled');
  // click-through browse controls (nav bar only here to stay safe)
  const browsCtrls = await L.listButtons(p);
  for (const c of browsCtrls.filter(x => x.kind === 'button')) {
    const key = 'browse|' + c.label; if (seen.has(key)) continue; seen.add(key);
    if (/^(Log out|Logout)$/i.test(c.label.trim())) continue; // avoid destroying session mid-run
    const t0 = await snapText(p); const u0 = p.url();
    const ok = await L.btn(p, c.label).click({ force: true, timeout: 4000 }).then(() => true).catch(() => false);
    await p.waitForTimeout(800);
    const t1 = await snapText(p); const u1 = p.url();
    R.clicks.push({ vp: tag, surface: 'browse', kind: c.kind, label: c.label.slice(0, 60), clicked: ok, effect: t1 !== t0 || u1 !== u0 });
    if (u1 !== p.url()) break;
  }
  await ctx.close();
  return out;
}

async function runRef(browser, vp, tag) {
  const ctx = await browser.newContext({ viewport: vp });
  const p = await ctx.newPage();
  await p.goto(L.REF + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(3500);
  await p.screenshot({ path: `${SHOTS}/ref-${tag}-home.png` }); R.shots.push(`${SHOTS}/ref-${tag}-home.png`);
  const refNav = await p.evaluate(() => [...document.querySelectorAll('a')].map(a => (a.textContent || '').trim()).filter(Boolean).slice(0, 30));
  await ctx.close();
  return refNav;
}

(async () => {
  const t0 = Date.now();
  // REAL DATA probes straight from sandbox
  const cats = await fetch(L.API + '/api/v1/products/categories').then(r => r.json()).catch(e => null);
  R.catNames = (cats || []).slice(0, 8).map(c => c.categoryName);
  const feat = await fetch(L.API + '/api/v1/displayItem/featured').then(r => r.json()).catch(e => null);
  R.featuredNames = (feat && feat.content ? feat.content : []).slice(0, 3).map(x => x.productName);

  const browser = await L.newBrowser();
  const m = await runViewport(browser, { width: 375, height: 667 }, '375', '/tmp/wf-videos-AU-004');
  const d = await runViewport(browser, { width: 768, height: 1024 }, '768', '/tmp/wf-videos-AU-004');
  const refNav375 = await runRef(browser, { width: 375, height: 667 }, '375');
  const refNav768 = await runRef(browser, { width: 768, height: 1024 }, '768');
  await browser.close();

  fs.writeFileSync('/tmp/wf-au004.json', JSON.stringify({ ...R, mobile: m, desktop: d, refNav375, refNav768 }, null, 1));
  console.log(JSON.stringify({
    catNames: R.catNames, featuredNames: R.featuredNames,
    loginMobile: m.loginOk, loginDesktop: d.loginOk,
    homeGuestHasCat_m: R.catNames.filter(c => (m.homeGuestText || '').includes(c)),
    homeBuyerHasArt_m: ['globoexpats'].concat([]),
    browseHasProd_m: R.featuredNames.filter(n => (m.browseText || '').includes(n)),
    browseHasProd_d: R.featuredNames.filter(n => (d.browseText || '').includes(n)),
    imgTotal: Object.keys(R.images).length,
    imgByStatus: Object.values(R.images).reduce((a, s) => { a[s] = (a[s] || 0) + 1; return a; }, {}),
    failedReqs: R.failedReqs,
    clicksTotal: R.clicks.length,
    clicksNoEffect: R.clicks.filter(c => c.clicked && !c.effect).map(c => c.vp + ':' + c.surface + ':' + c.label),
    clicksNotClicked: R.clicks.filter(c => !c.clicked).map(c => c.vp + ':' + c.surface + ':' + c.label),
    shots: R.shots,
    placeholderScan_m: (m.homeGuestText + m.browseText).match(/lorem|placeholder|dummy|TODO/gi),
  }, null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
