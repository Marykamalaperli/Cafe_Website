// GitHub Pages review sandbox only. Never installed on the production site.
import{PGlite}from'./vendor/pglite/index.js';
import{platform,migrations,databaseVersion}from'./review-data.js';
import{createOrderServices}from'./services/order-services.js';
import{hmac,equalSignature,orderEmail}from'./services/providers.js';
import{createYoupiSimulator}from'./services/review-youpi.js';
const scope=self.registration.scope,password='Demo-only-BitesBro-123!';
let ready;
async function backend(){
 return ready||=(async()=>{
  const db=new PGlite('idb://bitesbro-review-'+databaseVersion+'-'+new URL(scope).pathname.replace(/[^a-z0-9]/gi,'-'));
  if(!(await db.query("select to_regclass('public.bitesbro_schema_migrations') as t")).rows[0].t){await db.exec(platform);for(const sql of migrations)await db.exec(sql);}
  await db.exec(`create table if not exists auth.review_sessions(token text primary key,user_id uuid references auth.users(id),expires_at timestamptz);
   create table if not exists auth.review_captures(id text primary key,provider_order text unique,amount integer);
   create table if not exists auth.review_emails(id text primary key,recipient text,subject text,body text);
   create table if not exists auth.review_secrets(id boolean primary key,secret text);`);
  await db.exec('create table if not exists auth.review_couriers(id text primary key,status text);');
  await db.exec('create table if not exists auth.review_youpi(id text primary key,reference text unique,session jsonb);');
  let secret=(await db.query('select secret from auth.review_secrets where id')).rows[0]?.secret;
  if(!secret){secret=crypto.randomUUID()+crypto.randomUUID();await db.query('insert into auth.review_secrets values(true,$1)',[secret]);}
  const users=[];
  for(const role of['customer','chef','admin']){
   const email=`demo.${role}@bitesbro.invalid`;let user=(await db.query('select id,email,raw_user_meta_data as user_metadata,email_confirmed_at from auth.users where email=$1',[email])).rows[0];
   if(!user){user={id:crypto.randomUUID(),email,user_metadata:{display_name:'Demo '+role},email_confirmed_at:new Date().toISOString()};await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)',[user.id,email,user.user_metadata]);await db.query('update public.user_roles set role=$1 where user_id=$2',[role,user.id]);}
   users.push({...user,aud:'authenticated',role});
  }
  await db.exec("update public.restaurant_settings set online_payments_enabled=true,merchant_upi_id='review-only@invalid',merchant_payee_name='BitesBro Review (simulation)' where id");
  async function rpc(name,args={},who=null,service=false){
   if(!/^[a-z][a-z0-9_]*$/.test(name)||Object.keys(args).some(k=>!/^p(?:_[a-z0-9]+)*$/.test(k)))return{data:null,error:{code:'22023',message:'Invalid review RPC.'}};
   try{const data=await db.transaction(async tx=>{await tx.exec(`set local role ${service?'service_role':who?'authenticated':'anon'}`);await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[who?.id||'']);const keys=Object.keys(args);return(await tx.query(`select public.${name}(${keys.map((key,i)=>`${key} => $${i+1}`).join(',')}) as result`,keys.map(key=>args[key]))).rows[0]?.result??null;});return{data,error:null};}
   catch(error){return{data:null,error:{code:error.code||'XX000',message:error.message}};}
  }
  const service={rpc:(name,args)=>rpc(name,args,null,true)};
  async function session(token){if(!token)return null;const found=(await db.query('select user_id from auth.review_sessions where token=$1 and expires_at>now()',[token])).rows[0];return found?users.find(user=>user.id===found.user_id):null;}
  const userClient=token=>({auth:{getUser:async()=>({data:{user:await session(token)},error:null})},rpc:async(name,args)=>rpc(name,args,await session(token))});
  const payments={enabled:true,testMode:true,keyId:'review_simulator',
   async createOrder(order){return{id:'order_review'+crypto.randomUUID().replaceAll('-',''),amount:order.amount,currency:'INR'};},
   async payment(id){const p=(await db.query('select * from auth.review_captures where id=$1',[id])).rows[0];if(!p)throw new Error('No simulated capture.');return{id:p.id,order_id:p.provider_order,amount:p.amount,currency:'INR',status:'captured'};},
   async verifyCheckout(body){return equalSignature(body.signature,await hmac(secret,body.providerOrderId+'|'+body.paymentId));},
   async verifyWebhook(raw,signature){return equalSignature(signature,await hmac(secret,raw));},
   async refund(){return{id:'rfnd_review'+crypto.randomUUID().replaceAll('-',''),confirmed:true};}
  };
  const email={enabled:true,async send(job){const content=orderEmail(job,scope);await db.query('insert into auth.review_emails(id,recipient,subject,body) values($1,$2,$3,$4) on conflict do nothing',[job.id,job.to,content.subject,content.text]);return'review_email_'+job.id;}};
  const courier={enabled:true,testMode:true,name:'porter',async quote(){return{amount:4500,currency:'INR',vehicle:'2 Wheeler',etaMinutes:15};},async book(){const id='courier_review'+crypto.randomUUID().replaceAll('-','');await db.query('insert into auth.review_couriers values($1,$2)',[id,'booked']);return{id};},async track(id){return{status:(await db.query('select status from auth.review_couriers where id=$1',[id])).rows[0]?.status||'booked'};}};
  const youpi=createYoupiSimulator({secret,siteURL:scope,load:async(reference,id)=>(await db.query('select session from auth.review_youpi where reference=$1 or id=$2',[reference,id])).rows[0]?.session,save:async session=>{await db.query('insert into auth.review_youpi values($1,$2,$3) on conflict(id) do update set session=excluded.session',[session.paymentId,session.orderId,session]);}});
  const handler=createOrderServices({env:{SITE_URL:scope,ALLOWED_ORIGINS:new URL(scope).origin,ORDER_JOB_SECRET:secret},service,userClient,payments,email,courier,youpi:youpi.provider});
  return{db,users,rpc,session,handler,secret,service,youpi};
 })();
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function route(request){
 const url=new URL(request.url),path='/'+url.pathname.slice(new URL(scope).pathname.length);
 if(path==='/supabase-config.json')return json({enabled:true,demoEnabled:false,url:new URL('sandbox-supabase',scope).href,publishableKey:'sb_publishable_isolated_review',reviewSandbox:true});
 const server=await backend(),token=request.headers.get('authorization')?.replace(/^Bearer /,''),who=await server.session(token);
 if(path==='/review-health')return json({ready:true,sandbox:true,database:'isolated-postgresql'});
 if(path==='/sandbox-supabase/auth/v1/token'){
  const body=await request.json(),user=server.users.find(user=>user.email===body.email);
  if(!user||body.password!==password)return json({error:'invalid_grant',error_description:'Use the listed review account.'},400);
  const access=crypto.randomUUID()+crypto.randomUUID();await server.db.query("insert into auth.review_sessions values($1,$2,now()+interval '1 hour')",[access,user.id]);
  return json({access_token:access,refresh_token:access,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user});
 }
 if(path==='/sandbox-supabase/auth/v1/user')return who?json(who):json({message:'Sign in first.'},401);
 if(path==='/sandbox-supabase/auth/v1/logout'){await server.db.query('delete from auth.review_sessions where token=$1',[token]);return json({});}
 if(path.startsWith('/sandbox-supabase/rest/v1/rpc/')){
  const result=await server.rpc(path.split('/').at(-1),request.method==='POST'?await request.json():Object.fromEntries(url.searchParams),who);
  return result.error?json(result.error,result.error.code==='42501'?403:400):json(result.data);
 }
 if(path.startsWith('/sandbox-supabase/functions/v1/order-services/'))return server.handler(request);
 if(path==='/review/payments/complete'){
  if(!who)return json({error:'Sign in first.'},401);const body=await request.json();const context=await server.service.rpc('service_order_context',{p_reference:body.reference,p_user:who.id});
  if(context.error||context.data.providerOrderId!==body.providerOrderId)return json({error:'This payment is not available.'},403);
  let capture=(await server.db.query('select * from auth.review_captures where provider_order=$1',[body.providerOrderId])).rows[0];
  if(!capture){capture={id:'pay_review'+crypto.randomUUID().replaceAll('-',''),provider_order:body.providerOrderId,amount:context.data.amount};await server.db.query('insert into auth.review_captures values($1,$2,$3)',[capture.id,capture.provider_order,capture.amount]);}
  return json({paymentId:capture.id,providerOrderId:body.providerOrderId,signature:await hmac(server.secret,body.providerOrderId+'|'+capture.id)});
 }
 if(path==='/review/youpi/submit'){
  if((await server.rpc('my_role',{},who)).data!=='customer')return json({error:'Customer required.'},403);
  const body=await request.json(),context=await server.service.rpc('service_youpi_context',{p_reference:body.reference,p_user:who.id});
  if(context.error)return json({error:'This checkout is not available.'},403);
  return server.youpi.claim(context.data,body.utr,new URL('sandbox-supabase/functions/v1/order-services/youpi/webhook',scope),server.handler);
 }
 if(path==='/review/emails'){
  if((await server.rpc('my_role',{},who)).data!=='admin')return json({error:'Administrator required.'},403);
  return json((await server.db.query('select id,recipient as "to",subject,body as text from auth.review_emails order by id')).rows);
 }
 if(path==='/review/courier/advance'){
  if((await server.rpc('my_role',{},who)).data!=='admin')return json({error:'Administrator required.'},403);
  const body=await request.json(),context=await server.service.rpc('service_delivery_context',{p_reference:body.reference});
  if(context.error||!context.data.providerId||!['out_for_delivery','delivered','cancelled'].includes(body.status))return json({error:'Choose a valid simulated courier update.'},400);
  await server.db.query('update auth.review_couriers set status=$1 where id=$2',[body.status,context.data.providerId]);return json({updated:true});
 }
 return json({error:'This review endpoint does not exist.'},404);
}
self.addEventListener('install',event=>{event.waitUntil(self.skipWaiting());});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(url.origin!==new URL(scope).origin||!url.pathname.startsWith(new URL(scope).pathname))return;
 const path=url.pathname.slice(new URL(scope).pathname.length);
 if(path==='supabase-config.json'||path==='review-health'||path.startsWith('sandbox-supabase/')||path==='review/payments/complete'||path==='review/youpi/submit'||path==='review/emails'||path==='review/courier/advance')event.respondWith(route(event.request).catch(()=>json({error:'The isolated review database could not start. Reload the review page.'},503)));
});
