// Local UI verification: fixtures are intercepted; no backend writes occur.
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../build/web');
const output = path.resolve(__dirname, '../build/ui-polish');
fs.mkdirSync(output, {recursive: true});
const types = {'.html':'text/html', '.js':'application/javascript', '.json':'application/json', '.wasm':'application/wasm', '.webp':'image/webp', '.png':'image/png', '.ttf':'font/ttf'};
const server = http.createServer((req,res) => {
  const target = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!target.startsWith(root + path.sep) && target !== root) {res.writeHead(403).end(); return;}
  const file = fs.existsSync(target) && fs.statSync(target).isFile() ? target : path.join(root,'index.html');
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const art = '/images/home/globoexpats-listing-electronics.webp';
const categories = [{categoryId:1,categoryName:'Electronics',slug:'electronics',featured:true,subcategories:[
  {subcategoryId:10,subcategoryName:'Phones',imageUrl:art,featured:true,homePosition:1},
  {subcategoryId:11,subcategoryName:'Tablets',imageUrl:art,featured:true,homePosition:2}]}];
const products = [1,2,3,4].map(id => ({productId:id,productName:['Everyday headphones','Portable speaker','Travel camera','Desk essentials'][id-1],productAskingPrice:46000,productImages:[art],sellerName:'Community shop',averageRating:4.2}));
(async()=>{
 await new Promise(resolve=>server.listen(9147,'127.0.0.1',resolve));
 const browser = await chromium.launch({headless:true, channel:'chrome'});
 try {
  for (const width of [375,1280]) {
   const page=await browser.newPage({viewport:{width,height:width===375?667:900},deviceScaleFactor:1});
   const errors=[];
   const filters=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('http://localhost:8083/**', async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/filter')) filters.push(route.request().postDataJSON());
    let data=[];
    if(url.pathname.endsWith('/categories')) data=categories;
    else if(url.pathname.endsWith('/preference-collections')) data=[{id:1,title:'Everyday essentials',displayOrder:1,tiles:[{label:'Phones & tablets',imageUrl:art,subcategoryIds:[10,11]}]}];
    else if(url.pathname.includes('/displayItem/')) data={content:products,totalElements:4};
    else if(url.pathname.includes('commission')) data={};
    await route.fulfill({json:data,headers:{'access-control-allow-origin':'*'}});
   });
   await page.goto('http://127.0.0.1:9147/');
   await page.getByText('Most Popular Categories',{exact:true}).waitFor({timeout:60000});
   await page.waitForTimeout(2500);
   await page.screenshot({path:path.join(output,`home-${width}.png`)});
   await page.mouse.move(width / 2, 500);
   await page.mouse.wheel(0, 450);
   await page.waitForTimeout(500);
   await page.getByText('Phones & tablets',{exact:true}).locator('xpath=ancestor::flt-semantics[@flt-tappable][1]').click();
   await page.waitForTimeout(1500);
   await page.screenshot({path:path.join(output,`after-preference-${width}.png`)});
   await page.waitForFunction(() => document.querySelector('flt-semantics-host')?.textContent.includes('Everyday headphones'));
   assert(filters.some(f => JSON.stringify(f.subcategoryIds) === '[10,11]'), 'Preference must filter both subcategories');
   await page.screenshot({path:path.join(output,`browse-${width}.png`)});
   await page.goto('http://127.0.0.1:9147/#/expat/dashboard');
   await page.getByText('Sign in to continue',{exact:true}).click();
   await page.getByText('Welcome back',{exact:true}).waitFor();
   await page.screenshot({path:path.join(output,`login-${width}.png`)});
   assert.equal(errors.length,0,errors.join('\n'));
   console.log(`PASS ${width}: home, grouped preference navigation, browse, guest sign-in`);
   await page.close();
  }
 } finally {await browser.close(); server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
