import { startOperations, statCard } from '../shared/operations.js?v=three-roles-2';
import { $, $$, escape, money, badge, localDate, localTime, siteURL, announce, showDialog, icon } from '../shared/ui.js?v=three-roles-2';
import { demoMetrics, STATUSES, STATUS_LABELS } from '../shared/demo-model.js?v=three-roles-2';

let store, menuLimit = 12, editingId;
const titles = {
 overview: ['Your daily <em>overview.</em>', 'A live view of the fictional orders, menu and kitchen activity in this browser.'],
 orders: ['Every order. <em>One view.</em>', 'Follow preparation, inspect customisations and manage permitted demonstration status changes.'],
 menu: ['A menu made <em>your way.</em>', 'Shape the full demonstration catalogue. Changes appear in the customer and kitchen views.'],
 reports: ['A little food <em>for thought.</em>', 'Useful summaries, calculated from the same fictional orders as the kitchen and customer views.'],
 settings: ['Keep your kitchen <em>in rhythm.</em>', 'Simple preferences for this demonstration. Real business settings and SQLite stay unchanged.']
};
function selectPanel() {
 const panel = Object.hasOwn(titles, location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
 $$('.admin-panel').forEach(section => { section.hidden = section.id !== 'panel-' + panel; });
 $$('[data-panel-link]').forEach(link => { if (link.dataset.panelLink === panel) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
 $('#admin-page-title').innerHTML = titles[panel][0]; $('#admin-page-description').textContent = titles[panel][1];
}

function renderOrders(state) {
 const query = $('#admin-order-search').value.trim().toLowerCase(), status = $('#admin-order-status').value;
 const orders = state.orders.filter(order => order.reference.toLowerCase().includes(query) && (status === 'all' || order.status === status)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
 $('#admin-order-count').textContent = `${orders.length} demonstration orders`;
 $('#admin-orders').innerHTML = orders.length ? `<div class="ops-table-wrap"><table class="ops-table"><thead><tr><th scope="col">Order</th><th scope="col">Placed</th><th scope="col">Status</th><th scope="col">Demo total</th><th scope="col">Action</th></tr></thead><tbody>${orders.map(order => `<tr data-order-row="${escape(order.reference)}"><td><strong>${escape(order.reference)}</strong><small>${order.origin === 'sample' ? 'Fictional sample' : 'Customer demo'} · ${escape(order.fulfilment)}</small></td><td>${localDate(order.createdAt)}<small>${localTime(order.createdAt)}</small></td><td>${badge(order.status)}</td><td>${money(order.total)}</td><td><button class="ops-button ops-button-small" data-view-order="${escape(order.reference)}" aria-label="View ${escape(order.reference)}">View order ${icon('arrow')}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="ops-empty"><h2>No orders in this view.</h2><p>Try another reference or status.</p></div>';
}
function renderMenu(state) {
 const query = $('#admin-menu-search').value.trim().toLowerCase(), filter = $('#admin-menu-status').value;
 const items = state.menu.filter(item => (item.name + ' ' + item.cuisine).toLowerCase().includes(query) && (filter === 'all' || (filter === 'archived' ? item.archived : !item.archived && (filter === 'active' || (filter === 'available' ? item.available : !item.available)))));
 $('#admin-menu-count').textContent = `${items.length} ${items.length === 1 ? 'dish' : 'dishes'} · ${state.menu.length} in this demonstration`;
 $('#more-demo-dishes').hidden = items.length <= menuLimit;
 $('#admin-menu').innerHTML = items.length ? `<div class="ops-table-wrap"><table class="ops-table"><thead><tr><th scope="col">Dish</th><th scope="col">Category</th><th scope="col">Price</th><th scope="col">Availability</th><th scope="col">Actions</th></tr></thead><tbody>${items.slice(0, menuLimit).map(item => `<tr data-menu-row="${escape(item.id)}"><td><div class="table-dish"><img src="${escape(siteURL(item.image))}" alt="" width="47" height="47" loading="lazy"><span><strong>${escape(item.name)}</strong><small>${item.diet === 'non-veg' ? 'Non-vegetarian' : item.diet === 'vegan' ? 'Plant based' : 'Vegetarian'}${item.photo?.reference ? ' · Reference photo' : ''}</small></span></div></td><td>${escape(state.categories.find(category => category.id === item.category)?.name)}</td><td>${money(item.price)}</td><td>${item.archived ? 'Archived' : `<button class="ops-button ops-button-small" data-menu-availability="${escape(item.id)}" aria-label="${item.available ? 'Pause' : 'Resume'} ${escape(item.name)}" aria-pressed="${!item.available}">${item.available ? 'Available' : 'Unavailable'}</button>`}</td><td><div class="table-actions"><button class="ops-button ops-button-small" data-edit-dish="${escape(item.id)}" aria-label="Edit ${escape(item.name)}">Edit</button><button class="ops-button ops-button-small ops-button-quiet" data-archive-dish="${escape(item.id)}" aria-label="${item.archived ? 'Restore' : 'Archive'} ${escape(item.name)}">${item.archived ? 'Restore' : 'Archive'}</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="ops-empty"><h2>No matching dishes.</h2><p>Try another filter or add a demonstration dish.</p></div>';
}
function renderReports(metrics) {
 const max = Math.max(1, ...metrics.days.map(day => day.sales));
 const bars = metrics.days.map((day, index) => {
  const height = day.sales / max * 125, x = 24 + index * 61;
  return `<rect class="chart-bar" x="${x}" y="${150 - height}" width="29" height="${height}" rx="4"><title>${escape(day.date)}: ${money(day.sales)}</title></rect><text x="${x + 14}" y="176" text-anchor="middle">${escape(localDate(day.date + 'T12:00:00+05:30'))}</text>`;
 }).join('');
 $('#sales-trend').innerHTML = `<p class="report-caption">${money(metrics.days.reduce((sum, day) => sum + day.sales, 0))} simulated sales over these seven days. Exact values are in the daily summary below.</p><svg class="sales-chart" viewBox="0 0 460 190" role="img" aria-label="Seven-day demonstration sales trend"><line class="chart-baseline" x1="12" y1="150" x2="445" y2="150"/>${bars}</svg>`;
 $('#status-summary').innerHTML = STATUSES.map(status => `<div><span>${STATUS_LABELS[status]}</span><meter value="${metrics.counts[status]}" max="${Math.max(1, metrics.totalOrders)}" aria-label="${STATUS_LABELS[status]} orders">${metrics.counts[status]}</meter><strong>${metrics.counts[status]}</strong></div>`).join('');
 $('#daily-summary').innerHTML = `<div class="ops-table-wrap"><table class="ops-table"><thead><tr><th scope="col">Bangalore date</th><th scope="col">Orders placed</th><th scope="col">Collected</th><th scope="col">Simulated sales</th></tr></thead><tbody>${[...metrics.days].reverse().map(day => `<tr><td>${escape(localDate(day.date + 'T12:00:00+05:30'))}</td><td>${day.orders}</td><td>${day.collected}</td><td>${money(day.sales)}</td></tr>`).join('')}</tbody></table></div>`;
}
function render(state) {
 const metrics = demoMetrics(state);
 $('#admin-stats').innerHTML = statCard('total', 'Total demo orders', metrics.totalOrders, 'All statuses in this browser', true) + statCard('preparing', 'In preparation', metrics.counts.preparing, 'On the kitchen’s active queue') + statCard('ready', 'Ready for collection', metrics.counts.ready, 'Prepared and waiting') + statCard('collected', 'Collected orders', metrics.counts.collected, `${metrics.counts.cancelled} cancelled · ${metrics.counts.received} received`) + statCard('sales', 'Simulated sales', money(metrics.sales), 'Collected orders only') + statCard('available', 'Available dishes', metrics.available, `${state.menu.filter(item => !item.archived).length} active menu items`);
 $('#popular-items').innerHTML = metrics.popular.slice(0, 5).map((item, index) => `<li><span class="popular-rank">${index + 1}</span><span>${escape(item.name)}</span><strong>${item.quantity} ordered</strong></li>`).join('') || '<li>No fictional orders yet.</li>';
 $('#report-popular-items').innerHTML = metrics.popular.slice(0, 8).map((item, index) => `<li><span class="popular-rank">${index + 1}</span><span>${escape(item.name)}</span><strong>${item.quantity} ordered</strong></li>`).join('') || '<li>No fictional orders yet.</li>';
 $('#activity-list').innerHTML = state.activity.slice(0, 5).map(event => `<li>${escape(event.text)}<small>${localDate(event.at)} · ${localTime(event.at)} · ${escape(event.role)}</small></li>`).join('') || '<li>No demonstration activity yet.</li>';
 renderOrders(state); renderMenu(state); renderReports(metrics);
 if (!$('#demo-settings-form').contains(document.activeElement)) { $('#demo-accepting').checked = state.settings.acceptingOrders; $('#demo-prep').value = state.settings.prepMinutes; }
 $('#settings-availability').textContent = `${metrics.available} dishes available · ${state.settings.acceptingOrders ? 'Accepting demo orders' : 'New demo orders paused'}`;
}
function openEditor(id) {
 const state = store.read(), item = state.menu.find(item => item.id === id), form = $('#demo-menu-form');
 editingId = item?.id; form.reset(); $('#menu-result').textContent = '';
 $('#menu-dialog-title').textContent = item ? 'Edit demo dish' : 'A new favourite.';
 form.elements.category.replaceChildren(...state.categories.map(category => new Option(category.name, category.id)));
 const photos = [...new Map(state.menu.filter(item => item.photo).map(item => [item.image, item])).values()];
 form.elements.image.replaceChildren(...photos.map(item => new Option(item.photo.title + ' · ' + item.photo.license, item.image)));
 const values = item || { name: '', description: '', price: 15000, category: 'south-indian', diet: 'veg', prepMinutes: 25, image: photos[0].image, ingredients: [], allergens: [] };
 for (const key of ['name', 'description', 'category', 'diet', 'prepMinutes', 'image']) form.elements[key].value = values[key];
 form.elements.price.value = (values.price / 100).toFixed(2);
 for (const key of ['ingredients', 'allergens']) form.elements[key].value = values[key].join(', ');
 showDialog($('#menu-dialog'));
}

await startOperations('admin', render, async (connection, redraw) => {
 store = connection; selectPanel(); window.addEventListener('hashchange', selectPanel);
 for (const id of ['admin-order-search', 'admin-menu-search']) $('#' + id).addEventListener('input', () => { menuLimit = 12; redraw(); });
 for (const id of ['admin-order-status', 'admin-menu-status']) $('#' + id).addEventListener('change', () => { menuLimit = 12; redraw(); });
 $('#more-demo-dishes').addEventListener('click', () => { menuLimit += 12; redraw(); });
 $('#add-demo-dish').addEventListener('click', () => openEditor());
 $('#admin-menu').addEventListener('click', async event => {
  const edit = event.target.closest('[data-edit-dish]'); if (edit) return openEditor(edit.dataset.editDish);
  const availability = event.target.closest('[data-menu-availability]'), archive = event.target.closest('[data-archive-dish]');
  const button = availability || archive; if (!button) return;
  const item = store.read().menu.find(item => item.id === (availability ? availability.dataset.menuAvailability : archive.dataset.archiveDish));
  if (!item) return; button.disabled = true;
  try {
   await store.dispatch({ type: availability ? 'menu.availability' : 'menu.archive', id: item.id, value: availability ? !item.available : !item.archived, role: 'admin' });
   announce(`${item.name} ${availability ? item.available ? 'paused' : 'available' : item.archived ? 'restored' : 'archived'} in the demo.`);
  } catch (error) { announce(error.message, true); if (button.isConnected) button.disabled = false; }
 });
 $('#demo-menu-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity() || form.dataset.submitting) return;
  form.dataset.submitting = 'true'; const button = $('button[type=submit]', form); button.disabled = true; $('#menu-result').textContent = '';
  const values = Object.fromEntries(new FormData(form));
  const fields = { ...values, price: Math.round(Number(values.price) * 100), prepMinutes: Number(values.prepMinutes), ingredients: values.ingredients.split(',').map(value => value.trim()).filter(Boolean), allergens: values.allergens.split(',').map(value => value.trim()).filter(Boolean) };
  try { const item = await store.dispatch({ type: 'menu.save', id: editingId, fields }); $('#menu-dialog').close(); ($(`[data-edit-dish="${CSS.escape(item.id)}"]`)||$('#add-demo-dish')).focus({preventScroll:true}); announce(`${item.name} saved to the shared demonstration menu.`); }
  catch (error) { $('#menu-result').textContent = error.message; }
  finally { delete form.dataset.submitting; button.disabled = false; }
 });
 $('#demo-settings-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
  const button = $('button[type=submit]', form); button.disabled = true;
  try { await store.dispatch({ type: 'settings.save', acceptingOrders: $('#demo-accepting').checked, prepMinutes: Number($('#demo-prep').value) }); $('#settings-result').textContent = 'Demo preferences saved. The customer and kitchen views are updated.'; }
  catch (error) { $('#settings-result').textContent = error.message; }
  finally { button.disabled = false; }
 });
 $('#open-reset-demo').addEventListener('click', () => showDialog($('#reset-dialog')));
 $('#confirm-reset-demo').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  try { await store.reset(); $('#reset-dialog').close(); $('#settings-result').textContent = ''; announce('Demo reset: 50 sample dishes and six fictional orders restored.'); }
  catch (error) { announce(error.message, true); }
  finally { button.disabled = false; }
 });
});
