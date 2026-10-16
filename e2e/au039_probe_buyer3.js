// au039_probe_buyer3.js — FOCUSED D2 probe: buyer taps Verify delivery 3x on the
// tracking screen of a genuinely IN_TRANSIT order. Records every network call +
// the exact a11y text after each tap + screenshots. Answers: does a 403 count
// toward lockout, and is any error surfaced?
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9121';
const R = { calls: [], states: [], shots: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const fxC = JSON.parse(fs.readFileSync('/tmp/au039_fixtures_c.json', 'utf8'));
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-039-r6-d2-probe.webm' });
  const p = await ctx.newPage();
  p.on('response', async r => {
    const u = r.url(); if (!/localhost:8083\/api\//.test(u)) return;
    if (/verify-delivery|regenerate/.test(u)) {
      let body = null; try { body = await r.json(); } catch (e) {}
      R.calls.push({ line: `${r.request().method()} ${u.replace('http://localhost:8083', '')} -> ${r.status()}`, body });
    }
  });
  // login
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000);
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
  const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(fxC.buyer.email, { delay: 12 });
  const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(fxC.buyer.pw, { delay: 12 });
  await L.clickBtn(p, 'Log in');
  let li = false; for (let i = 0; i < 30 && !li; i++) { await sleep(1000); li = !!(await p.evaluate(() => localStorage.getItem('flutter.auth_token') || '')); }
  console.log('login:', li);
  await sleep(1500);
  await p.evaluate(() => { window.location.hash = '#/orders'; }); await sleep(5200);
  const dump0 = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('list has ORD-088:', dump0.includes('ORD-2026-000088'));
  // open detail via smallest tappable node containing the order number
  const cands = await p.evaluate(() => { const o = [];
    document.querySelectorAll('flt-semantics').forEach(e => { const t = (e.textContent || '').trim();
      if (!t.includes('ORD-2026-000088') || e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect(); if (r.width < 40 || r.height < 40 || r.bottom < 0 || r.top > innerHeight) return;
      o.push({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), area: r.width * r.height }); });
    o.sort((a, b) => a.area - b.area); return o.slice(0, 2); });
  for (const c of cands) { await p.mouse.click(c.x, Math.max(20, Math.min(c.y, 640))); await sleep(1600); break; }
  const dump1 = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('detail code visible:', dump1.includes('603698'));
  // Track delivery
  const tb = await p.evaluate(() => { let b = null;
    document.querySelectorAll('flt-semantics').forEach(e => { if (b) return;
      if ((e.textContent || '').includes('Track delivery') && (e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null)) {
        const r = e.getBoundingClientRect(); b = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; } });
    return b; });
  console.log('track btn:', JSON.stringify(tb));
  if (tb) { await p.mouse.click(tb.x, Math.max(20, Math.min(tb.y, 640))); await sleep(2600); }
  let T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('tracking open:', T.includes('Delivery tracking'), '| handover copy present:', T.includes('Delivery handover'));
  console.log('--- TRACKING TEXT ---');
  console.log(T.split('\n').filter(Boolean).join(' | ').slice(0, 700));

  for (let i = 1; i <= 3; i++) {
    const inp = p.locator('input').first();
    await inp.click({ force: true }).catch(() => {}); await sleep(280);
    await p.keyboard.press('Control+a'); await sleep(100); await p.keyboard.press('Delete'); await sleep(180);
    await p.keyboard.type(String(500000 + i * 31), { delay: 22 }); await sleep(320);
    const dom = await p.evaluate(() => { const el = document.querySelector('input'); return el ? el.value : null; });
    console.log(`attempt ${i} typed dom="${dom}"`);
    const vb = await p.evaluate(() => { let b = null;
      document.querySelectorAll('flt-semantics').forEach(e => { if (b) return;
        if ((e.textContent || '').includes('Verify delivery') && (e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null)) {
          const r = e.getBoundingClientRect(); b = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; } });
      return b; });
    if (vb) { await p.mouse.click(vb.x, Math.max(20, Math.min(vb.y, 640))); }
    await sleep(2000);
    T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
    const interesting = T.split('\n').filter(x => /attempt|Lock|transport|INVALID|confirm/i.test(x));
    R.states.push({ attempt: i, domTyped: dom, interesting, fullLen: T.length });
    console.log(`after verify ${i}:`, JSON.stringify(interesting).slice(0, 240));
    const shot = `e2e/shots/AU-039/AU-039-r6probe-${i}.png`;
    await L.screenshot(p, shot); R.shots.push(shot);
  }
  console.log('CALLS:', JSON.stringify(R.calls.map(c => c.line + ' :: ' + JSON.stringify(c.body).slice(0, 90)), null, 1));
  fs.writeFileSync('/tmp/au039_d2probe.json', JSON.stringify(R, null, 2));
  await ctx.close(); await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
