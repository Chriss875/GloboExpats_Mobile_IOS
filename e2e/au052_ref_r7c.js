// au052_ref_r7c.js — REFERENCE rail-content capture (product 313, longer wait).
const { chromium } = require('playwright');
const L = require('./lib_verify.js');
const fs = require('fs');
(async () => {
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  const api = [];
  p.on('request', r => { try { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) api.push(u.pathname + u.search); } catch(_){} });
  await p.goto('http://localhost:3000/product/313', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{});
  let sugg = [];
  for (let i = 0; i < 40; i++) {
    await p.waitForTimeout(1000);
    sugg = await p.evaluate(() => {
      const links = [...document.querySelectorAll('a[href*="/product/"]')];
      return links.map(a => ({ href: a.getAttribute('href'), t: (a.innerText || '').trim().split('\n').filter(Boolean)[0] || '' })).filter(x => x.t);
    });
    if (sugg.length >= 3) break;
  }
  console.log('SUGGESTIONS:', JSON.stringify(sugg.slice(0, 10), null, 1));
  console.log('API:', JSON.stringify([...new Set(api)]));
  const imgs = await p.evaluate(() => [...document.querySelectorAll('img')].map(i => ({ src: (i.currentSrc||i.src||'').slice(-50), ok: i.complete && i.naturalWidth > 0 })));
  console.log('IMGS:', imgs.length, 'broken:', imgs.filter(i=>!i.ok).length);
  // rail screenshot
  await p.evaluate(() => { const h = [...document.querySelectorAll('h2')].find(h => h.textContent.includes('You Might Also Like')); if (h) h.scrollIntoView({block:'start'}); });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: 'e2e/shots/AU-052/ref-AU-052-m375-rail.png' }).catch(()=>{});
  await p.evaluate(() => window.scrollTo(0,0)); await p.waitForTimeout(800);
  await p.screenshot({ path: 'e2e/shots/AU-052/ref-AU-052-m375-detail.png' }).catch(()=>{});
  fs.writeFileSync('/tmp/au052_parity.json', JSON.stringify({ refUrl:'/product/313', sugg:sugg.slice(0,10), count:sugg.length, api:[...new Set(api)], imgs:imgs.length, broken:imgs.filter(i=>!i.ok).length }, null, 1));
  await ctx.close(); await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
