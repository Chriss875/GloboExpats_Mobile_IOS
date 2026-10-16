// au056_verify_r5.js — canonical AU-056 verifier, FROZEN bundle :9113 (sha bca6414).
// r4's 29 failures traced to ONE harness bug: lib_verify.login() closes over the
// module-local APP const (:9100) so L.APP=':9113' only changed the exported copy —
// r4 logged in on :9100 then navigated on :9113 (different origin => empty
// localStorage => app booted ANONYMOUS on :9113; public feed still 200 but every
// authed call 302->OAuth). r5 pins the origin in a local APP const used everywhere
// AND pre-seeds the token via addInitScript so reloads can never lose the session.
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9113';           // LOCAL const — never the lib's
const UNIT = 'AU-056';
const E2E = '/home/devsystemadmin/GloboExpats_Mobile/e2e';
const OUTDIR = `${E2E}/shots/${UNIT}`;
fs.mkdirSync(OUTDIR, { recursive: true });
fs.mkdirSync(`${E2E}/videos`, { recursive: true });
const FX = JSON.parse(fs.readFileSync('/tmp/au056_fixtures.json', 'utf8'));
const TOK = fs.readFileSync('/tmp/au056_token_v2', 'utf8').trim();
// token file holds a JSON string ("eyJ...") in some lanes — unwrap if needed
const TOKV = TOK.startsWith('"') ? JSON.parse(TOK) : TOK;

const R = { asserts: [], checks: {}, states: [], defects: [], errors: [], netLog: [], images: {}, parity: [] };
let buttonsTotal = 0, buttonsOk = 0; const buttonsFailed = [];
function assert(name, cond, detail) {
  R.asserts.push({ name, pass: !!cond, detail: String(detail || '').slice(0, 400) });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + String(detail).slice(0, 180) : ''}`);
  if (!cond) R.errors.push(name);
}
async function dump(page) {
  return page.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => ({
    role: e.getAttribute('role'), tag: e.tagName, t: (e.textContent || '').trim(),
    label: e.getAttribute('aria-label') || '', disabled: e.getAttribute('aria-disabled'),
    r: (() => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; })(),
  })).filter(n => n.t || n.role));
}
async function tapRect(page, r, maxY) { await page.mouse.click(r[0] + r[2] / 2, Math.min(r[1] + r[3] / 2, maxY)); await page.waitForTimeout(650); }
async function findNode(page, pred) { return (await dump(page)).find(pred); }
async function allTextOnce(page) {
  const d = await dump(page); const set = new Set();
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
function decodePng(buf) { return require('/tmp/pngdec.js').decodePng ? require('/tmp/pngdec.js').decodePng(buf) : require('/tmp/pngdec.js')(buf); }

async function apiGet(pathname) {
  const r = await fetch('http://localhost:8083' + pathname, { headers: { Authorization: `Bearer ${TOKV}` } });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const feedApi = () => apiGet('/api/v1/request-board/feed?page=0&size=50').then(x => x.json);

async function seedToken(page) {
  // Pre-seed session storage BEFORE any app script runs (reload-proof login).
  await page.addInitScript(([t]) => {
    try {
      localStorage.setItem('flutter.auth_token', JSON.stringify(t));
      localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com'));
    } catch (e) {}
  }, [TOKV]);
}

async function gotoRequests(page) {
  await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(page, 'Buy now', 30000);
  await page.waitForTimeout(1200);
  const ok = await page.evaluate(() => !!localStorage.getItem('flutter.auth_token'));
  assert(`[${vp}] session token present after nav`, ok, '');
  await L.clickBtn(page, 'Requests');
  await L.waitText(page, 'Post request', 20000);
  await page.waitForTimeout(1800);
}
let vp = '';

async function runViewport(w, h, tag) {
  vp = `${w}x${h}`;
  const browser = await L.newBrowser();
  const ctx = await browser.newContext({ viewport: { width: w, height: h },
    recordVideo: { dir: `${E2E}/videos`, size: { width: w, height: h } } });
  const page = await ctx.newPage();
  await seedToken(page);
  const imgs = {};
  page.on('response', r => {
    const u = r.url();
    if (/\/uploads\/[^?]*\.(png|jpe?g|webp|gif)(\?|#|$)|\/assets\/.*\.(png|webp|jpg|jpeg)(\?|#|$)/i.test(u)) imgs[u] = r.status();
  });
  page.on('request', r => { if (/request-board/.test(r.url())) R.netLog.push(`${r.method()} ${r.url().replace('http://localhost:8083', 'API')}`); });
  page.on('response', async r => {
    if (/request-board/.test(r.url())) {
      let auth = '?';
      try { auth = !!(await r.request().headers())['authorization']; } catch (e) {}
      R.netLog.push(`  <- ${r.status()} ${r.request().method()} auth=${auth} ${r.url().replace('http://localhost:8083', 'API').split('?')[0]}`);
    }
    const u = r.url();
    if (/request-board\/(13|14|10|4|3)\b/.test(u)) {
      const key = u.replace(/^https?:\/\/localhost:\d+/, '').split('?')[0];
      imgs[key] = r.status(); // count API images too? no — keep separate below
    }
  });
  const S = async (state) => { const p = `${OUTDIR}/${UNIT}-${vp}-${state}.png`; await L.screenshot(page, p); R.states.push({ vp, state, path: p }); };
  const maxY = h - 40;

  // ---------- STATE A: feed ----------
  await gotoRequests(page);
  let txt = await allTextOnce(page);
  assert(`[${vp}] A real sandbox rows render (tailor + conference-table posts)`,
    txt.includes('I am looking for a tailor') && txt.includes('I am looking for a round conference table'), '');
  assert(`[${vp}] A own fixture row with REAL budget "10,000 – 90,000 TZS"`,
    txt.includes('AU056 browser goods fixture 0825') && txt.includes('10,000 – 90,000 TZS'), '');
  const ph = ['lorem', 'placeholder', 'dummy', 'todo'].find(b => txt.toLowerCase().includes(b));
  assert(`[${vp}] A placeholder-scan clean`, !ph, ph ? 'HIT ' + ph : 'clean');
  await S('A-feed');

  const segs = (await dump(page)).filter(n => n.role === 'radio' && ['All', 'Goods', 'Services'].includes(n.label));
  const searchHint = (await dump(page)).some(n => n.label.includes('Search requests') || n.t.includes('Search requests'));
  const statusBtn = (await dump(page)).find(n => n.role === 'button' && n.t === 'Status');
  assert(`[${vp}] A filter bar: type segments All/Goods/Services`, segs.length >= 3, segs.map(s => s.label).join(','));
  assert(`[${vp}] A filter bar: "Search requests" field present`, !!searchHint, '');
  assert(`[${vp}] A filter bar: Status dropdown present`, !!statusBtn, '');

  // ---------- STATE B: server filters ----------
  let seg = segs.find(n => n.label === 'Services');
  await tapRect(page, seg.r, maxY); await page.waitForTimeout(1900);
  txt = await allTextOnce(page);
  assert(`[${vp}] B requestType=SERVICE shows tailor only (own GOODS row gone)`,
    txt.includes('I am looking for a tailor') && !txt.includes('AU056 browser goods fixture 0825'), '');
  assert(`[${vp}] B hit API with requestType=SERVICE param`, R.netLog.some(l => l.includes('requestType=SERVICE')), '');
  await S('B-filter-service');

  seg = segs.find(n => n.label === 'Goods');
  await tapRect(page, seg.r, maxY); await page.waitForTimeout(1900);
  txt = await allTextOnce(`page` ? page : page);
  assert(`[${vp}] B requestType=GOODS flips to GOODS rows only`,
    txt.includes('AU056 browser goods fixture 0825') && !txt.includes('tailor'), '');
  await S('B-filter-goods');

  const stBtn = await findNode(page, n => n.role === 'button' && n.t === 'Status');
  await tapRect(page, stBtn.r, maxY); await page.waitForTimeout(900);
  const opts = (await dump(page)).filter(n => n.role === 'button' && ['Open', 'Fulfilled', 'Closed'].includes(n.t));
  assert(`[${vp}] B status menu lists Open/Fulfilled/Closed`, opts.length === 3, opts.map(o => o.t).join(','));
  const closedOpt = opts.find(o => o.t === 'Closed');
  if (closedOpt) {
    await tapRect(page, closedOpt.r, maxY); await page.waitForTimeout(1900);
    txt = await allTextOnce(page);
    assert(`[${vp}] B status=CLOSED narrows to CLOSED probe post id=10`,
      txt.includes('AU056 verifier goods probe') && !txt.includes('tailor'), '');
    assert(`[${vp}] B status=CLOSED fetched server-side (?status=CLOSED)`, R.netLog.some(l => l.includes('status=CLOSED')), '');
    await S('B-filter-closed');
  }
  // reset by remounting
  await gotoRequests(page);

  // category filter: backend-level proof (feed UI exposes type/status/search)
  const catProbe = await apiGet('/api/v1/request-board/feed?page=0&size=20&category=Electronics');
  assert(`[${vp}] B category param supported server-side (rows all Electronics)`,
    catProbe.status === 200 && (catProbe.json.content || []).length > 0 &&
    (catProbe.json.content || []).every(r => r.category === 'Electronics'),
    `GET feed?category=Electronics -> ${catProbe.status}, rows=${(catProbe.json.content || []).length}`);

  // neighbourhood/location filter: same treatment
  const locProbe = await apiGet('/api/v1/request-board/feed?page=0&size=20&location=Mikocheni');
  assert(`[${vp}] B location param supported server-side (all Mikocheni)`,
    locProbe.status === 200 && (locProbe.json.content || []).length > 0 &&
    (locProbe.json.content || []).every(r => (r.location || '').includes('Mikocheni')),
    `GET feed?location=Mikocheni -> ${locProbe.status}, rows=${(locProbe.json.content || []).length}`);

  // sort param: backend accepts it (UI has no sort control; web uses Relevance chips)
  const sortProbe = await apiGet('/api/v1/request-board/feed?page=0&size=20&sort=createdAt,desc');
  R.checks.sortParam = `GET feed?sort=createdAt,desc -> ${sortProbe.status}`;
  assert(`[${vp}] B sort param accepted server-side (200)`, sortProbe.status === 200, R.checks.sortParam);

  // ---------- B2: search ----------
  const sInp = page.locator('input[type="text"]').last();
  await sInp.click({ force: true }); await page.waitForTimeout(400);
  await page.keyboard.insertText('conference'); await page.waitForTimeout(500);
  await page.keyboard.press('Enter'); await page.waitForTimeout(2300);
  txt = await allTextOnce(page);
  assert(`[${vp}] B2 search "conference" narrows to table post`, txt.includes('round conference table') && !txt.includes('tailor'), '');
  assert(`[${vp}] B2 hit API with search=conference`, R.netLog.some(l => l.includes('search=conference')), '');
  await S('B2-search');
  await gotoRequests(page);

  // ---------- C: paging / infinite scroll ----------
  assert(`[${vp}] C feed uses paged endpoint (?page=&size=)`, R.netLog.some(l => l.includes('/feed?page=0&size=')), '');
  const before = await feedApi();
  R.checks[`paging_${vp}`] = `totalElements=${before.totalElements} totalPages=${before.totalPages}`;
  await L.scrollToBottom(page, 16); await page.waitForTimeout(1100);
  const cntOf = async () => {
    const d = await dump(page);
    const keys = ['AU056 browser goods fixture 0825', 'I am looking for a tailor', 'round conference table'];
    const c = {}; d.filter(n => n.r[3] > 40).forEach(n => { for (const k of keys) if (n.t.startsWith(k)) c[k] = (c[k] || 0) + 1; });
    return c;
  };
  const c1 = await cntOf(); await L.scrollToBottom(page, 16); await page.waitForTimeout(1100);
  const c2 = await cntOf();
  const noDup = Object.values(c2).every(v => v <= 1);
  assert(`[${vp}] C infinite scroll: no duplicate rows after 2 bottom-scrolls`, noDup, JSON.stringify({ c1, c2 }));
  await S('C-after-scroll');

  // ---------- D: own GOODS detail (identity gating + owner row + refetch + view tracking) ----------
  await gotoRequests(page);
  let card = null;
  for (let i = 0; i < 3 && !card; i++) {
    card = (await dump(page)).find(n => n.t.startsWith('AU056 browser goods fixture 0825') && n.r[3] > 60);
    if (!card) await gotoRequests(page);
  }
  assert(`[${vp}] D own GOODS card reachable in feed`, !!card, '');
  if (card) { await tapRect(page, card.r, maxY); await page.waitForTimeout(2600); }
  txt = await allTextOnce(page);
  assert(`[${vp}] D detail shows description from DETAIL payload (refetch)`, txt.includes('created by AU-056 verifier browser flow'), txt.slice(0, 90));
  assert(`[${vp}] D real category/location/budget render`, txt.includes('Electronics') && txt.includes('Mikocheni') && txt.includes('10,000 – 90,000'), '');
  assert(`[${vp}] D detail refetched by id (GET /13 with auth -> 200)`,
    R.netLog.some(l => l.includes(`API/api/v1/request-board/${FX.ownGoodsId}`) && l.includes('auth=true') && l.includes('<- 200')),
    R.netLog.filter(l => l.includes('/request-board/13')).slice(-1)[0] || 'none');
  assert(`[${vp}] D view tracking PATCH fired (auth=true)`, R.netLog.some(l => l.includes('/view') && l.includes('auth=true')), '');
  await S('D-detail-own-goods');

  const btns = (await dump(page)).filter(n => n.role === 'button');
  const anyNudgeOnOwn = btns.find(b => /nudge/i.test(b.t));
  assert(`[${vp}] D identity gating: NO nudge CTA on OWN PENDING request`, !anyNudgeOnOwn, anyNudgeOnOwn ? `OWNER SEES "${anyNudgeOnOwn.t}"` : 'absent (correct)');
  const expectedOwner = ['Edit request', 'Fulfil', 'Close', 'Delete'];
  const foundOwner = expectedOwner.filter(a => btns.some(b => b.t === a || b.t.startsWith(a)));
  R.checks[`owner_buttons_${vp}`] = JSON.stringify(btns.map(b => b.t.slice(0, 28)));
  assert(`[${vp}] D owner management row: Edit/Fulfil/Close/Delete ALL present`, foundOwner.length === 4,
    `found=[${foundOwner.join(', ')}]`);
  if (foundOwner.length < 4) R.defects.push(`[${vp}] owner row incomplete: [${btns.map(b => b.t).join(', ')}]`);
  await S('D-owner-actions');

  // ---- D2: Edit opens prefilled editor ----
  const editBtn = btns.find(b => b.t.startsWith('Edit request'));
  if (editBtn) {
    await tapRect(page, editBtn.r, maxY); await page.waitForTimeout(2200);
    txt = await allTextOnce(page);
    assert(`[${vp}] D2 Edit opens prefilled editor (title carried over)`,
      txt.includes('Post a request') && txt.includes('AU056 browser goods fixture 0825'), txt.slice(0, 100));
    await S('D2-edit-prefilled');
    const back = (await dump(page)).find(n => n.role === 'button' && n.t === 'Back');
    if (back) { await tapRect(page, back.r, maxY); await page.waitForTimeout(1400); }
  }

  // ---------- D3: CLOSE lifecycle on own SERVICE id=14 ----------
  await gotoRequests(page);
  let svcCard = null;
  for (let i = 0; i < 3 && !svcCard; i++) {
    svcCard = (await dump(page)).find(n => n.t.startsWith('AU056 browser service fixture 0825') && n.r[3] > 50);
    if (!svcCard) await gotoRequests(page);
  }
  assert(`[${vp}] D3 own SERVICE card reachable`, !!svcCard, '');
  if (!svcCard) { /* skip block */ } else {
    await tapRect(page, svcCard.r, maxY); await page.waitForTimeout(2400);
    txt = await allTextOnce(page);
    assert(`[${vp}] D3 own SERVICE detail open (id=14)`, txt.includes('AU056 browser service fixture 0825'), '');
    const closeBtn = (await dump(page)).filter(n => n.role === 'button').find(b => b.t === 'Close');
    assert(`[${vp}] D3 Close present on own PENDING post`, !!closeBtn, '');
    if (closeBtn) {
      await tapRect(page, closeBtn.r, maxY); await page.waitForTimeout(1300);
      txt = await allTextOnce(page);
      assert(`[${vp}] D3 confirm dialog with web-parity copy`, txt.includes('Close request?') && txt.includes('no longer accept nudges'), txt.slice(0, 120));
      await S('D3-close-confirm');
      const conf = (await dump(page)).find(n => n.role === 'button' && n.t === 'Close');
      if (conf) { await tapRect(page, conf.r, maxY); await page.waitForTimeout(2400); }
      const after = await apiGet(`/api/v1/request-board/${FX.ownServiceId}`);
      assert(`[${vp}] D3 close REALLY persisted (sandbox status CLOSED)`, (after.json || {}).status === 'CLOSED', `status=${(after.json || {}).status}`);
      assert(`[${vp}] D3 network PATCH /14/close auth=true observed`,
        R.netLog.some(l => l.includes('/14/close') && l.includes('auth=true')), '');
      await S('D3-after-close');
    }
  }

  // ---------- E: OTHER user's SERVICE post → REAL nudge → duplicate 409 ----------
  await gotoRequests(page);
  let eOpened = false;
  for (let round = 0; round < 4 && !eOpened; round++) {
    let oCard = (await dump(page)).find(n => n.t.startsWith('I am looking for a tailor') && n.r[3] > 50);
    if (!oCard) { await L.scrollToBottom(page, 8); await page.waitForTimeout(800); continue; }
    await tapRect(page, oCard.r, maxY); await page.waitForTimeout(2500);
    txt = await allTextOnce(page);
    if (txt.includes('professional and on time')) { eOpened = true; break; }
    await gotoRequests(page);
  }
  assert(`[${vp}] E other-user SERVICE detail reached`, eOpened, '');
  if (eOpened) {
    txt = await allTextOnce(page);
    assert(`[${vp}] E requester name + description from detail payload`, txt.includes('Roni') && txt.includes('professional and on time'), '');
    await S('E-detail-other-service');
    assert(`[${vp}] E view tracking fired again (>=2 authed /view calls)`,
      R.netLog.filter(l => l.includes('/view') && l.includes('auth=true')).length >= 2, '');

    let nBtn = await findNode(page, n => n.role === 'button' && /nudge/i.test(n.t));
    assert(`[${vp}] E non-owner sees nudge CTA on PENDING post`, !!nBtn, nBtn ? nBtn.t : 'MISSING');
    if (nBtn) {
      const cntBefore = await apiGet(`/api/v1/request-board/${FX.otherServiceId}`);
      const base1 = await baseShot(page);
      await tapRect(page, nBtn.r, maxY); await page.waitForTimeout(2400);
      const band1 = await toastProbe(page, base1);
      await S('E-nudge-toast');
      const cntAfter = await apiGet(`/api/v1/request-board/${FX.otherServiceId}`);
      const grew = ((cntAfter.json || {}).nudgeCount ?? -1) > ((cntBefore.json || {}).nudgeCount ?? -1);
      assert(`[${vp}] E nudge REALLY posts (POST /4/nudge auth=true observed)`,
        R.netLog.some(l => l.startsWith('POST') && l.includes('/nudge') && l.includes('auth=true')),
        R.netLog.filter(l => l.includes('/nudge')).slice(-1)[0] || 'none');
      assert(`[${vp}] E nudgeCount grew OR toast shown (${(cntBefore.json || {}).nudgeCount}->${(cntAfter.json || {}).nudgeCount})`,
        grew || band1 !== null, `band=${band1 || 'none'}`);
      // repeat press -> guaranteed ALREADY_NUDGED 409 path
      await page.waitForTimeout(5200);
      const base2 = await baseShot(page);
      nBtn = await findNode(page, n => n.role === 'button' && /nudge/i.test(n.t));
      if (nBtn) {
        await tapRect(page, nBtn.r, maxY); await page.waitForTimeout(2400);
        const domAlready = /already nudged/i.test(await allTextOnce(page));
        const band2 = await toastProbe(page, base2);
        await S('E-repeat-nudge');
        assert(`[${vp}] E repeat nudge -> ALREADY_NUDGED handled w/o crash`, domAlready || band2 !== null, `domCopy=${domAlready} band=${band2 || 'none'}`);
      }
    }
  }

  // ---------- F: GOODS vs SERVICE create ----------
  await gotoRequests(page);
  const fab = await findNode(page, n => n.role === 'button' && n.t === 'Post request');
  assert(`[${vp}] F "Post request" FAB present`, !!fab, '');
  if (fab) { await tapRect(page, fab.r, maxY); await page.waitForTimeout(2200); }
  const radios = (await dump(page)).filter(n => n.role === 'radio' && ['Looking to buy', 'Need a service'].includes(n.label));
  assert(`[${vp}] F create screen opens w/ GOODS/SERVICE segments`, radios.length === 2, radios.map(r => r.label).join(','));
  await S('F-create-empty');

  const postsBefore = R.netLog.filter(l => l.startsWith('POST')).length;
  let submitBtn = await findNode(page, n => n.role === 'button' && n.t === 'Post request');
  if (submitBtn) { await tapRect(page, submitBtn.r, maxY); await page.waitForTimeout(1600); }
  txt = await allTextOnce(page);
  assert(`[${vp}] F empty submit blocked by validation copy`, txt.includes('Required') || txt.includes('Please select one'), txt.slice(0, 110));
  assert(`[${vp}] F empty submit performs NO network write`, R.netLog.filter(l => l.startsWith('POST')).length === postsBefore, '');
  await S('F-create-validation');

  const stamp = `r5${Date.now() % 100000}`;
  const fillField = async (loc, v) => { await loc.click({ force: true, timeout: 6000 }).catch(() => {}); await page.waitForTimeout(300); await page.keyboard.insertText(v); await page.waitForTimeout(250); };
  const insAll = page.locator('input[type="text"]');
  const nIns = await insAll.count();
  console.log(`   F text inputs visible: ${nIns}`);
  // inputs inside the form are DOM-LAST (feed search field sits behind the route)
  await fillField(insAll.nth(nIns - 1), `AU056 ui service ${stamp}`);   // title
  const catBtn = await findNode(page, n => n.role === 'button' && n.t.startsWith('Category'));
  if (catBtn) { await tapRect(page, catBtn.r, maxY); await page.waitForTimeout(900); }
  let pickedCat = null;
  for (const c of ['Repairs', 'Cleaning', 'Other']) {
    const opt = (await dump(page)).find(n => n.t === c && n.r[3] > 20 && n.r[3] < 220);
    if (!opt) continue;
    await tapRect(page, opt.r, maxY); pickedCat = c; break;
  }
  await page.waitForTimeout(600);
  await fillField(page.locator('textarea').last(), `SERVICE created through the Flutter UI by the AU-056 r5 verifier (${stamp}).`);
  let ins2 = page.locator('input[type="text"]');
  let nIns2 = await ins2.count();
  if (nIns2 >= 3) { await fillField(ins2.nth(nIns2 - 3), '31000'); await fillField(ins2.nth(nIns2 - 2), '88000'); }
  await S('F-service-filled');
  submitBtn = await findNode(page, n => n.role === 'button' && n.t === 'Post request');
  if (submitBtn) { await tapRect(page, submitBtn.r, maxY); await page.waitForTimeout(4200); }
  const feedSvc = await feedApi();
  const svcRow = (feedSvc.content || []).find(r => r.title === `AU056 ui service ${stamp}`);
  assert(`[${vp}] F SERVICE create PERSISTED end-to-end on sandbox`, !!svcRow,
    svcRow ? `backend id=${svcRow.id} type=${svcRow.requestType} cat=${svcRow.serviceCategory}` :
    'NOT CREATED — ' + txt.slice(0, 90));
  assert(`[${vp}] F SERVICE used /request-board/service endpoint (auth=true)`,
    R.netLog.some(l => l.startsWith('POST') && l.includes('/service') && l.includes('auth=true')),
    R.netLog.filter(l => l.includes('/service')).slice(-1)[0]);
  await S('F-service-result');
  if (svcRow) { const del = await fetch(`http://localhost:8083/api/v1/request-board/${svcRow.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TOKV}` } }); R.checks.svcCleanup = `DELETE ${svcRow.id} -> ${del.status}`; }

  // GOODS path: app has NO image picker; backend requires >=1 image for GOODS.
  // Prove the contract live: POST without image -> 400; with image -> 201.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  let noImgStatus = null, noImgMsg = '';
  try {
    const fd = new FormData();
    fd.append('request', new Blob([JSON.stringify({ title: `AU056 ui goods ${stamp}`, description: 'no image attached', category: 'Other', location: 'Dar es Salaam', requestType: 'GOODS' })], { type: 'application/json' }));
    const resp = await fetch('http://localhost:8083/api/v1/request-board', { method: 'POST', headers: { Authorization: `Bearer ${TOKV}` }, body: fd });
    noImgStatus = resp.status; noImgMsg = (await resp.text()).slice(0, 160);
  } catch (e) { noImgMsg = String(e).slice(0, 120); }
  assert(`[${vp}] F GOODS-without-image is rejected by backend (${noImgStatus}) — proves why UI-only GOODS post cannot persist`,
    noImgStatus === 400 && /At least one image/i.test(noImgMsg), `HTTP ${noImgStatus} ${noImgMsg.slice(0, 90)}`);
  R.defects.push(`${vp} MAJOR parity gap: Flutter create-request screen ships NO image picker; backend rejects every GOODS post without one (HTTP 400 "At least one image is required for GOODS requests") — web reference gates create behind verification and its modal carries an image uploader. GOODS create is therefore NOT end-to-end from the mobile UI.`);
  await S('F-goods-blocked-evidence');

  // ---------- G: fulfill via product picker (own PENDING GOODS id=13) ----------
  await gotoRequests(page);
  let gCard = null;
  for (let i = 0; i < 3 && !gCard; i++) {
    gCard = (await dump(page)).find(n => n.t.startsWith('AU056 browser goods fixture 0825') && n.r[3] > 60);
    if (!gCard) await gotoRequests(page);
  }
  if (gCard) {
    await tapRect(page, gCard.r, maxY); await page.waitForTimeout(2400);
    let ful = (await dump(page)).filter(n => n.role === 'button').find(b => b.t === 'Fulfil');
    assert(`[${vp}] G Fulfil button on own PENDING post`, !!ful, '');
    if (ful) {
      await tapRect(page, ful.r, maxY); await page.waitForTimeout(1900);
      txt = await allTextOnce(page);
      const pickerUp = txt.includes('Fulfil with one of your listings');
      assert(`[${vp}] G product-picker dialog lists MY listings`, pickerUp, txt.slice(0, 130));
      await S('G-fulfill-picker');
      let myProdName = null;
      try {
        const me = await apiGet('/api/v1/userManagement/user-details');
        const mine = ((me.json || {}).products || []).find(p => p.productId === FX.myProductId) || ((me.json || {}).products || [])[0];
        myProdName = mine ? (mine.productName || `Listing #${mine.productId}`) : null;
      } catch (e) {}
      const opt = myProdName ? (await dump(page)).find(n => n.t === myProdName) : null;
      if (opt) {
        await tapRect(page, opt.r, maxY); await page.waitForTimeout(2800);
        const chk = await apiGet(`/api/v1/request-board/${FX.ownGoodsId}`);
        assert(`[${vp}] G fulfil REALLY persisted (status FULFILLED, fulfilledProductId=${FX.myProductId})`,
          (chk.json || {}).status === 'FULFILLED' && (chk.json || {}).fulfilledProductId === FX.myProductId,
          `status=${(chk.json || {}).status} pid=${(chk.json || {}).fulfilledProductId}`);
        assert(`[${vp}] G PATCH /13/fulfill auth=true observed`,
          R.netLog.some(l => l.includes('/fulfill') && l.includes('auth=true')), '');
        await S('G-after-fulfill');
      } else {
        assert(`[${vp}] G pick listing "${myProdName}"`, false, 'option not rendered in dialog');
      }
    }
  } else assert(`[${vp}] G own goods card reachable for fulfill step`, false, 'missing');

  // ---------- H: CLOSED post hides owner row AND nudge ----------
  await gotoRequests(page);
  let dCard = null;
  for (let i = 0; i < 3 && !dCard; i++) {
    dCard = (await dump(page)).find(n => n.t.startsWith('AU056 browser service fixture 0825') && n.r[3] > 50);
    if (!dCard) await gotoRequests(page);
  }
  if (dCard) {
    await tapRect(page, dCard.r, maxY); await page.waitForTimeout(2300);
    const hb = (await dump(page)).filter(n => n.role === 'button').map(b => b.t);
    assert(`[${vp}] H CLOSED post hides owner row AND nudge CTA (status gating)`,
      !hb.some(t => t === 'Delete' || t === 'Fulfil') && !hb.some(t => /nudge/i.test(t)), `buttons=[${hb.join(',')}]`);
    await S('H-closed-post-buttons');
  }

  // ---------- click-everything sweep on FEED ----------
  await gotoRequests(page);
  const list = (await dump(page)).filter(n => n.role === 'button');
  console.log(`   [${vp}] feed buttons: ${list.map(b => b.t.slice(0, 16)).join('|')}`);
  const navSkip = /^(Home|Marketplace|Sell|Requests|Account)\b/;
  let clicked = 0, effects = 0;
  for (const c of list) {
    const short = c.t.replace(/\n/g, ' ').slice(0, 30);
    if (navSkip.test(c.t) && c.r[1] > h - 150) continue;
    if (c.disabled === 'true') { buttonsTotal++; buttonsOk++; continue; }
    const beforeTxt = await allTextOnce(page);
    const base = await baseShot(page);
    await tapRect(page, c.r, maxY);
    await page.waitForTimeout(900);
    const afterTxt = await allTextOnce(page);
    const eff = beforeTxt !== afterTxt || (await toastProbe(page, base)) !== null;
    buttonsTotal++; clicked++; if (eff) { buttonsOk++; effects++; } else {
      buttonsFailed.push(short);
      R.defects.push(`${vp} dead control "${short}" @${JSON.stringify(c.r)} (feed sweep)`);
    }
    if (!(await dump(page)).some(n => n.label === 'Services' || n.t === 'Status')) await gotoRequests(page);
  }
  for (const tb of ['Home', 'Marketplace', 'Sell', 'Account']) {
    const t1 = await allTextOnce(page);
    await L.clickBtn(page, tb); await page.waitForTimeout(1400);
    const t2 = await allTextOnce(page);
    buttonsTotal++; clicked++;
    if (t1 !== t2) { buttonsOk++; effects++; } else buttonsFailed.push('nav:' + tb);
    await gotoRequests(page);
  }
  assert(`[${vp}] click-everything: ${effects}/${clicked} controls produced observable effects`,
    clicked === 0 || effects >= clicked - 1, `failed=[${buttonsFailed.join(',')}]`);

  await S('Z-final');
  const vpath = `${E2E}/videos/AU-056-${vp}-r5.webm`;
  try { const v = page.video(); await ctx.close(); if (v) await v.saveAs(vpath).catch(() => {}); } catch (e) {}
  await browser.close();
  R.video = vpath;
}

(async () => {
  try {
    await runViewport(375, 667, 'mobile');
    await runViewport(768, 1024, 'tablet');
  } catch (e) { R.errors.push('FATAL ' + e.message); console.error('FATAL', e); }

  // ---------- PARITY refs (:3000 judge) ----------
  try {
    const pb = await L.newBrowser();
    for (const [w, h] of [[375, 667], [768, 1024]]) {
      const pc = await pb.newContext({ viewport: { width: w, height: h } });
      const pp = await pc.newPage();
      await pp.goto('http://localhost:3000/requests', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await pp.waitForTimeout(6000);
      const refTxt = await pp.evaluate(() => document.body.innerText.slice(0, 4000));
      const V = `${w}x${h}`;
      const shotRef = `${OUTDIR}/ref-${V}-feed.png`;
      await pp.screenshot({ path: shotRef }).catch(() => {});
      R.states.push({ vp: V, state: 'ref-feed', path: shotRef });
      const anonGate = refTxt.includes('Session Expired') || refTxt.includes('Login into your account');
      R.parity.push({ vp: V, anonGate, refSnippet: refTxt.slice(0, 160).replace(/\n+/g, ' | ') });
      await pc.close();
    }
    await pb.close();
  } catch (e) { R.errors.push('parity ' + e.message); }

  fs.writeFileSync('/tmp/au056_r5_results.json', JSON.stringify(R, null, 2));
  const failed = R.asserts.filter(a => !a.pass);
  console.log(`\n===== SUMMARY AU-056 r5: ${R.asserts.length - failed.length}/${R.asserts.length} asserts pass =====`);
  failed.forEach(f => console.log('  FAIL:', f.name, '::', f.detail.slice(0, 160)));
})();
