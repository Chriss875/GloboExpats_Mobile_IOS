const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const p = await (await b.newContext({ viewport:{width:375,height:667} })).newPage();
  await p.goto('http://localhost:9100/', {waitUntil:'load'});
  const keys = await p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>/cart/i.test(k)).map(k=>[k,(localStorage.getItem(k)||'').slice(0,400)])));
  console.log(JSON.stringify(keys,null,1));
  await b.close();
})();
