import { DEMO_BUSINESS, INSTRUCTIONS, STATUS_LABELS, STATUSES, allowedNextStatuses } from './demo-model.js?v=three-roles-2';
import { cloudConfig, identity, signOut, loginURL } from './cloud.js';

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: value % 100 ? 2 : 0 }).format(value / 100);
export const siteURL = path => new URL(path.replace(/^\//, ''), new URL('../', import.meta.url)).href;
export const icon = name => `<svg class="icon" aria-hidden="true"><use href="${escape(siteURL('assets/icons.svg'))}#${escape(name)}"/></svg>`;
export const localTime = value => new Intl.DateTimeFormat('en-IN', { timeZone: DEMO_BUSINESS.timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(value));
export const localDate = value => new Intl.DateTimeFormat('en-IN', { timeZone: DEMO_BUSINESS.timezone, day: 'numeric', month: 'short' }).format(new Date(value));
export const badge = status => `<span class="status-chip status-${escape(status)}"><span aria-hidden="true"></span>${escape(STATUS_LABELS[status])}</span>`;
export const optionsText = item => [item.options.variant.label, ...(item.options.spice === 'none' ? [] : [item.options.spice + ' spice']), ...item.options.addons.map(addon => addon.label)].join(' · ');

export async function mountRoleNavigation(role = 'customer', demo = true, knownAccount) {
 const target = $('#demo-role-nav'); if (!target) return;
 const config = await cloudConfig();
 if (config.enabled || !config.demoEnabled) {
  const account = knownAccount === undefined && config.enabled ? await identity() : knownAccount;
  const links = account?.role === 'admin' ? [['Administrator','admin/'],['Kitchen Display','kitchen/']] : account?.role === 'chef' ? [['Kitchen Display','kitchen/']] : [['Menu','#menu'],...(account ? [['My orders','orders/']] : [])];
  target.innerHTML = `<div class="role-bar-inner"><div class="role-intro"><span class="role-dot" aria-hidden="true"></span><span>BitesBro</span><small>${account ? escape(account.role === 'chef' ? 'Chef account' : account.role === 'admin' ? 'Administrator account' : 'Customer account') : 'Your next good meal'}</small></div><nav aria-label="Account navigation">${links.map(([label,path])=>`<a href="${escape(siteURL(path))}">${label}</a>`).join('')}${account ? '<button type="button" class="ops-button ops-button-small" id="account-signout">Sign out</button>' : `<a class="account-link" href="${escape(loginURL())}">Sign in / Create account</a>`}</nav></div>`;
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
 return `<ol class="order-timeline">${STATUSES.filter(status => status !== 'cancelled').map(status => {
  const event = order.timeline.find(event => event.status === status);
  return `<li class="${event ? 'complete' : ''}" ${order.status === status ? 'aria-current="step"' : ''}><span class="timeline-dot" aria-hidden="true">${event ? '✓' : '○'}</span><strong>${STATUS_LABELS[status]}</strong><small>${event ? localTime(event.at) : 'Waiting for kitchen action'}</small></li>`;
 }).join('')}</ol>`;
}
export const actionLabel = status => ({ preparing: 'Start preparing', ready: 'Mark ready', collected: 'Mark collected', cancelled: document.body.dataset.live==='true'?'Cancel order':'Cancel demo order' }[status]);
export function orderActions(order, role) {
 return allowedNextStatuses(order.status, role).filter(status => role !== 'customer' || order.origin === 'customer').map(status => `<button type="button" class="ops-button ${status === 'cancelled' ? 'ops-button-quiet' : 'ops-button-primary'}" data-order-action="${status}" data-reference="${escape(order.reference)}">${actionLabel(status)}</button>`).join('');
}
export function detailMarkup(order, role) {
 if (document.body.dataset.live === 'true') return `<div class="order-detail-meta">${badge(order.status)}<span>${localDate(order.createdAt)} · ${localTime(order.createdAt)} · ${escape(order.fulfilment)}</span></div><p class="ops-muted">Scheduled: ${escape(order.date)} · ${escape(order.time)} Bangalore time</p>${orderItems(order,true)}<p class="ticket-instructions"><strong>Preparation note</strong>${escape(order.instructions || 'Standard preparation')}</p>${order.name ? `<p>${escape(order.name)} · ${escape(order.email)} · ${escape(order.phone)}</p>${order.fulfilment==='delivery'?`<p>${escape(order.address)} · ${escape(order.postcode)}</p>`:''}` : ''}<dl class="ticket-totals"><div><dt>Food subtotal</dt><dd>${money(order.subtotal)}</dd></div><div><dt>Delivery fee</dt><dd>${money(order.deliveryFee)}</dd></div><div><dt>Order total</dt><dd>${money(order.total)}</dd></div></dl>${orderTimeline(order)}<div class="order-detail-actions">${orderActions(order,role)}</div><p class="ops-muted">Saved in Supabase. No online payment, delivery dispatch or email confirmation is connected.</p>`;
 return `<div class="order-detail-meta">${badge(order.status)}<span>${localDate(order.createdAt)} · ${localTime(order.createdAt)} · ${escape(order.fulfilment)}</span></div>${orderItems(order, true)}<p class="ticket-instructions"><strong>Preparation note</strong>${escape(INSTRUCTIONS[order.instruction])}</p><dl class="ticket-totals"><div><dt>Food subtotal</dt><dd>${money(order.subtotal)}</dd></div><div><dt>Demo delivery</dt><dd>${money(order.deliveryFee)}</dd></div><div><dt>Demonstration total</dt><dd>${money(order.total)}</dd></div></dl>${orderTimeline(order)}<div class="order-detail-actions">${orderActions(order, role)}</div><p class="ops-muted">Fictional demo guest. No contact, address or payment information is stored. Changes sync between tabs in this browser only.</p>`;
}
export function setKitchenIndicator(state) {
 const target = $('#kitchen-indicator'); if (target) { target.textContent = state.settings.acceptingOrders ? `${state.live?'Kitchen':'Demo kitchen'} accepting · ~${state.settings.prepMinutes} min` : `${state.live?'Kitchen':'Demo kitchen'} paused`; target.classList.toggle('paused', !state.settings.acceptingOrders); }
}
