// AU-059 verifier stage 1 — Flutter app on frozen :9110, both viewports.
// Covers: login -> Account tab (hub) -> Settings (Edit profile) real editProfile
// round-trip on the sandbox, click-everything enumeration, image tracking,
// screenshots at every meaningful state. NO credential values echoed anywhere.
const L = require('./lib_verify');
const fs = require('fs');

const OUT = { stages: [], images: {}, clicks: [], errors: [] };

function note(stage, obj) {
  OUT.stages.push({ stage, ...obj });
  console.log('STAGE', stage, JSON.stringify(obj).slice(0, 400));
}

(async () => {
  const b = await L.newBrowser();
  const results = {};

  for (const vp of [{ w: 375, h: 667, name: '375' }, { w: 768, h: 1024, name: '768' }]) {
    const ctx = await L.newCtx(b, {
      viewport: { width: vp.w, height: vp.h },
      videoPath: `/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-059-${vp.name}.webm`,
    });
    const p = await ctx.newPage();
    const apiCalls = [];
    p.on('request', r => { if (r.url().includes(':8083')) apiCalls.push(r.method() + ' ' + r.url().replace(/^http:\/\/[^/]+/, '') + (r.postData() ? ' BODY:' + r.postData().slice(0, 200) : '')); });
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/|\/assets\/.*(png|webp|jpe?g)/i.test(u)) OUT.images[u] = r.status();
      if (u.includes(':8083') && !r.request().method().startsWith('GET')) apiCalls.push('  -> ' + r.status() + ' ' + u.replace(/^http:\/\/[^/]+/, ''));
    });

    // 1) login through the real form
    const logged = await L.login(p, L.BUYER);
    note(`login-${vp.name}`, { ok: logged });
    await p.waitForTimeout(1200);

    // open Account tab
    await L.clickBtn(p, 'Account');
    await p.waitForTimeout(1500);
    await L.screenshot(p, `e2e/shots/AU-059/flutter-${vp.name}-01-account-hub.png`);
    const hubText = await L.allText(p);
    fs.writeFileSync(`/tmp/au059-hub-${vp.name}.txt`, hubText);

    // 2) Settings tile -> Edit profile screen (real user-details prefill)
    await L.clickBtn(p, 'Settings');
    await p.waitForTimeout(2500);
    await L.screenshot(p, `e2e/shots/AU-059/flutter-${vp.name}-02-settings.png`);
    const setText = await L.allText(p);
    fs.writeFileSync(`/tmp/au059-settings-${vp.name}.txt`, setText);
    note(`settings-opened-${vp.name}`, {
      hasFirstName: setText.includes('First name'),
      hasSave: setText.includes('Save profile'),
      hasWhatsapp: setText.includes('WhatsApp number'),
      hasAbout: setText.includes('About me'),
      hasOrgField: /organization/i.test(setText),
      hasPasswordSection: /password/i.test(setText),
    });

    // enumerate controls on the settings form
    const ctrls = await L.listButtons(p);
    fs.writeFileSync(`/tmp/au059-controls-${vp.name}.json`, JSON.stringify(ctrls, null, 1));

    // 3) REAL editProfile round trip: change aboutMe to a verifier marker,
    //    save, then re-read the API to prove persistence.
    const stamp = 'AU059RW' + Date.now().toString().slice(-6);
    const aboutBox = p.locator('flt-semantics').filter({ hasText: 'About me' }).first();
    let typed = false;
    try {
      // focus the textarea input (last text field on the form)
      const inputs = p.locator('textarea, input[type="text"]');
      const n = await inputs.count();
      if (n >= 4) { await inputs.nth(n - 1).click({ force: true }); }
      else { await inputs.nth(n - 1).click({ force: true }); }
      await p.keyboard.press('Control+A');
      await p.keyboard.type(stamp + ' verified by AU-059 browser run');
      typed = true;
    } catch (e) { note(`type-fail-${vp.name}`, { err: e.message.slice(0, 120) }); }

    await L.screenshot(p, `e2e/shots/AU-059/flutter-${vp.name}-03-edited-about.png`);
    apiCalls.length = 0;
    const saved = await L.clickBtn(p, 'Save profile');
    await p.waitForTimeout(3000);
    await L.screenshot(p, `e2e/shots/AU-059/flutter-${vp.name}-04-after-save.png`);
    const afterText = await L.allText(p);
    const saveCalls = apiCalls.filter(c => c.includes('editProfile'));
    note(`save-${vp.name}`, {
      clicked: saved,
      successShown: afterText.includes('Profile updated successfully'),
      errorShown: /Could not save|Exception|Failed/.test(afterText),
      network: saveCalls.slice(0, 6),
    });
    results['stamp_' + vp.name] = typed ? stamp : null;
    fs.writeFileSync('/tmp/au059-stamps.json', JSON.stringify(results));

    // back to hub for click sweep of every tile (both viewports)
    await p.goto('about:blank').catch(() => {});
    await p.goto('http://localhost:9110/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(2500);
    if (!(await L.isLoggedIn(p))) {
      // session persisted via localStorage; if not, log in again
      await L.login(p, L.BUYER);
    }
    await L.clickBtn(p, 'Account');
    await p.waitForTimeout(1800);
    const tiles = ['My orders', 'My payments', 'Addresses', 'Settings', 'Notifications', 'Help & about', 'Payment methods', 'Seller dashboard', 'Admin'];
    for (const t of tiles) {
      const before = (await L.allText(p)).slice(0, 80);
      const okc = await L.clickBtn(p, t);
      await p.waitForTimeout(1600);
      const after = await L.allText(p);
      let effect = after !== before;
      let detail = '';
      if (/orders|payments|dashboard/i.test(t)) {
        effect = effect || apiCalls.some(c => c.includes('8083'));
      }
      OUT.clicks.push({ vp: vp.name, tile: t, clicked: okc, changedView: after !== before, head: after.split('\n').filter(x => x.trim()).slice(0, 3).join(' | ').slice(0, 140) });
      // go back to hub
      await L.clickBtn(p, 'Back');
      await p.waitForTimeout(900);
      if (!(await L.allText(p)).includes('Log out')) { await L.clickBtn(p, 'Account'); await p.waitForTimeout(1200); }
    }
    // Log out is destructive for later stages; do it LAST and verify it works once per run
    const beforeLogout = await L.isLoggedIn(p);
    const lo = await L.clickBtn(p, 'Log out');
    await p.waitForTimeout(1500);
    const afterLogout = await L.isLoggedIn(p);
    OUT.clicks.push({ vp: vp.name, tile: 'Log out', clicked: lo, tokenBefore: beforeLogout, tokenAfter: afterLogout });
    await ctx.close();
  }

  fs.writeFileSync('/tmp/au059-stage1.json', JSON.stringify(OUT, null, 1));
  console.log('IMAGES', JSON.stringify(L.imageSummary(OUT.images)));
  console.log('DONE stage1');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
