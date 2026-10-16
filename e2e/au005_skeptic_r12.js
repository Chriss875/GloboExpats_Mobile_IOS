// au005_skeptic_r12.js — SKEPTIC re-attack of AU-005 (error taxonomy + empty-state
// convention) ON THE CURRENT FROZEN BUNDLE (:9131, git c6b4d61).
// Attacks:
//   A0 freshness + baseline states (404 route id, true-empty search, notifications)
//   A1 rapid double-taps on every CTA of the 404/empty screens
//   A2 out-of-order / deep-link re-entry mid-flow (browse->search back-out, 404 re-entry)
//   A3 offline mid-request (context.setOffline) on search + product detail + orders,
//      then retry online; assert copy is friendly (no "ApiException:"/"Exception:"/"HTTP")
//   A4 invalid input: 500-char query, emoji-only, Swahili UTF-8, <script> tag
//   A5 locale/number formats: TZS separators vs reference (:3000 structural parity)
//   A6 role probes: anon deep-link to gated routes; buyer token -> /admin; admin -> charts blank-card convention
//   A7 session expiry mid-flow: garbage JWT injected then a CTA that triggers an API call
// Raw-leak scan runs over every settled state's text.
const path = require('path'); const fs = require('fs');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9131';
const VP = { m: { width: 375, height: 667 }, t: { width: 768, height: 1024 } };
const OUT = [];
function rec(o) { OUT.push(o); console.log('REC', JSON.stringify(o).slice(0, 400)); }
const LEAK = /(ApiException|Exception:|Stack trace|at \w+\.\w+\(|SocketException|ClientException|failed: HTTP|HTTP \d{3}\b|Internal Server Error|\bnull\b)/;

async function text(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');
}
async function settle(p, re, ms = 30000) {
  for (let i = 0; i < ms / 500; i++) {
    const t = await text(p);
    if (re.test(t)) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}
async function shot(p, name) { await L.screenshot(p, `e2e/shots/AU-005/AU-005-sk2-${name}.png`); }

(async () => {
  const b = await L.newBrowser();
  const results = {};

  // ---------- A0: baseline at BOTH viewports ----------
  for (const vp of ['m', 't']) {
    const ctx = await L.newCtx(b, { viewport: VP[vp], videoPath: `e2e/videos/AU-005-sk2-${vp}.webm` });
    const p = await ctx.newPage();
    const imgs = L.watchImages(p);
    const net = [];
    p.on('response', r => { if (r.url().includes(':8083/api/')) net.push(`${r.request().method()} ${r.url().split(':8083')[1].slice(0, 60)} -> ${r.status()}`); });

    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 45000).catch(() => {});
    await shot(p, `${vp}-a0-home`);

    // A0.1 404 route id (deep link straight to missing product)
    net.length = 0;
    await p.evaluate(() => { window.location.hash = '#/product/999999'; }).catch(() => {});
    await settle(p, /couldn't find that|Something went wrong/i, 30000);
    const t404 = await text(p);
    rec({ attack: 'A0-product404', vp, leak: LEAK.test(t404), hasFriendlyCopy: /couldn't find that/i.test(t404),
      buttons: [...new Set((t404.match(/^[^\n]+$/gm) || []).filter(x => x.trim().length && x.length < 30))].slice(0, 14) });
    await shot(p, `${vp}-a0-product404`);
    results['net404_' + vp] = net.slice(0, 4);

    // dead-control check on the 404 page: rapid double-tap Share and Back (A1 folded in)
    for (let i = 0; i < 2; i++) { await L.clickBtn(p, 'Share'); await new Promise(r => setTimeout(r, 120)); }
    for (let i = 0; i < 2; i++) { await L.clickBtn(p, 'Back'); await new Promise(r => setTimeout(r, 120)); }
    await new Promise(r => setTimeout(r, 1500));
    const t404b = await text(p);
    rec({ attack: 'A1-rapid-taps-404', vp, leakAfterTaps: LEAK.test(t404b), stillOn404: /couldn't find that|Back to Browse|Search/i.test(t404b) || !/Buy now/i.test(t404b), textHead: t404b.slice(0, 160).replace(/\n+/g, ' | ') });
    await shot(p, `${vp}-a1-after-taps`);

    // A0.2 true-empty search (backend returns 0 rows)
    await p.evaluate(() => { window.location.hash = '#/'; }).catch(() => {});
    await new Promise(r => setTimeout(r, 1200));
    net.length = 0;
    await p.evaluate(() => { window.location.hash = '#/search?q=xqzjvkwq'; }).catch(() => {});
    await settle(p, /No results found|Search failed/i, 30000);
    const tEmpty = await text(p);
    rec({ attack: 'A0-search-empty', vp, leak: LEAK.test(tEmpty), noResults: /No results found/i.test(tEmpty), searchFailedShown: /Search failed/i.test(tEmpty) });
    await shot(p, `${vp}-a0-search-empty`);

    // A2 deep-link re-entry + back-out: from empty search go Back via appbar arrow region then home
    await p.evaluate(() => { window.location.hash = '#/product/999999'; }).catch(() => {});
    await settle(p, /couldn't find that/i, 20000);
    await p.evaluate(() => { window.location.hash = '#/search?q=xqzjvkwq'; }).catch(() => {});
    await settle(p, /No results found/i, 20000);
    const tReenter = await text(p);
    rec({ attack: 'A2-deeplink-reentry', vp, leak: LEAK.test(tReenter), ok: /No results found/i.test(tReenter) });
    await shot(p, `${vp}-a2-reentry`);

    // A0.3 notifications empty state
    await p.evaluate(() => { window.location.hash = '#/notifications'; }).catch(() => {});
    await settle(p, /No notifications yet|Could not load notifications/i, 25000);
    const tNotif = await text(p);
    rec({ attack: 'A0-notifications', vp, leak: LEAK.test(tNotif), emptyCopy: /No notifications yet/.test(tNotif), errCopy: /Could not load notifications/.test(tNotif) });
    await shot(p, `${vp}-a0-notifications`);

    results['imgs_' + vp] = L.imageSummary(imgs);
    results['net_' + vp] = [...new Set(net)].slice(0, 12);
    try { fs.appendFileSync('/tmp/au5sk_video_done_' + vp, '1'); } catch (e) {}
    await L.closeVideo(ctx, `e2e/videos/AU-005-sk2-${vp}.webm`);
  }

  console.log('PHASE1_DONE');
  fs.writeFileSync('/tmp/au5sk_phase1.json', JSON.stringify(results, null, 1));
  fs.writeFileSync('/tmp/au5sk_findings.json', JSON.stringify(OUT, null, 1));
  await b.close().catch(() => {});
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
