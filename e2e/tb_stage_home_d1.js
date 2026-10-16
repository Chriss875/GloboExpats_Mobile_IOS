// tb_stage1.js — HOME shots (375 + 768) and D1 outage vs control, one process.
const fs = require('fs');
const path = require('path');
const { LV, OUT, SHOTS, VID, gotoHome, tapChip } = require('./tb_lib.js');
const { newBrowser, newCtx, closeVideo, allText, waitText, screenshot } = LV;
const R = { ts: new Date().toISOString(), lane: 'http://localhost:9121', stages: {} };

async function sweepRails(p) {
  await p.mouse.move(187, 400);
  for (let i = 0; i < 16; i++) { await p.mouse.wheel(0, 260); await p.waitForTimeout(130); }
  await p.waitForTimeout(900);
}

async function homeState(p) {
  const txt = await allText(p);
  return {
    howItWorksLabel: ['How it works', 'how it works'].some(s => txt.includes(s)),
    hiwLines: txt.split('\n').filter(l => /browse|pay|deliver|rate|How/i.test(l)).slice(0, 8),
    waFabPresent: txt.includes('WhatsApp support'),
    tshCount: (txt.match(/TSh/g) || []).length,
    errorBoxes: { categories: txt.includes('Could not load categories'), products: txt.includes('Could not load products') },
    chips: txt.split('\n').filter(l =>
      /Electronics|Home & Living|Property|Vehicles|Art & Crafts|Beauty & Personal|Books |Fashion|Food & Groceries|Garden & Outdoors|Pet & Supplies/.test(l))
      .map(l => l.slice(0, 120)).slice(0, 6),
  };
}

(async () => {
  const browser = await newBrowser();
  try {
    // ---- HOME at both viewports
    for (const vp of [{ n: '375', w: 375, h: 667 }, { n: '768', w: 768, h: 1024 }]) {
      const ctx = await newCtx(browser, { viewport: { width: vp.w, height: vp.h } });
      const p = await ctx.newPage();
      await gotoHome(p);
      await screenshot(p, path.join(SHOTS, `tb-home-top-${vp.n}.png`));
      await sweepRails(p);
      await screenshot(p, path.join(SHOTS, `tb-home-swept-${vp.n}.png`));
      R.stages['home_' + vp.n] = await homeState(p);
      await ctx.close();
    }
    // ---- D1 CONTROL (no blocking)
    {
      const ctx = await newCtx(browser, { viewport: { width: 375, height: 667 },
        videoPath: path.join(VID, 'AU-046-tiebreak-d1-control.webm') });
      const p = await ctx.newPage();
      await gotoHome(p);
      await sweepRails(p);
      const st = await homeState(p);
      st.foodChipInTree = (await allText(p)).includes('Food & Groceries');
      await tapChip(p, 'Electronics');
      await p.waitForTimeout(2500);
      st.chipNavTxt = (await allText(p)).slice(0, 200);
      st.chipNavWorked = st.chipNavTxt.includes('Back');
      await p.goBack().catch(() => {});
      await p.waitForTimeout(1500);
      await closeVideo(ctx, path.join(VID, 'AU-046-tiebreak-d1-control.webm'));
      R.stages.d1_control = st;
    }
    // ---- D1 ATTACK (abort ONLY /category-availability)
    {
      const ctx = await newCtx(browser, { viewport: { width: 375, height: 667 },
        videoPath: path.join(VID, 'AU-046-tiebreak-d1-outage.webm') });
      const p = await ctx.newPage();
      await p.route('**/api/v1/displayItem/category-availability*', rx => rx.abort('failed'));
      await gotoHome(p);
      await sweepRails(p);
      const txt = await allText(p);
      const st = await homeState(p);
      st.foodChipInTree = txt.includes('Food & Groceries');
      st.availabilityBlockedErrorBoxShown = txt.includes('Could not load categories') ||
        txt.includes('Could not load');
      st.leakedChipGeom = await p.evaluate(() => {
        return [...document.querySelectorAll('flt-semantics')]
          .filter(e => (e.textContent || '').includes('Food & Groceries'))
          .map(e => { const b = e.getBoundingClientRect();
            return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
              tappable: e.getAttribute('flt-tappable') !== null,
              onscreen: b.bottom > 0 && b.top < window.innerHeight }; });
      });
      // does the leaked chip actually work when scrolled to?
      st.leakedChipTapOpensCategoryScreen = false;
      if (st.leakedChipGeom.length) {
        st.leakedChipTapOpensCategoryScreen = await tapChip(p, 'Food & Groceries');
        await p.waitForTimeout(2500);
        const after = (await allText(p)).slice(0, 220);
        st.afterTapTxt = after;
        st.categoryAppbarSeen = after.includes('Back') && /Food|Grocer|Rice/i.test(after);
      }
      await screenshot(p, path.join(SHOTS, 'tb-d1-outage-rails-swept.png'));
      await closeVideo(ctx, path.join(VID, 'AU-046-tiebreak-d1-outage.webm'));
      R.stages.d1_attack = st;
    }
    // ---- D1 second clean repro attempt (skeptic reported it twice-clean)
    {
      const ctx = await newCtx(browser, { viewport: { width: 375, height: 667 } });
      const p = await ctx.newPage();
      await p.route('**/api/v1/displayItem/category-availability*', rx => rx.abort('failed'));
      await gotoHome(p);
      await sweepRails(p);
      const txt = await allText(p);
      R.stages.d1_attack_repro2 = { foodChipInTree: txt.includes('Food & Groceries'),
        errorBox: txt.includes('Could not load'),
        geom: await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
          .filter(e => (e.textContent || '').includes('Food & Groceries')).length) };
      await ctx.close();
    }
  } catch (e) { R.error = String(e.message || e); }
  try { await browser.close(); } catch (_) {}
  fs.writeFileSync(path.join(OUT, 'stage1_home_d1.json'), JSON.stringify(R, null, 2));
  console.log('STAGE1 DONE ' + JSON.stringify(R.stages).slice(0, 1600));
})();
