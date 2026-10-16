// Attack 6 LOCALE / NUMBER FORMATS (TZS separators, qty, dates) on the gate screens.
const { L, APP, FX, SHOT, rec, a11yDump, tapButton, gotoProduct } = require('./au018_sk_lib.js');
(async () => {
  // control 33,000 ; own 51,000 ; OOS 42,000
  const b = await L.newBrowser();
  const p = await (await b.newContext({viewport:{width:375,height:667}})).newPage();
  await L.login(p, L.BUYER);
  await gotoProduct(p, FX.controlId, 'Other Seller Control Rug');
  const tC = await L.allText(p);
  const fmt33000 = /TSh\s?33[.,]000/.test(tC);
  const priceShown = (tC.match(/TSh\s?[\d.,]+/g)||[]).slice(0,3).join(' | ');
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a6-price-format.png`});
  rec({ attack:'locale_number_format', target:'TZS grouping on control listing',
        result: fmt33000?'HELD':'DISPUTED',
        observed:`price strings rendered="${priceShown}"; expected TSh 33,000` ,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a6-price-format.png`] });
  // emoji/decimal fixture 836 price 12345.67 -> how is the fraction rendered?
  await gotoProduct(p, 836, 'AU018');
  const tE = await L.allText(p);
  const frac = (tE.match(/TSh\s?[\d.,]+/g)||[]).slice(0,4).join(' | ');
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a6-decimal.png`});
  rec({ attack:'locale_number_format', target:'fractional price 12345.67 rendering (fixture 836)',
        result:'RECORDED', observed:`rendered="${frac}"`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a6-decimal.png`] });
  // huge qty fixture 839 — stepper cap and stock label
  await gotoProduct(p, 839, 'AU018');
  const tQ = await L.allText(p);
  const avail = (tQ.match(/([\d,]+)\s*available/)||[])[1]||null;
  const d = await a11yDump(p);
  const plus = d.find(n=>/^Add$|plus/i.test(n.t)) || d.filter(n=>n.tap===true).slice(-1)[0];
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a6-hugeqty.png`});
  rec({ attack:'locale_number_format', target:'huge quantity 999999999 stock label + stepper cap (fixture 839)',
        result:'RECORDED', observed:`available label="${avail}"; text sample="${tQ.replace(/\n/g,' | ').slice(0,180)}"`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a6-hugeqty.png`] });
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
