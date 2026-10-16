const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/au043_lib.js');
(async () => {
  const b = await L.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await L.bootApp(p, 'http://localhost:9131');
  await L.tapTab(p, 'Account'); await p.waitForTimeout(1200);
  const loginBtn = await p.evaluate(() => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if ((e.getAttribute('role') || '') !== 'button') return;
      if ((e.textContent || '').trim() !== 'Log in') return;
      const r = e.getBoundingClientRect();
      if (r.width < 20 || r.height < 12) return;
      best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
    });
    return best;
  });
  const ei = p.locator('input[type="text"]').first(); const pi = p.locator('input[type="password"]').first();
  await ei.click({ force: true }); await p.waitForTimeout(300); await p.keyboard.type('mobile.test.20260820@gmail.com', { delay: 5 });
  await pi.click({ force: true }); await p.waitForTimeout(300); await p.keyboard.type('StrongPass!1', { delay: 5 });
  await p.mouse.click(loginBtn.cx, loginBtn.cy);
  for (let i = 0; i < 25; i++) { await p.waitForTimeout(1000); if (await p.evaluate(() => { try { return (localStorage.getItem('flutter.auth_token') || '').length > 10; } catch (e) { return false; } })) break; }
  async function clickRole(label) {
    for (let a = 0; a < 14; a++) {
      const h = await p.evaluate((lbl) => {
        let bb = null;
        document.querySelectorAll('flt-semantics').forEach(e => {
          if ((e.getAttribute('role') || '') !== 'button') return;
          if ((e.textContent || '').trim() !== lbl) return;
          const r = e.getBoundingClientRect();
          if (r.width < 20 || r.height < 12 || r.bottom < 0 || r.top > innerHeight) return;
          if (!bb || r.width * r.height < bb.area) bb = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height };
        });
        return bb;
      }, label);
      if (h) { await p.mouse.click(h.cx, h.cy); return true; }
      await p.mouse.move(190, 350); await p.mouse.wheel(0, 260); await p.waitForTimeout(320);
    }
    return false;
  }
  await clickRole('Admin');
  for (let i = 0; i < 25; i++) { await p.waitForTimeout(1000); const t = await L.dump(p); if (/Users\n\d/.test(t)) break; }
  const oc = await p.evaluate(() => {
    let bb = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (e.getAttribute('flt-tappable') === null) return;
      const t = (e.textContent || '').trim();
      if (!/^[\d,]+\nOrders$/.test(t)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 30 || r.height < 30) return;
      if (!bb || r.width * r.height < bb.area) bb = { cx: Math.round(r.x + r.width / 2), cy: Math.min(Math.round(r.y + r.height / 2), innerHeight - 6) };
    });
    return bb;
  });
  await p.mouse.click(oc.cx, oc.cy);
  await p.waitForTimeout(4000);
  // click first order row card
  const row = await p.evaluate(() => {
    let bb = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (t.indexOf('Order') !== 0) return;
      if (e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      if (r.width < 200 || r.height < 40 || r.bottom < 0 || r.top > innerHeight) return;
      if (!bb || r.width * r.height < bb.area) bb = { cx: Math.round(r.x + r.width / 2), cy: Math.min(Math.max(Math.round(r.y + r.height / 2), 10), innerHeight - 10), area: r.width * r.height };
    });
    return bb;
  });
  console.log('row', JSON.stringify(row));
  if (row) await p.mouse.click(row.cx, row.cy);
  let t = '';
  for (let i = 0; i < 20; i++) { await p.waitForTimeout(1000); t = await L.dump(p); if (t.includes('Admin escrow / refund actions')) { console.log('DETAIL at ' + i + 's'); break; } }
  console.log('detail len', t.length, '| panel:', t.includes('Admin escrow / refund actions'), '| Mark paid:', t.includes('Mark paid'));
  console.log('head:', JSON.stringify(t.slice(0, 700)));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
