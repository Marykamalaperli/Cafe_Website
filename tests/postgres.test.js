import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// Real Postgres executes the actual migrations/functions/policies. Only GoTrue's
// auth schema and the Storage metadata schema are stand-ins; no Cloud writes occur.
const platform=`
 create role anon; create role authenticated;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,
  raw_user_meta_data jsonb,raw_app_meta_data jsonb,aud text,role text,created_at timestamptz,updated_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to anon,authenticated;
`;
test('actual PostgreSQL migrations enforce ownership, role separation, server pricing, transitions and Storage policies',async()=>{
 const db=new PGlite();
 try{
  await db.exec(platform);
  const schema=await readFile('supabase/migrations/001_bitesbro.sql','utf8');
  const seed=await readFile('supabase/migrations/002_catalogue.sql','utf8');
  const setup=await readFile('supabase/setup.sql','utf8');
  assert.equal(setup,schema+'\n'+seed,'Regenerate setup.sql after changing a migration.');
  await db.exec(setup);
  assert.equal((await db.query('select count(*)::int as n from public.menu_items')).rows[0].n,50);
  assert.equal((await db.query('select count(*)::int as n from public.menu_photos')).rows[0].n,40);
  const checked=await db.exec(await readFile('supabase/tests/security.sql','utf8'));
  assert.match(checked.at(-1).rows[0].result,/checks passed/);
  assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n,0,'Fixture users must roll back.');
  assert.equal((await db.query('select count(*)::int as n from public.orders')).rows[0].n,0,'Fixture orders must roll back.');
  await db.exec("update public.menu_items set name='Owner edit',price=15900,available=false where id='masala-dosa';");
  await db.exec(setup);
  assert.deepEqual((await db.query("select name,price,available from public.menu_items where id='masala-dosa'")).rows[0],{name:'Owner edit',price:15900,available:false});
  await assert.rejects(db.exec(await readFile('supabase/bootstrap-admin.sql','utf8')),/First create admin@bitesbro.com/);
  await db.exec('rollback');
  await db.exec("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(gen_random_uuid(),'admin@bitesbro.com',now(),'{}');");
  await db.exec(await readFile('supabase/bootstrap-admin.sql','utf8'));
  assert.equal((await db.query("select r.role from public.user_roles r join auth.users u on u.id=r.user_id where u.email='admin@bitesbro.com'")).rows[0].role,'admin');
 }finally{await db.close();}
});
