import { startOperations, statCard } from '../shared/operations.js?v=customer-nav-1';
import { $, $$, escape, badge, orderBadge, localTime, localDate, orderItems, orderActions, announce } from '../shared/ui.js?v=customer-nav-1';
import { demoMetrics, STATUS_LABELS, INSTRUCTIONS } from '../shared/demo-model.js?v=portal-auth-1';

let store, queue = 'active', sort = 'oldest', search = '';
function ticket(order) {
 return `<article class="ticket-card" data-ticket="${escape(order.reference)}"><div class="ticket-card-header"><div><h3>${escape(order.reference)}</h3><p>${localDate(order.createdAt)} · ${localTime(order.createdAt)}<br>${escape(order.fulfilment)} · ${store?.live ? escape(order.date+' '+order.time) : order.origin === 'sample' ? 'Sample ticket' : 'Customer demo'}</p></div>${orderBadge(order)}</div><div class="ticket-card-body">${orderItems(order)}<p class="ticket-instructions"><strong>Preparation note</strong>${escape(store?.live ? order.instructions||'Standard preparation' : INSTRUCTIONS[order.instruction])}</p><div class="ticket-actions">${orderActions(order, 'kitchen')}<button class="ops-button ops-button-small" data-view-order="${escape(order.reference)}">Details</button></div></div></article>`;
}
function render(state) {
 const { counts } = demoMetrics(state);
 $('#kitchen-stats').innerHTML = statCard('received', 'Just received', counts.received, 'Ready to start', true) + statCard('preparing', 'On the stove', counts.preparing, 'Currently preparing') + statCard('ready', 'Ready to collect', counts.ready, 'Waiting at the counter') + statCard('collected', 'Collected', counts.collected, `${counts.cancelled} cancelled demo orders`);
 const statuses = queue === 'active' ? ['received', 'preparing', 'ready'] : queue === 'history' ? ['collected', 'cancelled'] : [queue];
 const target = $('#kitchen-queue'); target.classList.toggle('single-column', queue !== 'active');
 target.innerHTML = statuses.map(status => {
  const orders = state.orders.filter(order => order.status === status).sort((a, b) => (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * (sort === 'oldest' ? 1 : -1));
  return `<section class="queue-column" aria-label="${STATUS_LABELS[status]} orders"><div class="queue-column-heading"><h2>${STATUS_LABELS[status]}</h2><span>${orders.length}</span></div>${orders.length ? orders.map(ticket).join('') : '<p class="queue-empty">All clear here.<br>No ' + STATUS_LABELS[status].toLowerCase() + ' demo orders.</p>'}</section>`;
 }).join('');
 $('#availability-count').textContent = `${state.menu.filter(item => item.available && !item.archived).length} available`;
 const items = state.menu.filter(item => !item.archived && item.name.toLowerCase().includes(search));
 $('#availability-list').innerHTML = items.length ? items.map(item => `<div class="availability-row"><span>${escape(item.name)}<small class="${item.available ? '' : 'unavailable'}">${item.available ? 'Available' : 'Unavailable'} · ${escape(item.cuisine)}</small></span><button class="ops-button ops-button-small" data-availability="${escape(item.id)}" aria-label="${item.available ? 'Mark unavailable' : 'Make available'}: ${escape(item.name)}" aria-pressed="${!item.available}">${item.available ? 'Pause dish' : 'Make available'}</button></div>`).join('') : '<p class="ops-muted">No matching demo dishes.</p>';
}

await startOperations('kitchen', render, async (connection, redraw) => {
 store = connection;
 if(store.live && store.account.role==='chef') document.querySelector('a[href="../admin/#orders"]')?.remove();
 $('#queue-filters').addEventListener('click', event => {
  const button = event.target.closest('[data-queue]'); if (!button) return;
  queue = button.dataset.queue;
  $$('[data-queue]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); redraw();
 });
 $('#queue-sort').addEventListener('change', event => { sort = event.target.value; redraw(); });
 $('#availability-search').addEventListener('input', event => { search = event.target.value.trim().toLowerCase(); redraw(); });
 $('#availability-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-availability]'); if (!button) return;
  const item = store.read().menu.find(item => item.id === button.dataset.availability); if (!item) return;
  button.disabled = true;
  try { await store.dispatch({ type: 'menu.availability', id: item.id, value: !item.available, role: 'kitchen' }); announce(`${item.name} is now ${item.available ? 'unavailable' : 'available'} in the demo menu.`); }
  catch (error) { announce(error.message, true); if (button.isConnected) button.disabled = false; }
 });
});
