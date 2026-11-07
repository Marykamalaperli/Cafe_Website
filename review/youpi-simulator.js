// Isolated contract simulator, not YouPI-PG itself and never used in production.
import{youpiProvider}from'../supabase/functions/_shared/youpi.js';
import{hmac}from'../supabase/functions/_shared/providers.js';

export function createYoupiSimulator({secret,siteURL,load,save}){
 const env={YOUPI_API_URL:'https://api.youpi-simulator.invalid',YOUPI_CHECKOUT_URL:'https://checkout.youpi-simulator.invalid',YOUPI_MERCHANT_ID:'isolated-review',YOUPI_MERCHANT_API_KEY:secret,YOUPI_WEBHOOK_SECRET:secret,SITE_URL:siteURL};
 const provider=youpiProvider(env,async(url,options)=>{
  if(options.headers['X-Merchant-Key']!==secret)return new Response('{}',{status:401});
  if(options.method==='POST'){
   const body=JSON.parse(options.body);
   if(body.method!=='MANUAL_UPI'||!/^\d+\.\d{2}$/.test(body.amount))return new Response('{}',{status:400});
   let session=await load(body.orderId);
   if(!session){session={paymentId:crypto.randomUUID(),orderId:body.orderId,amountPaise:Number(body.amount.replace('.','')),currency:'INR',method:'MANUAL_UPI',status:'INITIATED'};await save(session);}
   return Response.json({...session,amountPaise:String(session.amountPaise),checkoutUrl:env.YOUPI_CHECKOUT_URL+'/checkout/'+session.paymentId});
  }
  // The real get-payment API does not expose a customer's submitted UTR.
  const id=new URL(url).pathname.split('/').at(-1),session=await load(null,id);
  return session?Response.json({...session,utr:undefined,amountPaise:String(session.amountPaise)}):new Response('{}',{status:404});
 });
 async function claim(order,utr,webhookURL,handler,outcome='MANUAL_REVIEW'){
  if(!['MANUAL_REVIEW','SUCCESS','FAILED','EXPIRED'].includes(outcome))return Response.json({error:'Choose a simulated gateway outcome.'},{status:400});
  if(['MANUAL_REVIEW','SUCCESS'].includes(outcome)&&!/^[0-9]{12}$/.test(utr||''))return Response.json({error:'Enter a 12-digit simulated reference.'},{status:400});
  const session=await load(order.reference);
  if(!session||session.paymentId!==order.paymentId)return Response.json({error:'No matching simulated checkout.'},{status:400});
  session.status=outcome;session.utr=utr;await save(session);
  const payload={deliveryId:crypto.randomUUID(),timestamp:Date.now(),event:outcome,paymentId:session.paymentId,orderId:session.orderId,amountPaise:session.amountPaise,currency:'INR',method:'MANUAL_UPI',utr:['MANUAL_REVIEW','SUCCESS'].includes(outcome)?utr:null,settlementState:'NOT_RECONCILED'},raw=JSON.stringify(payload);
  return handler(new Request(webhookURL,{method:'POST',headers:{'Content-Type':'application/json','X-Gateway-Signature':'sha256='+await hmac(secret,raw),'X-Gateway-Delivery-Id':payload.deliveryId,'X-Gateway-Timestamp':String(payload.timestamp)},body:raw}));
 }
 return{provider,claim};
}
