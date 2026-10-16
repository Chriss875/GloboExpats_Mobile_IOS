// au049_probe_r7a.js — boot :9121 at '/', navigate to /browse via the Marketplace
// tab (SPA has no server-side deep-link fallback), open the filter sheet, dump the
// a11y tree + capture every /displayItem/filter + /neighbourhoods request.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  const reqs = [];
  p.on('request', r => {
    const u = r.url();
    if (/displayItem\/(filter|neighbourhoods)|category-availability|subcategory/.test(u))
      reqs.push({ m: r.method(), u: u.replace('http://localhost:8083', ''), pd: (r.postData() || '').slice(0, 220) });
  });
  await p.goto('http://localhost:9121/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'GloboExpats', 40000);
  await p.waitForTimeout(6000);
  console.log('HOME TEXT HEAD:', JSON.stringify((await L.allText(p)).slice(0, 300)));
  // navigate to browse via bottom nav
  const okTab = await L.clickBtn(p, 'Marketplace');
  console.log('clicked Marketplace:', okTab);
  await p.waitForTimeout(5000);
  const t = await L.allText(p);
  console.log('BROWSE has Marketplace title:', t.includes('Marketplace'), 'len', t.length);
  console.log('BROWSE buttons:', JSON.stringify(await L.listButtons(p).then(x => x.filter(i => i.kind === 'button').map(i => i.label))));
  // open the sheet
  await L.clickBtn(p, 'Filters');
  await p.waitForTimeout(3500);
  const sheet = await L.allText(p);
  console.log('SHEET len', sheet.length);
  console.log('SHEET TEXT:\n' + sheet.slice(0, 1800));
  console.log('REQS:', JSON.stringify(reqs, null, 1));
  await L.screenshot(p, '/tmp/au049r7_sheet_probe.png');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
