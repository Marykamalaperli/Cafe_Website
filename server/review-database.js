// Development-only PostgreSQL review database. No Cloud settings are loaded.
import{PGlite}from'@electric-sql/pglite';
import{readFile}from'node:fs/promises';

export const reviewPlatform=`
 create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb,raw_app_meta_data jsonb,aud text,role text,created_at timestamptz,updated_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to anon,authenticated;
`;
export async function createReviewDatabase(){
 const db=new PGlite();await db.exec(reviewPlatform);
 for(const path of ['supabase/setup.sql','supabase/migrations/003_order_services.sql','supabase/migrations/004_courier_dispatch.sql','supabase/migrations/005_youpi_checkout.sql'])await db.exec(await readFile(path,'utf8'));
 const users=[];
 for(const role of ['customer','chef','admin']){
  const user={id:crypto.randomUUID(),email:`demo.${role}@bitesbro.invalid`,role,user_metadata:{display_name:`Demo ${role}`},email_confirmed_at:new Date().toISOString(),aud:'authenticated'};
  await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)',[user.id,user.email,user.user_metadata]);
  await db.query('update public.user_roles set role=$1 where user_id=$2',[role,user.id]);users.push(user);
 }
 await db.exec("update public.restaurant_settings set online_payments_enabled=true,merchant_upi_id='review-only@invalid',merchant_payee_name='BitesBro Review (simulation)' where id");
 async function rpc(name,args={},who=null,service=false){
  if(!/^[a-z][a-z0-9_]*$/.test(name)||Object.keys(args).some(k=>!/^p(?:_[a-z0-9]+)*$/.test(k)))return{data:null,error:{code:'22023',message:'Invalid RPC.'}};
  try{
   const data=await db.transaction(async tx=>{
    await tx.exec(`set local role ${service?'service_role':who?'authenticated':'anon'}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[who?.id||'']);
    const keys=Object.keys(args),query=`select public.${name}(${keys.map((key,index)=>`${key} => $${index+1}`).join(',')}) as result`;
    return(await tx.query(query,keys.map(key=>args[key]))).rows[0]?.result??null;
   });return{data,error:null};
  }catch(error){return{data:null,error:{code:error.code||'XX000',message:error.message}};}
 }
 return{db,users,rpc,service:{rpc:(name,args)=>rpc(name,args,null,true)},close:()=>db.close()};
}
