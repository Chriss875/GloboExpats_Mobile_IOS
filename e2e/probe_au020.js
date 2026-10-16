// probe_au020.js — interactive debug of search->detail->cart nav on the frozen bundle
const L = require('./lib_verify.js');
const APP = 'http://localhost:9103';
(async () => {
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000);
  const logged = await L.login(p, L.BUYER);
  console.log('login', logged);
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 40000);

  const si = p.locator('input[type="text"]').first();
  await si.click({ force: true }).catch(() => {});
  await p.keyboard.type('Crochet Bonet hat', { delay: 30 });
  await p.waitForTimeout(1200);
  let t = await L.allText(p);
  console.log('--- after typing (live suggestions?) contains Bonet:', t.includes('Bonet'), '| contains Crochet baby:', t.includes('Crochet baby'));
  console.log(t.replace(/\n+/g, '|').slice(0, 700));
  await L.screenshot(p, '/tmp/probe_typed.png');

  await p.keyboard.press('Enter');
  await p.waitForTimeout(3000);
  t = await L.allText(p);
  console.log('--- after Enter: Bonet?', t.includes('Bonet'), '| results header?', /results|Found/i.test(t));
  await L.screenshot(p, '/tmp/probe_results.png');
  console.log(t.replace(/\n+/g, '|').slice(0, 1200));

  // try clicking the card
  const c1 = await L.clickCard(p, 'Crochet Bonet hat');
  await p.waitForTimeout(2200);
  t = await L.allText(p);
  console.log('after clickCard:', c1, 'onDetail=', /Add to cart/i.test(t), '| has Choose options:', t.includes('Choose options'));
  console.log(t.replace(/\n+/g, '|').slice(0, 1500));
  await L.screenshot(p, '/tmp/probe_after_click.png');

  // list all buttons/tappables for diagnosis
  const btns = await L.listButtons(p);
  console.log('controls:', JSON.stringify(btns.slice(0, 40)));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
