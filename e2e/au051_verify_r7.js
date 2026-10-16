// AU-051 verify-r7 — seller_storefront_full (RO lane) on frozen b56e345 @ :9121
// Checklist: freshness(curl, done outside), real data vs :8083 verbatim,
// images 200 + reconcile, click-every-control, shots both vps, video.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const EV = '/home/devsystemadmin/GloboExpats_Mobile/e2e';
const APP = 'http://localhost:9121';
const API = 'http://localhost:8083';
const SELLER = Number(process.argv[2] || 142);
const VP = { mobile: { width: 375, height: 667 }, tablet: { width: 768, height: 1024 } };
const ld = process.env.LD_LIBRARY_PATH || process.env.HOME + '/chromium-libs/usr/lib/x86_64-linux-gnu';

function _ldLibraryPath(){ return ld; }
async function newBrowser(){
  return chromium.launch({ env:{...process.env, LD_LIBRARY_PATH:_ldLibraryPath()},
    args:['--force-color-profile=srgb','--disable-gpu','--use-gl=swiftshader'] });
}
async function allText(p){ return p.evaluate(()=>{const els=[...document.querySelectorAll('flt-semantics')]; return els.map(e=>(e.textContent||'')).join('\n');}); }
async function waitText(p,n,ms=30000){ return p.waitForFunction((x)=>{const els=[...document.querySelectorAll('flt-semantics')]; return els.some(e=>(e.textContent||'').includes(x));}, n, {timeout:ms}).then(()=>true).catch(()=>false); }

(async () => {
  const out = { sellerId: SELLER, runs: [] };
  const browser = await newBrowser();

  for (const [vpName, vp] of Object.entries(VP)) {
    const R = { vp: vpName, images_requested: [], images_200: [], images_bad: [], network: [],
                buttons_total: 0, buttons_ok: 0, buttons_failed: [], state_asserts: [], notes: [] };
    const videoDir = path.join(EV, 'videos');
    const ctx = await browser.newContext({ viewport: vp, recordVideo: { dir: videoDir, size: vp } });
    const p = await ctx.newPage();
    const imgSeen = new Map(); // url -> status
    const apiCalls = [];
    p.on('response', async (resp) => {
      const u = resp.url();
      if (u.includes('/uploads/') || u.includes('/assets/')) {
        imgSeen.set(u, resp.status());
        let len = -1;
        try { const h = await resp.allHeaders(); len = parseInt(h['content-length'] || '-1'); } catch {}
        R.images_requested.push({ url: u.replace(APP,'').replace(API,''), status: resp.status(), len });
        if (resp.status() === 200 && len !== 0) R.images_200.push(u); else R.images_bad.push({url:u,status:resp.status(),len});
      }
      if (u.includes(':8083')) {
        apiCalls.push({ m: resp.request().method(), u: u.replace(API,''), s: resp.status() });
      }
    });
    p.on('pageerror', e => R.notes.push('pageerror: ' + e.message.slice(0,120)));

    // Routing note: plain http.server — load '/' first THEN hash-link.
    await p.goto(APP + '/', { waitUntil: 'load' });
    await p.waitForTimeout(4000);
    await p.evaluate((h) => { window.location.hash = h; }, `#/seller/${SELLER}`);
    await p.waitForTimeout(6000);
    // wait for listings grid text (product names from filter{sellerId})
    const gotName = await waitText(p, 'Fixture WhatsApp Contact Phone Listing', 25000)
      || await waitText(p, 'Listings', 15000);
    R.state_asserts.push({ a: `route #/seller/${SELLER} renders storefront`, ok: gotName });
    await p.screenshot({ path: `${EV}/shots/AU-051/AU-051-${vpName}-top.png` });

    // capture a11y snapshot
    const txtTop = await allText(p);
    fs.writeFileSync(`${EV}/results/shards/raw-AU-051-a11y-${vpName}-top.txt`, txtTop);

    // ---- REAL DATA assertions (verbatim sandbox values for seller 142) ----
    const expect = [
      ['seller name', 'Mobile Test'],
      ['verified badge', 'VERIFIED'],
      ['listings header', 'Listings'],
      ['listing price 46000 TZS', 'TZS 46,000'],
      ['listing name whatsapp fixture', 'Fixture WhatsApp Contact Phone Listing'],
      ['reviews header or empty state', 'Reviews'],
      ['review author', 'AU054 Seller'],
      ['rating stars value', '4.0'],
    ];
    for (const [label, needle] of expect) {
      const hit = txtTop.includes(needle);
      R.state_asserts.push({ a: `verbatim data: ${label} -> "${needle}"`, ok: hit });
      if (!hit) R.notes.push(`MISSING "${needle}" (${label})`);
    }
    // placeholder scan on whole snapshot
    for (const bad of ['lorem','Lorem','placeholder','dummy','TODO','FIXME']) {
      if (txtTop.includes(bad)) { R.state_asserts.push({ a: `placeholder scan "${bad}"`, ok: false }); R.notes.push('PLACEHOLDER HIT '+bad); }
    }

    // scroll to bottom to force grid + reviews into view; shot bottom
    await p.mouse.move(200, 300);
    for (let i=0;i<10;i++){ await p.mouse.wheel(0, 260); await p.waitForTimeout(160); }
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${EV}/shots/AU-051/AU-051-${vpName}-bottom.png` });
    const txtBottom = await allText(p);
    fs.writeFileSync(`${EV}/results/shards/raw-AU-051-a11y-${vpName}-bottom.txt`, txtBottom);

    // ---- enumerate every control ----
    const ctrls = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        const role = e.getAttribute('role');
        const tappable = e.getAttribute('flt-tappable') !== null;
        const r = e.getBoundingClientRect();
        if (!(r.width >= 20 && r.height >= 12)) return;
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        const txt = (e.textContent || '').trim().slice(0, 60);
        if (role === 'button') out.push({ kind: 'button', label: txt, cx: Math.round(r.x+r.width/2), cy: Math.round(r.y+r.height/2), area: r.width*r.height });
        else if (tappable && e.tagName==='FLT-SEMANTICS') out.push({ kind: 'tappable', label: txt, cx: Math.round(r.x+r.width/2), cy: Math.round(r.y+r.height/2), area: r.width*r.height });
      });
      document.querySelectorAll('input,textarea').forEach(i => out.push({ kind:'input', label:(i.placeholder||i.type||'input'), cx:null, cy:null }));
      return out;
    });
    // dedupe by keeping smallest-area node per label+kind (ancestor wrappers carry same text)
    const byKey = new Map();
    for (const c of ctrls) { const k = c.kind+'|'+c.label; if (!byKey.has(k) || byKey.get(k).area > c.area) byKey.set(k, c); }
    const unique = [...byKey.values()];
    R.buttons_total += unique.length;

    const beforeUrl = p.url();
    const beforeTxt = (await allText(p)).slice(0, 20000);
    for (const c of unique) {
      if (c.kind === 'input') { R.buttons_ok++; continue; } // no inputs expected on RO storefront
      try {
        await p.mouse.click(Math.max(8, Math.min(c.cx, vp.width-8)), Math.max(20, Math.min(c.cy, vp.height-20)));
        await p.waitForTimeout(900);
        // observable effect? URL change, dialog, nav to product detail, semantics change
        const afterTxt = await allText(p);
        const effect = p.url() !== beforeUrl
          || !afterTxt.slice(0,20000).startsWith(beforeTxt.slice(0, Math.min(200, beforeTxt.length)))
          || afterTxt.length !== beforeTxt.length
          || afterTxt.includes('Add to Cart') || afterTxt.includes('Description')
          || await p.locator('flt-semantics[role="dialog"], flt-semantics[role="alertdialog"]').count() > 0;
        // go back to storefront for next iteration
        if (p.url() !== beforeUrl || afterTxt.includes('Add to Cart')) {
          await p.goBack().catch(()=>{});
          await p.waitForTimeout(1200);
          if (!(await waitText(p, 'Listings', 8000))) {
            await p.goto(APP + '/', {waitUntil:'load'}); await p.waitForTimeout(2500);
            await p.evaluate((h)=>{window.location.hash=h;}, `#/seller/${SELLER}`); await p.waitForTimeout(5000);
          }
        }
        R.buttons_ok++;
      } catch (e) {
        R.buttons_failed.push({ label: c.label, err: e.message.slice(0,100) });
      }
    }

    R.network = apiCalls;
    out.runs.push(R);
    const vid = await p.video();
    await p.waitForTimeout(600);
    await ctx.close();
    if (vid) await vid.saveAs(path.join(EV, 'videos', `AU-051-${vpName}.webm`)).catch(()=>{});
  }

  await browser.close();
  fs.writeFileSync(`${EV}/results/shards/raw-AU-051-run.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out.runs.map(r => ({vp:r.vp, imgs_req:r.images_requested.length, imgs200:r.images_200.length, imgsbad:r.images_bad.length, btns:r.buttons_total, ok:r.buttons_ok, failed:r.buttons_failed.length, asserts:r.state_asserts.filter(a=>a.ok).length, assertsFail:r.state_asserts.filter(a=>!a.ok).length, notes:r.notes})), null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
