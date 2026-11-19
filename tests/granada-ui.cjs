const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const server=http.createServer(async(req,res)=>{try{
  res.setHeader('Content-Type',req.url.endsWith('.js')?'application/javascript':req.url.endsWith('.css')?'text/css':'text/html');
  res.end(await fs.readFile(path.join(root,req.url==='/'?'index.html':req.url)));
 }catch{res.writeHead(404).end();}}).listen(8766);
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
  const context=await browser.newContext();const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await context.route('https://esm.sh/**',r=>r.fulfill({contentType:'application/javascript',body:'export const createClient=url=>({supabaseUrl:url,auth:{onAuthStateChange(){}}});'}));
  let prices=[],valid=true;
  await context.route('**/functions/v1/workspace-api',async r=>{
   const b=r.request().postDataJSON();let data={ok:true},status=200;
   if(!valid||!r.request().headers().authorization){status=401;data={error:'Sesja wygasła.'};}
   else if(b.action==='granada-list')data={prices:prices.map(({inputs,...p})=>p)};
   else if(b.action==='granada-save'){const price={id:String(prices.length+1),name:b.name,inputs:b.values,created_at:new Date().toISOString()};prices.unshift(price);data={price};}
   else if(b.action==='granada-get')data={price:prices.find(p=>p.id===b.id)};
   await r.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://localhost:8766/granada.html');await page.waitForURL('**/index.html');
  await page.evaluate(()=>sessionStorage.setItem('workspace-token','a'.repeat(64)));
  await page.goto('http://localhost:8766/granada.html');
  await page.getByText('Połączono ze wspólną bazą.',{exact:false}).waitFor();
  assert.equal(await page.locator('#loadCloud').isDisabled(),true);
  const input=page.locator('[data-cell="D3"]');await input.fill('444');await input.dispatchEvent('change');
  await page.locator('[data-view="tub"]').click();
  const rate=page.getByRole('spinbutton',{name:'Stawka za osobę',exact:true});
  assert.equal(await rate.inputValue(),'95');
  await rate.fill('120.50');await rate.dispatchEvent('change');
  assert.equal(await page.locator('[data-result="O15"]').textContent(),'482,00');
  assert.equal(await page.locator('[data-result="O31"]').textContent(),'2410,00');
  await page.reload();await page.getByText('Połączono ze wspólną bazą.',{exact:false}).waitFor();
  await page.locator('[data-view="tub"]').click();assert.equal(await rate.inputValue(),'120.5');
  await page.locator('[data-view="high"]').click();
  await page.locator('#priceName').fill('<b>Lato</b>');await page.locator('#saveCloud').click();
  await page.getByText('Zapisano nową wersję cennika we wspólnej bazie.',{exact:true}).waitFor();
  assert.equal(prices[0].inputs.D3,444);assert.equal(prices[0].inputs.P15,120.5);assert.equal(await page.locator('#priceList b').count(),0);
  await input.fill('555');await input.dispatchEvent('change');
  await page.locator('#loadCloud').click();await page.getByText('Wczytano cennik z bazy.',{exact:true}).waitFor();
  assert.equal(await input.inputValue(),'444');
  const second=await context.newPage();
  await second.goto('http://localhost:8766/index.html');await second.evaluate(()=>sessionStorage.setItem('workspace-token','a'.repeat(64)));
  second.on('dialog',d=>d.accept());await second.goto('http://localhost:8766/granada.html');
  await second.locator('#loadCloud').click();await second.getByText('Wczytano cennik z bazy.',{exact:true}).waitFor();
  assert.equal(await second.locator('[data-cell="D3"]').inputValue(),'444');
  await second.locator('[data-view="tub"]').click();
  assert.equal(await second.locator('[data-cell="P15"]').inputValue(),'120.5');
  delete prices[0].inputs.P15;
  await second.locator('#loadCloud').click();await second.waitForFunction(()=>document.querySelector('[data-cell="P15"]').value==='95');
  assert.equal(await second.locator('[data-result="O15"]').textContent(),'380,00');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  valid=false;await page.locator('#refreshCloud').click();await page.waitForURL('**/index.html');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('workspace-token')),null);
  assert.deepEqual(errors,[]);
  console.log('PASS: GRANADA session gate, cloud save/load, shared record, escaped names, mobile layout, expired session. API mocked.');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
