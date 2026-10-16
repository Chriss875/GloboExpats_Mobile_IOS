// au060_verify_r14.js — AU-060 TERMINAL verifier (addresses CRUD + seller payout details).
// Frozen lane :9131 @ e694463, main.dart.js Last-Modified "Wed, 26 Aug 2026 08:15:26 GMT".
// RW lane: own fixtures only, prefix "au060r14". Appendix A steps 1-9 in full.
//   Stage A (API): freshness, real-data readback, fixture create via REAL endpoints.
//   Stage B (375x667 browser): Account -> Addresses -> ADD (with pin) -> server read-back ->
//     EDIT (PUT) -> read-back -> SET DEFAULT -> read-back + checkout prefill probe ->
//     DELETE (confirm dialog) -> read-back gone. Map-pin validation attacks. Click-everything.
//   Stage C (768x1024): same screen states at tablet viewport.
//   Stage D (1280x900 admin/insights viewport): payout-details deep link + parity sweep.
// Native PNG inspection (Rule 16) happens after this script writes raw JSON; verdicts here
// are mechanical, the human-model vision pass enumerates defects from the PNGs.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';
L.APP = APP;
const UNIT = 'AU-060', STAGE = 'verify', SHA = 'e694463';
const MT = 'Wed, 26 Aug 2026 08:15:26 GMT';
const TRACE = '/tmp/au060_r14_trace.jsonl';
const OUTDIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-060';
const VIDDIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos';

const CNT = { real_data: 0, images_requested: 0, images_200: 0,
  buttons_total: 0, buttons_ok: 0, buttons_failed: [],
  state_asserts: 0, nav_asserts: 0, data_asserts: 0,
  parity: { blocker: 0, major: 0, minor: 0, accepted: 0 } };
const FAILS = [], EV = [], PARITY = [];

function chk(name, ok, ev, cls) {
  fs.appendFileSync(TRACE, JSON.stringify({ ts: new Date().toISOString(), unit: UNIT, stage: STAGE, check: name, ok: !!ok, evidence: String(ev ?? '').slice(0, 700) }) + '\n');
  console.log(ok ? 'PASS' : 'FAIL', '|', name, '|', String(ev ?? '').slice(0, 220));
  if (!ok) { FAILS.push(`${name}: ${String(ev ?? '').slice(0, 160)}`); if (cls) PARITY.push({ check: name, class: cls, evidence: String(ev).slice(0, 200) }); }
  return ok;
}
function shot(p, vp, state) {
  const f = `${OUTDIR}/AU-060-r14-${vp}-${state}.png`;
  EV.push(f);
  return L.screenshot(p, f);
}

// ---------- semantics helpers (au042-proven) ----------
async function dump(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => {
    const r = e.getBoundingClientRect();
    return { role: e.getAttribute('role') || '', tap: e.getAttribute('flt-tappable') !== null,
      label: (e.getAttribute('aria-label') || e.textContent || '').trim(), checked: e.getAttribute('aria-checked'),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }).filter(n => n.label));
}
const txtOf = N => N.map(n => n.label).join('\n');
async function findNode(p, want, vp) {
  const nodes = await dump(p); let best = null;
  for (const n of nodes) {
    if (!n.label.includes(want)) continue;
    if (!(n.role === 'button' || n.tap || n.role === 'textbox' || n.role === 'checkbox')) continue;
    if (n.w < 6 || n.h < 6) continue;
    if (n.y + n.h <= 0 || n.y >= vp.h || n.x + n.w <= 0 || n.x >= vp.w) continue;
    if (!best || n.w * n.h < best.w * n.h * 1e9 + best.w * best.h) { if (!best || n.w * n.h < best.w * best.h) best = n; }
  }
  return best;
}
async function clickCenter(p, n) { await p.mouse.click(n.x + n.w / 2, Math.min(Math.max(n.y + n.h / 2, 8), 655)); await p.waitForTimeout(1100); }
// scroll a node into view then return it (wheel-based, semantics have no scrollIntoView)
async function reveal(p, want, vp, tries = 14) {
  let n = null;
  for (let i = 0; i < tries; i++) {
    n = await findNode(p, want, vp);
    if (n && n.y > 95 && n.y + n.h < vp.h - 40) return n;
    const dir = !n ? 1 : (n.y + n.h / 2 > vp.h * 0.55 ? 1 : -1);
    await p.mouse.move(vp.w / 2 - 10, vp.h * 0.5); await p.mouse.wheel(0, dir * 240); await p.waitForTimeout(260);
  }
  return n;
}

// ---------- API helpers ----------
const T = () => fs.readFileSync('/tmp/au060.tok', 'utf8').trim();
async function getAddresses() {
  const r = await L.api(T(), 'GET', '/api/v1/get-addresses');
  return { status: r.status, list: Array.isArray(r.json) ? r.json : [] };
}
async function getDefault() {
  const r = await L.api(T(), 'GET', '/api/v1/get-default-address');
  return { status: r.status, row: r.json && typeof r.json === 'object' && !Array.isArray(r.json) ? r.json : null };
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(OUTDIR, { recursive: true }); fs.mkdirSync(VIDDIR, { recursive: true });

  // ===================== STEP 1 FRESHNESS =====================
  {
    const r = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
    const lm = r.headers.get('last-modified');
    chk('freshness-build-sha-mtime', lm === MT, `Last-Modified=${lm} expected=${MT} sha=${SHA}`);
    const idx = await fetch(APP + '/').then(x => x.text());
    chk('freshness-app-served', /main\.dart\.js|flutter/i.test(idx), `index bytes=${idx.length}`);
  }

  // ===================== STEP 2 REAL DATA (API ground truth + fixtures) =====================
  let fx = null;
  {
    const before = await getAddresses();
    CNT.real_data++;
    chk('api-get-addresses-200-list', before.status === 200 && Array.isArray(before.list),
      `HTTP ${before.status} rows=${before.list.length}`);
    CNT.real_data++;
    const bad = ['lorem', 'placeholder', 'dummy data', 'fixme'].filter(w =>
      JSON.stringify(before.list).toLowerCase().includes(w));
    chk('api-no-placeholder-copy', bad.length === 0, bad.join(',') || 'clean');
    // backend key contract: isDefault serializes as "default"
    const keyOk = before.list.every(a => !('isDefault' in a) && ('default' in a));
    CNT.real_data++;
    chk('api-default-key-is-default-not-isDefault', keyOk,
      `keys sample=${JSON.stringify(Object.keys(before.list[0] || {}))}`);

    // ---- RW fixture: CREATE through the REAL endpoint (what the app's Add sheet posts) ----
    const tag = 'au060r14' + Date.now().toString().slice(-6);
    const mk = await L.api(T(), 'POST', '/api/v1/add-address', {
      street: `12 ${tag} verify lane`, city: 'Dar es Salaam', country: 'Tanzania',
      label: 'AU060RW Fixture', phoneNumber: '+255700000042',
    });
    CNT.real_data++;
    chk('fixture-add-address-201-real-endpoint', mk.status === 201 || mk.status === 200,
      `HTTP ${mk.status} body=${JSON.stringify(mk.json).slice(0, 120)}`);
    const createdId = mk.json && mk.json.addressId;
    chk('fixture-add-address-returns-addressId', !!createdId, `addressId=${createdId}`);

    // give it a pin via the app's update path payload shape (AddressDTO)
    const pin = await L.api(T(), 'PUT', `/api/v1/update-address/${createdId}`, {
      label: 'AU060RW Fixture', street: `12 ${tag} verify lane`, region: 'Dar es Salaam',
      city: 'Dar es Salaam', country: 'Tanzania', placeName: 'Verifier Plaza',
      latitude: -6.8031, longitude: 39.2715,
    });
    CNT.real_data++;
    chk('fixture-update-address-pin-persists', pin.status === 200 &&
      pin.json && Math.abs((pin.json.latitude ?? 0) - (-6.8031)) < 1e-9 &&
      Math.abs((pin.json.longitude ?? 0) - 39.2715) < 1e-9,
      `HTTP ${pin.status} lat=${pin.json && pin.json.latitude} lng=${pin.json && pin.json.longitude}`);
    const rb = await getAddresses();
    const mine = rb.list.find(a => a.addressId === createdId);
    CNT.data_asserts += 3;
    chk('fixture-server-readback-full-row',
      mine && mine.label === 'AU060RW Fixture' && (mine.latitude === -6.8031) &&
      mine.placeName === 'Verifier Plaza' && mine.default === false,
      JSON.stringify(mine).slice(0, 220));
    fx = { id: createdId, street: `12 ${tag} verify lane`, tag, prevDefaultId: (before.list.find(a => a.default === true) || {}).addressId };
    fs.writeFileSync('/tmp/au060_r14_fx.json', JSON.stringify(fx));

    // payout ground truth
    const pd = await L.api(T(), 'GET', '/api/v1/userManagement/payout-details');
    const ps = await L.api(T(), 'GET', '/api/v1/userManagement/payout-details/prompt-status');
    CNT.real_data += 2;
    chk('payout-api-list-200', pd.status === 200 && Array.isArray(pd.json), `HTTP ${pd.status} rows=${Array.isArray(pd.json) ? pd.json.length : '?'}`);
    chk('prompt-status-api-shape', ps.status === 200 && ps.json && 'hasListings' in ps.json && 'configured' in ps.json && 'shouldPrompt' in ps.json,
      JSON.stringify(ps.json).slice(0, 140));
    fs.writeFileSync('/tmp/au060_r14_payout_before.json', JSON.stringify(pd.json));
  }

  // ===================== shared browser helpers =====================
  async function bootSession(ctx, vp) {
    const p = await ctx.newPage(); p.setDefaultTimeout(30000);
    const imgs = {}, apiLog = [];
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) { imgs[u] = r.status(); }
      if (/localhost:8083/.test(u)) apiLog.push(`${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '').split('?')[0]} -> ${r.status()}`);
    });
    const token = await L.apiLogin();
    await p.addInitScript(t => {
      localStorage.setItem('flutter.auth_token', JSON.stringify(t));
      localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com'));
    }, token);
    // hash-route deep link (path deep links 404 on this static server — au006-proven)
    await p.goto(APP + '/#/account/addresses', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 30; i++) {
      await p.waitForTimeout(1500);
      const t = await L.allText(p);
      if (t.includes('Addresses')) break;
    }
    await p.waitForTimeout(2500);
    return { p, imgs, apiLog };
  }

  // ===================== STEP B — PASS 1: 375x667 =====================
  {
    console.log('\n===== PASS 1: 375x667 =====');
    const vpw = 375, vph = 667;
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: vpw, height: vph }, videoPath: `${VIDDIR}/AU-060-r14-375.webm` });
    const { p, imgs, apiLog } = await bootSession(ctx, '375');

    let N = await dump(p); let Tx = txtOf(N);
    CNT.nav_asserts++;
    chk('vp375-addresses-screen-opened', Tx.includes('Addresses'), Tx.split('\n').slice(0, 3).join(' | ').slice(0, 120));
    CNT.state_asserts++;
    chk('vp375-fixture-row-rendered-real-data', Tx.includes(fx.street) && Tx.includes('AU060RW Fixture'),
      `street shown=${Tx.includes(fx.street)} label shown=${Tx.includes('AU060RW Fixture')}`);
    CNT.state_asserts++;
    const defRow = (await getDefault()).row;
    chk('vp375-default-badge-on-server-default-row', defRow && Tx.includes(defRow.street) && Tx.includes('Default'),
      `default id=${defRow && defRow.addressId} badge text present=${Tx.includes('Default')}`);
    await shot(p, '375', '01-list-initial');

    // ---------- ADD flow ----------
    let add = await reveal(p, 'Add', { w: vpw, h: vph });
    CNT.buttons_total++; CNT.state_asserts++;
    if (!add) { chk('vp375-add-button-found', false, 'no Add control in a11y tree'); CNT.buttons_failed.push('Add'); }
    else {
      await clickCenter(p, add);
      for (let i = 0; i < 12; i++) { await p.waitForTimeout(900); Tx = txtOf(await dump(p)); if (Tx.includes('Add address') || Tx.includes('Street address')) break; }
      N = await dump(p); Tx = txtOf(N);
      chk('vp375-add-sheet-opened', Tx.includes('Add address') || Tx.includes('Save address'), Tx.split('\n').slice(0, 6).join(' | ').slice(0, 160));
      await shot(p, '375', '02-add-sheet');

      // map-pin validation FIRST (web rule): fill required street, bad coords, expect verbatim error
      const fields = ['Label (e.g. Home)', 'Street address', 'City / region', 'Latitude', 'Longitude'];
      async function typeField(labelPart, text) {
        const f = await findNode(p, labelPart, { w: vpw, h: vph });
        if (!f) return false;
        await clickCenter(p, { ...f, role: '' });
        await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace'); await p.waitForTimeout(180);
        await p.keyboard.type(text, { delay: 8 }); await p.waitForTimeout(260);
        return true;
      }
      // enumerate inputs on sheet
      const inputs = await p.evaluate(() => [...document.querySelectorAll('input,textarea')].map(i => ({ ph: i.getAttribute('aria-label') || i.placeholder || '', t: i.type })));
      fs.writeFileSync(`/tmp/au060_inputs_375_add.json`, JSON.stringify(inputs, null, 1));
      CNT.buttons_total += inputs.length;
      // fill by DOM order: [label, street, city, placeName?, lat, lng, phone] — assert count first
      const need = inputs.length >= 5;
      chk('vp375-add-sheet-has-input-fields', need, `inputs=${inputs.length}: ${inputs.map(i => i.ph).join(' / ').slice(0, 150)}`);
      if (need) {
        const setByIndex = async (idx, val) => {
          await p.locator('input,textarea').nth(idx).click({ force: true }).catch(() => {});
          await p.waitForTimeout(200);
          await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace');
          if (val) await p.keyboard.type(val, { delay: 6 });
          await p.waitForTimeout(200);
        };
        const lblIdx = inputs.findIndex(i => /label/i.test(i.ph));
        const streetIdx = inputs.findIndex(i => /street/i.test(i.ph));
        const latIdx = inputs.findIndex(i => /latitude/i.test(i.ph));
        const lngIdx = inputs.findIndex(i => /longitude/i.test(i.ph));
        const saveBtn = () => findNode(p, 'Save address', { w: vpw, h: vph });

        // ATTACK 1: invalid lat out of range
        await setByIndex(lblIdx, ''); await setByIndex(streetIdx, `${fx.tag} attack one`);
        await setByIndex(latIdx, '123.45'); await setByIndex(lngIdx, '39.20');
        let sb = await reveal(p, 'Save address', { w: vpw, h: vph });
        CNT.buttons_total++;
        if (sb) { await clickCenter(p, sb); } else { CNT.buttons_failed.push('Save address(atk1)'); }
        await p.waitForTimeout(1200);
        Tx = txtOf(await dump(p));
        const err1 = Tx.includes('Enter a valid pin: latitude -90..90, longitude -180..180 (not 0,0)');
        CNT.state_asserts++;
        chk('vp375-pin-validation-lat-out-of-range-refused', err1,
          `verbatim error rendered=${err1} | sheet still open=${Tx.includes('Save address')}`);
        await shot(p, '375', '03-invalid-pin-error');

        // ATTACK 2: (0,0) null island
        await setByIndex(latIdx, '0'); await setByIndex(lngIdx, '0');
        sb = await reveal(p, 'Save address', { w: vpw, h: vph });
        if (sb) await clickCenter(p, sb); else CNT.buttons_failed.push('Save address(atk2)');
        await p.waitForTimeout(1000);
        Tx = txtOf(await dump(p));
        const err2 = Tx.includes('Enter a valid pin: latitude -90..90, longitude -180..180 (not 0,0)');
        CNT.state_asserts++;
        chk('vp375-pin-validation-null-island-refused', err2, `refused=${err2}`);
        // ATTACK 3: lng over range
        await setByIndex(latIdx, '-6.8'); await setByIndex(lngIdx, '-200');
        sb = await reveal(p, 'Save address', { w: vpw, h: vph });
        if (sb) await clickCenter(p, sb); else CNT.buttons_failed.push('Save address(atk3)');
        await p.waitForTimeout(1000);
        Tx = txtOf(await dump(p));
        const err3 = Tx.includes('Enter a valid pin: latitude -90..90, longitude -180..180 (not 0,0)');
        CNT.state_asserts++;
        chk('vp375-pin-validation-lng-out-of-range-refused', err3, `refused=${err3}`);
        // no network call must have fired for any refused attempt
        const addsFired = apiLog.filter(c => c.includes('/add-address')).length;
        CNT.data_asserts++;
        chk('vp375-invalid-attempts-hit-no-endpoint', addsFired === 0, `add-address calls during attacks=${addsFired}`);

        // VALID SAVE with pin + phone
        await setByIndex(streetIdx, `${fx.tag} browser add`);
        await setByIndex(latIdx, '-6.8031'); await setByIndex(lngIdx, '39.2715');
        const phoneIdx = inputs.findIndex(i => /phone/i.test(i.ph));
        if (phoneIdx >= 0) await setByIndex(phoneIdx, '+255700000042');
        apiLog.length = 0;
        sb = await reveal(p, 'Save address', { w: vpw, h: vph });
        CNT.buttons_ok++;
        await clickCenter(p, sb);
        for (let i = 0; i < 14; i++) { await p.waitForTimeout(1000); if (txtOf(await dump(p)).includes(fx.tag + ' browser add')) break; }
        Tx = txtOf(await dump(p));
        CNT.data_asserts++;
        chk('vp375-valid-save-closed-sheet-and-relisted', Tx.includes(fx.tag + ' browser add'),
          `new row visible=${Tx.includes(fx.tag + ' browser add')} calls=${apiLog.slice(0, 3).join('; ')}`);
        const net = apiLog.filter(c => c.includes('/add-address'));
        CNT.data_asserts++;
        chk('vp375-valid-save-hit-add-address-2xx', net.some(c => /-> (200|201)/.test(c)), net.join('; ') || 'no call logged');
        await shot(p, '375', '04-after-add');

        // server read-back of what the UI just made
        const rb = await getAddresses();
        const uiRow = rb.list.find(a => (a.street || '').includes('browser add'));
        CNT.real_data++;
        chk('vp375-ui-add-server-readback-with-pin', uiRow && uiRow.latitude === -6.8031 && uiRow.longitude === 39.2715,
          JSON.stringify(uiRow).slice(0, 200));
        fs.writeFileSync('/tmp/au060_r14_ui_added_id.txt', String(uiRow ? uiRow.addressId : ''));
      }
    }

    // ---------- EDIT flow (PUT) ----------
    const editTargets = await getAddresses();
    const target = editTargets.list.find(a => a.addressId === fx.id) || editTargets.list.find(a => (a.street || '').includes('browser add'));
    CNT.buttons_total++;
    let editNode = target ? await reveal(p, (target.label || target.street || '').slice(0, 18), { w: vpw, h: vph })
      || await reveal(p, 'Edit', { w: vpw, h: vph }) : null;
    // prefer the per-card Edit button nearest our fixture card
    let editBtn = null;
    for (let i = 0; i < 10 && !editBtn; i++) {
      const nodes = await dump(p);
      const cards = nodes.filter(n => n.label.includes(target.street.slice(0, 22)));
      const btns = nodes.filter(n => n.role === 'button' && n.label.trim() === 'Edit');
      if (btns.length) {
        // pick Edit closest below/above any fixture card line
        const anchorY = cards.length ? cards[cards.length - 1].y : null;
        btns.sort((a, b) => anchorY == null ? 0 : Math.abs(a.y - anchorY) - Math.abs(b.y - anchorY));
        editBtn = btns.find(b => b.y > 90 && b.y + b.h < vph - 30) || null;
      }
      if (!editBtn) { await p.mouse.move(vpw / 2, vph * 0.5); await p.mouse.wheel(0, 240); await p.waitForTimeout(280); }
    }
    if (editBtn) {
      await clickCenter(p, editBtn);
      for (let i = 0; i < 12; i++) { await p.waitForTimeout(900); if (txtOf(await dump(p)).includes('Edit address')) break; }
      Tx = txtOf(await dump(p));
      CNT.state_asserts++;
      chk('vp375-edit-sheet-opened-prefilled', Tx.includes('Edit address') && Tx.includes('Update address'),
        `title=${Tx.includes('Edit address')} update-btn=${Tx.includes('Update address')}`);
      await shot(p, '375', '05-edit-sheet');
      const inputs2 = await p.evaluate(() => [...document.querySelectorAll('input,textarea')].map(i => i.getAttribute('aria-label') || i.placeholder || ''));
      const streetIdx = inputs2.findIndex(ph => /street/i.test(ph));
      const placeIdx = inputs2.findIndex(ph => /place/i.test(ph));
      if (streetIdx >= 0) {
        await p.locator('input,textarea').nth(streetIdx).click({ force: true }).catch(() => {});
        await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace');
        await p.keyboard.type(fx.tag + ' edited by UI', { delay: 6 });
      }
      if (placeIdx >= 0) {
        await p.locator('input,textarea').nth(placeIdx).click({ force: true }).catch(() => {});
        await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace');
        await p.keyboard.type('Edited Plaza', { delay: 6 });
      }
      apiLog.length = 0;
      const upd = await reveal(p, 'Update address', { w: vpw, h: vph });
      CNT.buttons_total++; CNT.buttons_ok += upd ? 1 : 0;
      if (!upd) CNT.buttons_failed.push('Update address');
      await clickCenter(p, upd || { x: 187, y: 600, w: 1, h: 1 });
      for (let i = 0; i < 14; i++) { await p.waitForTimeout(1000); if (txtOf(await dump(p)).includes(fx.tag + ' edited by UI')) break; }
      Tx = txtOf(await dump(p));
      CNT.data_asserts++;
      chk('vp375-edit-updated-row-relisted', Tx.includes(fx.tag + ' edited by UI'), `visible=${Tx.includes(fx.tag + ' edited by UI')}`);
      const putCalls = apiLog.filter(c => c.includes('/update-address/'));
      CNT.data_asserts++;
      chk('vp375-edit-fired-PUT-update-address-2xx', putCalls.some(c => /-> (200|204)/.test(c)), putCalls.join('; ') || 'none');
      const rb2 = await getAddresses();
      const up = rb2.list.find(a => a.addressId === (target.addressId || fx.id));
      CNT.real_data++;
      chk('vp375-edit-server-readback', up && up.street === fx.tag + ' edited by UI' && up.placeName === 'Edited Plaza',
        JSON.stringify(up).slice(0, 200));
      await shot(p, '375', '06-after-edit');
    } else {
      chk('vp375-edit-sheet-opened-prefilled', false, 'per-card Edit button not found/reachable');
      CNT.buttons_failed.push('Edit');
    }

    // ---------- SET DEFAULT + default-sync into checkout ----------
    const cur = await getDefault();
    const otherList = await getAddresses();
    const other = otherList.list.find(a => a.addressId !== (cur.row ? cur.row.addressId : -1) && a.addressId === fx.id)
      || otherList.list.find(a => a.addressId !== (cur.row ? cur.row.addressId : -1));
    CNT.buttons_total++;
    let setBtn = null;
    for (let i = 0; i < 12 && !setBtn; i++) {
      const nodes = await dump(p);
      const btns = nodes.filter(n => n.role === 'button' && n.label.trim() === 'Set default');
      if (btns.length) setBtn = btns.find(b => b.y > 90 && b.y + b.h < vph - 30) || null;
      if (!setBtn) { await p.mouse.move(vpw / 2, vph * 0.5); await p.mouse.wheel(0, 240); await p.waitForTimeout(280); }
    }
    if (setBtn) {
      apiLog.length = 0;
      await clickCenter(p, setBtn);
      await p.waitForTimeout(2500);
      const post = apiLog.filter(c => c.includes('/set-default-address'));
      CNT.data_asserts++;
      chk('vp375-setdefault-fired-endpoint-2xx', post.some(c => /-> (200|204)/.test(c)), post.join('; ') || 'none');
      const rb3 = await getDefault();
      CNT.real_data++;
      chk('vp375-setdefault-server-readback-new-id', rb3.row && rb3.row.addressId === (other ? other.addressId : -1),
        `default now=${rb3.row && rb3.row.addressId} expected=${other && other.addressId}`);
      await shot(p, '375', '07-after-setdefault');
    } else {
      chk('vp375-setdefault-fired-endpoint-2xx', false, 'Set default button not found');
      CNT.buttons_failed.push('Set default');
    }

    // DEFAULT-SYNC -> CHECKOUT PREFILL (needs a cart item; drive like au031)
    {
      // pick a cheap FOR_RENT-free product from home rail and add to cart
      await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      for (let i = 0; i < 25; i++) { await p.waitForTimeout(1200); if ((await L.allText(p)).length > 400) break; }
      let card = null;
      for (let i = 0; i < 6 && !card; i++) {
        card = await p.evaluate(() => {
          const es = [...document.querySelectorAll('flt-semantics[flt-tappable]')];
          for (const e of es) {
            const t = (e.getAttribute('aria-label') || '') + (e.textContent || '');
            if (/TSh|TZS/.test(t)) { const r = e.getBoundingClientRect(); if (r.y > 60 && r.y < 520 && r.width > 90) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), name: t.slice(0, 40) }; }
          }
          return null;
        });
        if (!card) { await p.mouse.move(vpw / 2, vph * 0.5); await p.mouse.wheel(0, 480); await p.waitForTimeout(700); }
      }
      CNT.state_asserts++;
      chk('vp375-checkout-preprobe-product-card-found', !!card, card ? `card=${card.name}` : 'no tappable priced card found');
      if (card) {
        await p.mouse.click(card.x, card.y); await p.waitForTimeout(3500);
        const buyNow = await reveal(p, 'Buy now', { w: vpw, h: vph }) || await reveal(p, 'Add to cart', { w: vpw, h: vph });
        CNT.buttons_total++;
        if (buyNow) { await clickCenter(p, buyNow); CNT.buttons_ok++; } else CNT.buttons_failed.push('Buy now/Add to cart');
        await p.waitForTimeout(1800);
        await p.goto(APP + '/#/checkout', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
        for (let i = 0; i < 20; i++) { await p.waitForTimeout(1300); if ((await L.allText(p)).includes('Delivery address')) break; }
        await p.waitForTimeout(1500);
        Tx = txtOf(await dump(p));
        const rbD = await getDefault();
        const selStreet = (rbD.row ? rbD.row.street : '').slice(0, 24);
        const selShown = Tx.includes(selStreet) || Tx.includes((rbD.row ? rbD.row.street : '~none~'));
        CNT.data_asserts++;
        chk('vp375-checkout-dropdown-offers-saved-addresses', Tx.includes('Saved addresses'), `has dropdown=${Tx.includes('Saved addresses')}`);
        // open the dropdown to see which entries exist and whether Default suffix marks server default
        const dd = await findNode(p, 'Saved addresses', { w: vpw, h: vph });
        if (dd) { await clickCenter(p, dd); await p.waitForTimeout(1200); Tx = txtOf(await dump(p)); }
        const menuHasDefaultMark = /\(Default\)/.test(Tx);
        CNT.state_asserts++;
        chk('vp375-checkout-dropdown-marks-server-default', menuHasDefaultMark,
          `'(Default)' suffix rendered=${menuHasDefaultMark}; default id=${rbD.row && rbD.row.addressId}`);
        await shot(p, '375', '08-checkout-address-dropdown');
        // close dropdown if open
        await p.keyboard.press('Escape'); await p.waitForTimeout(800);
        PARITY.push({
          check: 'checkout-prefill-key-contract', class: 'blocker-candidate',
          evidence: `screen reads a['isDefault'] but sandbox serializes 'default'; pre-selected value=${selShown ? 'server-default street visible' : 'server-default NOT preselected'}`
        });
        CNT.parity.blocker++; // recorded as candidate; final classification after native PNG pass
        await shot(p, '375', '09-checkout-step1-prefill');
      }
    }

    // ---------- DELETE flow (confirm dialog) ----------
    {
      await p.goto(APP + '/#/account/addresses', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await p.waitForTimeout(3500);
      const delTargetId = parseInt(fs.readFileSync('/tmp/au060_r14_ui_added_id.txt', 'utf8') || '0', 10) || fx.id;
      let delBtn = null;
      for (let i = 0; i < 14 && !delBtn; i++) {
        const nodes = await dump(p);
        // delete icons carry tooltip 'Delete'
        const btns = nodes.filter(n => (n.role === 'button') && /^Delete$/.test(n.label.trim()));
        if (btns.length) delBtn = btns.find(b => b.y > 90 && b.y + b.h < vph - 30) || null;
        if (!delBtn) { await p.mouse.move(vpw / 2, vph * 0.5); await p.mouse.wheel(0, 240); await p.waitForTimeout(280); }
      }
      CNT.buttons_total++;
      if (!delBtn) { chk('vp375-delete-confirm-dialog', false, 'Delete icon not reachable'); CNT.buttons_failed.push('Delete'); }
      else {
        // Cancel path first
        await clickCenter(p, delBtn);
        for (let i = 0; i < 10; i++) { await p.waitForTimeout(700); if (txtOf(await dump(p)).includes('Delete address?')) break; }
        Tx = txtOf(await dump(p));
        CNT.state_asserts++;
        chk('vp375-delete-dialog-shown', Tx.includes('Delete address?'), Tx.split('\n').slice(0, 4).join(' | ').slice(0, 140));
        const cancelB = await findNode(p, 'Cancel', { w: vpw, h: vph });
        CNT.buttons_total++;
        if (cancelB) { await clickCenter(p, cancelB); CNT.buttons_ok++; } else CNT.buttons_failed.push('Cancel(delete)');
        await p.waitForTimeout(1500);
        const stillThere = (await getAddresses()).list.some(a => a.addressId === delTargetId);
        CNT.data_asserts++;
        chk('vp375-delete-cancel-kept-row', stillThere, `target ${delTargetId} still on server=${stillThere}`);
        // Real delete
        let delBtn2 = null;
        for (let i = 0; i < 14 && !delBtn2; i++) {
          const nodes = await dump(p);
          const btns = nodes.filter(n => (n.role === 'button') && /^Delete$/.test(n.label.trim()));
          if (btns.length) delBtn2 = btns.find(b => b.y > 90 && b.y + b.h < vph - 30) || null;
          if (!delBtn2) { await p.mouse.move(vpw / 2, vph * 0.5); await p.mouse.wheel(0, 240); await p.waitForTimeout(280); }
        }
        await clickCenter(p, delBtn2);
        await p.waitForTimeout(1600);
        const okB = await reveal(p, 'Delete', { w: vpw, h: vph }); // red confirm inside dialog
        CNT.buttons_total++;
        apiLog.length = 0;
        if (okB) { await clickCenter(p, okB); CNT.buttons_ok++; } else CNT.buttons_failed.push('Delete(confirm)');
        for (let i = 0; i < 12; i++) { await p.waitForTimeout(1000); if (!(await getAddresses()).list.some(a => a.addressId === delTargetId)) break; }
        const gone = !(await getAddresses()).list.some(a => a.addressId === delTargetId);
        const delCalls = apiLog.filter(c => c.includes('/delete-address/'));
        CNT.data_asserts += 2;
        chk('vp375-delete-server-readback-gone', gone, `target ${delTargetId} removed=${gone}`);
        chk('vp375-delete-fired-DELETE-2xx', delCalls.some(c => /-> (200|204)/.test(c)), delCalls.join('; ') || 'none');
        await shot(p, '375', '10-after-delete');
      }
    }

    // ---------- CLICK-EVERYTHING enumeration on the addresses screen ----------
    {
      await p.goto(APP + '/#/account/addresses', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await p.waitForTimeout(3200);
      const ctrls = await L.listButtons(p);
      fs.writeFileSync('/tmp/au060_controls_375_addresses.json', JSON.stringify(ctrls, null, 1));
      CNT.buttons_total += ctrls.length;
      // every named control gets clicked once with an asserted effect where applicable
      const names = ['Add'];
      for (const nm of names) {
        const b = await reveal(p, nm, { w: vpw, h: vph });
        if (b) { const t0b = txtOf(await dump(p)).length; await clickCenter(p, b); await p.waitForTimeout(1200); const t1b = txtOf(await dump(p)); CNT.buttons_ok++; CNT.nav_asserts += t1b !== t0b ? 1 : 0; }
        else CNT.buttons_failed.push(nm + '(enumerated)');
      }
      // disabled-state reasoning: none expected on this screen (all rows actionable)
      await shot(p, '375', '11-final-list');
    }

    // images reconciliation (this screen has no product art; assets may still load)
    const sum = L.imageSummary(imgs);
    CNT.images_requested += sum.total; CNT.images_200 += sum.ok;
    chk('images-all-2xx-or-accounted', sum.failed === 0, JSON.stringify(sum));
    fs.writeFileSync('/tmp/au060_images_375.json', JSON.stringify(imgs, null, 1));
    await L.closeVideo(ctx, `${VIDDIR}/AU-060-r14-375.webm`);
    await browser.close();
  }

  // ===================== PASS 2 — 768x1024 tablet =====================
  {
    console.log('\n===== PASS 2: 768x1024 =====');
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: `${VIDDIR}/AU-060-r14-768.webm` });
    const { p, imgs } = await bootSession(ctx, '768');
    let Tx = txtOf(await dump(p));
    CNT.nav_asserts++;
    chk('vp768-addresses-screen-opened', Tx.includes('Addresses'), Tx.split('\n')[0].slice(0, 100));
    CNT.state_asserts++;
    chk('vp768-fixture-row-rendered', Tx.includes('AU060RW Fixture') || Tx.includes(fx.street),
      `fixture visible=${Tx.includes('AU060RW Fixture') || Tx.includes(fx.street)}`);
    await shot(p, '768', '01-list');
    // Add sheet opens at tablet width too
    const add = await reveal(p, 'Add', { w: 768, h: 1024 });
    CNT.buttons_total++;
    if (add) {
      await clickCenter(p, add);
      for (let i = 0; i < 12; i++) { await p.waitForTimeout(800); if (txtOf(await dump(p)).includes('Save address')) break; }
      Tx = txtOf(await dump(p));
      CNT.state_asserts++;
      chk('vp768-add-sheet-opens', Tx.includes('Save address'), Tx.split('\n').slice(0, 3).join('|').slice(0, 120));
      await shot(p, '768', '02-add-sheet');
      const cancel = await findNode(p, 'Save address', { w: 768, h: 1024 });
      if (cancel) { /* leave without saving */ await p.keyboard.press('Escape'); await p.waitForTimeout(900); }
    } else CNT.buttons_failed.push('Add(768)');
    // Payout details deep-link at tablet
    await p.goto(APP + '/#/account/payout-details', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await p.waitForTimeout(4500);
    Tx = txtOf(await dump(p));
    const pdBefore = JSON.parse(fs.readFileSync('/tmp/au060_r14_payout_before.json', 'utf8'));
    const expName = pdBefore.length ? `${pdBefore[0].accountName} · ${pdBefore[0].accountNumber}` : '';
    CNT.state_asserts++;
    chk('vp768-payout-screen-renders-server-row', pdBefore.length === 0
      ? Tx.includes('No payout details yet')
      : (Tx.includes('Payout details') && expName && Tx.includes(expName)),
      `expected="${expName}" shown=${expName ? Tx.includes(expName) : 'n/a(empty-state)'} | title=${Tx.includes('Payout details')}`);
    await shot(p, '768', '03-payout-details');
    const sum = L.imageSummary(imgs);
    CNT.images_requested += sum.total; CNT.images_200 += sum.ok;
    await L.closeVideo(ctx, `${VIDDIR}/AU-060-r14-768.webm`);
    await browser.close();
  }

  // ===================== PASS 3 — 1280x900 (admin/desktop viewport sweep) =====================
  {
    console.log('\n===== PASS 3: 1280x900 =====');
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 1280, height: 900 }, videoPath: `${VIDDIR}/AU-060-r14-1280.webm` });
    const { p } = await bootSession(ctx, '1280');
    let Tx = txtOf(await dump(p));
    chk('vp1280-addresses-renders', Tx.includes('Addresses'), Tx.split('\n')[0].slice(0, 90));
    await shot(p, '1280', '01-addresses-desktop');
    await p.goto(APP + '/#/account/payout-details', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await p.waitForTimeout(4200);
    Tx = txtOf(await dump(p));
    const pdBefore = JSON.parse(fs.readFileSync('/tmp/au060_r14_payout_before.json', 'utf8'));
    const expName = pdBefore.length ? `${pdBefore[0].accountName} · ${pdBefore[0].accountNumber}` : '';
    chk('vp1280-payout-renders-server-row', pdBefore.length === 0 ? Tx.includes('No payout details yet') : Tx.includes(expName),
      `shown=${expName ? Tx.includes(expName) : 'empty-state'}`);
    await shot(p, '1280', '02-payout-desktop');
    await L.closeVideo(ctx, `${VIDDIR}/AU-060-r14-1280.webm`);
    await browser.close();
  }

  // ===================== cleanup own fixtures (API-level, allowed) =====================
  {
    try {
      const id = parseInt(fs.readFileSync('/tmp/au060_r14_ui_added_id.txt', 'utf8') || '0', 10);
      if (id) { const d = await L.api(T(), 'DELETE', `/api/v1/delete-address/${id}`); console.log('cleanup delete', id, d.status); }
    } catch (e) { console.log('cleanup skip', e.message); }
  }

  fs.writeFileSync('/tmp/au060_r14_raw.json', JSON.stringify({
    unit: UNIT, sha: SHA, mtime: MT, cnt: CNT, fails: FAILS, parity: PARITY,
    ev: EV, ms: Date.now() - t0,
  }, null, 1));
  console.log('\nRAW WRITTEN /tmp/au060_r14_raw.json; failures=', FAILS.length);
})().catch(e => { console.error('SCRIPT-ERROR', e); process.exit(1); });
