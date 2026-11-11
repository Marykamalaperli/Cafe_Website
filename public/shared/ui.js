import {detailedDelivery,STAFF_PARTNER} from './delivery-tracking.js';
import { DEMO_BUSINESS, INSTRUCTIONS, STATUS_LABELS, STATUSES, allowedNextStatuses } from './demo-model.js?v=portal-auth-1';
import { cloudConfig, identity, signOut, loginURL } from './cloud.js?v=portal-auth-1';

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: value % 100 ? 2 : 0 }).format(value / 100);
export const siteURL = path => new URL(path.replace(/^\//, ''), new URL('../', import.meta.url)).href;
export const icon = name => `<svg class="icon" aria-hidden="true"><use href="${escape(siteURL('assets/icons.svg'))}#${escape(name)}"/></svg>`;
export const localTime = value => new Intl.DateTimeFormat('en-IN', { timeZone: DEMO_BUSINESS.timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(value));
export const localDate = value => new Intl.DateTimeFormat('en-IN', { timeZone: DEMO_BUSINESS.timezone, day: 'numeric', month: 'short' }).format(new Date(value));
export const badge = status => `<span class="status-chip status-${escape(status)}"><span aria-hidden="true"></span>${escape(STATUS_LABELS[status])}</span>`;
export const orderStatus = order => order.status!=='cancelled'&&order.fulfilment==='delivery'&&(detailedDelivery(order)?['assigned','picked_up','out_for_delivery','delivered']:['out_for_delivery','delivered']).includes(order.delivery?.status)?order.delivery.status:order.status;
export const orderBadge = order => badge(orderStatus(order));
export const optionsText = item => [item.options.variant.label, ...(item.options.spice === 'none' ? [] : [item.options.spice + ' spice']), ...item.options.addons.map(addon => addon.label)].join(' · ');

export async function mountRoleNavigation(role = 'customer', demo = true, knownAccount) {
 const target = $(role === 'customer' ? '#customer-account' : '#demo-role-nav'); if (!target) return;
 const config = await cloudConfig();
 if (role === 'customer') {
  const account = knownAccount === undefined && config.enabled ? await identity() : knownAccount;
  if (!config.enabled && config.demoEnabled && demo) {
   target.innerHTML = `<a class="button button-small button-outline nav-signin" href="${escape(siteURL(''))}" title="Demo Mode — No real orders or payments.">Leave demo</a>`;
  } else {
   target.innerHTML = account && !account.guest
    ? '<button type="button" class="button button-small button-outline nav-signin" id="account-signout">Sign out</button>'
    : `<a class="button button-small button-outline nav-signin" href="${escape(loginURL())}">Sign in</a>`;
   $('#account-signout')?.addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true;
    try { await signOut(); }
    catch (error) { button.disabled = false; const message = document.createElement('span'); message.className = 'nav-account-error'; message.setAttribute('role', 'alert'); message.textContent = error.message; target.append(message); }
   });
  }
  return;
 }
 if (config.enabled || !config.demoEnabled) {
  const account = knownAccount === undefined && config.enabled ? await identity() : knownAccount;
  const links = account?.role === 'admin' ? [['Administrator','admin/'],['Kitchen Display','kitchen/']] : account?.role === 'chef' ? [['Kitchen Display','kitchen/']] : [['Menu','#menu'],...(account ? [['My orders','orders/']] : [])];
  target.innerHTML = `<div class="role-bar-inner"><div class="role-intro"><span class="role-dot" aria-hidden="true"></span><span>BitesBro</span><small>${account ? escape(account.guest ? 'Guest checkout · track using this browser' : account.role === 'chef' ? 'Chef account' : account.role === 'admin' ? 'Administrator account' : 'Customer account') : config.enabled?'Guest checkout · no account needed':'Your next good meal'}</small></div><nav aria-label="Account navigation">${links.map(([label,path])=>`<a href="${escape(siteURL(path))}">${label}</a>`).join('')}${account&&!account.guest ? '<button type="button" class="ops-button ops-button-small" id="account-signout">Sign out</button>' : `<a class="account-link" href="${escape(loginURL())}">Sign in / Create account</a>`}</nav></div>`;
  $('#account-signout')?.addEventListener('click', async event => { const button=event.currentTarget;button.disabled=true;try { await signOut(); } catch(error) { const message=document.createElement('span');message.setAttribute('role','alert');message.textContent=error.message;target.append(message);button.disabled=false; } });
  return;
 }
 const links = [['customer', 'Customer', '?demo=1'], ['kitchen', 'Kitchen Display', 'kitchen/'], ['admin', 'Administrator', 'admin/']];
 target.innerHTML = `<div class="role-bar-inner"><div class="role-intro"><span class="role-dot" aria-hidden="true"></span><span>Explore BitesBro Demo</span>${demo ? '<strong>Demo Mode — No real orders or payments.</strong>' : '<small>Try the customer → kitchen → administrator workflow.</small>'}</div><nav aria-label="Demo role navigation">${links.map(([key, label, path]) => `<a href="${escape(siteURL(path))}" ${key === role && demo ? 'aria-current="page"' : ''}>${label}</a>`).join('')}<a href="${escape(siteURL('orders/'))}">Track orders</a></nav>${role === 'customer' && demo ? `<a class="demo-exit" href="${escape(siteURL(''))}">Leave demo</a>` : ''}</div>`;
}

let noticeTimer;
export function announce(message, error = false) {
 const target = $('#ops-notice'); if (!target) return;
 clearTimeout(noticeTimer);
 target.textContent = message; target.classList.toggle('error', error); target.hidden = false;
 noticeTimer=setTimeout(()=>{target.hidden=true;},error?9000:5000);
}
export function showDialog(dialog) { if (!dialog.open) dialog.showModal(); }
export function wireDialogs() {
 document.addEventListener('click', event => event.target.closest('[data-close-dialog]')?.closest('dialog').close());
 $$('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
 }));
}

export function orderItems(order, images = false) {
 return `<ul class="ticket-items">${order.items.map(item => `<li>${images ? `<img src="${escape(siteURL(item.image))}" alt="" width="64" height="64" loading="lazy">` : ''}<div><strong><span class="ticket-quantity">${item.quantity} ×</span> ${escape(item.name)}</strong><small>${escape(optionsText(item))}</small></div><span>${money(item.unitPrice * item.quantity)}</span></li>`).join('')}</ul>`;
}
export function orderTimeline(order) {
 if (order.status === 'cancelled') return `<div class="cancelled-note">Cancelled · ${localTime(order.timeline.at(-1).at)}.${document.body.dataset.live==='true'?'':' No payment or refund occurred.'}</div>`;
 const delivery=order.fulfilment==='delivery'&&order.delivery;
 const stages=delivery?(detailedDelivery(order)?['received','preparing','ready','assigned','picked_up','out_for_delivery','delivered']:['received','preparing','ready','out_for_delivery','delivered']):STATUSES.filter(status=>status!=='cancelled');
 return `<ol class="order-timeline ${delivery?'delivery-timeline':''} ${detailedDelivery(order)?'detailed-delivery':''}">${stages.map(status => {
  const event = [...order.timeline,...(order.delivery?.timeline||[])].find(event => event.status === status);
  return `<li class="${event ? 'complete' : ''}" ${orderStatus(order) === status ? 'aria-current="step"' : ''}><span class="timeline-dot" aria-hidden="true">${event ? '✓' : '○'}</span><strong>${STATUS_LABELS[status]}</strong><small>${event ? localTime(event.at) : ['assigned','picked_up','out_for_delivery','delivered'].includes(status)?'Waiting for a delivery update':'Waiting for kitchen action'}</small></li>`;
 }).join('')}</ol>`;
}
export const actionLabel = status => ({ preparing: 'Start preparing', ready: 'Mark ready', collected: 'Mark collected', cancelled: document.body.dataset.live==='true'?'Cancel order':'Cancel demo order' }[status]);
export function orderActions(order, role) {
 const delivery=order.fulfilment==='delivery'&&order.delivery;
 let actions=allowedNextStatuses(order.status, role).filter(status => (role !== 'customer' || order.origin === 'customer')&&!(delivery&&status==='collected')).map(status => `<button type="button" class="ops-button ${status === 'cancelled' ? 'ops-button-quiet' : 'ops-button-primary'}" data-order-action="${status}" data-reference="${escape(order.reference)}">${actionLabel(status)}</button>`).join('');
 if(role==='admin'&&delivery&&!order.courier&&order.status!=='cancelled'){
  const next=detailedDelivery(order)?({assigned:'picked_up',picked_up:'out_for_delivery',out_for_delivery:'delivered'}[order.delivery.status]||null):order.delivery.status==='out_for_delivery'?'delivered':['unassigned','assigned','failed'].includes(order.delivery.status)&&['ready','collected'].includes(order.status)?'out_for_delivery':null;
  if(next)actions+=`<button class="ops-button ops-button-primary" type="button" data-delivery-action="${next}" data-reference="${escape(order.reference)}">${next==='delivered'?'Mark delivered':next==='picked_up'?'Confirm staff pickup':'Mark out for delivery'}</button>`;
 }
 return actions;
}
function deliveryAssignment(order,role){
 if(role!=='admin'||!detailedDelivery(order)||!['ready','collected'].includes(order.status)||!['unassigned','assigned','failed'].includes(order.delivery.status))return '';
 return `<form class="staff-access-form delivery-assignment-form" data-assign-delivery="${escape(order.reference)}"><h3>Assign restaurant staff</h3><p>${STAFF_PARTNER} · no external courier booking</p><label class="ops-field">Staff member name (optional)<input name="rider" maxlength="80" autocomplete="off" value="${escape(order.delivery.riderName||'')}"></label><label class="ops-field">Demo journey time after pickup (minutes)<input name="minutes" type="number" min="10" max="180" value="${order.delivery.estimatedMinutes||45}" required></label><p class="ops-muted">Illustrative estimate only. No route distance or live traffic is calculated.</p><button class="ops-button ops-button-primary" type="submit">Assign restaurant staff</button><p role="status" class="ops-form-result"></p></form>`;
}
export function detailMarkup(order, role) {
 if (document.body.dataset.live === 'true') return `<div class="order-detail-meta">${orderBadge(order)}<span>${localDate(order.createdAt)} · ${localTime(order.createdAt)} · ${escape(order.fulfilment)}</span></div><p class="ops-muted">Scheduled: ${escape(order.date)} · ${escape(order.time)} Bangalore time</p>${orderItems(order,true)}<p class="ticket-instructions"><strong>Preparation note</strong>${escape(order.instructions || 'Standard preparation')}</p>${order.name ? `<p>${escape(order.name)} · ${escape(order.email)} · ${escape(order.phone)}</p>${order.fulfilment==='delivery'?`<p>${escape(order.address)} · ${escape(order.postcode)}</p>`:''}` : ''}<dl class="ticket-totals"><div><dt>Food subtotal</dt><dd>${money(order.subtotal)}</dd></div><div><dt>Delivery fee</dt><dd>${money(order.deliveryFee)}</dd></div><div><dt>Order total</dt><dd>${money(order.total)}</dd></div></dl>${orderTimeline(order)}${deliveryAssignment(order,role)}<div class="order-detail-actions">${orderActions(order,role)}</div><p class="ops-muted">${order.delivery?'Delivery updates are recorded by restaurant staff. No automatic courier booking or online payment is connected.':'Saved in Supabase. No online payment or email confirmation is connected.'}</p>`;
 return `<div class="order-detail-meta">${orderBadge(order)}<span>${localDate(order.createdAt)} · ${localTime(order.createdAt)} · ${escape(order.fulfilment)}</span></div>${orderItems(order, true)}<p class="ticket-instructions"><strong>Preparation note</strong>${escape(INSTRUCTIONS[order.instruction])}</p><dl class="ticket-totals"><div><dt>Food subtotal</dt><dd>${money(order.subtotal)}</dd></div><div><dt>Demo delivery</dt><dd>${money(order.deliveryFee)}</dd></div><div><dt>Demonstration total</dt><dd>${money(order.total)}</dd></div></dl>${orderTimeline(order)}${deliveryAssignment(order,role)}<div class="order-detail-actions">${orderActions(order, role)}</div><p class="ops-muted">Fictional demo guest. No contact, address or payment information is stored. Changes sync between tabs in this browser only.</p>`;
}
export function setKitchenIndicator(state) {
 const target = $('#kitchen-indicator'); if (target) { target.textContent = state.settings.acceptingOrders ? `${state.live?'Kitchen':'Demo kitchen'} accepting · ~${state.settings.prepMinutes} min` : `${state.live?'Kitchen':'Demo kitchen'} paused`; target.classList.toggle('paused', !state.settings.acceptingOrders); }
}
