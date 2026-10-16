// au028_sk_stage3.js — skeptic stage 3: THE GUARD, both directions.
// The verifier tripped the guard only UP (server price rose). This stage:
//   T1 trip UP   (reviewed < server)  -> cancel + resync up + message + stay
//   T2 trip DOWN (reviewed > server)  -> cancel + resync down + message + stay
//      (restore price WITHOUT touching cart: server now CHEAPER than reviewed)
//   T3 clean confirm after two trips -> payload still §5.1-exact, HTTP 201
const K = require('./au028_sk_lib.js');
const fs = require('fs');

(async () => {
  fs.mkdirSync(K.SHOT_DIR, { recursive: true });
  const L = K.L;
  const videoPath = 'e2e/videos/AU-028-skeptic-b-guard.webm';
  const browser = await L.newBrowser();
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, recordVideo: { dir: 'e2e/videos', size: { width: 375, height: 667 } } });
  const page = await context.newPage();
  const calls = await K.watchCalls(page);
  await page.goto(K.APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  if (!(await K.uiLogin(page))) throw new Error('login failed');
  await K.patchPrice(K.fx.productId1, K.P1, 18000, 8); await K.sleep(500);
  if (!(await K.fillBothLines(page))) throw new Error('cart fill failed');
  if (!(await K.goToReview(page))) throw new Error('could not reach review');
  await K.ensureChecked(page, 'first', 'win');
  await K.ensureChecked(page, 'last', 'terms');

  // ---------- T1: trip UP ----------
  {
    await K.patchPrice(K.fx.productId1, 65000, 70000);
    let box = await K.btnBox(page, 'Confirm & proceed to payment');
    if (!box) throw new Error('confirm button missing');
    await page.mouse.click(box.x, box.y); await K.sleep(2200);
    // scroll up to bring the ErrorBox into the semantics snapshot
    let T = '';
    for (let i = 0; i < 12; i++) { await page.mouse.move(190, 300); await page.mouse.wheel(0, -360); await K.sleep(600); T = await K.txt(page); if (T.toLowerCase().includes('authoritative')) break; }
    const msgUp = (T.split('\n').find(l => /authoritative/i.test(l)) || '').trim().slice(0, 170);
    const stayedOffPayment = !/Amount due/.test(T);
    const linesUp = await K.persistedCart(page);
    const toteUp = (linesUp.find(l => l.productId === K.fx.productId1) || {}).price;
    const shotUp = `${K.SHOT_DIR}/sk-mobile-08-guard-trip-up.png`;
    await L.screenshot(page, shotUp);
    const upCall = calls.pf[calls.pf.length - 1];
    const upGrand = upCall && upCall.resp && upCall.resp.grandTotal;
    const cancelsAfterUp = calls.cancels.length;
    K.F('A8-guard-trip-up-cancel-resync',
      (stayedOffPayment && msgUp && Number(toteUp) === 65000 && cancelsAfterUp >= 1 && Math.abs(Number(upGrand) - (K.P1 + K.P2 + K.FEE)) > 0.01) ? 'HELD' : 'BROKEN',
      `UP trip: server grandTotal=${upGrand} vs reviewed ${K.fmt(K.P1 + K.P2 + K.FEE)}; verbatim message="${msgUp}"; stayed off payment=${stayedOffPayment}; tote line resynced to ${toteUp} (=65000); cancel POST count=${cancelsAfterUp}`,
      [shotUp]);
  }

  // ---------- T2: restore price, DON'T touch cart -> server now cheaper ------
  {
    await K.patchPrice(K.fx.productId1, K.P1, 18000);
    await K.sleep(700);
    await K.ensureChecked(page, 'first', 'win2');
    await K.ensureChecked(page, 'last', 'terms2');
    const box = await K.btnBox(page, 'Confirm & proceed to payment');
    if (!box) throw new Error('confirm button missing (T2)');
    await page.mouse.click(box.x, box.y); await K.sleep(2600);
    let T = '';
    for (let i = 0; i < 14; i++) { await page.mouse.move(190, 300); await page.mouse.wheel(0, -360); await K.sleep(650); T = await K.txt(page); if (/authoritative/i.test(T) || /Amount due/.test(T)) break; }
    const msgDown = (T.split('\n').find(l => /authoritative/i.test(l)) || '').trim().slice(0, 170);
    const advancedPaying = /Amount due/.test(T) || /PF-\d{4}-\d{6}/.test(T);
    const linesDown = await K.persistedCart(page);
    const toteDown = (linesDown.find(l => l.productId === K.fx.productId1) || {}).price;
    const shotDown = `${K.SHOT_DIR}/sk-mobile-09-guard-trip-down.png`;
    await L.screenshot(page, shotDown);
    const lastCall = calls.pf[calls.pf.length - 1];
    const downGrand = lastCall && lastCall.resp && lastCall.resp.grandTotal;
    K.F('A8-guard-reverse-direction-server-cheaper',
      advancedPaying ? 'BROKEN' : (msgDown && Number(toteDown) === K.P1 ? 'HELD' : 'DISPUTED'),
      `DOWN trip (cart still holds resynced 65,000; server back at ${K.fmt(K.P1)}): advanced to payment=${advancedPaying}; verbatim message="${msgDown || '(NONE RENDERED)'}"; tote line resynced DOWN to ${toteDown}; last proforma grandTotal=${downGrand}`,
      [shotDown]);
  }

  // ---------- T3: clean confirm after both trips ----------
  {
    await K.ensureChecked(page, 'first', 'win3');
    await K.ensureChecked(page, 'last', 'terms3');
    const delta = calls.pf.length;
    const box = await K.btnBox(page, 'Confirm & proceed to payment');
    if (!box) throw new Error('confirm missing (T3)');
    await page.mouse.click(box.x, box.y); await K.sleep(2000);
    let Tb = '';
    for (let i = 0; i < 20; i++) { await K.sleep(1000); Tb = await K.txt(page); if (/Amount due/.test(Tb) || /PF-\d{4}-\d{6}/.test(Tb)) break; }
    const posts = calls.pf.slice(delta);
    const okPost = posts.filter(c => [200, 201].includes(c.status));
    const body = (() => { try { return JSON.parse(okPost[okPost.length - 1].post); } catch (e) { return null; } })();
    const bd = body && body.buyDetails;
    const totOk = bd && Math.abs(Number(bd.totalAmount) - (K.P1 + K.P2 + K.FEE)) < 0.01;
    const pmOk = bd && /^(MOBILE_MONEY|BANK_TRANSFER)$/.test(bd.paymentMethodType);
    const noCard = body && !/card/i.test(JSON.stringify(body));
    const stateCityOk = bd && String(bd.state) !== String(bd.city);
    const winsOk = bd && Array.isArray(bd.preferredDeliveryWindows) && bd.preferredDeliveryWindows.length >= 1 &&
      bd.preferredDeliveryDate === bd.preferredDeliveryWindows[0].date;
    const amtShown = /Amount due/.test(Tb) && Tb.includes(K.fmt(K.P1 + K.P2 + K.FEE));
    const shotClean = `${K.SHOT_DIR}/sk-mobile-10-clean-after-two-trips.png`;
    await L.screenshot(page, shotClean);
    K.F('C1-payload-intact-after-double-guard-trip',
      (okPost.length >= 1 && totOk && pmOk && noCard && stateCityOk && winsOk) ? 'HELD' : 'DISPUTED',
      `clean confirm after two guard trips: HTTP=${posts.map(c => c.status)}; totalAmount=${bd && bd.totalAmount} (expect 48000); paymentMethodType=${bd && bd.paymentMethodType}; /card/i absent=${noCard}; state!=city=${stateCityOk}; windows+legacy-mirror=${winsOk}; payment step shows Amount due ${K.fmt(K.P1 + K.P2 + K.FEE)}=${amtShown}`,
      [shotClean]);
    fs.writeFileSync('/tmp/au028_sk_ctxB_calls.json', JSON.stringify(calls.pf.map(c => ({ status: c.status, grand: c.resp && c.resp.grandTotal, num: c.resp && c.resp.proformaNumber, total: (() => { try { return JSON.parse(c.post).buyDetails.totalAmount; } catch (e) { return null; } })() })), null, 1));
  }

  await K.cancelAllPending('stage3');
  await K.patchPrice(K.fx.productId1, K.P1, 18000, 8).catch(() => {});
  const v = page.video(); await context.close(); if (v) await v.saveAs(videoPath).catch(() => {});
  await browser.close();
  console.log('STAGE3 DONE');
})().catch(e => {
  console.error('FATAL', e.message);
  require('./au028_sk_lib.js').cancelAllPending('stage3-catch').catch(() => {});
  process.exit(1);
});
