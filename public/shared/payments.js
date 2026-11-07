import { cloudConfig, cloudClient, rootURL, rpc } from './cloud.js?v=portal-auth-1';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const money = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);
export const paymentLabels = { unrecorded: 'Payment not recorded', due: 'Pay on pickup / delivery', pending: 'Awaiting payment', submitted: 'Bank verification pending', failed: 'Gateway reported a failure', expired: 'Checkout expired', paid: 'Payment received', cancelled: 'Payment cancelled', refund_pending: 'Refund awaiting restaurant', refunded: 'Refund recorded' };
let capabilities;

export async function paymentService(path, { body } = {}) {
 const config = await cloudConfig(), headers = { apikey: config.publishableKey };
 if (body) {
  const { data, error } = await (await cloudClient()).auth.getSession();
  if (error || !data.session) throw new Error('Open My orders in the browser that placed this order.');
  headers.Authorization = 'Bearer ' + data.session.access_token; headers['Content-Type'] = 'application/json';
 }
 const response = await fetch(config.url.replace(/\/$/, '') + '/functions/v1/payments/' + path, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000) });
 let result; try { result = await response.json(); } catch { throw new Error('Payment services could not be reached. Your order stays in My orders.'); }
 if (!response.ok) throw new Error(result.error || 'Payment services could not complete this request.');
 return result;
}
export async function configurePaymentChoice(form) {
 const config = await cloudConfig(); if (!config.enabled || !config.paymentsEnabled || !form) return;
 if(config.reviewSandbox)document.querySelector('#privacy-dialog .prose').innerHTML='<h3>Your payment demo</h3><p>This review demo saves fictional order details and bank references in this browser only. No real account, bank, YouPI, email or courier service is contacted. Demo data, bags and sign-ins stay separate from the main website. Use fictional contact details.</p>';
 try {
  capabilities ||= paymentService('capabilities'); const available = await capabilities;
  if (!available.enabled || available.schemaVersion < 8 || form.elements.paymentMethod) return;
  const label = document.createElement('label'); label.textContent = 'Payment method';
  const select = document.createElement('select'); select.name = 'paymentMethod'; select.id = 'payment-method';
  select.add(new Option('Cash on pickup / delivery', 'cod'));
  select.add(new Option(config.reviewSandbox ? 'UPI · YouPI payment demo (no charge)' : 'UPI · YouPI (bank receipt checked by restaurant)', 'youpi'));
  label.append(select); form.querySelector('h3').after(label);
  document.querySelector('.cart-payment').textContent = config.reviewSandbox ? 'Payment demo · no real bank or UPI app is contacted' : 'Cash or UPI · UPI orders start after bank receipt verification';
  form.querySelector('.form-note').textContent = 'Your order opens in My orders. A UPI bank reference stays pending until the restaurant verifies the credit. Cash orders go straight to the kitchen.';
  if(!config.reviewSandbox){const privacy=document.querySelector('#privacy-dialog .prose p:last-child');privacy.textContent='Choosing UPI sends your order reference and amount to the hosted YouPI checkout. Your bank reference is stored with your private order for administrator bank-credit verification; chefs do not receive it. Refunds are completed and recorded by restaurant staff. Automatic courier booking and order-confirmation emails are not connected.';}
 } catch { /* Payment on pickup/delivery remains available while the optional service is offline. */ }
}

export function paymentMarkup(order) {
 const payment = order.payment; if (!payment) return '';
 const unpaid = payment.method === 'youpi' && ['pending', 'submitted', 'failed', 'expired', 'cancelled'].includes(payment.status);
 const correcting=payment.status==='submitted'||Boolean(payment.reviewNote||payment.gatewayReference);
 return `<section class="payment-panel" aria-label="Payment status"><div class="payment-heading"><h3>Payment</h3><span class="payment-status payment-${escape(payment.status)}">${escape(paymentLabels[payment.status] || payment.status)}</span></div><p>${payment.method === 'youpi' ? 'YouPI · UPI' : 'Cash on pickup / delivery'} · <strong>${money(payment.amount)}</strong></p>${payment.bankReference ? `<p>Bank reference: <strong>${escape(payment.bankReference)}</strong></p>` : ''}${payment.reviewNote ? `<p class="payment-review-note">Restaurant review: ${escape(payment.reviewNote)}</p>` : ''}${payment.status === 'submitted' ? '<p>We’re checking the receiving bank account. You do not need to pay again.</p>' : payment.status === 'pending' ? `<p>${correcting?'Check the bank debit and correct your existing reference. Do not pay again while resolving this receipt.':'The kitchen starts this UPI order after the bank receipt is verified.'}</p>` : ['failed', 'expired'].includes(payment.status) ? '<p>If your account was debited, submit the bank reference or contact the restaurant. Check the debit before attempting another payment.</p>' : payment.status === 'refund_pending' ? '<p>The restaurant must complete your refund and record its receipt here. No automatic refund has been sent.</p>' : payment.status === 'refunded' ? `<p>Refund receipt: ${escape(payment.refundReference)}</p>` : ''}${unpaid ? `<button class="ops-button ops-button-primary" type="button" data-payment-open="${escape(order.reference)}">${correcting ? 'Review / correct bank reference' : order.status === 'cancelled' || ['failed', 'expired'].includes(payment.status) ? 'Already paid? Submit bank reference' : 'Continue UPI payment'}</button>` : ''}</section>`;
}

export function wireCustomerPayments({ getOrder, refresh }) {
 document.addEventListener('click', event => {
  const button = event.target.closest('[data-payment-open]'); if (!button) return;
  const order = getOrder(button.dataset.paymentOpen); if (order) void openPayment(order, refresh);
 });
 const url = new URL(location.href);
 if (url.searchParams.get('pay') === '1') {
  const order = getOrder(url.searchParams.get('order')); url.searchParams.delete('pay'); history.replaceState(null, '', url);
  if (order?.payment?.method === 'youpi' && !['paid', 'refund_pending', 'refunded'].includes(order.payment.status)) void openPayment(order, refresh);
 }
}
async function openPayment(order, refresh) {
 if (document.querySelector('#youpi-payment-dialog')) return;
 const config = await cloudConfig(), dialog = document.createElement('dialog');
 dialog.id = 'youpi-payment-dialog'; dialog.className = 'ops-dialog payment-dialog'; dialog.setAttribute('aria-labelledby', 'youpi-payment-title');
 dialog.innerHTML = `<div class="ops-dialog-header"><div><p class="eyebrow">BITESBRO × YOUPI${config.reviewSandbox ? ' · DEMO' : ''}</p><h2 id="youpi-payment-title">Your next <em>good bite.</em></h2></div><button class="ops-button" type="button" data-payment-close aria-label="Close payment">×</button></div><p><strong>${money(order.payment.amount)}</strong> · ${escape(order.reference)}</p><p>${config.reviewSandbox ? 'Simulation only. No bank, UPI app or hosted YouPI server is contacted.' : 'UPI payments are verified against the receiving bank account by the restaurant.'}</p><div id="youpi-hosted-checkout"></div><form class="staff-access-form" id="youpi-reference-form">${config.reviewSandbox ? '<label class="ops-field">Simulated gateway outcome<select name="outcome"><option value="MANUAL_REVIEW">Bank reference submitted</option><option value="SUCCESS">Gateway success (still needs bank verification)</option><option value="FAILED">Gateway failure</option><option value="EXPIRED">Checkout expired</option></select></label>' : ''}<label class="ops-field">${config.reviewSandbox ? 'Demo ' : ''}12-digit bank reference<input name="bankReference" inputmode="numeric" pattern="[0-9]{12}" minlength="12" maxlength="12" autocomplete="off" value="${escape(order.payment.bankReference || (config.reviewSandbox ? '123456789012' : ''))}" required></label><button class="ops-button ops-button-orange" type="submit">${config.reviewSandbox ? 'Simulate UPI response' : 'Submit bank reference'}</button></form><p id="youpi-payment-status" class="ops-form-result" role="status">${order.payment.status === 'submitted' ? 'Bank reference already submitted. Do not pay again while it is being reviewed.' : 'Opening your saved payment…'}</p><p class="ops-muted">A gateway success screen or submitted reference does not confirm receipt. Only a verified bank credit releases the kitchen ticket.</p><button class="ops-button" type="button" data-payment-close>Follow order progress</button>`;
 const status = dialog.querySelector('#youpi-payment-status'), hosted = dialog.querySelector('#youpi-hosted-checkout'), form = dialog.querySelector('form');
 dialog.addEventListener('click', event => { if (event.target.closest('[data-payment-close]')) dialog.close(); });
 dialog.addEventListener('close', () => { dialog.remove(); if (!document.querySelector('dialog[open]')) document.body.classList.remove('dialog-open'); });
 document.body.append(dialog); dialog.showModal(); document.body.classList.add('dialog-open');
 let checkout;
 const requestReady = (async () => {
  if (order.status === 'cancelled' || ['failed', 'expired', 'cancelled'].includes(order.payment.status)) { status.textContent = 'If you already paid, submit your bank reference for review. Do not send a second payment before checking the first debit.'; return; }
  try {
   checkout = await paymentService('youpi/create', { body: { reference: order.reference } });
   if (!dialog.isConnected) return;
   if (!config.reviewSandbox && order.payment.status !== 'submitted' && !order.payment.reviewNote && !order.payment.gatewayReference) {
    const link = document.createElement('a'); link.className = 'ops-button ops-button-primary'; link.href = checkout.checkoutUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Open YouPI checkout'; hosted.append(link);
    const note = document.createElement('p'); note.className = 'ops-muted'; note.textContent = 'Pay in the hosted YouPI window. Already paid? Submit the bank reference below instead of paying twice.'; hosted.append(note);
   }
   const check = document.createElement('button'); check.type = 'button'; check.className = 'ops-button'; check.textContent = 'Check gateway status'; hosted.append(check);
   check.addEventListener('click', async () => { check.disabled = true; try { const result = await paymentService('youpi/status', { body: { reference: order.reference } }); status.textContent = `YouPI reports ${result.status}. Bank verification is still required; this check does not mark a payment paid.`; await refresh(); } catch (error) { status.textContent = error.message; } finally { check.disabled = false; } });
   if (order.payment.status !== 'submitted') status.textContent = config.reviewSandbox ? 'Ready for a simulated response. Use fictional details.' : 'Complete payment in YouPI or submit an existing bank reference below.';
  } catch (error) { if (dialog.isConnected) status.textContent = error.message + ' If already debited, you can still submit the bank reference below.'; }
 })();
 if (config.reviewSandbox) form.elements.outcome.addEventListener('change', () => { const claim = ['MANUAL_REVIEW', 'SUCCESS'].includes(form.elements.outcome.value); form.elements.bankReference.required = claim; form.elements.bankReference.disabled = !claim; });
 form.addEventListener('submit', async event => {
  event.preventDefault(); if (!form.reportValidity() || form.dataset.busy) return;
  form.dataset.busy = 'true'; const button = form.querySelector('button'); button.disabled = true;
  try {
   await requestReady;
   if (config.reviewSandbox && (checkout || order.payment.gatewayStatus)) {
    const client = await cloudClient(), { data } = await client.auth.getSession();
    const response = await fetch(rootURL('review/youpi/submit'), { method: 'POST', headers: { Authorization: 'Bearer ' + data.session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ reference: order.reference, utr: form.elements.bankReference.value, outcome: form.elements.outcome.value }), signal: AbortSignal.timeout(25000) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'The simulated response could not be processed.');
   } else await rpc('submit_youpi_reference', { p_reference: order.reference, p_bank_reference: form.elements.bankReference.value });
   await refresh(); form.hidden = true; status.textContent = 'Response saved. Follow payment verification and preparation in your order history.';
   dialog.querySelector('[data-payment-close]').focus();
  } catch (error) { status.textContent = error.message; button.disabled = false; delete form.dataset.busy; }
 });
}
