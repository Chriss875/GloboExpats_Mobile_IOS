// au018_sk_stage0.js — SKEPTIC stage 0: login + deep-link smoke on :9121 (b56e345)
const L = require('./lib_verify.js');
const APP = 'http://localhost:9121';
(async () => {
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: {width:375,height:667} });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0,120)));
  p.on('console', m => { if (m.type()==='error') errs.push('console: ' + m.text().slice(0,120)); });
  await p.goto(APP + '/', { waitUntil:'load', timeout:90000 });
  await L.waitText(p,'Buy now',30000);
  console.log('HOME OK. buttons:', JSON.stringify(await L.listButtons(p)).slice(0,600));
  const ok = await L.login(p, L.BUYER);
  console.log('login ->', ok, 'token?', await L.isLoggedIn(p));
  await p.waitForTimeout(1500);
  // deep link via hash
  await p.evaluate(() => { window.location.hash = '/product/653'; });
  await p.waitForTimeout(5000);
  const t = await L.allText(p);
  console.log('URL:', p.url());
  console.log('has own-in-stock title?', t.includes('AU018 Own In Stock Teak Set'));
  console.log('snippet:', t.split('\n').filter(s=>/AU018|Buy now|Add to cart|Out of Stock|TSh/i.test(s)).slice(0,14).join(' | '));
  console.log('errors:', errs.slice(0,6));
  await p.screenshot({path:'/tmp/sk0_home.png'});
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
