// au028_sk_stage2.js — skeptic stage 2: A5 invalid input + A2a pickup round-trip.
// Assumes cart already filled by the driver (stage1b) OR fills it itself.
const K = require('./au028_sk_lib.js');

(async () => {
  const L = K.L;
  require('fs').mkdirSync(K.SHOT_DIR, { recursive: true });
  const videoPath = 'e2e/videos/AU-028-skeptic-a.webm';
  const browser = await L.newBrowser();
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, recordVideo: { dir: 'e2e/videos', size: { width: 375, height: 667 } } });
  const page = await context.newPage();
  const calls = await K.watchCalls(page);
  await page.goto(K.APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  if (!(await K.uiLogin(page))) throw new Error('login failed');
  if (!(await K.fillBothLines(page))) throw new Error('cart fill failed');
  if (!(await K.goToReview(page))) throw new Error('could not reach review'); // warm-up nav
  // back to step1 for the A5 probes. NOTE: the review 'Back' button lives at
  // the very bottom of a long ListView — scroll it into view first, then
  // click; verify arrival by the 'Contact' heading (step-1-only section).
  let backOk = false;
  const backBox0 = await K.btnBox(page, 'Back', 'exact');
  K.log(`review Back box=${JSON.stringify(backBox0)}`);
  for (let i = 0; i < 5 && !backOk; i++) {
    if (!backBox0 || backBox0.y > 640) {
      await page.mouse.move(190, 340);
      for (let s = 0; s < 12; s++) { await page.mouse.wheel(0, 200); await K.sleep(90); }
      await K.sleep(400);
    }
    const bb = await K.btnBox(page, 'Back', 'exact');
    if (!bb) { K.log(`back attempt ${i}: no visible Back`); continue; }
    await page.mouse.click(bb.x, bb.y); await K.sleep(1200);
    for (let w = 0; w < 6 && !backOk; w++) { await K.sleep(800); backOk = (await K.txt(page)).includes('Contact'); }
    K.log(`back attempt ${i}: ok=${backOk}`);
  }
  let T = await K.txt(page);
  if (!backOk) throw new Error('back to step1 failed');

  // ---------- A5 ----------
  {
    const nInputs = await page.locator('input[type="text"]').count();
    K.log(`step-1 text inputs=${nInputs}`);
    const vals0 = await page.evaluate(() => [...document.querySelectorAll('input')].map(i => i.value));
    K.log(`inputs before: ${JSON.stringify(vals0.map(v => (v || '').slice(0, 22)))}`);
    const JUNK = `<script>alert(1)</script> 🚀 Karibu sana ` + 'x'.repeat(500);
    await page.locator('input[type="text"]').nth(nInputs - 1).click({ force: true }); await K.sleep(350);
    await page.keyboard.type(JUNK, { delay: 2 });
    const vals1 = await page.evaluate(() => [...document.querySelectorAll('input')].map(i => i.value));
    const phoneVal = vals1[nInputs - 1] || '';
    const junkIn = phoneVal.includes('<script>') && phoneVal.includes('Karibu') && phoneVal.length > 500;
    await page.locator('input[type="text"]').nth(2).click({ force: true }).catch(() => {}); await K.sleep(250);
    await page.keyboard.type('attacker@evil.example', { delay: 4 });
    const vals2 = await page.evaluate(() => [...document.querySelectorAll('input')].map(i => i.value));
    const emailHeld = (vals2[2] || '') === vals1[2];
    const shot1 = `${K.SHOT_DIR}/sk-mobile-01-junk-phone.png`;
    await L.screenshot(page, shot1);
    await L.scrollToBottom(page, 8); await K.sleep(300);
    await K.clickBtnVisible(page, 'Continue to review');
    let at2 = false;
    for (let i = 0; i < 20 && !at2; i++) { await K.sleep(700); const t = await K.txt(page); at2 = t.includes('Delivery Destination') || t.includes('Order totals'); }
    T = await K.txt(page);
    const echoed = /Buyer phone:/.test(T);
    const shot2 = `${K.SHOT_DIR}/sk-mobile-02-review-junk-phone.png`;
    await L.screenshot(page, shot2);
    K.F('A5-invalid-input-junk-phone-readonly-email',
      (junkIn && emailHeld && echoed) ? 'HELD' : 'DISPUTED',
      `500-char+emoji+<script> phone string accepted into field=${junkIn} (len=${phoneVal.length}); readOnly email resisted typing=${emailHeld} ("${String(vals2[2] || '').slice(0, 26)}"); review kept "Buyer phone:" row=${echoed}`,
      [shot1, shot2]);
    // restore seeded phone
    for (let i = 0; i < 4; i++) {
      const bb = await K.btnBox(page, 'Back', 'exact');
      if (bb) { await page.mouse.click(bb.x, bb.y); }
      await K.sleep(1000);
      if ((await K.txt(page)).includes('Contact')) break;
    }
    await page.locator('input[type="text"]').nth(nInputs - 1).click({ force: true }); await K.sleep(300);
    for (let i = 0; i < 60; i++) await page.keyboard.press('Backspace');
    await page.keyboard.type(K.fx.buyer.phone, { delay: 6 });
    const restored = ((await page.evaluate(() => [...document.querySelectorAll('input')].map(i => i.value)))[nInputs - 1] || '').includes(K.fx.buyer.phone.slice(-6));
    K.log(`phone restored=${restored}`);
    await L.scrollToBottom(page, 8); await K.sleep(300);
    await K.clickBtnVisible(page, 'Continue to review');
    for (let i = 0; i < 18; i++) { await K.sleep(700); const t = await K.txt(page); if (t.includes('Order totals')) break; }
    await K.sleep(1600);
  }

  // ---------- A2a pickup <-> delivery ----------
  {
    const d0 = await K.radioStates(page);
    await K.toggleRadioIdx(page, 1);
    const pk = await K.radioStates(page);
    await L.scrollToBottom(page, 8); await K.sleep(300);
    await K.clickBtnVisible(page, 'Continue to review');
    let at2 = false;
    for (let i = 0; i < 18 && !at2; i++) { await K.sleep(700); const t = await K.txt(page); at2 = t.includes('Order totals') || t.includes('Delivery Destination'); }
    await K.sleep(2000);
    T = await K.txt(page);
    const pickupNoFee = T.includes(K.fmt(K.P1 + K.P2)) && !T.includes(K.fmt(K.FEE));
    const shot = `${K.SHOT_DIR}/sk-mobile-03-review-pickup-nofee.png`;
    await L.screenshot(page, shot);
    for (let i = 0; i < 4; i++) {
      const bb = await K.btnBox(page, 'Back', 'exact');
      if (bb) { await page.mouse.click(bb.x, bb.y); }
      await K.sleep(1000);
      if ((await K.txt(page)).includes('Contact')) break;
    }
    await K.toggleRadioIdx(page, 0);
    const dl = await K.radioStates(page);
    const okSeq = String(d0[0]) === 'true' && String(pk[1]) === 'true' && String(dl[0]) === 'true';
    K.F('A2-out-of-order-pickup-delivery-roundtrip',
      (okSeq && pickupNoFee) ? 'HELD' : 'DISPUTED',
      `radio seq delivery[${d0}] -> pickup[${pk}] -> delivery[${dl}]; pickup review billed items-only ${K.fmt(K.P1 + K.P2)} with NO TSh ${K.fmt(K.FEE)} fee cell=${pickupNoFee}`, [shot]);
    await L.scrollToBottom(page, 8); await K.sleep(300);
    await K.clickBtnVisible(page, 'Continue to review');
    for (let i = 0; i < 18; i++) { await K.sleep(700); const t = await K.txt(page); if (t.includes('Order totals')) break; }
    await K.sleep(1800);
  }

  require('fs').writeFileSync('/tmp/au028_sk_ctxA_calls.json', JSON.stringify(calls.pf.map(c => ({ status: c.status, total: (() => { try { return JSON.parse(c.post).buyDetails.totalAmount; } catch (e) { return null; } })() })), null, 1));
  await K.cancelAllPending('stage2');
  const v = page.video(); await context.close(); if (v) await v.saveAs(videoPath).catch(() => {});
  await browser.close();
  console.log('STAGE2 DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
