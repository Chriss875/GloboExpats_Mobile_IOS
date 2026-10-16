// au052_ref_r7b.js — REFERENCE parity leg v2 for AU-052.
// Drives :3000 with a REAL dev-api product (508 'Samsung A17' — distinctive,
// Electronics, qty 40). Structural questions: (a) which endpoint feeds the
// rail; (b) how many suggestions render; (c) rail label/copy.
process.chdir(require('path').resolve(__dirname, '..'));
const { chromium } = require('playwright');
const fs = require('fs');
const L = require('./lib_verify.js');
const REF = 'http://localhost:3000';
const RP = 313;

(async () => {
  const browser = await L.newBrowser();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  const api = [];
  p.on('request', r => {
    try { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) api.push(u.pathname + u.search); } catch (_) { }
  });
  await p.goto(`${REF}/product/${RP}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  // wait up to 25s for the rail
  let hasRail = false;
  for (let i = 0; i < 25; i++) {
    await p.waitForTimeout(1000);
    hasRail = await p.evaluate(() => document.body.innerText.includes('You Might Also Like'));
    if (hasRail) break;
  }
  console.log('rail present:', hasRail);
  const txt = await p.evaluate(() => document.body.innerText);
  fs.writeFileSync('/tmp/au052_ref_fulltext.txt', txt);
  const idx = txt.indexOf('You Might Also Like');
  if (idx >= 0) {
    console.log('REF RAIL SECTION:\n' + txt.slice(idx, idx + 900));
  } else {
    console.log('TEXT LEN:', txt.length, '\nSAMPLE:\n' + txt.slice(0, 800));
  }
  // suggestion titles inside the rail anchor list
  const sugg = await p.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find(h => h.textContent.trim() === 'You Might Also Like');
    if (!h) return [];
    let sec = h.closest('section') || h.parentElement;
    return [...sec.querySelectorAll('a[href*="/product/"]')].map(a => ({ href: a.getAttribute('href'), t: (a.innerText || '').trim().split('\n')[0] })).slice(0, 12);
  });
  console.log('REF suggestions:', JSON.stringify(sugg, null, 1));
  console.log('REF api calls:', JSON.stringify([...new Set(api)], null, 1));
  // images
  const imgs = await p.evaluate(() => [...document.querySelectorAll('img')].map(i => ({ src: (i.currentSrc || i.src || '').slice(-60), ok: i.complete && i.naturalWidth > 0 })));
  console.log('REF imgs:', imgs.length, 'broken:', imgs.filter(i => !i.ok).length);
  // shots
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(600);
  await p.screenshot({ path: 'e2e/shots/AU-052/ref-AU-052-m375-detail.png' }).catch(() => {});
  await p.evaluate(() => { const el = [...document.querySelectorAll('h2')].find(h => h.textContent.includes('You Might Also Like')); if (el) el.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'e2e/shots/AU-052/ref-AU-052-m375-rail.png' }).catch(() => {});
  fs.writeFileSync('/tmp/au052_parity.json', JSON.stringify({
    refUrl: '/product/' + RP, hasRail, sugg, suggCount: sugg.length,
    api: [...new Set(api)],
    imgs: imgs.length, imgsBroken: imgs.filter(i => !i.ok).length,
  }, null, 1));
  await ctx.close(); await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
