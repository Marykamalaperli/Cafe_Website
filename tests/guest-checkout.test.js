import{test}from'node:test';
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{PGlite}from'@electric-sql/pglite';

test('guest checkout uses private Auth ownership, authoritative prices and customer-only permissions',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,is_anonymous boolean not null default false,raw_user_meta_data jsonb,raw_app_meta_data jsonb,aud text,role text,created_at timestamptz,updated_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,storage to anon,authenticated;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
   alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to anon,authenticated;`);
  const setup=await readFile('supabase/setup.sql','utf8'),guestSQL=await readFile('supabase/migrations/006_guest_checkout.sql','utf8');
  await db.exec(setup);await db.exec(guestSQL);
  const checks=await db.exec(await readFile('supabase/tests/security.sql','utf8'));
  assert.match(checks.at(-1).rows[0].result,/checks passed/,'Existing registered-customer, chef, admin and Storage protections still hold.');
  const people={};
  for(const role of['guestA','guestB','customer','chef','admin','unconfirmed']){
   const id=crypto.randomUUID(),guest=role.startsWith('guest');people[role]=id;
   await db.query('insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data) values($1,$2,$3,$4,$5)',[id,guest?null:role+'@bitesbro.invalid',guest||role==='unconfirmed'?null:new Date().toISOString(),guest,{role:'admin',is_anonymous:true}]);
   if(['chef','admin'].includes(role))await db.query('update public.user_roles set role=$1 where user_id=$2',[role,id]);
  }
  async function rpc(name,args=[],who='guestA',sqlRole='authenticated'){
   try{return{data:await db.transaction(async tx=>{await tx.exec('set local role '+sqlRole);await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[people[who]||'']);return(await tx.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;}),error:null};}
   catch(error){return{data:null,error};}
  }
  const status=await rpc('get_guest_checkout_status',[],null,'anon');assert.equal(status.data.enabled,true);
  assert.equal((await rpc('my_role')).data,'customer');assert.equal((await rpc('my_role',[],'unconfirmed')).data,null,'Metadata cannot turn an unconfirmed account into a guest.');
  const cafe=(await rpc('get_cafe',[],null,'anon')).data,date=new Date(cafe.today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);
  const input={requestId:crypto.randomUUID(),name:'Guest fixture',email:'shared-contact@example.invalid',phone:'9000000000',date:date.toISOString().slice(0,10),time:'10:00',fulfilment:'delivery',address:'Isolated PostgreSQL test address',postcode:'560001',consent:true,total:1,role:'admin',userId:people.admin,items:[{id:'masala-dosa',quantity:1,variant:'ghee-roast',spice:'mild',addons:['extra-sambar']}]};
  assert.equal((await rpc('place_order',[input],null,'anon')).error.code,'42501','A bare publishable key cannot write orders.');
  assert.equal((await rpc('place_order',[{...input,email:'invalid'}])).error.code,'22023');assert.equal((await rpc('place_order',[{...input,consent:false}])).error.code,'22023');
  const placed=await rpc('place_order',[input]);assert.equal(placed.error,null,placed.error?.message);const reference=placed.data.reference;
  assert.equal(placed.data.total,20000);assert.equal(placed.data.email,input.email);assert.equal((await db.query('select user_id from public.orders where reference=$1',[reference])).rows[0].user_id,people.guestA);
  assert.equal((await rpc('place_order',[input])).data.reference,reference,'Guest retries are idempotent.');
  const second=await rpc('place_order',[{...input,requestId:crypto.randomUUID()}],'guestB');assert.equal(second.error,null);
  const other=(await rpc('get_operations',[],'guestB')).data.orders;assert.equal(other.length,1);assert.equal(other[0].reference,second.data.reference,'Matching contact email never shares order ownership.');
  assert.equal((await rpc('get_operations',[],'customer')).data.orders.length,0);assert.equal((await rpc('transition_order',[reference,'cancelled'],'guestB')).error.code,'22023');
  for(const[name,args]of[['save_kitchen_settings',[false,30]],['set_menu_availability',['masala-dosa',false]],['set_staff_role',['chef@bitesbro.invalid','admin']],['submit_customer_form',['newsletter',{consent:true}]]])assert.equal((await rpc(name,args)).error.code,'42501');
  const ticket=(await rpc('get_operations',[],'chef')).data.orders.find(order=>order.reference===reference);for(const field of['email','name','phone','address','postcode'])assert.equal(field in ticket,false);
  assert.equal((await rpc('get_operations',[],'admin')).data.orders.length,2);
  const member=await rpc('place_order',[{...input,requestId:crypto.randomUUID(),email:'forged@example.invalid'}],'customer');assert.equal(member.data.email,'customer@bitesbro.invalid','Members continue to use their verified account email.');
  await db.query("update public.user_roles set role='admin' where user_id=$1",[people.guestB]);await db.query('update auth.users set email_confirmed_at=now() where id=$1',[people.guestB]);
  assert.equal((await rpc('my_role',[],'guestB')).data,null,'Even a guest accidentally assigned a staff role cannot receive staff access.');assert.equal((await rpc('get_operations',[],'guestB')).error.code,'42501');
  await db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1",[people.guestA]);assert.equal((await rpc('get_operations')).error.code,'42501');await db.query('update auth.users set banned_until=null where id=$1',[people.guestA]);
  for(let i=0;i<9;i++)assert.equal((await rpc('place_order',[{...input,requestId:crypto.randomUUID()}])).error,null);
  assert.equal((await rpc('place_order',[{...input,requestId:crypto.randomUUID()}])).error.code,'22023','Guest creation is bounded per hour.');
  assert.equal((await rpc('place_order',[input])).data.reference,reference,'A saved retry still works at the limit.');
  const count=(await db.query('select count(*)::int as n from public.orders')).rows[0].n;await db.exec(guestSQL);assert.equal((await db.query('select count(*)::int as n from public.orders')).rows[0].n,count);
  await assert.rejects(db.exec(setup),/forward migrations/,'An older baseline cannot silently remove guest access rules.');
 }finally{await db.close();}
});
