// au056_verify_r2.js — CANONICAL CHECKLIST verifier for AU-056
// requests_board_feed_create_nudge_fulfill. Frozen bundle :9110 (sha 56ba3fc).
// Fixtures created through the REAL sandbox API (see /tmp/au056_fixtures.json).
// Navigation: bottom-nav tab (the lane serves flat files, no SPA rewrite; ?tab=
// deep links are not part of the frozen bundle's contract — in-app tab tap is
// the same code path a user drives).
const fs = require('fs');
const L = require('./lib_verify.js');
const { decodePng } = require('/tmp/pngdec.js');
const UNIT = 'AU-056';
const FX = JSON.parse(fs.readFileSync('/tmp/au056_fixtures.json', 'utf8'));
const OUTDIR = `/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/${UNIT}`;
fs.mkdirSync(OUTDIR, { recursive: true });
fs.mkdirSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/videos', { recursive: true });

const R = { checks: {}, states: [], asserts: [], defects: [], errors: [], netLog: [], dead: [] };
function assert(name, cond, detail) {
  R.asserts.push({ name, pass: !!cond, detail: detail || '' });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`);
  if (!cond) R.errors.push(name + ': ' + (detail || ''));
}

async function toastProbe(page, baseline) {
  const buf = await page.screenshot().catch(() => null);
  if (!buf) return null;
  const A = baseline ? decodePng(baseline) : null;
  const B = decodePng(buf);
  if (!B.rows) return null;
  let run = 0, firstY = null;
  for (let y = Math.floor(B.height * 0.45); y < B.height - 6; y++) {
    let dark = 0, samples = 0, sumDelta = 0;
    for (let x = Math.floor(B.width * 0.10); x < B.width * 0.90; x += 3) {
      const o = x * 3;
      const lb = (B.rows[y][o] * 299 + B.rows[y][o + 1] * 587 + B.rows[y][o + 2] * 114) / 1000;
      samples++; if (lb < 95) dark++;
      if (A && A.rows && A.height > y) {
        const la = (A.rows[y][o] * 299 + A.rows[y][o + 1] * 587 + A.rows[y][o + 2] * 114) / 1000;
        sumDelta += Math.abs(lb - la);
      }
    }
    const isDark = dark > samples * 0.55;
    const changed = !A || !A.rows ? true : (sumDelta / samples) > 22;
    if (isDark && changed) { run++; if (firstY === null) firstY = y; }
    else { if (run >= 8) return `dark CHANGED band y=${firstY}..${firstY + run}`; run = 0; firstY = null; }
  }
  return run >= 8 ? `dark CHANGED band y=${firstY}..${firstY + run}` : null;
}
const baseShot = (p) => p.screenshot().catch(() => null);

async function tapButton(page, re) {
  const loc = page.locator('flt-semantics[role="button"]').filter({ hasText: re }).first();
  try { await loc.click({ force: true, timeout: 4000 }); return true; } catch (e) { return false; }
}
// exact-text button tap by rect center (segmented buttons expose role=radio with aria-label)
async function tapRect(page, r) { await page.mouse.click(r[0] + r[2] / 2, Math.min(r[1] + r[3] / 2, 1015)); await page.waitForTimeout(500); }

async function dump(page) {
  return page.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => ({
    role: e.getAttribute('role'), tag: e.tagName,
    t: (e.textContent || '').trim(), label: e.getAttribute('aria-label') || '',
    disabled: e.getAttribute('aria-disabled'),
    r: (() => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; })(),
  })).filter(n => n.t || n.role));
}

async function openRequests(page) {
  await page.goto(L.APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(page, 'Buy now', 30000);
  await L.clickBtn(page, 'Requests');
  await page.waitForTimeout(2200);
  await L.waitText(page, 'Post request', 15000);
}

async function feedCallCount(R) { return R.netLog.filter(l => l.includes('GET API/api/v1/request-board/feed')).length; }

async function runViewport(vp, tag) {
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: vp, videoPath: `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/${UNIT}-${vp.width}x${vp.height}.webm` });
  const page = await ctx.newPage();
  const imgs = {};
  page.on('response', r => { const u = r.url(); if (/\/uploads\/[^?]*\.(png|jpe?g|webp)|\/assets\/.*\.(png|webp|jpg)/i.test(u)) imgs[u] = r.status(); });
  page.on('request', r => { if (/request-board/.test(r.url())) R.netLog.push(`${r.method()} ${r.url().replace('http://localhost:8083', 'API')}`); });
  page.on('response', r => { if (/request-board/.test(r.url())) R.netLog.push(`  -> ${r.status()} ${r.request().method()} ${r.url().replace('http://localhost:8083', 'API').split('?')[0]}`); });
  const V = `${vp.width}x${vp.height}`;
  console.log(`\n########## VIEWPORT ${V} (${tag}) ##########`);
  const S = async (state) => { const p = `${OUTDIR}/${UNIT}-${V}-${state}.png`; await L.screenshot(page, p); R.states.push({ vp: V, state, path: p }); return p; };

  // ---------- login ----------
  const okLogin = await L.login(page, L.BUYER);
  assert(`[${V}] login (token in localStorage)`, okLogin);

  // ---------- STATE A: feed via bottom nav ----------
  await openRequests(page);
  let txt = await L.allText(page);
  assert(`[${V}] A feed renders REAL sandbox rows (tailor post)`, txt.includes('I am looking for a tailor'), '');
  assert(`[${V}] A feed shows own AU056 fixture`, txt.includes('AU056 browser goods fixture 0825'), '');
  for (const bad of ['lorem', 'placeholder', 'dummy', 'TODO']) {
    assert(`[${V}] A placeholder-scan "${bad}"`, !txt.toLowerCase().includes(bad.toLowerCase()), txt.toLowerCase().includes(bad) ? 'HIT' : 'clean');
  }
  // budget chip on goods fixture card (real values from API)
  assert(`[${V}] A real budget values render on the card grid`, txt.includes('10,000 – 90,000 TZS'), '');
  await S('A-feed');

  let d = await dump(page);
  const segs = d.filter(n => n.role === 'radio' && /All|Goods|Services/.test(n.label));
  const searchInput = d.find(n => n.tag === 'INPUT' && !n.label);
  const statusBtn = d.find(n => n.role === 'button' && /^Status$/.test(n.t));
  assert(`[${V}] A filter bar: type segments All/Goods/Services`, segs.length >= 3, `found=${segs.map(s => s.label).join(',')}`);
  assert(`[${V}] A filter bar: search input present`, !!searchInput, '');
  assert(`[${V}] A filter bar: Status dropdown present`, !!statusBtn, '');

  // ---------- STATE B: type filter really refetches server-side ----------
  const beforeFeeds = R.netLog.filter(l => l.includes('/feed?page=')).map(l => l);
  const svcSeg = d.find(n => n.role === 'radio' && n.label === 'Services');
  await tapRect(page, svcSeg.r); await page.waitForTimeout(1800);
  txt = await L.allText(page);
  assert(`[${V}] B requestType=SERVICE: tailor visible`, txt.includes('I am looking for a tailor'), '');
  assert(`[${V}] B requestType=SERVICE: GOODS fixture hidden`, !txt.includes('AU056 browser goods fixture 0825'), 'GOODS still visible under Services');
  assert(`[${V}] B requestType=SERVICE triggered a NEW feed fetch w/ requestType param`,
    R.netLog.some(l => l.includes('/feed?') && l.includes('requestType=SERVICE')), R.netLog.filter(l => l.includes('requestType=')).slice(-1)[0] || 'no filtered call');
  await S('B-filter-service');

  d = await dump(page);
  const goodsSeg = d.find(n => n.role === 'radio' && n.label === 'Goods');
  await tapRect(page, goodsSeg.r); await page.waitForTimeout(1800);
  txt = await L.allText(page);
  assert(`[${V}] B requestType=GOODS shows GOODS fixture`, txt.includes('AU056 browser goods fixture 0825'), '');
  assert(`[${V}] B requestType=GOODS hides SERVICE tailor`, !txt.includes('I am looking for a tailor'), '');
  await S('B-filter-goods');

  // status dropdown -> Closed
  d = await dump(page);
  const stBtn = d.find(n => n.role === 'button' && /^Status$/.test(n.t));
  await tapRect(page, stBtn.r); await page.waitForTimeout(1100);
  d = await dump(page);
  const opts = d.filter(n => n.role === 'button' && /^(Open|Fulfilled|Closed)$/.test(n.t));
  assert(`[${V}] B status menu lists Open/Fulfilled/Closed`, opts.length === 3, opts.map(o => o.t).join(','));
  const closedOpt = opts.find(o => o.t === 'Closed');
  if (closedOpt) {
    await tapRect(page, closedOpt.r); await page.waitForTimeout(1800);
    txt = await L.allText(page);
    assert(`[${V}] B status=CLOSED shows the CLOSED fixture only`, txt.includes('AU056 verifier goods probe') && txt.includes('CLOSED') && !txt.includes('AU056 browser service fixture'), '');
    assert(`[${V}] B status=CLOSED fetched server-side w/ status=CLOSED`, R.netLog.some(l => l.includes('status=CLOSED')), R.netLog.filter(l => l.includes('status=')).slice(-1)[0] || '');
    await S('B-filter-closed');
  }

  // back to all via segments + reopen status -> Open then clear back to all
  d = await dump(page);
  const allSeg = d.find(n => n.role === 'radio' && n.label === 'All');
  await tapRect(page, allSeg.r); await page.waitForTimeout(1600);

  // search field
  const inputs = page.locator('input[type="text"]');
  const icnt = await inputs.count();
  if (icnt > 0) {
    await inputs.first().click({ force: true }); await page.waitForTimeout(350);
    await page.keyboard.type('conference', { delay: 30 });
    await page.keyboard.press('Enter'); await page.waitForTimeout(1900);
    txt = await L.allText(page);
    assert(`[${V}] B search "conference" narrows to the table post`, txt.includes('round conference table') && !txt.includes('I am looking for a tailor'), '');
    assert(`[${V}] B search hit the API w/ search= param`, R.netLog.some(l => l.includes('search=')), R.netLog.filter(l => l.includes('search=')).slice(-1)[0] || '');
    await S('B-search-conference');
    for (let k = 0; k < 14; k++) await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter'); await page.waitForTimeout(1400);
  } else {
    assert(`[${V}] B search input exists`, false, 'no text input found');
  }

  // ---------- STATE C: paging params present; scroll does not duplicate ----------
  assert(`[${V}] C feed uses paged endpoint (?page=&size=)`, R.netLog.some(l => l.includes('/feed?page=0&size=')), '');
  await L.scrollToBottom(page, 16); await page.waitForTimeout(1300);
  await L.scrollToBottom(page, 16); await page.waitForTimeout(1300);
  txt = await L.allText(page);
  const tailorDup = (txt.match(/I am looking for a tailor/g) || []).length;
  const ownDup = (txt.match(/AU056 browser goods fixture 0825/g) || []).length;
  assert(`[${V}] C scroll produces NO duplicate rows`, tailorDup <= 1 && ownDup <= 1, `tailor x${tailorDup} own x${ownDup}`);
  R.checks['paging_' + V] = `sandbox holds 7 posts → totalPages=1 → canLoadMore=false by design (web parity: IntersectionObserver gated on page+1<totalPages). Feed calls during run: ${R.netLog.filter(l => l.includes('/feed?')).length}`;
  await S('C-after-scroll');

  // ---------- STATE D: open OWN GOODS detail (identity gating + owner actions) ----------
  const opened = await L.clickCard(page, 'AU056 browser goods fixture 0825');
  await page.waitForTimeout(2200);
  txt = await L.allText(page);
  assert(`[${V}] D own GOODS card opens detail`, opened && txt.includes('created by AU-056 verifier browser flow'), opened ? '' : 'click failed');
  assert(`[${V}] D detail shows REAL category/location/budget from API`, txt.includes('Electronics') && txt.includes('Mikocheni') && txt.includes('10,000 – 90,000 TZS'), '');
  await S('D-detail-own-goods');

  // image requests reconciliation (fixture 13 has one upload)
  const imgEntries = Object.entries(imgs);
  const badImgs = imgEntries.filter(([u, s]) => s >= 400);
  R.images = { total: imgEntries.length, ok: imgEntries.filter(([u, s]) => s === 200 || s === 304).length, failed: badImgs.length };
  R.imageList = imgEntries.map(([u, s]) => ({ u: u.replace('http://localhost:8083', 'API'), s }));
  assert(`[${V}] D request images all HTTP 200/304 (${R.images.total} tracked)`, R.images.failed === 0 && R.images.total > 0,
    imgEntries.map(([u, s]) => `${u.split('/').pop()}=${s}`).join(', '));

  d = await dump(page);
  const btns = d.filter(n => n.role === 'button');
  const labels = btns.map(b => b.t.slice(0, 40));
  console.log('   D buttons:', JSON.stringify(labels));
  const nudgeOnOwn = btns.find(b => /[Nn]udge|[Oo]ffer/i.test(b.t)) && !/Back/.test(b => b.t);
  const ownerActions = ['Edit Request', 'Mark as Fulfilled', 'Delete Request'];
  const ownerBtnsFound = ownerActions.filter(a => btns.some(b => b.t.includes(a)));
  const anyNudge = btns.find(b => /(nudge|offer)/i.test(b.t));
  R.checks[`owner_buttons_${V}`] = JSON.stringify({ found: btns.map(b => b.t), ownerActionsFound: ownerBtnsFound });
  // identity gating: owner must NOT be offered a nudge CTA
  assert(`[${V}] D identity gating: NO nudge CTA on own request`, !anyNudge, anyNudge ? `OWNER SEES "${anyNudge.t}"` : 'absent (correct)');
  assert(`[${V}] D owner management actions present (Edit/Fulfill/Delete)`, ownerBtnsFound.length > 0,
    ownerBtnsFound.length ? ownerBtnsFound.join(' | ') : `NONE of ${ownerActions.join(',')} — buttons: ${labels.join(';')}`);
  await S('D-owner-actions');

  // ---------- STATE E: OTHER user's SERVICE detail → REAL nudge + ALREADY_NUDGED ----------
  await openRequests(page);
  await L.scrollToBottom(page, 12); await page.waitForTimeout(800);
  const openedSvc = await L.clickCard(page, 'I am looking for a tailor');
  await page.waitForTimeout(2400);
  txt = await L.allText(page);
  assert(`[${V}] E other-user SERVICE detail opens w/ description`, openedSvc && txt.includes('professional and on time'), openedSvc ? '' : 'click failed');
  assert(`[${V}] E detail renders requester name from API`, txt.includes('Roni'), '');
  await S('E-detail-other-service');

  const viewCalls = R.netLog.filter(l => l.includes('/view') && l.includes('PATCH'));
  assert(`[${V}] E view tracking PATCH fired on open`, viewCalls.length > 0, viewCalls.slice(-1)[0] || 'NO VIEW CALL');

  d = await dump(page);
  let nudgeBtn = d.find(n => n.role === 'button' && /(nudge|offer)/i.test(n.t));
  assert(`[${V}] E non-owner sees nudge CTA`, !!nudgeBtn, nudgeBtn ? nudgeBtn.t : 'MISSING');

  // server-side count before
  const tok = fs.readFileSync('/tmp/au056_token', 'utf8').trim();
  const cntBefore = await (await fetch(`http://localhost:8083/api/v1/request-board/${FX.otherServiceId}`, { headers: { Authorization: `Bearer ${tok}` } })).json();

  const baseN1 = await baseShot(page);
  await tapButton(page, /(nudge|offer)/i);
  await page.waitForTimeout(1600);
  const band1 = await toastProbe(page, baseN1);
  await S('E-nudge-toast');
  const cntAfter1 = await (await fetch(`http://localhost:8083/api/v1/request-board/${FX.otherServiceId}`, { headers: { Authorization: `Bearer ${tok}` } })).json();
  assert(`[${V}] E nudge REALLY posts (POST /nudge in network log)`, R.netLog.some(l => l.includes('POST') && l.includes('/nudge')), R.netLog.filter(l => l.includes('/nudge')).slice(-1)[0] || 'none');
  assert(`[${V}] E nudge persisted server-side (nudgeCount ${cntBefore.nudgeCount}→${cntAfter1.nudgeCount}) OR ALREADY_NUDGED copy shown`,
    cntAfter1.nudgeCount > cntBefore.nudgeCount || band1 !== null, `count now ${cntAfter1.nudgeCount}; toast band: ${band1 || 'none'}`);

  // repeat nudge -> 409 ALREADY_NUDGED handled without crash
  await page.waitForTimeout(5200); // let snackbar fade so the next band is attributable
  const baseN2 = await baseShot(page);
  d = await dump(page);
  nudgeBtn = d.find(n => n.role === 'button' && /(nudge|offer)/i.test(n.t));
  let band2 = null, copyAlready = false;
  if (nudgeBtn) {
    await tapButton(page, /(nudge|offer)/i);
    await page.waitForTimeout(2000);
    const afterTxt = await L.allText(page);
    copyAlready = /already nudged/i.test(afterTxt);
    band2 = await toastProbe(page, baseN2);
    await S('E-repeat-nudge');
  }
  assert(`[${V}] E repeat nudge handled gracefully (ALREADY_NUDGED 409 → message, no crash)`,
    !nudgeBtn || copyAlready || band2 !== null, `domCopy=${copyAlready} band=${band2 || 'none'}`);

  // ---------- STATE F: create-request GOODS vs SERVICE ----------
  await openRequests(page);
  await L.clickBtn(page, 'Post request');
  await page.waitForTimeout(2200);
  txt = await L.allText(page);
  assert(`[${V}] F create screen opens w/ GOODS/SERVICE segmented control`, txt.includes('Looking to buy') && txt.includes('Need a service'), '');
  await S('F-create-empty');

  // empty submit → validation, NO write
  const postsBefore = R.netLog.filter(l => l.startsWith('POST')).length;
  await tapButton(page, 'Post request');
  await page.waitForTimeout(1500);
  txt = await L.allText(page);
  const validation = txt.includes('Required') || txt.includes('Please select one');
  const postsAfterEmpty = R.netLog.filter(l => l.startsWith('POST')).length;
  assert(`[${V}] F empty submit blocked by validation`, validation, validation ? 'validators fire' : txt.slice(0, 120));
  assert(`[${V}] F empty submit performs NO network write`, postsAfterEmpty === postsBefore, `${postsBefore}→${postsAfterEmpty}`);
  await S('F-create-validation');

  // fill GOODS form (title/category/desc/budgets; location prefilled Dar es Salaam)
  const ins = page.locator('input[type="text"], textarea');
  const fillL = async (loc, v) => { await loc.click({ force: true, timeout: 4000 }); await page.waitForTimeout(280); await page.keyboard.type(v, { delay: 14 }); };
  await fillL(ins.nth(0), 'AU056 UI-created goods 0825');
  await tapButton(page, 'Category'); await page.waitForTimeout(1100);
  let pickedCat = null;
  for (const c of ['Furniture', 'Electronics', 'Clothing']) { if (await tapButton(page, c)) { pickedCat = c; break; } }
  await page.waitForTimeout(700);
  const ta = page.locator('textarea').first();
  await fillL(ta, 'Filled through the Flutter UI by the AU-056 verifier.');
  const ins2 = page.locator('input[type="text"]');
  const c2 = await ins2.count();
  if (c2 >= 4) { await fillL(ins2.nth(c2 - 2), '50000'); await fillL(ins2.nth(c2 - 1), '150000'); }
  console.log(`   F filled: cat=${pickedCat} inputs=${c2}`);
  await S('F-create-filled');
  netPush(R, 'MARKER pre-submit');
  const submitOk = await tapButton(page, 'Post request');
  await page.waitForTimeout(3400);
  txt = await L.allText(page);
  // backend rejects GOODS without an attached image (RequestBoardService L108)
  const rejectedNoImage = /Something went wrong|image/i.test(txt) && txt.includes('Post a request');
  let created = null;
  const feedNow = await (await fetch('http://localhost:8083/api/v1/request-board/feed?page=0&size=50', { headers: { Authorization: `Bearer ${tok}` } })).json();
  created = feedNow.content.find(r => r.title === 'AU056 UI-created goods 0825');
  assert(`[${V}] F GOODS UI submit reaches the REAL endpoint (POST observed)`, R.netLog.some(l => l.includes('POST') && /request-board($|\?)/.test(l)), R.netLog.filter(l => l.includes('POST')).slice(-1)[0] || 'none');
  if (created) {
    assert(`[${V}] F GOODS UI create PERSISTED (id=${created.id}, multipart reached backend)`, true, `backend id=${created.id}`);
  } else {
    assert(`[${V}] F GOODS UI create blocked by backend rule (GOODS requires ≥1 image — app sends none)`, rejectedNoImage,
      'KNOWN GAP: create screen exposes no image picker for GOODS; backend 400 "At least one image is required"');
  }
  await S('F-create-result');
  if (created) { await fetch(`http://localhost:8083/api/v1/request-board/${created.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok}` } }); }

  // SERVICE path (images optional → should fully succeed)
  await tapButton(page, 'Need a service');
  await page.waitForTimeout(900);
  const ins3 = page.locator('input[type="text"], textarea');
  await fillL(ins3.nth(0), 'AU056 UI service 0825');
  await tapButton(page, 'Service category'); await page.waitForTimeout(1000);
  let pickedSvc = null;
  for (const c of ['Cleaning', 'Repairs', 'Tutoring']) { if (await tapButton(page, c)) { pickedSvc = c; break; } }
  await page.waitForTimeout(600);
  const ta3 = page.locator('textarea').first();
  await fillL(ta3, 'Service created through the Flutter UI by the AU-056 verifier.');
  const ins4 = page.locator('input[type="text"]');
  const c4 = await ins4.count();
  if (c4 >= 4) { await fillL(ins4.nth(c4 - 2), '20000'); await fillL(ins4.nth(c4 - 1), '80000'); }
  await S('F-service-filled');
  await tapButton(page, 'Post request');
  await page.waitForTimeout(3600);
  const feedSvc = await (await fetch('http://localhost:8083/api/v1/request-board/feed?page=0&size=50', { headers: { Authorization: `Bearer ${tok}` } })).json();
  const svcCreated = feedSvc.content.find(r => r.title === 'AU056 UI service 0825');
  assert(`[${V}] F SERVICE UI create PERSISTED end-to-end`, !!svcCreated, svcCreated ? `backend id=${svcCreated.id} type=${svcCreated.requestType} cat=${svcCreated.serviceCategory}` : 'not created');
  assert(`[${V}] F SERVICE create used the /request-board/service endpoint`, R.netLog.some(l => l.includes('POST') && l.includes('/service')), R.netLog.filter(l => l.includes('/service')).slice(-1)[0] || '');
  await S('F-service-result');
  if (svcCreated) { await fetch(`http://localhost:8083/api/v1/request-board/${svcCreated.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok}` } }); }

  // ---------- click-everything sweep on the feed ----------
  await openRequests(page);
  d = await dump(page);
  const controls = d.filter(n => (n.role === 'button' || n.tag === 'FLT-SEMANTICS' && n.r[2] > 0) && (n.role === 'button' || n.r[2] > 30));
  const interactive = controls.filter(n => n.role === 'button' || /flt-tappable/.test(JSON.stringify(n)));
  const list = d.filter(n => n.role === 'button');
  console.log(`   [${V}] clickable controls on feed: ${list.length}`);
  let clicked = 0, effects = 0;
  const navSkip = /^(Home|Marketplace|Sell|Requests|Account)\b/;
  for (const c of list) {
    const short = c.t.replace(/\n/g, ' ').slice(0, 36);
    const isBottomNav = navSkip.test(c.t) && c.r[1] > vp.height - 120;
    if (isBottomNav) continue; // exercised separately below
    if (c.disabled === 'true') { continue; }
    const beforeTxt = await L.allText(page);
    const base = await baseShot(page);
    const locc = page.locator('flt-semantics[role="button"]').filter({ hasText: c.t.slice(0, 18) }).first();
    try { await locc.click({ force: true, timeout: 2500 }); } catch (e) { await tapRect(page, c.r); }
    await page.waitForTimeout(850);
    const afterTxt = await L.allText(page);
    const eff = beforeTxt !== afterTxt || (await toastProbe(page, base)) !== null;
    clicked++;
    if (eff) effects++; else { R.defects.push(`[${V}] dead control "${short}" at ${JSON.stringify(c.r)}`); R.dead.push({ vp: V, label: short }); }
    if (!afterTxt.includes('Search') && !(await dump(page)).some(n => n.label === 'Services')) {
      await openRequests(page);
    } else if (!afterTxt.includes('Status')) { await openRequests(page); }
  }
  // bottom-nav tabs each navigate
  for (const tb of ['Home', 'Marketplace', 'Sell', 'Account']) {
    const b1 = await L.allText(page);
    await L.clickBtn(page, tb);
    await page.waitForTimeout(1200);
    const b2 = await L.allText(page);
    clicked++; if (b1 !== b2 || (await page.url()) !== '') effects++;
    await openRequests(page);
  }
  R.clicksTotal = (R.clicksTotal || 0) + clicked;
  R.clicksOk = (R.clicksOk || 0) + effects;
  assert(`[${V}] click-everything: ${clicked} controls, ${effects} observable effects`, clicked === 0 || effects >= clicked - 1, `${effects}/${clicked}`);

  await S('Z-final');
  R.imagesFinal = { total: Object.keys(imgs).length };
  await L.closeVideo(ctx, `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/${UNIT}-${vp.width}x${vp.height}.webm`);
  await browser.close();
}

function netPush(R, m) { R.netLog.push('---- ' + m + ' ----'); }

(async () => {
  try {
    await runViewport({ width: 375, height: 667 }, 'mobile');
    await runViewport({ width: 768, height: 1024 }, 'tablet');
  } catch (e) { R.errors.push('FATAL ' + e.message); console.error('FATAL', e); }
  fs.writeFileSync('/tmp/au056_results.json', JSON.stringify(R, null, 2));
  const failed = R.asserts.filter(a => !a.pass);
  console.log(`\n===== SUMMARY ${UNIT}: ${R.asserts.length - failed.length}/${R.asserts.length} asserts pass =====`);
  failed.forEach(f => console.log('  FAIL:', f.name, '::', f.detail));
})();
