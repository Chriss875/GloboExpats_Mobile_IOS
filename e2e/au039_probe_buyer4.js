// au039_probe_buyer4.js — D2 probe v2: reuse the PROVEN tap() (scroll-aware) from
// the r6 driver instead of a fixed-coordinate click, so the tracking screen
// actually opens before the 3 taps.
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9121';
const R = { calls: [], states: [], shots: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const txt = p => p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');
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
    if (h) { await p.mouse.click(Math.max(3, Math.min(h.x, 760)), Math.max(20, Math.min(h.y, 1015))); await sleep(1100); return true; }
    await p.mouse.move(190, 350); await p.mouse.wheel(0, i % 2 === 0 ? 260 : -260); await sleep(320);
  } return false;
}
async function typeIntoFirstInput(p, value) {
  const inp = p.locator('input').first();
  await inp.click({ force: true }).catch(() => {}); await sleep(280);
  await p.keyboard.press('Control+a'); await sleep(120); await p.keyboard.press('Delete'); await sleep(200);
  await p.keyboard.type(value, { delay: 22 }); await sleep(320);
  let dom = await p.evaluate(() => { const el = document.querySelector('input'); return el ? el.value : null; });
  if (dom !== value) {
    await inp.click({ force: true }).catch(() => {}); await sleep(220);
    await p.keyboard.press('Control+a'); await sleep(100); await p.keyboard.press('Delete'); await sleep(180);
    await p.keyboard.type(value, { delay: 26 }); await sleep(300);
    dom = await p.evaluate(() => { const el = document.querySelector('input'); return el ? el.value : null; });
  }
  return dom;
}
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
  console.log('list ok:', (await txt(p)).includes('ORD-2026-000088'));
  console.log('open detail:', await tap(p, 'ORD-2026-000088', 4));
  await sleep(1500);
  console.log('detail code:', (await txt(p)).includes('603698'));
  console.log('tap Track delivery:', await tap(p, 'Track delivery', 5));
  await sleep(2600);
  let T = await txt(p);
  console.log('tracking open:', T.includes('Delivery tracking'), '| handover copy:', T.includes('Delivery handover'), '| has input:', await p.locator('input').count());
  console.log('TRACKING:', T.split('\n').filter(x => /tracking|handover|Transporter|Status/i.test(x)).slice(0, 6).join(' | ').slice(0, 400));

  for (let i = 1; i <= 3; i++) {
    const code = String(500000 + i * 31);
    const dom = await typeIntoFirstInput(p, code);
    console.log(`attempt ${i} typed dom="${dom}"`);
    console.log(`tap verify ${i}:`, await tap(p, 'Verify delivery', 2));
    await sleep(2100);
    T = await txt(p);
    const interesting = T.split('\n').filter(x => /attempt|Lock|transport|INVALID|confirm|remaining/i.test(x));
    R.states.push({ attempt: i, domTyped: dom, interesting });
    console.log(`after verify ${i}:`, JSON.stringify(interesting).slice(0, 260));
    const shot = `e2e/shots/AU-039/AU-039-r6probe-${i}.png`;
    await L.screenshot(p, shot); R.shots.push(shot);
  }
  console.log('CALLS:', JSON.stringify(R.calls.map(c => c.line + ' :: ' + JSON.stringify(c.body).slice(0, 100)), null, 1));
  fs.writeFileSync('/tmp/au039_d2probe.json', JSON.stringify(R, null, 2));
  await ctx.close(); await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
