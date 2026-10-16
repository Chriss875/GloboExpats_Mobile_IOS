// sk008_realdata.js — independent real-data check on :9131 @c6b4d61 (post-CORS-fix lane)
// Curl the sandbox for entities, then assert the SAME values verbatim in a11y text.
const L=require('./lib_verify.js');
const API='http://localhost:8083';
(async()=>{
 // 1) featured product from API
 const feat=await fetch(API+'/api/v1/displayItem/featured?page=0&size=4').then(r=>r.json());
 const items=(Array.isArray(feat)?feat:(feat.content||[])).filter(x=>x&&x.productId!=null).slice(0,3);
 console.log('API FEATURED:', JSON.stringify(items.map(i=>({id:i.productId,name:i.productName||i.name,price:i.price}))));
 // 2) categories
 const cats=await fetch(API+'/api/v1/products/categories').then(r=>r.json());
 console.log('API CATEGORIES:', JSON.stringify(cats.slice(0,5).map(c=>c.categoryName)));
 // 3) request board feed
 const feed=await fetch(API+'/api/v1/request-board/feed?page=0&size=3').then(r=>r.json());
 const farr=(Array.isArray(feed)?feed:(feed.content||[]));
 console.log('API FEED n=',farr.length, JSON.stringify(farr.slice(0,2).map(f=>({title:f.title, budget:f.budget}))));
 require('fs').writeFileSync('/tmp/sk008_api_entities.json', JSON.stringify({items,cats:cats.slice(0,5).map(c=>c.categoryName),feed:farr.slice(0,3)},null,1));
})().catch(e=>{console.error(e);process.exit(1);});
