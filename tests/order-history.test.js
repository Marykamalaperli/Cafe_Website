import{test}from'node:test';
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{PGlite}from'@electric-sql/pglite';
import{orderHistory,visibleOrders}from'../public/shared/order-history.js';

test('history windows retain staff state and separate older active orders from three guest/five member entries',()=>{
 const orders=Array.from({length:12},(_,i)=>({reference:'BB-ORDER-'+i,createdAt:new Date(1700000000000+i*1000).toISOString(),status:i===0?'received':'collected',fulfilment:'pickup'})),before=structuredClone(orders);
 const guest=orderHistory(orders,{guest:true,reference:'BB-ORDER-1'});assert.equal(guest.history.items.length,3);assert.equal(guest.selectedOrder,null);assert.equal(guest.activeOrders[0].reference,'BB-ORDER-0');assert.ok(!visibleOrders(guest).some(order=>order.reference==='BB-ORDER-1'));
 const member=orderHistory(orders,{guest:false,page:1,reference:'BB-ORDER-1'});assert.equal(member.history.items.length,5);assert.equal(member.selectedOrder.reference,'BB-ORDER-1');assert.equal(member.history.total,12);
 assert.equal(orderHistory(orders,{guest:false,page:2}).history.items.length,2);assert.deepEqual(orders,before,'History limits never delete the staff dataset.');
});

test('real PostgreSQL enforces guest history, full member retrieval and administrator delivery progress',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,is_anonymous boolean not null default false,raw_user_meta_data jsonb,raw_app_meta_data jsonb,aud text,role text,created_at timestamptz,updated_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,storage to anon,authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to anon,authenticated;`);
  await db.exec(await readFile('supabase/setup.sql','utf8'));await db.exec(await readFile('supabase/migrations/006_guest_checkout.sql','utf8'));
  const migration=await readFile('supabase/migrations/007_order_history_delivery.sql','utf8');await db.exec(migration);
  const people={};
  for(const role of['guest','otherGuest','member','chef','admin']){
   const id=crypto.randomUUID(),guest=role.toLowerCase().includes('guest');people[role]=id;
   await db.query('insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data) values($1,$2,$3,$4,$5)',[id,guest?null:role+'@fixture.invalid',guest?null:new Date().toISOString(),guest,{role:'admin'}]);
   if(['chef','admin'].includes(role))await db.query('update public.user_roles set role=$1 where user_id=$2',[role,id]);
  }
  async function sql(query,args=[],who='guest',role='authenticated'){
   return db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[people[who]||'']);return tx.query(query,args);});
  }
  async function rpc(name,args=[],who='guest',role='authenticated'){
   try{return{data:(await sql(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args,who,role)).rows[0].result,error:null};}catch(error){return{data:null,error};}
  }
  const cafe=(await rpc('get_cafe',[],null,'anon')).data,date=new Date(cafe.today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);
  const input={name:'History fixture',email:'shared@example.invalid',phone:'9000000000',date:date.toISOString().slice(0,10),time:'10:00',consent:true,fulfilment:'pickup',items:[{id:'masala-dosa',quantity:1}]};
  const requests=[];
  async function place(who='guest',delivery=false){const p={...input,requestId:crypto.randomUUID(),...(delivery?{fulfilment:'delivery',address:'Isolated fixture address',postcode:'560001'}:{})};requests.push(p);const r=await rpc('place_order',[p],who);assert.equal(r.error,null,r.error?.message);return r.data.reference;}
  async function ready(reference){for(const status of['preparing','ready'])assert.equal((await rpc('transition_order',[reference,status],'chef')).error,null);}
  const oldest=await place();await ready(oldest);await rpc('transition_order',[oldest,'collected'],'chef');
  const active=await place('guest',true);for(let i=0;i<3;i++)await place();
  assert.equal((await db.query('select count(*)::int as n from public.delivery_assignments d join public.orders o on o.id=d.order_id where o.reference=$1',[active])).rows[0].n,1);
  let history=(await rpc('get_order_history',[0,'',oldest])).data;
  assert.equal(history.history.items.length,3);assert.equal(history.selectedOrder,null);assert.ok(history.activeOrders.some(order=>order.reference===active));
  assert.equal((await rpc('get_order_history',[0,'',active])).data.selectedOrder.reference,active);
  assert.equal((await rpc('get_order_history',[1])).error.code,'22023');assert.equal((await rpc('get_order_history',[],null,'anon')).error.code,'42501');
  assert.equal((await rpc('place_order',[requests[0]])).error.code,'22023','A hidden old order cannot be recovered through the retry RPC.');
  const oldId=(await db.query('select id from public.orders where reference=$1',[oldest])).rows[0].id;
  assert.equal((await sql('select * from public.orders where id=$1',[oldId])).rows.length,0);assert.equal((await sql('select * from public.order_items where order_id=$1',[oldId])).rows.length,0);assert.equal((await sql('select * from public.order_events where order_id=$1',[oldId])).rows.length,0);
  assert.equal((await db.query('select count(*)::int as n from public.orders where id=$1',[oldId])).rows[0].n,1,'Staff history is retained.');
  assert.equal((await rpc('get_order_history',[],'otherGuest')).data.history.total,0);
  assert.equal((await rpc('update_order_delivery',[active,'out_for_delivery'])).error.code,'42501');assert.equal((await rpc('update_order_delivery',[active,'out_for_delivery'],'chef')).error.code,'42501');
  assert.equal((await rpc('update_order_delivery',[active,'delivered'],'admin')).error.code,'22023');assert.equal((await rpc('update_order_delivery',[active,'out_for_delivery'],'admin')).error.code,'22023');
  await ready(active);assert.equal((await rpc('transition_order',[active,'collected'],'chef')).error.code,'22023');
  assert.equal((await rpc('update_order_delivery',[active,'out_for_delivery'],'admin')).error,null);assert.equal((await rpc('update_order_delivery',[active,'out_for_delivery'],'admin')).error,null);
  let tracking=(await rpc('get_order_history',[0,'',active])).data.selectedOrder;assert.equal(tracking.delivery.status,'out_for_delivery');assert.equal(tracking.status,'collected');
  assert.equal((await rpc('update_order_delivery',[active,'delivered'],'admin')).error,null);assert.equal((await rpc('update_order_delivery',[active,'delivered'],'admin')).error,null);
  assert.equal((await rpc('get_order_history',[0,'',active])).data.selectedOrder,null,'An older guest order leaves customer access after completion.');
  const delivered=(await rpc('get_operations',[],'admin')).data.orders.find(order=>order.reference===active);assert.equal(delivered.delivery.status,'delivered');assert.equal(delivered.delivery.timeline.length,2,'Delivery retries do not duplicate events.');
  assert.equal((await rpc('update_order_delivery',[active,'out_for_delivery'],'admin')).error.code,'22023');
  const members=[];for(let i=0;i<12;i++)members.push(await place('member'));
  const first=(await rpc('get_order_history',[],'member')).data;assert.equal(first.history.items.length,5);assert.equal(first.history.total,12);assert.equal(first.history.hasOlder,true);
  assert.equal((await rpc('get_order_history',[1],'member')).data.history.items.length,5);assert.equal((await rpc('get_order_history',[2],'member')).data.history.items.length,2);
  const search=(await rpc('get_order_history',[0,members[0],members[0]],'member')).data;assert.equal(search.history.items.length,1);assert.equal(search.selectedOrder.reference,members[0]);
  assert.equal((await rpc('get_order_history',[0,'',members[0]])).data.selectedOrder,null,'Guests never read another customer history.');assert.equal((await rpc('get_order_history',[0,'',oldest],'member')).data.selectedOrder,null);
  assert.equal((await rpc('get_operations',[],'member')).data.history.items.length,5);
  const count=(await db.query('select count(*)::int as n from public.orders')).rows[0].n;await db.exec(migration);assert.equal((await db.query('select count(*)::int as n from public.orders')).rows[0].n,count);assert.equal(count,17);
 }finally{await db.close();}
});
