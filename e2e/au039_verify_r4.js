// au039_verify_r4.js — final leg: post-DELIVERED buyer UI on fixture B (code card gone,
// Delivered status, Rate Seller present) + rating dialog opens (r3 gap). 375 only.
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9112';
const fxB = JSON.parse(fs.readFileSync('/tmp/au039_fixtures_b.json', 'utf8'));
const SHOT_DIR = 'e2e/shots/AU-039';
const OID = String(fxB.orderId), ONUM = fxB.orderNumber;
const R = { ts: new Date().toISOString(), unit: 'AU-039', stage: 'verify-r4', asserts: [], failures: [], network: [] };
const ok = (n, c, d) => { R.asserts.push({ name: n, pass: !!c, detail: String(d || '').slice(0, 200) }); console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? ' :: ' + String(d).slice(0, 150) : '')); if (!c) R.failures.push(n); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const txt = p => p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');
async function isLoggedIn(p) { try { return !!await p.evaluate(() => localStorage.getItem('flutter.auth_token') || ''); } catch (e) { return false; } }
async function findNode(p, label) {
  return p.evaluate((lbl) => { let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => { const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return;
      if (!best || r.width * r.height < best.area) best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }); return best; }, label);
}
async function tap(p, label, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const h = await findNode(p, label);
    if (h) { await p.mouse.click(Math.max(3, Math.min(h.x, 760)), Math.max(20, Math.min(h.y, 1015))); await sleep(1200); return true; }
    await p.mouse.move(190, 350); await p.mouse.wheel(0, i % 2 === 0 ? 260 : -260); await sleep(320);
  } return false;
}
(async () => {
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-039-r4-delivered.webm' });
  const p = await ctx.newPage();
  p.on('response', r => { const u = r.url(); if (/localhost:8083\/api\//.test(u)) R.network.push(`${r.request().method()} ${u.replace('http://localhost:8083', '')} -> ${r.status()}`); });
  const imgs = L.watchImages(p);
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000);
  if (!(await isLoggedIn(p))) {
    await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
    const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(fxB.buyer.email, { delay: 14 });
    const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(fxB.buyer.pw, { delay: 14 });
    await L.clickBtn(p, 'Log in');
    let li = false; for (let i = 0; i < 30 && !li; i++) { await sleep(1000); li = await isLoggedIn(p); }
    ok('login', li, '');
  }
  await sleep(1500);
  await p.goto(APP + '/orders', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await sleep(5200);
  let T = await txt(p);
  ok('list-shows-B', T.includes(ONUM), ONUM);
  ok('open-detail', await tap(p, ONUM, 4), '');
  await sleep(2200);
  T = await txt(p);
  ok('T19-B-status-delivered', /Delivered/i.test(T), T.split('\n').filter(x => /deliver/i.test(x)).slice(0, 3).join('|'));
  ok('T19-B-no-code-card', !T.includes('Share this code with the driver'), 'card hidden after DELIVERED');
  ok('T19-B-old-code-absent', !T.includes(String(fxB.codeAfterRegen)), fxB.codeAfterRegen);
  await L.screenshot(p, `${SHOT_DIR}/flutter-375-r4-01-B-delivered.png`);
  ok('T19-B-rate-seller-present', await tap(p, 'Rate Seller', 6), '');
  await sleep(1600);
  T = await txt(p);
  ok('T19-rating-dialog-open', !!await findNode(p, 'Submit') && /rating|star|review|Rate/i.test(T),
    T.split('\n').filter(x => /rate|star|review|submit/i.test(x)).slice(0, 3).join('|'));
  await L.screenshot(p, `${SHOT_DIR}/flutter-375-r4-02-rating-dialog.png`);
  // close WITHOUT submitting (keep fixture for humans)
  for (const lbl of ['Cancel', 'Back']) { if (await findNode(p, lbl)) { await tap(p, lbl, 1); break; } }
  await sleep(800);
  const fin = await L.api(fxB.buyer.token, 'GET', `/api/v1/orders/${OID}`);
  ok('no-fake-submit-order-still-DELIVERED-unrated', fin.json.status === 'DELIVERED' && fin.json.buyerRated !== true,
    `status=${fin.json.status} buyerRated=${fin.json.buyerRated}`);
  const im = L.imageSummary(imgs);
  await ctx.close(); await browser.close();
  const line = { ts: R.ts, unit: 'AU-039', stage: 'verify-r4', agent: 'verifier-AU-039-RW', build_sha: '858b0ef',
    viewport: '375x667', verdict: R.failures.length ? 'FAIL' : 'PASS',
    checks: { images_requested: im.total, images_200: im.ok }, failures: R.failures, asserts: R.asserts,
    network: R.network.slice(0, 40) };
  fs.mkdirSync('e2e/results/shards', { recursive: true });
  fs.appendFileSync('e2e/results/shards/AU-039-verify.jsonl', JSON.stringify(line) + '\n');
  fs.writeFileSync('/tmp/au039_r4_result.json', JSON.stringify(R, null, 2));
  console.log('\nimages:', im.total, im.ok, im.failed);
  console.log('R4 DONE. fails:', R.failures.length ? R.failures.join(' | ') : 'none');
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
