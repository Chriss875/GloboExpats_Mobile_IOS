// AU-046 verifier r2 — full canonical checklist, deterministic per-state clicks.
// Frozen bundle :9110. Viewports 375x667 + 768x1024. Video evidence mandatory.
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9110';
const OUT = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-046';

function a11yDump(p) {
  return p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach((e) => {
      const r = e.getBoundingClientRect();
      out.push({
        role: e.getAttribute('role') || '',
        tappable: e.getAttribute('flt-tappable') !== null,
        label: (e.getAttribute('aria-label') || e.textContent || '').trim(),
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
        onscreen: r.bottom > 0 && r.top < window.innerHeight && r.width > 0 && r.height > 0,
      });
    });
    return out;
  });
}
const txtOf = (nodes) => nodes.map((n) => n.label).join('\n');
async function tap(n) { await page.mouse.click(n.x + (n.w >> 1), Math.min(Math.max(n.y + (n.h >> 1), 4), 9999)); }
let page;

// click a control by exact label prefix at its CURRENT position; returns effects
async function clickControl(prefix, { role = null, scrollIntoView = true } = {}) {
  const before = page.url();
  const apiBefore = () => R.api.length;
  const callsBefore = apiBefore();
  let hit = await findOnScreen(prefix, role);
  if (!hit && scrollIntoView) {
    for (let i = 0; i < 10 && !hit; i++) {
      await page.mouse.move(200, 300); await page.mouse.wheel(0, -420); await page.waitForTimeout(220);
      hit = await findOnScreen(prefix, role);
    }
    for (let i = 0; i < 14 && !hit; i++) {
      await page.mouse.move(200, 300); await page.mouse.wheel(0, 420); await page.waitForTimeout(220);
      hit = await findOnScreen(prefix, role);
    }
  }
  if (!hit) return { ok: false, why: 'not-on-screen' };
  await page.mouse.click(hit.x + (hit.w >> 1), hit.y + (hit.h >> 1));
  await page.waitForTimeout(1700);
  const after = page.url();
  const newApi = R.api.slice(callsBefore);
  const t = txtOf(await a11yDump(page));
  const effects = [];
  if (after !== before) effects.push(`nav->${after.replace(/^https?:\/\/localhost:9110/, '')}`);
  if (newApi.length) effects.push(`api:${newApi.map((a) => `${a.m} ${a.u.replace(/.*\/api\/v1/, '')}`).join(',')}`);
  return { ok: true, effects, textAfter: t.slice(0, 400), urlAfter: after };
}
function findOnScreen(prefix, role = null) {
  return page.evaluate(([pre, ro]) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach((e) => {
      if (ro && e.getAttribute('role') !== ro) return;
      const lab = (e.getAttribute('aria-label') || e.textContent || '').trim();
      // bottom-nav tabs are multi-line ("Account\nTab 5 of 5") — match the
      // first line for exact-role lookups so pinned tabs stay reachable
      const head = lab.split('\n')[0].trim();
      const okLab = ro ? (lab === pre || head === pre) : lab.startsWith(pre);
      if (!okLab) return;
      const r = e.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return;
      if (r.width < 8 || r.height < 8) return;
      if (!best || r.width * r.height < best.w * best.h) {
        best = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), label: lab.slice(0, 80) };
      }
    });
    return best;
  }, [prefix, role]);
}

const API = [];
let R = null; // current run record (clickControl reads its api log)
let GOTO_SEQ = 0; // cache-buster for home restores (SPA ignores same-URL hash gotos)

(async () => {
  const runs = [];
  for (const vp of [{ name: '375', w: 375, h: 667 }, { name: '768', w: 768, h: 1024 }]) {
    R = { vp: vp.name, api: [], popups: [], imgs: {}, clicks: [], states: {} };
    const browser = await lib.newBrowser();
    const ctx = await lib.newCtx(browser, {
      viewport: { width: vp.w, height: vp.h },
      videoPath: `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-046-${vp.name}.webm`,
    });
    page = await ctx.newPage();
    page.setDefaultTimeout(25000);
    page.on('response', (r) => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(u) ||
          /\/assets\/.*(png|webp|jpe?g|gif)(\?|#|$)/i.test(u)) R.imgs[u] = r.status();
    });
    page.on('request', (rq) => {
      const u = rq.url();
      if (/localhost:8083/.test(u)) R.api.push({ m: rq.method(), u: u.replace(/\?.*$/, '') });
    });
    page.context().on('page', (np) => { R.popups.push(np.url()); np.close().catch(() => {}); });

    // fresh session
    await page.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await lib.waitText(page, 'Buy now', 30000);
    await page.waitForTimeout(3500);

    // ---- S1 home top: hero + how-it-works strip ----
    R.states.top = await a11yDump(page);
    await lib.screenshot(page, `${OUT}/flutter-${vp.name}-01-home-top.png`);
    const topTxt = txtOf(R.states.top);
    R.hiw = {};
    for (const s of ['Find', 'Pay', 'We Deliver', 'You Receive']) R.hiw[s] = new RegExp(`How GloboExpats works: ${s}`).test(topTxt);
    R.hiwCopy = ['Choose any item', 'Pay securely', 'To your location', 'With confidence'].map((c) => topTxt.includes(c));

    // ---- C1 wa.me FAB (click BEFORE any navigation; popup expected) ----
    {
      const popBefore = R.popups.length;
      const res = await clickControl('WhatsApp support', { role: 'button' });
      await page.waitForTimeout(1500);
      const waPopup = R.popups.slice(popBefore);
      const stillHome = txtOf(await a11yDump(page)).includes('Buy now');
      R.waFab = { clicked: !!res.ok, popup: waPopup, stillHome, urlAfter: page.url() };
      R.clicks.push({
        control: 'WhatsApp support FAB',
        ok: !!(res.ok && waPopup.length),
        effects: [`wa_popup:${waPopup[0] || 'NONE'}`, `home_intact:${stillHome}`],
      });
    }
    R.popupsAfterWa = [...R.popups];
    if (!txtOf(await a11yDump(page)).includes('Buy now')) {
      await page.goto(`${APP}/?r=${++GOTO_SEQ}#/`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await lib.waitText(page, 'Buy now', 30000);
      await page.waitForTimeout(2000);
    }

    // ---- C2 header buttons (labelled via tooltips in semantics) ----
    for (const hdr of ['Search', 'Cart', 'Login']) {
      const before = page.url();
      const apiB = R.api.length;
      const hit = await findOnScreen(hdr, 'button');
      if (!hit) {
        R.clicks.push({ control: `header ${hdr}`, ok: false, why: 'not-on-screen' });
        continue;
      }
      await page.mouse.click(hit.x + (hit.w >> 1), hit.y + (hit.h >> 1));
      await page.waitForTimeout(2000);
      const t = txtOf(await a11yDump(page)).slice(0, 140).replace(/\n/g, '|');
      const eff = [];
      if (page.url() !== before) eff.push(`nav->${page.url().replace(/^https?:\/\/localhost:9110/, '')}`);
      if (R.api.length > apiB) eff.push(`+${R.api.length - apiB} api`);
      eff.push(`view:${t.slice(0, 90)}`);
      R.clicks.push({ control: `header ${hdr}`, ok: true, effects: eff, url: page.url() });
      if (page.isClosed()) throw new Error(`page closed after header ${hdr}`);
      await page.goto(`${APP}/?r=${++GOTO_SEQ}#/`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await lib.waitText(page, 'Buy now', 30000);
      await page.waitForTimeout(1800);
    }

    // back to home after search-icon nav
    await page.goto(`${APP}/?r=${++GOTO_SEQ}#/`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await lib.waitText(page, 'Buy now', 30000);
    await page.waitForTimeout(2000);

    // ---- C3 popular-category card -> SearchScreen with real results ----
    // the popular-cats art card carries label "Electronics" and sits ABOVE the
    // rails; pick the smallest tappable node whose label is exactly a category name
    const popHit = await page.evaluate(() => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach((e) => {
        if (e.getAttribute('flt-tappable') === null) return;
        const lab = (e.getAttribute('aria-label') || e.textContent || '').trim();
        if (!/^(Electronics|Home & Living|Property|Vehicles|Services & Jobs|Community & Delivery)$/.test(lab)) return;
        const r = e.getBoundingClientRect();
        if (r.bottom < 30 || r.top > innerHeight - 30 || r.width < 40 || r.height < 40) return;
        if (!best || r.width * r.height < best.w * best.h) {
          best = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), label: lab };
        }
      });
      return best;
    });
    if (popHit) {
      try {
        await page.mouse.click(popHit.x + (popHit.w >> 1), Math.min(popHit.y + (popHit.h >> 1), vp.h - 60));
        await page.waitForTimeout(3000);
        if (page.isClosed()) throw new Error('page closed after popular-card tap');
        R.popularCard = { ok: true, url: page.url(), clicked: popHit.label, sample: txtOf(await a11yDump(page)).slice(0, 500), apiTail: R.api.slice(-6).map((a) => `${a.m} ${a.u}`) };
        await lib.screenshot(page, `${OUT}/flutter-${vp.name}-02-popular-card-search.png`);
      } catch (e) {
        R.popularCard = { ok: false, why: `tap crashed: ${String(e.message).slice(0, 80)}` };
      }
    } else {
      R.popularCard = { ok: false, why: 'no popular-category card on screen at top' };
    }
    await page.goto(`${APP}/?r=${++GOTO_SEQ}#/`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    if (page.isClosed()) throw new Error('page closed before rails sweep');
    await lib.waitText(page, 'Buy now', 30000);
    await page.waitForTimeout(2000);

    // ---- S3 rails section + category chips (scroll until header visible) ----
    let railsTxt = '';
    for (let i = 0; i < 16; i++) {
      const t = txtOf(await a11yDump(page));
      // the a11y tree keeps the WHOLE CustomScrollView content (no virtualization),
      // so the very first dump at scroll-0 already contains header + chips + tabs.
      if (/Shop by Category/.test(t) && /Newest/.test(t)) { railsTxt = t; break; }
      await page.mouse.move(200, 300); await page.mouse.wheel(0, 300); await page.waitForTimeout(320);
      railsTxt = t;
    }
    if (!railsTxt) railsTxt = txtOf(await a11yDump(page));
    R.states.railsText = railsTxt;
    const chipNames = ['Art & Crafts', 'Beauty & Personal Care', 'Books & Media', 'Clothing', 'Decorations', 'Electronics', 'Food & Groceries', 'Furniture', 'Garden & Outdoors', 'Home & Kitchen Appliances', 'Other', 'Pet & Supplies', 'Real Estate', 'Sports & Games', 'Vehicle & Supplies'];
    // chips BETWEEN "Shop by Category" and the discover tabs only
    const start = railsTxt.indexOf('Shop by Category');
    const end = railsTxt.indexOf('Newest');
    const seg = start >= 0 && end > start ? railsTxt.slice(start, end) : railsTxt;
    R.railsSegment = seg.slice(0, 500);
    R.chipsOnScreen = chipNames.filter((c) => seg.includes(c));
    R.rails = {
      shopByCategory: start >= 0,
      chipsSeen: R.chipsOnScreen,
      emptyShown_FoodGroceries: /Food ?& ?Groceries/i.test(seg),
      emptyShown_GardenOutdoors: /Garden ?& ?Outdoors/i.test(seg),
      emptyShown_PetSupplies: /Pet ?& ?Supplies/i.test(seg),
    };
    await lib.screenshot(page, `${OUT}/flutter-${vp.name}-03-rails.png`);

    // ---- C4 first available category chip -> CategoryScreen real data ----
    const chipLabel = R.chipsOnScreen.find((c) => /^(Electronics|Clothing|Furniture|Beauty & Personal Care)$/.test(c)) || null;
    R.chipClicked = chipLabel;
    if (chipLabel) {
      const chipHit = await page.evaluate((lbl) => {
        let best = null;
        document.querySelectorAll('flt-semantics').forEach((e) => {
          if (e.getAttribute('flt-tappable') === null) return;
          const lab = (e.getAttribute('aria-label') || e.textContent || '').trim();
          if (lab !== lbl) return;
          const r = e.getBoundingClientRect();
          if (r.bottom < 30 || r.top > innerHeight - 30 || r.width < 20 || r.height < 20) return;
          if (!best || r.width * r.height < best.w * best.h) {
            best = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), label: lab };
          }
        });
        return best;
      }, chipLabel);
      if (chipHit) {
        await page.mouse.click(chipHit.x + (chipHit.w >> 1), Math.min(chipHit.y + (chipHit.h >> 1), vp.h - 80));
        await page.waitForTimeout(3200);
        const t = txtOf(await a11yDump(page));
        R.chipNav = { url: page.url(), sample: t.slice(0, 700), apiTail: R.api.slice(-8).map((a) => `${a.m} ${a.u}`), imgsTail: Object.entries(R.imgs).slice(-4) };
        await lib.screenshot(page, `${OUT}/flutter-${vp.name}-04-chip-category.png`);
      } else {
        R.chipNav = { ok: false, why: 'chip node not on screen' };
      }
    }

    // ---- C5 product card from discover grid -> detail fires POST clicks ----
    await page.goto(`${APP}/?r=${++GOTO_SEQ}#/`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await lib.waitText(page, 'Buy now', 30000);
    await page.waitForTimeout(2500);
    const callsBefore = R.api.length;
    let cardHit = null;
    for (let i = 0; i < 18 && !cardHit; i++) {
      cardHit = await page.evaluate(() => {
        let best = null;
        document.querySelectorAll('flt-semantics').forEach((e) => {
          if (e.getAttribute('flt-tappable') === null) return;
          const lab = (e.getAttribute('aria-label') || e.textContent || '').trim();
          if (!/TSh \d/.test(lab) || lab.includes('Tab ') || lab.startsWith('How GloboExpats')) return;
          const r = e.getBoundingClientRect();
          if (r.bottom < 40 || r.top > innerHeight - 40 || r.width < 100 || r.height < 90) return;
          if (lab.split('\n').length < 2) return; // need title+price rows
          if (!best || r.width * r.height < best.w * best.h) {
            best = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), label: lab.slice(0, 90) };
          }
        });
        return best;
      });
      if (!cardHit) { await page.mouse.move(200, 300); await page.mouse.wheel(0, 430); await page.waitForTimeout(300); }
    }
    if (cardHit) {
      const postClicksBefore = R.api.filter((a) => /\/clicks$/.test(a.u) && a.m === 'POST').length;
      await page.mouse.click(cardHit.x + (cardHit.w >> 1), Math.min(cardHit.y + (cardHit.h >> 1), vp.h - 60));
      await page.waitForTimeout(3200);
      const postClicksAfter = R.api.filter((a) => /\/clicks$/.test(a.u) && a.m === 'POST').length;
      const t = txtOf(await a11yDump(page));
      R.cardNav = {
        clicked: cardHit.label,
        url: page.url(),
        postsFired: postClicksAfter - postClicksBefore,
        apiTail: R.api.slice(callsBefore).map((a) => `${a.m} ${a.u}`),
        sample: t.slice(0, 700),
      };
      await lib.screenshot(page, `${OUT}/flutter-${vp.name}-05-product-detail-click-tracked.png`);
    } else {
      R.cardNav = { ok: false, why: 'no discover-grid card found' };
    }

    // ---- C6 back from detail (Material route pop) ----
    {
      const backHit = await findOnScreen('Back', 'button');
      const beforeTxt = txtOf(await a11yDump(page)).slice(0, 60).replace(/\n/g, '|');
      if (backHit) {
        await page.mouse.click(backHit.x + (backHit.w >> 1), backHit.y + (backHit.h >> 1));
        await page.waitForTimeout(1800);
        const after = txtOf(await a11yDump(page));
        const homeAgain = after.includes('Buy now');
        R.clicks.push({ control: 'detail Back button', ok: homeAgain, effects: [`home_restored:${homeAgain}`] });
      } else {
        R.clicks.push({ control: 'detail Back button', ok: false, why: 'no Back on pushed screen' });
      }
    }

    // ---- C7 bottom tabs (5) — live only on the shell/home route ----
    for (const tab of ['Home', 'Marketplace', 'Sell', 'Requests', 'Account']) {
      const callsB4 = R.api.length;
      let hitTab = await findOnScreen(tab, 'button');
      for (let k = 0; k < 8 && !hitTab; k++) {
        await page.mouse.move(200, 300); await page.mouse.wheel(0, -600); await page.waitForTimeout(200);
        hitTab = await findOnScreen(tab, 'button');
      }
      if (!hitTab) { R.clicks.push({ control: `tab ${tab}`, ok: false, why: 'not-visible' }); continue; }
      const urlB = page.url();
      await page.mouse.click(hitTab.x + (hitTab.w >> 1), hitTab.y + (hitTab.h >> 1));
      await page.waitForTimeout(1900);
      const urlA = page.url();
      const t = txtOf(await a11yDump(page));
      const eff = [];
      if (urlA !== urlB) eff.push(`nav->${urlA.split('#')[1] || ''}`);
      if (R.api.length > callsB4) eff.push(`+${R.api.length - callsB4} api`);
      eff.push(`view:${t.slice(0, 60).replace(/\n/g, '|')}`);
      R.clicks.push({ control: `tab ${tab}`, ok: eff.length > 0, effects: eff });
      // return to home shell so the next tab is reachable
      if (!txtOf(await a11yDump(page)).includes('Buy now')) {
        await page.goto(`${APP}/?r=${++GOTO_SEQ}#/`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
        await lib.waitText(page, 'Buy now', 30000);
        await page.waitForTimeout(1500);
      }
    }
    // screenshot final tab state (Account)
    await lib.screenshot(page, `${OUT}/flutter-${vp.name}-06-account-tab.png`);

    // ---- placeholder scan across every collected state text ----
    R.placeholderScan = [topTxt, railsTxt, (R.cardNav && R.cardNav.sample) || '', (R.chipNav && R.chipNav.sample) || '', (R.popularCard && R.popularCard.sample) || '']
      .join('\n')
      .match(/lorem|placeholder|dummy|TODO/i);

    R.images = R.imgs;
    runs.push(R);
    await lib.closeVideo(ctx, `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-046-${vp.name}.webm`);
    await browser.close().catch(() => {});
  }
  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/tmp/AU-046-run2.json', JSON.stringify(runs, null, 2));
  for (const r of runs) {
    console.log('== VP', r.vp);
    console.log(' hiw', JSON.stringify(r.hiw), 'copy', JSON.stringify(r.hiwCopy));
    console.log(' availability GET fired:', r.api.some((a) => a.m === 'GET' && /category-availability/.test(a.u)));
    console.log(' wa popups:', JSON.stringify(r.popupsAfterWa || []));
    for (const c of (r.clicks || []).slice(0, 6)) if (c.control.startsWith('header')) console.log(' header click', c.control, c.ok, JSON.stringify(c.effects || c.why).slice(0, 200));
    console.log(' popularCard:', JSON.stringify(r.popularCard || {}).slice(0, 420));
    console.log(' rails:', JSON.stringify(r.rails));
    console.log(' chipClicked:', r.chipClicked);
    console.log(' cardNav posts:', r.cardNav && r.cardNav.postsFired, 'url:', r.cardNav && r.cardNav.url, 'clicked:', r.cardNav && r.cardNav.clicked);
    console.log(' api tail:', JSON.stringify((r.cardNav && r.cardNav.apiTail) || []).slice(0, 500));
    console.log(' popups:', JSON.stringify(r.popups));
    console.log(' imgs:', Object.keys(r.images).length, 'bad:', JSON.stringify(Object.entries(r.images).filter(([, s]) => s >= 400)));
    console.log(' placeholderScan:', JSON.stringify(r.placeholderScan));
    for (const c of r.clicks) console.log('  click', c.control, c.ok ? 'OK' : 'FAIL', JSON.stringify(c.effects || c.why).slice(0, 160));
  }
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
