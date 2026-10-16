// au035_sweep_repro.js — reproduce the r6 sweep's exact click sequence on o12
// with instrumentation to explain why the sweep credited 'Generate new code'
// with NO-EFFECT while the isolated probe shows the refusal within 500 ms.
const L = require('./lib_verify.js');
const APP = 'http://localhost:9112';
const O12 = '2499e6e9-b5f9-4b47-982e-1d50f99144c5';
const OUT = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-035';

async function controls(p) {
  return p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const role = e.getAttribute('role'); const tap = e.getAttribute('flt-tappable') !== null;
      if (role !== 'button' && !tap) return; const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
      out.push({ kind: role === 'button' ? 'button' : 'tappable', label: ((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim().slice(0, 60), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) });
    });
    document.querySelectorAll('input,textarea').forEach(i => out.push({ kind: 'input', label: (i.placeholder || i.type || 'input'), x: -1, y: -1 }));
    return out;
  });
}
async function clickXY(p, x, y) { await p.mouse.move(x, y); await p.waitForTimeout(140); await p.mouse.down(); await p.waitForTimeout(90); await p.mouse.up(); }

(async () => {
  const tok = await L.apiLogin(L.BUYER);
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 25000);
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
  const ei = p.locator('input[type="text"]').first(), pi = p.locator('input[type="password"]').first();
  await ei.click({ force: true }); await p.waitForTimeout(300); await p.keyboard.type(L.BUYER.email);
  await pi.click({ force: true }); await p.waitForTimeout(300); await p.keyboard.type(L.BUYER.pw);
  await L.clickBtn(p, 'Log in');
  let ok = false; for (let i = 0; i < 25 && !ok; i++) { ok = await L.isLoggedIn(p); if (!ok) await p.waitForTimeout(1000); }
  console.log('LOGIN', ok);

  await p.goto(APP + '/orders/' + O12, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 20; i++) { const t = await L.allText(p); if (t.includes('Placed on')) break; await p.waitForTimeout(900); }
  await p.waitForTimeout(1500);

  // mirror sweepControls: 4 passes, scroll +430 between passes
  const seen = new Set();
  let genAttempt = null;
  outer:
  for (let pass = 0; pass < 4; pass++) {
    const cs = await controls(p);
    for (const c of cs) {
      if (c.kind === 'input') continue;
      if (seen.has(c.kind + ':' + c.label) || c.y < 70 || c.y > 640) continue;
      seen.add(c.kind + ':' + c.label);
      console.log('CLICK', JSON.stringify(c));
      if (/Generate new code/.test(c.label)) {
        // instrumented
        let regen = null;
        const onR = r => { if (/regenerate/.test(r.url())) regen = r.status(); };
        p.on('response', onR);
        await clickXY(p, c.x, c.y);
        for (let i = 0; i < 10; i++) {
          await p.waitForTimeout(500);
          const msg = await p.evaluate(() => { let m = null; document.querySelectorAll('[aria-label]').forEach(e => { const a = e.getAttribute('aria-label'); if (a && /Could not regenerate/i.test(a)) m = a.slice(0, 120); }); return m; });
          if (msg) { console.log('GEN_RESULT http=' + regen, 'msg=' + msg); break outer; }
        }
        console.log('GEN_RESULT http=' + regen, 'msg=null');
        await p.screenshot({ path: OUT + '/probe-sweep-gen.png' }).catch(() => {});
        break outer;
      }
      await clickXY(p, c.x, c.y); await p.waitForTimeout(3600);
      // dismiss any dialog like the sweep does
      const dlg = (await controls(p)).find(x => /^Cancel$|^OK$|^Back$|^Submit$/.test(x.label));
      if (dlg) { console.log('DLG_DISMISS', JSON.stringify(dlg)); await clickXY(p, dlg.x, dlg.y); await p.waitForTimeout(800); }
    }
    await p.mouse.move(190, 350); await p.mouse.wheel(0, 430); await p.waitForTimeout(220);
  }
  console.log('SEEN', JSON.stringify([...seen]));
  await ctx.close(); await b.close(); process.exit(0);
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(1); });
