import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { publicCloudConfig } from '../server/cloud-config.js';
import { createCloudApi } from '../server/cloud-api.js';
import { createApp } from '../server/app.js';
import { catalogueSeed } from '../scripts/prepare-supabase.js';
import catalogue from '../public/menu.json' with { type:'json' };
import manifest from '../public/photo-credits.json' with { type:'json' };

const config=publicCloudConfig({VITE_SUPABASE_URL:'https://unit-test.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_unit_test'});
test('only publishable configuration can reach browser builds; demo cannot override cloud roles',()=>{
 assert.deepEqual(publicCloudConfig({}),{enabled:false,demoEnabled:false});
 assert.deepEqual(publicCloudConfig({APP_DEMO_MODE:'true'}),{enabled:false,demoEnabled:true});
 assert.equal(publicCloudConfig({...config,VITE_SUPABASE_URL:config.url,VITE_SUPABASE_PUBLISHABLE_KEY:config.publishableKey,APP_DEMO_MODE:'true',SUPABASE_SERVICE_ROLE_KEY:'server_secret'}).demoEnabled,false);
 assert.throws(()=>publicCloudConfig({VITE_SUPABASE_URL:config.url}),/Both/);
 for(const key of ['sb_secret_do_not_expose','not-a-publishable-key','x.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.x'])assert.throws(()=>publicCloudConfig({VITE_SUPABASE_URL:config.url,VITE_SUPABASE_PUBLISHABLE_KEY:key}),/never a secret/);
 for(const url of ['http://example.com','https://user:password@example.com','https://example.com/?token=x'])assert.throws(()=>publicCloudConfig({VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:config.publishableKey}));
 assert.deepEqual(Object.keys(config).sort(),['enabled','demoEnabled','url','publishableKey'].sort());
 const payments=publicCloudConfig({VITE_SUPABASE_URL:config.url,VITE_SUPABASE_PUBLISHABLE_KEY:config.publishableKey,APP_PAYMENTS_ENABLED:'true',YOUPI_MERCHANT_API_KEY:'server-only-fixture'});
 assert.equal(payments.paymentsEnabled,true);assert.ok(!JSON.stringify(payments).includes('server-only-fixture'));
});

test('cloud API rejects missing/invalid tokens before RPC writes and passes valid caller JWTs through',async()=>{
 const calls=[];
 const api=createCloudApi(config,(url,key,options)=>({
  auth:{getUser:async token=>token==='verified-customer-token'?{data:{user:{id:'customer-id'}}}:{data:{user:null},error:{message:'invalid'}}},
  rpc:async(name,params)=>{calls.push({name,params,options});return{data:{reference:'BB-ORDER-TEST'},error:null};}
 }));
 const url=new URL('http://localhost/api/orders');
 await assert.rejects(api('/api/orders',{method:'POST',headers:{}},{},url),error=>error.status===401);
 await assert.rejects(api('/api/orders',{method:'POST',headers:{authorization:'Bearer invalid-token'}},{},url),error=>error.status===401);
 assert.equal(calls.length,0);
 const p={items:[{id:'masala-dosa',quantity:1}],total:1,role:'admin'};
 await api('/api/orders',{method:'POST',headers:{authorization:'Bearer verified-customer-token'}},p,url);
 assert.equal(calls[0].options.global.headers.Authorization,'Bearer verified-customer-token');
 assert.equal(calls[0].name,'place_order'); // Postgres, not this proxy or a supplied role/total, is the authority.
 assert.deepEqual(calls[0].params,{p});
});

test('configured cloud API never falls back to SQLite, preserves request security and serves no secrets',async t=>{
 let calls=0;
 const api=createCloudApi(config,()=>({auth:{getUser:async()=>({data:{user:{id:'caller'}}})},rpc:async()=>{calls++;return{data:null,error:{code:'42501'}};}}));
 const db={prepare(){throw new Error('SQLite must not be used in cloud mode.');}};
 const server=createServer(createApp({db,cloud:config,cloudApi:api}));server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const runtime=await fetch(base+'/supabase-config.json');assert.deepEqual(await runtime.json(),config);assert.equal(runtime.headers.get('cache-control'),'no-store');
 assert.match(runtime.headers.get('content-security-policy'),/https:\/\/unit-test\.supabase\.co/);
 const denied=await fetch(base+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,401);
 const forbidden=await fetch(base+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer signed-token'},body:'{}'});assert.equal(forbidden.status,403);
 assert.equal(calls,1);
 const csrf=await fetch(base+'/api/orders',{method:'POST',headers:{Origin:'https://other-site.example','Content-Type':'application/json'},body:'{}'});assert.equal(csrf.status,403);assert.equal(calls,1);
 const tooLarge=await fetch(base+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:'x'.repeat(17000)})});assert.equal(tooLarge.status,413);
});

test('catalogue migration includes all photos/options/availability, escapes SQL and preserves existing edits',()=>{
 const sql=catalogueSeed({...catalogue,items:catalogue.items.map((item,i)=>i?item:{...item,name:"Chef's dosa",available:false})});
 assert.equal((sql.match(/insert into public.menu_items\(/g)||[]).length,50);
 assert.equal((sql.match(/insert into public.menu_photos\(/g)||[]).length,40);
 assert.equal((sql.match(/on conflict\(id\) do nothing/g)||[]).length,98);
 assert.match(sql,/Chef''s dosa/);assert.match(sql,/,false\) on conflict/);
 assert.match(sql,/ghee-roast/);assert.match(sql,/extra-sambar/);
 assert.doesNotMatch(sql,/insert into (?:auth\.users|public\.(?:orders|reservations|messages))/);
 assert.throws(()=>catalogueSeed({...catalogue,items:[{...catalogue.items[0],image:'/custom.jpg'}]}),/custom photograph/);
 for(const photo of manifest.photos)assert.ok(sql.includes(photo.sha256));
});
