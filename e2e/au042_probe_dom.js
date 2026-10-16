// au042_probe_dom.js — inspect the semantics tree of the review screen: how do
// Checkboxes / action buttons / receipt tiles translate to flt-semantics nodes?
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9130';
(async () => {
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage(); p.setDefaultTimeout(30000);
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await p.evaluate(() => localStorage.clear()).catch(() => {});
  await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 40000);
  console.log('login', await L.login(p, L.ADMIN));
  await p.evaluate(() => { window.location.hash = '#/admin/payments-review'; });
  await L.waitText(p, 'Payment review', 30000);
  await p.waitForTimeout(4500);
  const nodes = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => {
    const r = e.getBoundingClientRect();
    const attrs = {};
    for (const a of e.attributes) attrs[a.name] = a.value;
    return { tag: e.tagName, ...attrs, label: ((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '')).trim().slice(0, 60),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      checked: e.hasAttribute('aria-checked') ? e.getAttribute('aria-checked') : null };
  }).filter(n => n.label));
  // print everything in the vertical band of the FIRST row area
  const interesting = nodes.filter(n => n.role || n.checked !== null || n.flutappable !== undefined);
  for (const n of nodes.filter(n => (n.role === 'button' || n.role === 'checkbox' || n.checked !== null || String(n['flt-tappable']) === ''))) {
    console.log(JSON.stringify(n));
  }
  console.log('--- all roles present:', [...new Set(nodes.map(n => n.role))].join(','));
  console.log('--- sample of first 40 labelled nodes:');
  for (const n of nodes.slice(0, 40)) console.log(JSON.stringify(n));
  await ctx.close(); await browser.close();
})().catch(e => { console.error('PROBE CRASH', e.message); process.exit(1); });
