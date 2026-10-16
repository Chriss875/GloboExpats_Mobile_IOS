// au042_r9d_diag.js — scroll UP to reveal the sticky 'Bulk approve (2)' bar, click it,
// and prove the wire call + backend CONFIRMED for both rows. The bar sits at the TOP of
// the list (y<0 after scrolling down through cards), so the driver must wheel UP.
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
L.APP = 'http://localhost:9130';
(async () => {
  const vp = { w: 768, h: 1024 };
  const APP = 'http://localhost:9130';
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: vp.w, height: vp.h }, videoPath: '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-042-r9c-768.webm' });
  const p = await ctx.newPage(); p.setDefaultTimeout(30000);
  const apiLog = [];
  p.on('response', r => {
    const u = r.url();
    if (/localhost:8083/.test(u)) apiLog.push({ m: r.request().method(), u: u.replace(/^https?:\/\/[^/]+/, '').split('?')[0], s: r.status() });
  });
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await p.evaluate(() => localStorage.clear()).catch(() => {});
  await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 40000);
  console.log('login', await L.login(p, L.ADMIN));
  await p.evaluate(() => { window.location.hash = '#/admin/payments-review'; });
  await L.waitText(p, 'Payment review', 30000); await p.waitForTimeout(4200);
  const fx2 = JSON.parse(fs.readFileSync('/tmp/au042_r9_fixtures_s2.json', 'utf8'));
  async function dump() {
    return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => {
      const r = e.getBoundingClientRect();
      return { role: e.getAttribute('role') || '', tap: e.getAttribute('flt-tappable') !== null,
        label: (e.getAttribute('aria-label') || e.textContent || '').trim(), checked: e.getAttribute('aria-checked'),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }).filter(n => n.label));
  }
  for (const pf of [fx2.A2.proformaNumber, fx2.B2.proformaNumber]) {
    let done = false;
    for (let i = 0; i < 20 && !done; i++) {
      let nodes = await dump();
      let c = nodes.find(n => n.role === 'checkbox' && n.label.includes(pf));
      if (!c) break;
      if (c.checked === 'true') { done = true; break; }
      if (c.y >= 130 && c.y + c.h <= vp.h - 70) {
        await p.mouse.click(c.x + 26, c.y + 22); await p.waitForTimeout(1400); done = true;
      } else {
        await p.mouse.move(vp.w / 2, vp.h * 0.5);
        await p.mouse.wheel(0, (c.y + c.h / 2 > vp.h * 0.55 ? 1 : -1) * 300); await p.waitForTimeout(230);
      }
    }
    const nc = (await dump()).find(n => n.role === 'checkbox' && n.label.includes(pf));
    console.log(pf, 'checked=', nc && nc.checked);
  }
  // scroll UP until the Bulk bar is on screen
  let bulk = null;
  for (let i = 0; i < 24; i++) {
    const nodes = await dump();
    bulk = nodes.filter(n => n.role === 'button' && n.label.includes('Bulk approve'))
      .sort((a, b) => a.w * a.h - b.w * b.h)[0] || null;
    if (bulk && bulk.y >= 100 && bulk.y + bulk.h <= vp.h - 12) break;
    await p.mouse.move(vp.w / 2, vp.h * 0.5); await p.mouse.wheel(0, -320); await p.waitForTimeout(240);
  }
  if (!bulk) { console.log('BULK BAR NOT FOUND'); process.exit(1); }
  console.log('bulk bar on screen at y=', bulk.y, 'h=', bulk.h);
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-042/AU-042-r9-768-02-multiselect-two.png' });
  await p.mouse.click(bulk.x + bulk.w / 2, bulk.y + bulk.h / 2); await p.waitForTimeout(4200);
  const t = (await dump()).map(n => n.label).join('\n');
  console.log('approved-msg:', /2 approved/.test(t), '|', (t.split('\n').find(l => l.includes('approved')) || '(none)').trim().slice(0, 90));
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-042/AU-042-r9-768-03-bulk-approved-2.png' });
  const wireBulk = apiLog.find(c => c.u.includes('/admin/proformas/bulk-approve'));
  console.log('wire:', JSON.stringify(wireBulk));
  const atok = await L.apiLogin(L.ADMIN);
  const qc2 = await L.api(atok, 'GET', '/api/v1/admin/payments?status=CONFIRMED&page=0&size=50');
  console.log('A2 confirmed=', (qc2.json.content || []).some(x => x.proformaId === fx2.A2.proformaId),
    'B2 confirmed=', (qc2.json.content || []).some(x => x.proformaId === fx2.B2.proformaId));
  const ra2 = (qc2.json.content || []).find(x => x.proformaId === fx2.A2.proformaId);
  const oid2 = ra2 && (ra2.orderIds || [])[0];
  if (oid2) {
    const btok = fx2.buyerToken;
    const od2 = await L.api(btok, 'GET', `/api/v1/orders/${oid2}`);
    console.log('A2 order:', JSON.stringify({ paymentStatus: od2.json.paymentStatus, escrowPending: od2.json.escrowPending, payoutStatus: od2.json.payoutStatus, orderStatus: od2.json.orderStatus }));
  }
  await ctx.close(); await browser.close();
})().catch(e => { console.error('DIAG CRASH', e.message); process.exit(1); });
