// au052_ref_r7.js — REFERENCE (:3000) parity leg for AU-052.
// Client-rendered Next.js; drives its own dev-api data (ACCEPTED-DIVERGENCE for values),
// but the structural claim under test: which endpoint feeds the rail + cap of 4.
process.chdir(require('path').resolve(__dirname, '..'));
const { chromium } = require('playwright');
const fs = require('fs');
const L = require('./lib_verify.js');
const REF = 'http://localhost:3000';

(async () => {
  const browser = await L.newBrowser();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  const api = [];
  p.on('request', r => { const u = r.url(); if (u.includes('/api/') && u.includes(':3000') === false && /localhost:(8083|3000)/.test(u)) { } });
  p.on('request', r => {
    const u = r.url();
    try { if ((new URL(u)).pathname.startsWith('/api/')) api.push((new URL(u)).pathname + (new URL(u)).search); } catch (_) { }
  });
  await p.goto(REF + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);
  // collect candidate product links from home
  let links = await p.evaluate(() => [...document.querySelectorAll('a[href*="product"]')].map(a => a.getAttribute('href')).filter(Boolean).slice(0, 30));
  console.log('HOME product-ish links:', JSON.stringify(links.slice(0, 10)));
  if (!links.length) {
    links = ['/product/338', '/product/827'];
  }
  let chosen = null;
  for (const cand of links) {
    if (!/\/product\/\d+/.test(cand)) continue;
    api.length = 0;
    await p.goto(REF + cand, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(9000);
    const txt = await p.evaluate(() => document.body.innerText);
    const hasRail = txt.includes('You Might Also Like');
    console.log(`CANDIDATE ${cand}: railLabel=${hasRail} textLen=${txt.length}`);
    console.log('  api:', JSON.stringify([...new Set(api)].slice(0, 12)));
    fs.writeFileSync('/tmp/au052_ref_last.json', JSON.stringify({ url: cand, hasRail, api: [...new Set(api)], textSample: txt.slice(0, 400) }, null, 1));
    if (hasRail) { chosen = cand; break; }
  }
  if (chosen) {
    const refTxt = await p.evaluate(() => document.body.innerText);
    // extract rail section
    const idx = refTxt.indexOf('You Might Also Like');
    const railSection = refTxt.slice(idx, idx + 700);
    console.log('REF RAIL SECTION:\n' + railSection);
    fs.writeFileSync('/tmp/au052_ref_rail.txt', railSection);
    // count distinct suggestion titles in rail region
    await p.evaluate(() => { const el = [...document.querySelectorAll('h2')].find(h => h.textContent.includes('You Might Also Like')); if (el) el.scrollIntoView({ block: 'center' }); });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: 'e2e/shots/AU-052/ref-AU-052-m375-rail.png' }).catch(() => {});
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(800);
    await p.screenshot({ path: 'e2e/shots/AU-052/ref-AU-052-m375-detail.png' }).catch(() => {});
    console.log('ref shots saved');
    // count images in the rail area and their load status
    const imgs = await p.evaluate(() => [...document.querySelectorAll('img')].map(i => ({ src: (i.currentSrc || i.src || '').split('/').pop(), ok: i.complete && i.naturalWidth > 0 })));
    console.log('REF imgs total:', imgs.length, 'broken:', imgs.filter(i => !i.ok).length);
    fs.writeFileSync('/tmp/au052_ref_imgs.json', JSON.stringify({ total: imgs.length, broken: imgs.filter(i => !i.ok).length }, null, 1));
  }
  await ctx.close(); await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
