import{razorpayProvider,resendProvider,ProviderError,equalSignature}from'./providers.js';
import{porterProvider}from'./courier.js';
import{youpiProvider}from'./youpi.js';

// Dependencies are injected so tests exercise the real handler without Cloud writes.
export function createOrderServices({env,service,userClient,payments=razorpayProvider(env),email=resendProvider(env),courier=porterProvider(env),youpi=youpiProvider(env)}){
 const origins=new Set((env.ALLOWED_ORIGINS||new URL(env.SITE_URL).origin).split(',').map(x=>x.trim()));
 async function call(name,params={}){const{data,error}=await service.rpc(name,params);if(error){const failure=new Error(error.code==='42501'?'Access denied.':error.code?.startsWith('22')?error.message:'The order service could not complete this request.');failure.status=error.code==='42501'?403:error.code?.startsWith('22')?400:503;throw failure;}return data;}
 async function account(request,allowed){
  const authorization=request.headers.get('authorization');if(!authorization?.startsWith('Bearer '))throw new ProviderError('Sign in to continue.',401);
  const client=userClient(authorization.slice(7));const{data,error}=await client.auth.getUser(authorization.slice(7));
  if(error||!data.user)throw new ProviderError('Your session has expired.',401);
  const role=await client.rpc('my_role');if(role.error||!allowed.includes(role.data))throw new ProviderError('This account cannot perform that action.',403);
  return{user:data.user,role:role.data};
 }
 async function processJobs(){
  let submitted=0,refunds=0;
  if(payments.enabled)for(let index=0;index<5;index++){
   const lease=crypto.randomUUID(),job=await call('service_refund_claim',{p_lease:lease});if(!job)break;
   try{const result=await payments.refund(job);await call('service_refund_result',{p_order:job.orderId,p_lease:lease,p_refund:result.id,p_status:result.confirmed?'refunded':'refund_review'});refunds++;}
   catch{await call('service_refund_result',{p_order:job.orderId,p_lease:lease,p_refund:null,p_status:'refund_review'});}
  }
  if(email.enabled)for(let index=0;index<10;index++){
   const lease=crypto.randomUUID(),job=await call('service_email_claim',{p_lease:lease});if(!job)break;
   try{const id=await email.send(job);await call('service_email_result',{p_id:job.id,p_lease:lease,p_sent:true,p_provider:id});submitted++;}
   catch{await call('service_email_result',{p_id:job.id,p_lease:lease,p_sent:false,p_provider:null});}
  }
  return{submitted,refunds,emailConfigured:email.enabled,paymentConfigured:payments.enabled};
 }
 return async function handle(request){
  const origin=request.headers.get('origin');const cors={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(origin&&origins.has(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})};
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:cors});
  try{
   const path=new URL(request.url).pathname.replace(/^.*\/order-services\/?/,'/');
   if(origin&&!origins.has(origin))throw new ProviderError('This website origin is not allowed.',403);
   if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
   if(request.method==='GET'&&path==='/capabilities'){
    const settings=await call('get_order_service_settings');return json({payments:{enabled:payments.enabled&&settings.onlineEnabled,mode:payments.testMode?'test':'live',keyId:payments.keyId},youpi:{enabled:youpi.enabled&&settings.schemaVersion>=5},directUPI:{enabled:Boolean(settings.upiId&&settings.payeeName),upiId:settings.upiId,payeeName:settings.payeeName},email:{configured:email.enabled},delivery:{provider:courier.name,enabled:courier.enabled,testMode:courier.testMode},schemaVersion:settings.schemaVersion});
   }
   if(request.method!=='POST')throw new ProviderError('Endpoint not found.',404);
   const raw=await request.text();if(new TextEncoder().encode(raw).length>262144)throw new ProviderError('Request too large.',413);
   if(path==='/youpi/webhook'){
    const event=await youpi.webhook(raw,request.headers);
    // Cash/counter and ordinary UPI outcomes do not belong to MANUAL_UPI.
    if(event.method==='MANUAL_UPI'){
     if(!Number.isSafeInteger(event.amountPaise))throw new ProviderError('Invalid YouPI amount.',400);
     await call('service_youpi_claim',{p_delivery:event.deliveryId,p_reference:event.orderId,p_payment:event.paymentId,p_amount:event.amountPaise,p_currency:event.currency,p_status:event.event,p_utr:event.utr||''});
    }
    return json({received:true});
   }
   if(path==='/payments/webhook'){
    if(!await payments.verifyWebhook(raw,request.headers.get('x-razorpay-signature')))throw new ProviderError('Webhook signature is invalid.',401);
    let event;try{event=JSON.parse(raw);}catch{throw new ProviderError('Invalid webhook JSON.',400);}
    if(event.event==='payment.captured'){
     const entity=event.payload?.payment?.entity;
     if(!entity?.id||!entity.order_id)throw new ProviderError('Webhook payload is incomplete.',400);
     // Independently fetch the current capture; a browser success callback is insufficient.
     const payment=await payments.payment(entity.id);
     if(payment.status!=='captured'||payment.order_id!==entity.order_id)throw new ProviderError('Payment capture is not confirmed.',409);
     await call('service_capture_payment',{p_event:'capture:'+payment.id,p_provider_order:payment.order_id,p_payment:payment.id,p_amount:payment.amount,p_currency:payment.currency});
    }
    return json({received:true});
   }
   let body;try{body=JSON.parse(raw||'{}');}catch{throw new ProviderError('Send a JSON request.',400);}
   if(!body||typeof body!=='object'||Array.isArray(body))throw new ProviderError('Send a JSON object.',400);
   if(path==='/youpi/create'||path==='/youpi/status'){
    const who=await account(request,['customer']);
    if(!youpi.enabled)throw new ProviderError('YouPI checkout is not configured.',503);
    if(typeof body.reference!=='string'||body.reference.length>80)throw new ProviderError('Choose a saved order.',400);
    if(path==='/youpi/status'){
     const order=await call('service_youpi_context',{p_reference:body.reference,p_user:who.user.id});
     // A status poll is informative; it is never evidence of bank settlement.
     return json({...await youpi.status(order),bankVerificationRequired:true});
    }
    const attempt=crypto.randomUUID(),order=await call('service_youpi_begin',{p_reference:body.reference,p_user:who.user.id,p_attempt:attempt});
    if(order.paymentId)return json({...order,bankVerificationRequired:true});
    const checkout=await youpi.create(order);
    await call('service_youpi_created',{p_reference:body.reference,p_attempt:attempt,p_payment:checkout.paymentId,p_checkout:checkout.checkoutUrl});
    return json({...checkout,reference:order.reference,amount:order.amount,bankVerificationRequired:true});
   }
   if(path==='/jobs/run'){
    const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'');
    if(!env.ORDER_JOB_SECRET||!equalSignature(supplied,env.ORDER_JOB_SECRET))throw new ProviderError('Worker access denied.',401);
    return json(await processJobs());
   }
   if(path==='/notifications/process'){await account(request,['admin']);return json(await processJobs());}
   if(path.startsWith('/deliveries/')){
    await account(request,['admin']);if(!courier.enabled)throw new ProviderError('Courier credentials and pickup details are not configured.',503);
    if(path==='/deliveries/quote'){
     const order=await call('service_delivery_context',{p_reference:body.reference});
     if(!Number.isFinite(order.lat)||!Number.isFinite(order.lng))throw new ProviderError('Save a delivery map pin before requesting a quote.',400);
     const quote=await courier.quote(order);
     if(quote.amount>Number(env.MAX_COURIER_FARE_PAISE||20000))throw new ProviderError('The courier quote exceeds the restaurant delivery budget.',409);
     return json(await call('service_delivery_quote',{p_reference:body.reference,p_amount:quote.amount,p_currency:quote.currency,p_vehicle:quote.vehicle,p_lat:order.lat,p_lng:order.lng}));
    }
    if(path==='/deliveries/book'){
     const plan=await call('service_delivery_plan',{p_quote:body.quoteId});
     const scheduled=Date.parse(plan.date+'T'+plan.time+':00+05:30');
     if(!courier.testMode&&scheduled>Date.now()+90*60000)throw new ProviderError('Book the courier within 90 minutes of the scheduled pickup.',400);
     const current=await courier.quote(plan);if(current.amount>plan.amount)throw new ProviderError('The courier fare increased. Request a fresh quote before booking.',409);
     const requestId=crypto.randomUUID(),order=await call('service_delivery_begin',{p_quote:body.quoteId,p_request:requestId});
     if(order.existing)return json({providerId:order.providerId,existing:true});
     try{
      const result=await courier.book(order);await call('service_delivery_booked',{p_request:requestId,p_provider:result.id});await call('service_delivery_status',{p_reference:order.reference,p_status:'booked'});return json({providerId:result.id});
     }catch(error){await call('service_delivery_failed',{p_request:requestId});throw error;}
    }
    if(path==='/deliveries/refresh'){
     const order=await call('service_delivery_context',{p_reference:body.reference});if(!order.providerId)throw new ProviderError('No confirmed courier booking is available.',400);
     const result=await courier.track(order.providerId);await call('service_delivery_status',{p_reference:body.reference,p_status:result.status});return json(result);
    }
    throw new ProviderError('Courier endpoint not found.',404);
   }
   if(!['/payments/create','/payments/verify'].includes(path))throw new ProviderError('Endpoint not found.',404);
   const who=await account(request,['customer']);
   if(!payments.enabled)throw new ProviderError('Online payments are not configured.',503);
   if(typeof body.reference!=='string'||body.reference.length>80)throw new ProviderError('Choose a saved order.',400);
   if(path==='/payments/create'){
    const attempt=crypto.randomUUID(),order=await call('service_payment_begin',{p_reference:body.reference,p_user:who.user.id,p_attempt:attempt});
    if(order.providerOrderId)return json({...order,keyId:payments.keyId,testMode:payments.testMode});
    const result=await payments.createOrder(order);
    if(!result.id||result.amount!==order.amount||result.currency!=='INR')throw new ProviderError('Payment setup needs review.');
    await call('service_payment_created',{p_reference:body.reference,p_attempt:attempt,p_provider_order:result.id});
    return json({reference:body.reference,providerOrderId:result.id,amount:order.amount,currency:'INR',keyId:payments.keyId,testMode:payments.testMode});
   }
   const context=await call('service_order_context',{p_reference:body.reference,p_user:who.user.id});
   if(context.providerOrderId!==body.providerOrderId)throw new ProviderError('Payment order does not match.',400);
   if(!await payments.verifyCheckout(body))throw new ProviderError('Payment signature is invalid.',400);
   const payment=await payments.payment(body.paymentId);
   if(payment.status!=='captured'||payment.order_id!==context.providerOrderId)throw new ProviderError('Payment capture is pending. Check My orders before retrying.',409);
   await call('service_capture_payment',{p_event:'capture:'+payment.id,p_provider_order:payment.order_id,p_payment:payment.id,p_amount:payment.amount,p_currency:payment.currency});
   return json({verified:true});
  }catch(error){return json({error:error.status?error.message:'The order service is temporarily unavailable.'},error.status||503);}
 };
}
