import{test}from'node:test';
import assert from'node:assert/strict';
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
