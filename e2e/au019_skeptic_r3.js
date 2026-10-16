// au019_skeptic_r3.js — Appendix B attacks vs frozen :9108. UI-path only:
// home grid scroll -> onscreen-bbox card tap (deep links 404 on this SimpleHTTP lane).
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9108';
const SHOTS = path.resolve(__dirname, 'shots/AU-019');
const R = { attacks: [], broken: [] };
function rec(name, result, detail, extra = {}) {
  R.attacks.push({ attack: name, result, detail, ...extra });
  console.log('ATTACK', JSON.stringify({ attack: name, result, detail }));
  if (result === 'BROKEN' || result === 'DISPUTED') R.broken.push(name + ': ' + detail.slice(0, 200));
}
async function shot(p, name) { const f = `skeptic-${name}.png`; await p.screenshot({ path: `${SHOTS}/${f}`, fullPage: false }).catch(() => {}); return f; }

async function instrument(pg) {
  await pg.addInitScript(() => {
    window.__waOpen = [];
    const orig = window.open;
    window.open = function (u, t, f) { window.__waOpen.push(String(u)); return orig ? orig.call(window, u, t, f) : null; };
    window.__jsErrors = [];
    window.addEventListener('error', e => window.__jsErrors.push(String(e.message || e)));
    window.addEventListener('unhandledrejection', e => window.__jsErrors.push('unhandledrejection:' + ((e.reason && e.reason.message) || String(e.reason))));
  });
}
const waOpens = p => p.evaluate(() => window.__waOpen || []).catch(() => []);
const jsErrors = p => p.evaluate(() => window.__jsErrors || []).catch(() => []);
async function rowInfo(p) {
  return p.evaluate(() => {
    let hit = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = e.textContent || '';
      if (!t.includes('WhatsApp seller')) return;
      const r = e.getBoundingClientRect();
      if (!hit || r.width * r.height < hit.w * hit.h)
        hit = { label: t.trim(), role: e.getAttribute('role'), x: r.x, y: r.y, w: r.width, h: r.height };
    });
    return hit;
  }).catch(() => null);
}
async function waNumbers(p) {
  return p.evaluate(() => {
    const t = [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n');
    const m = t.match(/\+?[0-9][0-9 (),.-]{6,}/g) || [];
    return [...new Set(m.filter(s => s.replace(/\D/g, '').length >= 9))];
  }).catch(() => []);
}
async function detailLoaded(p, frag, timeout = 25000) { return L.waitText(p, frag, timeout); }

// Scroll the home feed until a fragment appears; then poll-click the smallest fully-onscreen node.
async function openCard(p, frag, maxScrolls = 30) {
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 40000);
  await p.waitForTimeout(1500);
  let seen = false;
  for (let i = 0; i < maxScrolls && !seen; i++) { await L.scrollToBottom(p, 3); seen = (await L.allText(p)).includes(frag); }
  if (!seen) return false;
  for (let i = 0; i < 24; i++) {
    const hit = await p.evaluate((l) => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        if (!t.includes(l)) return;
        if (e.getAttribute('flt-tappable') === null && e.getAttribute('role') !== 'button') return;
        const r = e.getBoundingClientRect();
        if (r.width < 30 || r.height < 15) return;
        if (!(r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth)) return;
        if (!best || r.width * r.height < best.w * best.h)
          best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), w: r.width, h: r.height };
      });
      return best;
    }, frag);
    if (hit) { await p.mouse.click(Math.max(8, Math.min(hit.cx, 760)), Math.max(8, Math.min(hit.cy, 1015))); await p.waitForTimeout(2600); return true; }
    await p.mouse.move(180, 380); await p.mouse.wheel(0, 170); await p.waitForTimeout(320);
  }
  return false;
}

async function safeLogin(page) {
  await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(page, 'Buy now', 40000);
  let ok = false;
  try { ok = await L.isLoggedIn(page); } catch (_) {}
  if (!ok) {
    await L.clickBtn(page, 'Login'); await L.waitText(page, 'Welcome back', 25000);
    const ei = page.locator('input[type="text"]').first(); const pi = page.locator('input[type="password"]').first();
    await ei.click({ force: true }).catch(() => {}); await page.waitForTimeout(400);
    await page.keyboard.type(L.BUYER.email, { delay: 25 });
    await pi.click({ force: true }).catch(() => {}); await page.waitForTimeout(400);
    await page.keyboard.type(L.BUYER.pw, { delay: 25 });
    await L.clickBtn(page, 'Log in');
    for (let i = 0; i < 30 && !ok; i++) { try { ok = await L.isLoggedIn(page); } catch (_) {} if (!ok) await page.waitForTimeout(1000); }
  }
  return ok;
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await L.newBrowser();

  // ===== STAGE 1 @375x667 (video) =====
  const ctx1 = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-019-skeptic-r3-375.webm' });
  const p = await ctx1.newPage();
  await instrument(p);

  rec('S0-login', (await safeLogin(p)) ? 'ok' : 'BROKEN', 'token-poll login on :9108');

  // S1 positive repro via real user path
  {
    const ok = await openCard(p, 'Fixture WhatsApp Contact');
    const shown = await detailLoaded(p, 'WhatsApp seller · +255712000111', 25000);
    const ri = await rowInfo(p);
    rec('S1-row-repro-ui-path', ok && ri && ri.label.includes('+255712000111') ? 'ok' : 'BROKEN',
        `cardOpened=${ok} rowRendered=${shown} row=${JSON.stringify(ri)}`);
    await shot(p, 'r3-s1-row627-375');
  }

  // A1 rapid quadruple-tap
  {
    const ri = await rowInfo(p);
    for (let i = 0; i < 4; i++) await p.mouse.click(Math.max(8, Math.min(ri.x + ri.w / 2, 368)), Math.max(8, Math.min(ri.y + ri.h / 2, 655)));
    await p.waitForTimeout(1800);
    const opens = await waOpens(p);
    const errs = await jsErrors(p);
    const stillThere = !!(await rowInfo(p));
    rec('A1-quadruple-tap', errs.length ? 'BROKEN' : (opens.length > 4 ? 'DISPUTED' : 'ok'),
        `4 rapid clicks -> ${opens.length} window.open calls ${JSON.stringify(opens)}; row still present=${stillThere}; jsErrors=${errs.length}`,
        { opens });
    await shot(p, 'r3-a1-multitap-375');
    for (const pg of ctx1.pages()) if (pg !== p) await pg.close().catch(() => {});
  }

  // A2 cross-entity staleness: from open 627, back out to home, then open empty 628 — row must NOT leak.
  // 628 is not in the home grid, so reach it through the app's own Search tab list (page-0 window).
  async function gotoSearchTabAndOpen(frag) {
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 30000);
    await p.waitForTimeout(1200);
    await L.clickBtn(p, 'Search');
    await p.waitForTimeout(2200);
    let seen = false;
    for (let i = 0; i < 20 && !seen; i++) { await L.scrollToBottom(p, 3); seen = (await L.allText(p)).includes(frag); }
    if (!seen) return false;
    for (let i = 0; i < 24; i++) {
      const hit = await p.evaluate((l) => {
        let best = null;
        document.querySelectorAll('flt-semantics').forEach(e => {
          const t = (e.textContent || '').trim();
          if (!t.includes(l)) return;
          if (e.getAttribute('flt-tappable') === null && e.getAttribute('role') !== 'button') return;
          const r = e.getBoundingClientRect();
          if (r.width < 30 || r.height < 15) return;
          if (!(r.top >= 0 && r.bottom <= innerHeight)) return;
          if (!best || r.width * r.height < best.w * best.h)
            best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
        });
        return best;
      }, frag);
      if (hit) { await p.mouse.click(hit.cx, Math.max(8, Math.min(hit.cy, 655))); await p.waitForTimeout(2400); return true; }
      await p.mouse.move(180, 380); await p.mouse.wheel(0, 170); await p.waitForTimeout(300);
    }
    return false;
  }

  {
    // currently on 627 detail; use in-app Back button (out-of-order mid-flow exit)
    const backOk = await L.clickBtn(p, 'Back');
    await p.waitForTimeout(1500);
    rec('A2-backout-from-detail', backOk || true, `in-app Back from 627 clicked=${backOk}; continuing to negative entity`);

    const ok628 = await gotoSearchTabAndOpen('B2 Hidden Guard Fixture');
    const loaded628 = await L.waitText(p, 'Description|Add to cart|Quantity', 25000);
    await L.scrollToBottom(p, 18);
    const leaked = await rowInfo(p);
    const nums = await waNumbers(p);
    const bad255 = nums.filter(s => s.includes('255'));
    rec('A2-cross-entity-627-to-628', (leaked || bad255.length) ? 'BROKEN' : 'ok',
        `627->Back->home->Search->open 628 (cardOpened=${ok628}, detailLoaded=${!!loaded628}): rowLeaked=${!!leaked} phoneLike=${JSON.stringify(nums)} foreign255=${bad255.length}`);
    await shot(p, 'r3-a2-on628-after-627-375');

    // A2b reverse order: 628 -> home -> reopen 627 (negative-cache probe)
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 30000);
    const ok627 = await openCard(p, 'Fixture WhatsApp Contact');
    const ri2 = await detailLoaded(p, 'WhatsApp seller', 25000) ? await rowInfo(p) : null;
    rec('A2b-negative-cache-reverse', ok627 && ri2 ? 'ok' : 'BROKEN',
        `after empty 628 visit, reopened 627 via grid: cardOpened=${ok627} row=${JSON.stringify(ri2)}`);
  }

  // A3 hostile route ids pushed into the live SPA history (stale-tab simulation)
  for (const [tag, id] of [['nonexistent', '99999'], ['huge', '99999999999999999999'], ['nan', 'abc'], ['negative', '-1'], ['zero', '0']]) {
    try {
      await p.evaluate((pid) => { history.pushState({}, '', '/product/' + pid); window.dispatchEvent(new PopStateEvent('popstate')); }, id);
      await p.waitForTimeout(3500);
      const rows = await rowInfo(p);
      const nums = await waNumbers(p);
      const errs = await jsErrors(p);
      const txt = await L.allText(p);
      const blank = txt.trim().length < 60;
      const bad255 = nums.filter(s => s.includes('255'));
      rec(`A3-route-${tag}`, (blank || rows || bad255.length || errs.length) ? 'BROKEN' : 'ok',
          `history.pushState /product/${tag}: rowLeaked=${!!rows} stray255=${bad255.length} blankScreen=${blank} jsErrors=${errs.length} url=${p.url()}`);
      await shot(p, `r3-a3-${tag}-375`);
    } catch (e) { rec(`A3-route-${tag}`, 'BLOCKED', `harness: ${String(e).slice(0, 100)}`); }
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 30000);
  }

  // A5 hostile query / emoji / Swahili payloads
  {
    await p.goto(APP + '/?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E&jina=Habari%20mgeni%20%F0%9F%9A%80&siri=<img src=x onerror=alert(2)>', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 30000);
    await p.waitForTimeout(1500);
    const txt = await L.allText(p);
    const injected = txt.includes('<script>') || txt.includes('<img src=x');
    const okOpen = await openCard(p, 'Fixture WhatsApp Contact');
    const ri = (await detailLoaded(p, 'WhatsApp seller', 25000)) ? await rowInfo(p) : null;
    rec('A5-hostile-query', injected ? 'BROKEN' : (ri ? 'ok' : 'BROKEN'),
        `payloads reflected=${injected}; after hostile query string, 627 opened=${okOpen} row=${ri ? ri.label : 'MISSING'} jsErrors=${(await jsErrors(p)).length}`);
  }

  // A4 offline mid-request + retry
  {
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 30000);
    await ctx1.setOffline(true);
    // attempt to open an entity never visited this session while offline
    const okOpen = await gotoSearchTabAndOpen('AU021 Carved Bowl');
    await p.waitForTimeout(4000);
    const offTxt = await L.allText(p);
    const offBlank = offTxt.trim().length < 60;
    const offErrs = await jsErrors(p);
    await shot(p, 'r3-a4-offline-375');
    await ctx1.setOffline(false);
    await p.reload({ waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(4000);
    const recoveredTxt = await L.allText(p);
    const recovered = recoveredTxt.includes('Buy now') || recoveredTxt.includes('Add to cart');
    rec('A4-offline-midrequest-retry', offBlank ? 'BROKEN' : (recovered ? 'ok' : 'BROKEN'),
        `offline: cardOpened=${okOpen} blankScreen=${offBlank} jsErrors=${offErrs.length}; reconnect+reload recovered=${recovered}`);
  }

  // A8 corrupted session token mid-flow (public listing must be unaffected)
  {
    try { await p.evaluate(() => localStorage.setItem('flutter.auth_token', 'GARBAGE.TOKEN.VALUE')); } catch (_) {}
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 30000);
    const okOpen = await openCard(p, 'Fixture WhatsApp Contact');
    const ri = (await detailLoaded(p, 'WhatsApp seller', 25000)) ? await rowInfo(p) : null;
    rec('A8-corrupt-token-public-detail', ri ? 'ok' : 'BROKEN',
        `corrupt bearer while browsing public listing: cardOpened=${okOpen} row=${ri ? ri.label : 'MISSING'} jsErrors=${(await jsErrors(p)).length}`);
  }

  // A6 locale/format edge: leading-zero number "+255 0774597108" (entity 598)
  {
    const okOpen = await gotoSearchTabAndOpen('Multi-Function Vehicle Inverter');
    const hasRow = await L.waitText(p, 'WhatsApp seller', 25000);
    const ri = hasRow ? await rowInfo(p) : null;
    if (!ri) {
      rec('A6-leading-zero-e598', 'BLOCKED',
          `entity 598 "${'Multi-Function Vehicle Inverter'}" reachable=${okOpen} but no WhatsApp row rendered (searchTabPath)`);
    } else {
      await p.mouse.click(Math.max(8, Math.min(ri.x + ri.w / 2, 368)), Math.max(8, Math.min(ri.y + ri.h / 2, 655)));
      await p.waitForTimeout(1600);
      const opens = await waOpens(p);
      const labelDigits = (ri.label.match(/\d/g) || []).join('');
      const urlNum = opens.length && opens[0].includes('wa.me/') ? opens[0].split('wa.me/')[1].split(/[?&]/)[0] : null;
      rec('A6-leading-zero-e598', urlNum && urlNum !== labelDigits ? 'DISPUTED' : 'ok',
          `entity 598 stores "+255 0774597108": label="${ri.label}" labelDigits=${labelDigits} wa.meNum=${urlNum} (${urlNum === labelDigits ? 'match' : 'MISMATCH'})`,
          { opens });
      await shot(p, 'r3-a6-e598-375');
      for (const pg of ctx1.pages()) if (pg !== p) await pg.close().catch(() => {});
    }
  }

  // A7 anonymous visitor (fresh context, zero auth)
  {
    const ctxAnon = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
    const pa = await ctxAnon.newPage(); await instrument(pa);
    const okOpen = await openCard(pa, 'Fixture WhatsApp Contact');
    const ri = (await L.waitText(pa, 'WhatsApp seller', 25000)) ? await rowInfo(pa) : null;
    const forcedLogin = (await L.allText(pa)).includes('Welcome back');
    let opensAnon = [];
    if (ri) {
      await pa.mouse.click(Math.max(8, Math.min(ri.x + ri.w / 2, 368)), Math.max(8, Math.min(ri.y + ri.h / 2, 655)));
      await pa.waitForTimeout(1400); opensAnon = await waOpens(pa);
    }
    await shot(pa, 'r3-a7-anon-627-375');
    rec('A7-anonymous-visitor', (ri && !forcedLogin) ? 'ok' : 'BROKEN',
        `anon visitor (no login): cardOpened=${okOpen} row=${ri ? ri.label : 'MISSING'} forcedToLogin=${forcedLogin} waOpens=${opensAnon.length} (${JSON.stringify(opensAnon)})`);
    await ctxAnon.close();
  }

  await L.closeVideo(ctx1, 'e2e/videos/AU-019-skeptic-r3-375.webm');

  // ===== STAGE 2 @768x1024 (video) =====
  const ctx2 = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: 'e2e/videos/AU-019-skeptic-r3-768.webm' });
  const q = await ctx2.newPage(); await instrument(q);
  {
    await q.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(q, 'Buy now', 40000);
    const lg = await safeLogin(q);
    const okOpen = await openCard(q, 'Fixture WhatsApp Contact');
    const ri = (await L.waitText(q, 'WhatsApp seller', 25000)) ? await rowInfo(q) : null;
    await shot(q, 'r3-s2-row627-768');
    let opens = [];
    if (ri) {
      await q.mouse.click(ri.x + ri.w / 2, ri.y + ri.h / 2);
      await q.waitForTimeout(1600); opens = await waOpens(q);
      for (const pg of ctx2.pages()) if (pg !== q) await pg.close().catch(() => {});
    }
    rec('S2-tablet-tap-launch', opens.length >= 1 ? 'ok' : 'DISPUTED',
        `@768 login=${lg} cardOpened=${okOpen} row=${ri ? ri.label : 'MISSING'} tap->opens=${JSON.stringify(opens)}`);
    const nums = await waNumbers(q);
    const foreign = nums.filter(s => s.includes('255') && !s.includes('712000111'));
    rec('S2-tablet-stray-numbers', foreign.length ? 'DISPUTED' : 'ok',
        `@768 phone-like strings on 627: ${JSON.stringify(nums)} foreign255=${JSON.stringify(foreign)}`);
  }
  await L.closeVideo(ctx2, 'e2e/videos/AU-019-skeptic-r3-768.webm');
  await browser.close();

  fs.writeFileSync(path.resolve(__dirname, 'results/shards/raw-AU-019-skeptic-r3.json'),
    JSON.stringify({ attacks_attempted: R.attacks.length, attacks_broken: R.broken.length, attacks: R.attacks }, null, 1));
  console.log('SUMMARY', JSON.stringify({ attempted: R.attacks.length, brokenOrDisputed: R.broken.length }));
  console.log('ELAPSED_MS', Date.now() - t0);
})().catch(e => { console.error('FATAL', String(e).slice(0, 500)); process.exit(2); });
