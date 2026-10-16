// au013_skeptic_lib.js — fixture + probe helpers for the AU-013 skeptic pass.
// Real sandbox DB/HTTP only. Never touches live/dev.
const { execSync } = require('child_process');
const fs = require('fs');
const L = require('./lib_verify.js');
const API = 'http://localhost:8083';

function db(q) {
  return execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -t -A -c "${q}"`)
    .toString().trim();
}

// A hidden listing the ADMIN user (142) does NOT own: seller_id=113 (owner of
// product 620). OUT_OF_STOCK makes itemDetails 404 for everyone, so the app's
// owner-fallback is the ONLY path that can reveal it — and it must reveal it
// only to 142 if 142 actually owns it. It doesn't.
function makeForeignHidden(tag) {
  db(`insert into products (product_name, product_description, product_status, asking_price,
        currency, seller_id, category_id, subcategory_id, product_country, transport_requirement,
        create_time, archive_date, product_quantity)
      values ('AU013SK Foreign Hidden ${tag}', 'skeptic: hidden fixture owned by another seller',
        'APPROVED', 9999, 'TZS', 113, 11, 95, 'Tanzania', 'REQUIRED', now(),
        now() + interval '90 days', 3)`);
  const id = Number(db(`select max(product_id) from products where product_name='AU013SK Foreign Hidden ${tag}'`));
  db(`update products set availability_status='OUT_OF_STOCK' where product_id=${id}`);
  try { execSync('docker exec sandbox-redis redis-cli del "user:details::142"'); } catch (_) {}
  try { execSync('docker exec sandbox-redis redis-cli del "user:details::113"'); } catch (_) {}
  return id;
}

// A hidden listing OWNED by 142 — exercises the true owner fallback.
function makeOwnHidden(tag) {
  db(`insert into products (product_name, product_description, product_status, asking_price,
        currency, seller_id, category_id, subcategory_id, product_country, transport_requirement,
        create_time, archive_date, product_quantity)
      values ('AU013SK Own Hidden ${tag}', 'skeptic: hidden fixture owned by viewer 142',
        'APPROVED', 7777, 'TZS', 142, 11, 95, 'Tanzania', 'REQUIRED', now(),
        now() + interval '90 days', 3)`);
  const id = Number(db(`select max(product_id) from products where product_name='AU013SK Own Hidden ${tag}'`));
  db(`update products set availability_status='OUT_OF_STOCK' where product_id=${id}`);
  try { execSync('docker exec sandbox-redis redis-cli del "user:details::142"'); } catch (_) {}
  return id;
}

// A PUBLIC listing owned by ANOTHER seller (113) — used for the role-probe:
// a signed-in admin must see it, but the guard must never leak commerce UI to
// a non-owner non-admin when we flip its payload to deliverySetupReady=false
// client-side (route interception).
function publicOtherSeller() {
  const r = db(`select product_id from products where product_status='APPROVED'
                and (availability_status is null or availability_status<>'OUT_OF_STOCK')
                and seller_id=113 order by product_id desc limit 1`);
  return Number(r);
}

function cleanup(ids) {
  for (const id of ids) {
    try { db(`delete from product_clicks where product_id=${id}`); } catch (_) {}
    try { db(`delete from products where product_id=${id}`); } catch (_) {}
  }
  try { execSync('docker exec sandbox-redis redis-cli del "user:details::142"'); } catch (_) {}
  try { execSync('docker exec sandbox-redis redis-cli del "user:details::113"'); } catch (_) {}
}

async function apiLogin(email, pw) {
  const r = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  });
  const j = await r.json().catch(() => ({}));
  return j.token || null;
}
async function registerUser(tag) {
  const email = `au013sk${tag}@gmail.com`;
  const r = await fetch(`${API}/api/v1/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName: 'SK', lastName: 'Buyer', password: 'StrongPass!1', emailAddress: email }),
  });
  if (r.status !== 201) return null;
  return { email, token: await apiLogin(email, 'StrongPass!1') };
}
function clicksTotal(id) {
  return fetch(`${API}/api/v1/products/${id}/clicks/total`)
    .then(r => r.json()).then(j => j.totalClickCount).catch(() => -1);
}

module.exports = { db, makeForeignHidden, makeOwnHidden, publicOtherSeller, cleanup, apiLogin, registerUser, clicksTotal, API };
