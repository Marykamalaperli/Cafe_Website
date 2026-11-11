import { startOperations, statCard, liveCopy } from '../shared/operations.js?v=payments-1';
import {wireAdminPayments,renderAdminPayments} from '../shared/payments-admin.js?v=payments-1';
import { $, $$, escape, money, orderBadge, orderStatus, localDate, localTime, siteURL, announce, showDialog, icon } from '../shared/ui.js?v=customer-nav-1';
import { STATUSES, STATUS_LABELS } from '../shared/demo-model.js?v=portal-auth-1';
import { adminReport, reportPeriod, bangaloreDay } from '../shared/admin-reporting.js';
import {rpc} from '../shared/cloud.js?v=portal-auth-1';
import {uploadMenuPhotos} from '../shared/photo-upload.js?v=portal-auth-1';

let store, menuLimit = 12, editingId, redrawPage;
let periodKind='day', reportDate=null;
const currentPeriod=()=>reportPeriod(periodKind,reportDate||bangaloreDay(new Date()));
function resetToday(){periodKind='day';reportDate=null;$('#admin-period').value='day';redrawPage?.();}
const titles = {
 overview: ['Your daily <em>overview.</em>', 'A live view of the fictional orders, menu and kitchen activity in this browser.'],
 orders: ['Your orders. <em>By day.</em>', 'Follow preparation, inspect customisations and manage permitted demonstration status changes.'],
 menu: ['A menu made <em>your way.</em>', 'Shape the full demonstration catalogue. Changes appear in the customer and kitchen views.'],
 reports: ['A little food <em>for thought.</em>', 'Useful summaries, calculated from the same fictional orders as the kitchen and customer views.'],
 settings: ['Keep your kitchen <em>in rhythm.</em>', 'Simple preferences for this demonstration. Real business settings and SQLite stay unchanged.']
};
function selectPanel() {
 const panel = Object.hasOwn(titles, location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
 $$('.admin-panel').forEach(section => { section.hidden = section.id !== 'panel-' + panel; });
 $$('[data-panel-link]').forEach(link => { if (link.dataset.panelLink === panel) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
 $('#admin-page-title').innerHTML = titles[panel][0]; $('#admin-page-description').textContent = titles[panel][1];
 $('#admin-period-controls').hidden=!['overview','orders','reports'].includes(panel);
 if(panel==='overview'&&store)resetToday();
 liveCopy();
}

function renderOrders(state) {
 const query = $('#admin-order-search').value.trim().toLowerCase(), status = $('#admin-order-status').value;
 const orders = state.orders.filter(order => order.reference.toLowerCase().includes(query) && (status === 'all' || orderStatus(order) === status)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
 $('#admin-order-count').textContent = `${orders.length} demonstration orders`;
 $('#admin-orders').innerHTML = orders.length ? `<div class="ops-table-wrap"><table class="ops-table"><thead><tr><th scope="col">Order</th><th scope="col">Placed</th><th scope="col">Status</th><th scope="col">Demo total</th><th scope="col">Action</th></tr></thead><tbody>${orders.map(order => `<tr data-order-row="${escape(order.reference)}"><td><strong>${escape(order.reference)}</strong><small>${order.origin === 'sample' ? 'Fictional sample' : 'Customer demo'} · ${escape(order.fulfilment)}</small></td><td>${localDate(order.createdAt)}<small>${localTime(order.createdAt)}</small></td><td>${orderBadge(order)}</td><td>${money(order.total)}</td><td><button class="ops-button ops-button-small" data-view-order="${escape(order.reference)}" aria-label="View ${escape(order.reference)}">View order ${icon('arrow')}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="ops-empty"><h2>No orders in this view.</h2><p>Try another date, reference or status.</p></div>';
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
 $('#sales-trend').innerHTML = `<p class="report-caption">${money(metrics.days.reduce((sum, day) => sum + day.sales, 0))} collected order revenue in the selected period. Exact values are in the daily summary below.</p><svg class="sales-chart" viewBox="0 0 ${Math.max(460,metrics.days.length*61+30)} 190" role="img" aria-label="Collected order revenue by Bangalore date"><line class="chart-baseline" x1="12" y1="150" x2="${Math.max(445,metrics.days.length*61+15)}" y2="150"/>${bars}</svg>`;
 $('#status-summary').innerHTML = STATUSES.map(status => `<div><span>${STATUS_LABELS[status]}</span><meter value="${metrics.counts[status]}" max="${Math.max(1, metrics.totalOrders)}" aria-label="${STATUS_LABELS[status]} orders">${metrics.counts[status]}</meter><strong>${metrics.counts[status]}</strong></div>`).join('');
 $('#daily-summary').innerHTML = `<div class="ops-table-wrap"><table class="ops-table"><thead><tr><th scope="col">Bangalore date</th><th scope="col">Orders placed</th><th scope="col">Collected</th><th scope="col">Collected order revenue</th></tr></thead><tbody>${[...metrics.days].reverse().map(day => `<tr><td>${escape(localDate(day.date + 'T12:00:00+05:30'))}</td><td>${day.orders}</td><td>${day.collected}</td><td>${money(day.sales)}</td></tr>`).join('')}</tbody></table></div>`;
}
function render(state) {
 renderAdminPayments(state);
 const period=currentPeriod(),report=adminReport(state,period),metrics=report.metrics;
 $('#admin-report-date').value=period.date;$('#admin-date-field').hidden=period.kind==='all';
 $('#admin-period-label').textContent=period.kind==='all'?'All time · Bangalore time':period.kind==='day'?`${period.date} · Bangalore time`:`${period.start} to ${metrics.days.at(-1).date} · Bangalore time`;
 const fullState=state;state=report.state;
 $('#admin-stats').innerHTML = statCard('total', 'Orders in period', metrics.totalOrders, 'Placed in the selected period', true) + statCard('preparing', 'In preparation', metrics.counts.preparing, 'Selected period’s orders') + statCard('ready', 'Ready for collection', metrics.counts.ready, 'Prepared and waiting') + statCard('collected', 'Collected orders', metrics.counts.collected, `${metrics.counts.cancelled} cancelled · ${metrics.counts.received} received`) + statCard('sales', 'Collected order revenue', money(metrics.sales), 'Collected orders placed in this period') + statCard('available', 'Available dishes', metrics.available, `${state.menu.filter(item => !item.archived).length} active menu items`);
 $('#report-stats').innerHTML=$('#admin-stats').innerHTML;
 $('#popular-items').innerHTML = metrics.popular.slice(0, 5).map((item, index) => `<li><span class="popular-rank">${index + 1}</span><span>${escape(item.name)}</span><strong>${item.quantity} ordered</strong></li>`).join('') || '<li>No fictional orders yet.</li>';
 $('#report-popular-items').innerHTML = metrics.popular.slice(0, 8).map((item, index) => `<li><span class="popular-rank">${index + 1}</span><span>${escape(item.name)}</span><strong>${item.quantity} ordered</strong></li>`).join('') || '<li>No fictional orders yet.</li>';
 $('#activity-list').innerHTML = state.activity.slice(0, 5).map(event => `<li>${escape(event.text)}<small>${localDate(event.at)} · ${localTime(event.at)} · ${escape(event.role)}</small></li>`).join('') || '<li>No demonstration activity yet.</li>';
 renderOrders(state); renderMenu(fullState); renderReports(metrics);
 if (!$('#demo-settings-form').contains(document.activeElement)) { $('#demo-accepting').checked = state.settings.acceptingOrders; $('#demo-prep').value = state.settings.prepMinutes; }
 $('#settings-availability').textContent = `${metrics.available} dishes available · ${state.settings.acceptingOrders ? 'Accepting demo orders' : 'New demo orders paused'}`;
}
function openEditor(id) {
 const state = store.read(), item = state.menu.find(item => item.id === id), form = $('#demo-menu-form');
 editingId = item?.id; form.reset(); $('#menu-result').textContent = '';
 $('#menu-dialog-title').textContent = item ? store.live?'Edit dish':'Edit demo dish' : 'A new favourite.';
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
 store = connection; redrawPage=redraw; selectPanel(); window.addEventListener('hashchange', selectPanel);
 $('#admin-period').addEventListener('change',event=>{periodKind=event.target.value;redraw();});
 $('#admin-report-date').addEventListener('change',event=>{if(event.target.reportValidity()){reportDate=event.target.value;redraw();}});
 $('#admin-today').addEventListener('click',resetToday);
 document.addEventListener('submit',async event=>{
  const form=event.target.closest('[data-assign-delivery]');if(!form)return;
  event.preventDefault();if(!form.reportValidity()||form.dataset.busy)return;
  const updating=['picked_up','out_for_delivery'].includes(store.read().orders.find(order=>order.reference===form.dataset.assignDelivery)?.delivery?.status);
  const button=form.querySelector('button');form.dataset.busy='true';button.disabled=true;
  try{await store.dispatch({type:'order.assign',reference:form.dataset.assignDelivery,rider:form.elements.rider.value.trim(),phone:form.elements.phone.value.trim(),minutes:Number(form.elements.minutes.value)});announce(updating?'Partner contact updated.':'Partner assigned. The customer can now see this delivery update. Confirm pickup when the food is handed over.');}
  catch(error){form.querySelector('[role=status]').textContent=error.message;}
  finally{delete form.dataset.busy;button.disabled=false;}
 });

 // Polling and tab visibility refresh recalculate today after Bangalore midnight.
 if(store.live)await wireAdminPayments({refresh:()=>store.refresh()});
 if(store.live){
  $('.reset-panel').hidden=true;$('#reset-dialog').remove();
  const section=document.createElement('div');section.className='ops-two-col';
  section.innerHTML='<section class="ops-panel"><div class="ops-panel-header"><div><h2>Menu photographs</h2><p>Upload the 40 bundled licensed photos to menu-images / files. Existing files are verified and reused.</p></div></div><button class="ops-button ops-button-primary" id="upload-menu-photos">Upload menu photographs</button><p class="ops-form-result" id="photo-upload-result" role="status"></p><p class="ops-muted">Only administrators can upload. Photo credits and source hashes remain with the catalogue.</p></section><section class="ops-panel"><div class="ops-panel-header"><div><h2>Staff access</h2><p>The account must sign up and confirm its email first. You cannot change your own role here.</p></div></div><form id="staff-access-form" class="staff-access-form"><label class="ops-field">Account email<input name="email" type="email" maxlength="254" autocomplete="off" required></label><label class="ops-field">Access<select name="role"><option value="chef">Chef · kitchen only</option><option value="admin">Administrator · admin and kitchen</option><option value="customer">Customer · customer pages only</option></select></label><button class="ops-button ops-button-primary" type="submit">Update account access</button><p class="ops-form-result" id="staff-access-result" role="status"></p></form></section>';
  $('#panel-settings').append(section);
  $('#upload-menu-photos').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{const count=await uploadMenuPhotos(text=>{$('#photo-upload-result').textContent=text;});await store.refresh();$('#photo-upload-result').textContent=`${count} licensed photos stored in Supabase and linked to the menu.`;}catch(error){$('#photo-upload-result').textContent=error.message;}finally{button.disabled=false;}});
  $('#staff-access-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;const button=$('button[type=submit]',form);button.disabled=true;try{await rpc('set_staff_role',{p_email:form.elements.email.value.trim(),p_role:form.elements.role.value});$('#staff-access-result').textContent='Account access updated. The next page or data refresh will use the new permissions.';form.reset();}catch(error){$('#staff-access-result').textContent=error.message;}finally{button.disabled=false;}});
 }
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
   announce(`${item.name} ${availability ? item.available ? 'paused' : 'available' : item.archived ? 'restored' : 'archived'}${store.live?'':' in the demo'}.`);
  } catch (error) { announce(error.message, true); if (button.isConnected) button.disabled = false; }
 });
 $('#demo-menu-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity() || form.dataset.submitting) return;
  form.dataset.submitting = 'true'; const button = $('button[type=submit]', form); button.disabled = true; $('#menu-result').textContent = '';
  const values = Object.fromEntries(new FormData(form));
  const fields = { ...values, price: Math.round(Number(values.price) * 100), prepMinutes: Number(values.prepMinutes), ingredients: values.ingredients.split(',').map(value => value.trim()).filter(Boolean), allergens: values.allergens.split(',').map(value => value.trim()).filter(Boolean) };
  try { const item = await store.dispatch({ type: 'menu.save', id: editingId, fields }); $('#menu-dialog').close(); ($(`[data-edit-dish="${CSS.escape(item.id)}"]`)||$('#add-demo-dish')).focus({preventScroll:true}); announce(`${item.name} saved to ${store.live?'the menu':'the shared demonstration menu'}.`); }
  catch (error) { $('#menu-result').textContent = error.message; }
  finally { delete form.dataset.submitting; button.disabled = false; }
 });
 $('#demo-settings-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
  const button = $('button[type=submit]', form); button.disabled = true;
  try { await store.dispatch({ type: 'settings.save', acceptingOrders: $('#demo-accepting').checked, prepMinutes: Number($('#demo-prep').value) }); $('#settings-result').textContent = `${store.live?'Kitchen':'Demo'} preferences saved. The customer and kitchen views are updated.`; }
  catch (error) { $('#settings-result').textContent = error.message; }
  finally { button.disabled = false; }
 });
 $('#open-reset-demo')?.addEventListener('click', () => showDialog($('#reset-dialog')));
 $('#confirm-reset-demo')?.addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  try { await store.reset(); $('#reset-dialog').close(); $('#settings-result').textContent = ''; announce('Demo reset: 50 sample dishes and six fictional orders restored.'); }
  catch (error) { announce(error.message, true); }
  finally { button.disabled = false; }
 });
});
