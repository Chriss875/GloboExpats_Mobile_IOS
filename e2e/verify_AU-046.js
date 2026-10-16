// AU-046 verifier — category_rails_howitworks_wa_float
// Canonical checklist on the FROZEN Flutter bundle :9110 (never :9100).
// Criteria: rails skip empty slugs via category-availability; click tracking POST
// fires; 4-step how-it-works strip renders; wa.me deep link opens (url_launcher).
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9110';
const REF = 'http://localhost:3000';

const VPS = [
  { name: '375', viewport: { width: 375, height: 667 } },
  { name: '768', viewport: { width: 768, height: 1024 } },
];

function a11yDump(p) {
  return p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach((e) => {
      const r = e.getBoundingClientRect();
      out.push({
        role: e.getAttribute('role') || '',
        tappable: e.getAttribute('flt-tappable') !== null,
        tag: e.tagName,
        label: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 120),
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
        onscreen: r.bottom > 0 && r.top < window.innerHeight && r.width > 0 && r.height > 0,
      });
    });
    return out;
  });
}

async function tapAt(p, n) {
  await p.mouse.click(n.x + Math.floor(n.w / 2), Math.min(Math.max(n.y + Math.floor(n.h / 2), 4), 660));
}

(async () => {
  const summary = { runs: [] };
  for (const vp of VPS) {
    const run = { vp: vp.name, images: {}, apiCalls: [], popups: [], clicks: [], states: {} };
    const browser = await lib.newBrowser();
    const ctx = await lib.newCtx(browser, {
      viewport: vp.viewport,
      videoPath: `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-046-${vp.name}.webm`,
    });
    const p = await ctx.newPage();
    p.setDefaultTimeout(25000);

    // ---- network watchers -------------------------------------------------
    const imgMap = {};
    p.on('response', (r) => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(u) ||
          /\/assets\/.*(png|webp|jpe?g|gif)(\?|#|$)/i.test(u) ||
          /assets\/assets\//.test(u)) imgMap[u] = r.status();
    });
    p.on('request', (rq) => {
      const u = rq.url();
      if (/8083|9110/.test(u) && /\/api\//.test(u)) run.apiCalls.push({ m: rq.method(), u: u.replace(/\?.*$/, '') });
    });
    p.context().on('page', (np) => { run.popups.push(np.url()); np.close().catch(() => {}); });

    // ---- fresh session, home ---------------------------------------------
    await p.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await p.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await lib.waitText(p, 'Buy now', 30000);
    await p.waitForTimeout(3500); // rails availability fetch + discover grid

    // state A: top of home (hero + how-it-works)
    let nodes = await a11yDump(p);
    run.states.top = nodes;
    await lib.screenshot(p, `/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-046/flutter-${vp.name}-01-home-top.png`);

    const allTextTop = nodes.map((n) => n.label).join('\n');
    run.hiw = {};
    for (const step of ['Find', 'Pay', 'We Deliver', 'You Receive']) {
      const re = new RegExp(`How GloboExpats works: ${step}\\b`);
      run.hiw[step] = re.test(allTextTop);
    }
    run.copy = {
      chooseAnyItem: /Choose any item/.test(allTextTop),
      paySecurely: /Pay securely/.test(allTextTop),
      toYourLocation: /To your location/.test(allTextTop),
      withConfidence: /With confidence/.test(allTextTop),
    };

    // ---- scroll through whole page collecting states ----------------------
    const H = vp.viewport.height;
    const scrollSeq = [H * 0.55, H * 0.55, H * 0.55];
    let idx = 2;
    for (const dy of scrollSeq) {
      await p.mouse.move(200, 400);
      await p.mouse.wheel(0, dy);
      await p.waitForTimeout(1200);
      const txt = (await a11yDump(p)).map((n) => n.label).join('\n');
      if (idx === 2 && /Shop by Category/.test(txt)) {
        run.states.rails = txt;
        await lib.screenshot(p, `/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-046/flutter-${vp.name}-02-shop-by-category.png`);
      }
      if (idx === 3 && /Most Popular Categories/.test(txt)) {
        await lib.screenshot(p, `/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-046/flutter-${vp.name}-03-popular-cats.png`);
      }
      if (idx === 4 && /(Newest|Discover)/i.test(txt)) {
        run.states.discover = txt;
        await lib.screenshot(p, `/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-046/flutter-${vp.name}-04-discover.png`);
        break;
      }
      idx++;
    }

    // rail labels visible after skipping empty slugs (15,10,12 must be gone)
    const railTxt = run.states.rails || '';
    run.rails = {
      shopByCategory: /Shop by Category/.test(railTxt),
      hasEmptyCat_FoodGroceries: /Food ?& ?Groceries/i.test(railTxt),
      hasEmptyCat_GardenOutdoors: /Garden ?& ?Outdoors/i.test(railTxt),
      hasEmptyCat_PetSupplies: /Pet ?& ?Supplies/i.test(railTxt),
      sample: (railTxt.match(/Electronics|Clothing|Furniture|Beauty & Personal Care/g) || []).slice(0, 8),
    };

    // ---- enumerate controls over full scroll sweep ------------------------
    const seen = new Map();
    const steps = 16;
    await p.mouse.move(200, 400);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(500);
    for (let s = 0; s < steps; s++) {
      const ns = await a11yDump(p);
      for (const n of ns) {
        if (!n.onscreen) continue;
        if (!(n.role === 'button' || n.tappable)) continue;
        if (n.w >= vp.viewport.width - 4 && n.h >= vp.viewport.height - 4) continue; // page wrapper
        const key = `${n.role}|${n.label}`;
        if (!seen.has(key)) seen.set(key, n);
      }
      await p.mouse.wheel(0, Math.floor(vp.viewport.height * 0.62));
      await p.waitForTimeout(420);
    }
    run.controls = [...seen.values()];

    // ---- click EVERY control, assert observable effect ---------------------
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(600);
    let ci = 0;
    for (const c of run.controls) {
      ci++;
      const before = p.url();
      const callsBefore = run.apiCalls.length;
      let navOrEffect = null;
      try {
        // re-locate node by label at current scroll (page may have moved)
        const cur = await p.evaluate((lbl) => {
          let best = null;
          document.querySelectorAll('flt-semantics').forEach((e) => {
            const lab = (e.getAttribute('aria-label') || e.textContent || '').trim();
            const want = lbl.split('|')[1] || '';
            if (!want || !lab.startsWith(want.slice(0, 24))) return;
            const roleOk = e.getAttribute('role') === lbl.split('|')[0];
            if (!roleOk) return;
            const r = e.getBoundingClientRect();
            if (r.bottom < 40 || r.top > innerHeight - 40 || r.width < 8 || r.height < 8) return;
            if (!best || r.width * r.height < best.w * best.h) {
              best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: r.width, h: r.height };
            }
          });
          return best;
        }, `${c.role}|${c.label}`);
        if (!cur) { run.clicks.push({ i: ci, label: c.label, ok: false, why: 'not-relocatable-after-scroll' }); continue; }
        await tapAt(p, cur);
        await p.waitForTimeout(1600);
        const after = p.url();
        const txtNow = (await a11yDump(p)).map((n) => n.label).join('\n');
        const newApi = run.apiCalls.length - callsBefore;
        const effects = [];
        if (after !== before) effects.push(`nav:${after.slice(-42)}`);
        if (newApi > 0) effects.push(`+${newApi} api`);
        if (/Could not load|Try again|no listings|No products/i.test(txtNow)) effects.push('error-or-empty-copy');
        if (/Back|Back to|Share|Add to cart|Buy now|Description|Reviews/i.test(txtNow) && !/^home$/i.test(after)) effects.push('detail-chrome');
        // detect dialog/snackbar-ish additions
        if (/GloboExpats support/.test(txtNow)) effects.push('wa-snackbar');
        run.clicks.push({ i: ci, label: c.label, ok: effects.length > 0, effects });
        // navigate back if we left home
        if (after !== before) {
          await p.goto(`${APP}/#/`, { waitUntil: 'load', timeout: 45000 }).catch(() => {});
          await lib.waitText(p, 'Buy now', 30000);
          await p.waitForTimeout(1500);
        }
      } catch (e) {
        run.clicks.push({ i: ci, label: c.label, ok: false, why: String(e.message).slice(0, 90) });
      }
    }

    run.images = imgMap;
    summary.runs.push(run);
    await lib.closeVideo(ctx, `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-046-${vp.name}.webm`);
    await browser.close().catch(() => {});
  }
  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/tmp/AU-046-run.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary.runs.map((r) => ({
    vp: r.vp,
    hiw: r.hiw,
    copy: r.copy,
    rails: r.rails,
    api_first20: r.apiCalls.slice(0, 20),
    availability_called: r.apiCalls.some((a) => /category-availability/.test(a.u)),
    popups: r.popups,
    imgs_total: Object.keys(r.images).length,
    imgs_bad: Object.entries(r.images).filter(([, s]) => s >= 400),
    controls: r.controls.length,
    clicks_ok: r.clicks.filter((c) => c.ok).length,
    clicks_fail: r.clicks.filter((c) => !c.ok),
  })), null, 2));
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
