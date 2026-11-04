import{test}from'node:test';
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{createReviewDatabase}from'../server/review-database.js';
import{createOrderServices}from'../supabase/functions/_shared/order-services.js';
import{youpiProvider}from'../supabase/functions/_shared/youpi.js';
import{hmac}from'../supabase/functions/_shared/providers.js';

test('YouPI REST contract keeps keys server-side, validates checkout origin and authenticates webhook retries',async()=>{
 const env={SITE_URL:'https://store.example.invalid/Cafe_Website/',YOUPI_API_URL:'https://api.example.invalid',YOUPI_CHECKOUT_URL:'https://pay.example.invalid',YOUPI_MERCHANT_ID:'fixture-merchant',YOUPI_MERCHANT_API_KEY:'fixture-api-key',YOUPI_WEBHOOK_SECRET:'fixture-webhook-secret'};
 const calls=[],order={reference:'BB-TEST',amount:20000};let checkoutURL='https://pay.example.invalid/checkout/fixture_payment',amount='20000';
 const provider=youpiProvider(env,async(url,options)=>{calls.push({url,options});return Response.json({paymentId:'fixture_payment',orderId:order.reference,amountPaise:amount,currency:'INR',checkoutUrl:checkoutURL});});
 await provider.create(order);const request=calls[0],body=JSON.parse(request.options.body);
 assert.equal(request.url,'https://api.example.invalid/api/v1/payments');assert.equal(body.method,'MANUAL_UPI');assert.equal(body.amount,'200.00');assert.equal(body.returnUrl,'https://store.example.invalid/Cafe_Website/orders/?order=BB-TEST');
 assert.equal(request.options.headers['X-Merchant-Key'],env.YOUPI_MERCHANT_API_KEY);assert.equal(request.options.headers['Idempotency-Key'],'bitesbro-BB-TEST');assert.equal(request.options.redirect,'error');
 assert.ok(!JSON.stringify(body).includes('fixture-api-key'));checkoutURL='https://attacker.invalid/checkout/fixture_payment';await assert.rejects(provider.create(order),/not trusted/);
 checkoutURL='javascript:alert(1)';await assert.rejects(provider.create(order),/not trusted/);checkoutURL='https://pay.example.invalid/checkout/fixture_payment';amount='1';await assert.rejects(provider.create(order),/does not match/);
 const event={deliveryId:crypto.randomUUID(),timestamp:Date.now()-3600000,event:'MANUAL_REVIEW'};
 const raw=JSON.stringify(event),headers=new Headers({'X-Gateway-Signature':'sha256='+await hmac(env.YOUPI_WEBHOOK_SECRET,raw),'X-Gateway-Delivery-Id':event.deliveryId,'X-Gateway-Timestamp':String(event.timestamp)});
 assert.equal((await provider.webhook(raw,headers)).deliveryId,event.deliveryId,'An hour-old retry uses the original signed timestamp.');
 await assert.rejects(provider.webhook(raw+' ',headers),/signature/);headers.set('X-Gateway-Timestamp',String(Date.now()));await assert.rejects(provider.webhook(raw,headers),/metadata/);
 assert.equal(youpiProvider({}).enabled,false);assert.throws(()=>youpiProvider({...env,YOUPI_API_URL:'http://api.example.invalid'}),/HTTPS/);
});

test('signed YouPI outcomes remain pending until administrator bank approval; amount, replay, owner and chef boundaries hold',async()=>{
 const database=await createReviewDatabase();
 try{
  const customer=database.users.find(u=>u.role==='customer'),admin=database.users.find(u=>u.role==='admin'),chef=database.users.find(u=>u.role==='chef');
  const rpc=(name,args={},who=customer)=>database.rpc(name,args,who);
  const cafe=(await rpc('get_cafe')).data,date=new Date(cafe.today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);
  const order=(await rpc('place_order',{p:{requestId:crypto.randomUUID(),name:'YouPI fixture',phone:'9000000000',date:date.toISOString().slice(0,10),time:'10:00',consent:true,paymentMethod:'upi',items:[{id:'masala-dosa',quantity:1}]}})).data;
  let creates=0;const secret='isolated-youpi-webhook',paymentId=crypto.randomUUID(),env={SITE_URL:'https://store.example.invalid/',YOUPI_API_URL:'https://api.example.invalid',YOUPI_CHECKOUT_URL:'https://checkout.example.invalid',YOUPI_MERCHANT_ID:'fixture',YOUPI_MERCHANT_API_KEY:'fixture-api',YOUPI_WEBHOOK_SECRET:secret};
  const youpi=youpiProvider(env,async()=>{creates++;return Response.json({paymentId,orderId:order.reference,amountPaise:String(order.total),currency:'INR',method:'MANUAL_UPI',checkoutUrl:'https://checkout.example.invalid/checkout/'+paymentId,status:'INITIATED'});});
  const handler=createOrderServices({env,service:database.service,userClient:token=>({auth:{getUser:async()=>({data:{user:database.users.find(u=>u.id===token)},error:null})},rpc:(name,args)=>rpc(name,args,database.users.find(u=>u.id===token))}),youpi});
  const call=async(path,body,who=customer)=>{const response=await handler(new Request(env.SITE_URL+'functions/v1/order-services/'+path,{method:'POST',headers:{...(who?{Authorization:'Bearer '+who.id}:{}),'Content-Type':'application/json'},body:JSON.stringify(body)}));return{status:response.status,data:await response.json()};};
  assert.equal((await call('youpi/create',{reference:order.reference},null)).status,401);assert.equal((await call('youpi/create',{reference:order.reference},chef)).status,403);
  const opened=await call('youpi/create',{reference:order.reference,amount:1});assert.equal(opened.status,200,JSON.stringify(opened.data));assert.equal(opened.data.amount,12000);assert.ok(!JSON.stringify(opened.data).includes('fixture-api'));
  assert.equal((await call('youpi/create',{reference:order.reference})).status,200);assert.equal(creates,1,'Checkout initialization is idempotent.');
  assert.equal((await rpc('service_youpi_context',{p_reference:order.reference,p_user:customer.id})).error.code,'42501');
  assert.equal((await database.service.rpc('service_youpi_context',{p_reference:order.reference,p_user:chef.id})).error.code,'22023');
  const event={event:'MANUAL_REVIEW',method:'MANUAL_UPI',deliveryId:crypto.randomUUID(),timestamp:Date.now(),orderId:order.reference,paymentId,amountPaise:order.total,currency:'INR',utr:'123456789012',settlementState:'NOT_RECONCILED'};
  const webhook=async(value,valid=true)=>{const raw=JSON.stringify(value);return handler(new Request(env.SITE_URL+'functions/v1/order-services/youpi/webhook',{method:'POST',headers:{'X-Gateway-Signature':valid?'sha256='+await hmac(secret,raw):'sha256=forged','X-Gateway-Timestamp':String(value.timestamp),'X-Gateway-Delivery-Id':value.deliveryId},body:raw}));};
  assert.equal((await webhook(event,false)).status,401);assert.equal((await webhook({...event,amountPaise:1})).status,400);assert.equal((await webhook({...event,paymentId:crypto.randomUUID()})).status,400);
  assert.equal((await webhook(event)).status,200);assert.equal((await webhook(event)).status,200);
  assert.equal((await database.db.query('select count(*)::int as n from public.youpi_webhook_events')).rows[0].n,1);
  assert.equal((await rpc('get_operations',{},chef)).data.orders.length,0,'A signed UTR claim does not release food.');
  assert.equal((await rpc('get_operations')).data.orders[0].payment.status,'submitted');
  assert.equal((await webhook({...event,deliveryId:crypto.randomUUID(),event:'RECONCILED',settlementState:'RECONCILED'})).status,200);
  assert.equal((await rpc('get_operations')).data.orders[0].payment.status,'submitted','Even RECONCILED is not bank approval in the manual flow.');
  assert.equal((await rpc('confirm_upi_receipt',{p_reference:order.reference,p_confirm:true})).error.code,'42501');
  assert.equal((await rpc('confirm_upi_receipt',{p_reference:order.reference,p_confirm:true},admin)).error,null);
  const ticket=(await rpc('get_operations',{},chef)).data.orders[0];assert.equal(ticket.payment.status,'paid');assert.equal('youpi'in ticket,false,'Chefs do not receive gateway identifiers or references.');
  const preserved=(await database.db.query('select count(*)::int as n from public.orders')).rows[0].n;
  for(const file of['004_courier_dispatch.sql','005_youpi_checkout.sql'])await database.db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  assert.equal((await database.db.query('select count(*)::int as n from public.orders')).rows[0].n,preserved,'Forward migrations can be rerun without dropping orders.');
  await assert.rejects(database.db.exec(await readFile('supabase/setup.sql','utf8')),/forward migrations/i,'An older baseline cannot remove payment gates.');
 }finally{await database.close();}
});
