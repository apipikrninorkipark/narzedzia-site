const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname, '..');
 const server=http.createServer(async(req,res)=>{try{let file=path.join(root,req.url==='/'?'index.html':req.url);res.setHeader('Content-Type', file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}}).listen(8765);
 let browser;
 try { browser=await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})}); }
 catch (error) { server.close(); throw error; }
 try {
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://esm.sh/**',r=>r.fulfill({contentType:'application/javascript',body:`export function createClient(url){ return {supabaseUrl:url,auth:{onAuthStateChange(){},async signInWithPassword(){return {data:{session:{access_token:'admin'}}}},async signOut(){}}}; }`}));
 let projects=[];let configuredPin='123456';let tokenValid=true;let deniedAdmin=false;
 await page.route('**/functions/v1/workspace-api',async r=>{
 const b=r.request().postDataJSON();let status=200;let data={ok:true};
 if(b.action==='login'){if(b.pin!==configuredPin){status=401;data={error:'Nieprawidłowy PIN.'}}else{data={token:'a'.repeat(64)};tokenValid=true}}
 else if(['session','list','save'].includes(b.action)&&!tokenValid){status=401;data={error:'Sesja wygasła.'}}
 else if(b.action==='list')data={projects};
 else if(b.action==='save'){const p={id:'1',name:b.name,dimensions:b.dimensions};projects.unshift(p);data={project:p}}
 else if(b.action==='settings'&&deniedAdmin){status=403;data={error:'Brak uprawnień administratora.'}}
 else if(b.action==='change-pin'){configuredPin=b.pin;tokenValid=false}
 await r.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('http://localhost:8765');
 await page.waitForFunction(()=>document.querySelector('#pin-submit')!==null);
 assert.equal(await page.locator('#workspace').isVisible(),false);
 await page.locator('#workspace-pin').fill('000000');await page.locator('#pin-submit').click();
 await page.getByText('Nieprawidłowy PIN.',{exact:true}).waitFor();
 assert.equal(await page.locator('#workspace').isVisible(),false);
 await page.locator('#workspace-pin').fill('123456');await page.locator('#pin-submit').click();
 await page.locator('#workspace').waitFor({state:'visible'});
 await page.locator('#project-name').fill('Wspólny płot');await page.locator('#save-project').click();
 await page.getByRole('button',{name:'Wspólny płot',exact:true}).waitFor();
 assert.equal(projects[0].dimensions.width,200);
 await page.locator('[data-unit="mm"]').click();await page.locator('[data-mode="gap"]').click();
 await page.locator('#width').fill('3000');await page.locator('#project-name').fill('Projekt mm');await page.locator('#save-project').click();
 await page.getByRole('button',{name:'Projekt mm',exact:true}).waitFor();
 await page.getByRole('button',{name:'Wspólny płot',exact:true}).click();
 assert.equal(await page.locator('#width').inputValue(),'200');
 assert.equal(await page.locator('[data-unit="cm"]').getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'Projekt mm',exact:true}).click();
 assert.equal(await page.locator('#width').inputValue(),'3000');
 assert.equal(await page.locator('[data-mode="gap"]').getAttribute('aria-pressed'),'true');
 await page.reload();await page.locator('#workspace').waitFor({state:'visible'});
 await page.locator('#workspace [data-open-settings]').click();
 deniedAdmin=true;
 await page.locator('#admin-email').fill('user@example.com');await page.locator('#admin-password').fill('some-password');await page.locator('#admin-submit').click();
 await page.getByText('Brak uprawnień administratora.',{exact:true}).waitFor();
 assert.equal(await page.locator('#pin-settings-form').isVisible(),false);
 deniedAdmin=false;
 await page.locator('#admin-email').fill('admin@example.com');await page.locator('#admin-password').fill('some-password');await page.locator('#admin-submit').click();
 await page.locator('#pin-settings-form').waitFor({state:'visible'});
 await page.locator('#new-pin').fill('654321');await page.locator('#repeat-pin').fill('654321');await page.locator('#change-pin').click();
 await page.getByText('PIN zapisany. Wszystkie sesje robocze zostały wylogowane.',{exact:true}).waitFor();
 assert.equal(await page.locator('#workspace').isVisible(),false);
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('workspace-token')),null);
 await page.locator('#close-settings').click();
 await page.setViewportSize({width:390,height:844});
 await page.locator('#workspace-pin').fill('654321');await page.locator('#pin-submit').click();await page.locator('#workspace').waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
 assert.deepEqual(errors,[]);
 console.log('PASS: PIN gate, rejected PIN, shared save/load, unit/mode restoration, session reload, admin denial, PIN rotation, mobile render; no browser errors. API mocked; deployment not tested.');
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
