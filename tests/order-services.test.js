import{test}from'node:test';
import assert from'node:assert/strict';
import{startReviewDemo,REVIEW_PASSWORD}from'../server/review-demo.js';
import{hmac,equalSignature,orderEmail,razorpayProvider,resendProvider}from'../supabase/functions/_shared/providers.js';
import{createReviewDatabase}from'../server/review-database.js';
import{porterProvider}from'../supabase/functions/_shared/courier.js';

test('provider adapters verify signatures, use authoritative paise and protect credentials',async()=>{
 const requests=[];
 const provider=razorpayProvider({RAZORPAY_KEY_ID:'rzp_test_fixture',RAZORPAY_KEY_SECRET:'fixture-secret',RAZORPAY_WEBHOOK_SECRET:'fixture-webhook'},async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify({id:'order_test',amount:12300,currency:'INR'}),{status:200});});
 await provider.createOrder({reference:'BB-ORDER-TEST',amount:12300});
 assert.equal(JSON.parse(requests[0].options.body).amount,12300);
 assert.equal(await provider.verifyCheckout({providerOrderId:'order_test',paymentId:'pay_test',signature:await hmac('fixture-secret','order_test|pay_test')}),true);
 assert.equal(await provider.verifyCheckout({providerOrderId:'order_other',paymentId:'pay_test',signature:await hmac('fixture-secret','order_test|pay_test')}),false);
 assert.equal(await provider.verifyWebhook('{"event":"payment.captured"}',await hmac('fixture-webhook','{"event":"payment.captured"}')),true);
 assert.equal(await provider.verifyWebhook('changed',await hmac('fixture-webhook','original')),false);
 assert.equal(equalSignature(null,'abc'),false);
 assert.throws(()=>razorpayProvider({RAZORPAY_KEY_ID:'rzp_live_fixture',RAZORPAY_KEY_SECRET:'fixture-secret'}),/do not match/);
 const message={id:'email-test',to:'customer@example.invalid',kind:'received',order:{reference:'BB-ORDER-TEST',name:'<script>fixture</script>',date:'2030-01-01',time:'10:00',total:12300,items:[{name:'Dosa & chutney',quantity:1,unitPrice:12300}]}};
 const content=orderEmail(message,'https://example.invalid/Cafe_Website/');assert.ok(content.html.includes('&lt;script&gt;'));assert.ok(!content.html.includes('<script>'));assert.ok(content.text.includes('/Cafe_Website/orders/'));
 const mail=resendProvider({RESEND_API_KEY:'fixture-email-secret',ORDER_EMAIL_FROM:'BitesBro <orders@example.invalid>',SITE_URL:'https://example.invalid/'},async(url,options)=>{requests.push({url,options});return new Response('{"id":"email_provider_test"}');});
 assert.equal(await mail.send(message),'email_provider_test');assert.equal(requests.at(-1).options.headers['Idempotency-Key'],'bitesbro-email-test');
});

test('direct UPI needs administrator bank verification and cannot reuse a confirmed receipt',async()=>{
 const database=await createReviewDatabase();
 try{
  const customer=database.users.find(user=>user.role==='customer'),chef=database.users.find(user=>user.role==='chef'),admin=database.users.find(user=>user.role==='admin');
  const rpc=(name,args={},who=customer)=>database.rpc(name,args,who);
  const cafe=(await rpc('get_cafe')).data,date=new Date(cafe.today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);
  const input={requestId:crypto.randomUUID(),name:'UPI fixture',phone:'9000000000',date:date.toISOString().slice(0,10),time:'10:00',consent:true,paymentMethod:'upi',items:[{id:'masala-dosa',quantity:1}]};
  const placed=await rpc('place_order',{p:input});assert.equal(placed.error,null);const reference=placed.data.reference;
  assert.equal((await rpc('get_operations',{},chef)).data.orders.length,0);
  const intent=await rpc('get_payment_request',{p_reference:reference});assert.equal(intent.data.amount,12000);assert.equal(intent.data.upiId,'review-only@invalid');
  assert.equal((await rpc('submit_upi_reference',{p_reference:reference,p_bank_reference:'123'})).error.code,'22023');
  assert.equal((await rpc('submit_upi_reference',{p_reference:reference,p_bank_reference:'123456789012'})).error,null);
  assert.equal((await rpc('get_operations',{},chef)).data.orders.length,0,'A submitted UTR is not payment proof.');
  assert.equal((await rpc('confirm_upi_receipt',{p_reference:reference,p_confirm:true})).error.code,'42501');
  assert.equal((await rpc('confirm_upi_receipt',{p_reference:reference,p_confirm:true},chef)).error.code,'42501');
  assert.equal((await rpc('confirm_upi_receipt',{p_reference:reference,p_confirm:true},admin)).error,null);
  assert.equal((await rpc('get_operations',{},chef)).data.orders.length,1);
  const second=await rpc('place_order',{p:{...input,requestId:crypto.randomUUID()}}),other=second.data.reference;
  await rpc('submit_upi_reference',{p_reference:other,p_bank_reference:'123456789012'});
  assert.equal((await rpc('confirm_upi_receipt',{p_reference:other,p_confirm:true},admin)).error.code,'23505','A receipt cannot pay two orders.');
  await rpc('transition_order',{p_reference:reference,p_status:'cancelled'});
  assert.equal((await rpc('get_operations')).data.orders.find(order=>order.reference===reference).payment.status,'refund_pending');
  assert.equal((await database.service.rpc('service_refund_claim',{p_lease:crypto.randomUUID()})).data,null,'A UPI bank refund cannot be sent to Razorpay.');
  assert.equal((await rpc('confirm_upi_refund',{p_reference:reference,p_bank_reference:'999999999999'},admin)).error,null);
  assert.equal((await rpc('get_operations')).data.orders.find(order=>order.reference===reference).payment.status,'refunded');
 }finally{await database.close();}
});

test('courier adapter chooses a two-wheeler fare and keeps provider authentication server-side',async()=>{
 const calls=[];const provider=porterProvider({PORTER_API_KEY:'fixture-courier-secret',COURIER_PICKUP_PHONE:'9000000000',COURIER_PICKUP_ADDRESS:'Isolated pickup address',COURIER_PICKUP_POSTCODE:'560001',COURIER_PICKUP_LAT:'12.9716',COURIER_PICKUP_LNG:'77.5946'},async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({vehicles:[{type:'Mini Truck',fare:{currency:'INR',minor_amount:1000}},{type:'2 Wheeler',fare:{currency:'INR',minor_amount:4500}}]}));});
 const result=await provider.quote({name:'Fixture',phone:'9000000001',lat:12.98,lng:77.6});
 assert.equal(result.amount,4500);assert.equal(result.vehicle,'2 Wheeler');assert.equal(provider.testMode,true);
 assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.headers['x-api-key'],'fixture-courier-secret');
 assert.equal(calls[0].url,'https://pfe-apigw-uat.porter.in/v1/get_quote');
});

test('courier quotes expire and pin changes, rider collisions and uncertain bookings cannot duplicate dispatch',async()=>{
 const database=await createReviewDatabase();
 try{
  const customer=database.users.find(u=>u.role==='customer'),admin=database.users.find(u=>u.role==='admin'),chef=database.users.find(u=>u.role==='chef');
  const rpc=(name,args={},who=customer)=>database.rpc(name,args,who),service=(name,args)=>database.service.rpc(name,args);
  const cafe=(await rpc('get_cafe')).data,date=new Date(cafe.today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);
  const input={name:'Courier fixture',phone:'9000000000',date:date.toISOString().slice(0,10),time:'10:00',consent:true,fulfilment:'delivery',address:'Isolated review address',postcode:'560001',items:[{id:'masala-dosa',quantity:1}]};
  const place=async()=>{const result=await rpc('place_order',{p:{...input,requestId:crypto.randomUUID()}});assert.equal(result.error,null);return result.data.reference;};
  const pin=reference=>rpc('set_delivery_location',{p_reference:reference,p_lat:12.98,p_lng:77.6},admin);
  const quote=reference=>service('service_delivery_quote',{p_reference:reference,p_amount:4500,p_currency:'INR',p_vehicle:'2 Wheeler',p_lat:12.98,p_lng:77.6});
  const begin=quoteId=>service('service_delivery_begin',{p_quote:quoteId,p_request:crypto.randomUUID()});
  const ready=async reference=>{for(const status of['preparing','ready'])assert.equal((await rpc('transition_order',{p_reference:reference,p_status:status},chef)).error,null);};
  const reference=await place();assert.equal((await rpc('set_delivery_location',{p_reference:reference,p_lat:12.98,p_lng:77.6})).error.code,'42501');await pin(reference);
  let q=(await quote(reference)).data;assert.ok((await begin(q.quoteId)).error,'Cannot book before ready.');await ready(reference);
  await database.db.query("update public.courier_quotes set expires_at=now()-interval '1 second' where id=$1",[q.quoteId]);assert.match((await begin(q.quoteId)).error.message,/expired/);
  q=(await quote(reference)).data;await pin(reference);assert.ok((await begin(q.quoteId)).error,'A pin save invalidates old quotes.');
  q=(await quote(reference)).data;const first=await begin(q.quoteId);assert.equal(first.error,null);
  await service('service_delivery_booked',{p_request:first.data.requestId,p_provider:'fixture_courier'});await service('service_delivery_status',{p_reference:reference,p_status:'booked'});
  assert.equal((await begin(q.quoteId)).data.existing,true);assert.equal((await pin(reference)).error.code,'22023');
  assert.equal((await rpc('dispatch_delivery',{p_reference:reference,p_status:'assigned',p_rider_name:'Other Rider',p_rider_phone:'9000000001'},admin)).error.code,'22023');
  assert.equal((await rpc('service_delivery_status',{p_reference:reference,p_status:'delivered'},chef)).error.code,'42501');
  for(const status of['out_for_delivery','delivered','delivered','booked'])assert.equal((await service('service_delivery_status',{p_reference:reference,p_status:status})).error,null);
  const delivered=(await rpc('get_operations')).data.orders.find(o=>o.reference===reference);assert.equal(delivered.delivery.status,'delivered');assert.equal(delivered.courier.status,'delivered');
  const second=await place();await ready(second);await pin(second);q=(await quote(second)).data;const uncertain=await begin(q.quoteId);await service('service_delivery_failed',{p_request:uncertain.data.requestId});assert.match((await begin(q.quoteId)).error.message,/review/);
  const third=await place();await ready(third);await pin(third);q=(await quote(third)).data;await rpc('dispatch_delivery',{p_reference:third,p_status:'assigned',p_rider_name:'Manual Rider',p_rider_phone:'9000000001'},admin);assert.match((await begin(q.quoteId)).error.message,/already assigned/);
 }finally{await database.close();}
});

test('running review backend completes authenticated payment, kitchen, dispatch and email workflow against PostgreSQL',async t=>{
 const demo=await startReviewDemo({port:0});t.after(()=>demo.close());
 const base=demo.base,api=base+'/sandbox-supabase';
 const request=async(path,{token,body,method=body?'POST':'GET'}={})=>{const response=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,data:await response.json()};};
 const login=async role=>(await request('/sandbox-supabase/auth/v1/token?grant_type=password',{body:{email:`demo.${role}@bitesbro.invalid`,password:REVIEW_PASSWORD}})).data.access_token;
 const customer=await login('customer'),chef=await login('chef'),admin=await login('admin');
 const rpc=async(name,p,token=customer)=>request('/sandbox-supabase/rest/v1/rpc/'+name,{token,body:p});
 const services=(path,body,token=customer)=>request('/sandbox-supabase/functions/v1/order-services/'+path,{token,body});
 const cafe=(await rpc('get_cafe',{})).data,date=new Date(cafe.today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);
 const input={requestId:crypto.randomUUID(),name:'Review Customer',email:'fake-override@example.invalid',phone:'9000000000',date:date.toISOString().slice(0,10),time:'10:00',fulfilment:'delivery',address:'Isolated review fixture address',postcode:'560001',consent:true,paymentMethod:'razorpay',total:1,role:'admin',items:[{id:'masala-dosa',quantity:1,variant:'ghee-roast',spice:'mild',addons:['extra-sambar']}]};
 const placed=await rpc('place_order',{p:input});assert.equal(placed.status,200,JSON.stringify(placed.data));assert.equal(placed.data.total,20000);assert.equal(placed.data.email,'demo.customer@bitesbro.invalid');const reference=placed.data.reference;
 assert.equal((await rpc('get_operations',{},chef)).data.orders.length,0,'An unpaid ticket cannot reach chefs.');
 assert.equal((await rpc('service_capture_payment',{p_event:'forged',p_provider_order:'forged',p_payment:'forged',p_amount:1,p_currency:'INR'})).status,403);
 assert.equal((await services('payments/create',{reference},null)).status,401);
 assert.equal((await services('payments/create',{reference},chef)).status,403);
 const checkout=await services('payments/create',{reference,amount:1});assert.equal(checkout.status,200);assert.equal(checkout.data.amount,20000);
 assert.equal((await services('payments/verify',{reference,providerOrderId:checkout.data.providerOrderId,paymentId:'pay_forged',signature:'fake'})).status,400);
 const complete=await request('/review/payments/complete',{token:customer,body:{reference,providerOrderId:checkout.data.providerOrderId}});assert.equal(complete.status,200);
 const verified=await services('payments/verify',{reference,...complete.data});assert.equal(verified.status,200,JSON.stringify(verified.data));
 assert.equal((await services('payments/verify',{reference,...complete.data})).status,200,'A verified callback retry is idempotent.');
 const tickets=(await rpc('get_operations',{},chef)).data.orders;assert.equal(tickets.length,1);for(const field of ['name','email','phone','address','postcode'])assert.equal(field in tickets[0],false);
 assert.equal((await rpc('dispatch_delivery',{p_reference:reference,p_status:'assigned',p_rider_name:'Demo Rider',p_rider_phone:'9000000001'},chef)).status,403);
 assert.equal((await rpc('dispatch_delivery',{p_reference:reference,p_status:'assigned',p_rider_name:'Demo Rider',p_rider_phone:'9000000001'},admin)).status,200);
 assert.equal((await rpc('dispatch_delivery',{p_reference:reference,p_status:'out_for_delivery'},admin)).status,400,'Cannot dispatch before ready.');
 for(const status of ['preparing','ready'])assert.equal((await rpc('transition_order',{p_reference:reference,p_status:status},chef)).status,200);
 assert.equal((await rpc('transition_order',{p_reference:reference,p_status:'collected'},chef)).status,400);
 assert.equal((await rpc('dispatch_delivery',{p_reference:reference,p_status:'out_for_delivery'},admin)).status,200);
 assert.equal((await rpc('dispatch_delivery',{p_reference:reference,p_status:'delivered'},admin)).status,200);
 const tracked=(await rpc('get_operations',{})).data.orders[0];assert.equal(tracked.delivery.status,'delivered');assert.equal(tracked.payment.status,'paid');
 assert.equal((await services('notifications/process',{},customer)).status,403);
 const processed=await services('notifications/process',{},admin);assert.equal(processed.status,200);assert.equal(processed.data.submitted,3);
 assert.equal(demo.emails.length,3);assert.equal((await services('notifications/process',{},admin)).data.submitted,0);assert.equal(demo.emails.length,3,'No duplicate submitted emails.');
 assert.equal((await request('/review/emails',{token:customer})).status,403);
 const oldName=(await demo.database.db.query('select name from public.menu_items where id=$1',['masala-dosa'])).rows[0].name;
 await demo.database.db.query('update public.menu_items set name=$1,price=99999 where id=$2',['Changed after order','masala-dosa']);
 assert.equal((await rpc('get_operations',{})).data.orders[0].items[0].name,oldName,'Order snapshots remain immutable.');
 const once=(await rpc('place_order',{p:input})).data;assert.equal(once.reference,reference,'Order retry remains idempotent after payment.');
});
