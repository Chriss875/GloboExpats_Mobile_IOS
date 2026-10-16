// AU-031 r3b — synchronized UI-vs-API drift measurement + final state shots.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9113';
const UNIT = 'AU-031';
const S = (f) => path.resolve(__dirname, 'shots', UNIT, f);
const out = [];
(async () => {
  const b = await L.newBrowser();
  // tablet context FIRST so its video captures the whole pass
  const ctx768 = await b.newContext({ viewport: { width: 768, height: 1024 }, recordVideo: { dir: path.resolve(__dirname, 'videos'), size: { width: 768, height: 1024 } } });
  const q7 = await ctx768.newPage();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 }, recordVideo: { dir: path.resolve(__dirname, 'videos'), size: { width: 375, height: 667 } } });
  const p = await ctx.newPage();
  const token = await L.apiLogin();

  async function prep(pg, vp) {
    await pg.addInitScript((t) => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); }, token);
    await pg.goto(APP + '/account/payments', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 25; i++) {
      const t = await pg.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('|'));
      if (t.includes('Pending')) break;
      await pg.waitForTimeout(1000);
    }
    await pg.waitForTimeout(2500);
  }
  const grabUI = (pg) => pg.evaluate(() => [...document.querySelectorAll('flt-semantics[role="group"]')]
    .map(e => e.getAttribute('aria-label') || '').filter(t => t.includes('Complete payment within'))
    .map(t => ({ pf: t.split('\n')[0], rem: t.match(/within (\d{2}):(\d{2}):(\d{2})/).slice(1).reduce((a, v) => a * 60 + +v, 0) })));

  await prep(p, '375');
  await prep(q7, '768');

  // --- synchronized drift: API read and UI grab within the same second ---
  const apiBefore = await (async () => { const r = await fetch('http://localhost:8083/api/v1/payments/my', { headers: { Authorization: 'Bearer ' + token } }); return r.json(); })();
  const tApi = Date.now();
  const ui = await grabUI(p);
  const tUi = Date.now();
  let maxDrift = null; const pairs = [];
  for (const u of ui) {
    const row = apiBefore.find(r => r.proformaNumber === u.pf && r.status === 'PENDING_PAYMENT');
    if (!row) continue;
    const srv = Math.round((new Date(row.expiresAt).getTime() - tApi) / 1000) - Math.round((tUi - tApi) / 1000);
    const d = Math.abs(u.rem - srv);
    pairs.push(`${u.pf} ui=${u.rem}s srv=${srv}s d=${d}s`);
    maxDrift = maxDrift === null ? d : Math.max(maxDrift, d);
  }
  out.push({ check: 'sync_drift_375', ok: ui.length === apiBefore.filter(r => r.status === 'PENDING_PAYMENT').length && maxDrift <= 5, pairs: pairs.join(' | '), ui_count: ui.length });
  console.log('SYNC-DRIFT-375:', JSON.stringify(out[out.length - 1]));

  // --- tick cadence: sample every 5s for 35s ---
  const samples = [];
  for (let i = 0; i < 8; i++) {
    const g = await grabUI(p);
    samples.push(g[0] ? g[0].rem : null);
    await p.waitForTimeout(5000);
  }
  const deltas = samples.slice(1).map((v, i) => v - samples[i]).filter(v => v !== 0);
  out.push({ check: 'tick_cadence', samples, nonzero_deltas: deltas });
  console.log('TICK:', JSON.stringify(out[out.length - 1]));

  // --- urgent-state shot (all live rows are < 3h right now) ---
  await p.screenshot({ path: S('flutter-375-pending-urgent-window.png') });

  // --- Approved tab shot via chip coordinates ---
  async function tapChip(pg, name) {
    const c = await pg.evaluate((nme) => {
      const e = [...document.querySelectorAll('flt-semantics')].find(x => (x.textContent || '').trim().startsWith(nme));
      if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }, name);
    if (c) { await pg.mouse.click(c.x, c.y); await pg.waitForTimeout(1500); }
    return !!c;
  }
  A: await tapChip(p, 'Approved');
  await p.screenshot({ path: S('flutter-375-approved-tab.png') });
  const approvedCards = await p.evaluate(() => [...document.querySelectorAll('flt-semantics[role="group"]')].map(e => e.getAttribute('aria-label') || '').filter(t => t.startsWith('PF-')));
  out.push({ check: 'approved_tab_no_countdown', ok: approvedCards.every(c => !c.includes('Complete payment within')) && approvedCards.length > 0, n: approvedCards.length });
  console.log('APPROVED:', JSON.stringify(out[out.length - 1]));

  await tapChip(p, 'Pending'); await p.waitForTimeout(800);

  // tablet drift + shot
  const ui7 = await grabUI(q7);
  await q7.screenshot({ path: S('flutter-768-payments.png') });
  out.push({ check: 'tablet_labels', count: ui7.length, vals: ui7.map(u => `${u.pf}=${u.rem}s`) });
  console.log('TABLET:', JSON.stringify(out[out.length - 1]));

  await L.closeVideo(ctx, path.resolve(__dirname, 'videos', `${UNIT}-mobile.webm`)).catch(() => {});
  await L.closeVideo(ctx768, path.resolve(__dirname, 'videos', `${UNIT}-tablet.webm`)).catch(() => {});
  fs.writeFileSync(path.resolve(__dirname, 'tmp', 'au031_r3b_out.json'), JSON.stringify(out, null, 1));
  console.log('DONE_OK');
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
