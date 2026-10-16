const H = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/au043_lib.js');
(async () => {
  const b = await H.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.route('**/orders/**', (route, req) => {
    if (req.isNavigationRequest() && !/\.[a-z0-9]+(\?|$)/i.test(req.url())) {
      return route.fulfill({ path: '/home/devsystemadmin/GloboExpats_Mobile/build/web/index.html', contentType: 'text/html' }).catch(e => console.log('fulfill err', String(e).slice(0, 80)));
    }
    return route.continue();
  });
  await p.goto('http://localhost:9131/orders/2841d111-03fe-4426-b143-46b63469f9bb?admin=1', { waitUntil: 'load', timeout: 90000 }).catch(e => console.log('naverr'));
  for (let i = 0; i < 40; i++) {
    await p.waitForTimeout(1000);
    const t = await H.dump(p);
    if (t.includes('Welcome back') || t.includes('Admin escrow') || (t.length > 300 && i > 8)) { console.log(i + 's len=' + t.length, JSON.stringify(t.slice(0, 220))); break; }
  }
  console.log('URL', p.url(), '| token', await p.evaluate(() => { try { return (localStorage.getItem('flutter.auth_token') || '').length; } catch (e) { return -1; } }));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
