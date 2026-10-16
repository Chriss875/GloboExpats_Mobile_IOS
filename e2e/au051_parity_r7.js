// AU-051 parity — reference Next.js :3000/seller/142 vs Flutter :9121 (structural judge)
const { chromium } = require('playwright');
const EV = '/home/devsystemadmin/GloboExpats_Mobile/e2e';
const ld = process.env.LD_LIBRARY_PATH || process.env.HOME + '/chromium-libs/usr/lib/x86_64-linux-gnu';
(async () => {
  const browser = await chromium.launch({ env:{...process.env, LD_LIBRARY_PATH:ld},
    args:['--force-color-profile=srgb','--disable-gpu','--use-gl=swiftshader'] });
  const out = [];
  for (const [name, vp] of Object.entries({ mobile:{width:375,height:667}, tablet:{width:768,height:1024} })) {
    const p = await (await browser.newContext({ viewport: vp })).newPage();
    await p.goto('http://localhost:3000/seller/142', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(9000);
    // expand accordions if collapsed
    for (const t of ['About the seller', 'Reviews']) {
      try { const el = p.getByText(t, { exact: false }).first(); if (await el.count()) await el.click({ timeout: 2500 }); } catch {}
      await p.waitForTimeout(1200);
    }
    await p.screenshot({ path: `${EV}/shots/AU-051/ref-AU-051-${name}-top.png` });
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(3500);
    await p.screenshot({ path: `${EV}/shots/AU-051/ref-AU-051-${name}-bottom.png` });
    const body = await p.evaluate(() => document.body.innerText);
    require('fs').writeFileSync(`${EV}/results/shards/raw-AU-051-ref-${name}.txt`, body);
    out.push({ vp: name, len: body.length,
      hasName: body.includes('Mobile Test'), hasShowcase: /showcase/i.test(body),
      hasReviews: /reviews/i.test(body), hasAuthor: body.includes('AU054'),
      hasWhatsappListing: body.includes('Fixture WhatsApp Contact Phone Listing') });
    await p.close();
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
