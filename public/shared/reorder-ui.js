import { $, escape, money, icon } from './ui.js?v=customer-nav-1';
import { BAG_KEY, LEGACY_BAG_KEY, readBag, readSavedBag, writeBag, updateBagButton } from './bag.js?v=customer-flow-1';
import { planReorder } from './reorder.js?v=customer-flow-1';

export function wireReordering({ getOrder, loadMenu, checkoutURL, menuURL }) {
 document.addEventListener('click', event => {
  const button = event.target.closest('[data-reorder-order]'); if (!button) return;
  const order = getOrder(button.dataset.reorderOrder); if (order) void openReorder(order);
 });
 async function openReorder(order) {
  if ($('#reorder-dialog')) return;
  const dialog = document.createElement('dialog'); dialog.id = 'reorder-dialog'; dialog.className = 'ops-dialog reorder-dialog'; dialog.setAttribute('aria-labelledby', 'reorder-title');
  dialog.innerHTML = `<div class="ops-dialog-header"><div><p class="eyebrow">ANOTHER ROUND OF GOOD FOOD</p><h2 id="reorder-title">Your favourites,<br><em>once more.</em></h2></div><button class="icon-button" type="button" data-reorder-close aria-label="Close reorder preview">${icon('close')}</button></div><p class="reorder-intro">${escape(order.reference)} · Check today’s portions, availability and prices before adding to your bag.</p><div id="reorder-items"><p class="ops-skeleton">Checking the current menu…</p></div><div id="reorder-issues"></div><fieldset class="reorder-mode" hidden><legend>You already have food in your bag</legend><label><input type="radio" name="reorder-mode" value="merge" checked><span>Add to my current bag</span></label><label><input type="radio" name="reorder-mode" value="replace"><span>Replace my current bag</span></label></fieldset><p id="reorder-notice" class="reorder-notice" role="status"></p><p class="reorder-footnote">This adds food selections only. Choose a new pickup/delivery time and review your details at checkout. Final prices and availability are checked again when you place the order.</p><div class="reorder-footer"><div><span>Food to add</span><strong id="reorder-subtotal">—</strong></div><button class="ops-button ops-button-orange" type="button" id="reorder-confirm" disabled>Add to bag ${icon('arrow')}</button></div><a class="reorder-menu-link" href="${escape(menuURL)}">Explore the current menu</a>`;
  document.body.append(dialog); dialog.showModal(); document.body.classList.add('dialog-open');
  let menu, plan, shownBag, stale = false, requestVersion=0;
  const view=selector=>dialog.querySelector(selector);
  const mode = () => dialog.querySelector('[name=reorder-mode]:checked').value;
  const message = text => { view('#reorder-notice').textContent = text; };
  function render() {
   const bag = readBag(menu), saved = readSavedBag(); shownBag = JSON.stringify(bag); stale = false;
   plan = planReorder(order.items, menu, bag, mode()); dialog.querySelector('.reorder-mode').hidden = !saved.length;
   view('#reorder-items').innerHTML = plan.selected.map(({ line, item, variant, addons, unitPrice, previousPrice, oldName }) => `<article class="reorder-item"><img src="${escape(new URL(item.image.replace(/^\//, ''), menuURL).href)}" alt="" width="64" height="64"><div><h3>${line.quantity} × ${escape(item.name)}</h3><p>${escape([variant.label, ...(line.spice === 'none' ? [] : [line.spice + ' spice']), ...addons.map(option => option.label)].join(' · '))}</p>${oldName !== item.name ? `<small>Previously ${escape(oldName)}</small>` : ''}${previousPrice !== null && previousPrice !== unitPrice ? `<small class="reorder-price-change">Current price ${money(unitPrice)} each · previously ${money(previousPrice)}</small>` : ''}<details><summary>Ingredients & allergens</summary><p>Sample ingredients: ${escape((item.ingredients || []).join(', ') || 'Check with the restaurant')}.</p><p>Allergens: ${escape((item.allergens || []).join(', ') || 'No common allergens listed')}. Confirm shared-kitchen handling with the restaurant.</p></details></div><strong>${money(unitPrice * line.quantity)}</strong></article>`).join('') || '<div class="ops-empty">None of the original selections are available.</div>';
   view('#reorder-issues').innerHTML = plan.issues.length ? `<section class="reorder-unavailable"><h3>Selections to choose again</h3><ul>${plan.issues.map(issue => `<li><strong>${escape(issue.name)}</strong><span>${escape(issue.reason)}</span></li>`).join('')}</ul><p>Only the available selections above will be added. Your previous order stays unchanged.</p></section>` : '';
   view('#reorder-subtotal').textContent = money(plan.subtotal); const confirm = view('#reorder-confirm'); confirm.disabled = Boolean(plan.blocked); confirm.innerHTML = `Add ${plan.quantity} ${plan.quantity === 1 ? 'item' : 'items'} to bag ${icon('arrow')}`;
   message(plan.blocked || (saved.length > bag.length && mode() === 'merge' ? 'Unavailable or invalid selections in the current bag will be removed when you continue.' : ''));
  }
  async function load() {
   const version=++requestVersion;view('#reorder-confirm').disabled = true;
   view('#reorder-items').innerHTML='<p class="ops-skeleton">Checking the current menu…</p>';
   try { const result=await loadMenu();if(!dialog.isConnected||version!==requestVersion)return;menu=result; if (!Array.isArray(menu) || !menu.length) throw new Error('The menu is temporarily unavailable.'); render(); }
   catch { if(!dialog.isConnected||version!==requestVersion)return;view('#reorder-items').innerHTML = '<div class="ops-empty"><h3>The current menu couldn’t load.</h3><p>Your saved bag has been kept. Check your connection and try again.</p><button class="ops-button" type="button" data-reorder-retry>Try again</button></div>'; }
  }
  const storage = event => { if ([BAG_KEY, LEGACY_BAG_KEY, null].includes(event.key) && menu) { stale = true;const confirm=view('#reorder-confirm');confirm.textContent='Review updated bag';if(plan?.selected.length)confirm.disabled=false;message('Your bag changed in another tab. Review the updated bag before adding.'); } };
  window.addEventListener('storage', storage);
  dialog.addEventListener('close', () => { window.removeEventListener('storage', storage); dialog.remove(); if (!document.querySelector('dialog[open]')) document.body.classList.remove('dialog-open');const trigger=[...document.querySelectorAll('[data-reorder-order]')].find(button=>button.dataset.reorderOrder===order.reference);trigger?.focus({preventScroll:true}); });
  dialog.addEventListener('change', event => { if (event.target.name === 'reorder-mode' && menu) render(); });
  dialog.addEventListener('click', event => {
   if (event.target.closest('[data-reorder-close]')) dialog.close();
   if (event.target.closest('[data-reorder-retry]')) void load();
   if (!event.target.closest('#reorder-confirm') || !menu) return;
   if (stale || JSON.stringify(readBag(menu)) !== shownBag) { render(); message('Your bag has been updated. Review the selections, then add them when ready.'); return; }
   if (plan.blocked) return;
   const confirm = view('#reorder-confirm'); confirm.disabled = true;
   try { writeBag(plan.lines); updateBagButton(plan.lines); location.assign(checkoutURL); }
   catch { message('The bag could not be saved. Allow browser storage and try again.'); confirm.disabled = false; }
  });
  await load();
 }
}
