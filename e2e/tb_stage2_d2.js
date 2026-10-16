// tb_stage2_d2.js — D2: prove click POST without route interception.
// pass1 = ZERO instrumentation, server-counter delta around ONE card tap.
// pass2 = passive CDP Network observation (requestWillBeSent; no interception).
const fs = require('fs');
const path = require('path');
const { LV, API, OUT, SHOTS, VID, gotoHome, tapChip, tapCard,
  categories, filterByCategory, clicksTotal } = require('./tb_lib.js');
const { newBrowser, newCtx, closeVideo, allText, waitText, screenshot } = LV;

async function pickPopulated() {
  for (const c of await categories()) {
    const f = await filterByCategory(c.id);
    if ((f.totalElements || 0) >= 3) return { cat: c, listing: f };
  }
  throw new Error('no populated category');
}

async function railToCategory(p, chosen, listing) {
  const okChip = await tapChip(p, chosen.name);
  if (!okChip) return { chipTap: false };
  await p.waitForTimeout(2500);
  // confirm the CategoryScreen really rendered its list
  const want = listing.items[0].title.slice(0, Math.min(24, listing.items[0].title.length));
  const confirmed = await waitText(p, want, 25000);
  if (!confirmed && !(await allText(p)).includes('TSh')) {
    // fallback: deep-link the same screen (still a real user path via URL bar)
    await p.goto(`http://localhost:9121/#/category/${chosen.slug}`,
      { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await p.waitForTimeout(4000);
    const t2 = await allText(p);
    return { chipTap: true, confirmedViaDeepLink: t2.includes(want), want };
  }
  return { chipTap: true, confirmed, want };
}

(async () => {
  const browser = await newBrowser();
  const R = { ts: new Date().toISOString(), lane: 'http://localhost:9121' };

  // ================= PASS 1 — pure counter deltas =================
  try {
    const ctx = await newCtx(browser, { viewport: { width: 375, height: 667 },
      videoPath: path.join(VID, 'AU-046-tiebreak-d2-pure.webm') });
    const p = await ctx.newPage();
    if (!await gotoHome(p)) throw new Error('home did not render');
    const { cat, listing } = await pickPopulated();
    R.pass1_category = { id: cat.id, name: cat.name, slug: cat.slug, items: listing.totalElements };
    const nav = await railToCategory(p, cat, listing);
    R.pass1_nav = nav;
    // baseline EVERY item's counter, choose least-clicked target
    const base = {};
    for (const it of listing.items) base[it.id] = await clicksTotal(it.id);
    let target = null;
    for (const it of listing.items)
      if (!target || base[it.id].total < base[target.id].total) target = it;
    R.pass1_target = { id: target.id, title: target.title, baseTotal: base[target.id] };
    const label = target.title.slice(0, Math.min(28, target.title.length));
    R.pass1_cardTapped = await tapCard(p, label);
    R.pass1_detailShown = (await waitText(p, 'Share', 25000)) || (await waitText(p, 'Add to cart', 8000))
      || (await allText(p)).includes('Add to cart');
    await screenshot(p, path.join(SHOTS, 'tb-d2-detail-after-tap-375.png'));
    await p.waitForTimeout(5000);
    const after = await clicksTotal(target.id);
    R.pass1_afterTotal = after;
    R.pass1_delta = after && R.pass1_target.baseTotal
      ? { total: after.total - R.pass1_target.baseTotal.total,
          anon: after.anon - R.pass1_target.baseTotal.anon,
          loggedIn: after.loggedIn - R.pass1_target.baseTotal.loggedIn }
      : null;
    R.pass1_verdict = R.pass1_delta && R.pass1_delta.total > 0 ? 'POST_FIRED' : 'NOT_OBSERVED';
    // noise detector: whole-category drift during the window
    const drift = {};
    for (const it of listing.items.slice(0, 6)) {
      const now = await clicksTotal(it.id);
      drift[it.id] = now ? now.total - base[it.id].total : null;
    }
    R.pass1_windowDrift = drift;
    await closeVideo(ctx, path.join(VID, 'AU-046-tiebreak-d2-pure.webm'));
  } catch (e) { R.pass1_error = String(e.message || e); }

  // ================= PASS 2 — passive CDP observation =================
  try {
    const ctx = await newCtx(browser, { viewport: { width: 375, height: 667 },
      videoPath: path.join(VID, 'AU-046-tiebreak-d2-cdp.webm') });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    const apiCalls = [], postClicks = [];
    await cdp.send('Network.enable');
    cdp.on('Network.requestWillBeSent', ev => {
      const u = ev.request.url;
      if (u.includes('/api/v1/')) {
        apiCalls.push({ m: ev.request.method, u: u.replace(API, '').slice(0, 120) });
        const m = u.match(/\/api\/v1\/products\/(\d+)\/clicks$/);
        if (ev.request.method === 'POST' && m) postClicks.push({ id: +m[1], at: Date.now() });
      }
    });
    cdp.on('Network.responseReceived', ev => {
      const hit = postClicks.find(x => x.at && ev.timestamp); // status attached below
    });
    // simpler: track responses by requestId
    const respByReq = {};
    cdp.on('Network.responseReceived', ev => { respByReq[ev.requestId] = ev.response.status; });
    cdp.on('Network.loadingFailed', ev => { respByReq[ev.requestId] = 'FAILED:' + ev.errorText; });
    if (!await gotoHome(p)) throw new Error('home did not render');
    const { cat, listing } = await pickPopulated();
    R.pass2_category = { slug: cat.slug, items: listing.totalElements };
    const nav = await railToCategory(p, cat, listing);
    R.pass2_nav = nav;
    const it3 = listing.items[listing.items.length > 2 ? 2 : 0];
    R.pass2_tapTarget = { id: it3.id, title: it3.title };
    R.pass2_cardTapped = await tapCard(p, it3.title.slice(0, 28));
    R.pass2_detailShown = await waitText(p, 'Share', 25000);
    await p.waitForTimeout(5000);
    R.pass2_apiCallsAfterNavStart = apiCalls.length;
    R.pass2_postClicks = postClicks.map(pc => ({ ...pc,
      status: pc.status || null }));
    // attach statuses
    R.pass2_postClickStatuses = postClicks.length;
    R.pass2_verdict = postClicks.length > 0 ? 'POST_FIRED_CDP' : 'NOT_OBSERVED_CDP';
    R.pass2_recentApiTail = apiCalls.slice(-14);
    await screenshot(p, path.join(SHOTS, 'tb-d2-cdp-detail-375.png'));
    fs.writeFileSync(path.join(OUT, 'd2_pass2_calls.json'),
      JSON.stringify(apiCalls, null, 1));
    await closeVideo(ctx, path.join(VID, 'AU-046-tiebreak-d2-cdp.webm'));
  } catch (e) { R.pass2_error = String(e.message || e); }

  try { await browser.close(); } catch (_) {}
  fs.writeFileSync(path.join(OUT, 'stage2_d2.json'), JSON.stringify(R, null, 2));
  console.log('STAGE2 DONE ' + JSON.stringify(R).slice(0, 1800));
})();
