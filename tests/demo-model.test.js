import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialDemoState, createDemoStore, applyDemoAction, priceDemoBag, allowedNextStatuses, demoMetrics, validateDemoState, dayKey, DEMO_KEY } from '../public/shared/demo-model.js';

const catalogue = JSON.parse(readFileSync(new URL('../public/menu.json', import.meta.url), 'utf8'));
const fixed = new Date('2030-01-10T07:00:00Z');
const initial = () => initialDemoState(catalogue, fixed);
const selection = extra => ({ id: 'masala-dosa', quantity: 1, variant: 'ghee-roast', spice: 'mild', addons: ['extra-sambar'], ...extra });
function fixture() {
 const data = new Map();
 const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
 return { data, storage, store: createDemoStore({ catalogue, storage, now: () => fixed }) };
}

test('demo starts with the full 50-dish catalogue, eight categories and predictable fictional records', () => {
 const state = initial();
 assert.equal(state.menu.length, 50); assert.equal(state.categories.length, 8); assert.equal(state.orders.length, 6);
 assert.deepEqual(state.orders.map(order => order.reference), ['BB-DEMO-1001', 'BB-DEMO-1002', 'BB-DEMO-1003', 'BB-DEMO-1004', 'BB-DEMO-1005', 'BB-DEMO-1006']);
 assert.ok(state.orders.every(order => order.guest === 'Demo guest'));
 assert.equal(validateDemoState(state), state);
 assert.equal(catalogue.items.some(item => Object.hasOwn(item, 'available')), false);
});

test('demo checkout recalculates portions, add-ons and delivery charges from the current catalogue', () => {
 const bill = priceDemoBag(initial(), { items: [selection({ quantity: 2, unitPrice: 1 })], fulfilment: 'delivery', total: 1 });
 assert.equal(bill.subtotal, 32000); assert.equal(bill.deliveryFee, 4000); assert.equal(bill.total, 36000);
 assert.equal(priceDemoBag(initial(), { items: [selection({ quantity: 4 })], fulfilment: 'delivery' }).deliveryFee, 0);
});

test('unavailable dishes, bad quantities and invalid customisations cannot create demo tickets', () => {
 const state = initial();
 for (const item of [selection({ quantity: 0 }), selection({ quantity: 11 }), selection({ variant: 'free' }), selection({ addons: ['unknown'] }), selection({ addons: ['extra-sambar', 'extra-sambar'] }), selection({ spice: 'extreme' })]) {
  assert.throws(() => priceDemoBag(state, { items: [item], fulfilment: 'pickup' }));
 }
 assert.throws(() => priceDemoBag(state, { items: [selection(), selection()], fulfilment: 'pickup' }), /identical/);
 state.menu.find(item => item.id === 'masala-dosa').available = false;
 assert.throws(() => priceDemoBag(state, { items: [selection()], fulfilment: 'pickup' }), /unavailable/);
 assert.equal(state.orders.length, 6);
});

test('placement stores only fictional identity and allowed item snapshots, discarding supplied contact and totals', () => {
 const { state, result } = applyDemoAction(initial(), { type: 'order.place', fulfilment: 'pickup', items: [selection()], name: 'Private Person', email: 'private@example.com', phone: '9000000000', address: 'Private street', total: 1 }, fixed);
 assert.equal(result.reference, 'BB-DEMO-1007'); assert.equal(result.total, 16000); assert.equal(result.guest, 'Demo guest');
 assert.equal(state.orders.length, 7);
 const saved = JSON.stringify(state); for (const value of ['Private Person', 'private@example.com', '9000000000', 'Private street']) assert.ok(!saved.includes(value));
 assert.equal(validateDemoState(state), state);
});

test('kitchen progresses through Received, Preparing, Ready and Collected with no skipped or reverse steps', () => {
 let state = initial();
 assert.throws(() => applyDemoAction(state, { type: 'order.transition', reference: 'BB-DEMO-1001', status: 'ready', role: 'kitchen' }, fixed), /Cannot change/);
 for (const status of ['preparing', 'ready', 'collected']) {
  state = applyDemoAction(state, { type: 'order.transition', reference: 'BB-DEMO-1001', status, role: 'kitchen' }, fixed).state;
  assert.equal(state.orders.find(order => order.reference === 'BB-DEMO-1001').status, status);
 }
 assert.throws(() => applyDemoAction(state, { type: 'order.transition', reference: 'BB-DEMO-1001', status: 'received', role: 'admin' }, fixed), /Cannot change/);
 assert.equal(state.orders.find(order => order.reference === 'BB-DEMO-1001').timeline.length, 4);
});

test('cancellation rules distinguish customer-owned tickets, kitchen progress and admin intervention', () => {
 assert.deepEqual(allowedNextStatuses('received', 'customer'), ['cancelled']);
 assert.deepEqual(allowedNextStatuses('preparing', 'customer'), []);
 assert.deepEqual(allowedNextStatuses('preparing', 'admin'), ['ready', 'cancelled']);
 assert.deepEqual(allowedNextStatuses('ready', 'admin'), ['collected']);
 assert.deepEqual(allowedNextStatuses('collected', 'kitchen'), []);
 assert.deepEqual(allowedNextStatuses('received', 'unknown'), []);
 assert.throws(() => applyDemoAction(initial(), { type: 'order.transition', reference: 'BB-DEMO-1001', status: 'cancelled', role: 'customer' }, fixed), /your own/);
 let { state, result } = applyDemoAction(initial(), { type: 'order.place', fulfilment: 'pickup', items: [selection()] }, fixed);
 state = applyDemoAction(state, { type: 'order.transition', reference: result.reference, status: 'cancelled', role: 'customer' }, fixed).state;
 assert.equal(state.orders[0].status, 'cancelled');
 assert.throws(() => applyDemoAction(state, { type: 'order.transition', reference: result.reference, status: 'preparing', role: 'kitchen' }, fixed), /Cannot change/);
});

test('demo menu edits preserve historical order snapshots and do not mutate the sample catalogue', () => {
 const state = initial(), previousPrice = state.orders[0].items[0].unitPrice;
 const item = state.menu.find(item => item.id === 'masala-dosa');
 const updated = applyDemoAction(state, { type: 'menu.save', id: item.id, fields: { ...item, price: 17550, name: 'Edited demo dosa', category: 'north-indian' } }, fixed).state;
 assert.equal(updated.menu.find(item => item.id === 'masala-dosa').price, 17550);
 assert.equal(updated.orders[0].items[0].unitPrice, previousPrice); assert.equal(updated.orders[0].items[0].name, 'Bangalore Masala Dosa');
 assert.equal(catalogue.items.find(item => item.id === 'masala-dosa').price, 12000);
 assert.equal(priceDemoBag(updated, { items: [{ id: 'masala-dosa', quantity: 1 }], fulfilment: 'pickup' }).total, 17550);
});

test('demo additions, availability, archiving and restoration share one catalogue', () => {
 const source = initial().menu[0];
 let { state, result } = applyDemoAction(initial(), { type: 'menu.save', fields: { ...source, name: 'Demonstration lemon rice', price: 15525 } }, fixed);
 assert.equal(state.menu.length, 51); assert.match(result.id, /^demo-dish-/);
 state = applyDemoAction(state, { type: 'menu.availability', id: result.id, value: false, role: 'kitchen' }, fixed).state;
 assert.throws(() => priceDemoBag(state, { items: [{ id: result.id, quantity: 1 }], fulfilment: 'pickup' }), /unavailable/);
 state = applyDemoAction(state, { type: 'menu.archive', id: result.id, value: true }, fixed).state;
 assert.throws(() => applyDemoAction(state, { type: 'menu.availability', id: result.id, value: true }, fixed), /Restore/);
 state = applyDemoAction(state, { type: 'menu.archive', id: result.id, value: false }, fixed).state;
 assert.equal(priceDemoBag(state, { items: [{ id: result.id, quantity: 1 }], fulfilment: 'pickup' }).total, 15525);
});

test('invalid demo menu fields cannot replace the active menu or its licensed images', () => {
 const state = initial(), source = state.menu[0];
 for (const fields of [{ price: -10 }, { price: 10.5 }, { category: 'unknown' }, { image: 'https://tracker.example/image.jpg' }, { image: '/assets/images/../../secret.jpg' }, { prepMinutes: 0 }]) {
  assert.throws(() => applyDemoAction(state, { type: 'menu.save', id: source.id, fields: { ...source, ...fields } }, fixed));
 }
 assert.equal(state.menu[0].price, 12000);
});

test('metrics and Bangalore daily reports derive from the same orders, excluding cancelled sales', () => {
 const metrics = demoMetrics(initial(), fixed);
 assert.equal(metrics.totalOrders, 6); assert.equal(metrics.counts.preparing, 1); assert.equal(metrics.counts.collected, 2);
 assert.equal(metrics.sales, 79000); assert.equal(metrics.available, 50);
 assert.equal(metrics.days.reduce((sum, day) => sum + day.orders, 0), 6);
 assert.equal(metrics.days.reduce((sum, day) => sum + day.sales, 0), metrics.sales);
 assert.ok(!metrics.popular.some(item => item.id === 'margherita'));
 assert.equal(dayKey('2030-01-10T20:00:00Z'), '2030-01-11');
});

test('paused demo kitchen rejects new orders while allowing preparation of existing tickets', () => {
 const paused = applyDemoAction(initial(), { type: 'settings.save', acceptingOrders: false, prepMinutes: 40 }, fixed).state;
 assert.throws(() => applyDemoAction(paused, { type: 'order.place', fulfilment: 'pickup', items: [selection()] }, fixed), /paused/);
 assert.equal(applyDemoAction(paused, { type: 'order.transition', reference: 'BB-DEMO-1001', status: 'preparing', role: 'kitchen' }, fixed).result.status, 'preparing');
});

test('two demo adapters read persisted shared state and generate distinct sequential references', async () => {
 const { storage, store } = fixture(), other = createDemoStore({ catalogue, storage, now: () => fixed });
 const first = await store.dispatch({ type: 'order.place', fulfilment: 'pickup', items: [selection()] });
 const second = await other.dispatch({ type: 'order.place', fulfilment: 'pickup', items: [selection()] });
 assert.notEqual(first.reference, second.reference); assert.equal(store.read().orders.length, 8);
 await other.dispatch({ type: 'order.transition', reference: first.reference, status: 'preparing', role: 'kitchen' });
 assert.equal(store.read().orders.find(order => order.reference === first.reference).status, 'preparing');
});

test('failed browser persistence never confirms a demo order or changes the saved dataset', async () => {
 const { storage, store } = fixture(), before = store.read();
 storage.setItem = () => { throw new Error('Quota exceeded'); };
 await assert.rejects(store.dispatch({ type: 'order.place', fulfilment: 'pickup', items: [selection()] }), /could not be saved/);
 assert.deepEqual(store.read(), before);
});

test('reset restores fictional data and leaves other browser namespaces untouched', async () => {
 const { data, store } = fixture(); data.set('bitesbro.food-bag.v2', 'retained bag'); data.set('unrelated', 'retained value');
 await store.dispatch({ type: 'menu.archive', id: 'masala-dosa', value: true });
 await store.dispatch({ type: 'order.place', fulfilment: 'pickup', items: [{ id: 'samosa', quantity: 1 }] });
 await store.reset(); assert.equal(store.read().orders.length, 6); assert.equal(store.read().menu.length, 50);
 assert.equal(store.read().menu[0].available, true); assert.equal(data.get('bitesbro.food-bag.v2'), 'retained bag'); assert.equal(data.get('unrelated'), 'retained value');
});

test('damaged or contact-bearing persisted demo data produces a recoverable error', () => {
 const { data, storage } = fixture(); data.set(DEMO_KEY, '{');
 assert.throws(() => createDemoStore({ catalogue, storage }), /Reset the demo/);
 const state = initial(); state.orders[0].email = 'must-not-be-stored@example.com'; data.set(DEMO_KEY, JSON.stringify(state));
 assert.throws(() => createDemoStore({ catalogue, storage }), /Reset the demo/);
});
