// AU-014 qty_stepper_stock_cap r3 — RO lane http://localhost:9108
// Frozen 7b4342f bundle (Last-Modified "Mon, 24 Aug 2026 03:13:31 GMT", the rebuilt
// pristine copy of HEAD 7b4342f per VERIFY_RECIPE frozen-lane note; content gate below).
// Judge: Next.js :3000. Backend: sandbox :8083. NO login, NO writes (RO lane).
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9108';
const REF = 'http://localhost:3000';
const API = 'http://localhost:8083';
const UNIT = 'AU-014';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const SHOTS = `${ROOT}/e2e/shots/AU-014`;
const VDIR = `${ROOT}/e2e/videos`;
const TAG = 'r3b';
fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(VDIR, { recursive: true });

const EXPECT_LM = 'Mon, 24 Aug 2026 03:13:31 GMT'; // served pristine 7b4342f rebuild
const BUILD_SHA = 'ca376f1';

const P619 = { id: 619, name: 'Crochet baby dress', qty: 4, sold: 0 };
const P629 = { id: 629, name: 'B2 Hidden Guard Fixture 2', qty: 2, sold: 0 };
const P615 = { id: 615, name: 'LANCÔME PARIS La vie est belle', qty: 4, sold: 3 };

let R = {
  ts: new Date().toISOString(), unit: UNIT,
  title: 'qty_stepper_stock_cap_r3', wave: 'verify',
  agent: 'verifier-AU-014-r3b', build_sha: BUILD_SHA, build_mtime: null,
  viewport: '375x667+768x1024', verdict: 'FAIL',
  checks: {
    real_data: false,
    real_data_probe: '',
    images_requested: 0, images_200: 0, images_broken: [],
    buttons_total: 0, buttons_ok: 0, buttons_failed: [],
    state_asserts: 0, nav_asserts: 0, data_asserts: 0,
    vision_defects: null, vision_findings: [], vision_evidence: [],
    parity: { blocker: 0, major: 0, minor: 0, accepted: 0 },
  },
  attempts: 1, failures: [], evidence: [], runtime_ms: 0,
  notes: [],
};
const fail = m => { if (!R.failures.includes(m)) R.failures.push(m); console.log('FAIL:', m); };
const ok = () => { R.checks.state_asserts++; };
const ev = f => { const rel = f.startsWith('/') ? f.slice(ROOT.length + 1) : f; if (!R.evidence.includes(rel)) R.evidence.push(rel); };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const txtOf = p => L.allText(p);
const qtyVals = t => t.split('\n').map(s => s.trim()).filter(s => /^\d{1,4}$/.test(s)).map(Number);

function toastText(t) {
  const m = t.match(/Only \d+ units? (?:are|is) available for this item\.?/);
  return m ? m[0] : null;
}

async function stepperButtons(p) {
  return p.evaluate(() => {
    let qtyNode = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (qtyNode) return;
      const t = (e.textContent || '').trim();
      if (/^\d{1,4}$/.test(t)) {
        const r = e.getBoundingClientRect();
        if (r.width > 0 && r.width < 120 && r.height > 0 && !e.getAttribute('role')) qtyNode = { cy: r.y + r.height / 2 };
      }
    });
    if (!qtyNode) return null;
    const row = [];
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (Math.abs(r.y + r.height / 2 - qtyNode.cy) > Math.max(24, 30)) return;
      row.push({ x: r.x, cx: r.x + r.width / 2, cy: r.y + r.height / 2, label: (e.textContent || '').trim() });
    });
    row.sort((a, b) => a.x - b.x);
    const unlabeled = row.filter(b => !b.label);
    if (unlabeled.length >= 2) return { minus: unlabeled[0], plus: unlabeled[unlabeled.length - 1] };
    if (row.length >= 2) return { minus: row[row.length - 3] || null, plus: row[row.length - 2] || null };
    return null;
  });
}
function watchDetail(p) {
  p.on('request', rq => { if (/itemDetails\/\d+/.test(rq.url())) { R.checks.nav_asserts++; } });
}

async function openRelatedOnDetail(p, bandLabel, cardText, vh) {
  for (let i = 0; i < 12; i++) { if ((await txtOf(p)).includes(bandLabel)) break; await p.mouse.move(190, 400); await p.mouse.wheel(0, 420); await sleep(450); }
  let y = null;
  for (let i = 0; i < 12 && y === null; i++) {
    y = await p.evaluate((lbl) => {
      let yy = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if ((e.textContent || '').trim() === lbl && yy === null) yy = e.getBoundingClientRect().y;
      });
      return yy;
    }, bandLabel);
    if (y === null) { await p.mouse.move(190, 400); await p.mouse.wheel(0, 420); await sleep(450); }
  }
  if (y === null) return { ok: false, why: bandLabel + ' label not found' };
  if (y > vh - 200 || y < 0) {
    await p.mouse.move(190, 400); await p.mouse.wheel(0, Math.min(y - 220, 900)); await sleep(600);
    y = await p.evaluate((lbl) => { let yy = null; document.querySelectorAll('flt-semantics').forEach(e => { if ((e.textContent || '').trim() === lbl && yy === null) yy = e.getBoundingClientRect().y; }); return yy; }, bandLabel);
  }
  if (y === null) return { ok: false, why: bandLabel + ' not positioned' };
  for (let i = 0; i < 7; i++) {
    const c = await p.evaluate(({ lbl, bandY }) => {
      const out = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        const txt = (e.textContent || '').trim();
        if (!txt.includes(lbl)) return;
        if (e.getAttribute('flt-tappable') === null) return;
        const r = e.getBoundingClientRect();
        if (r.width < 40 || r.height < 40) return;
        if (r.bottom < 0 || r.top > 4000 || Math.abs(r.y - bandY) > 340) return;
        out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height });
      });
      out.sort((a, b) => a.area - b.area);
      return out[0] || null;
    }, { lbl: cardText, bandY: y });
    if (c) { await p.mouse.click(c.cx, c.cy); await sleep(4500); break; }
    await p.mouse.move(190, y + 80); await p.mouse.wheel(0, 260); await sleep(480);
  }
  if (!/add to cart/i.test(await txtOf(p))) return { ok: false, why: cardText + ' detail not reached' };
  R.checks.nav_asserts++;
  return { ok: true };
}

async function openSearch(p, vw) {
  const hit = await p.evaluate(() => {
    const cands = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return;
      cands.push({ x: r.x, y: r.y, w: r.width });
    });
    const h = cands.filter(c => c.y < 140 && c.w < 70 && c.x > innerWidth * 0.5).sort((a, b) => b.x - a.x)[0];
    return h ? Math.round(h.x + h.w / 2) : null;
  });
  if (hit === null) return false;
  await p.mouse.click(Math.min(hit, vw - 10), 40);
  await sleep(2600);
  const st = await txtOf(p);
  return /Search|No results|Sort|Category/i.test(st);
}

function checkAvail(tag, t, P) {
  const flat = t.replace(/\n/g, ' ');
  const availOk = new RegExp(`\\b${P.qty}\\s*available\\b`).test(flat);
  const combined = new RegExp(`\\b${P.qty}\\s*available\\s*·\\s*${P.sold}\\s*sold\\b`).test(flat);
  const wrongQty = new RegExp(`\\b(${P.qty + 1}|${P.qty + 2}|${P.qty - 1})\\s+available\\b`).test(flat);
  console.log(`[${tag}] "${P.qty} available"=${availOk} combined=${combined} wrongQty=${wrongQty}`);
  if (!availOk) fail(`${tag}: availability line "${P.qty} available" ABSENT`); else ok();
  if (wrongQty) fail(`${tag}: wrong availability number rendered`); else ok();
  if (P.sold > 0) { if (!combined) fail(`${tag}: combined "${P.qty} available · ${P.sold} sold" missing`); else ok(); }
  else if (/\d\s*available\s*·\s*\d+\s*sold/.test(flat)) fail(`${tag}: shows "· N sold" though soldQuantity=0`); else ok();
  R.checks.data_asserts += 3;
}

(async () => {
  const t0 = Date.now();
  // ---------- (1) FRESHNESS ----------
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = head.headers.get('last-modified') || '';
  const body = await (await fetch(APP + '/main.dart.js')).text();
  R.build_mtime = new Date(Date.parse(lm)).toISOString();
  const art = {
    detail_readout_template: body.includes('" available"+') && body.includes('" sold":'),
    cart_line_cap_readout: body.includes('" available",'),
    overcap_toast_add: body.includes('available for this item'),
    own_item_guard: body.includes('You cannot add your own listed items'),
    added_to_cart: body.includes('Added to cart'),
    rental_gate: body.includes('Select your rental dates to continue.'),
  };
  const fresh = head.status === 200 && lm === EXPECT_LM && Object.values(art).every(Boolean);
  console.log('[fresh]', head.status, lm, JSON.stringify(art));
  if (!fresh) {
    R.verdict = 'BLOCKED';
    R.failures.push(`freshness/content gate failed: HTTP ${head.status} LM=${lm} artifacts=${JSON.stringify(art)} (expected ${EXPECT_LM})`);
    write(); process.exit(3);
  }
  ok();

  // ---------- (2) REAL DATA PROBE ----------
  const probeLines = [];
  let probeOk = true;
  for (const P of [P619, P629, P615]) {
    try {
      const d = await (await fetch(`${API}/api/v1/displayItem/itemDetails/${P.id}`)).json();
      const q = d.productQuantity | 0, s = d.soldQuantity | 0;
      probeLines.push(`${P.id}{qty=${q},sold=${s}}`);
      if (q !== P.qty || s !== P.sold) { probeOk = false; fail(`entity ${P.id} drifted: qty=${q} sold=${s}`); }
    } catch (e) { probeOk = false; fail(`probe ${P.id}: ${e.message}`); }
  }
  R.checks.real_data_probe = `curl :8083/api/v1/displayItem/itemDetails -> ${probeLines.join(', ')}; re-asserted in-band pre-run`;
  if (!probeOk) { R.verdict = 'BLOCKED'; write(); process.exit(3); }
  R.checks.real_data = true; ok();

  const browser = await L.newBrowser();

  for (const VP of [{ w: 375, h: 667, n: '375' }, { w: 768, h: 1024, n: '768' }]) {
    const vpath = `${VDIR}/${UNIT}-${TAG}-${VP.n}.webm`;
    const ctx = await L.newCtx(browser, { viewport: { width: VP.w, height: VP.h }, videoPath: vpath });
    const p = await ctx.newPage();
    const imgs = L.watchImages(p);
    watchDetail(p);
    const shot = async name => { const f = `${SHOTS}/${TAG}-${VP.n}-${name}.png`; await L.screenshot(p, f); ev(f); return f; };

    // ===== 619 via home SEARCH (proven path; rail card absent from current feed) =====
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    if (!(await L.waitText(p, 'Buy now', 60000))) fail(`${VP.n}: home shell never rendered`);
    const opened1 = await openSearch(p, VP.w);
    if (!opened1) fail(`${VP.n}: search did not open (619 entry)`);
    else {
      R.checks.nav_asserts++;
      const inp1 = p.locator('input[type="text"]').first();
      await inp1.click({ force: true }); await sleep(350);
      await p.keyboard.type('Crochet'); await p.keyboard.press('Enter'); await sleep(3500);
      if (!(await L.clickCard(p, 'Crochet baby dress'))) fail(`${VP.n}: 619 result card tap failed`);
      await sleep(5000);
    }
    let t = await txtOf(p);
    if (!/add to cart/i.test(t)) fail(`${VP.n}: 619 detail not reached via search`); else ok();
    await shot('619-loaded');
    if (!t.includes(P619.name)) fail(`${VP.n}: 619 title absent`); else ok();
    checkAvail(`${VP.n}/619`, t, P619);
    let ctrls = await L.listButtons(p);
    R.checks.buttons_total += ctrls.length;
    console.log(`[${VP.n}] controls on 619 (${ctrls.length})`);

    // ===== stepper cap on 619 =====
    let sb = await stepperButtons(p);
    if (!sb || !sb.plus) fail(`${VP.n}: stepper not located on 619`);
    else {
      let clicks = 0, maxSeen = 1;
      for (let i = 0; i < 15; i++) {
        sb = await stepperButtons(p);
        if (!sb || !sb.plus) break;
        await p.mouse.click(sb.plus.cx, sb.plus.cy);
        clicks++; await sleep(430);
        const vals = qtyVals(await txtOf(p)).filter(v => v <= 99);
        if (vals.length) maxSeen = Math.max(maxSeen, ...vals.filter(v => v !== P619.qty));
      }
      await shot('619-stepper-cap');
      console.log(`[${VP.n}] 619 cap: +x${clicks} max=${maxSeen}`);
      if (maxSeen > P619.qty) fail(`${VP.n}: 619 exceeded stock (${maxSeen}>${P619.qty})`); else ok();
      // plus at cap must be a no-op
      sb = await stepperButtons(p);
      if (!sb || !sb.plus) { ok(); R.notes.push(`${VP.n}: plus node not present at cap (disabled/removed)`); }
      else {
        await p.mouse.click(sb.plus.cx, sb.plus.cy); await sleep(520);
        const cur = Math.max(...qtyVals(await txtOf(p)).filter(v => v <= 99), 0);
        if (cur !== maxSeen) fail(`${VP.n}: + tap at cap CHANGED qty ${maxSeen}->${cur}`); else ok();
        // minus decrements from cap
        let minusOk = false;
        sb = await stepperButtons(p);
        if (sb && sb.minus) {
          await p.mouse.click(sb.minus.cx, sb.minus.cy); await sleep(460);
          minusOk = Math.max(...qtyVals(await txtOf(p)).filter(v => v <= 99), 0) === maxSeen - 1;
        }
        if (minusOk) ok(); else fail(`${VP.n}: minus did not decrement from cap`);
      }
    }

    // ===== deterministic pass 2: fresh detail, step to cap, add AT cap, then over-cap merge add =====
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 60000);
    const opened2 = await openSearch(p, VP.w);
    if (!opened2) fail(`${VP.n}: search did not open (pass-2)`);
    else {
      const inp2 = p.locator('input[type="text"]').first();
      await inp2.click({ force: true }); await sleep(350);
      await p.keyboard.type('Crochet'); await p.keyboard.press('Enter'); await sleep(3500);
      await L.clickCard(p, 'Crochet baby dress'); await sleep(5000);
    }
    if (!/add to cart/i.test(await txtOf(p))) fail(`${VP.n}: 619 detail pass-2 not reached`); else { R.checks.nav_asserts++; }
    let reachedCap = false, capVal = 0;
    for (let i = 0; i < 12; i++) {
      sb = await stepperButtons(p);
      if (!sb || !sb.plus) break;
      await p.mouse.click(sb.plus.cx, sb.plus.cy); await sleep(420);
      capVal = Math.max(...qtyVals(await txtOf(p)).filter(v => v <= 99), 0);
      if (capVal >= P619.qty) { reachedCap = true; break; }
    }
    if (!reachedCap) fail(`${VP.n}: could not reach cap on 619 pass-2`);
    await shot('619-at-cap');
    const add1 = await L.clickBtn(p, 'Add to cart'); await sleep(1600);
    t = await txtOf(p);
    await shot('619-addtocart-cap');
    const rejAtCap = toastText(t);
    if (!add1) R.checks.buttons_failed.push(`${VP.n}:Add to cart@cap(click)`); else R.checks.buttons_ok++;
    if (rejAtCap) fail(`${VP.n}: add AT cap rejected ("${rejAtCap}") — reference accepts qty==stock`);
    else if (/Added to cart/.test(t)) ok(); else fail(`${VP.n}: no 'Added to cart' confirmation at cap`);
    const badge = t.match(/Cart\s*\n?\s*(\d+)/);
    if (!(badge && parseInt(badge[1], 10) === P619.qty)) fail(`${VP.n}: cart badge expected ${P619.qty}, saw "${badge ? badge[1] : null}"`); else ok();

    // over-cap ADD: line already holds qty==stock(4); re-add 4 -> merge request 8 > stock 4.
    const add2 = await L.clickBtn(p, 'Add to cart'); await sleep(1500);
    t = await txtOf(p);
    await shot('619-overcap-add-toast');
    const rejToast = toastText(t);
    console.log(`[${VP.n}] over-cap merge add: clicked=${add2} toast="${rejToast}"`);
    if (!add2) R.checks.buttons_failed.push(`${VP.n}:Add to cart@overcap(click)`); else R.checks.buttons_ok++;
    if (!rejToast) fail(`${VP.n}: over-cap ADD produced no "Only N units are available" rejection toast`);
    else { ok(); R.notes.push(`${VP.n}: over-cap ADD (merge 4+4>stock 4) rejected with toast "${rejToast}"`); }
    const badge2 = t.match(/Cart\s*\n?\s*(\d+)/);
    if (!(badge2 && parseInt(badge2[1], 10) === P619.qty)) fail(`${VP.n}: over-cap add changed cart badge to ${badge2 ? badge2[1] : '?'}`); else ok();
    // clear the cart so later entities start clean (client-side only)
    await p.evaluate(() => { Object.keys(localStorage).filter(k => /expatCartItems/.test(k)).forEach(k => localStorage.removeItem(k)); });

    // ===== 629 via You Might Also Like rail =====
    const nav2 = await openRelatedOnDetail(p, 'You Might Also Like', P629.name, VP.h);
    if (!nav2.ok) { fail(`${VP.n}: reach 629 failed: ${nav2.why}`); await shot('629-nav-failed'); }
    else {
      await sleep(900);
      t = await txtOf(p);
      await shot('629-loaded');
      if (!t.includes(P629.name)) fail(`${VP.n}: 629 title absent`); else ok();
      checkAvail(`${VP.n}/629`, t, P629);
      let c2 = 0, max2 = 1;
      for (let i = 0; i < 10; i++) {
        const s2 = await stepperButtons(p);
        if (!s2 || !s2.plus) break;
        await p.mouse.click(s2.plus.cx, s2.plus.cy); c2++; await sleep(420);
        const vals = qtyVals(await txtOf(p)).filter(v => v <= 99);
        if (vals.length) max2 = Math.max(max2, ...vals);
      }
      await shot('629-stepper-cap');
      console.log(`[${VP.n}] 629 cap: +x${c2} max=${max2}`);
      if (max2 > P629.qty) fail(`${VP.n}: 629 exceeded stock (${max2}>${P629.qty})`); else ok();
    }

    // ===== 615 via search =====
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 60000);
    const opened = await openSearch(p, VP.w);
    if (!opened) fail(`${VP.n}: search screen did not open`);
    else {
      R.checks.nav_asserts++;
      const inp = p.locator('input[type="text"]').first();
      await inp.click({ force: true }); await sleep(350);
      await p.keyboard.type('La vie'); await p.keyboard.press('Enter'); await sleep(3500);
      let st = await txtOf(p);
      if (!st.includes('LANC')) {
        await inp.click({ force: true });
        await p.keyboard.press('Control+a'); await sleep(200);
        await p.keyboard.type('LANC'); await p.keyboard.press('Enter'); await sleep(3500);
        st = await txtOf(p);
      }
      if (!st.includes('LANC')) fail(`${VP.n}: 615 not found in search results`);
      else if (!(await L.clickCard(p, 'LANC'))) fail(`${VP.n}: 615 card tap failed`);
      await sleep(5000);
      t = await txtOf(p);
      await shot('615-loaded');
      if (!t.includes(P615.name)) fail(`${VP.n}: 615 title absent`);
      else { ok(); R.checks.nav_asserts++; }
      checkAvail(`${VP.n}/615`, t, P615);
      let c3 = 0, max3 = 1;
      for (let i = 0; i < 10; i++) {
        const s3 = await stepperButtons(p);
        if (!s3 || !s3.plus) break;
        await p.mouse.click(s3.plus.cx, s3.plus.cy); c3++; await sleep(420);
        const vals = qtyVals(await txtOf(p)).filter(v => v <= 99);
        if (vals.length) max3 = Math.max(max3, ...vals);
      }
      await shot('615-stepper-cap');
      console.log(`[${VP.n}] 615 cap: +x${c3} max=${max3}`);
      if (max3 > P615.qty) fail(`${VP.n}: 615 exceeded stock (${max3}>${P615.qty})`); else ok();
    }

    // images reconcile
    const sum = L.imageSummary(imgs);
    R.checks.images_requested += sum.total; R.checks.images_200 += sum.ok;
    for (const [u, s] of Object.entries(imgs)) if (s !== 200 && s !== 304) R.checks.images_broken.push(u);
    if (sum.failed > 0) fail(`${VP.n}: ${sum.failed} image requests failed`);
    console.log(`[${VP.n}] images ${sum.ok}/${sum.total}`);

    await L.closeVideo(ctx, vpath); ev(vpath);
  }

  // ---------- PARITY vs judge :3000 ----------
  for (const vp of [{ w: 375, h: 667, n: '375' }, { w: 768, h: 1024, n: '768' }]) {
    for (const P of [{ id: 485, name: 'Tecno spark 50', qty: 5, sold: 0 }]) {
      const rc = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const pp = await rc.newPage();
      await pp.goto(`${REF}/product/${P.id}`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
      await pp.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});
      await pp.waitForTimeout(3500);
      const rt = await pp.evaluate(() => document.body.innerText);
      const f1 = `${SHOTS}/ref-${TAG}-${vp.n}-${P.id}.png`; await pp.screenshot({ path: f1 }).catch(()=>{}); ev(f1);
      const refAvail = new RegExp(`\\b${P.qty}\\s*available\\b`).test(rt);
      const refSold = P.sold > 0 ? new RegExp(`\\b${P.sold}\\s*sold\\b`).test(rt) : true;
      const refTitle = rt.toUpperCase().includes(P.name.toUpperCase().slice(0, 12));
      const notFound = /not found/i.test(rt);
      let refMax = 1, refDisabled = false;
      for (let i = 0; i < 25; i++) {
        const st = await pp.evaluate(() => {
          const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '') === 'Increase quantity');
          return b ? { disabled: b.disabled } : { none: true };
        });
        if (st.none || st.disabled) { refDisabled = !!st.disabled; break; }
        await pp.evaluate(() => { [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') === 'Increase quantity')).click(); });
        await pp.waitForTimeout(170);
        const cur = await pp.evaluate(() => {
          const inp = document.querySelector('input[aria-label="Quantity"]');
          return inp ? parseInt(inp.value, 10) : NaN;
        });
        if (!Number.isFinite(cur)) break;
        refMax = cur;
      }
      const f2 = `${SHOTS}/ref-${TAG}-${vp.n}-${P.id}-after-plus.png`; await pp.screenshot({ path: f2 }).catch(()=>{}); ev(f2);
      console.log(`[ref ${vp.n} ${P.id}] title=${refTitle} avail=${refAvail} sold=${refSold} notFound=${notFound} refMax=${refMax}/${P.qty} disabled=${refDisabled}`);
      if (notFound || !refTitle) { R.checks.parity.blocker++; fail(`parity ${vp.n}/${P.id}: judge missing entity (notFound=${notFound}, title=${refTitle})`); }
      else {
        if (!refAvail) R.checks.parity.major++;
        if (P.sold > 0 && !refSold) R.checks.parity.major++;
        if (refMax > P.qty) R.checks.parity.major++;
        if (refAvail && refMax <= P.qty && (!P.sold || refSold)) ok();
        R.checks.parity.minor += 1; // D-minor: web has editable numeric input; Flutter +/- only
      }
      await rc.close();
    }
  }

  await browser.close();
  R.runtime_ms = Date.now() - t0;
  fs.mkdirSync(`${ROOT}/e2e/tmp`, { recursive: true });
  fs.writeFileSync(`${ROOT}/e2e/tmp/AU-014-r3b-state.json`, JSON.stringify(R, null, 1));
  write();
  console.log('DONE verdict=', R.verdict, 'failures=', JSON.stringify(R.failures));
  process.exit(R.verdict === 'PASS' ? 0 : 4);
})().catch(e => {
  console.error('RUNNER-ERROR', e && e.stack);
  R.verdict = 'BLOCKED'; R.failures.push('runner: ' + (e && e.message)); write(); process.exit(3);
});

function hardFails() { return R.failures.filter(f => !f.startsWith('parity')); }

function write() {
  if (R.vision_defects === null) {
    R.verdict = R.failures.length === 0 ? 'PASS-PENDING-VISION' : (hardFails().length ? 'FAIL' : 'PASS-PENDING-VISION');
  } else {
    R.verdict = hardFails().length === 0 && R.checks.images_200 === R.checks.images_requested &&
      R.checks.buttons_failed.length === 0 && R.checks.parity.blocker === 0 && R.checks.parity.major === 0 ? 'PASS' : 'FAIL';
  }
  fs.writeFileSync(`${ROOT}/e2e/results/shards/AU-014-verify.jsonl`, JSON.stringify(R) + '\n');
}
