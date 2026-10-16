// au052_probe_r14.js — quick smoke: frozen lane :9131, base product 913,
// dump a11y text + API calls + rail cards. Feeds the full verify design.
process.chdir(require('path').resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9131';
const API = 'http://localhost:8083';
const PID = 913;

(async () => {
  const browser = await L.newBrowser();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  const apiCalls = [];
  p.on('request', r => { const u = r.url(); if (u.includes(':8083/api/') && !u.includes('/uploads/')) apiCalls.push(u.replace(API, '')); });
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 40; i++) {
    const t = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');
    if (t.includes('GloboExpats')) break;
    await p.waitForTimeout(1000);
  }
  console.log('APP READY');
  apiCalls.length = 0;
  await p.evaluate(i => { window.location.hash = '#/product/' + i; }, PID);
  let txt = '';
  for (let i = 0; i < 30; i++) {
    txt = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');
    if (txt.includes('You Might Also Like') && txt.includes('Description')) break;
    await p.waitForTimeout(800);
  }
  await p.waitForTimeout(2500);
  txt = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('--- DETAIL TEXT (first 1800 chars) ---');
  console.log(txt.slice(0, 1800));
  console.log('--- API CALLS on detail route ---');
  console.log([...new Set(apiCalls)].join('\n'));
  // rail card enumeration
  const cards = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics[flt-tappable]').forEach(e => {
      const raw = (e.textContent || '').trim();
      const first = raw.split('\n')[0].trim();
      if (/TSh\s[\d,]+/.test(raw) && first.length > 3 && !/^TSh/.test(first)) out.push(raw.split('\n').slice(0,2).join(' | '));
    });
    return [...new Set(out)];
  });
  console.log('--- TAPPABLE CARDS WITH PRICE (' + cards.length + ') ---');
  console.log(cards.join('\n'));
  // buttons
  const ctrls = await L.listButtons(p);
  console.log('--- BUTTON CONTROLS ---');
  console.log(JSON.stringify(ctrls.filter(c => c.kind === 'button'), null, 1));
  await L.screenshot(p, 'e2e/shots/AU-052/probe-r14-detail.png');
  await L.closeVideo(ctx, null);
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
