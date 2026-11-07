import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPaymentReviewDatabase } from '../server/payment-review-database.js';
import { createPaymentsHandler } from '../supabase/functions/_shared/payments.js';
import { youpiProvider } from '../supabase/functions/_shared/youpi.js';
import { hmac } from '../supabase/functions/_shared/providers.js';

const endpoint = 'https://bitesbro.invalid/functions/v1/payments/';
async function ok(promise) { const result = await promise; assert.equal(result.error, null, result.error?.message); return result.data; }
async function orderInput(db, method = 'youpi') {
 const date = (await db.query("select ((now() at time zone 'Asia/Kolkata')::date+1)::text as date")).rows[0].date;
 return { requestId: crypto.randomUUID(), name: 'Payment fixture', email: 'guest@fixture.invalid', phone: '9000000000', date, time: '10:00', fulfilment: 'pickup', consent: true, paymentMethod: method, items: [{ id: 'masala-dosa', quantity: 1 }] };
}

test('upgrade from the actual version-seven schema preserves completed orders without inventing historical payment receipts or debts',async()=>{
 const review=await createPaymentReviewDatabase({includePayments:false});
 try{
  const {db,rpc,users}=review,[customer,chef]=users;
  const order=await ok(rpc('place_order',{p:await orderInput(db,'cod')},customer));
  for(const status of ['preparing','ready','collected'])await ok(rpc('transition_order',{p_reference:order.reference,p_status:status},chef));
  await db.exec(await readFile('supabase/migrations/008_youpi_payments.sql','utf8'));
  const saved=(await ok(rpc('get_order_history',{},customer))).orders[0];
  assert.equal(saved.reference,order.reference);assert.equal(saved.status,'collected');assert.equal(saved.total,order.total);assert.deepEqual(saved.items,order.items);
  assert.equal(saved.payment.status,'unrecorded');assert.equal(saved.payment.paidAt,null);assert.equal((await ok(rpc('get_payment_settings'))).onlineEnabled,false);
 }finally{await review.close();}
});

test('version-eight payments preserve guest history, authoritative pricing, staff privacy and idempotent checkout', async () => {
 const review = await createPaymentReviewDatabase();
 try {
  const { db, rpc, users } = review, [customer, chef, admin, guest, other] = users;
  assert.equal((await ok(rpc('get_payment_settings'))).onlineEnabled, false);
  assert.match((await rpc('place_order', { p: await orderInput(db) }, guest)).error.message, /paused/);
  await ok(rpc('set_online_payments', { p_enabled: true }, admin));
  const input = await orderInput(db); input.total = 1; input.items[0].price = 1;
  const order = await ok(rpc('place_order', { p: input }, guest));
  assert.equal(order.total, 12000); assert.equal(order.payment.status, 'pending');
  assert.equal((await ok(rpc('place_order', { p: input }, guest))).reference, order.reference);
  await ok(rpc('set_online_payments',{p_enabled:false},admin));
  assert.equal((await ok(rpc('place_order',{p:input},guest))).reference,order.reference,'A saved checkout retry still resolves after the restaurant pauses new online orders.');
  assert.match((await rpc('place_order',{p:await orderInput(db)},guest)).error.message,/paused/);
  await ok(rpc('set_online_payments',{p_enabled:true},admin));
  assert.equal((await db.query('select count(*)::int as n from public.order_payments')).rows[0].n, 1);
  assert.match((await rpc('place_order', { p: { ...input, paymentMethod: 'cod' } }, guest)).error.message, /different payment method/);
  assert.equal((await ok(rpc('get_operations', {}, chef))).orders.length, 0);
  assert.ok((await rpc('transition_order', { p_reference: order.reference, p_status: 'preparing' }, chef)).error);
  for (const who of [customer, other, chef]) assert.ok((await rpc('get_payment_request', { p_reference: order.reference }, who)).error);
  assert.equal((await ok(rpc('get_order_history', {}, guest))).orders[0].reference, order.reference);
  for (const who of [guest, chef]) {
   assert.ok((await rpc('review_youpi_receipt', { p_reference: order.reference, p_bank_reference: '123456789012', p_received: true }, who)).error);
   assert.equal((await rpc('service_youpi_begin', { p_reference: order.reference, p_user: guest.id, p_attempt: crypto.randomUUID() }, who)).error.code, '42501');
  }
  await ok(rpc('submit_youpi_reference', { p_reference: order.reference, p_bank_reference: '123456789012' }, guest));
  await ok(rpc('review_youpi_receipt', { p_reference: order.reference, p_bank_reference: '123456789012', p_received: true }, admin));
  await ok(rpc('review_youpi_receipt', { p_reference: order.reference, p_bank_reference: '123456789012', p_received: true }, admin));
  const ticket = (await ok(rpc('get_operations', {}, chef))).orders[0];
  assert.equal(ticket.payment.status, 'paid'); assert.equal(ticket.name, undefined); assert.equal(ticket.email, undefined); assert.equal(ticket.payment.bankReference, undefined);
  await ok(rpc('transition_order', { p_reference: order.reference, p_status: 'preparing' }, chef));
  const before = await db.query('select count(*)::int as n from public.orders');
  await db.exec(await readFile('supabase/migrations/008_youpi_payments.sql', 'utf8'));
  assert.equal((await db.query('select count(*)::int as n from public.orders')).rows[0].n, before.rows[0].n);
  assert.equal((await ok(rpc('get_order_history', {}, guest))).orders[0].payment.status, 'paid');
  await assert.rejects(db.exec(await readFile('supabase/setup.sql','utf8')),/forward migrations/i);await db.exec('rollback');
 } finally { await review.close(); }
});

test('receipt review rejects stale claims and reused references; late payments on cancelled orders require a recorded refund', async () => {
 const review = await createPaymentReviewDatabase();
 try {
  const { db, rpc, users } = review, [customer, , admin] = users;
  await ok(rpc('set_online_payments', { p_enabled: true }, admin));
  const first = await ok(rpc('place_order', { p: await orderInput(db) }, customer));
  await ok(rpc('submit_youpi_reference', { p_reference: first.reference, p_bank_reference: '123456789012' }, customer));
  await ok(rpc('submit_youpi_reference', { p_reference: first.reference, p_bank_reference: '123456789013' }, customer));
  assert.match((await rpc('review_youpi_receipt', { p_reference: first.reference, p_bank_reference: '123456789012', p_received: true }, admin)).error.message, /reference changed/);
  await ok(rpc('review_youpi_receipt', { p_reference: first.reference, p_bank_reference: '123456789013', p_received: false, p_note: 'No matching credit in the bank account.' }, admin));
  await ok(rpc('submit_youpi_reference', { p_reference: first.reference, p_bank_reference: '123456789013' }, customer));
  await ok(rpc('transition_order', { p_reference: first.reference, p_status: 'cancelled' }, customer));
  await ok(rpc('submit_youpi_reference', { p_reference: first.reference, p_bank_reference: '123456789013' }, customer));
  await ok(rpc('review_youpi_receipt', { p_reference: first.reference, p_bank_reference: '123456789013', p_received: true }, admin));
  assert.equal((await ok(rpc('get_order_history', {}, customer))).orders[0].payment.status, 'refund_pending');
  await ok(rpc('record_payment_refund', { p_reference: first.reference, p_refund_reference: '987654321098' }, admin));
  const second = await ok(rpc('place_order', { p: await orderInput(db) }, customer));
  await ok(rpc('submit_youpi_reference', { p_reference: second.reference, p_bank_reference: '123456789013' }, customer));
  assert.equal((await rpc('review_youpi_receipt', { p_reference: second.reference, p_bank_reference: '123456789013', p_received: true }, admin)).error.code, '23505');
  assert.equal((await ok(rpc('get_order_history', {}, customer))).orders[0].payment.status, 'submitted');
 } finally { await review.close(); }
});

test('YouPI handler verifies raw signed deliveries, rejects tampering/replay changes, and never trusts a gateway success as bank settlement', async () => {
 const review = await createPaymentReviewDatabase();
 try {
  const { db, rpc, users, service } = review, [customer, chef, admin, , other] = users;
  await ok(rpc('set_online_payments', { p_enabled: true }, admin));
  const order = await ok(rpc('place_order', { p: await orderInput(db) }, customer));
  const env = { SITE_URL: 'https://bitesbro.invalid/', PAYMENTS_MODE: 'live', YOUPI_API_URL: 'https://youpi-api.invalid', YOUPI_CHECKOUT_URL: 'https://youpi.invalid', YOUPI_MERCHANT_ID: 'fixture', YOUPI_MERCHANT_API_KEY: 'server-only-fixture', YOUPI_WEBHOOK_SECRET: 'test-only-webhook-secret' };
  let creates = 0;
  const youpi = youpiProvider(env, async (url, options) => {
   if (options.method === 'POST') { creates++; assert.equal(JSON.parse(options.body).amount, '120.00'); }
   return Response.json({ paymentId: 'youpi_fixture', orderId: order.reference, amountPaise: '12000', currency: 'INR', method: 'MANUAL_UPI', status: 'SUCCESS', checkoutUrl: 'https://youpi.invalid/checkout/youpi_fixture' });
  });
  const userClient = token => ({ auth: { getUser: async () => ({ data: { user: users.find(user => user.id === token) }, error: null }) }, rpc: (name, args) => rpc(name, args, users.find(user => user.id === token)) });
  const handler = createPaymentsHandler({ env, service, userClient, youpi });
  const post = (path, body, user = customer) => handler(new Request(endpoint + path, { method: 'POST', headers: { Authorization: 'Bearer ' + user.id, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  assert.equal((await post('youpi/create', { reference: order.reference }, other)).status, 403);
  assert.equal((await post('youpi/create', { reference: order.reference }, chef)).status, 403);
  assert.equal((await post('youpi/create', { reference: order.reference, amount: 1 })).status, 200);
  assert.equal((await post('youpi/create', { reference: order.reference })).status, 200); assert.equal(creates, 1);
  const event = { deliveryId: crypto.randomUUID(), timestamp: Date.now(), event: 'SUCCESS', paymentId: 'youpi_fixture', orderId: order.reference, amountPaise: 12000, currency: 'INR', method: 'MANUAL_UPI', utr: '123456789012' };
  async function webhook(payload, signature) {
   const raw = JSON.stringify(payload);
   return handler(new Request(endpoint + 'youpi/webhook', { method: 'POST', headers: { 'X-Gateway-Signature': signature || 'sha256=' + await hmac(env.YOUPI_WEBHOOK_SECRET, raw), 'X-Gateway-Timestamp': String(payload.timestamp), 'X-Gateway-Delivery-Id': payload.deliveryId }, body: raw }));
  }
  assert.equal((await webhook(event, 'sha256=' + '0'.repeat(64))).status, 401);
  assert.equal((await webhook({ ...event, amountPaise: 1 })).status, 400);
  assert.equal((await webhook({ ...event, paymentId: 'another_payment' })).status, 400);
  assert.equal((await webhook({ ...event, timestamp: Date.now() - 3 * 3600000 })).status, 401);
  assert.equal((await webhook(event)).status, 200); assert.equal((await webhook(event)).status, 200);
  assert.equal((await webhook({ ...event, utr: '123456789013' })).status, 400);
  const history = await ok(rpc('get_order_history', {}, customer)); assert.equal(history.orders[0].payment.status, 'submitted');
  assert.equal((await ok(rpc('get_operations', {}, chef))).orders.length, 0);
  const polled = await (await post('youpi/status', { reference: order.reference })).json(); assert.equal(polled.status, 'SUCCESS'); assert.equal(polled.paymentVerified, false);
  assert.equal((await db.query('select count(*)::int as n from public.youpi_webhook_events')).rows[0].n, 1);
  const forbidden = await handler(new Request(endpoint + 'capabilities', { headers: { Origin: 'https://untrusted.invalid' } })); assert.equal(forbidden.status, 403);
  const oversized = await handler(new Request(endpoint + 'youpi/create', { method: 'POST', body: 'x'.repeat(32769) })); assert.equal(oversized.status, 413);
  const caps = JSON.stringify(await (await handler(new Request(endpoint + 'capabilities'))).json()); assert.ok(!caps.includes('server-only-fixture'));
 } finally { await review.close(); }
});

test('payment RLS and the three/five-order history windows survive payment-gated completion',async()=>{
 const review=await createPaymentReviewDatabase();
 try{
  const {db,rpc,users}=review,[customer,chef,admin,guest,other]=users;
  await ok(rpc('set_online_payments',{p_enabled:true},admin));
  const pending=await ok(rpc('place_order',{p:await orderInput(db)},guest));
  for(let i=0;i<4;i++){
   const cash=await ok(rpc('place_order',{p:await orderInput(db,'cod')},guest));
   for(const status of ['preparing','ready','collected'])await ok(rpc('transition_order',{p_reference:cash.reference,p_status:status},chef));
  }
  let history=await ok(rpc('get_order_history',{},guest));assert.equal(history.orders.length,3);assert.equal(history.activeOrders[0].reference,pending.reference);
  await ok(rpc('submit_youpi_reference',{p_reference:pending.reference,p_bank_reference:'345678901234'},guest));
  await ok(rpc('review_youpi_receipt',{p_reference:pending.reference,p_bank_reference:'345678901234',p_received:true},admin));
  for(const status of ['preparing','ready','collected'])await ok(rpc('transition_order',{p_reference:pending.reference,p_status:status},chef));
  history=await ok(rpc('get_order_history',{},guest));assert.equal(history.orders.length,3);assert.equal(history.activeOrders.length,0);
  assert.ok((await rpc('get_payment_request',{p_reference:pending.reference},guest)).error);
  await db.transaction(async tx=>{
   await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[guest.id]);
   assert.equal((await tx.query('select count(*)::int as n from public.order_payments')).rows[0].n,3);
  });
  await assert.rejects(db.transaction(async tx=>{
   await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[other.id]);
   await tx.exec("update public.order_payments set status='paid'");
  }),/permission denied/);
  const refund=await ok(rpc('place_order',{p:await orderInput(db)},guest));
  await ok(rpc('submit_youpi_reference',{p_reference:refund.reference,p_bank_reference:'345678901235'},guest));
  await ok(rpc('review_youpi_receipt',{p_reference:refund.reference,p_bank_reference:'345678901235',p_received:true},admin));
  await ok(rpc('transition_order',{p_reference:refund.reference,p_status:'cancelled'},guest));
  for(let i=0;i<4;i++){
   const cash=await ok(rpc('place_order',{p:await orderInput(db,'cod')},guest));
   for(const status of ['preparing','ready','collected'])await ok(rpc('transition_order',{p_reference:cash.reference,p_status:status},chef));
  }
  assert.equal((await ok(rpc('get_order_history',{},guest))).activeOrders[0].reference,refund.reference,'An unfinished refund remains trackable outside the three recent orders.');
  await ok(rpc('record_payment_refund',{p_reference:refund.reference,p_refund_reference:'987654321099'},admin));
  assert.equal((await ok(rpc('get_order_history',{},guest))).activeOrders.length,0);
  for(let i=0;i<6;i++)await ok(rpc('place_order',{p:await orderInput(db,'cod')},customer));
  assert.equal((await ok(rpc('get_order_history',{},customer))).orders.length,5);
  assert.equal((await ok(rpc('get_order_history',{p_page:1},customer))).orders.length,1);
  assert.equal((await ok(rpc('get_operations',{},admin))).orders.length,16);
 }finally{await review.close();}
});
