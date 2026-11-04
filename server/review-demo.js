import{createServer}from'node:http';
import{randomBytes}from'node:crypto';
import{pathToFileURL}from'node:url';
import{createReviewDatabase}from'./review-database.js';
import{createApp}from'./app.js';
import{createOrderServices}from'../supabase/functions/_shared/order-services.js';
import{hmac,orderEmail,equalSignature}from'../supabase/functions/_shared/providers.js';
import{createYoupiSimulator}from'../review/youpi-simulator.js';

export const REVIEW_PASSWORD='Demo-only-BitesBro-123!';
export async function startReviewDemo({port=3200,host='127.0.0.1'}={}){
 const database=await createReviewDatabase(),sessions=new Map(),captured=new Map(),providerOrders=new Map(),emails=[],courierOrders=new Map();
 const secret=randomBytes(32).toString('hex');let sequence=0,base;
 const payments={enabled:true,testMode:true,keyId:'review_simulator',
  async createOrder(order){const value={id:'order_review'+(++sequence),amount:order.amount,currency:'INR'};providerOrders.set(value.id,value);return value;},
  async payment(id){if(!captured.has(id))throw new Error('No simulated capture.');return captured.get(id);},
  async verifyCheckout(body){return equalSignature(body.signature,await hmac(secret,body.providerOrderId+'|'+body.paymentId));},
  async verifyWebhook(raw,signature){return equalSignature(signature,await hmac(secret,raw));},
  async refund(job){return{id:'rfnd_review'+(++sequence),confirmed:true};}
 };
 const email={enabled:true,async send(job){const content=orderEmail(job,base+'/');if(!emails.some(e=>e.id===job.id))emails.push({id:job.id,to:job.to,...content});return'review_email_'+job.id;}};
 const courier={enabled:true,testMode:true,name:'porter',async quote(){return{amount:4500,currency:'INR',vehicle:'2 Wheeler',etaMinutes:15};},async book(){const id='courier_review'+(++sequence);courierOrders.set(id,'booked');return{id};},async track(id){return{status:courierOrders.get(id)||'booked'};}};
 const userClient=token=>({auth:{getUser:async()=>({data:{user:sessions.get(token)||null},error:sessions.has(token)?null:{message:'Invalid session'}})},rpc:(name,args)=>database.rpc(name,args,sessions.get(token))});
 let serviceHandler,youpi;
 const staticApp=createApp({db:null,cloud:{enabled:false,demoEnabled:false},siteUrl:'http://localhost:'+port});
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://review');
  const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const token=req.headers.authorization?.replace(/^Bearer /,''),who=sessions.get(token);
  try{
   if(url.pathname==='/supabase-config.json')return json({enabled:true,demoEnabled:false,url:'/sandbox-supabase',publishableKey:'sb_publishable_isolated_review',reviewSandbox:true});
   if(url.pathname==='/api/health')return json({status:'ok',database:'isolated-postgresql',sandbox:true});
   if(url.pathname==='/review/'||url.pathname==='/review'){
    res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
    return res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BitesBro · interactive review</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/operations.css"><link rel="stylesheet" href="/auth.css"></head><body class="ops-app"><main class="auth-main"><section class="ops-panel auth-card"><p class="eyebrow">UNCOMMITTED REVIEW DEMO</p><h1>One order.<br><em>Every step.</em></h1><p>Running against an isolated PostgreSQL database. Payments, email and riders are simulated. No real charges, messages or deliveries.</p><p>Open each role in a separate tab. Sign in with the listed email and this demo-only password:</p><p><code>${REVIEW_PASSWORD}</code></p>${database.users.map(user=>`<p><a class="ops-button" rel="noopener" target="_blank" href="/auth/?reviewRole=${user.role}&next=${encodeURIComponent(user.role==='customer'?'/':user.role==='chef'?'/kitchen/':'/admin/')}">Open ${user.role}</a><br><small>${user.email}</small></p>`).join('')}<p>Customer: choose a dish, delivery, and UPI; submit a demo reference. Admin: confirm the simulated bank receipt in Settings. Chef: prepare the ticket. Admin: quote and book a courier, simulate pickup/delivery, then process the email previews. Refresh the customer's tracking page to follow progress.</p><p class="ops-muted">Records reset when this review server restarts. Production data is never read or changed.</p></section></main></body></html>`);
   }
   if(url.pathname==='/sandbox-supabase/auth/v1/token'){
    const body=await readJSON(req),user=database.users.find(u=>u.email===body.email);
    if(!user||body.password!==REVIEW_PASSWORD)return json({error:'invalid_grant',error_description:'Use a listed review account.'},400);
    const accessToken=randomBytes(32).toString('base64url');sessions.set(accessToken,user);
    return json({access_token:accessToken,refresh_token:accessToken,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user});
   }
   if(url.pathname==='/sandbox-supabase/auth/v1/user')return who?json(who):json({message:'Sign in first.'},401);
   if(url.pathname==='/sandbox-supabase/auth/v1/logout'){sessions.delete(token);return json({});}
   if(url.pathname.startsWith('/sandbox-supabase/rest/v1/rpc/')){
    const name=url.pathname.split('/').at(-1),args=req.method==='POST'?await readJSON(req):Object.fromEntries(url.searchParams);
    const result=await database.rpc(name,args,who);
    return result.error?json(result.error,result.error.code==='42501'?403:400):json(result.data);
   }
   if(url.pathname.startsWith('/sandbox-supabase/functions/v1/order-services/')){
    const bytes=await readBytes(req);const request=new Request(base+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:bytes}:{} )});
    const response=await serviceHandler(request);res.writeHead(response.status,Object.fromEntries(response.headers));return res.end(Buffer.from(await response.arrayBuffer()));
   }
   if(url.pathname==='/review/payments/complete'){
    if(!who)return json({error:'Sign in first.'},401);
    const body=await readJSON(req),context=await database.service.rpc('service_order_context',{p_reference:body.reference,p_user:who.id});
    if(context.error||context.data.providerOrderId!==body.providerOrderId)return json({error:'This payment is not available.'},403);
    const order=providerOrders.get(body.providerOrderId);if(!order)return json({error:'No pending simulated payment.'},400);
    const payment={id:'pay_review'+(++sequence),order_id:order.id,amount:order.amount,currency:'INR',status:'captured'};captured.set(payment.id,payment);
    return json({paymentId:payment.id,providerOrderId:order.id,signature:await hmac(secret,order.id+'|'+payment.id)});
   }
   if(url.pathname==='/review/youpi/submit'){
    if((await database.rpc('my_role',{},who)).data!=='customer')return json({error:'Customer required.'},403);
    const body=await readJSON(req),context=await database.service.rpc('service_youpi_context',{p_reference:body.reference,p_user:who.id});
    if(context.error)return json({error:'This checkout is not available.'},403);
    const response=await youpi.claim(context.data,body.utr,base+'/sandbox-supabase/functions/v1/order-services/youpi/webhook',serviceHandler);
    return json(await response.json(),response.status);
   }
   if(url.pathname==='/review/emails'){
    const role=await database.rpc('my_role',{},who);if(role.data!=='admin')return json({error:'Administrator required.'},403);return json(emails);
   }
   if(url.pathname==='/review/courier/advance'){
    if((await database.rpc('my_role',{},who)).data!=='admin')return json({error:'Administrator required.'},403);
    const body=await readJSON(req),context=await database.service.rpc('service_delivery_context',{p_reference:body.reference});
    if(context.error||!context.data.providerId||!['out_for_delivery','delivered','cancelled'].includes(body.status))return json({error:'Choose a valid simulated courier update.'},400);
    courierOrders.set(context.data.providerId,body.status);return json({updated:true});
   }
   // The rest is the actual customer/admin/KDS frontend and existing local assets.
   return staticApp(req,res);
  }catch(error){return json({error:error.code==='42501'?'Access denied.':'The isolated review request failed.'},500);}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
 base='http://'+(host==='0.0.0.0'?'127.0.0.1':host)+':'+server.address().port;
 const youpiSessions=new Map();
 youpi=createYoupiSimulator({secret,siteURL:base+'/',load:async(reference,id)=>reference?youpiSessions.get(reference):[...youpiSessions.values()].find(s=>s.paymentId===id),save:async session=>youpiSessions.set(session.orderId,{...session})});
 serviceHandler=createOrderServices({env:{SITE_URL:base+'/',ALLOWED_ORIGINS:[base,'http://localhost:'+server.address().port,process.env.REVIEW_PUBLIC_URL].filter(Boolean).join(','),ORDER_JOB_SECRET:secret},service:database.service,userClient,payments,email,courier,youpi:youpi.provider});
 return{server,database,base,emails,close:()=>new Promise(resolve=>server.close(async()=>{await database.close();resolve();}))};
}
async function readBytes(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>262144)throw new Error('Request too large.');chunks.push(chunk);}return Buffer.concat(chunks);}
async function readJSON(req){return JSON.parse((await readBytes(req)).toString('utf8')||'{}');}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const demo=await startReviewDemo({host:process.env.REVIEW_HOST||'127.0.0.1',port:Number(process.env.REVIEW_PORT||3200)});console.log('BitesBro isolated review server ready on port '+demo.server.address().port+'. Open /review/ in the environment browser.');process.on('SIGTERM',()=>demo.close().then(()=>process.exit(0)));process.on('SIGINT',()=>demo.close().then(()=>process.exit(0)));}
