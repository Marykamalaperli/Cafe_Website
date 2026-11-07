import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planReorder } from '../public/shared/reorder.js';
import { normaliseBag, BAG_LIMITS } from '../public/shared/bag.js';
import { FAVOURITES_KEY, readFavourites, toggleFavourite, parseFavouriteIDs } from '../public/shared/favourites.js';
import { createArrivalTracker } from '../public/shared/kitchen-alerts.js';

const dosa = { id: 'dosa', name: 'Masala dosa', price: 13000, available: true, archived: false, spice: 'medium', variants: [{ id: 'classic', label: 'Classic', price: 0 }, { id: 'ghee', label: 'Ghee roast', price: 2000 }], addons: [{ id: 'sambar', label: 'Extra sambar', price: 2000 }] };
const idli = { ...dosa, id: 'idli', name: 'Idli sambar', price: 9000, spice: 'none', variants: [{ id: 'classic', label: 'Classic', price: 0 }], addons: [] };
const past = { id: 'dosa', name: 'Masala dosa', quantity: 2, unitPrice: 16000, options: { variant: { id: 'ghee' }, spice: 'mild', addons: [{ id: 'sambar' }] }, email: 'private@fixture.invalid', address: 'Private old address', paymentMethod: 'youpi' };

test('reorder uses current prices and retains exact portion/spice/add-ons without copying customer or payment data', () => {
 const result = planReorder([past], [dosa]);
 assert.equal(result.subtotal, 34000); assert.equal(result.quantity, 2); assert.equal(result.selected[0].previousPrice, 16000);
 assert.deepEqual(result.lines[0].addons, ['sambar']); assert.equal(result.lines[0].variant, 'ghee'); assert.equal(result.lines[0].spice, 'mild');
 assert.ok(!JSON.stringify(result.lines).includes('private')); assert.ok(!JSON.stringify(result.lines).includes('youpi')); assert.equal(result.lines[0].unitPrice, undefined);
 assert.equal(past.quantity, 2); assert.equal(past.unitPrice, 16000);
});
test('reorder lists unavailable portions/add-ons instead of silently changing a recipe', () => {
 const missing = { ...past, options: { ...past.options, variant: { id: 'retired' } } };
 const result = planReorder([missing, { id: 'idli', name: 'Idli', quantity: 1, options: { variant: { id: 'classic' }, spice: 'none', addons: [] } }], [dosa, idli]);
 assert.equal(result.issues.length, 1); assert.match(result.issues[0].reason, /portion/); assert.equal(result.lines.length, 1); assert.equal(result.lines[0].id, 'idli');
 assert.equal(planReorder([past], [{ ...dosa, addons: [] }]).lines.length, 0);
 assert.equal(planReorder([past], [{ ...dosa, available: false }]).lines.length, 0);
 assert.equal(planReorder([past], [{ ...dosa, spice: 'none' }]).lines.length, 0);
});
test('reorder merges identical selections, keeps different options separate, and requires replacement when limits would be exceeded', () => {
 const line = { id: 'dosa', quantity: 1, variant: 'ghee', spice: 'mild', addons: ['sambar'] };
 assert.equal(planReorder([past], [dosa], [line]).lines[0].quantity, 3);
 assert.equal(planReorder([past], [dosa], [{ ...line, variant: 'classic' }]).lines.length, 2);
 assert.match(planReorder([past], [dosa], [{ ...line, quantity: 9 }]).blocked, /bag limit/);
 assert.equal(planReorder([past], [dosa], [{ ...line, quantity: 9 }], 'replace').lines[0].quantity, 2);
 const menu = Array.from({ length: 21 }, (_, i) => ({ ...dosa, id: 'dish-' + i }));
 const bag = menu.slice(0, 20).map(item => ({ id: item.id, quantity: 1, variant: 'classic', spice: 'medium', addons: [] }));
 assert.ok(planReorder([{ ...past, id: 'dish-20', options: { variant: { id: 'classic' }, spice: 'medium', addons: [] } }], menu, bag).blocked);
 assert.equal(normaliseBag(menu, [...bag, { ...bag[0], id: 'dish-20' }]).length, BAG_LIMITS.lines);
});
test('legacy orders use explicit current defaults and invalid saved quantities never enter the bag', () => {
 const legacy = planReorder([{ id: 'idli', name: 'Idli', quantity: 1 }], [idli]);
 assert.equal(legacy.lines[0].spice, 'none'); assert.equal(legacy.subtotal, 9000);
 assert.ok(planReorder([{ ...past, quantity: 11 }], [dosa]).blocked);
});
test('favourites persist only distinct valid dish IDs and storage failures do not claim a save', () => {
 const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
 toggleFavourite('dosa', storage); toggleFavourite('idli', storage); assert.deepEqual([...readFavourites(storage)].sort(), ['dosa', 'idli']);
 assert.deepEqual(JSON.parse(values.get(FAVOURITES_KEY)), ['dosa', 'idli']); toggleFavourite('dosa', storage); assert.deepEqual([...readFavourites(storage)], ['idli']);
 assert.deepEqual(parseFavouriteIDs('["dosa","dosa",null,{"email":"private"},"<script>"]'), ['dosa']);
 assert.throws(() => toggleFavourite('dosa', { getItem: storage.getItem, setItem() { throw new Error('Full'); } }), /could not be saved/);
 assert.deepEqual([...readFavourites(storage)], ['idli']);
});
test('kitchen arrival tracking ignores initial tickets, re-renders and status changes', () => {
 const track = createArrivalTracker(), initial = [{ reference: 'BB-1', status: 'received' }];
 assert.deepEqual(track(initial), []); assert.deepEqual(track(initial), []);
 const next = [...initial, { reference: 'BB-2', status: 'received' }]; assert.equal(track(next)[0].reference, 'BB-2');
 assert.deepEqual(track(next.map(order => ({ ...order, status: 'preparing' }))), []);
 assert.deepEqual(track(next), []);
});
