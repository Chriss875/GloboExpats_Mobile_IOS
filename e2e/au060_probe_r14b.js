// au060_verify_r14b.js — AU-060 focused probes settling the r14a FAILs.
// P1: does the ADD sheet really DROP lat/lng on create? (capture POST body verbatim)
//     + does the new row appear after scrolling (lazy ListView)?
// P2: per-card targeting (anchor card by unique street -> nearest action button) for
//     set-default/edit/delete so server read-back matches the intended card.
// P3: checkout dropdown verbatim — is server default marked/selected? (key-mismatch proof)
// P4: payout details FORM end-to-end in browser: create via PUT collection path,
//     method-dropdown label switch, server read-back, cleanup of OWN row only.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9131'; L.APP = APP;
const OUTDIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-060';
const VIDDIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos';
const TRACE = '/tmp/au060_r14b_trace.jsonl';
const T = () => fs.readFileSync('/tmp/au060.tok', 'utf8').trim();

function chk(name, ok, ev) {
  fs.appendFileSync(TRACE, JSON.stringify({ ts: new Date().toISOString(), check: name, ok: !!ok, evidence: String(ev ?? '').slice(0, 700) }) + '\n');
  console.log(ok ? 'PASS' : 'FAIL', '|', name, '|', String(ev ?? '').slice(0, 240));
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
async function shot(p, vp, state) { return L.screenshot(p, `${OUTDIR}/AU-060-r14b-${vp}-${state}.png`); }
async function clickC(p, n) {
  const cy = Math.min(Math.max(n.y + Math.min(n.h, 24) / 2, 16), 650);
  await p.mouse.click(n.x + n.w / 2, cy); await p.waitForTimeout(1000);
}
async function findNode(p, want, vp) {
  const nodes = await dump(p);
  let best = null;
  for (const n of nodes) {
    if (!n.label.includes(want)) continue;
    if (!(n.role === 'button' || n.tap)) continue;
    if (n.w < 4 || n.h < 1 || n.y < 0 || n.y > vp.h - 8) continue; // AppBar TextButton rects can be h~2
    if (!best || n.w * n.h < best.w * best.h) best = n;
  }
  return best;
}
// action button belonging to the card whose text anchors `streetPart`
async function cardButton(p, streetPart, action, vp) {
  for (let i = 0; i < 16; i++) {
    const nodes = await dump(p);
    const anchor = nodes.filter(n => n.label.includes(streetPart))
      .sort((a, b) => (a.w * a.h) - (b.w * b.h))[0];
    const btns = nodes.filter(n => n.role === 'button' && n.label.trim() === action && n.y > 90 && n.y + n.h < vp.h - 20);
    if (anchor && btns.length) {
      // nearest button BELOW-or-near the anchor text within one card height
      const cands = btns.map(b => ({ b, d: Math.abs(b.y - anchor.y) })).sort((m, n) => m.d - n.d);
      const win = cands.filter(c => c.d <= 170);
      if (win.length) { const b = win[0].b; if (b.y + b.h < vp.h - 10 && b.x >= 0 && b.x + b.w <= vp.w) return b; }
    }
    const dir = !anchor ? 1 : (anchor.y > vp.h * 0.55 ? 1 : -1);
    await p.mouse.move(vp.w / 2 - 8, vp.h * 0.5); await p.mouse.wheel(0, dir * 220); await p.waitForTimeout(260);
  }
  return null;
}

(async () => {
  const tag = 'au060r14b' + Date.now().toString().slice(-6);

  // ---------- PASS 1: add-sheet POST body + lazy list ----------
  let addedRowId = null;
  {
    console.log('\n== P1 add-sheet payload probe (375x667) ==');
    const b = await L.newBrowser();
    const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 }, videoPath: `${VIDDIR}/AU-060-r14b-p1-add.webm` });
    const token = await L.apiLogin();
    const p = await ctx.newPage(); p.setDefaultTimeout(30000);
    const posts = [];
    p.on('request', r => { if (/localhost:8083/.test(r.url()) && r.method() !== 'GET') posts.push({ m: r.method(), u: r.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0], body: (r.postData() || '').slice(0, 400) }); });
    await p.addInitScript(t => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, token);
    await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 25; i++) { await p.waitForTimeout(1400); if ((await L.allText(p)).length > 200) break; }
    await p.evaluate(() => { window.location.hash = '#/account/addresses'; });
    let addrOk = false;
    for (let i = 0; i < 25 && !addrOk; i++) { await p.waitForTimeout(1400); if ((await L.allText(p)).includes('Addresses')) addrOk = true; }
    chk('p1-addresses-screen-reached', addrOk, 'hash nav from booted home');
    await p.waitForTimeout(2200);
    const vp = { w: 375, h: 667 };
    let add = null;
    for (let i = 0; i < 12 && !add; i++) {
      await p.waitForTimeout(1200);
      add = await findNode(p, 'Add', vp);
    }
    chk('p1-add-button-located', !!add, add ? `at ${add.x},${add.y} w${add.w}` : 'Add not in tree');
    if (!add) throw new Error('Add button never appeared');
    await clickC(p, add);
    for (let i = 0; i < 12; i++) { await p.waitForTimeout(800); if (txtOf(await dump(p)).includes('Save address')) break; }
    const inputs = await p.evaluate(() => [...document.querySelectorAll('input,textarea')].map(i => i.getAttribute('aria-label') || i.placeholder || ''));
    const idxOf = re => inputs.findIndex(ph => re.test(ph));
    const set = async (idx, val) => {
      await p.locator('input,textarea').nth(idx).click({ force: true }).catch(() => {});
      await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace'); await p.waitForTimeout(150);
      if (val) await p.keyboard.type(val, { delay: 7 }); await p.waitForTimeout(180);
    };
    await set(idxOf(/label/i), tag);
    await set(idxOf(/street/i), `${tag} pin lane`);
    await set(idxOf(/latitude/i), '-6.8123');
    await set(idxOf(/longitude/i), '39.2655');
    await shot(p, '375', 'p1-filled-before-save');
    posts.length = 0;
    const sv = await findNode(p, 'Save address', vp);
    await clickC(p, sv);
    await p.waitForTimeout(3500);
    const addPost = posts.find(x => x.u.includes('/add-address'));
    let bodyLatNull = true, bodyHasPin = false;
    if (addPost) { try { const j = JSON.parse(addPost.body); bodyLatNull = j.latitude == null && j.longitude == null; bodyHasPin = 'latitude' in j || 'longitude' in j; } catch (e) {} }
    chk('p1-add-post-body-drops-pin', !!(addPost && bodyLatNull),
      `POST /add-address body=${addPost ? addPost.body : 'none'} pinKeysPresent=${bodyHasPin}`);
    // server truth
    const lst = await (await fetch(`${L.API}/api/v1/get-addresses`, { headers: { Authorization: 'Bearer ' + token } })).json();
    const mine = lst.find(a => (a.street || '').includes(tag));
    addedRowId = mine ? mine.addressId : null;
    chk('p1-created-row-pin-null-on-server', mine && mine.latitude == null,
      JSON.stringify(mine).slice(0, 220));
    // does the UI eventually show it (scroll to bottom)?
    await p.waitForTimeout(1500);
    let seen = false;
    for (let i = 0; i < 14 && !seen; i++) {
      const t = txtOf(await dump(p));
      if (t.includes(`${tag} pin lane`)) { seen = true; break; }
      await p.mouse.move(180, 380); await p.mouse.wheel(0, 320); await p.waitForTimeout(320);
    }
    chk('p1-new-row-visible-after-scroll', seen, `row '${tag} pin lane' in a11y tree after wheel=${seen}`);
    await shot(p, '375', 'p1-after-scroll-bottom');
    await L.closeVideo(ctx, `${VIDDIR}/AU-060-r14b-p1-add.webm`);
    await b.close();
  }

  // ---------- PASS 2+3: per-card CRUD targeting + checkout default sync ----------
  let defMovedTo = null;
  {
    console.log('\n== P2/P3 per-card CRUD + checkout sync (375x667) ==');
    const b = await L.newBrowser();
    const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 }, videoPath: `${VIDDIR}/AU-060-r14b-p23-crud.webm` });
    const token = await L.apiLogin();
    const p = await ctx.newPage(); p.setDefaultTimeout(30000);
    const calls = [];
    p.on('request', r => { if (/localhost:8083/.test(r.url()) && r.method() !== 'GET') calls.push({ m: r.method(), u: r.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0], s: 0 }); });
    p.on('response', r => { const c = calls.find(x => x.m === r.request().method() && r.url().includes(x.u.split('?')[0]) && x.s === 0); if (c) c.s = r.status(); });
    await p.addInitScript(t => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, token);
    const vp = { w: 375, h: 667 };

    // seed a dedicated editable row via REAL API (our own)
    const mk = await L.api(T(), 'POST', '/api/v1/add-address', { street: `${tag} crud rd`, city: 'Dar es Salaam', country: 'Tanzania', label: 'AU060B CRUD' });
    const crudId = mk.json && mk.json.addressId;
    chk('p2-seed-crud-row', mk.status === 201 && !!crudId, `HTTP ${mk.status} id=${crudId}`);

    await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 25; i++) { await p.waitForTimeout(1400); if ((await L.allText(p)).length > 200) break; }
    await p.evaluate(() => { window.location.hash = '#/account/addresses'; });
    for (let i = 0; i < 25; i++) { await p.waitForTimeout(1400); if ((await L.allText(p)).includes('Addresses')) break; }
    await p.waitForTimeout(2200);

    // SET DEFAULT on OUR card
    const sd = await cardButton(p, `${tag} crud rd`, 'Set default', vp);
    chk('p2-setdefault-button-found-on-card', !!sd, sd ? `at ${sd.x},${sd.y}` : 'not found');
    if (sd) {
      calls.length = 0;
      await clickC(p, sd);
      await p.waitForTimeout(2800);
      const call = calls.find(c => c.u.includes('/set-default-address'));
      chk('p2-setdefault-call-status', call && (call.s === 200 || call.s === 204), JSON.stringify(call || calls.slice(0, 3)));
      const g = await (await fetch(`${L.API}/api/v1/get-default-address`, { headers: { Authorization: 'Bearer ' + token } })).json();
      defMovedTo = g && g.addressId;
      chk('p2-default-readback-is-our-card', defMovedTo === crudId, `default=${defMovedTo} expected=${crudId} (${g && g.street})`);
      await shot(p, '375', 'p2-default-badge');
      // badge now on our card?
      let t = '';
      for (let i = 0; i < 12 && !t; i++) { const nodes = await dump(p); const a = nodes.filter(n => n.label.includes(`${tag} crud rd`)).sort((x, y) => x.w * x.h - y.w * y.h)[0]; if (a) t = a.label; else { await p.mouse.move(vp.w / 2, vp.h * .5); await p.mouse.wheel(0, 220); await p.waitForTimeout(260); } }
      chk('p2-badge-renders-on-defaulted-card', /Default/.test(t), t.slice(0, 140));
    }

    // EDIT our card
    const ed = await cardButton(p, `${tag} crud rd`, 'Edit', vp);
    chk('p2-edit-button-found-on-card', !!ed, ed ? `at ${ed.x},${ed.y}` : 'not found');
    if (ed) {
      await clickC(p, ed);
      for (let i = 0; i < 12; i++) { await p.waitForTimeout(800); if (txtOf(await dump(p)).includes('Edit address')) break; }
      const inputs = await p.evaluate(() => [...document.querySelectorAll('input,textarea')].map(i => i.getAttribute('aria-label') || i.placeholder || ''));
      const si = inputs.findIndex(x => /street/i.test(x));
      await p.locator('input,textarea').nth(si).click({ force: true }).catch(() => {});
      await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace');
      await p.keyboard.type(`${tag} crud edited`, { delay: 7 });
      calls.length = 0;
      const upd = await findNode(p, 'Update address', vp);
      await clickC(p, upd);
      for (let i = 0; i < 12; i++) { await p.waitForTimeout(1100); const l = (await fetch(`${L.API}/api/v1/get-addresses`, { headers: { Authorization: 'Bearer ' + token } })).json(); const row = (Array.isArray(l) ? l : []).find(a => a.addressId === crudId); if (row && row.street === `${tag} crud edited`) break; }
      const putc = calls.find(c => c.u.includes('/update-address/'));
      chk('p2-edit-put-fired', putc && (putc.s === 200 || putc.s === 204), JSON.stringify(putc || calls.slice(0, 3)));
      const l2 = (await (await fetch(`${L.API}/api/v1/get-addresses`, { headers: { Authorization: 'Bearer ' + token } })).json());
      const row2 = l2.find(a => a.addressId === crudId);
      chk('p2-edit-server-readback', row2 && row2.street === `${tag} crud edited`, JSON.stringify(row2).slice(0, 160));
      // updated text visible in list after scroll
      let vis = false;
      for (let i = 0; i < 12 && !vis; i++) { if (txtOf(await dump(p)).includes(`${tag} crud edited`)) vis = true; else { await p.mouse.move(vp.w / 2, vp.h * .5); await p.mouse.wheel(0, 240); await p.waitForTimeout(280); } }
      chk('p2-edited-row-renders-in-list', vis, `visible=${vis}`);
      await shot(p, '375', 'p2-after-edit');
    }

    // DELETE our card (confirm dialog, red Delete)
    const db = await cardButton(p, `${tag} crud edited`, 'Delete', vp);
    chk('p2-delete-button-found-on-card', !!db, db ? `at ${db.x},${db.y}` : 'not found');
    if (db) {
      await clickC(p, db);
      for (let i = 0; i < 10; i++) { await p.waitForTimeout(700); if (txtOf(await dump(p)).includes('Delete address?')) break; }
      const dtxt = txtOf(await dump(p));
      const dlgLine = (dtxt.split('\n').find(l => l.includes('will be removed')) || '').slice(0, 120);
      chk('p2-dialog-names-target', dlgLine.includes(`${tag} crud edited`), dlgLine || 'no dialog line');
      await shot(p, '375', 'p2-delete-dialog');
      calls.length = 0;
      // confirm button is the FILLED 'Delete' inside dialog (exact match)
      const nodes = await dump(p);
      const conf = nodes.filter(n => n.role === 'button' && n.label.trim() === 'Delete').sort((a, b) => b.y - a.y)[0];
      await clickC(p, conf);
      for (let i = 0; i < 10; i++) { await p.waitForTimeout(900); const l = (await fetch(`${L.API}/api/v1/get-addresses`, { headers: { Authorization: 'Bearer ' + token } })).json(); if (!(Array.isArray(l) ? l : []).some(a => a.addressId === crudId)) break; }
      const delc = calls.find(c => c.u.includes('/delete-address/'));
      chk('p2-delete-call-2xx', delc && (delc.s === 200 || delc.s === 204), JSON.stringify(delc || calls.slice(0, 3)));
      const l3 = (await (await fetch(`${L.API}/api/v1/get-addresses`, { headers: { Authorization: 'Bearer ' + token } })).json());
      chk('p2-delete-server-gone', !(l3.some(a => a.addressId === crudId)), `crudId ${crudId} present=${l3.some(a => a.addressId === crudId)}`);
    }

    // ---- P3 checkout default-sync verbatim ----
    // default currently = our p1 row (addedRowId) or crudId was deleted -> ensure default is p1 row
    if (addedRowId) {
      await L.api(T(), 'POST', `/api/v1/set-default-address?addressId=${addedRid(addedRowId)}`, {});
      const g = await (await fetch(`${L.API}/api/v1/get-default-address`, { headers: { Authorization: 'Bearer ' + token } })).json();
      chk('p3-precondition-default-set-to-p1row', g && g.addressId === addedRowId, JSON.stringify(g).slice(0, 140));
      // cart: add product
      await p.evaluate(() => { window.location.hash = '#/'; });
      await p.waitForTimeout(3000);
      for (let i = 0; i < 25; i++) { await p.waitForTimeout(1200); if ((await L.allText(p)).length > 400) break; }
      let card = null;
      for (let i = 0; i < 6 && !card; i++) {
        card = await p.evaluate(() => {
          const es = [...document.querySelectorAll('flt-semantics[flt-tappable]')];
          for (const e of es) { const t = (e.getAttribute('aria-label') || '') + (e.textContent || '');
            if (/TSh/.test(t)) { const r = e.getBoundingClientRect(); if (r.y > 60 && r.y < 520 && r.width > 90) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), name: t.slice(0, 36) }; } }
          return null; });
        if (!card) { await p.mouse.move(180, 340); await p.mouse.wheel(0, 480); await p.waitForTimeout(650); }
      }
      if (card) {
        await p.mouse.click(card.x, card.y); await p.waitForTimeout(3200);
        const buy = await findNode(p, 'Buy now', vp) || await findNode(p, 'Add to cart', vp);
        if (buy) await clickC(p, buy);
        await p.waitForTimeout(1600);
        await p.evaluate(() => { window.location.hash = '#/checkout'; });
        for (let i = 0; i < 20; i++) { await p.waitForTimeout(1300); if ((await L.allText(p)).includes('Delivery address')) break; }
        await p.waitForTimeout(1600);
        let tx = txtOf(await dump(p));
        await shot(p, '375', 'p3-checkout-step1');
        // selected value inside the dropdown field BEFORE opening
        const ddField = (tx.split('\n').find(l => l.includes('—') || l.includes('Saved addresses')) || '');
        // open dropdown
        const dd = await findNode(p, 'Saved addresses', vp);
        if (dd) { await clickC(p, dd); await p.waitForTimeout(1300); tx = txtOf(await dump(p)); }
        const lines = tx.split('\n');
        const marked = lines.filter(l => l.includes('(Default)'));
        const p1line = lines.find(l => l.includes(tag) && l.includes('pin lane'));
        chk('p3-checkout-no-Default-suffix-despite-server-default', marked.length === 0,
          `marked=${JSON.stringify(marked)} serverDefaultStreet=${tag} pin lane | p1rowMenuLine=${(p1line || '').slice(0, 80)}`);
        await shot(p, '375', 'p3-dropdown-open');
        fs.writeFileSync('/tmp/au060_p3_dropdown_lines.json', JSON.stringify(lines, null, 1));
        await p.keyboard.press('Escape');
      } else chk('p3-cart-prereq', false, 'no priced card found');
    }

    // cleanup: remove p1 row too (ours)
    if (addedRowId) { const d = await L.api(T(), 'DELETE', `/api/v1/delete-address/${addedRowId}`); console.log('cleanup p1 row', addedRowId, d.status); }
    await L.closeVideo(ctx, `${VIDDIR}/AU-060-r14b-p23-crud.webm`);
    await b.close();
  }

  // ---------- PASS 4: payout form end-to-end ----------
  let myPayoutId = null;
  {
    console.log('\n== P4 payout details form (375 + 768 shots) ==');
    for (const w of [{ name: '375', wd: 375, ht: 667 }, { name: '768', wd: 768, ht: 1024 }]) {
      const b = await L.newBrowser();
      const ctx = await L.newCtx(b, { viewport: { width: w.wd, height: w.ht }, videoPath: `${VIDDIR}/AU-060-r14b-p4-payout-${w.name}.webm` });
      const token = await L.apiLogin();
      const p = await ctx.newPage(); p.setDefaultTimeout(30000);
      const calls = [];
      p.on('response', r => { if (/localhost:8083/.test(r.url()) && r.request().method() !== 'GET') calls.push(`${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')} -> ${r.status()}`); });
      await p.addInitScript(t => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, token);
      await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      for (let i = 0; i < 25; i++) { await p.waitForTimeout(1400); if ((await L.allText(p)).length > 200) break; }
      await p.evaluate(() => { window.location.hash = '#/account/payout-details'; });
      for (let i = 0; i < 25; i++) { await p.waitForTimeout(1400); if ((await L.allText(p)).includes('Payout details')) break; }
      await p.waitForTimeout(2000);
      const vp = { w: w.wd, h: w.ht };
      let tx = txtOf(await dump(p));
      const before = JSON.parse(fs.readFileSync('/tmp/au060_r14_payout_before.json', 'utf8'));
      chk(`p4-${w.name}-existing-row-renders-verbatim`, before.length === 0 || tx.includes(`${before[0].accountName} · ${before[0].accountNumber}`),
        (tx.split('\n').filter(l => /·|Mobile|Bank|No payout/.test(l)).slice(0, 4).join('|')).slice(0, 160));
      // open Add sheet (FAB bottom-right; semantics may not expose it)
      let fab = await findNode(p, 'Add', vp) || await findNode(p, 'add-payout', vp);
      if (!fab) { await p.mouse.click(w.wd - 70, w.ht - 90); await p.waitForTimeout(1600); }
      else await clickC(p, fab);
      let sheetOpen = false;
      for (let i = 0; i < 10 && !sheetOpen; i++) {
        sheetOpen = txtOf(await dump(p)).includes('Add payout details');
        if (!sheetOpen) { await p.mouse.click(w.wd - 70, w.ht - 90); await p.waitForTimeout(1400); }
      }
      chk(`p4-${w.name}-add-sheet-open`, sheetOpen, `sheet visible=${sheetOpen}`);
      for (let i = 0; i < 12; i++) { await p.waitForTimeout(800); if (txtOf(await dump(p)).includes('Save')) break; }
      tx = txtOf(await dump(p));
      await shot(p, w.name, 'p4-add-sheet');
      if (w.name === '375') {
        // method dropdown -> Bank account: provider label must switch to 'Bank name'
        let ddM = null;
        for (const cand of ['Mobile money', 'Payout method']) {
          ddM = await findNode(p, cand, vp);
          if (ddM) break;
        }
        if (!ddM) {
          // dropdown field may be unlabeled: click the first input-like node under the sheet
          const boxes = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].filter(e => e.getAttribute('flt-tappable') !== null).map(e => ({ x: Math.round(e.getBoundingClientRect().x), y: Math.round(e.getBoundingClientRect().y), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) })).filter(b => b.y > 120 && b.h > 20));
          if (boxes.length) ddM = boxes[1] || boxes[0];
        }
        if (ddM) { await p.mouse.click(ddM.x + ddM.w / 2, Math.min(ddM.y + 16, 650)); await p.waitForTimeout(1300); }
        let opt = null;
        for (let i = 0; i < 8 && !opt; i++) {
          opt = await findNode(p, 'Bank account', vp);
          if (!opt) { await p.waitForTimeout(700); }
        }
        if (opt) { await p.mouse.click(opt.x + opt.w / 2, Math.min(opt.y + 10, 650)); await p.waitForTimeout(1100); }
        const txAfter = txtOf(await dump(p));
        chk(`p4-375-method-switch-changes-provider-label`, txAfter.includes('Bank name'),
          `'Bank name' label after choosing Bank account=${txAfter.includes('Bank name')}`);
        await shot(p, w.name, 'p4-method-bank');
        // fill fields with backend-valid values per method rules
        const inputs = await p.evaluate(() => [...document.querySelectorAll('input,textarea')].map((i, k) => ({ k, ph: i.getAttribute('aria-label') || i.placeholder || '' })));
        fs.writeFileSync('/tmp/au060_p4_inputs.json', JSON.stringify(inputs));
        const byRe = re => { const f = inputs.filter(x => re.test(x.ph)); return f.length ? f[inputs.indexOf(f[0])] : null; };
        const provF = inputs.find(x => /bank name/i.test(x.ph)) || inputs[1];
        const nmF = inputs.find(x => /account holder/i.test(x.ph)) || inputs[2];
        const numF = inputs.find(x => /account number/i.test(x.ph)) || inputs[3];
        const setF = async (f, v) => { if (!f) return; await p.locator('input,textarea').nth(f.k).click({ force: true }).catch(()=>{}); await p.waitForTimeout(180); await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace'); await p.keyboard.type(v, { delay: 7 }); await p.waitForTimeout(160); };
        await setF(provF, 'CRUD Verifier Bank');
        await setF(nmF, 'AU060B Holder');
        await setF(numF, '0404782915600'); // BANK_ACCOUNT rule: 4..34 letters/digits
        await shot(p, w.name, 'p4-filled');
        calls.length = 0;
        const sv = await findNode(p, 'Save', vp);
        if (sv) await clickC(p, sv);
        else { await p.mouse.click(w.wd - 80, w.ht - 80); }
        await p.waitForTimeout(3500);
        const putc = calls.find(c => c.includes('/userManagement/payout-details'));
        chk(`p4-375-save-hit-endpoint-2xx`, !!putc && /-> (200|201|204)/.test(putc), calls.slice(0, 4).join('; ') || 'none');
        const pdNow = (await (await fetch(`${L.API}/api/v1/userManagement/payout-details`, { headers: { Authorization: 'Bearer ' + token } })).json());
        const mine = pdNow.find(r => r.accountName === 'AU060B Holder');
        myPayoutId = mine ? mine.id : null;
        chk(`p4-375-server-readback-new-row`, !!mine, JSON.stringify(mine || pdNow.map(r => r.accountName)).slice(0, 180));
        let listed = false;
        for (let i = 0; i < 12 && !listed; i++) { if (txtOf(await dump(p)).includes('AU060B Holder')) listed = true; else { await p.mouse.move(vp.w / 2, vp.h * .5); await p.mouse.wheel(0, 260); await p.waitForTimeout(300); } }
        chk(`p4-375-new-row-renders`, listed, `visible=${listed}`);
        await shot(p, w.name, 'p4-after-save');
      } else {
        // 768 viewport: render-only pass (existing primary row + FAB present)
        const fabVisible = txtOf(await dump(p)).includes('Add') || true;
        chk(`p4-${w.name}-render-only-pass`, tx.includes('Primary') || tx.includes('Mobile Test'), `row text visible=${tx.includes('Mobile Test')}`);
      }
      await L.closeVideo(ctx, `${VIDDIR}/AU-060-r14b-p4-payout-${w.name}.webm`);
      await b.close();
      if (myPayoutId) break; // create once; second viewport only needs render states
    }
    // cleanup own payout row
    if (myPayoutId) {
      const d = await L.api(T(), 'DELETE', `/api/v1/userManagement/payout-details/${myPayoutId}`);
      const pdEnd = (await (await fetch(`${L.API}/api/v1/userManagement/payout-details`, { headers: { Authorization: 'Bearer ' + T() } })).json()).map(r => r.id);
      chk('p4-cleanup-deleted-own-row', d.status === 204 && !pdEnd.includes(myPayoutId), `DELETE ${myPayoutId} -> ${d.status}; remaining ids=${pdEnd.join(',')}`);
    } else chk('p4-cleanup-skipped', false, 'no own payout row created — inspect p4 failures');
  }

  function addedRid(id) { return id; }

  console.log('\nP-R-O-B-E-S COMPLETE');
})().catch(e => { console.error('SCRIPT-ERROR', e); process.exit(1); });
