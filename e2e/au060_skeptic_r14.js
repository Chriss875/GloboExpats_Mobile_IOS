// au060_skeptic_r14.js — AU-060 SKEPTIC: attack the verifier PASS surface. >=6 attack classes.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9131'; L.APP = APP;
const OUTDIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-060';
const T = () => fs.readFileSync('/tmp/au060.tok', 'utf8').trim();
const FINDINGS = [], ATTACKS = [];
function att(name, verdict, ev) {
  ATTACKS.push(name);
  const line = { attack: name, verdict, evidence: String(ev ?? '').slice(0, 400) };
  console.log(verdict, '|', name, '|', String(ev ?? '').slice(0, 200));
  fs.appendFileSync('/tmp/au060_sk_trace.jsonl', JSON.stringify({ ts: new Date().toISOString(), ...line }) + '\n');
  if (verdict === 'BROKEN') FINDINGS.push(line);
}
async function dump(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => {
    const r = e.getBoundingClientRect();
    return { role: e.getAttribute('role') || '', tap: e.getAttribute('flt-tappable') !== null,
      label: (e.getAttribute('aria-label') || e.textContent || '').trim(),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }).filter(n => n.label));
}
const txtOf = N => N.map(n => n.label).join('\n');

(async () => {
  const token = await L.apiLogin();
  const tag = 'sk060' + Date.now().toString().slice(-6);

  // ---- A1: independent reproduction of checkout default-ignore (API + fresh browser context) ----
  {
    const lst = await (await fetch(`${L.API}/api/v1/get-addresses`, { headers: { Authorization: 'Bearer ' + token } })).json();
    // pick the LAST row as default (maximally distinguishable from first-item fallback)
    const victim = lst[lst.length - 1];
    await L.api(T(), 'POST', `/api/v1/set-default-address?addressId=${victim.addressId}`, {});
    let g = null; try { g = await (await fetch(`${L.API}/api/v1/get-default-address`, { headers: { Authorization: 'Bearer ' + token } })).json(); } catch (e) { g = null; }
    const b = await L.newBrowser(); const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    await p.addInitScript(t => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, token);
    await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 25; i++) { await p.waitForTimeout(1300); if ((await L.allText(p)).length > 200) break; }
    // seed cart via API-free path: use product page Buy now on first priced card
    let card = null;
    for (let i = 0; i < 6 && !card; i++) {
      card = await p.evaluate(() => {
        const es = [...document.querySelectorAll('flt-semantics[flt-tappable]')];
        for (const e of es) { const t = (e.getAttribute('aria-label') || '') + (e.textContent || '');
          if (/TSh/.test(t)) { const r = e.getBoundingClientRect(); if (r.y > 60 && r.y < 520 && r.width > 90) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; } }
        return null; });
      if (!card) { await p.mouse.move(180, 340); await p.mouse.wheel(0, 480); await p.waitForTimeout(600); }
    }
    let reachedCheckout = false;
    if (card) {
      await p.mouse.click(card.x, card.y); await p.waitForTimeout(3000);
      const nodes = await dump(p);
      const buy = nodes.find(n => n.role === 'button' && /Buy now|Add to cart/.test(n.label));
      if (buy) { await p.mouse.click(buy.x, buy.y); await p.waitForTimeout(1500); }
      await p.evaluate(() => { window.location.hash = '#/checkout'; });
      for (let i = 0; i < 20; i++) { await p.waitForTimeout(1200); if ((await L.allText(p)).includes('Delivery address')) { reachedCheckout = true; break; } }
      await p.waitForTimeout(1600);
    }
    if (reachedCheckout) {
      const dd = (await dump(p)).find(n => n.role === 'button' && n.label.includes('Saved addresses'));
      let menu = '';
      if (dd) { await p.mouse.click(dd.x + 40, Math.min(dd.y + 12, 650)); await p.waitForTimeout(1300); menu = txtOf(await dump(p)); }
      const markedDefault = /\(Default\)/.test(menu);
      const victimInMenuWithMark = markedDefault && menu.includes(String(victim.street).slice(0, 18));
      att('A1-checkout-ignores-server-default', victimInMenuWithMark ? 'HELD' : 'BROKEN',
        `server default=${victim.addressId}:${victim.street}; '(Default)' marker in menu=${markedDefault}`);
      await p.screenshot({ path: `${OUTDIR}/AU-060-sk-A1-checkout-dropdown.png` }).catch(() => {});
    } else att('A1-checkout-ignores-server-default', 'DISPUTED', 'could not reach checkout (cart seed failed)');
    await b.close();
  }

  // ---- A2/A3: UI-create-drops-pin + pull-to-refresh mitigation (768 viewport) ----
  {
    const b = await L.newBrowser();
    const ctx = await L.newCtx(b, { viewport: { width: 768, height: 1024 }, videoPath: `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-060-sk-A23.webm` });
    const p = await ctx.newPage();
    await p.addInitScript(t => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, token);
    await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 25; i++) { await p.waitForTimeout(1300); if ((await L.allText(p)).length > 200) break; }
    await p.evaluate(() => { window.location.hash = '#/account/addresses'; });
    for (let i = 0; i < 25; i++) { await p.waitForTimeout(1300); if ((await L.allText(p)).includes('Addresses')) break; }
    await p.waitForTimeout(2000);
    // open Add (AppBar button at top-right)
    const add = (await dump(p)).filter(n => n.role === 'button' && n.label.trim() === 'Add')[0];
    if (!add) { att('A2-ui-create-drops-pin', 'DISPUTED', 'Add not found'); att('A3-pull-to-refresh-mitigation', 'DISPUTED', 'skip'); }
    else {
      await p.mouse.click(add.x + add.w / 2, 24);
      for (let i = 0; i < 12; i++) { await p.waitForTimeout(800); if (txtOf(await dump(p)).includes('Save address')) break; }
      const inputs = await p.evaluate(() => [...document.querySelectorAll('input,textarea')].map((el, k) => ({ k, ph: el.getAttribute('aria-label') || el.placeholder || '' })));
      const find = re => inputs.find(x => re.test(x.ph));
      const setF = async (f, v) => { await p.locator('input,textarea').nth(f.k).click({ force: true }).catch(()=>{}); await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace'); await p.keyboard.type(v, { delay: 6 }); await p.waitForTimeout(150); };
      await setF(find(/label/i), tag);
      await setF(find(/street/i), `${tag} sk lane`);
      await setF(find(/latitude/i), '-6.7001');
      await setF(find(/longitude/i), '39.3001');
      const sv = (await dump(p)).find(n => n.role === 'button' && n.label.includes('Save address'));
      await p.mouse.click(sv.x + sv.w / 2, Math.min(sv.y + 10, 1010));
      await p.waitForTimeout(3500);
      const lst = await (await fetch(`${L.API}/api/v1/get-addresses`, { headers: { Authorization: 'Bearer ' + token } })).json();
      const mine = lst.find(a => (a.street || '').includes(tag));
      att('A2-ui-create-drops-pin', mine && mine.latitude == null ? 'BROKEN' : 'HELD',
        JSON.stringify(mine || lst.slice(-2)).slice(0, 220));
      // A3: pull-to-refresh (RefreshIndicator) — drag down at list top
      await p.mouse.move(384, 300); await p.mouse.down();
      for (let yy = 300; yy <= 720; yy += 30) { await p.mouse.move(384, yy, { steps: 2 }); await p.waitForTimeout(40); }
      await p.mouse.up(); await p.waitForTimeout(2500);
      let vis = false;
      for (let i = 0; i < 10 && !vis; i++) { if (txtOf(await dump(p)).includes(`${tag} sk lane`)) vis = true; else { await p.mouse.wheel(0, 320); await p.waitForTimeout(300); } }
      att('A3-pull-to-refresh-recovers-stale-list', vis ? 'HELD' : 'BROKEN',
        `row visible after RefreshIndicator pull + wheel=${vis}`);
      await p.screenshot({ path: `${OUTDIR}/AU-060-sk-A3-after-pull.png` }).catch(() => {});
      if (mine) await L.api(T(), 'DELETE', `/api/v1/delete-address/${mine.addressId}`, {});
    }
    await ctx.close(); await b.close();
  }

  // ---- A4: delete the CURRENT default address — default pointer integrity ----
  {
    const mk = await L.api(T(), 'POST', '/api/v1/add-address', { street: `${tag} default-victim`, city: 'Dar', country: 'Tanzania', label: 'SKVICTIM' });
    const vid = mk.json.addressId;
    await L.api(T(), 'POST', `/api/v1/set-default-address?addressId=${vid}`, {});
    let before = null; try { before = await (await fetch(`${L.API}/api/v1/get-default-address`, { headers: { Authorization: 'Bearer ' + token } })).json(); } catch (e) { before = null; }
    const del = await L.api(T(), 'DELETE', `/api/v1/delete-address/${vid}`, {});
    const after = await fetch(`${L.API}/api/v1/get-default-address`, { headers: { Authorization: 'Bearer ' + token }, redirect: 'manual' });
    let bodyTxt = '';
    if (after.status === 200) { try { bodyTxt = JSON.stringify(await after.json()).slice(0, 120); } catch (e) { bodyTxt = '<empty-body>'; } }
    const sane = after.status !== 500 && (!bodyTxt.includes(vid));
    att('A4-delete-default-leaves-no-dangling-pointer', sane && del.status === 204 ? 'HELD' : 'BROKEN',
      `deleted ${vid} -> ${del.status}; get-default now HTTP ${after.status} ${bodyTxt}`);
    // restore a stable default (previous non-deleted row) for other lanes
    const lst = await (await fetch(`${L.API}/api/v1/get-addresses`, { headers: { Authorization: 'Bearer ' + token } })).json();
    const restore = lst.find(a => a.default !== true);
    if (restore) await L.api(T(), 'POST', `/api/v1/set-default-address?addressId=${restore.addressId}`, {});
  }

  // ---- A5: cross-user set-default authorization ----
  {
    // addressId 1 belongs to some other seeded user (ids here start far higher)
    const r = await L.api(T(), 'POST', '/api/v1/set-default-address?addressId=1', {});
    let g = null; try { g = await (await fetch(`${L.API}/api/v1/get-default-address`, { headers: { Authorization: 'Bearer ' + token } })).json(); } catch (e) { g = null; }
    const stole = g && g.addressId === 1;
    att('A5-crossuser-setdefault-refused', (r.status >= 400 || !stole) ? 'HELD' : 'BROKEN',
      `set-default(addressId=1, not ours) HTTP ${r.status}; our default=${g && g.addressId}`);
  }

  // ---- A6: hostile strings in address fields (render + persistence safety) ----
  {
    const longStreet = 'X'.repeat(200) + ` ${tag}`;
    const mk = await L.api(T(), 'POST', '/api/v1/add-address', { street: longStreet, city: '<script>alert(1)</script>', country: 'Tanzania', label: `${tag} 😅 ünïcode` });
    const okCreated = mk.status === 201 || mk.status === 200;
    const id = mk.json && mk.json.addressId;
    const b = await L.newBrowser(); const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    await p.addInitScript(t => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, token);
    await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 25; i++) { await p.waitForTimeout(1300); if ((await L.allText(p)).length > 200) break; }
    await p.evaluate(() => { window.location.hash = '#/account/addresses'; });
    for (let i = 0; i < 25; i++) { await p.waitForTimeout(1300); if ((await L.allText(p)).includes('Addresses')) break; }
    await p.waitForTimeout(2200);
    // scroll to bottom hunting the long row; watch for RenderFlex overflow stripes
    let seenRow = false, overflowStripe = false;
    for (let i = 0; i < 16 && !seenRow; i++) {
      const t = txtOf(await dump(p));
      if (t.includes(tag) || t.includes('XXXX')) seenRow = true; // rendered text may wrap/ellipsize
      else { await p.mouse.move(180, 380); await p.mouse.wheel(0, 340); await p.waitForTimeout(260); }
    }
    const buf = await p.screenshot().catch(() => null);
    if (buf) {
      // yellow/black overflow stripes detection: scan bottom third for saturated yellow runs
      const { width, height, rows } = (() => { try { return decodeMinimal(buf); } catch (e) { return {}; } })();
      if (rows) {
        for (let y = Math.floor(height * 0.66); y < height; y += 4) {
          let yell = 0;
          for (let x = 0; x < width; x += 4) { const o = x * 3; const R = rows[y][o], G = rows[y][o + 1], B = rows[y][o + 2]; if (R > 200 && G > 170 && B < 90) yell++; }
          if (yell > width / 4 / 2) { overflowStripe = true; break; }
        }
      }
    }
    att('A6-hostile-input-row-renders-no-overflow', okCreated && seenRow && !overflowStripe ? 'HELD' : 'BROKEN',
      `created=${okCreated} rowRendered=${seenRow} overflowStripe=${overflowStripe} (street 300ch, script-tag city, emoji label)`);
    await p.screenshot({ path: `${OUTDIR}/AU-060-sk-A6-long-row.png` }).catch(() => {});
    await b.close();
    if (id) await L.api(T(), 'DELETE', `/api/v1/delete-address/${id}`, {});
  }

  // ---- A7: payout PUT with rule-violating number — is the 400 surfaced, not swallowed? ----
  {
    const b = await L.newBrowser(); const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    const respLog = [];
    p.on('response', r => { if (/localhost:8083/.test(r.url()) && r.request().method() === 'PUT') respLog.push(`${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });
    await p.addInitScript(t => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, token);
    await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 25; i++) { await p.waitForTimeout(1300); if ((await L.allText(p)).length > 200) break; }
    await p.evaluate(() => { window.location.hash = '#/account/payout-details'; });
    for (let i = 0; i < 25; i++) { await p.waitForTimeout(1300); if ((await L.allText(p)).includes('Payout details')) break; }
    await p.waitForTimeout(2000);
    // FAB bottom-right
    await p.mouse.click(305, 577); await p.waitForTimeout(1800);
    let open = false;
    for (let i = 0; i < 8 && !open; i++) { open = txtOf(await dump(p)).includes('Add payout details'); if (!open) { await p.mouse.click(305, 577); await p.waitForTimeout(1500); } }
    if (!open) { att('A7-payout-invalid-number-error-surfaced', 'DISPUTED', 'sheet never opened'); }
    else {
      const inputs = await p.evaluate(() => [...document.querySelectorAll('input,textarea')].map((el, k) => ({ k, ph: el.getAttribute('aria-label') || el.placeholder || '' })));
      const setF = async (f, v) => { await p.locator('input,textarea').nth(f.k).click({ force: true }).catch(()=>{}); await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace'); await p.keyboard.type(v, { delay: 6 }); await p.waitForTimeout(150); };
      // stay MOBILE_MONEY (default) but give a LETTER-bearing number -> telecom rule wants digits
      await setF(inputs[1], 'Sk Attack Provider');
      await setF(inputs[2], 'SK Attack Holder');
      await setF(inputs[3], 'ABCD12345');
      const sv = (await dump(p)).filter(n => n.role === 'button' && n.label.trim() === 'Save')[0];
      respLog.length = 0;
      if (sv) { await p.mouse.click(sv.x + sv.w / 2, Math.min(sv.y + 10, 650)); }
      await p.waitForTimeout(3000);
      const t400 = respLog.find(s => s.startsWith('400'));
      const sheetStillOpen = txtOf(await dump(p)).includes('Add payout details');
      const errShown = /Could not save/.test(txtOf(await dump(p)));
      att('A7-payout-invalid-number-error-surfaced', t400 && sheetStillOpen ? 'HELD' : 'BROKEN',
        `PUT 400 logged=${!!t400}; sheet stays open=${sheetStillOpen}; 'Could not save' visible=${errShown} (${respLog.join(',')})`);
      await p.screenshot({ path: `${OUTDIR}/AU-060-sk-A7-payout-400.png` }).catch(() => {});
    }
    await b.close();
    // ensure no junk row persisted
    const pd = await (await fetch(`${L.API}/api/v1/userManagement/payout-details`, { headers: { Authorization: 'Bearer ' + token } })).json();
    const junk = pd.find(r => r.accountName === 'SK Attack Holder');
    if (junk) await L.api(T(), 'DELETE', `/api/v1/userManagement/payout-details/${junk.id}`, {});
  }

  // ---- A8: unauthenticated access to ungated /account/payout-details ----
  {
    const b = await L.newBrowser(); const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    const net = [];
    p.on('response', r => { if (/localhost:8083|9131/.test(r.url())) net.push(`${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0]} -> ${r.status()}`); });
    await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 25; i++) { await p.waitForTimeout(1300); if ((await L.allText(p)).length > 200) break; }
    await p.evaluate(() => { window.location.hash = '#/account/payout-details'; });
    for (let i = 0; i < 16; i++) { await p.waitForTimeout(1200); if ((await L.allText(p)).includes('Login') || (await L.allText(p)).includes('Could not load')) break; }
    const tx = txtOf(await dump(p));
    const sawLoginGate = tx.includes('Welcome back') || /\bLogin\b/.test(tx);
    const sawFriendlyError = tx.includes('Could not load');
    const rawLeak = /ClientException|Failed host lookup|Connection refused|FormatException/.test(tx);
    // data-leak check: did ANY :8083 call carry our rows? (no token in this context -> must be none)
    const leakedRows = /Mobile Test|\+255712000111/.test(tx);
    att('A8-anon-payout-route-gates-or-friendly-fails', (sawLoginGate || sawFriendlyError || !leakedRows) && !rawLeak ? (leakedRows ? 'BROKEN' : 'HELD') : 'BROKEN',
      `loginGate=${sawLoginGate} friendlyError=${sawFriendlyError} rawLeak=${rawLeak} dataLeak=${leakedRows}; screen text head=${tx.slice(0, 90).replace(/\n/g, '|')}`);
    await p.screenshot({ path: `${OUTDIR}/AU-060-sk-A8-anon-payout.png` }).catch(() => {});
    await b.close();
  }

  // ---- A9: verify verifier's own claim "images 48/48" is reproducible on reload of addresses+payout
  {
    const b = await L.newBrowser(); const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    const imgs = {};
    p.on('response', r => { const u = r.url(); if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgs[u] = r.status(); });
    await p.addInitScript(t => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, token);
    await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 25; i++) { await p.waitForTimeout(1300); if ((await L.allText(p)).length > 200) break; }
    await p.evaluate(() => { window.location.hash = '#/account/addresses'; });
    await p.waitForTimeout(5000);
    const vals = Object.values(imgs);
    const broken = Object.entries(imgs).filter(([, s]) => s >= 400);
    att('A9-image-recon-repeat-clean', broken.length === 0 ? 'HELD' : 'BROKEN',
      `${vals.filter(s => s === 200 || s === 304).length}/${vals.length} ok; broken=${JSON.stringify(broken).slice(0, 120)}`);
    await b.close();
  }

  function decodeMinimal(buf) {
    const zlib = require('zlib');
    let pos = 8, idat = [], w = 0, h = 0, ct = -1;
    while (pos < buf.length) {
      const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
      if (type === 'IHDR') { w = buf.readUInt32BE(pos + 8); h = buf.readUInt32BE(pos + 12); ct = buf[pos + 17]; }
      else if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len));
      else if (type === 'IEND') break;
      pos += 12 + len;
    }
    if (!w || ct !== 2) return {};
    let raw; try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch (e) { return {}; }
    const stride = 1 + w * 3, rows = new Array(h); let prev = Buffer.alloc(w * 3);
    for (let y = 0; y < h; y++) {
      const off = y * stride, f = raw[off], line = raw.subarray(off + 1, off + stride), out = Buffer.alloc(w * 3);
      if (f === 0) line.copy(out);
      else if (f === 1) for (let i = 0; i < out.length; i++) out[i] = (line[i] + (i >= 3 ? out[i - 3] : 0)) & 255;
      else if (f === 2) for (let i = 0; i < out.length; i++) out[i] = (line[i] + prev[i]) & 255;
      else if (f === 3) for (let i = 0; i < out.length; i++) { const a = i >= 3 ? out[i - 3] : 0, b = prev[i]; out[i] = (line[i] + ((a + b) >> 1)) & 255; }
      else if (f === 4) for (let i = 0; i < out.length; i++) {
        const A = i >= 3 ? out[i - 3] : 0, B = prev[i], C = i >= 3 ? prev[i - 3] : 0, pp = A + B - C;
        const pa = Math.abs(pp - A), pb = Math.abs(pp - B), pc = Math.abs(pp - C);
        const pr = pa <= pb && pa <= pc ? A : (pb <= pc ? B : C);
        out[i] = (line[i] + pr) & 255;
      }
      rows[y] = out; prev = out;
    }
    return { width: w, height: h, rows };
  }

  console.log('\nATTACKS:', ATTACKS.length, 'BROKEN:', FINDINGS.length);
  fs.writeFileSync('/tmp/au060_sk_summary.json', JSON.stringify({ attacks: ATTACKS.length, findings: FINDINGS }, null, 1));
})().catch(e => { console.error('SCRIPT-ERROR', e); process.exit(1); });
