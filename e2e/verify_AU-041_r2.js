// verify_AU-041_r2.js — instrumented re-drive of the sell publish sequence (RW lane).
// Focus: get the wizard through Publish with clean field state, then prove C1–C5.
// Lessons from r1 baked in: type price FIRST then payout (so final state is the forward pair);
// read fields after every settle; never rely on one-shot typing.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const APP = 'http://localhost:9112';
const API = 'http://localhost:8083';
const SHOTS = 'e2e/shots/AU-041';
const UNIT = 'AU-041';
const STAGE = 'verify';
const ROUND = 'r2';
const STAMP = Date.now();
const TITLE = `AU041R2 Probe Table ${STAMP}`;
const DESC = 'AU-041 round-2 verifier listing published through the real sell wizard against the sandbox API.';
const EXPECTED_MTIME = 'Tue, 25 Aug 2026 05:15:38 GMT';
const PHOTO_SRC = path.join(__dirname, 'fixtures', 'receipt-proof.png');

async function txt(p) { return L.allText(p).catch(() => ''); }
async function nodes(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => {
    const r = e.getBoundingClientRect();
    return { role: e.getAttribute('role'), tappy: e.getAttribute('flt-tappable') !== null,
      label: (e.textContent || '').trim().slice(0, 70),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      area: r.width * r.height };
  }).filter(n => n.w > 5 && n.h > 5 && n.y < innerHeight - 2 && n.y + n.h > 2));
}
async function findNode(p, prefix, pred = () => true) {
  const ns = await nodes(p);
  return ns.filter(n => n.label.startsWith(prefix)).filter(pred).sort((a, b) => a.area - b.area)[0] || null;
}
async function tap(p, n, dx = 0.5, dy = 0.5) { await p.mouse.click(n.x + n.w * dx, n.y + n.h * dy); await sleep(900); }
async function scroll(p, dy) { await p.mouse.move(187, 350); await p.mouse.wheel(0, dy); await sleep(650); }
async function inputVal(p, label) {
  return p.evaluate((lbl) => {
    const i = [...document.querySelectorAll('input,textarea')].find(x => x.getAttribute('aria-label') === lbl);
    return i ? i.value : null;
  }, label).catch(() => null);
}
async function inputBox(p, label) {
  return p.evaluate((lbl) => {
    const i = [...document.querySelectorAll('input,textarea')].find(x => x.getAttribute('aria-label') === lbl);
    if (!i) return null; const r = i.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, label).catch(() => null);
}
// clear + type with triple-select (Ctrl+A) so no stale digits survive
async function clearTypeInto(p, label, text) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const b = await inputBox(p, label);
    if (!b) { await scroll(p, 380); continue; }
    await p.mouse.click(b.x, b.y); await sleep(500);
    await p.keyboard.press('Control+a'); await sleep(250);
    await p.keyboard.press('Delete'); await sleep(350);
    await p.keyboard.type(text, { delay: 60 }); await sleep(800);
    const v = await inputVal(p, label);
    console.log(`    [type ${label}] -> "${v}"`);
    if ((v || '').replace(/,/g, '') === text.replace(/,/g, '')) return true;
  }
  return false;
}
async function pickDropdown(p, fieldPrefix, optionText) {
  const fld = await findNode(p, fieldPrefix);
  if (!fld) return { picked: false, why: `field "${fieldPrefix}" not in DOM` };
  await tap(p, fld); await sleep(1500);
  const opt = await findNode(p, optionText, n => n.role === 'button' && n.tappy && n.w >= 200);
  if (!opt) return { picked: false, why: `menu did not list "${optionText}"` };
  await tap(p, opt, 0.16); await sleep(1400);
  return { picked: true };
}
async function radioRects(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .filter(e => e.getAttribute('role') === 'radio')
    .map(e => { const r = e.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        checked: e.getAttribute('aria-checked') === 'true' }; })
    .filter(r => r.h > 5 && r.y > 55 && r.y < innerHeight - 30).sort((a, b) => a.y - b.y)).catch(() => []);
}
async function clickRadio(p, rect, dx = 14 / 319) {
  await p.mouse.click(rect.x + rect.w * dx, rect.y + rect.h / 2); await sleep(1000);
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(SHOTS, { recursive: true });
  const fr = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = fr.headers.get('last-modified');
  const freshness = fr.status === 200 && lm === EXPECTED_MTIME;
  console.log(`freshness status=${fr.status} lm="${lm}" ok=${freshness}`);

  const browser = await L.newBrowser();
  const videoPath = `e2e/videos/${UNIT}-${ROUND}-mobile.webm`;
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath });
  const p = await ctx.newPage();
  const netLog = [];
  p.on('response', r => {
    const u = r.url();
    if (/post-product|\/products\/[^/]*\/images|\/products\/update/.test(u) && u.includes('8083'))
      netLog.push(`${r.request().method()} …${u.slice(u.length - 34)} -> ${r.status()}`);
  });

  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 40000);
  ok_login: {
    var loginOk = await L.login(p, L.ADMIN);
  }
  console.log('login', loginOk);

  await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.indexOf('sell_form_draft') >= 0) localStorage.removeItem(k); location.hash = '#/sell'; });
  for (let i = 0; i < 50; i++) { if ((await txt(p)).includes('Step 1 of 4')) break; await sleep(500); }
  await sleep(2200);

  // ---- step 1
  const catPick = await pickDropdown(p, 'Category *', 'Furniture'); console.log('category', JSON.stringify(catPick));
  await sleep(400);
  const subFld = await findNode(p, 'Subcategory *');
  let subLabel = null;
  if (subFld) {
    await tap(p, subFld); await sleep(1500);
    const opts = (await nodes(p)).filter(n => n.role === 'button' && n.tappy && n.w >= 250 && n.label.length > 2);
    const sofas = opts.find(o => o.label.startsWith('Sofas')) || opts[0];
    if (sofas) { subLabel = sofas.label.split('\n')[0].trim(); await tap(p, sofas, 0.16); await sleep(1400); }
  }
  console.log('subcategory', subLabel);

  let radios = [];
  for (let i = 0; i < 10; i++) { radios = await radioRects(p);
    if (radios.length >= 1 && radios[radios.length - 1].y < 620) break; await scroll(p, 380); }
  radios = await radioRects(p);
  console.log('radio rows', radios.length);
  // choose the LAST radio (newest address = our pinned AU040 Pickup row appended at end)
  const idx = radios.length ? radios.length - 1 : -1;
  if (radios[idx]) await clickRadio(p, radios[idx]);
  const rrAfter = await radioRects(p);
  console.log('pin selected:', !!(rrAfter[idx] && rrAfter[idx].checked));

  await scroll(p, -2800); await sleep(300); await scroll(p, -1500);
  console.log('title typed:', await clearTypeInto(p, 'Item title *', TITLE));
  await L.screenshot(p, `${SHOTS}/flutter-375-r2-01-details.png`);

  // ---- step 2
  const cont1 = await findNode(p, 'Continue'); if (cont1) await tap(p, cont1);
  await sleep(1800);
  console.log('on step2:', (await txt(p)).includes('Step 2 of 4'));
  const tiles = (await nodes(p)).filter(n => !n.label && n.tappy && n.w >= 80 && n.h >= 60);
  const fcPromise = p.waitForEvent('filechooser', { timeout: 20000 }).catch(() => null);
  if (tiles.length) await tap(p, tiles[0]);
  const fc = await fcPromise;
  if (fc) { await fc.setFiles([PHOTO_SRC, PHOTO_SRC]).catch(() => {}); await sleep(9000); }
  console.log('thumbnails visible:', (await txt(p)).includes('Main Photo'));
  await L.screenshot(p, `${SHOTS}/flutter-375-r2-02-photos.png`);
  console.log('desc typed:', await clearTypeInto(p, 'Description *', DESC));
  // leave qty at 1 (qty==1 branch)

  // ---- step 3
  const cont2 = await findNode(p, 'Continue'); if (cont2) await tap(p, cont2);
  await sleep(2000);
  let T = await txt(p);
  console.log('on step3:', T.includes('Step 3 of 4'));

  // FORWARD ONLY: payout 5000 → price must become 6000 (web-default rates, Furniture 0.10)
  console.log('payout typed:', await clearTypeInto(p, 'You receive (TZS)', '5000'));
  await sleep(1500);
  let pv = await inputVal(p, 'Final buyer price (TZS)');
  let ov = await inputVal(p, 'You receive (TZS)');
  console.log(`after forward: price="${pv}" payout="${ov}"`);

  // transport REQUIRED → pick Boda
  const veh = await findNode(p, 'Delivery vehicle *');
  if (veh) {
    await tap(p, veh); await sleep(1600);
    const opt = await findNode(p, 'Boda', n => n.role === 'button' && n.tappy && n.w >= 200);
    if (opt) { await tap(p, opt, 0.16); await sleep(1300); console.log('boda picked'); }
  } else console.log('vehicle dropdown NOT in DOM');

  await L.screenshot(p, `${SHOTS}/flutter-375-r2-03-pricing.png`);
  T = await txt(p);
  console.log('breakdown rows present:', ['GloboExpats commission','VAT','Selcom fee','Final total asking price'].map(s=>T.includes(s)));

  // ---- step 4 review
  const cont3 = await findNode(p, 'Continue'); if (cont3) await tap(p, cont3);
  await sleep(2000);
  T = await txt(p);
  console.log('on step4:', T.includes('Step 4 of 4'));
  console.log('review has title:', T.includes(TITLE.slice(0, 18)), '| review shows price:', /TSh\s*6,?000/.test(T));
  await L.screenshot(p, `${SHOTS}/flutter-375-r2-04-review.png`);
  // dump review rows verbatim
  const revRows = (await nodes(p)).map(n => n.label).filter(l => l && l.length < 90);
  fs.writeFileSync(`${SHOTS}/r2-review-a11y.txt`, revRows.join('\n'));

  // ---- PUBLISH
  const pubBtn = await findNode(p, 'Publish', n => n.role === 'button' && n.tappy);
  console.log('publish button found:', !!pubBtn);
  if (pubBtn) { await tap(p, pubBtn);
    let sn = null;
    for (let i = 0; i < 14; i++) { await sleep(1000); sn = await L.hasSnackBar(p); if (sn.found) break; }
    console.log('snackbar band:', JSON.stringify(sn));
    await L.screenshot(p, `${SHOTS}/flutter-375-r2-05-after-publish.png`);
    T = await txt(p);
    console.log('still on review after 14s:', T.includes('Step 4 of 4'));
  }

  R_done: {}
  await L.closeVideo(ctx, videoPath).catch(() => {});
  await browser.close().catch(() => {});

  // ---- server readback
  const tok = await L.apiLogin(L.ADMIN);
  const sr = await L.api(null, 'GET', `/api/v1/products/search?q=${encodeURIComponent(TITLE)}`);
  const hits = ((sr.json && sr.json.products) || []).filter(h => (h.productName || '').includes(String(STAMP)));
  console.log('search hits for wizard listing:', hits.length, hits[0] ? `productId=${hits[0].productId}` : '');
  if (hits[0]) {
    const pid = hits[0].productId;
    const det = await L.api(tok, 'GET', `/api/v1/displayItem/itemDetails/${pid}`);
    const j = det.json || {};
    const keys = ['sellerPayout','finalTotalSellingPrice','categoryCommissionPercentage','sellerFacingCommissionAmount','vat','selcomCommissionFee','selcomTransactionFee','platformNetProfitBeforeCuts','platformNetProfitAfterCuts','roundingAdjustment','productQuantity','latitude','longitude','deliveryTransportMode','transportRequirement','coordinatesSource','deliverySetupReady'];
    const out = {}; for (const k of keys) out[k] = j[k];
    console.log('DETAILS:', JSON.stringify(out));
    const imgs = j.productImages || [];
    for (const im of imgs.slice(0, 3)) {
      const u = API + '/' + (im.imageUrl || '').replace(/^uploads\//, 'uploads/');
      const h = await fetch(u);
      console.log('img', h.status, h.headers.get('content-type'), u.slice(-30));
    }
    // archive to keep catalog clean
    const a = await L.api(tok, 'PATCH', `/api/v1/products/status/${pid}`, { status: 'ARCHIVED' });
    console.log('archive', pid, a.status);
  }
  console.log('netLog:', JSON.stringify(netLog));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
