// au058_deleteall_r17.js — delete-all CONFIRMED path, fixed targeting.
// r16 failed to click: the aria/text regex also matched the DIALOG TITLE node
// ("Delete all notifications?"), so the click re-opened the dialog instead of
// confirming. Fix: exact-match the FilledButton "Delete all" INSIDE the dialog after
// the dialog title is visible, and capture the wire frame of the outgoing request.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP='http://localhost:9131';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const fx=JSON.parse(fs.readFileSync('/tmp/au058_fixtures_r14.json','utf8'));
  const tok=fx.buyerToken;
  // ensure at least 1 row (r16 left 1 row)
  let before=((await L.api(tok,'GET','/api/v1/notifications?page=0&size=50')).json.content)||[];
  if(!before.length){
    const day=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
    const stok=fx.sellerToken;
    const PNG=fs.readFileSync(path.resolve(__dirname,'fixtures','receipt-proof.png'));
    const form=new FormData();
    form.append('product', new Blob([Buffer.from(JSON.stringify({
      productName:`${fx.title} Lamp 4`, productQuantity:5,
      categoryId:3, subcategoryId:26,
      productCountry:'Tanzania', productRegion:'Dar es Salaam', productStreet:'Mikocheni',
      productDescription:`AU-058 deleteall r17 fixture.`,
      currency:'TZS', askingPrice:9000, originalPrice:11000, condition:'NEW',
    }))],{type:'application/json'}),'product.json');
    form.append('images', new Blob([PNG],{type:'image/png'}), 'fixture4.png');
    const pr=await fetch(`${L.API}/api/v1/products/post-product`,{method:'POST',headers:{Authorization:'Bearer '+stok},body:form});
    const pj=await pr.json().catch(()=>null);
    const bd={firstName:'AU058Buyer',lastName:'R14D',emailAddress:fx.buyerEmail,phoneNumber:'+255700000003',
      address:'123 Msasani Road',deliveryLabel:'Home',deliveryPlaceName:'Wizard Plaza',
      deliveryNeighbourhood:'Mikocheni',city:'Dar es Salaam',state:'',country:'Tanzania',
      zipCode:'',deliveryInstructions:'',fulfillmentType:'SELLER_DELIVERY',paymentMethodType:'MOBILE_MONEY',
      deliveryFee:0,agreeToTerms:true,totalAmount:9000,currency:'TZS',latitude:-6.7905,longitude:39.2795,
      preferredDeliveryDate:day,preferredDeliverySlot:'EVENING',preferredDeliveryWindows:[{date:day,slot:'EVENING'}]};
    const prof=await L.api(tok,'POST','/api/v1/checkout/proforma',{buyDetails:bd,items:[{productId:pj.productId,quantity:1}]});
    if(prof.status===201){
      await L.api(tok,'POST',`/api/v1/proformas/${prof.json.proformaId}/submit-payment`,
        {paymentMethodType:'MOBILE_MONEY',transactionReferences:[`AU058-E-${Date.now()}`]});
      await sleep(3000);
    }
    before=((await L.api(tok,'GET','/api/v1/notifications?page=0&size=50')).json.content)||[];
  }
  console.log('rows before:',before.length);

  const browser=await L.newBrowser();
  const ctx=await L.newCtx(browser,{viewport:{width:375,height:667}, videoPath:'e2e/videos/AU-058-r14-deleteall3.webm'});
  await ctx.addInitScript((t)=>{try{
    localStorage.setItem('flutter.auth_token',JSON.stringify(t));
    localStorage.setItem('flutter.auth_email',JSON.stringify(fx.buyerEmail));}catch(e){}},tok);
  const page=await ctx.newPage();
  const frames=[];
  page.on('request',r=>{ if(r.url().includes('delete-all')) frames.push({m:r.method(),url:r.url().slice(0,110),body:(r.postData()||'NULL').slice(0,140)}); });
  page.on('response',r=>{ if(r.url().includes('delete-all')) frames.push({status:r.status()}); });

  await page.goto(APP,{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(page,'Buy now',40000);
  await page.locator('flt-semantics[role="button"]').filter({hasText:'Account'}).first().click({force:true}).catch(()=>{});
  await sleep(1600);
  const rowHit=await page.evaluate(()=>{
    let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if((e.textContent||'').trim()!=='Notifications') return;
      const roleOk=e.getAttribute('role')==='button'||e.getAttribute('flt-tappable')!==null;
      if(!roleOk) return; const r=e.getBoundingClientRect();
      if(r.width<10||r.height<10) return;
      if(!best||r.width*r.height<best.area) best={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
    }); return best;
  });
  await page.mouse.click(rowHit.x,rowHit.y); await sleep(2500);

  // open the dialog via the appbar Delete all IconButton
  const delBtn=await page.evaluate(()=>{
    let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const al=(e.getAttribute('aria-label')||'')+' '+(e.textContent||'');
      if(!/delete all/i.test(al)) return;
      if(/notifications\?/i.test(al)) return;   // skip the dialog title node
      const r=e.getBoundingClientRect(); if(r.width<8||r.height<8||r.width>200) return;
      best={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
    }); return best;
  });
  console.log('appbar del btn:',JSON.stringify(delBtn));
  await page.mouse.click(delBtn.x,delBtn.y); await sleep(1800);
  let uiText=await L.allText(page);
  console.log('dialog open:', uiText.includes('Delete all notifications?'));

  // confirm inside the dialog: the SMALL "Delete all" text button
  const confirm=await page.evaluate(()=>{
    let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if((e.textContent||'').trim()!=='Delete all') return;
      const roleOk=e.getAttribute('role')==='button'||e.getAttribute('flt-tappable')!==null;
      if(!roleOk) return;
      const r=e.getBoundingClientRect(); if(r.width<30||r.height<20||r.width>220) return;
      best={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
    }); return best;
  });
  console.log('confirm btn:',JSON.stringify(confirm));
  if(confirm){ await page.mouse.click(confirm.x,confirm.y); await sleep(3500); }

  const wire=frames;
  const afterRows=((await L.api(tok,'GET','/api/v1/notifications?page=0&size=50')).json.content)||[];
  const unread=(await L.api(tok,'GET','/api/v1/notifications/unread-count')).json;
  uiText=await L.allText(page);
  console.log('WIRE:',JSON.stringify(wire));
  console.log('rows after:',afterRows.length,'unread:',unread);
  console.log('UI empty state:',uiText.includes('No notifications yet.'));
  await L.screenshot(page,'e2e/shots/AU-058/AU-058-r14-mobile-delete-all-confirmed.png');
  fs.writeFileSync('/tmp/au058_deleteall_final2.json', JSON.stringify({
    rowsBefore:before.length, wireFrames:wire, rowsAfter:afterRows.length,
    unreadAfter:unread, uiEmptyState:uiText.includes('No notifications yet.')}, null, 1));
  await L.closeVideo(ctx,'e2e/videos/AU-058-r14-deleteall3.webm');
  await browser.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
