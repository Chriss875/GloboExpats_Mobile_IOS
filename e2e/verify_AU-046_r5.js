// AU-046 r5 — final gap-closers, run AFTER verify_AU-046_r2.js:
//   1. rails horizontal scroll: empty slugs (Food&Groceries/Garden/Pet) never render
//   2. chip -> CategoryScreen at BOTH viewports (375 retry via h-scroll)
//   3. discover tab switch (Newest -> Featured) state assert
//   4. reference parity shots from :3000 (wa.me FAB + home)
//   5. click-count delta probe on a fresh product (server-side count check)
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9110';
const REF = 'http://localhost:3000';
const OUT = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-046';

const CHIP_NAMES = ['Art & Crafts', 'Beauty & Personal Care', 'Books & Media', 'Clothing', 'Decorations', 'Electronics', 'Food & Groceries', 'Furniture', 'Garden & Outdoors', 'Home & Kitchen Appliances', 'Other', 'Pet & Supplies', 'Real Estate', 'Sports & Games', 'Vehicle & Supplies'];
const EMPTY = ['Food & Groceries', 'Garden & Outdoors', 'Pet & Supplies'];

let page;
let R = null;

function a11yDump(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map((e) => {
    const r = e.getBoundingClientRect();
    return {
      role: e.getAttribute('role') || '',
      tappable: e.getAttribute('flt-tappable') !== null,
      label: (e.getAttribute('aria-label') || e.textContent || '').trim(),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
    };
  }));
}
const txtOf = (nodes) => nodes.map((n) => n.label).join('\n');

async function chipRects() {
  return page.evaluate((names) => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach((e) => {
      if (e.getAttribute('flt-tappable') === null) return;
      const l = (e.getAttribute('aria-label') || e.textContent || '').trim();
      if (!names.includes(l)) return;
      const r = e.getBoundingClientRect();
      out.push({ name: l, x: Math.round(r.x + r.width / 2), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), visible: r.bottom > 0 && r.top < innerHeight && r.width > 1 });
    });
    return out;
  }, CHIP_NAMES);
}

async function findBtn(exact) {
  return page.evaluate((want) => {
    let best = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach((e) => {
      const lab = (e.getAttribute('aria-label') || e.textContent || '').trim();
      if (lab !== want && lab.split('\n')[0].trim() !== want) return;
      const r = e.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth || r.width < 8 || r.height < 8) return;
      if (!best || r.width * r.height < best.w * best.h) {
        best = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), label: lab.slice(0, 60) };
      }
    });
    return best;
  }, exact);
}

(async () => {
  const results = { railsScroll: {}, chips: {}, tabs: {}, ref: {}, clickDelta: {} };

  // ============ A. rails skip-proof + chip->CategoryScreen at both VPs =======
  for (const vp of [{ name: '375', w: 375, h: 667 }, { name: '768', w: 768, h: 1024 }]) {
    R = { api: [], imgs: {} };
    const browser = await lib.newBrowser();
    const ctx = await lib.newCtx(browser, {
      viewport: { width: vp.w, height: vp.h },
      videoPath: `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-046-${vp.name}.webm`,
    });
    page = await ctx.newPage();
    page.setDefaultTimeout(25000);
    page.on('response', (r) => { const u = r.url(); if (/\/uploads\/[^?]*\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(u)) R.imgs[u] = r.status(); });
    page.on('request', (rq) => { const u = rq.url(); if (/localhost:8083/.test(u)) R.api.push({ m: rq.method(), u: u.replace(/\?.*$/, '') }); });
    await page.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${APP}#/`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await lib.waitText(page, 'Buy now', 30000);
    await page.waitForTimeout(3500);

    // locate the rails row (any chip), then sweep horizontally collecting names
    let rects = await chipRects();
    let rowY = null;
    for (const c of rects) { if (c.visible && c.w < 100 && c.h > 80 && c.h < 130) { rowY = c.y + Math.floor(c.h / 2); break; } }
    const seenNames = new Set(rects.filter((c) => c.w < 100 && c.h > 80 && c.h < 130).map((c) => c.name));
    if (rowY !== null) {
      for (let s = 0; s < 12; s++) {
        await page.mouse.move(vp.w * 0.6, Math.min(rowY, vp.h - 40));
        await page.mouse.wheel(420, 0);
        await page.waitForTimeout(380);
        rects = await chipRects();
        rects.filter((c) => c.w < 100 && c.h > 80 && c.h < 130 && c.visible).forEach((c) => seenNames.add(c.name));
        if ([...seenNames].includes('Vehicle & Supplies')) break;
      }
    }
    const rendered = [...seenNames];
    const emptiesRendered = EMPTY.filter((n) => rendered.includes(n));
    results.railsScroll[vp.name] = { rendered, emptiesRendered, count: rendered.length };
    console.log(`[${vp.name}] rails rendered ${rendered.length} chips; empty-slugs rendered:`, JSON.stringify(emptiesRendered));

    // screenshot the rails row after full sweep
    // scroll vertically so the rails row is in view
    for (let i = 0; i < 14; i++) {
      const rr = (await chipRects()).find((c) => c.w < 100 && c.h > 80 && c.h < 130);
      if (rr && rr.y > 120 && rr.y < vp.h - 160) break;
      await page.mouse.move(200, 300); await page.mouse.wheel(0, -400); await page.waitForTimeout(220);
    }
    for (let i = 0; i < 14; i++) {
      const rr = (await chipRects()).find((c) => c.w < 100 && c.h > 80 && c.h < 130);
      if (rr && rr.y > 120 && rr.y < vp.h - 160) break;
      await page.mouse.move(200, 300); await page.mouse.wheel(0, 320); await page.waitForTimeout(220);
    }
    await lib.screenshot(page, `${OUT}/flutter-${vp.name}-07-rails-full-sweep.png`);

    // ---- chip -> CategoryScreen (retry with h-scroll until clickable) ----
    const target = ['Electronics', 'Beauty & Personal Care', 'Clothing', 'Furniture'].find((n) => rendered.includes(n));
    let navOk = false;
    for (let attempt = 0; attempt < 10 && !navOk; attempt++) {
      rects = await chipRects();
      const hit = rects.find((c) => c.name === target && c.visible);
      if (hit) {
        const apiB = R.api.length;
        await page.mouse.click(hit.x, Math.min(hit.y + (hit.h >> 1), vp.h - 60));
        await page.waitForTimeout(3000);
        const t = txtOf(await a11yDump(page));
        const appBarHit = t.includes(`Back${target}`);
        if (appBarHit) {
          navOk = true;
          results.chips[vp.name] = {
            clicked: target, url: page.url(),
            sample: t.slice(0, 500),
            apiTail: R.api.slice(apiB, apiB + 8).map((a) => `${a.m} ${a.u}`),
            imgsTailCount: Object.keys(R.imgs).length,
          };
          await lib.screenshot(page, `${OUT}/flutter-${vp.name}-04-chip-category.png`);
          break;
        }
        // wrong nav — go home again
        await page.goto(`${APP}?r=${Date.now()}#/`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
        await lib.waitText(page, 'Buy now', 30000);
        await page.waitForTimeout(1800);
      }
      // bring more chips into view
      rects = await chipRects();
      const anyChip = rects.find((c) => c.visible && c.w < 100 && c.h > 80 && c.h < 130);
      if (anyChip) { await page.mouse.move(anyChip.x, Math.min(anyChip.y + 50, vp.h - 40)); await page.mouse.wheel(-380 * (attempt % 2 ? 1 : -1), 0); }
      else { await page.mouse.move(200, 300); await page.mouse.wheel(0, 300); }
      await page.waitForTimeout(350);
    }
    if (!navOk) results.chips[vp.name] = { ok: false, why: `chip ${target} never navigated` };

    // ---- C: discover tab switch Newest -> Featured ----
    await page.goto(`${APP}?r=${Date.now()}#/`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await lib.waitText(page, 'Buy now', 30000);
    await page.waitForTimeout(2500);
    let featBtn = await findBtn('Featured');
    for (let i = 0; i < 10 && !featBtn; i++) { await page.mouse.move(200, 300); await page.mouse.wheel(0, 500); await page.waitForTimeout(260); featBtn = await findBtn('Featured'); }
    if (featBtn) {
      const apiB = R.api.length;
      const beforeTxt = txtOf(await a11yDump(page));
      await page.mouse.click(featBtn.x + (featBtn.w >> 1), Math.min(featBtn.y + (featBtn.h >> 1), vp.h - 40));
      await page.waitForTimeout(2800);
      const afterTxt = txtOf(await a11yDump(page));
      const newApi = R.api.slice(apiB).map((a) => `${a.m} ${a.u}`);
      results.tabs[vp.name] = {
        featuredSelected: /Featured\b/.test(afterTxt),
        apiFired: newApi.some((x) => x.includes('displayItem')),
        gridChanged: afterTxt.slice(-800) !== beforeTxt.slice(-800),
        apiTail: newApi.slice(0, 6),
      };
      await lib.screenshot(page, `${OUT}/flutter-${vp.name}-08-discover-featured.png`);
    } else {
      results.tabs[vp.name] = { ok: false, why: 'Featured chip not reachable' };
    }

    await lib.closeVideo(ctx, `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-046-${vp.name}.webm`);
    await browser.close().catch(() => {});
  }

  // ============ B. server-side click-count delta probe (fresh product) =======
  try {
    const all = await fetch('http://localhost:8083/api/v1/displayItem/newest?page=0&size=20').then((r) => r.json());
    const items = (all.content || []).filter((it) => it.productId >= 656);
    const pick = items[items.length - 1];
    if (pick) {
      const before = await fetch(`http://localhost:8083/api/v1/products/${pick.productId}/clicks/total`).then((r) => r.json());
      const browser = await lib.newBrowser();
      const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
      page = await ctx.newPage();
      page.setDefaultTimeout(30000);
      await page.goto(`${APP}?r=${Date.now()}`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${APP}?r=${Date.now()}#/`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await lib.waitText(page, 'Buy now', 30000);
      await page.waitForTimeout(2000);
      // deep-link straight to the product detail
      await page.goto(`${APP}?r=${Date.now()}#/product/${pick.productId}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await lib.waitText(page, String(pick.productName).slice(0, 24), 30000);
      await page.waitForTimeout(3500); // fire-and-forget POST lands
      const postFired = R.api.some((a) => a.m === 'POST' && a.u.endsWith(`/products/${pick.productId}/clicks`));
      await page.waitForTimeout(1500);
      const after = await fetch(`http://localhost:8083/api/v1/products/${pick.productId}/clicks/total`).then((r) => r.json());
      results.clickDelta = {
        productId: pick.productId,
        productName: pick.productName,
        beforeTotal: before.totalClickCount ?? before,
        afterTotal: after.totalClickCount ?? after,
        postObservedInPage: postFired,
        increased: (after.totalClickCount ?? 0) > (before.totalClickCount ?? 0),
      };
      await lib.screenshot(page, `${OUT}/flutter-375-09-detail-click-delta.png`);
      await browser.close().catch(() => {});
    }
  } catch (e) {
    results.clickDelta = { error: String(e.message).slice(0, 140) };
  }

  // ============ D. reference parity shots (:3000) ============================
  try {
    const browser = await lib.newBrowser();
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    p.setDefaultTimeout(30000);
    const popups = [];
    p.context().on('page', (np) => { popups.push(np.url()); np.close().catch(() => {}); });
    await p.goto(`${REF}/`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await p.waitForTimeout(4500);
    await lib.screenshot(p, `${OUT}/ref-375-home-top.png`);
    const fabInfo = await p.evaluate(() => {
      const a = document.querySelector('.product-action-aware-whatsapp a[href*="wa.me"], a[href*="wa.me"]');
      if (!a) return null;
      const r = a.getBoundingClientRect();
      return { href: a.getAttribute('href'), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), visible: r.width > 0 };
    });
    if (fabInfo && fabInfo.visible) {
      await p.mouse.click(fabInfo.x, fabInfo.y).catch(() => {});
      await p.waitForTimeout(2500);
      await lib.screenshot(p, `${OUT}/ref-375-after-wa-click.png`).catch(() => {});
    }
    results.ref = { waHref: fabInfo ? fabInfo.href : null, popups, note: 'reference WhatsAppButton is a plain <Link> — same-tab navigation to wa.me' };
    // tablet ref shot
    const ctx2 = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    const p2 = await ctx2.newPage();
    await p2.goto(`${REF}/`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await p2.waitForTimeout(4500);
    await lib.screenshot(p2, `${OUT}/ref-768-home-top.png`);
    await browser.close().catch(() => {});
  } catch (e) {
    results.ref = { error: String(e.message).slice(0, 140) };
  }

  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/tmp/AU-046-run5.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2).slice(0, 6000));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
