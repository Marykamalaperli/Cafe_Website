// Fictional browser demonstration only. Never an authority for live orders.
export const DEMO_KEY = 'bitesbro.demo.v1';
export const STATUSES = ['received', 'preparing', 'ready', 'collected', 'cancelled'];
export const STATUS_LABELS = { received: 'Received', preparing: 'Preparing', ready: 'Ready', collected: 'Collected', cancelled: 'Cancelled' };
export const INSTRUCTIONS = { standard: 'Standard preparation', mild: 'Please keep the heat mild', separate: 'Pack chutneys separately', cutlery: 'No cutlery, please' };
export const DEMO_BUSINESS = { name: 'BitesBro', city: 'Bangalore', timezone: 'Asia/Kolkata', hours: '10am–3pm & 6pm–11pm', deliveryFee: 4000, freeDeliveryFrom: 49900 };
const clone = value => structuredClone(value);
const require = (condition, message) => { if (!condition) throw new Error(message); };
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const shortText = (value, min = 1, max = 120) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max && !/[\u0000-\u001f]/.test(value);
const money = value => integer(value, 0, 50000000);
const photoPath = value => typeof value === 'string' && /^\/assets\/images\/(?:photos\/)?[a-z0-9-]+\.(?:jpg|jpeg|svg|webp)$/.test(value);
const iso = value => new Date(value).toISOString();
export const dayKey = value => new Intl.DateTimeFormat('en-CA', { timeZone: DEMO_BUSINESS.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));

function validateItem(item, categories) {
 require(shortText(item.id) && /^[a-z0-9-]+$/.test(item.id), 'Invalid dish identifier.');
 require(shortText(item.name, 2, 80) && shortText(item.description, 5, 400), 'Use a dish name and a short description.');
 require(integer(item.price, 1, 500000) && categories.some(category => category.id === item.category), 'Choose a valid price and category.');
 require(['veg', 'vegan', 'non-veg'].includes(item.diet) && photoPath(item.image), 'Choose a diet and an existing licensed photograph.');
 require(integer(item.prepMinutes, 1, 180), 'Preparation time must be 1–180 minutes.');
 require(['none', 'mild', 'medium', 'hot'].includes(item.spice), 'Choose a valid spice preference.');
 for (const field of ['ingredients', 'allergens']) require(Array.isArray(item[field]) && item[field].length <= 30 && item[field].every(value => shortText(value, 1, 80)), 'Keep ingredient and allergen lists short.');
 require(Array.isArray(item.variants) && item.variants.length > 0 && item.variants.length <= 10, 'At least one portion is required.');
 require(Array.isArray(item.addons) && item.addons.length <= 20, 'Invalid add-on choices.');
 for (const options of [item.variants, item.addons]) {
  require(new Set(options.map(option => option.id)).size === options.length, 'Duplicate portion or add-on identifier.');
  require(options.every(option => shortText(option.id) && shortText(option.label) && integer(option.price, 0, 500000)), 'Invalid portion or add-on price.');
 }
 return item;
}

export function priceDemoBag(state, input) {
 require(Array.isArray(input.items) && input.items.length > 0 && input.items.length <= 30, 'Add at least one dish to your bag.');
 require(['pickup', 'delivery'].includes(input.fulfilment), 'Choose pickup or demonstration delivery.');
 const keys = new Set();
 const items = input.items.map(selection => {
  const item = state.menu.find(dish => dish.id === selection.id && dish.available && !dish.archived);
  require(item, 'A dish in your bag is unavailable. Please update your bag.');
  require(integer(selection.quantity, 1, 10), 'Use a quantity between 1 and 10 for each dish.');
  const variant = item.variants.find(option => option.id === (selection.variant || item.variants[0].id));
  require(variant, 'That portion is no longer available.');
  const spice = selection.spice || item.spice;
  require((item.spice === 'none' ? ['none'] : ['mild', 'medium', 'hot']).includes(spice), 'Choose an available spice level.');
  const choices = selection.addons || [];
  require(Array.isArray(choices) && choices.length <= 20 && choices.every(choice => typeof choice === 'string') && new Set(choices).size === choices.length, 'Choose each add-on once.');
  const addons = choices.map(id => { const option = item.addons.find(addon => addon.id === id); require(option, 'An add-on is no longer available.'); return clone(option); });
  const key = JSON.stringify([item.id, variant.id, spice, [...choices].sort()]);
  require(!keys.has(key), 'Combine identical customised dishes into one bag line.'); keys.add(key);
  return { id: item.id, name: item.name, category: item.category, image: item.image, quantity: selection.quantity,
   unitPrice: item.price + variant.price + addons.reduce((sum, option) => sum + option.price, 0),
   options: { variant: clone(variant), spice, addons } };
 });
 require(items.reduce((sum, item) => sum + item.quantity, 0) <= 30, 'Please limit the bag to 30 items.');
 const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
 const deliveryFee = input.fulfilment === 'delivery' && subtotal < DEMO_BUSINESS.freeDeliveryFrom ? DEMO_BUSINESS.deliveryFee : 0;
 return { items, subtotal, deliveryFee, total: subtotal + deliveryFee };
}

function makeOrder(state, selections, { reference, fulfilment = 'pickup', instruction = 'standard', origin = 'customer', createdAt, status = 'received' }) {
 require(Object.hasOwn(INSTRUCTIONS, instruction), 'Choose one of the fictional preparation notes.');
 const bill = priceDemoBag(state, { items: selections, fulfilment });
 const sequence = ['received', 'preparing', 'ready', 'collected'];
 const progress = status === 'cancelled' ? ['received', 'cancelled'] : sequence.slice(0, sequence.indexOf(status) + 1);
 return { reference, origin, guest: 'Demo guest', fulfilment, instruction, createdAt, status, ...bill,
  timeline: progress.map((value, index) => ({ status: value, at: iso(new Date(createdAt).valueOf() + index * 60000) })) };
}

export function initialDemoState(catalogue, now = new Date()) {
 require(Array.isArray(catalogue.items) && catalogue.items.length >= 1 && Array.isArray(catalogue.categories), 'The sample menu could not load.');
 const state = { version: 1, revision: 0, updatedAt: iso(now), nextOrder: 1007, nextItem: 1,
  categories: clone(catalogue.categories), menu: catalogue.items.map(item => ({ ...clone(item), available: true, archived: false })),
  orders: [], activity: [], settings: { acceptingOrders: true, prepMinutes: 25 } };
 state.menu.forEach(item => validateItem(item, state.categories));
 const specifications = [
  ['received', 5, [['masala-dosa', 2], ['filter-coffee', 1]], 'mild'],
  ['preparing', 14, [['veg-biryani', 1], ['samosa', 1]], 'separate'],
  ['ready', 28, [['paneer-butter-masala', 1], ['garlic-naan', 2]], 'standard'],
  ['collected', 90, [['idli-sambar', 2], ['filter-coffee', 1]], 'cutlery'],
  ['collected', 1440, [['hyderabadi-biryani', 2]], 'standard'],
  ['cancelled', 2880, [['margherita', 1]], 'standard']
 ];
 specifications.forEach(([status, minutes, rows, instruction], index) => {
  const selections = rows.filter(([id]) => state.menu.some(item => item.id === id)).map(([id, quantity]) => ({ id, quantity }));
  if (!selections.length) return;
  const createdAt = iso(new Date(now).valueOf() - minutes * 60000);
  state.orders.push(makeOrder(state, selections, { reference: `BB-DEMO-${1001 + index}`, origin: 'sample', createdAt, status, instruction }));
 });
 state.activity = state.orders.map(order => ({ at: order.createdAt, kind: 'order', text: `${order.reference} · ${STATUS_LABELS[order.status]}`, role: 'sample' }));
 return state;
}

export function allowedNextStatuses(status, role = 'kitchen') {
 const next = { received: 'preparing', preparing: 'ready', ready: 'collected' }[status];
 if (role === 'customer') return status === 'received' ? ['cancelled'] : [];
 if (role === 'kitchen') return next ? [next] : [];
 if (role === 'admin') return [...(next ? [next] : []), ...(['received', 'preparing'].includes(status) ? ['cancelled'] : [])];
 return [];
}

export function applyDemoAction(current, action, now = new Date()) {
 const state = clone(current), at = iso(now);
 let result, activity;
 if (action.type === 'order.place') {
  require(state.settings.acceptingOrders, 'The demonstration kitchen is paused. Resume it in Administrator settings.');
  require(state.orders.length < 250, 'The demo has reached 250 orders. Reset it to start a new session.');
  // Deliberately construct a snapshot from allowed fields. Never copy contact or address fields.
  result = makeOrder(state, action.items, { reference: `BB-DEMO-${state.nextOrder++}`, fulfilment: action.fulfilment, instruction: action.instruction || 'standard', createdAt: at });
  state.orders.unshift(result); activity = { kind: 'order', text: `${result.reference} received`, role: 'customer' };
 } else if (action.type === 'order.transition') {
  const order = state.orders.find(order => order.reference === action.reference);
  require(order, 'That demonstration order no longer exists.');
  require(allowedNextStatuses(order.status, action.role).includes(action.status), `Cannot change ${STATUS_LABELS[order.status]} to ${STATUS_LABELS[action.status] || action.status}.`);
  require(action.role !== 'customer' || order.origin === 'customer', 'Only your own demonstration order can be cancelled here.');
  order.status = action.status; order.timeline.push({ status: action.status, at }); result = order;
  activity = { kind: 'order', text: `${order.reference} · ${STATUS_LABELS[action.status]}`, role: action.role };
 } else if (action.type === 'menu.save') {
  const previous = action.id ? state.menu.find(item => item.id === action.id) : null;
  require(!action.id || previous, 'That dish no longer exists.');
  require(previous || state.menu.length < 200, 'The demo menu is limited to 200 dishes.');
  const photoItem = state.menu.find(item => item.image === action.fields.image && item.photo);
  require(photoItem, 'Choose an existing credited food photograph.');
  const item = previous ? clone(previous) : { id: `demo-dish-${state.nextItem++}`, portion: '1 serving', spice: 'medium', variants: [{ id: 'regular', label: 'Regular serving', price: 0 }], addons: [], badge: 'Demo addition', available: true, archived: false };
  for (const key of ['name', 'description', 'price', 'category', 'diet', 'prepMinutes', 'ingredients', 'allergens', 'image']) if (Object.hasOwn(action.fields, key)) item[key] = typeof action.fields[key] === 'string' ? action.fields[key].trim() : clone(action.fields[key]);
  item.photo = clone(photoItem.photo);
  if (!previous || previous.image !== item.image) item.photo.reference = 'Representative food photograph';
  item.cuisine = state.categories.find(category => category.id === item.category)?.name;
  item.dietary = [item.diet === 'non-veg' ? 'Non-vegetarian' : item.diet === 'vegan' ? 'Plant based' : 'Vegetarian'];
  validateItem(item, state.categories);
  if (previous) state.menu[state.menu.findIndex(dish => dish.id === item.id)] = item; else state.menu.push(item);
  result = item; activity = { kind: 'menu', text: `${item.name} ${previous ? 'updated' : 'added'}`, role: 'admin' };
 } else if (action.type === 'menu.availability' || action.type === 'menu.archive') {
  const item = state.menu.find(item => item.id === action.id); require(item, 'That dish no longer exists.');
  require(typeof action.value === 'boolean', 'Choose an availability setting.');
  if (action.type === 'menu.archive') { item.archived = action.value; item.available = !action.value; }
  else { require(!item.archived, 'Restore an archived dish before making it available.'); item.available = action.value; }
  result = item; activity = { kind: 'menu', text: `${item.name} · ${item.archived ? 'archived' : item.available ? 'available' : 'unavailable'}`, role: action.role === 'kitchen' ? 'kitchen' : 'admin' };
 } else if (action.type === 'settings.save') {
  require(typeof action.acceptingOrders === 'boolean' && integer(action.prepMinutes, 5, 120), 'Use a preparation estimate between 5 and 120 minutes.');
  state.settings = { acceptingOrders: action.acceptingOrders, prepMinutes: action.prepMinutes }; result = state.settings;
  activity = { kind: 'settings', text: `Demo kitchen ${action.acceptingOrders ? 'resumed' : 'paused'} · ${action.prepMinutes} min estimate`, role: 'admin' };
 } else throw new Error('Unknown demonstration operation.');
 state.revision++; state.updatedAt = at;
 state.activity = [{ at, ...activity }, ...state.activity].slice(0, 100);
 return { state, result: clone(result) };
}

export function demoMetrics(state, now = new Date()) {
 const counts = Object.fromEntries(STATUSES.map(status => [status, state.orders.filter(order => order.status === status).length]));
 const collected = state.orders.filter(order => order.status === 'collected');
 const sales = collected.reduce((sum, order) => sum + order.total, 0);
 const popular = new Map();
 for (const order of state.orders.filter(order => order.status !== 'cancelled')) for (const item of order.items) {
  const row = popular.get(item.id) || { id: item.id, name: item.name, quantity: 0 }; row.quantity += item.quantity; popular.set(item.id, row);
 }
 const days = Array.from({ length: 7 }, (_, index) => {
  const date = dayKey(new Date(new Date(now).valueOf() - (6 - index) * 86400000));
  const orders = state.orders.filter(order => dayKey(order.createdAt) === date);
  return { date, orders: orders.length, collected: orders.filter(order => order.status === 'collected').length,
   sales: orders.filter(order => order.status === 'collected').reduce((sum, order) => sum + order.total, 0) };
 });
 return { totalOrders: state.orders.length, counts, sales, average: collected.length ? Math.round(sales / collected.length) : 0,
  available: state.menu.filter(item => item.available && !item.archived).length,
  popular: [...popular.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)), days };
}

// Read only this application's fictional namespace, and fail visibly on damaged data.
export function validateDemoState(state) {
 require(state?.version === 1 && integer(state.revision, 0, Number.MAX_SAFE_INTEGER), 'Saved demo data is incompatible. Reset the demo to start again.');
 require(integer(state.nextOrder, 1007, 1000000) && integer(state.nextItem, 1, 1000000), 'Saved demo counters are invalid.');
 require(Array.isArray(state.categories) && state.categories.length === 8 && state.categories.every(category => shortText(category.id) && shortText(category.name)), 'Saved demo categories are invalid.');
 require(Array.isArray(state.menu) && state.menu.length > 0 && state.menu.length <= 200 && new Set(state.menu.map(item => item.id)).size === state.menu.length, 'Saved demo menu is invalid.');
 state.menu.forEach(item => { validateItem(item, state.categories); require(typeof item.available === 'boolean' && typeof item.archived === 'boolean', 'Invalid saved availability.'); });
 require(Array.isArray(state.orders) && state.orders.length <= 250 && new Set(state.orders.map(order => order.reference)).size === state.orders.length, 'Saved demo orders are invalid.');
 for (const order of state.orders) {
  require(/^BB-DEMO-\d+$/.test(order.reference) && order.guest === 'Demo guest' && ['sample', 'customer'].includes(order.origin), 'Invalid fictional order identity.');
  require(STATUSES.includes(order.status) && ['pickup', 'delivery'].includes(order.fulfilment) && Object.hasOwn(INSTRUCTIONS, order.instruction), 'Invalid saved order status.');
  require(Number.isFinite(Date.parse(order.createdAt)) && Array.isArray(order.timeline) && order.timeline.length > 0 && order.timeline.length <= 5 && order.timeline.every(event => STATUSES.includes(event.status) && Number.isFinite(Date.parse(event.at))), 'Invalid saved timeline.');
  require(Array.isArray(order.items) && order.items.length > 0 && order.items.length <= 30, 'Invalid saved order items.');
  for (const item of order.items) require(shortText(item.name) && shortText(item.id) && integer(item.quantity, 1, 10) && integer(item.unitPrice, 1, 1000000) && photoPath(item.image) && shortText(item.options?.variant?.label) && ['none', 'mild', 'medium', 'hot'].includes(item.options.spice) && Array.isArray(item.options.addons) && item.options.addons.every(option => shortText(option.label) && money(option.price)), 'Invalid saved dish snapshot.');
  require(money(order.subtotal) && money(order.deliveryFee) && order.total === order.subtotal + order.deliveryFee && order.subtotal === order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), 'Invalid saved order totals.');
 }
 require(Array.isArray(state.activity) && state.activity.length <= 100 && state.activity.every(event => shortText(event.text, 1, 200) && Number.isFinite(Date.parse(event.at))), 'Invalid saved activity.');
 require(typeof state.settings?.acceptingOrders === 'boolean' && integer(state.settings.prepMinutes, 5, 120), 'Invalid demo settings.');
 function noContacts(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
   require(!/^(email|phone|address|postcode|customerName|payment|cardNumber|contact)$/i.test(key), 'Contact or payment data does not belong in the demonstration store.');
   noContacts(child);
  }
 }
 noContacts(state);
 return state;
}

export function createDemoStore({ catalogue, storage, now = () => new Date(), withLock = operation => operation() }) {
 const listeners = new Set();
 const read = () => {
  let raw;
  try { raw = storage.getItem(DEMO_KEY); } catch { throw new Error('Browser storage is unavailable. Enable site storage to connect the three demo views.'); }
  if (!raw) return initialDemoState(catalogue, now());
  try { require(raw.length < 2500000, 'Demo storage is too large.'); return validateDemoState(JSON.parse(raw)); }
  catch { throw new Error('Saved demo data could not be read. Reset the demo to start again.'); }
 };
 const persist = state => {
  try { storage.setItem(DEMO_KEY, JSON.stringify(state)); }
  catch { throw new Error('Demo changes could not be saved. Free some browser storage and try again.'); }
 };
 if (!storage.getItem(DEMO_KEY)) persist(initialDemoState(catalogue, now())); else read();
 const emit = () => { for (const listener of listeners) listener(); };
 return {
  read: () => clone(read()),
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  notify: emit,
  dispatch(action) { return withLock(async () => { const update = applyDemoAction(read(), action, now()); persist(update.state); emit(); return update.result; }); },
  reset() { return withLock(async () => { const state = initialDemoState(catalogue, now()); persist(state); emit(); return clone(state); }); }
 };
}
