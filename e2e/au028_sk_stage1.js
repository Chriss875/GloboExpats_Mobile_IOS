// au028_sk_stage1.js — skeptic stage 1: A3 empty-state + A5 invalid input +
// A2a pickup round-trip. One live session, video on.
const K = require('./au028_sk_lib.js');
const { p } = { p: null };

(async () => {
  const L = K.L;
  fs_mkdir();
  function fs_mkdir() { require('fs').mkdirSync(K.SHOT_DIR, { recursive: true }); }
  const videoPath = 'e2e/videos/AU-028-skeptic-a.webm';
  const browser = await L.newBrowser();
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, recordVideo: { dir: 'e2e/videos', size: { width: 375, height: 667 } } });
  const page = await context.newPage();
  const calls = await K.watchCalls(page);
  await page.goto(K.APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  if (!(await K.uiLogin(page))) throw new Error('login failed');

  // ---------- A3: empty cart ----------
  {
    let lines = await K.persistedCart(page);
    for (let i = 0; i < 4 && lines.length; i++) {
      await K.hashNav(page, '#/cart'); await K.sleep(1200);
      await K.clickBtnVisible(page, 'Remove');
      await K.sleep(700); lines = await K.persistedCart(page);
    }
    const pfBefore = calls.pf.length;
    await K.hashNav(page, '#/checkout'); await K.sleep(1600);
    let T = await K.txt(page);
    const summary = T.includes('Order Summary');
    await L.scrollToBottom(page, 8); await K.sleep(300);
    await K.clickBtnVisible(page, 'Continue to review');
    await K.sleep(1400);
    T = await K.txt(page);
    const emptyErr = T.includes('Your cart is empty');
    const noAdvance = !/Amount due/.test(T) && !/Invoice\s+\S?PF-/.test(T);
    const noPost = calls.pf.length === pfBefore;
    const shot = `${K.SHOT_DIR}/sk-mobile-00-empty-cart-blocked.png`;
    await L.screenshot(page, shot);
    K.F('A3-empty-cart-checkout-blocked',
      (summary && emptyErr && noAdvance && noPost) ? 'HELD' : (emptyErr || !summary) ? 'DISPUTED' : 'BROKEN',
      `empty cart: Order Summary rendered=${summary}; Continue -> verbatim "Your cart is empty."=${emptyErr}; no payment markers=${noAdvance}; proforma POSTs=0 (${noPost})`, [shot]);
  }

  // ---------- fill cart ----------
  if (!(await K.fillBothLines(page))) throw new Error('cart fill failed');

  // ---------- A5: invalid input ----------
  {
    // phone = 4th text input; email = 3rd (readOnly)
    const vals0 = await page.evaluate(() => [...document.querySelectorAll('input')].map(i => i.value));
    const JUNK = `<script>alert(1)</script> 🚀 Karibu sana ` + 'x'.repeat(500);
    await page.locator('input[type="text"]').nth(3).click({ force: true }); await K.sleep(350);
    await page.keyboard.type(JUNK, { delay: 2 });
    const vals1 = await page.evaluate(() => [...document.querySelectorAll('input')].map(i => i.value));
    const phoneVal = vals1[3] || '';
    const junkIn = phoneVal.includes('<script>') && phoneVal.includes('Karibu');
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
    const T = await K.txt(page);
    const echoed = /Buyer phone:/.test(T);
    const shot2 = `${K.SHOT_DIR}/sk-mobile-02-review-junk-phone.png`;
    await L.screenshot(page, shot2);
    K.F('A5-invalid-input-junk-phone-readonly-email',
      (junkIn && emailHeld && echoed) ? 'HELD' : 'DISPUTED',
      `500-char+emoji+<script> phone accepted into field=${junkIn} (len=${phoneVal.length}); readOnly email resisted typing=${emailHeld} ("${String(vals2[2] || '').slice(0, 26)}"); review kept "Buyer phone:" row=${echoed}`,
      [shot1, shot2]);
    // restore seeded phone via step1
    await K.clickBtnVisible(page, 'Back');
    await K.sleep(1100);
    await page.locator('input[type="text"]').nth(3).click({ force: true }); await K.sleep(300);
    for (let i = 0; i < 60; i++) await page.keyboard.press('Backspace');
    await page.keyboard.type(K.fx.buyer.phone, { delay: 6 });
    const restored = ((await page.evaluate(() => [...document.querySelectorAll('input')].map(i => i.value)))[3] || '').includes(K.fx.buyer.phone.slice(-6));
    K.log(`phone restored=${restored}`);
    // forward again to review
    await L.scrollToBottom(page, 8); await K.sleep(300);
    await K.clickBtnVisible(page, 'Continue to review');
    for (let i = 0; i < 18; i++) { await K.sleep(700); const t = await K.txt(page); if (t.includes('Order totals')) break; }
    await K.sleep(1500);
  }

  // ---------- A2a: pickup <-> delivery round trip ----------
  {
    const d0 = await K.radioStates(page);
    await K.toggleRadioIdx(page, 1);
    const pk = await K.radioStates(page);
    await L.scrollToBottom(page, 8); await K.sleep(300);
    await K.clickBtnVisible(page, 'Continue to review');
    let at2 = false;
    for (let i = 0; i < 18 && !at2; i++) { await K.sleep(700); const t = await K.txt(page); at2 = t.includes('Order totals') || t.includes('Delivery Destination'); }
    await K.sleep(1800);
    const T = await K.txt(page);
    const pickupNoFee = T.includes(K.fmt(K.P1 + K.P2)) && !T.includes(K.fmt(K.FEE));
    const shot = `${K.SHOT_DIR}/sk-mobile-03-review-pickup-nofee.png`;
    await L.screenshot(page, shot);
    await K.clickBtnVisible(page, 'Back');
    await K.sleep(1000);
    await K.toggleRadioIdx(page, 0);
    const dl = await K.radioStates(page);
    const okSeq = String(d0[0]) === 'true' && String(pk[1]) === 'true' && String(dl[0]) === 'true';
    K.F('A2-out-of-order-pickup-delivery-roundtrip',
      (okSeq && pickupNoFee) ? 'HELD' : 'DISPUTED',
      `radio seq delivery[${d0}] -> pickup[${pk}] -> delivery[${dl}]; pickup review dropped the TSh ${K.fmt(K.FEE)} fee cell and billed items-only subtotal ${K.fmt(K.P1 + K.P2)}=${pickupNoFee}`, [shot]);
    await L.scrollToBottom(page, 8); await K.sleep(300);
    await K.clickBtnVisible(page, 'Continue to review');
    for (let i = 0; i < 18; i++) { await K.sleep(700); const t = await K.txt(page); if (t.includes('Order totals')) break; }
    await K.sleep(1800);
  }

  require('fs').writeFileSync('/tmp/au028_sk_ctxA_calls.json', JSON.stringify(calls.pf.map(c => ({ status: c.status, total: (() => { try { return JSON.parse(c.post).buyDetails.totalAmount; } catch (e) { return null; } })() })), null, 1));
  await K.cancelAllPending('stage1');
  const v = page.video(); await context.close(); if (v) await v.saveAs(videoPath).catch(() => {});
  await browser.close();
  console.log('STAGE1 DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
