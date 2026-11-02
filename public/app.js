const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = paise => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icon = name => `<svg class="icon" aria-hidden="true"><use href="/assets/icons.svg#${name}"/></svg>`;
const state = { menu: [], filtered: [], category: 'all', search: '', cart: [], cafe: null };
const CART_KEY = 'bitesbro.bag.v1';
let menuRequest;
let toastTimer;

async function request(path, options = {}) {
  const response = await fetch(path, { ...options, signal: options.signal || AbortSignal.timeout(12000), headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  let data;
  try { data = await response.json(); } catch { throw new Error('We couldn’t read the server response. Please try again.'); }
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.fields = data.fields;
    throw error;
  }
  return data;
}

function notify(message, error = false) {
  const toast = $('#toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('visible');
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
}

function readCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    const seen = new Set();
    let total = 0;
    return saved.filter(item => {
      if (!item || typeof item.id !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10 || seen.has(item.id) || !state.menu.some(menu => menu.id === item.id) || total + item.quantity > 30) return false;
      seen.add(item.id);
      total += item.quantity;
      return true;
    }).map(({ id, quantity }) => ({ id, quantity }));
  } catch { return []; }
}

function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); } catch { /* The bag still works in memory when storage is disabled. */ }
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  $('#bag-count').textContent = count;
  $('#open-cart').setAttribute('aria-label', `Open bag, ${count} ${count === 1 ? 'item' : 'items'}`);
  $('#mobile-bag').hidden = !count;
  $('#mobile-bag-count').textContent = `${count} ${count === 1 ? 'little treat' : 'little treats'}`;
  $('#mobile-bag-total').textContent = money(state.cart.reduce((sum, line) => sum + (state.menu.find(item => item.id === line.id)?.price || 0) * line.quantity, 0));
  document.body.classList.toggle('has-items', count > 0);
}

function renderSignature() {
  const item = state.menu.find(item => item.id === 'iced-brown-sugar');
  $('#signature').hidden = !item;
  if (!item) return;
  $('#signature-name').textContent = item.name;
  $('#signature-description').textContent = item.description;
  $('#signature-price').textContent = money(item.price);
  $('#signature-add').disabled = false;
  $('#signature-add').setAttribute('aria-label', `Treat yourself to ${item.name}`);
}

function renderMenu() {
  const filtered = state.filtered.filter(item => `${item.name} ${item.description} ${item.dietary.join(' ')}`.toLowerCase().includes(state.search));
  $('#menu-status').textContent = '';
  $('#menu-grid').setAttribute('aria-busy', 'false');
  $('#menu-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'favourite' : 'favourites'} to fall for`;
  $('#menu-grid').innerHTML = filtered.length ? filtered.map((item, index) => `
    <article class="menu-card" data-kind="${escape(item.category)}">
      <div class="menu-card-image"><img src="${escape(item.image)}" alt="Illustration of ${escape(item.name)}" width="600" height="480" loading="lazy">${item.badge ? `<span class="menu-badge">${escape(item.badge)}</span>` : ''}</div>
      <div class="menu-card-body"><div class="menu-card-kicker"><span>${escape(item.category === 'bakes' ? 'From the oven' : item.category === 'bites' ? 'A good bite' : 'A little sip')}</span><span aria-hidden="true">${String(index + 1).padStart(2, '0')}</span></div><h3>${escape(item.name)}</h3><p class="menu-card-description">${escape(item.description)}</p><div class="menu-card-meta"><span class="menu-price">${money(item.price)}<span class="dietary-indicator" role="img" aria-label="${escape(item.dietary.join(', '))}" title="${escape(item.dietary.join(', '))}"></span></span><button class="add-button" data-add="${escape(item.id)}" aria-label="Add ${escape(item.name)} to bag">Add <span aria-hidden="true">+</span></button></div></div>
    </article>`).join('') : `<div class="empty-state">${icon('search')}<h3>No bites found. Yet.</h3><p>Try another craving, or have a look at all the good stuff.</p><button class="button button-outline" id="reset-menu">Show the whole menu</button></div>`;
}

async function loadMenu(category = 'all', firstLoad = false) {
  menuRequest?.abort();
  menuRequest = new AbortController();
  const controller = menuRequest;
  $('#menu-grid').setAttribute('aria-busy', 'true');
  $('#menu-status').textContent = 'A fresh look at the good stuff…';
  try {
    // A recovered first load still needs the full catalogue for bag prices,
    // even if the visitor selected a category while the initial request failed.
    const fetchCategory = firstLoad ? 'all' : category;
    const { items } = await request(`/api/menu?category=${encodeURIComponent(fetchCategory)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
    if (controller.signal.aborted) return;
    if (firstLoad || category === 'all') state.menu = items;
    state.filtered = category === 'all' ? items : items.filter(item => item.category === category);
    renderMenu();
    renderSignature();
    if (firstLoad) { state.cart = readCart(); saveCart(); }
  } catch (error) {
    if (controller.signal.aborted) return;
    $('#menu-grid').setAttribute('aria-busy', 'false');
    $('#menu-status').textContent = '';
    $('#menu-count').textContent = '';
    $('#menu-grid').innerHTML = `<div class="empty-state"><h3>A little brewing delay.</h3><p>We couldn’t load the menu. Check your connection and give us another go.</p><button class="button button-outline retry-button" id="retry-menu">Try again</button></div>`;
  }
}

function setCategory(category) {
  state.category = category;
  $$('.menu-tab').forEach(button => {
    const active = button.dataset.category === category;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  loadMenu(category, state.menu.length === 0);
}

$$('.menu-tab').forEach(button => button.addEventListener('click', () => setCategory(button.dataset.category)));
$('#menu-search').addEventListener('input', event => { state.search = event.target.value.trim().toLowerCase(); renderMenu(); });
function addItem(id) {
    const item = state.menu.find(item => item.id === id);
    if (!item) return notify('Please reload the menu first.', true);
    const existing = state.cart.find(item => item.id === id);
    if ((existing?.quantity || 0) >= 10 || state.cart.reduce((sum, item) => sum + item.quantity, 0) >= 30) return notify('A little full! Maximum 10 of each item, 30 in your bag.', true);
    if (existing) existing.quantity++;
    else state.cart.push({ id, quantity: 1 });
    saveCart();
    notify(`${item.name} added. A good choice.`);
}
$('#signature-add').addEventListener('click', () => addItem('iced-brown-sugar'));
$('#menu-grid').addEventListener('click', event => {
  const add = event.target.closest('[data-add]');
  if (add) addItem(add.dataset.add);
  if (event.target.closest('#reset-menu')) { $('#menu-search').value = ''; state.search = ''; setCategory('all'); }
  if (event.target.closest('#retry-menu')) loadMenu(state.category, state.menu.length === 0);
});

function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
  document.body.classList.add('dialog-open');
}
document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-dialog]');
  if (trigger) openDialog(document.getElementById(trigger.dataset.dialog));
  const close = event.target.closest('.close-dialog');
  if (close) close.closest('dialog').close();
});
$$('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (!$$('dialog[open]').length) document.body.classList.remove('dialog-open');
  });
});

function renderCart() {
  const items = state.cart.map(line => ({ ...state.menu.find(item => item.id === line.id), quantity: line.quantity }));
  $('#cart-checkout').hidden = !items.length;
  if (!items.length) {
    $('#cart-content').innerHTML = `<div class="cart-empty"><svg aria-hidden="true"><use href="/assets/icons.svg#cup"/></svg><h3>A little room for a treat.</h3><p>Your bag is taking a coffee break.<br>Let’s fill it with something good.</p><button class="button button-orange" id="browse-menu">Find your favourite ${icon('arrow')}</button></div>`;
    return;
  }
  $('#cart-content').innerHTML = items.map(item => `<div class="cart-item"><img class="cart-item-image" src="${escape(item.image)}" alt="" width="72" height="72"><div><h3>${escape(item.name)}</h3><p class="cart-item-price">${money(item.price * item.quantity)}</p><div class="quantity-control" aria-label="Quantity for ${escape(item.name)}"><button data-quantity="${escape(item.id)}" data-delta="-1" aria-label="Remove one ${escape(item.name)}">−</button><span>${item.quantity}</span><button data-quantity="${escape(item.id)}" data-delta="1" aria-label="Add one ${escape(item.name)}">+</button></div></div><button class="remove-item" data-remove="${escape(item.id)}" aria-label="Remove ${escape(item.name)} from bag">×</button></div>`).join('');
  $('#cart-total').textContent = money(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
}

$('#open-cart').addEventListener('click', () => { renderCart(); openDialog($('#cart-dialog')); });
$('#mobile-bag').addEventListener('click', () => { renderCart(); openDialog($('#cart-dialog')); });
$('#cart-content').addEventListener('click', event => {
  if (event.target.closest('#browse-menu')) { $('#cart-dialog').close(); $('#menu').scrollIntoView({ behavior: 'smooth' }); return; }
  const remove = event.target.closest('[data-remove]');
  const quantity = event.target.closest('[data-quantity]');
  if (remove) state.cart = state.cart.filter(item => item.id !== remove.dataset.remove);
  if (quantity) {
    const item = state.cart.find(item => item.id === quantity.dataset.quantity);
    if (!item) return;
    const delta = Number(quantity.dataset.delta);
    if (delta > 0 && (item.quantity >= 10 || state.cart.reduce((sum, item) => sum + item.quantity, 0) >= 30)) return notify('Maximum 10 of each item, 30 in your bag.', true);
    item.quantity += delta;
    state.cart = state.cart.filter(item => item.quantity > 0);
  }
  if (remove || quantity) { saveCart(); renderCart(); }
});

function nextDate(date, days = 1) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function formatTime(time) {
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'pm' : 'am'}`;
}
const availabilityRequests = new WeakMap();
async function updateTimes(input, select, reservation) {
  availabilityRequests.get(select)?.abort();
  const controller = new AbortController();
  availabilityRequests.set(select, controller);
  select.disabled = true;
  select.replaceChildren(new Option('Checking the good times…', ''));
  if (!input.value) { select.replaceChildren(new Option('Choose your day first', '')); select.disabled = false; return; }
  try {
    const { slots } = await request(`/api/availability?date=${encodeURIComponent(input.value)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
    if (controller.signal.aborted) return;
    const guests = Number($('#reservation-guests').value);
    const available = slots.filter(slot => !slot.past && (!reservation || slot.seatsLeft >= guests));
    select.replaceChildren(new Option(available.length ? 'Choose a little time' : 'No times left · try another day', ''));
    for (const slot of available) select.add(new Option(formatTime(slot.time), slot.time));
  } catch (error) {
    if (controller.signal.aborted) return;
    select.replaceChildren(new Option('Couldn’t check times · reselect your day', ''));
    const result = $('.form-result', select.closest('form'));
    result.textContent = 'We couldn’t check available times. Please change the day to retry.';
    result.className = 'form-result error';
  } finally { if (!controller.signal.aborted) select.disabled = false; }
}

function initializeDates(form = document) {
  if (!state.cafe) return;
  for (const input of $$('input[type=date]', form)) {
    input.min = state.cafe.today;
    input.max = nextDate(state.cafe.today, state.cafe.maxAdvanceDays);
    input.value = state.cafe.slots.some(time => time > state.cafe.currentTime) ? state.cafe.today : nextDate(state.cafe.today);
    const reservation = input.id === 'reservation-date';
    updateTimes(input, reservation ? $('#reservation-time') : $('#pickup-time'), reservation);
  }
}
$('#reservation-date').addEventListener('change', () => updateTimes($('#reservation-date'), $('#reservation-time'), true));
$('#reservation-guests').addEventListener('change', () => updateTimes($('#reservation-date'), $('#reservation-time'), true));
$('#pickup-date').addEventListener('change', () => updateTimes($('#pickup-date'), $('#pickup-time'), false));

function formValues(form) {
  const values = Object.fromEntries(new FormData(form));
  values.consent = $('input[name=consent]', form).checked;
  return values;
}

function connectForm(id, path, transform = value => value, onSuccess) {
  const form = document.getElementById(id);
  form.addEventListener('input', event => { event.target.removeAttribute('aria-invalid'); event.target.classList.remove('field-invalid'); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.dataset.submitting === 'true') return;
    const submit = $('button[type=submit]', form);
    const result = $('.form-result', form);
    result.textContent = '';
    result.className = 'form-result';
    $$('[aria-invalid]', form).forEach(input => { input.removeAttribute('aria-invalid'); input.classList.remove('field-invalid'); });
    form.dataset.submitting = 'true';
    submit.disabled = true;
    const original = submit.innerHTML;
    submit.textContent = 'One little moment…';
    try {
      const data = await request(path, { method: 'POST', body: JSON.stringify(transform(formValues(form))) });
      form.reset();
      initializeDates(form);
      result.className = 'form-result success';
      result.textContent = `${data.message}${data.reference ? ` Your reference: ${data.reference}.` : ''}`;
      onSuccess?.(data);
    } catch (error) {
      result.className = 'form-result error';
      result.textContent = error.name === 'TypeError' || error.name === 'TimeoutError' ? 'We couldn’t reach the café. Check your connection and try again.' : error.message;
      for (const name of Object.keys(error.fields || {})) {
        const field = form.elements.namedItem(name);
        if (field instanceof HTMLElement) { field.setAttribute('aria-invalid', 'true'); field.classList.add('field-invalid'); }
      }
      result.tabIndex = -1;
      result.focus();
      if (path === '/api/reservations') updateTimes($('#reservation-date'), $('#reservation-time'), true);
    } finally {
      form.dataset.submitting = 'false';
      submit.disabled = false;
      submit.innerHTML = original;
    }
  });
}
connectForm('reservation-form', '/api/reservations', values => ({ ...values, guests: Number(values.guests) }));
connectForm('newsletter-form', '/api/newsletter');
connectForm('contact-form', '/api/contact');
connectForm('order-form', '/api/orders', values => ({ ...values, items: state.cart.map(({ id, quantity }) => ({ id, quantity })) }), data => {
  state.cart = [];
  saveCart();
  $('#cart-checkout').hidden = true;
  $('#cart-content').innerHTML = `<div class="cart-empty">${icon('check')}<h3>A little good, all saved.</h3><p>Your demo pickup request is in the database.<br><strong>${escape(data.reference)}</strong></p><p>${money(data.total)} · ${escape(data.date)} at ${formatTime(data.time)}<br>No payment has been taken. No email is sent.<br>Please wait for our location announcement before visiting.</p><button class="button button-orange close-dialog">Lovely, thank you ${icon('heart')}</button></div>`;
});

const navToggle = $('#nav-toggle');
function closeNav() { $('#main-nav').classList.remove('is-open'); navToggle.setAttribute('aria-expanded', 'false'); navToggle.setAttribute('aria-label', 'Open navigation'); }
navToggle.addEventListener('click', () => { const expanded = navToggle.getAttribute('aria-expanded') !== 'true'; $('#main-nav').classList.toggle('is-open', expanded); navToggle.setAttribute('aria-expanded', String(expanded)); navToggle.setAttribute('aria-label', expanded ? 'Close navigation' : 'Open navigation'); });
$$('#main-nav a').forEach(link => link.addEventListener('click', closeNav));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeNav(); });
document.addEventListener('click', event => { if (!event.target.closest('.site-header')) closeNav(); });

if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('motion-ready');
  const observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }, { threshold: .08 });
  $$('.reveal').forEach(element => observer.observe(element));
}
if ('IntersectionObserver' in window) {
  const activeSection = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      $$('#main-nav a').forEach(link => { if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); });
    }
  }, { rootMargin: '-20% 0px -55% 0px', threshold: 0 });
  $$('main section[id]').forEach(section => activeSection.observe(section));
}
$('#motion-toggle').addEventListener('click', event => {
  const paused = document.documentElement.classList.toggle('motion-paused');
  event.currentTarget.setAttribute('aria-pressed', String(paused));
  event.currentTarget.textContent = paused ? 'Resume animations' : 'Pause animations';
});
$('#year').textContent = new Date().getFullYear();
loadMenu('all', true);
request('/api/cafe').then(cafe => {
  state.cafe = cafe;
  $('#visit-address').textContent = cafe.address ? `${cafe.address}, ${cafe.city}` : `${cafe.city} · Street address coming soon.`;
  $('#visit-hours').textContent = cafe.hours;
  const contact = $('#visit-contact');
  if (cafe.email || cafe.phone) {
    contact.replaceChildren();
    for (const [value, prefix] of [[cafe.email, 'mailto:'], [cafe.phone, 'tel:']]) if (value) {
      const link = document.createElement('a');
      link.href = prefix + value;
      link.textContent = value;
      contact.append(link, document.createElement('br'));
    }
  }
  initializeDates();
}).catch(() => {
  for (const form of [$('#reservation-form'), $('#order-form')]) {
    const result = $('.form-result', form);
    result.className = 'form-result error';
    result.textContent = 'Booking times couldn’t load. Please refresh the page to try again.';
  }
});
