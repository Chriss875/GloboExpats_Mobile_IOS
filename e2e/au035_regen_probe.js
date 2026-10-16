// au035_regen_probe.js — settle the ONE open AU-035 finding: does the
// 'Generate new code' control on the delivery-tracking child screen have an
// observable effect for a COMPLETED order (expected: POST regenerate → 409 +
// verbatim refusal surfaced), or is it a dead button?
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9112';
const O12 = '2499e6e9-b5f9-4b47-982e-1d50f99144c5';
const OUT = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-035';

(async () => {
  const tok = await L.apiLogin(L.BUYER);
  const browser = await L.newBrowser();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();

  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 25000);
  await L.clickBtn(p, 'Login');
  await L.waitText(p, 'Welcome back', 25000);
  const ei = p.locator('input[type="text"]').first();
  const pi = p.locator('input[type="password"]').first();
  await ei.click({ force: true }); await p.waitForTimeout(300);
  await p.keyboard.type(L.BUYER.email);
  await pi.click({ force: true }); await p.waitForTimeout(300);
  await p.keyboard.type(L.BUYER.pw);
  await L.clickBtn(p, 'Log in');
  let ok = false;
  for (let i = 0; i < 25 && !ok; i++) { ok = await L.isLoggedIn(p); if (!ok) await p.waitForTimeout(1000); }
  console.log('LOGIN', ok);

  await p.goto(APP + '/orders/' + O12, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  let ready = false;
  for (let i = 0; i < 20; i++) { const t = await L.allText(p); if (t.includes('Placed on')) { ready = true; break; } await p.waitForTimeout(900); }
  console.log('DETAIL_READY', ready);

  // open tracking
  let track = null;
  for (let i = 0; i < 10 && !track; i++) {
    const cs = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        if (e.getAttribute('role') !== 'button') return;
        const r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
        out.push({ label: ((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim(), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
      });
      return out;
    });
    track = cs.find(c => /Track delivery/i.test(c.label)) || null;
    if (!track) { await p.mouse.move(190, 350); await p.mouse.wheel(0, 330); await p.waitForTimeout(250); }
  }
  console.log('TRACK_CTL', JSON.stringify(track));
  await p.mouse.click(track.x, track.y);
  await p.waitForTimeout(3000);

  // click Generate new code via coordinates from the live a11y tree
  const gen = await p.evaluate(() => {
    let hit = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (hit) return;
      const txt = (e.textContent || '');
      const lbl = (e.getAttribute('aria-label') || '');
      if (!txt.includes('Generate new code') && !lbl.includes('Generate new code')) return;
      const role = e.getAttribute('role');
      const tap = e.getAttribute('flt-tappable') !== null;
      if (role !== 'button' && !tap) return;
      const r = e.getBoundingClientRect();
      if (r.width < 20) return; // skip full-screen ancestor wrappers
      if (!hit || r.width * r.height < hit.w * hit.h) {
        hit = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: r.width, h: r.height, role, tap };
      }
    });
    return hit;
  });
  console.log('GEN_CTL', JSON.stringify(gen));
  let regenStatus = null, regenUrl = null;
  p.on('response', r => { if (/regenerate/.test(r.url())) { regenStatus = r.status(); regenUrl = r.url().replace(APP, ''); } });
  await p.mouse.click(gen.x, Math.min(gen.y, 660));
  await p.waitForTimeout(4500);
  console.log('REGEN_HTTP', regenStatus, regenUrl || '(no request seen)');

  const after = await p.evaluate(() => {
    const out = { labels: [], texts: [] };
    document.querySelectorAll('[aria-label]').forEach(e => {
      const a = e.getAttribute('aria-label');
      if (/Could not|regenerat|attempt|out for delivery/i.test(a)) out.labels.push(a.slice(0, 200));
    });
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '') + '|' + (e.getAttribute('aria-label') || '');
      if (/Could not|regenerat|attempt|out for delivery/i.test(t)) out.texts.push(t.trim().slice(0, 200));
    });
    return out;
  });
  console.log('AFTER_SIGNALS', JSON.stringify(after).slice(0, 1200));
  const sb = await L.hasSnackBar(p);
  console.log('SNACKBAR_BAND', JSON.stringify(sb));
  console.log('URL_AFTER', p.url());
  await p.screenshot({ path: OUT + '/probe-regen.png' }).catch(e => console.log('SHOT_ERR', String(e).slice(0, 80)));
  console.log('SHOT_SAVED');
  await ctx.close(); await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
