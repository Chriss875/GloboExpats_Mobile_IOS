const L = require('./lib_verify.js');
(async () => {
  // itemDetails 404s for new fixtures but the UI rendered them earlier (836/837/838/839 shots).
  // Check: maybe itemDetails needs auth for listings without images, or the UI used owner-fallback.
  const btok = await L.apiLogin(L.BUYER);
  for (const id of [836,837,839,653]) {
    const r = await fetch(`${L.API}/api/v1/displayItem/itemDetails/${id}`, { headers:{Authorization:'Bearer '+btok} });
    console.log('authed', id, r.status);
  }
  // my-listings fallback path
  const me = await L.api(btok,'GET','/api/v1/userManagement/user-details');
  const mine=(me.json.products||[]).filter(p=>String(p.productId).match(/^83|^84/)).map(p=>[p.productId,p.productName,p.productQuantity]);
  console.log('my products 83x/84x:', JSON.stringify(mine));
})();
