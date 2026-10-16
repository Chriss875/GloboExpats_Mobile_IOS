// tb_stage6.js — definitive rails enumeration on the CURRENT bundle.
// Horizontally drags the rails band and records EVERY chip (76x110-class
// tappable) in order, control vs availability-outage.
const fs = require('fs');
const path = require('path');
const { LV, OUT, SHOTS, VID, gotoHome } = require('./tb_lib.js');
const { newBrowser, newCtx, closeVideo, screenshot } = LV;

async function bandY(p) {
  // find the rails chip row: smallest tappable containing 'Art & Crafts'
  return p.evaluate(() => {
    const es = [...document.querySelectorAll('flt-semantics')]
      .filter(e => (e.textContent || '').trim().startsWith('Art & Crafts') &&
        e.getAttribute('flt-tappable') !== null);
    const small = es.map(e => e.getBoundingClientRect())
      .filter(r => r.width < 220 && r.height < 160).sort((a, b) => a.width - b.width)[0];
    return small ? { x: small.x + small.width / 2, y: small.y + small.height / 2 } : null;
  });
}

async function scrollBandIntoView(p) {
  for (let i = 0; i < 20; i++) {
    const b = await bandY(p);
    if (b && b.y > 120 && b.y < 560) return b;
    await p.mouse.move(187, 400);
    await p.mouse.wheel(0, b ? (b.y > 560 ? 100 : -100) : 200);
    await p.waitForTimeout(150);
  }
  return bandY(p);
}

async function dragScan(p, bx, by) {
  const seen = new Map(); // label -> min x
  const collect = () => p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t || t.length > 40) return;
      if (e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      if (r.width < 60 || r.width > 110 || r.height < 95 || r.height > 125) return;
      out.push({ label: t, x: Math.round(r.x) });
    });
    return out;
  });
  for (let chip of await collect()) if (!seen.has(chip.label) || seen.get(chip.label) > chip.x)
    seen.set(chip.label, chip.x);
  for (let round = 0; round < 12; round++) {
    const before = seen.size;
    await p.mouse.move(bx, by);
    await p.mouse.down();
    for (let s = 0; s < 5; s++) { await p.mouse.move(bx - (s + 1) * 50, by, { steps: 4 }); await p.waitForTimeout(60); }
    await p.mouse.up();
    await p.waitForTimeout(700);
    for (let chip of await collect()) if (!seen.has(chip.label) || seen.get(chip.label) > chip.x)
      seen.set(chip.label, chip.x);
    if (seen.size === before && round > 2) break;
  }
  return [...seen.entries()].map(([label, x]) => ({ label, x })).sort((a, b) => a.x - b.x)
    .reduce((acc, c, i, arr) => { // order recovered via drag history: keep simple list
      (acc.labels = acc.labels || []);
      if (!acc.labels.includes(c.label)) acc.labels.push(c.label);
      return acc;
    }, {}).labels;
}

(async () => {
  const browser = await newBrowser();
  const R = {};
  for (const mode of ['control', 'outage']) {
    const ctx = await newCtx(browser, { viewport: { width: 375, height: 667 },
      videoPath: path.join(VID, `AU-046-tiebreak-d1d-${mode}.webm`) });
    const p = await ctx.newPage();
    const netlog = [];
    p.on('response', rx => { const u = rx.url();
      if (u.includes('/api/v1/')) netlog.push({ s: rx.status(), u: u.slice(-55) }); });
    if (mode === 'outage') await p.route('**/api/v1/displayItem/category-availability*',
      rx => rx.abort('failed'));
    await gotoHome(p);
    const b = await scrollBandIntoView(p);
    R[mode + '_bandFound'] = !!b;
    if (!b) { R[mode] = { error: 'band not found', avail: (netlog.find(n => n.u.includes('avail')) || {}).s }; await ctx.close(); continue; }
    const chips = await dragScan(p, Math.round(b.x), Math.round(b.y));
    R[mode] = {
      chips,
      count: chips.length,
      availabilityStatus: (netlog.find(n => n.u.includes('avail')) || {}).s ?? 'none',
      emptySlugsRendered: ['Garden & Outdoors', 'Pet & Supplies'].filter(c => chips.includes(c)),
      foodChipRendered: chips.includes('Food & Groceries'),
    };
    await screenshot(p, path.join(SHOTS, `tb-d1d-${mode}-rails-mid.png`));
    await closeVideo(ctx, path.join(VID, `AU-046-tiebreak-d1d-${mode}.webm`));
  }
  try { await browser.close(); } catch (_) {}
  if (R.control && R.outage) {
    R.diff = {
      gainedUnderOutage: R.outage.chips.filter(c => !R.control.chips.includes(c)),
      lostUnderOutage: R.control.chips.filter(c => !R.outage.chips.includes(c)),
    };
  }
  fs.writeFileSync(path.join(OUT, 'd1d_rails_enum.json'), JSON.stringify(R, null, 2));
  console.log('D1D DONE ' + JSON.stringify({ ctl: R.control, out: R.outage, diff: R.diff }));
})();
