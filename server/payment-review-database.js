// Development/test PostgreSQL only. Never loaded by the production server.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

export const paymentMigrations = ['supabase/setup.sql', 'supabase/migrations/006_guest_checkout.sql', 'supabase/migrations/007_order_history_delivery.sql', 'supabase/migrations/008_youpi_payments.sql'];
export const paymentPlatform = `
create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create schema storage;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,is_anonymous boolean not null default false,raw_user_meta_data jsonb,raw_app_meta_data jsonb,aud text,role text,created_at timestamptz,updated_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,storage to anon,authenticated;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to anon,authenticated;
`;
export async function createPaymentReviewDatabase({includePayments=true}={}) {
 const db = new PGlite(); await db.exec(paymentPlatform);
 for (const file of includePayments?paymentMigrations:paymentMigrations.slice(0,-1)) await db.exec(await readFile(file, 'utf8'));
 const users = [];
 for (const role of ['customer', 'chef', 'admin', 'guest', 'other']) {
  const guest = role === 'guest', user = { id: crypto.randomUUID(), email: guest ? null : `demo.${role}@bitesbro.invalid`, is_anonymous: guest, role: ['guest', 'other'].includes(role) ? 'customer' : role, user_metadata: { display_name: 'Demo ' + role } };
  await db.query('insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data) values($1,$2,$3,$4,$5)', [user.id, user.email, guest ? null : new Date().toISOString(), guest, user.user_metadata]);
  await db.query('update public.user_roles set role=$1 where user_id=$2', [user.role, user.id]); users.push(user);
 }
 async function rpc(name, args = {}, who = null, service = false) {
  if (!/^[a-z][a-z0-9_]*$/.test(name) || Object.keys(args).some(key => !/^p(?:_[a-z0-9]+)*$/.test(key))) return { data: null, error: { code: '22023', message: 'Invalid review RPC.' } };
  try {
   const data = await db.transaction(async tx => {
    await tx.exec(`set local role ${service ? 'service_role' : who ? 'authenticated' : 'anon'}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [who?.id || '']);
    const keys = Object.keys(args);
    return (await tx.query(`select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(',')}) as result`, keys.map(key => args[key]))).rows[0]?.result ?? null;
   }); return { data, error: null };
  } catch (error) { return { data: null, error: { code: error.code || 'XX000', message: error.message } }; }
 }
 return { db, users, rpc, service: { rpc: (name, args) => rpc(name, args, null, true) }, close: () => db.close() };
}
