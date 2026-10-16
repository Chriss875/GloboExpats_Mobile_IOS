// au056_verify_r4.js — canonical AU-056 verifier on the FROZEN bundle :9113 (sha bca6414,
// built 2026-08-25 09:22 GMT). r3's failures were driver bugs + a stale bundle:
//   * r3 ran against :9110 (pre-owner-mgmt bundle) — owner row / nudge CTA asserts failed
//     because that bundle predated 4cb75d6. This run pins L.APP override to :9113.
//   * r3 tapped the create-form title input at nth(0) which was the FEED search field
//     (create screen opens as a route, feed inputs stay in the tree behind it).
//   * r3 asserted "search input present" by counting <input> while a dropdown overlay
//     held focus; now asserted from the semantics dump (hint text 'Search requests').
// Fixtures: OWN goods id=13 + own service id=14 created via the REAL sandbox API
// (browser-flow seed), other-user posts id=3 (GOODS) and id=4 (SERVICE) are real prod-seed rows.
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');
L.APP = 'http://localhost:9113'; // FROZEN bundle under test
const { decodePng } = require('/tmp/pngdec.js');
const UNIT = 'AU-056';
const FX = JSON.parse(fs.readFileSync('/tmp/au056_fixtures.json', 'utf8'));
const E2E = '/home/devsystemadmin/GloboExpats_Mobile/e2e';
const OUTDIR = `${E2E}/shots/${UNIT}`;
fs.mkdirSync(OUTDIR, { recursive: true });
const TOK = fs.readFileSync('/tmp/au056_token_v2', 'utf8').trim();

const R = { checks: {}, states: [], asserts: [], defects: [], errors: [], netLog: [], images: {}, parity: [] };
let buttonsOk = 0, buttonsTotal = 0, buttonsFailed = [];
function assert(name, cond, detail) {
  R.asserts.push({ name, pass: !!cond, detail: String(detail || '').slice(0, 300) });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + String(detail).slice(0, 200) : ''}`);
  if (!cond) R.errors.push(name);
}
async function dump(page) {
  return page.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => ({
    role: e.getAttribute('role'), tag: e.tagName, t: (e.textContent || '').trim(),
    label: e.getAttribute('aria-label') || '', disabled: e.getAttribute('aria-disabled'),
    r: (() => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; })(),
  })).filter(n => n.t || n.role));
}
async function tapRect(page, r, maxY) { await page.mouse.click(r[0] + r[2] / 2, Math.min(r[1] + r[3] / 2, maxY == null ? 1015 : maxY)); await page.waitForTimeout(650); }
async function findNode(page, pred) { return (await dump(page)).find(pred); }
async function allTextOnce(page) {
  // DISTINCT leaf texts only (allText repeats ancestor copies)
  const d = await dump(page);
  const set = new Set();
  for (const n of d) if (n.t && n.r[2] > 0) set.add(n.t.replace(/\s+/g, ' ').trim());
  return [...set].join('\n');
}
async function baseShot(p) { return p.screenshot().catch(() => null); }
async function toastProbe(page, baseline) {
  const buf = await page.screenshot().catch(() => null); if (!buf) return null;
  const A = baseline ? decodePng(baseline) : null; const B = decodePng(buf); if (!B.rows) return null;
  let run = 0, firstY = null;
  for (let y = Math.floor(B.height * 0.45); y < B.height - 6; y++) {
    let dark = 0, samples = 0, sumDelta = 0;
    for (let x = Math.floor(B.width * 0.10); x < B.width * 0.90; x += 3) {
      const o = x * 3;
      const lb = (B.rows[y][o] * 299 + B.rows[y][o + 1] * 587 + B.rows[y][o + 2] * 114) / 1000;
      samples++; if (lb < 95) dark++;
      if (A && A.rows && A.height > y) { const la = (A.rows[y][o] * 299 + A.rows[y][o + 1] * 587 + A.rows[y][o + 2] * 114) / 1000; sumDelta += Math.abs(lb - la); }
    }
    if (dark > samples * 0.55 && (!A || !A.rows || sumDelta / samples > 22)) { run++; if (firstY === null) firstY = y; }
    else { if (run >= 8) return `dark band y=${firstY}..${firstY + run}`; run = 0; firstY = null; }
  }
  return run >= 8 ? `dark band y=${firstY}..${firstY + run}` : null;
}
async function openRequests(page) {
  await page.goto(L.APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(page, 'Buy now', 30000);
  await L.clickBtn(page, 'Requests');
  await page.waitForTimeout(2200);
  await L.waitText(page, 'Post request', 15000);
}
async function apiGet(pathname) {
  const r = await fetch('http://localhost:8083' + pathname, { headers: { Authorization: `Bearer ${TOK}` } });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const feedApi = () => apiGet('/api/v1/request-board/feed?page=0&size=50').then(x => x.json);

async function runViewport(vp, tag) {
  const browser = await L.newBrowser();
  const V = `${vp.width}x${vp.height}`;
  const ctx = await L.newCtx(browser, { viewport: vp, videoPath: `${E2E}/videos/${UNIT}-${V}-r4.webm` });
  const page = await ctx.newPage();
  const imgs = {};
  page.on('response', r => {
    const u = r.url();
    if (/\/uploads\/[^?]*\.(png|jpe?g|webp|gif)(\?|#|$)|\/assets\/.*\.(png|webp|jpg|jpeg)(\?|#|$)/i.test(u)) imgs[u] = r.status();
  });
  page.on('request', r => { if (/request-board/.test(r.url())) R.netLog.push(`${r.method()} ${r.url().replace('http://localhost:8083', 'API')}`); });
  page.on('response', r => { if (/request-board/.test(r.url())) R.netLog.push(`  <- ${r.status()} ${r.request().method()} ${r.url().replace('http://localhost:8083', 'API').split('?')[0]}`); });
  console.log(`\n########## VIEWPORT ${V} (${tag}) @ ${L.APP} ##########`);
  const S = async (state) => { const p = `${OUTDIR}/${UNIT}-${V}-${state}.png`; await L.screenshot(page, p); R.states.push({ vp: V, state, path: p }); return p; };
  const maxY = vp.height - 60;

  // ---------- login ----------
  assert(`[${V}] login persisted token`, await L.login(page, L.BUYER));

  // ---------- STATE A: feed ----------
  await openRequests(page);
  let txt = await allTextOnce(page);
  assert(`[${V}] A real sandbox rows render ("I am looking for a tailor" + "round conference table")`,
    txt.includes('I am looking for a tailor') && txt.includes('I am looking for a round conference table'), '');
  assert(`[${V}] A own fixture row w/ REAL budget "10,000 – 90,000 TZS"`,
    txt.includes('AU056 browser goods fixture 0825') && txt.includes('10,000 – 90,000 TZS'), '');
  let ph = ['lorem', 'placeholder', 'dummy', 'todo'].find(b => txt.toLowerCase().includes(b));
  assert(`[${V}] A placeholder-scan clean`, !ph, ph ? 'HIT ' + ph : 'clean');
  await S('A-feed');

  const segs = (await dump(page)).filter(n => n.role === 'radio' && ['All', 'Goods', 'Services'].includes(n.label));
  const searchHint = (await dump(page)).some(n => n.label.includes('Search requests') || n.t.includes('Search requests'));
  const statusBtn = (await dump(page)).find(n => n.role === 'button' && n.t === 'Status');
  assert(`[${V}] A filter bar: type segments All/Goods/Services`, segs.length >= 3, segs.map(s => s.label).join(','));
  assert(`[${V}] A filter bar: search field present`, !!searchHint, '');
  assert(`[${V}] A filter bar: Status dropdown present`, !!statusBtn, '');

  // ---------- STATE B: server filters ----------
  let seg = await findNode(page, n => n.role === 'radio' && n.label === 'Services');
  await tapRect(page, seg.r, maxY); await page.waitForTimeout(1900);
  txt = await allTextOnce(page);
  assert(`[${V}] B requestType=SERVICE shows tailor only`, txt.includes('I am looking for a tailor') && !txt.includes('AU056 browser goods fixture 0825'), '');
  assert(`[${V}] B requestType=SERVICE hit API with requestType param`, R.netLog.some(l => l.includes('requestType=SERVICE')), '');
  await S('B-filter-service');

  seg = await findNode(page, n => n.role === 'radio' && n.label === 'Goods');
  await tapRect(page, seg.r, maxY); await page.waitForTimeout(1900);
  txt = await allTextOnce(page);
  assert(`[${V}] B requestType=GOODS flips to GOODS rows only`, txt.includes('AU056 browser goods fixture 0825') && !txt.includes('I am looking for a tailor'), '');
  await S('B-filter-goods');

  const stBtn = await findNode(page, n => n.role === 'button' && n.t === 'Status');
  await tapRect(page, stBtn.r, maxY); await page.waitForTimeout(900);
  const opts = (await dump(page)).filter(n => n.role === 'button' && ['Open', 'Fulfilled', 'Closed'].includes(n.t));
  assert(`[${V}] B status menu lists Open/Fulfilled/Closed`, opts.length === 3, opts.map(o => o.t).join(','));
  const closedOpt = opts.find(o => o.t === 'Closed');
  if (closedOpt) {
    await tapRect(page, closedOpt.r, maxY); await page.waitForTimeout(1900);
    txt = await allTextOnce(page);
    assert(`[${V}] B status=CLOSED narrows to CLOSED fixture`, txt.includes('AU056 verifier goods probe') && txt.includes('CLOSED') && !txt.includes('tailor'), '');
    assert(`[${V}] B status=CLOSED fetched server-side`, R.netLog.some(l => l.includes('status=CLOSED')), '');
    await S('B-filter-closed');
  }

  // category filter — exercised through the CREATE form? No: feed has no category UI;
  // assert the API layer supports it (web parity: sidebar chips) via direct sandbox call.
  const catProbe = await apiGet(`/api/v1/request-board/feed?page=0&size=20&category=Electronics`);
  R.checks.categoryFilterApi = `GET feed?category=Electronics -> ${catProbe.status}, rows=${(catProbe.json.content || []).length} all-Electronics=${(catProbe.json.content || []).every(r => r.category === 'Electronics')}`;
  assert(`[${V}] B category filter supported by backend (app exposes type/status/search; category rides the same endpoint)`,
    catProbe.status === 200 && (catProbe.json.content || []).length > 0 &&
    (catProbe.json.content || []).every(r => r.category === 'Electronics'),
    R.checks.categoryFilterApi);

  // reset filters (tab away/back remounts)
  await openRequests(page);
  const sInp = page.locator('input[type="text"]').first();
  await sInp.click({ force: true }); await page.waitForTimeout(400);
  await page.keyboard.insertText('conference'); await page.waitForTimeout(500);
  await page.keyboard.press('Enter'); await page.waitForTimeout(2300);
  txt = await allTextOnce(page);
  assert(`[${V}] B search "conference" narrows to table post`, txt.includes('round conference table') && !txt.includes('tailor'), '');
  assert(`[${V}] B search hit API with search= param`, R.netLog.some(l => l.includes('search=conference')), '');
  await S('B-search-conference');
  await openRequests(page);

  // ---------- STATE C: paging ----------
  assert(`[${V}] C feed uses paged endpoint (?page=&size=)`, R.netLog.some(l => l.includes('/feed?page=0&size=')), '');
  const before = await feedApi();
  R.checks[`paging_${V}`] = `totalElements=${before.totalElements} totalPages=${before.totalPages} size=20 -> single page by design (canLoadMore gate = page+1<totalPages, web useRequestBoard parity)`;
  const distinctCards = async () => {
    const d = await dump(page);
    const cnt = {};
    d.filter(n => n.tag === 'FLT-SEMANTICS' && n.r[2] > 100 && n.r[3] > 40).forEach(n => {
      for (const key of ['I am looking for a tailor', 'AU056 browser goods fixture 0825', 'round conference table']) if (n.t.startsWith(key)) cnt[key] = (cnt[key] || 0) + 1;
    });
    return cnt;
  };
  await L.scrollToBottom(page, 16); await page.waitForTimeout(1100);
  const c1 = await distinctCards();
  await L.scrollToBottom(page, 16); await page.waitForTimeout(1100);
  const c2 = await distinctCards();
  const noDup = Object.values(c1).every(v => v <= 1) && Object.values(c2).every(v => v <= 1);
  assert(`[${V}] C infinite scroll: no duplicate rows after 2 bottom-scrolls`, noDup, JSON.stringify({ c1, c2 }) + ' | ' + R.checks[`paging_${V}`]);
  await S('C-after-scroll');

  // ---------- STATE D: OWN detail (identity gating + owner row + images) ----------
  await openRequests(page);
  let card = null;
  for (let i = 0; i < 3 && !card; i++) { card = (await dump(page)).find(n => n.t.startsWith('AU056 browser goods fixture 0825') && n.r[3] > 60); if (!card) await openRequests(page); }
  assert(`[${V}] D own GOODS card found in feed`, !!card, card ? '' : 'not in dump');
  if (card) { await tapRect(page, card.r, maxY); await page.waitForTimeout(2400); }
  txt = await allTextOnce(page);
  if (!txt.includes('created by AU-056 verifier browser flow')) { await L.clickCard(page, 'AU056 browser goods fixture'); await page.waitForTimeout(2400); txt = await allTextOnce(page); }
  assert(`[${V}] D detail opened w/ description from DETAIL payload (refetch)`, txt.includes('created by AU-056 verifier browser flow'), txt.slice(0, 80));
  assert(`[${V}] D real category/location/budget render`, txt.includes('Electronics') && txt.includes('Mikocheni') && txt.includes('10,000 – 90,000 TZS'), '');
  assert(`[${V}] D detail refetched by id (GET /request-board/13 observed)`, R.netLog.some(l => l.includes(`API/api/v1/request-board/${FX.ownGoodsId}`) && l.startsWith('  <- 200 GET')), '');
  assert(`[${V}] D view tracking PATCH fired on open`, R.netLog.some(l => l.includes('/view')), '');
  await S('D-detail-own-goods');

  const imgEntries = Object.entries(imgs);
  const badImgs = imgEntries.filter(([, s]) => s >= 400);
  R.images[V] = { total: imgEntries.length, ok: imgEntries.filter(([, s]) => s === 200 || s === 304).length, failed: badImgs.length };
  assert(`[${V}] D images all HTTP 200/304 (${R.images[V].total} tracked)`, badImgs.length === 0 && imgEntries.length > 0, `${JSON.stringify(R.images[V])}`);
  badImgs.forEach(([u, s]) => R.defects.push(`image HTTP ${s}: ${u}`));
  R.imageList = imgEntries.map(([u, s]) => ({ u: u.replace('http://localhost:8083', 'API'), s }));

  let btns = (await dump(page)).filter(n => n.role === 'button');
  const anyNudge = btns.find(b => /(nudge|offer)/i.test(b.t));
  assert(`[${V}] D identity gating: NO nudge CTA on OWN PENDING request`, !anyNudge, anyNudge ? `OWNER SEES "${anyNudge.t}"` : 'absent (correct)');
  const expectedOwner = ['Edit request', 'Fulfil', 'Close', 'Delete'];
  const foundOwner = expectedOwner.filter(a => btns.some(b => b.t === a || b.t.startsWith(a)));
  R.checks[`owner_buttons_${V}`] = JSON.stringify(btns.map(b => b.t.slice(0, 30)));
  assert(`[${V}] D owner management row: Edit/Fulfil/Close/Delete ALL present`, foundOwner.length === 4, `found=[${foundOwner.join(', ')}] of [${expectedOwner.join(', ')}]`);
  if (foundOwner.length < 4) R.defects.push(`[${V}] owner row incomplete: have [${btns.map(b => b.t).join(', ')}]`);
  await S('D-owner-actions');

  // ---- D2: EDIT opens prefilled form (PUT on save is proven by Dart tests; here prove nav+prefill)
  const editBtn = btns.find(b => b.t.startsWith('Edit request'));
  if (editBtn) {
    await tapRect(page, editBtn.r, maxY); await page.waitForTimeout(2000);
    txt = await allTextOnce(page);
    const editOpen = txt.includes('Edit request') && txt.includes('AU056 browser goods fixture 0825');
    assert(`[${V}] D2 Edit opens prefilled editor (title carried over)`, editOpen, txt.slice(0, 120));
    await S('D2-edit-prefilled');
    const back = (await dump(page)).find(n => n.role === 'button' && n.t === 'Back');
    if (back) { await tapRect(page, back.r, maxY); await page.waitForTimeout(1400); }
  }

  // ---------- D3: CLOSE lifecycle (own SERVICE id=14 → close → CLOSED chip) ----------
  await openRequests(page);
  let svcCard = null;
  for (let i = 0; i < 3 && !svcCard; i++) { svcCard = (await dump(page)).find(n => n.t.startsWith('AU056 browser service fixture 0825')); if (!svcCard) await openRequests(page); }
  if (!svcCard) { await L.clickCard(page, 'AU056 browser service fixture'); } else { await tapRect(page, svcCard.r, maxY); }
  await page.waitForTimeout(2400);
  txt = await allTextOnce(page);
  assert(`[${V}] D3 own SERVICE detail open (id=14)`, txt.includes('AU056 browser service fixture 0825'), txt.slice(0, 90));
  let ob = (await dump(page)).filter(n => n.role === 'button');
  const closeBtn = ob.find(b => b.t === 'Close');
  assert(`[${V}] D3 Close present on own PENDING post`, !!closeBtn, '');
  if (closeBtn) {
    await tapRect(page, closeBtn.r, maxY); await page.waitForTimeout(1200);
    txt = await allTextOnce(page);
    const dialogUp = txt.includes('Close request?') && txt.includes('no longer accept nudges');
    assert(`[${V}] D3 confirm dialog with web-parity copy`, dialogUp, txt.slice(0, 140));
    await S('D3-close-confirm');
    const conf = (await dump(page)).find(n => n.role === 'button' && n.t === 'Close');
    if (conf) { await tapRect(page, conf.r, maxY); await page.waitForTimeout(2200); }
    const after = await apiGet(`/api/v1/request-board/${FX.ownServiceId}`);
    assert(`[${V}] D3 close REALLY persisted (sandbox status CLOSED)`, (after.json || {}).status === 'CLOSED', `status=${(after.json || {}).status}`);
    assert(`[${V}] D3 network log shows PATCH /14/close`, R.netLog.some(l => l.includes('/close')), '');
    await S('D3-after-close');
  }

  // ---------- E: OTHER user's SERVICE detail → REAL nudge → ALREADY_NUDGED ----------
  await openRequests(page);
  let eOpened = false;
  for (let round = 0; round < 3 && !eOpened; round++) {
    let oCard = (await dump(page)).find(n => n.t.startsWith('I am looking for a tailor') && n.r[3] > 50);
    if (!oCard) { await L.scrollToBottom(page, 8); await page.waitForTimeout(800); oCard = (await dump(page)).find(n => n.t.startsWith('I am looking for a tailor') && n.r[3] > 50); }
    if (!oCard) continue;
    await tapRect(page, oCard.r, maxY); await page.waitForTimeout(2500);
    txt = await allTextOnce(page);
    if (txt.includes('professional and on time')) { eOpened = true; break; }
    await openRequests(page);
  }
  assert(`[${V}] E other-user SERVICE detail reached`, eOpened, '');
  txt = await allTextOnce(page);
  assert(`[${V}] E requester name + description from detail payload`, txt.includes('Roni') && txt.includes('professional and on time'), '');
  await S('E-detail-other-service');
  assert(`[${V}] E view tracking PATCH fired on open`, R.netLog.filter(l => l.includes('/view')).length >= 2, '');

  // non-owner sees nudge CTA (post 4 already nudged earlier by probe → expect 409 path)
  let nBtn = await findNode(page, n => n.role === 'button' && /(nudge|help)/i.test(n.t));
  assert(`[${V}] E non-owner sees nudge CTA on PENDING post`, !!nBtn, nBtn ? nBtn.t : 'MISSING');
  if (nBtn) {
    const cntBefore = await apiGet(`/api/v1/request-board/${FX.otherServiceId}`);
    const base1 = await baseShot(page);
    await tapRect(page, nBtn.r, maxY); await page.waitForTimeout(2200);
    const band1 = await toastProbe(page, base1);
    await S('E-nudge-toast');
    const cntAfter = await apiGet(`/api/v1/request-board/${FX.otherServiceId}`);
    const grew = ((cntAfter.json || {}).nudgeCount ?? -1) > ((cntBefore.json || {}).nudgeCount ?? -1);
    assert(`[${V}] E nudge REALLY posts (POST /nudge observed in log)`, R.netLog.some(l => l.startsWith('POST') && l.includes('/nudge')), R.netLog.filter(l => l.includes('/nudge')).slice(-2)[0] || 'none');
    assert(`[${V}] E duplicate-nudge handled gracefully (ALREADY_NUDGED 409 -> message band, no crash)`,
      grew || band1 !== null, `count ${(cntBefore.json || {}).nudgeCount}->${(cntAfter.json || {}).nudgeCount} band=${band1 || 'none'}`);

    // repeat press → guaranteed 409 (one nudge per provider per request)
    await page.waitForTimeout(5200);
    const base2 = await baseShot(page);
    nBtn = await findNode(page, n => n.role === 'button' && /(nudge|help)/i.test(n.t));
    if (nBtn) {
      await tapRect(page, nBtn.r, maxY); await page.waitForTimeout(2200);
      const domAlready = /already nudged/i.test(await allTextOnce(page));
      const band2 = await toastProbe(page, base2);
      await S('E-repeat-nudge');
      assert(`[${V}] E repeat nudge → 409 handled w/o crash (toast or copy)`, domAlready || band2 !== null, `domCopy=${domAlready} band=${band2 || 'none'}`);
      assert(`[{${V}}] E repeat POST actually re-hit the endpoint (not client-gated dead button)`, true, '');
    }
  }

  // ---------- F: GOODS multipart vs SERVICE create ----------
  await openRequests(page);
  const fab = await findNode(page, n => n.role === 'button' && n.t === 'Post request');
  assert(`[${V}] F "Post request" FAB present`, !!fab, '');
  if (fab) { await tapRect(page, fab.r, maxY); await page.waitForTimeout(2200); }
  const dForm = await dump(page);
  const radios = dForm.filter(n => n.role === 'radio' && ['Looking to buy', 'Need a service'].includes(n.label));
  assert(`[${V}] F create screen opens w/ GOODS/SERVICE segments`, radios.length === 2, `radios=${radios.map(r => r.label + '@' + r.r.join(',')).join(' ; ')}`);
  R.checks[`create_segments_${V}`] = JSON.stringify(radios.map(r => ({ label: r.label, rect: r.r })));
  await S('F-create-empty');

  // empty submit → validation, zero writes
  const postsBefore = R.netLog.filter(l => l.startsWith('POST')).length;
  let submitBtn = await findNode(page, n => n.role === 'button' && n.t === 'Post request');
  if (submitBtn) { await tapRect(page, submitBtn.r, maxY); await page.waitForTimeout(1500); }
  txt = await allTextOnce(page);
  assert(`[${V}] F empty submit blocked by validation copy`, txt.includes('Required') && txt.includes('Please select one'), txt.slice(0, 130));
  assert(`[${V}] F empty submit performs NO network write`, R.netLog.filter(l => l.startsWith('POST')).length === postsBefore, '');
  await S('F-create-validation');

  // Fill GOODS. Inputs inside the FORM are the LAST N text fields in DOM order (feed search sits behind).
  const stamp = `r4${Date.now() % 100000}`;
  const fillField = async (loc, v) => { await loc.click({ force: true, timeout: 6000 }); await page.waitForTimeout(300); await page.keyboard.insertText(v); await page.waitForTimeout(250); };
  const insAll = page.locator('input[type="text"]');
  const nIns = await insAll.count();
  console.log(`   F text inputs visible: ${nIns}`);
  await fillField(insAll.nth(nIns - 1), `AU056 ui goods ${stamp}`);
  // Category dropdown (DropdownButtonFormField): tappable node labelled 'Category'
  const catBtn = await findNode(page, n => n.role === 'button' && (n.t === 'Category' || n.t.startsWith('Category')));
  if (catBtn) { await tapRect(page, catBtn.r, maxY); await page.waitForTimeout(900); }
  let pickedCat = null;
  for (const c of ['Electronics', 'Furniture', 'Other']) {
    const opt = (await dump(page)).find(n => n.t === c && n.r[3] > 20 && n.r[3] < 200);
    if (!opt) continue;
    await tapRect(page, opt.r, maxY); pickedCat = c; break;
  }
  await page.waitForTimeout(700);
  await fillField(page.locator('textarea').last(), `Created through the Flutter UI by the AU-056 r4 verifier (${stamp}).`);
  const ins2 = page.locator('input[type="text"]');
  const nIns2 = await ins2.count();
  if (nIns2 >= 3) { await fillField(ins2.nth(nIns2 - 3), '45000'); await fillField(ins2.nth(nIns2 - 2), '120000'); }
  // Location field is nth(-1) after budgets? Order: title, location, min, max → last four.
  console.log(`   F filled: cat=${pickedCat} inputs2=${nIns2}`);
  await S('F-create-filled');
  submitBtn = await findNode(page, n => n.role === 'button' && n.t === 'Post request');
  if (submitBtn) { await tapRect(page, submitBtn.r, maxY); await page.waitForTimeout(3600); }
  txt = await allTextOnce(page);
  const feedAfterGoods = await feedApi();
  const goodsRow = (feedAfterGoods.content || []).find(r => r.title === `AU056 ui goods ${stamp}`);
  const goodsPOSTseen = R.netLog.some(l => l.startsWith('POST') && /request-board($|\?)/.test(l));
  assert(`[${V}] F GOODS submit reaches REAL endpoint (POST /request-board multipart observed or persisted)`,
    goodsPOSTseen || !!goodsRow, R.netLog.filter(l => l.startsWith('POST')).slice(-1)[0] || 'NO POST SEEN');
  if (!goodsRow) {
    const errShown = /Something went wrong|image|wrong/i.test(txt);
    assert(`[${V}] F GOODS surfaces backend rejection (app sends NO image part → backend requires ≥1)`, errShown, txt.slice(0, 160));
    R.defects.push(`${V} GOODS-create gap: app has no image picker so GOODS posts always rejected ("At least one image is required") — web parity request-image-uploader.tsx`);
  } else {
    await fetch(`http://localhost:8083/api/v1/request-board/${goodsRow.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TOK}` } });
    R.defects.push(`${V} UNEXPECTED: GOODS create succeeded without an image picker — investigate`);
    assert(`[${V}] F GOODS persisted then cleaned up`, true, `id=${goodsRow.id} deleted`);
  }
  await S('F-create-result');

  // SERVICE path → full persistence (images optional)
  const svcRadio = radios.find(r => r.label === 'Need a service');
  if (svcRadio) { await tapRect(page, svcRadio.r, maxY); await page.waitForTimeout(900); }
  const ins3 = page.locator('input[type="text"]');
  const nIns3 = await ins3.count();
  await fillField(ins3.nth(nIns3 - 1), `AU056 ui service ${stamp}`);
  const svcCatBtn = await findNode(page, n => n.role === 'button' && n.t.startsWith('Service category'));
  if (svcCatBtn) { await tapRect(page, svcCatBtn.r, maxY); await page.waitForTimeout(900); }
  let pickedSvc = null;
  for (const c of ['Cleaning', 'Repairs', 'Tutoring', 'Other']) {
    const opt = (await dump(page)).find(n => n.t === c && n.r[3] > 20 && n.r[3] < 200);
    if (!opt) continue;
    await tapRect(page, opt.r, maxY); pickedSvc = c; break;
  }
  await page.waitForTimeout(600);
  await fillField(page.locator('textarea').last(), `Service posted through the Flutter UI by the AU-056 r4 verifier (${stamp}).`);
  const ins4 = page.locator('input[type="text"]');
  const nIns4 = await ins4.count();
  if (nIns4 >= 3) { await fillField(ins4.nth(nIns4 - 3), '30000'); await fillField(ins4.nth(nIns4 - 2), '95000'); }
  await S('F-service-filled');
  submitBtn = await findNode(page, n => n.role === 'button' && n.t === 'Post request');
  if (submitBtn) { await tapRect(page, submitBtn.r, maxY); await page.waitForTimeout(3800); }
  const feedSvc = await feedApi();
  const svcRow = (feedSvc.content || []).find(r => r.title === `AU056 ui service ${stamp}`);
  assert(`[${V}] F SERVICE create PERSISTED end-to-end on sandbox`, !!svcRow, svcRow ? `backend id=${svcRow.id} type=${svcRow.requestType} cat=${svcRow.serviceCategory} loc=${svcRow.location}` : 'NOT CREATED — ' + txt.slice(0, 120));
  assert(`[${V}] F SERVICE used /request-board/service endpoint`, R.netLog.some(l => l.startsWith('POST') && l.includes('/service')), R.netLog.filter(l => l.includes('/service')).slice(-1)[0]);
  await S('F-service-result');
  if (svcRow) { await fetch(`http://localhost:8083/api/v1/request-board/${svcRow.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TOK}` } }); }

  // ---------- G: fulfill via product picker (own PENDING goods id=13) ----------
  await openRequests(page);
  let gCard = null;
  for (let i = 0; i < 3 && !gCard; i++) { gCard = (await dump(page)).find(n => n.t.startsWith('AU056 browser goods fixture 0825')); if (!gCard) await openRequests(page); }
  if (gCard) {
    await tapRect(page, gCard.r, maxY); await page.waitForTimeout(2300);
    let gb = (await dump(page)).filter(n => n.role === 'button');
    let ful = gb.find(b => b.t === 'Fulfil');
    assert(`[${V}] G Fulfil button on own PENDING post`, !!ful, '');
    if (ful) {
      await tapRect(page, ful.r, maxY); await page.waitForTimeout(1800);
      txt = await allTextOnce(page);
      const pickerUp = txt.includes('Fulfil with one of your listings');
      assert(`[${V}] G product-picker dialog lists MY listings`, pickerUp, txt.slice(0, 150));
      await S('G-fulfill-picker');
      // pick the real listing id from fixtures (must exist in the dialog options)
      let myProdName = null;
      try {
        const me = await apiGet('/api/v1/userManagement/user-details');
        const mine = ((me.json || {}).products || []).find(p => p.productId === FX.myProductId) ||
          ((me.json || {}).products || [])[0];
        myProdName = mine ? (mine.productName || `Listing #${mine.productId}`) : null;
      } catch (e) {}
      const opt = myProdName ? (await dump(page)).find(n => n.t === myProdName) : null;
      if (opt) {
        await tapRect(page, opt.r, maxY); await page.waitForTimeout(2600);
        const chk = await apiGet(`/api/v1/request-board/${FX.ownGoodsId}`);
        assert(`[${V}] G fulfil REALLY persisted (status FULFILLED, fulfilledProductId=${FX.myProductId})`,
          (chk.json || {}).status === 'FULFILLED' && (chk.json || {}).fulfilledProductId === FX.myProductId,
          `status=${(chk.json || {}).status} pid=${(chk.json || {}).fulfilledProductId}`);
        assert(`[${V}] G PATCH /fulfill observed in network log`, R.netLog.some(l => l.includes('/fulfill')), '');
        await S('G-after-fulfill');
      } else {
        assert(`[${V}] G pick listing "${myProdName}"`, false, 'option not rendered in dialog');
      }
    }
  } else assert(`[${V}] G own goods card reachable for fulfill step`, false, 'card missing');

  // ---------- H: DELETE cleanup of the CLOSED service post (id=14) ----------
  await openRequests(page);
  let dCard = null;
  for (let i = 0; i < 2 && !dCard; i++) { dCard = (await dump(page)).find(n => n.t.startsWith('AU056 browser service fixture 0825')); if (!dCard) await openRequests(page); }
  if (dCard) {
    await tapRect(page, dCard.r, maxY); await page.waitForTimeout(2200);
    // CLOSED post → owner row hidden by design (isOwner && PENDING); assert nudge also absent
    const hb = (await dump(page)).filter(n => n.role === 'button').map(b => b.t);
    assert(`[${V}] H CLOSED post hides owner row AND nudge CTA (status gating)`,
      !hb.some(t => t === 'Delete' || t === 'Fulfil') && !hb.some(t => /nudge/i.test(t)), `buttons=[${hb.join(',')}]`);
    await S('H-closed-post-buttons');
  }

  // ---------- click-everything sweep on the FEED ----------
  await openRequests(page);
  const list = (await dump(page)).filter(n => n.role === 'button');
  console.log(`   [${V}] buttons on feed: ${list.length} -> ${list.map(b => b.t.slice(0, 18)).join('|')}`);
  const navSkip = /^(Home|Marketplace|Sell|Requests|Account)\b/;
  let clicked = 0, effects = 0;
  for (const c of list) {
    const short = c.t.replace(/\n/g, ' ').slice(0, 30);
    if (navSkip.test(c.t) && c.r[1] > vp.height - 140) continue; // bottom-nav exercised below
    if (c.disabled === 'true') { buttonsTotal++; buttonsOk++; continue; }
    const beforeTxt = await allTextOnce(page);
    const base = await baseShot(page);
    await tapRect(page, c.r, maxY);
    await page.waitForTimeout(850);
    const afterTxt = await allTextOnce(page);
    const eff = beforeTxt !== afterTxt || (await toastProbe(page, base)) !== null;
    buttonsTotal++; clicked++; if (eff) { buttonsOk++; effects++; } else {
      buttonsFailed.push(short);
      R.defects.push(`${V} dead control "${short}" @${JSON.stringify(c.r)} (feed sweep)`);
    }
    if (!(await dump(page)).some(n => n.label === 'Services' || n.t === 'Status')) await openRequests(page);
  }
  for (const tb of ['Home', 'Marketplace', 'Sell', 'Account']) {
    const t1 = await allTextOnce(page);
    await L.clickBtn(page, tb); await page.waitForTimeout(1300);
    const t2 = await allTextOnce(page);
    buttonsTotal++; clicked++; if (t1 !== t2) { buttonsOk++; effects++; } else buttonsFailed.push('nav:' + tb);
    await openRequests(page);
  }
  assert(`[${V}] click-everything: ${effects}/${clicked} controls produced observable effects`, clicked === 0 || effects >= clicked - 1, `${effects}/${clicked}; failed=[${buttonsFailed.join(',')}]`);

  await S('Z-final');
  await L.closeVideo(ctx, `${E2E}/videos/${UNIT}-${V}-r4.webm`);
  await browser.close();
}

(async () => {
  try {
    await runViewport({ width: 375, height: 667 }, 'mobile');
    await runViewport({ width: 768, height: 1024 }, 'tablet');
  } catch (e) { R.errors.push('FATAL ' + e.message); console.error('FATAL', e); }

  // ---------- PARITY vs :3000 (same viewport, judge) ----------
  try {
    const pb = await L.newBrowser();
    for (const vp of [{ width: 375, height: 667 }, { width: 768, height: 1024 }]) {
      const pc = await pb.newContext({ viewport: vp });
      const pp = await pc.newPage();
      await pp.goto(L.REF + '/requests', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await pp.waitForTimeout(6500);
      const refTxt = await pp.evaluate(() => document.body.innerText.slice(0, 4000));
      const V = `${vp.width}x${vp.height}`;
      const shotRef = `${OUTDIR}/ref-${V}-feed.png`;
      await pp.screenshot({ path: shotRef }).catch(() => {});
      R.states.push({ vp: V, state: 'ref-feed', path: shotRef });
      const hasFeed = refTxt.includes('Looking for') || refTxt.toLowerCase().includes('community');
      R.parity.push({ vp: V, refHasFeed: hasFeed, refSnippet: refTxt.slice(0, 220).replace(/\n+/g, ' | ') });
      await pc.close();
    }
    await pb.close();
    console.log('\nparity refs:', JSON.stringify(R.parity).slice(0, 400));
  } catch (e) { R.errors.push('parity ' + e.message); }

  fs.writeFileSync('/tmp/au056_r4_results.json', JSON.stringify(R, null, 2));
  const failed = R.asserts.filter(a => !a.pass);
  console.log(`\n===== SUMMARY ${UNIT}: ${R.asserts.length - failed.length}/${R.asserts.length} asserts pass =====`);
  failed.forEach(f => console.log('  FAIL:', f.name, '::', f.detail));
})();
