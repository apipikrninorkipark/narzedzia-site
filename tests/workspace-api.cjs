// Execute the actual Edge Function with only Supabase and Deno replaced.
const {stripTypeScriptTypes}=require('node:module');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const dir=path.resolve(__dirname,'../supabase/functions/workspace-api');
 const context=vm.createContext({Request,Response,TextEncoder,crypto,Date,console});
 let handler,stored=[],sessionValid=true;
 const calls=[];
 const db={from(table){calls.push(table);let row,id;
  const q={select(){return q;},eq(key,value){if(key==='id')id=value;return q;},gt(){return q;},order(){return q;},
   limit(){return Promise.resolve({data:stored.map(({inputs,...p})=>p),error:null});},
   insert(value){row={id:'00000000-0000-4000-8000-000000000001',created_at:new Date().toISOString(),...value};return q;},
   single(){stored.push(row);return Promise.resolve({data:row,error:null});},
   maybeSingle(){return Promise.resolve({data:table==='workspace_sessions'?(sessionValid?{expires_at:'2099-01-01'}:null):stored.find(p=>p.id===id)||null,error:null});}};
  return q;
 }};
 context.Deno={env:{get:key=>key==='ALLOWED_ORIGINS'?'https://example.com':'test'},serve:fn=>{handler=fn;}};
 const imports={
  './granada.ts':new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(path.join(dir,'granada.ts'),'utf8')),{context}),
  'https://esm.sh/@supabase/supabase-js@2':new vm.SyntheticModule(['createClient'],function(){this.setExport('createClient',()=>db);},{context})
 };
 const server=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(path.join(dir,'index.ts'),'utf8')),{context});
 await server.link(specifier=>imports[specifier]);await server.evaluate();
 async function request(action,values={},token='a'.repeat(64)){
  const response=await handler(new Request('https://example.com/api',{method:'POST',headers:{Origin:'https://example.com',Authorization:'Bearer '+token},body:JSON.stringify({action,...values})}));
  return {status:response.status,data:await response.json()};
 }
 for(const action of ['granada-list','granada-save','granada-get']) assert.equal((await request(action,{},'')).status,401);
 const price={name:'Cennik testowy',values:{D3:444,P15:120.5}};
 const saved=await request('granada-save',price);assert.equal(saved.status,200);assert.equal(saved.data.price.inputs.P15,120.5);
 const list=await request('granada-list');assert.equal(list.status,200);assert.equal(list.data.prices[0].name,price.name);
 const loaded=await request('granada-get',{id:saved.data.price.id});assert.equal(loaded.status,200);assert.deepEqual(loaded.data.price.inputs,price.values);
 assert.equal((await request('granada-save',{...price,values:{P15:-1}})).status,400);
 assert.equal((await request('granada-get',{id:'bad'})).status,400);
 assert.equal((await request('granada-get',{id:'00000000-0000-4000-8000-000000000002'})).status,404);
 sessionValid=false;assert.equal((await request('granada-list')).status,401);
 assert.ok(calls.includes('workspace_granada_prices'));
 console.log('PASS: Edge Function compiles; actual GRANADA save/list/get, validation, missing record and session enforcement. Supabase mocked.');
})().catch(e=>{console.error(e);process.exitCode=1;});
