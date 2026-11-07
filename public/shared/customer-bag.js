import { cloudConfig, cloudRequest, rootURL } from './cloud.js?v=portal-auth-1';
import { BAG_KEY, LEGACY_BAG_KEY, readBag, writeBag, updateBagButton } from './bag.js?v=customer-flow-1';
import { escape, money, icon } from './ui.js?v=customer-nav-1';

// Secondary customer pages use the same saved selections as the menu's full checkout.
export function wireCustomerBag() {
 const button = document.querySelector('#open-cart');
 if (!button || document.querySelector('#cart-dialog') || button.dataset.bagWired) return;
 button.dataset.bagWired = 'true';
 const dialog = document.createElement('dialog');
 dialog.id = 'customer-bag-dialog'; dialog.className = 'cart-dialog'; dialog.setAttribute('aria-labelledby', 'customer-bag-title');
 dialog.innerHTML = `<div class="dialog-header"><div><p class="eyebrow">GOOD CHOICES, ALL TOGETHER</p><h2 id="customer-bag-title">Your food order.</h2></div><button type="button" class="icon-button" data-bag-close aria-label="Close bag">${icon('close')}</button></div><div id="customer-bag-content"><p class="bag-loading" role="status">Opening your food bag…</p></div><p class="bag-feedback" id="customer-bag-status" role="status"></p><div id="customer-bag-checkout" hidden><div class="cart-total"><span>Food subtotal</span><strong id="customer-bag-total"></strong></div><p class="bag-checkout-note">Delivery and final availability are confirmed at checkout. Pay on pickup or delivery.</p><a class="button button-orange button-full" id="customer-bag-continue" href="${escape(rootURL('?bag=1'))}">Continue to checkout ${icon('arrow')}</a></div>`;
 document.body.append(dialog);
 const content = dialog.querySelector('#customer-bag-content'), status = dialog.querySelector('#customer-bag-status'), checkout = dialog.querySelector('#customer-bag-checkout');
 let menu, lines = [], loading, demo = false, sample = false, unsubscribe;
 const menuURL = () => rootURL(demo ? '?demo=1#menu' : '#menu');
 const assetURL = path => new URL(path.replace(/^\//, ''), rootURL('')).href;

 function render() {
  if (!menu) return;
  const active = content.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = active?.dataset.bagKey, focusDelta = active?.dataset.bagDelta, focusRemove = active?.dataset.bagRemove;
  const restoreFocus = () => {
   if (!focusKey && !focusRemove) return;
   const replacement = [...content.querySelectorAll('button')].find(button => focusRemove ? button.dataset.bagRemove === focusRemove : button.dataset.bagKey === focusKey && button.dataset.bagDelta === focusDelta);
   (replacement || dialog.querySelector('[data-bag-close]')).focus({ preventScroll: true });
  };
  lines = readBag(menu); updateBagButton(lines); checkout.hidden = !lines.length;
  if (!lines.length) {
   content.innerHTML = `<div class="cart-empty">${icon('plate')}<h3>A little room for good food.</h3><p>Your next favourite bite is on the menu.</p><a class="button button-orange" href="${escape(menuURL())}">Find your craving ${icon('arrow')}</a></div>`;
   restoreFocus();
   return;
  }
  let subtotal = 0;
  content.innerHTML = lines.map(line => {
   const item = menu.find(item => item.id === line.id), variant = item.variants.find(option => option.id === line.variant), addons = item.addons.filter(option => line.addons.includes(option.id));
   const price = (item.price + variant.price + addons.reduce((sum, option) => sum + option.price, 0)) * line.quantity; subtotal += price;
   const summary = [variant.label, ...(line.spice === 'none' ? [] : [line.spice + ' spice']), ...addons.map(option => option.label)].join(' · ');
   return `<div class="cart-item"><img class="cart-item-image" src="${escape(assetURL(item.image))}" alt="" width="72" height="72"><div><h3>${escape(item.name)}</h3><p class="cart-options">${escape(summary)}</p><p class="cart-item-price">${money(price)}</p><div class="quantity-control"><button type="button" data-bag-key="${escape(line.key)}" data-bag-delta="-1" aria-label="Remove one ${escape(item.name)}">−</button><span>${line.quantity}</span><button type="button" data-bag-key="${escape(line.key)}" data-bag-delta="1" aria-label="Add one ${escape(item.name)}">+</button></div></div><button type="button" class="remove-item" data-bag-remove="${escape(line.key)}" aria-label="Remove ${escape(item.name)} from bag">×</button></div>`;
  }).join('');
  dialog.querySelector('#customer-bag-total').textContent = money(subtotal);
  dialog.querySelector('.bag-checkout-note').textContent = demo ? 'Fictional demo only. No real orders or payments.' : sample ? 'Sample menu estimate. Checkout will check the connection, current prices and availability.' : 'Delivery and final availability are confirmed at checkout. Pay on pickup or delivery.';
  dialog.querySelector('#customer-bag-continue').href = rootURL(demo ? '?demo=1&bag=1' : '?bag=1');
  restoreFocus();
 }

 async function load() {
  if (loading) return loading;
  loading = (async () => {
   try {
    const config = await cloudConfig();
    demo = !config.enabled && config.demoEnabled && (location.pathname.endsWith('/orders/') || location.pathname.endsWith('/orders/index.html') || new URL(location.href).searchParams.get('demo') === '1');
    if (demo) {
     const { connectDemoStore } = await import('./demo-store.js?v=portal-auth-1');
     const store = await connectDemoStore();
     const refresh = () => { menu = store.read().menu.filter(item => item.available && !item.archived); render(); };
     refresh(); unsubscribe = store.subscribe(refresh);
    } else {
     let catalogue;
     try {
      if (config.enabled) catalogue = await cloudRequest('/api/menu');
      else { const response = await fetch('/api/menu', { signal: AbortSignal.timeout(12000) }); if (!response.ok) throw new Error(); catalogue = await response.json(); }
      if (!catalogue.items?.length) throw new Error();
     } catch {
      const response = await fetch(rootURL('menu.json'), { signal: AbortSignal.timeout(12000) }); if (!response.ok) throw new Error();
      catalogue = await response.json(); sample = true;
     }
     menu = catalogue.items; render();
    }
   } catch {
    content.innerHTML = `<div class="cart-empty"><h3>Your bag couldn’t load.</h3><p>Your saved selections are still in this browser. Check your connection and try again.</p><button type="button" class="button button-outline" data-bag-retry>Try again</button></div>`;
   } finally { loading = null; }
  })();
  return loading;
 }

 button.addEventListener('click', () => {
  if (menu) render(); else void load();
  if (!dialog.open) dialog.showModal(); document.body.classList.add('dialog-open');
 });
 dialog.addEventListener('close', () => document.body.classList.remove('dialog-open'));
 dialog.addEventListener('click', event => {
  if (event.target.closest('[data-bag-close]')) dialog.close();
  if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); }
  if (event.target.closest('[data-bag-retry]')) { content.innerHTML = '<p class="bag-loading" role="status">Opening your food bag…</p>'; void load(); }
  const change = event.target.closest('[data-bag-key]'), remove = event.target.closest('[data-bag-remove]');
  if ((!change && !remove) || !menu) return;
  // Re-read before every edit, including changes made by another customer tab.
  lines = readBag(menu); status.textContent = '';
  if (remove) lines = lines.filter(line => line.key !== remove.dataset.bagRemove);
  if (change) {
   const line = lines.find(line => line.key === change.dataset.bagKey); if (!line) { render(); return; }
   const delta = Number(change.dataset.bagDelta);
   if (delta > 0 && (line.quantity >= 10 || lines.reduce((sum, line) => sum + line.quantity, 0) >= 30)) { status.textContent = 'Maximum 10 of each dish and 30 items per order.'; return; }
   line.quantity += delta; lines = lines.filter(line => line.quantity > 0);
  }
  try { writeBag(lines); render(); status.textContent = 'Your bag has been updated.'; }
  catch { status.textContent = 'Your changes could not be saved. Allow browser storage and try again.'; }
 });
 const sync = () => { if (menu) render(); };
 window.addEventListener('storage', event => { if ([BAG_KEY, LEGACY_BAG_KEY, null].includes(event.key)) sync(); });
 window.addEventListener('pageshow', sync);
 document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
 window.addEventListener('pagehide', event => { if (!event.persisted) unsubscribe?.(); });
 void load();
}
