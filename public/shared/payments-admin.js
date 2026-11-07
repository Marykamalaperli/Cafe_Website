import { rpc, cloudConfig } from './cloud.js?v=portal-auth-1';
import { escape, money, announce } from './ui.js?v=customer-nav-1';
let section, simulation = false;

export async function wireAdminPayments({ refresh }) {
 section = document.createElement('section'); section.id = 'payments-admin-panel'; section.className = 'ops-panel payments-admin'; section.hidden = true;
 document.querySelector('#panel-settings').append(section); simulation = (await cloudConfig()).reviewSandbox === true;
 section.addEventListener('submit', async event => {
  const form = event.target.closest('form'); if (!form || form.dataset.busy) return;
  event.preventDefault(); if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form)), button = form.querySelector('button'); button.disabled = true; form.dataset.busy = 'true';
  try {
   if (form.dataset.action === 'enable') await rpc('set_online_payments', { p_enabled: form.elements.enabled.checked });
   else if (form.dataset.action === 'review') {
    const received = values.decision === 'received';
    if (received && !form.elements.checkedReceipt.checked) throw new Error('Confirm that you checked the bank credit, amount and reference.');
    await rpc('review_youpi_receipt', { p_reference: values.reference, p_bank_reference: values.bankReference, p_received: received, p_note: values.note });
   } else if (form.dataset.action === 'refund') await rpc('record_payment_refund', { p_reference: values.reference, p_refund_reference: values.refundReference });
   else if (form.dataset.action === 'cash') await rpc('record_cash_receipt', { p_reference: values.reference });
   button.blur(); await refresh(); section.querySelector('h2').focus(); announce('Payment record updated.');
  } catch (error) { form.querySelector('[role=status]').textContent = error.message; }
  finally { button.disabled = false; delete form.dataset.busy; }
 });
}
export function renderAdminPayments(state) {
 if (!section) return;
 section.hidden = state.paymentVersion < 8 || !state.paymentVersion;
 const editing=document.activeElement?.closest('form');if(section.hidden||editing&&section.contains(editing))return;
 const cashExpanded=section.querySelector('.payment-cash-list')?.open;
 const cashSummaryFocused=document.activeElement===section.querySelector('.payment-cash-list summary');
 const pending = state.orders.filter(order => ['submitted', 'refund_pending'].includes(order.payment?.status));
 const cash = state.orders.filter(order => order.payment?.method === 'cod' && (order.payment.status === 'due' || order.payment.status === 'unrecorded' && order.status !== 'collected') && order.status !== 'cancelled').slice(0, 10);
 section.innerHTML = `<div class="ops-panel-header"><div><h2 tabindex="-1">Payments${simulation ? ' · demo' : ''}</h2><p>${simulation ? 'All receipts below are simulated. No bank or real money is involved.' : 'Verify UPI credits in the receiving bank account before approving. Refunds must be completed through your bank before being recorded.'}</p></div></div><form class="payment-enable" data-action="enable"><label class="settings-check"><input type="checkbox" name="enabled" ${state.paymentSettings?.onlineEnabled ? 'checked' : ''}><span>Offer YouPI at checkout</span></label><button class="ops-button" type="submit">Save payment preference</button><p class="ops-form-result" role="status"></p></form><p class="ops-muted">The YouPI server must also be configured. Payment preferences do not connect a gateway or send a refund.</p><h3>Bank receipts & refunds</h3><div class="payment-review-list">${pending.length ? pending.map(order => `<article class="payment-review-card" data-payment-review="${escape(order.reference)}"><h3>${escape(order.reference)} · ${money(order.payment.amount)}</h3><p>${order.status === 'cancelled' ? 'Cancelled order' : 'Kitchen waiting'} · ${order.payment.status === 'refund_pending' ? 'Refund required' : 'Bank verification pending'}</p>${order.payment.gatewayReference && order.payment.gatewayReference !== order.payment.bankReference ? `<p class="payment-review-note">Gateway reference differs: ${escape(order.payment.gatewayReference)}. Resolve this discrepancy in the bank before approving.</p>` : ''}<form class="staff-access-form" data-action="${order.payment.status === 'refund_pending' ? 'refund' : 'review'}"><input type="hidden" name="reference" value="${escape(order.reference)}">${order.payment.status === 'refund_pending' ? `<label class="ops-field">${order.payment.method === 'youpi' ? '12-digit bank refund reference' : 'Completed refund receipt'}<input name="refundReference" ${order.payment.method === 'youpi' ? 'pattern="[0-9]{12}" minlength="12" maxlength="12" inputmode="numeric"' : 'minlength="2" maxlength="80"'} required autocomplete="off"></label><button class="ops-button ops-button-primary" type="submit">Record completed refund</button>` : `<p>Submitted bank reference: <strong>${escape(order.payment.bankReference)}</strong></p><input type="hidden" name="bankReference" value="${escape(order.payment.bankReference)}"><label class="ops-field">Review decision<select name="decision"><option value="received">Bank credit received</option><option value="reject">Cannot verify receipt</option></select></label><label class="ops-field">Review note (required when rejecting)<input name="note" maxlength="300" autocomplete="off"></label><label class="settings-check"><input type="checkbox" name="checkedReceipt"><span>I checked the ${simulation ? 'simulated ' : ''}bank credit, exact amount and reference.</span></label><button class="ops-button ops-button-primary" type="submit">Save receipt review</button>`}<p class="ops-form-result" role="status"></p></form></article>`).join('') : '<p class="ops-empty">No bank receipts or refunds awaiting review.</p>'}</div><details class="payment-cash-list"><summary>Cash collections · latest ${cash.length}</summary>${cash.map(order => `<form data-action="cash"><input type="hidden" name="reference" value="${escape(order.reference)}"><p><strong>${escape(order.reference)}</strong> · ${money(order.total)}</p><button class="ops-button" type="submit">Record cash received</button><p class="ops-form-result" role="status"></p></form>`).join('')}</details>`;
 const cashDetails=section.querySelector('.payment-cash-list');cashDetails.open=Boolean(cashExpanded);
 if(cashSummaryFocused)cashDetails.querySelector('summary').focus({preventScroll:true});
}
