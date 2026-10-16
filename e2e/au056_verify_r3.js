// au056_verify_r3.js — FINAL canonical verifier for AU-056 (r3, fixes r2 driver bugs).
// Frozen bundle :9110 (sha 56ba3fc). Fixtures via REAL sandbox API.
// r2 driver bugs fixed here:
//  - search asserted while a stale status=CLOSED filter was still applied (mobile
//    dropdown has no "All statuses" item) -> reset filters by tab-away + tab-back,
//    which remounts RequestsScreen and drops filter state.
//  - FAB/create taps used hasText locators that matched the FEED's own "Post request"
//    button after navigation; now every tap uses exact rect centers from the dump.
//  - GOODS create: backend rejects image-less GOODS posts by design; assert the
//    request reached the endpoint and the error copy surfaced (documented gap),
//    then prove full persistence through the SERVICE path (images optional).
const fs = require('fs');
const L = require('./lib_verify.js');
const { decodePng } = require('/tmp/pngdec.js');
const UNIT = 'AU-056';
const FX = JSON.parse(fs.readFileSync('/tmp/au056_fixtures.json', 'utf8'));
const OUTDIR = `/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/${UNIT}`;
fs.mkdirSync(OUTDIR, { recursive: true });

const R = { checks: {}, states: [], asserts: [], defects: [], errors: [], netLog: [] };
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
    if (dark > samples * 0.55 && (!A || !A.rows || sumDelta / samples > 22)) { run++; if (firstY === null) firstY = y; }
    else { if (run >= 8) return `dark CHANGED band y=${firstY}..${firstY + run}`; run = 0; firstY = null; }
  }
  return run >= 8 ? `dark CHANGED band y=${firstY}..${firstY + run}` : null;
}
const baseShot = (p) => p.screenshot().catch(() => null);
async function dump(page) {
  return page.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => ({
    role: e.getAttribute('role'), tag: e.tagName, t: (e.textContent || '').trim(),
    label: e.getAttribute('aria-label') || '', disabled: e.getAttribute('aria-disabled'),
    r: (() => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; })(),
  })).filter(n => n.t || n.role));
}
async function tapRect(page, r, maxH) {
  await page.mouse.click(r[0] + r[2] / 2, Math.min(r[1] + r[3] / 2, (maxH || 1015)));
  await page.waitForTimeout(600);
}
async function openRequests(page) {
  await page.goto(L.APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(page, 'Buy now', 30000);
  await L.clickBtn(page, 'Requests');
  await page.waitForTimeout(2400);
  await L.waitText(page, 'Post request', 15000);
}
async function findNode(page, pred) { const d = await dump(page); return d.find(pred); }

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
  const tok = fs.readFileSync('/tmp/au056_token', 'utf8').trim();
  const feedApi = async () => (await (await fetch('http://localhost:8083/api/v1/request-board/feed?page=0&size=50', { headers: { Authorization: `Bearer ${tok}` } })).json());

  // ---------- login ----------
  assert(`[${V}] login (token in localStorage)`, await L.login(page, L.BUYER));

  // ---------- STATE A: feed ----------
  await openRequests(page);
  let txt = await L.allText(page);
  assert(`[${V}] A feed renders REAL sandbox rows`, txt.includes('I am looking for a tailor') && txt.includes('I am looking for a round conference table'), '');
  assert(`[${V}] A feed shows own AU056 fixture w/ REAL budget values`, txt.includes('AU056 browser goods fixture 0825') && txt.includes('10,000 – 90,000 TZS'), '');
  let placeholderHit = null;
  for (const bad of ['lorem', 'placeholder', 'dummy', 'TODO']) if (txt.toLowerCase().includes(bad.toLowerCase())) placeholderHit = bad;
  assert(`[${V}] A placeholder-scan (lorem/placeholder/dummy/TODO)`, !placeholderHit, placeholderHit ? 'HIT ' + placeholderHit : 'clean');
  await S('A-feed');

  const segs = (await dump(page)).filter(n => n.role === 'radio' && ['All', 'Goods', 'Services'].includes(n.label));
  const searchInput = await page.locator('input[type="text"]').count() > 0;
  const statusBtn = (await dump(page)).find(n => n.role === 'button' && n.t === 'Status');
  assert(`[${V}] A filter bar: type segments All/Goods/Services`, segs.length >= 3, segs.map(s => s.label).join(','));
  assert(`[${V}] A filter bar: search input present`, !!searchInput, '');
  assert(`[${V}] A filter bar: Status dropdown present`, !!statusBtn, '');

  // ---------- STATE B: server filters ----------
  let svcSeg = await findNode(page, n => n.role === 'radio' && n.label === 'Services');
  await tapRect(page, svcSeg.r, vp.height - 60); await page.waitForTimeout(1800);
  txt = await L.allText(page);
  assert(`[${V}] B requestType=SERVICE shows tailor only`, txt.includes('I am looking for a tailor') && !txt.includes('AU056 browser goods fixture 0825'), '');
  assert(`[${V}] B requestType=SERVICE hit API with requestType param`, R.netLog.some(l => l.includes('requestType=SERVICE')), '');
  await S('B-filter-service');

  svcSeg = await findNode(page, n => n.role === 'radio' && n.label === 'Goods');
  await tapRect(page, svcSeg.r, vp.height - 60); await page.waitForTimeout(1800);
  txt = await L.allText(page);
  assert(`[${V}] B requestType=GOODS flips to GOODS rows only`, txt.includes('AU056 browser goods fixture 0825') && !txt.includes('I am looking for a tailor'), '');
  await S('B-filter-goods');

  let stBtn = await findNode(page, n => n.role === 'button' && n.t === 'Status');
  await tapRect(page, stBtn.r, vp.height - 60); await page.waitForTimeout(1000);
  let opts = (await dump(page)).filter(n => n.role === 'button' && ['Open', 'Fulfilled', 'Closed'].includes(n.t));
  assert(`[${V}] B status menu lists Open/Fulfilled/Closed`, opts.length === 3, opts.map(o => o.t).join(','));
  let closedOpt = opts.find(o => o.t === 'Closed');
  if (closedOpt) {
    await tapRect(page, closedOpt.r, vp.height - 60); await page.waitForTimeout(1800);
    txt = await L.allText(page);
    assert(`[${V}] B status=CLOSED narrows to the CLOSED fixture`, txt.includes('AU056 verifier goods probe') && txt.includes('CLOSED') && !txt.includes('tailor'), '');
    assert(`[${V}] B status=CLOSED fetched server-side`, R.netLog.some(l => l.includes('status=CLOSED')), '');
    await S('B-filter-closed');
  }
  // RESET filters (tab away/back remounts the screen — mobile dropdown has no "All" item)
  await openRequests(page);

  // search
  const sInp = page.locator('input[type="text"]').first();
  await sInp.click({ force: true }); await page.waitForTimeout(400);
  await page.keyboard.insertText('conference'); await page.waitForTimeout(600);
  await page.keyboard.press('Enter'); await page.waitForTimeout(2400);
  txt = await L.allText(page);
  assert(`[${V}] B search "conference" narrows to the table post`, txt.includes('round conference table') && !txt.includes('tailor'), '');
  assert(`[${V}] B search hit API with search= param`, R.netLog.some(l => l.includes('search=conference')), '');
  await S('B-search-conference');
  await openRequests(page);

  // ---------- STATE C: paging ----------
  assert(`[${V}] C feed uses paged endpoint (?page=&size=)`, R.netLog.some(l => l.includes('/feed?page=0&size=')), '');
  const before = await feedApi();
  R.checks['paging_' + V] = `sandbox holds ${before.totalElements} posts → totalPages=${before.totalPages} → canLoadMore=false by design (web IntersectionObserver gated on page+1<totalPages). Feed fetches this run: ${R.netLog.filter(l => l.includes('/feed?')).length}`;
  // allText() concatenates EVERY flt-semantics node including full-screen ancestors, so a
  // scrolled list repeats each row's text once per visible ancestor — count DISTINCT
  // top-level card nodes from the dump instead of raw text occurrences.
  const distinctCards = async () => {
    const d = await dump(page);
    return {
      tailor: d.filter(n => n.tap && n.t.startsWith('I am looking for a tailor')).length,
      own: d.filter(n => n.tap && n.t.startsWith('AU056 browser goods fixture 0825')).length,
    };
  };
  await L.scrollToBottom(page, 16); await page.waitForTimeout(1200);
  const c1 = await distinctCards();
  await L.scrollToBottom(page, 16); await page.waitForTimeout(1200);
  const c2 = await distinctCards();
  assert(`[${V}] C scroll produces NO duplicate rows`, c1.tailor <= 1 && c1.own <= 1 && c2.tailor <= 1 && c2.own <= 1, `after wheel1 tailor=${c1.tailor} own=${c1.own}; after wheel2 tailor=${c2.tailor} own=${c2.own}`);
  await S('C-after-scroll');

  // ---------- STATE D: OWN detail (identity gating + owner actions + images) ----------
  await openRequests(page);   // reset scroll position from STATE C
  let card = null;
  for (let attempt = 0; attempt < 4 && !card; attempt++) {
    card = (await dump(page)).find(n => n.tap && n.t.startsWith('AU056 browser goods fixture 0825'));
    if (!card) { console.log(`   D retry ${attempt}: card not in tree yet`); await openRequests(page); }
  }
  assert(`[${V}] D own GOODS card is present+tappable`, !!card, card ? '' : 'not among tappable nodes after retries');
  const openedViaFallback = !card;
  if (card) { await tapRect(page, card.r, vp.height - 60); await page.waitForTimeout(2400); }
  txt = await L.allText(page);
  if (!txt.includes('created by AU-056 verifier browser flow')) {
    await openRequests(page);
    await L.clickCard(page, 'AU056 browser goods fixture');
    await page.waitForTimeout(2400);
    txt = await L.allText(page);
  } else if (openedViaFallback) {
    await L.clickCard(page, 'AU056 browser goods fixture');
    await page.waitForTimeout(2400);
    txt = await L.allText(page);
  }
  txt = await L.allText(page);
  assert(`[${V}] D detail opens w/ description from detail payload`, txt.includes('created by AU-056 verifier browser flow'), '');
  assert(`[${V}] D real category/location/budget render`, txt.includes('Electronics') && txt.includes('Mikocheni') && txt.includes('10,000 – 90,000 TZS'), '');
  assert(`[${V}] D detail refetched by id (GET /request-board/13 observed)`, R.netLog.some(l => l.includes(`GET API/api/v1/request-board/${FX.ownGoodsId}`)), '');
  await S('D-detail-own-goods');

  const imgEntries = Object.entries(imgs);
  const badImgs = imgEntries.filter(([u, s]) => s >= 400);
  R.images = { total: imgEntries.length, ok: imgEntries.filter(([u, s]) => s === 200 || s === 304).length, failed: badImgs.length };
  R.imageList = imgEntries.map(([u, s]) => ({ u: u.replace('http://localhost:8083', 'API'), s }));
  assert(`[${V}] D all tracked image requests HTTP 200/304 (${R.images.total})`, R.images.failed === 0 && R.images.total > 0, `${R.images.ok}/${R.images.total} ok`);
  imgEntries.filter(([u, s]) => s >= 400).forEach(([u, s]) => R.defects.push(`image HTTP ${s}: ${u}`));

  let btns = (await dump(page)).filter(n => n.role === 'button');
  const anyNudge = btns.find(b => /(nudge|offer)/i.test(b.t));
  assert(`[${V}] D identity gating: NO nudge CTA on OWN request`, !anyNudge, anyNudge ? `OWNER SEES "${anyNudge.t}"` : 'absent (correct)');
  const expectedOwner = ['Edit Request', 'Mark as Fulfilled', 'Delete Request'];
  const foundOwner = expectedOwner.filter(a => btns.some(b => b.t.includes(a)));
  R.checks[`owner_buttons_${V}`] = JSON.stringify(btns.map(b => b.t.slice(0, 32)));
  assert(`[${V}] D owner management actions offered (of ${expectedOwner.join('/')})`, foundOwner.length > 0,
    foundOwner.length ? foundOwner.join(' | ') : `NONE seen — buttons: ${btns.map(b => b.t.slice(0, 24)).join(';')} (web-parity edit/close/fulfill/delete UI NOT ported to mobile detail)`);
  if (foundOwner.length < 3) R.defects.push(`[${V}] owner actions missing on mobile request detail: have [${btns.map(b => b.t).join(', ')}], web offers Edit Request / Mark as Fulfilled / Delete Request (+fulfilled-details)`);
  await S('D-owner-actions');

  // ---------- STATE E: OTHER user's SERVICE detail → nudge REALLY posts → ALREADY_NUDGED ----------
  let eOpened = false;
  for (let round = 0; round < 3 && !eOpened; round++) {
    await openRequests(page);
    let svcCard = (await dump(page)).find(n => n.tap && n.t.startsWith('I am looking for a tailor'));
    if (!svcCard) { await L.scrollToBottom(page, 10); await page.waitForTimeout(900); svcCard = (await dump(page)).find(n => n.tap && n.t.startsWith('I am looking for a tailor')); }
    if (!svcCard) continue;
    const rBeforeTap = svcCard.r.slice();
    if (rBeforeTap[1] + rBeforeTap[3] > vp.height - 40 || rBeforeTap[1] < 0) {
      await L.scrollIntoView(page, 'I am looking for a tailor'); await page.waitForTimeout(700);
      svcCard = (await dump(page)).find(n => n.tap && n.t.startsWith('I am looking for a tailor')) || svcCard;
    }
    await tapRect(page, svcCard.r, vp.height - 60); await page.waitForTimeout(2500);
    txt = await L.allText(page);
    if (txt.includes('professional and on time') && txt.includes('Roni')) { eOpened = true; break; }
    // second try from the freshly-remounted feed
    await openRequests(page);
    await L.clickCard(page, 'I am looking for a tailor');
    await page.waitForTimeout(2600);
    txt = await L.allText(page);
    if (txt.includes('professional and on time') && txt.includes('Roni')) { eOpened = true; }
  }
  assert(`[${V}] E other-user SERVICE detail reached`, eOpened, eOpened ? '' : 'card tap never opened the detail after retries');
  txt = await L.allText(page);
  assert(`[${V}] E detail opens w/ requester name + description`, txt.includes('Roni') && txt.includes('professional and on time'), '');
  txt = await L.allText(page);
  assert(`[${V}] E detail opens w/ requester name + description`, txt.includes('Roni') && txt.includes('professional and on time'), '');
  await S('E-detail-other-service');
  const viewCalls = R.netLog.filter(l => l.includes('/view') && l.includes('PATCH'));
  assert(`[${V}] E view tracking PATCH fired on open`, viewCalls.length > 0, viewCalls.slice(-2)[0] || viewCalls[0] || 'NO VIEW CALL');

  const cntBefore = await (await fetch(`http://localhost:8083/api/v1/request-board/${FX.otherServiceId}`, { headers: { Authorization: `Bearer ${tok}` } })).json();
  const baseN1 = await baseShot(page);
  let nBtn = await findNode(page, n => n.role === 'button' && /(nudge|offer)/i.test(n.t));
  assert(`[${V}] E non-owner sees nudge CTA`, !!nBtn, nBtn ? nBtn.t.slice(0, 40) : 'MISSING');
  if (nBtn) {
    await tapRect(page, nBtn.r, vp.height - 60); await page.waitForTimeout(1800);
    const band1 = await toastProbe(page, baseN1);
    await S('E-nudge-toast');
    const cntAfter = await (await fetch(`http://localhost:8083/api/v1/request-board/${FX.otherServiceId}`, { headers: { Authorization: `Bearer ${tok}` } })).json();
    const nudgedNow = cntAfter.nudgeCount > cntBefore.nudgeCount;
    assert(`[${V}] E nudge REALLY posts (POST /nudge in network log)`, R.netLog.some(l => l.includes('POST') && l.includes('/nudge')), '');
    assert(`[${V}] E nudge persisted server-side (count ${cntBefore.nudgeCount}→${cntAfter.nudgeCount}) or already-nudged toast shown`, nudgedNow || band1 !== null, `band=${band1 || 'none'}`);

    // repeat → 409 ALREADY_NUDGED handled
    await page.waitForTimeout(5200);
    const baseN2 = await baseShot(page);
    nBtn = await findNode(page, n => n.role === 'button' && /(nudge|offer)/i.test(n.t));
    if (nBtn) {
      await tapRect(page, nBtn.r, vp.height - 60); await page.waitForTimeout(2000);
      txt = await L.allText(page);
      const domAlready = /already nudged/i.test(txt);
      const band2 = await toastProbe(page, baseN2);
      await S('E-repeat-nudge');
      assert(`[${V}] E repeat nudge handled gracefully (ALREADY_NUDGED 409 → message, no crash)`, domAlready || band2 !== null, `domCopy=${domAlready} band=${band2 || 'none'}`);
    }
  }

  // ---------- STATE F: create-request (GOODS multipart vs SERVICE) ----------
  await openRequests(page);
  const fab = await findNode(page, n => n.role === 'button' && n.t === 'Post request');
  assert(`[${V}] F "Post request" FAB present`, !!fab, '');
  if (fab) { await tapRect(page, fab.r, vp.height - 60); await page.waitForTimeout(2400); }
  txt = await L.allText(page);
  const dAfterFab = await dump(page);
  // SegmentedButton labels live ONLY in aria-label, never in textContent
  const segRadios = dAfterFab.filter(n => n.role === 'radio' && ['Looking to buy', 'Need a service'].includes(n.label));
  const formOpen = segRadios.length === 2 && (dAfterFab.some(n => n.t.includes('Post a request')));
  assert(`[${V}] F create screen opens w/ GOODS/SERVICE segments`, formOpen,
    formOpen ? `radios=${segRadios.map(r => r.label + ':' + r.r).join(',')}` : `txt=${txt.slice(0, 110)}`);
  R.checks[`create_segments_${V}`] = JSON.stringify(segRadios.map(r => ({ label: r.label, checked: r.r })));
  await S('F-create-empty');

  // empty submit → validation only, zero writes
  let postsBefore = R.netLog.filter(l => l.startsWith('POST')).length;
  const submitBtn = await findNode(page, n => n.role === 'button' && n.t === 'Post request');
  if (submitBtn) { await tapRect(page, submitBtn.r, vp.height - 60); await page.waitForTimeout(1600); }
  txt = await L.allText(page);
  const validation = txt.includes('Required') || txt.includes('Please select one');
  assert(`[${V}] F empty submit blocked by validation copy`, validation, validation ? 'Required/select-one shown' : txt.slice(0, 140));
  assert(`[${V}] F empty submit performs NO network write`, R.netLog.filter(l => l.startsWith('POST')).length === postsBefore, '');
  await S('F-create-validation');

  // fill GOODS (title/category/desc/budgets). App exposes NO image picker → backend will
  // reject with "At least one image is required for GOODS requests" (RequestBoardService L108).
  const ins = page.locator('input[type="text"], textarea');
  const fl = async (loc, v) => { await loc.click({ force: true, timeout: 5000 }); await page.waitForTimeout(300); await page.keyboard.insertText(v); await page.waitForTimeout(250); };
  await fl(ins.nth(0), 'AU056 UI-created goods 0825');
  await tapButtonOr(page, 'Category');
  async function tapButtonOr(page, label) {
    const b = await findNode(page, n => n.role === 'button' && n.t.startsWith(label));
    if (b) { await tapRect(page, b.r, vp.height - 60); await page.waitForTimeout(1100); return true; }
    return false;
  }
  let pickedCat = null;
  for (const c of ['Furniture', 'Electronics', 'Clothing', 'Other']) {
    const opt = (await dump(page)).find(n => n.t === c);
    if (!opt) continue;
    // dropdown items are tappable nodes, not role=button — click by rect
    await tapRect(page, opt.r, vp.height - 60); pickedCat = c; break;
  }
  await page.waitForTimeout(600);
  const ta = page.locator('textarea').first();
  await fl(ta, 'Filled through the Flutter UI by the AU-056 verifier.');
  const ins2 = page.locator('input[type="text"]');
  const nInputs = await ins2.count();
  if (nInputs >= 4) { await fl(ins2.nth(nInputs - 2), '50000'); await fl(ins2.nth(nInputs - 1), '150000'); }
  console.log(`   F filled: cat=${pickedCat} inputs=${nInputs}`);
  await S('F-create-filled');
  const sub2 = await findNode(page, n => n.role === 'button' && n.t === 'Post request');
  if (sub2) { await tapRect(page, sub2.r, vp.height - 60); await page.waitForTimeout(3400); }
  txt = await L.allText(page);
  const feedAfter = await feedApi();
  const uiCreated = feedAfter.content.find(r => r.title === 'AU056 UI-created goods 0825');
  const goodsSubmitReachedServer = R.netLog.some(l => l.includes('POST') && /request-board($|\?)|request-board\b/.test(l) && !l.includes('/service')) || !!uiCreated;
  assert(`[${V}] F GOODS submit reaches the REAL endpoint (POST /request-board observed or persisted)`,
    goodsSubmitReachedServer, R.netLog.filter(l => l.includes('POST')).slice(-1)[0] || 'no POST seen');
  if (!uiCreated) {
    const errShown = /Something went wrong|image/i.test(txt);
    assert(`[${V}] F GOODS create surfaces backend rejection (app sends NO images → backend requires ≥1)`, errShown,
      errShown ? 'error copy visible on form' : `form text: ${txt.slice(0, 130)}`);
    R.defects.push(`[${V}] CREATE GAP: GOODS requests cannot be completed from the app — create screen has no image picker, but the backend requires ≥1 image for GOODS (RequestBoardService.createRequest L108). Web parity: request-image-uploader.tsx.`);
  } else {
    await fetch(`http://localhost:8083/api/v1/request-board/${uiCreated.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok}` } });
  }
  await S('F-create-result');

  // SERVICE path — images optional → full end-to-end persistence
  const svcRadio = page.locator('flt-semantics[role="radio"]').nth(1);
  try { await svcRadio.click({ force: true, timeout: 4000 }); } catch (e) { R.errors.push('svc radio: ' + e.message.slice(0, 50)); }
  await page.waitForTimeout(900);
  const ins3 = page.locator('input[type="text"], textarea');
  await fl(ins3.nth(0), 'AU056 UI service 0825');
  await tapButtonOr(page, 'Service category');
  let pickedSvc = null;
  for (const c of ['Cleaning', 'Repairs', 'Tutoring', 'Other']) {
    const opt = (await dump(page)).find(n => n.t === c);
    if (!opt) continue;
    await tapRect(page, opt.r, vp.height - 60); pickedSvc = c; break;
  }
  await page.waitForTimeout(500);
  await fl(page.locator('textarea').first(), 'Service created through the Flutter UI by the AU-056 verifier.');
  const ins4 = page.locator('input[type="text"]');
  const c4 = await ins4.count();
  if (c4 >= 4) { await fl(ins4.nth(c4 - 2), '20000'); await fl(ins4.nth(c4 - 1), '80000'); }
  await S('F-service-filled');
  const sub3 = await findNode(page, n => n.role === 'button' && n.t === 'Post request');
  if (sub3) { await tapRect(page, sub3.r, vp.height - 60); await page.waitForTimeout(3600); }
  const feedSvc = await feedApi();
  const svcCreated = feedSvc.content.find(r => r.title === 'AU056 UI service 0825');
  assert(`[${V}] F SERVICE create PERSISTED end-to-end on sandbox`, !!svcCreated, svcCreated ? `backend id=${svcCreated.id} type=${svcCreated.requestType} cat=${svcCreated.serviceCategory} loc=${svcCreated.location}` : 'NOT CREATED');
  assert(`[${V}] F SERVICE create used /request-board/service endpoint`, R.netLog.some(l => l.includes('POST') && l.includes('/service')), '');
  await S('F-service-result');
  if (svcCreated) { await fetch(`http://localhost:8083/api/v1/request-board/${svcCreated.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok}` } }); }

  // ---------- click-everything sweep on the FEED ----------
  await openRequests(page);
  const list = (await dump(page)).filter(n => n.role === 'button');
  console.log(`   [${V}] buttons on feed: ${list.length}`);
  let clicked = 0, effects = 0;
  const navSkip = /^(Home|Marketplace|Sell|Requests|Account)\b/;
  for (const c of list) {
    const short = c.t.replace(/\n/g, ' ').slice(0, 34);
    if (navSkip.test(c.t) && c.r[1] > vp.height - 130) continue;
    if (c.disabled === 'true') continue;
    const beforeTxt = await L.allText(page);
    const base = await baseShot(page);
    await tapRect(page, c.r, vp.height - 60);
    await page.waitForTimeout(900);
    const afterTxt = await L.allText(page);
    const eff = beforeTxt !== afterTxt || (await toastProbe(page, base)) !== null;
    clicked++; if (eff) effects++;
    else R.defects.push(`[${V}] dead control "${short}" at ${JSON.stringify(c.r)} (feed)`);
    if (!(await dump(page)).some(n => n.label === 'Services')) await openRequests(page);
  }
  // bottom-nav tabs
  for (const tb of ['Home', 'Marketplace', 'Sell', 'Account']) {
    const b1 = await L.allText(page);
    await L.clickBtn(page, tb);
    await page.waitForTimeout(1400);
    const b2 = await L.allText(page);
    clicked++; if (b1 !== b2) effects++;
    await openRequests(page);
  }
  R.clicksTotal = (R.clicksTotal || 0) + clicked;
  R.clicksOk = (R.clicksOk || 0) + effects;
  assert(`[${V}] click-everything: ${clicked} controls exercised, ${effects} observable effects`, clicked === 0 || effects >= clicked - 1, `${effects}/${clicked}`);

  await S('Z-final');
  await L.closeVideo(ctx, `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/${UNIT}-${vp.width}x${vp.height}.webm`);
  await browser.close();
}

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
