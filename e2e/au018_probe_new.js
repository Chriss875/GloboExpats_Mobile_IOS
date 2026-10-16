const L = require('./lib_verify.js');
(async () => {
  // how does the UI-visible listing set behave? itemDetails for 653 works, 836-839 worked earlier.
  for (const id of [652,653,654,836,837,838,839,841,842,843]) {
    const r = await fetch(`${L.API}/api/v1/displayItem/itemDetails/${id}`);
    const j = await r.json().catch(()=>null);
    console.log(id, r.status, j && (j.productName||j.errorCode), j && ('qty='+(j.productQuantity??'?')));
  }
})();
