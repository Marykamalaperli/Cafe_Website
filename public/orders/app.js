import { startOperations } from '../shared/operations.js?v=three-roles-2';
import { $, escape, badge, money, localDate, localTime, siteURL, detailMarkup } from '../shared/ui.js?v=three-roles-2';

let reference = new URL(location.href).searchParams.get('order'), query = '';
function render(state) {
 if (!reference) reference = state.orders.find(order => order.origin === 'customer')?.reference || state.orders[0]?.reference;
 const orders = state.orders.filter(order => order.reference.toLowerCase().includes(query)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
 $('#order-history').innerHTML = orders.length ? orders.map(order => `<li><a href="?order=${encodeURIComponent(order.reference)}" data-track-order="${escape(order.reference)}" ${reference === order.reference ? 'aria-current="true"' : ''}><strong>${escape(order.reference)}</strong><small>${localDate(order.createdAt)} · ${localTime(order.createdAt)} · ${order.origin === 'sample' ? 'Fictional sample' : 'Your demo order'}</small><div class="history-item-bottom">${badge(order.status)}<span>${money(order.total)}</span></div></a></li>`).join('') : '<li class="ops-empty"><p>No matching demo orders.</p></li>';
 const order = state.orders.find(order => order.reference === reference);
 $('#tracking-detail').innerHTML = order ? `<div class="ops-panel-header"><div><p class="eyebrow">${order.origin === 'sample' ? 'FICTIONAL SAMPLE ORDER' : 'YOUR DEMONSTRATION ORDER'}</p><h2 id="tracking-reference" tabindex="-1">${escape(order.reference)}</h2></div><span class="ops-muted">${order.items.reduce((sum, item) => sum + item.quantity, 0)} dishes</span></div>${detailMarkup(order, 'customer')}` : `<div class="ops-empty"><h2>This demo ticket is no longer here.</h2><p>It may have been cleared by a demo reset. Choose a sample from the history or make a new fictional order.</p><a class="ops-button" href="${escape(siteURL('?demo=1#menu'))}">Browse the demo menu</a></div>`;
}

await startOperations('customer', render, async (_store, redraw) => {
 $('#order-history').addEventListener('click', event => {
  const link = event.target.closest('[data-track-order]'); if (!link) return;
  event.preventDefault(); reference = link.dataset.trackOrder;
  const url = new URL(location.href); url.searchParams.set('order', reference); history.replaceState(null, '', url); redraw();
 });
 $('#history-search').addEventListener('input', event => { query = event.target.value.trim().toLowerCase(); redraw(); });
});
