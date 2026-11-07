import { ProviderError } from './providers.js';

async function limitedBody(request) {
 if (Number(request.headers.get('content-length')) > 32768) throw new ProviderError('The payment request is too large.', 413);
 const reader = request.body?.getReader(); if (!reader) return '';
 const chunks = []; let size = 0;
 while (true) {
  const { done, value } = await reader.read(); if (done) break;
  size += value.byteLength;
  if (size > 32768) { await reader.cancel(); throw new ProviderError('The payment request is too large.', 413); }
  chunks.push(value);
 }
 const bytes = new Uint8Array(size); let offset = 0;
 for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
 return new TextDecoder().decode(bytes);
}
export async function bodyHash(raw) {
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// The only live provider is the selected YouPI MANUAL_UPI adapter. It never
// marks money received: an authenticated administrator verifies the bank credit.
export function createPaymentsHandler({ env, service, userClient, youpi, simulation = false }) {
 const site = new URL(env.SITE_URL), origins = new Set((env.ALLOWED_ORIGINS || site.origin).split(',').map(origin => origin.trim()));
 const providerReady = youpi.enabled && (simulation || env.PAYMENTS_MODE === 'live');
 async function call(name, args) {
  const result = await service.rpc(name, args);
  if (result.error) {
   const message = result.error.code === '23505' ? 'That bank reference was already verified for another order. Review the bank receipt.' : result.error.code === '22023' ? result.error.message : 'Payment data could not be updated. Refresh My orders before retrying.';
   throw new ProviderError(message, result.error.code === '23505' ? 409 : 400);
  }
  return result.data;
 }
 async function customer(request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token || token.length > 10000) throw new ProviderError('Open your customer session to access this payment.', 401);
  const client = userClient(token), result = await client.auth.getUser();
  if (result.error || !result.data?.user) throw new ProviderError('Your session expired. Reopen My orders.', 401);
  const role = await client.rpc('my_role');
  if (role.error || role.data !== 'customer') throw new ProviderError('Only the customer who placed this order can open its checkout.', 403);
  return { client, user: result.data.user };
 }
 return async request => {
  const origin = request.headers.get('origin');
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin', ...(origin && origins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}), 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
  try {
   if (origin && !origins.has(origin)) throw new ProviderError('This origin cannot access BitesBro payments.', 403);
   if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
   const path = new URL(request.url).pathname.split('/payments').slice(1).join('/payments') || '/';
   if (path === '/capabilities' && request.method === 'GET') {
    const settings = await call('get_payment_settings', {});
    return json({ enabled: providerReady && settings.onlineEnabled, schemaVersion: settings.schemaVersion, provider: 'youpi', simulation, bankVerificationRequired: true });
   }
   if (request.method !== 'POST') throw new ProviderError('Use a supported payment request method.', 405);
   const raw = await limitedBody(request);
   if (path === '/youpi/webhook') {
    if (!providerReady) throw new ProviderError('YouPI is not configured.', 503);
    const event = await youpi.webhook(raw, request.headers);
    if (event.method !== 'MANUAL_UPI') throw new ProviderError('This gateway event is not a manual UPI payment.', 400);
    const amount = typeof event.amountPaise === 'string' && /^\d{1,12}$/.test(event.amountPaise) ? Number(event.amountPaise) : event.amountPaise;
    if (!Number.isSafeInteger(amount) || amount < 1 || typeof event.orderId !== 'string' || event.orderId.length > 80) throw new ProviderError('Invalid YouPI event details.', 400);
    await call('service_youpi_claim', { p_delivery: event.deliveryId, p_reference: event.orderId, p_payment: event.paymentId, p_amount: amount, p_currency: event.currency, p_status: event.event, p_utr: event.utr || null, p_timestamp: event.timestamp, p_hash: await bodyHash(raw) });
    return json({ received: true, paymentVerified: false });
   }
   if (!['/youpi/create', '/youpi/status'].includes(path)) throw new ProviderError('Unknown payment operation.', 404);
   if (!providerReady) throw new ProviderError('YouPI checkout is not configured. Your saved order is still in My orders.', 503);
   let body; try { body = JSON.parse(raw); } catch { throw new ProviderError('Send a JSON payment request.', 400); }
   if (!body || Array.isArray(body) || typeof body.reference !== 'string' || body.reference.length > 80) throw new ProviderError('Choose a saved order.', 400);
   const who = await customer(request);
   // This owner-scoped RPC also enforces the guest's recent/active history window.
   const owned = await who.client.rpc('get_payment_request', { p_reference: body.reference });
   if (owned.error || owned.data?.method !== 'youpi') throw new ProviderError('This payment is not available in your order history.', 403);
   if (path === '/youpi/status') {
    const order = await call('service_youpi_context', { p_reference: body.reference, p_user: who.user.id });
    return json({ ...await youpi.status(order), bankVerificationRequired: true, paymentVerified: false });
   }
   if (!(await call('get_payment_settings', {})).onlineEnabled) throw new ProviderError('New online checkouts are paused. Contact the restaurant about an existing payment.', 503);
   const attempt = crypto.randomUUID(), order = await call('service_youpi_begin', { p_reference: body.reference, p_user: who.user.id, p_attempt: attempt });
   if (order.paymentId) return json({ ...order, simulation, bankVerificationRequired: true });
   const checkout = await youpi.create(order);
   await call('service_youpi_created', { p_reference: body.reference, p_attempt: attempt, p_payment: checkout.paymentId, p_checkout: checkout.checkoutUrl });
   return json({ ...checkout, reference: order.reference, amount: order.amount, simulation, bankVerificationRequired: true });
  } catch (error) { return json({ error: error instanceof ProviderError ? error.message : 'The payment service is temporarily unavailable. Check My orders before retrying.' }, error.status || 503); }
 };
}
