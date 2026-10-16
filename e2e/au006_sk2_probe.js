// quick probe: does window.location.hash drive go_router on :9131?
const lib = require('./lib_verify.js');
process.chdir(__dirname + '/..');
(async () => {
  const b = await lib.newBrowser();
  const ctx = await b.newContext({ viewport:{width:375,height:667} });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9131/', { waitUntil:'load', timeout:60000 });
  await p.waitForFunction(()=>!!document.querySelector('flt-semantics'), null, {timeout:40000});
  await p.waitForTimeout(2500);
  console.log('ROOT text:', JSON.stringify((await lib.allText(p)).slice(0,300)));
  console.log('ROOT btns:', JSON.stringify(await lib.listButtons(p)));
  await p.evaluate(()=>{ window.location.hash = '#/cart'; });
  await p.waitForTimeout(3000);
  console.log('AFTER HASH /cart text:', JSON.stringify((await lib.allText(p)).slice(0,300)));
  console.log('AFTER HASH btns:', JSON.stringify(await lib.listButtons(p)));
  // direct deep link load
  const p2 = await ctx.newPage();
  await p2.goto('http://localhost:9131/#/product/101', { waitUntil:'load', timeout:60000 });
  await p2.waitForTimeout(5000);
  console.log('DEEP product/101 text:', JSON.stringify((await lib.allText(p2)).slice(0,300)));
  await b.close();
})();
