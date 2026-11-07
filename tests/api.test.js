import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../server/database.js';
import { createApp, cafeClock, SLOTS } from '../server/app.js';

let db, server, base;
const fixedNow = () => new Date('2030-01-10T03:30:00Z');
const validCustomer = { name: 'Test Guest', email: 'guest@example.com', phone: '+91 90000 00000', consent: true };
const reservation = extra => ({ ...validCustomer, date: '2030-01-11', time: '10:00', guests: 2, notes: '', ...extra });
const order = extra => ({ ...validCustomer, date: '2030-01-11', time: '18:00', items: [{ id: 'velvet-latte', quantity: 2 }], ...extra });
async function get(path) { const response = await fetch(base + path); return { response, data: await response.json() }; }
async function post(path, data, headers = {}) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
  return { response, data: await response.json() };
}

beforeEach(async () => {
  db = openDatabase(':memory:');
  server = createServer(createApp({ db, now: fixedNow, siteUrl: 'https://bitesbro.example', rateLimitMax: 100 }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => {
  await new Promise(resolve => server.close(resolve));
  db.close();
});

test('health proves database connectivity; café clock uses Bangalore time', async () => {
  assert.deepEqual((await get('/api/health')).data, { status: 'ok', database: 'connected' });
  const { data } = await get('/api/cafe');
  assert.equal(data.city, 'Bangalore');
  assert.equal(data.currentTime, '09:00');
  assert.equal(data.today, '2030-01-10');
  assert.equal(data.serverTime, fixedNow().toISOString());
  assert.deepEqual(data.openingPeriods,[{open:'10:00',close:'15:00'},{open:'18:00',close:'23:00'}]);
  assert.match(data.hours, /10am–3pm & 6pm–11pm/);
  assert.deepEqual(cafeClock(new Date('2030-01-10T20:00:00Z')), { date: '2030-01-11', time: '01:30' });
});

test('menu is seeded in SQLite and category filters return actual stored items', async () => {
  const all = await get('/api/menu');
  assert.equal(all.data.items.length, 50);
  assert.ok(all.data.items.every(item => Number.isInteger(item.price) && Array.isArray(item.dietary)));
  db.prepare('UPDATE menu_items SET price = 23000 WHERE id = ?').run('velvet-latte');
  const coffee = await get('/api/menu?category=beverages');
  assert.equal(coffee.data.items.length, 7);
  assert.equal(coffee.data.items[0].price, 23000);
  db.prepare('UPDATE menu_items SET available = 0 WHERE id = ?').run('velvet-latte');
  assert.equal((await get('/api/menu?category=beverages')).data.items.length, 6);
  assert.equal((await get('/api/menu?category=nope')).response.status, 400);
});

test('reservation creates a record and decreases live seat availability', async () => {
  const { response, data } = await post('/api/reservations', reservation());
  assert.equal(response.status, 201);
  assert.match(data.reference, /^BB-TABLE-[A-F0-9]{10}$/);
  const row = db.prepare('SELECT * FROM reservations WHERE reference = ?').get(data.reference);
  assert.equal(row.guests, 2);
  assert.equal(row.consent, 1);
  assert.equal(row.email, validCustomer.email);
  const availability = await get('/api/availability?date=2030-01-11');
  assert.equal(availability.data.slots[0].seatsLeft, 22);
});

test('concurrent reservations cannot overbook the 24-seat sitting', async () => {
  const results = await Promise.all(Array.from({ length: 4 }, (_, i) => post('/api/reservations', reservation({ email: `guest${i}@example.com`, guests: 8 }))));
  assert.deepEqual(results.map(result => result.response.status).sort(), [201, 201, 201, 409]);
  assert.equal(db.prepare('SELECT SUM(guests) AS count FROM reservations').get().count, 24);
  const { data } = await get('/api/availability?date=2030-01-11');
  assert.equal(data.slots[0].available, false);
});

test('duplicate requests fail without inserting a second reservation', async () => {
  await post('/api/reservations', reservation());
  assert.equal((await post('/api/reservations', reservation())).response.status, 409);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reservations').get().n, 1);
});

test('invalid, past, far-future and closed-hour bookings are rejected', async () => {
  for (const fields of [{ date: '2030-01-09' }, { date: '2030-02-30' }, { date: '2031-01-11' }, { time: '15:00' }, { time: '16:30' }, { time: '23:00' }, { date: '2030-01-10', time: '08:00' }, { guests: 0 }, { guests: 9 }, { guests: 1.5 }, { guests: '2' }]) {
    const result = await post('/api/reservations', reservation(fields));
    assert.equal(result.response.status, 400, JSON.stringify(fields));
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reservations').get().n, 0);
});

test('only the published non-overlapping 90-minute sittings are offered', async () => {
  assert.deepEqual(SLOTS, ['10:00', '11:30', '13:00', '18:00', '19:30', '21:00']);
  const { data } = await get('/api/availability?date=2030-01-11');
  assert.deepEqual(data.slots.map(slot => slot.time), SLOTS);
  assert.equal((await get('/api/availability?date=bad')).response.status, 400);
});

test('pickup total and price snapshots come from the database, ignoring client prices', async () => {
  const { response, data } = await post('/api/orders', order({ total: 1, items: [{ id: 'velvet-latte', quantity: 2, price: 1 }] }));
  assert.equal(response.status, 201);
  assert.equal(data.total, 44000);
  const savedOrder = db.prepare('SELECT * FROM orders WHERE reference = ?').get(data.reference);
  const item = db.prepare('SELECT * FROM order_items WHERE order_id = ?').get(savedOrder.id);
  assert.equal(savedOrder.total, 44000);
  assert.equal(item.unit_price, 22000);
  assert.equal(item.quantity, 2);
  assert.equal(item.name, 'Velvet Latte');
  assert.equal(savedOrder.status, 'received');
});

test('empty, oversized, duplicate and invalid order lines are rejected atomically', async () => {
  for (const items of [[], [{ id: 'velvet-latte', quantity: -1 }], [{ id: 'velvet-latte', quantity: 11 }], [{ id: 'velvet-latte', quantity: 1.2 }], [{ id: 'velvet-latte', quantity: '2' }], [{ id: 'velvet-latte', quantity: 1 }, { id: 'velvet-latte', quantity: 2 }], [{ id: 'velvet-latte', quantity: 10 }, { id: 'iced-brown-sugar', quantity: 10 }, { id: 'classic-flat-white', quantity: 10 }, { id: 'butter-croissant', quantity: 1 }]]) {
    assert.equal((await post('/api/orders', order({ items }))).response.status, 400);
  }
  assert.equal((await post('/api/orders', order({ items: [{ id: 'missing', quantity: 1 }] }))).response.status, 409);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_items').get().n, 0);
});

test('unavailable products cannot be ordered', async () => {
  db.prepare('UPDATE menu_items SET available = 0 WHERE id = ?').run('velvet-latte');
  assert.equal((await post('/api/orders', order())).response.status, 409);
});

test('newsletter consent is required and case-normalised emails are deduplicated', async () => {
  assert.equal((await post('/api/newsletter', { email: 'test@example.com' })).response.status, 400);
  assert.equal((await post('/api/newsletter', { email: 'invalid', consent: true })).response.status, 400);
  assert.equal((await post('/api/newsletter', { email: 'Test@Example.COM', consent: true })).response.status, 200);
  assert.equal((await post('/api/newsletter', { email: 'test@example.com', consent: true })).response.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM subscribers').get().n, 1);
});

test('contact messages are parameterised, private and persisted with a reference', async () => {
  const message = "Hello!'); DROP TABLE menu_items; --";
  const { response, data } = await post('/api/contact', { ...validCustomer, subject: 'A little hello', message });
  assert.equal(response.status, 201);
  assert.equal(db.prepare('SELECT message FROM messages WHERE reference = ?').get(data.reference).message, message);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM menu_items').get().n, 50);
  for (const resource of ['messages', 'orders', 'reservations', 'subscribers']) assert.equal((await get(`/api/${resource}`)).response.status, 404);
});

test('malformed input, wrong content type, honeypots and missing consent are rejected', async () => {
  for (const payload of [null, [], 'hello', { ...validCustomer, website: 'spam', subject: 'Hello', message: 'Spam message here' }, { ...validCustomer, consent: false }, { ...validCustomer, consent: 'true' }]) {
    assert.equal((await post('/api/contact', payload)).response.status, 400);
  }
  const invalid = await fetch(base + '/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(invalid.status, 400);
  assert.equal((await post('/api/contact', validCustomer, { 'Content-Type': 'text/plain' })).response.status, 415);
});

test('oversized JSON returns 413 without saving a message', async () => {
  const result = await post('/api/contact', { ...validCustomer, subject: 'A long note', message: 'a'.repeat(20000) });
  assert.equal(result.response.status, 413);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 0);
});

test('cross-origin writes are rejected, same-origin writes accepted', async () => {
  assert.equal((await post('/api/newsletter', { email: 'a@example.com', consent: true }, { Origin: 'https://untrusted.example' })).response.status, 403);
  assert.equal((await post('/api/newsletter', { email: 'a@example.com', consent: true }, { Origin: base })).response.status, 200);
});

test('public files have security headers and canonical SEO URLs are rendered', async () => {
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('Content-Security-Policy'), /script-src 'self'/);
  assert.equal(home.headers.get('X-Content-Type-Options'), 'nosniff');
  const html = await home.text();
  assert.ok(html.includes('https://bitesbro.example/'));
  assert.ok(!html.includes('{{SITE_URL}}'));
  assert.match(await (await fetch(base + '/sitemap.xml')).text(), /<loc>https:\/\/bitesbro.example\/<\/loc>/);
  assert.match(await (await fetch(base + '/robots.txt')).text(), /Disallow: \/api\//);
  const head = await fetch(base + '/styles.css', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  for (const path of ['/.env', '/server/schema.sql', '/data/bitesbro.sqlite', '/%2e%2e%2fserver%2fapp.js']) assert.equal((await fetch(base + path)).status, 404);
});

test('demo role pages open directly without exposing operational APIs', async () => {
 for(const path of ['/kitchen/','/admin/','/orders/']) {
  const response=await fetch(base+path);assert.equal(response.status,200);
  assert.match(response.headers.get('Content-Type'),/text\/html/);
  const html=await response.text();
  assert.match(html,path==='/orders/'?/<title>Your orders — BitesBro<\/title>/:/BitesBro Demo/);
  assert.match(html,/data-access-pending="true"/);
  if(path==='/orders/')assert.match(html,/<a href="\.\/" aria-current="page">My orders<\/a>/);
  assert.match(response.headers.get('Content-Security-Policy'),/script-src 'self'/);
 }
 const redirect=await fetch(base+'/kitchen?view=active',{redirect:'manual'});
 assert.equal(redirect.status,308);assert.equal(redirect.headers.get('Location'),'/kitchen/?view=active');
 for(const path of ['/api/admin/orders','/api/kitchen/orders','/api/orders'])assert.equal((await fetch(base+path)).status,404);
 const head=await fetch(base+'/admin/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
});

test('abuse limiter returns 429 and Retry-After without a second write', async () => {
  const limited = createServer(createApp({ db, now: fixedNow, rateLimitMax: 1 }));
  await new Promise(resolve => limited.listen(0, '127.0.0.1', resolve));
  try {
    const endpoint = `http://127.0.0.1:${limited.address().port}/api/newsletter`;
    const send = () => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@example.com', consent: true }) });
    assert.equal((await send()).status, 200);
    const second = await send();
    assert.equal(second.status, 429);
    assert.equal(second.headers.get('Retry-After'), '900');
  } finally { await new Promise(resolve => limited.close(resolve)); }
});

test('SQLite data survives closing and reopening without duplicating the menu seed', () => {
  const folder = mkdtempSync(join(tmpdir(), 'bitesbro-persistence-'));
  try {
    const path = join(folder, 'cafe.sqlite');
    const first = openDatabase(path);
    first.prepare('INSERT INTO subscribers (email, consent) VALUES (?, 1)').run('persist@example.com');
    first.prepare('UPDATE menu_items SET price = 25000 WHERE id = ?').run('velvet-latte');
    first.close();
    const second = openDatabase(path);
    assert.equal(second.prepare('SELECT email FROM subscribers').get().email, 'persist@example.com');
    assert.equal(second.prepare('SELECT COUNT(*) AS n FROM menu_items').get().n, 50);
    assert.equal(second.prepare('SELECT price FROM menu_items WHERE id = ?').get('velvet-latte').price, 25000);
    second.close();
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('food catalogue includes eight cuisines, South Indian variety and real dietary filtering',async()=>{
 const {data}=await get('/api/menu');
 assert.equal(data.categories.length,8);
 const south=await get('/api/menu?category=south-indian');
 assert.equal(south.data.items.length,16);
 assert.ok(south.data.items.some(i=>i.id==='masala-dosa'));
 assert.ok(south.data.items.some(i=>i.diet==='non-veg'));
 const vegan=await get('/api/menu?diet=vegan');
 assert.ok(vegan.data.items.length>5);assert.ok(vegan.data.items.every(i=>i.diet==='vegan'));
 const veg=await get('/api/menu?diet=veg');assert.ok(veg.data.items.every(i=>i.diet!=='non-veg'));
 const chicken=await get('/api/menu?diet=non-veg&q=chicken');assert.ok(chicken.data.items.length>3);assert.ok(chicken.data.items.every(i=>i.diet==='non-veg'));
 assert.equal((await get('/api/menu?diet=invalid')).response.status,400);
});

test('customised dish prices and options are validated and snapshotted on the server',async()=>{
 const {response,data}=await post('/api/orders',order({items:[{id:'masala-dosa',quantity:2,variant:'ghee-roast',spice:'mild',addons:['extra-sambar'],price:1,total:1}]}));
 assert.equal(response.status,201);assert.equal(data.total,32000);assert.equal(data.subtotal,32000);assert.equal(data.deliveryFee,0);
 const line=db.prepare('SELECT * FROM order_items').get();
 assert.equal(line.unit_price,16000);
 const options=JSON.parse(line.options);assert.equal(options.variant.label,'Ghee-roasted');assert.equal(options.spice,'mild');assert.equal(options.addons[0].price,1500);
 for(const extra of [{variant:'free-family'},{spice:'extreme'},{addons:['unknown']},{addons:['extra-sambar','extra-sambar']},{addons:'extra-sambar'}]){
  assert.equal((await post('/api/orders',order({items:[{id:'masala-dosa',quantity:1,...extra}]}))).response.status,400);
 }
 assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,1);
});

test('different configurations of the same dish can coexist; identical lines cannot',async()=>{
 const result=await post('/api/orders',order({items:[{id:'masala-dosa',quantity:1,variant:'regular'},{id:'masala-dosa',quantity:1,variant:'ghee-roast'}]}));
 assert.equal(result.response.status,201);assert.equal(result.data.total,26500);assert.equal(db.prepare('SELECT COUNT(*) n FROM order_items').get().n,2);
});

test('delivery addresses, postcodes and fees are enforced independently of client totals',async()=>{
 const fields={fulfilment:'delivery',address:'12 Test Street, Bangalore',postcode:'560001',instructions:'Please ring the bell.',deliveryFee:0,items:[{id:'masala-dosa',quantity:1}]};
 const first=await post('/api/orders',order(fields));assert.equal(first.response.status,201);assert.equal(first.data.deliveryFee,4000);assert.equal(first.data.total,16000);
 const saved=db.prepare('SELECT * FROM orders WHERE reference=?').get(first.data.reference);assert.equal(saved.address,fields.address);assert.equal(saved.postcode,'560001');assert.equal(saved.instructions,fields.instructions);
 const free=await post('/api/orders',order({...fields,items:[{id:'masala-dosa',quantity:5}]}));assert.equal(free.data.deliveryFee,0);assert.equal(free.data.total,60000);
 for(const override of [{address:''},{postcode:'110001'},{postcode:'5600'},{fulfilment:'teleport'}]) assert.equal((await post('/api/orders',order({...fields,...override}))).response.status,400);
});

test('food slots cover both opening periods without using dining reservation intervals',async()=>{
 const {data}=await get('/api/fulfilment?date=2030-01-11');
 assert.ok(data.slots.some(s=>s.time==='10:30'));assert.ok(data.slots.some(s=>s.time==='22:30'));assert.ok(!data.slots.some(s=>s.time==='15:00'||s.time==='17:00'));
 assert.equal((await post('/api/orders',order({time:'10:30'}))).response.status,201);
 assert.equal((await post('/api/orders',order({time:'16:00'}))).response.status,400);
 assert.equal((await post('/api/orders',order({date:'2030-01-10',time:'09:00'}))).response.status,400);
});

test('version-1 database upgrades preserve menu edits, customers and order history, with one backup',()=>{
 const folder=mkdtempSync(join(tmpdir(),'bitesbro-v1-'));
 try{
  const path=join(folder,'legacy.sqlite'),old=new DatabaseSync(path);
  old.exec(readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8'));
  old.prepare('INSERT INTO menu_items(id,name,category,description,price,image,dietary) VALUES(?,?,?,?,?,?,?)').run('velvet-latte','Owner-edited Latte','coffee','Owner recipe',27500,'/assets/images/latte.svg','["Vegetarian"]');
  old.exec("INSERT INTO orders(id,reference,name,email,phone,pickup_date,pickup_time,total,consent) VALUES(1,'HISTORY','Old Guest','old@example.com','9000000000','2026-01-01','10:00',27500,1)");
  old.exec("INSERT INTO order_items(order_id,menu_item_id,name,quantity,unit_price) VALUES(1,'velvet-latte','Historical Latte',1,27500)");old.close();
  const upgraded=openDatabase(path),item=upgraded.prepare("SELECT * FROM menu_items WHERE id='velvet-latte'").get();
  assert.equal(item.name,'Owner-edited Latte');assert.equal(item.price,27500);assert.equal(item.description,'Owner recipe');assert.equal(item.category,'beverages');
  assert.equal(upgraded.prepare('SELECT name FROM order_items WHERE order_id=1').get().name,'Historical Latte');
  assert.equal(upgraded.prepare('SELECT subtotal FROM orders WHERE id=1').get().subtotal,27500);
  assert.deepEqual(upgraded.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(upgraded.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  upgraded.close();
  const backups=readdirSync(folder).filter(n=>n.endsWith('.bak'));assert.equal(backups.length,1);
  const backup=new DatabaseSync(join(folder,backups[0]),{readOnly:true});assert.equal(backup.prepare('SELECT COUNT(*) n FROM orders').get().n,1);backup.close();
  const reopened=openDatabase(path);assert.equal(reopened.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n,3);reopened.close();
  assert.equal(readdirSync(folder).filter(n=>n.endsWith('.bak')).length,1);
 }finally{rmSync(folder,{recursive:true,force:true});}
});

test('photo upgrade preserves edited menu data, custom images and a recoverable version-2 backup',()=>{
 const folder=mkdtempSync(join(tmpdir(),'bitesbro-photos-'));
 try {
  const path=join(folder,'v2.sqlite'),legacy=openDatabase(path);
  legacy.exec('DELETE FROM schema_migrations WHERE version=3');
  legacy.prepare('UPDATE menu_items SET image=?,price=?,description=? WHERE id=?').run('/assets/images/latte.svg',27500,'Owner recipe','velvet-latte');
  legacy.prepare('UPDATE menu_items SET image=? WHERE id=?').run('/assets/images/owner-dosa.jpg','masala-dosa');
  legacy.prepare('UPDATE menu_items SET image=?,available=0 WHERE id=?').run('/assets/images/food/idli.svg','idli-sambar');
  legacy.prepare('INSERT INTO subscribers(email,consent) VALUES(?,1)').run('photo-migration@example.com');legacy.close();
  const updated=openDatabase(path),latte=updated.prepare('SELECT * FROM menu_items WHERE id=?').get('velvet-latte');
  assert.equal(latte.image,'/assets/images/photos/latte.jpg');assert.equal(latte.price,27500);assert.equal(latte.description,'Owner recipe');
  assert.equal(updated.prepare('SELECT image FROM menu_items WHERE id=?').get('masala-dosa').image,'/assets/images/owner-dosa.jpg');
  assert.equal(updated.prepare('SELECT available FROM menu_items WHERE id=?').get('idli-sambar').available,0);
  assert.equal(updated.prepare('SELECT COUNT(*) n FROM menu_items').get().n,50);
  assert.equal(updated.prepare('SELECT COUNT(*) n FROM subscribers').get().n,1);
  assert.deepEqual(updated.prepare('PRAGMA foreign_key_check').all(),[]);updated.close();
  const files=readdirSync(folder).filter(file=>file.endsWith('.bak'));assert.equal(files.length,1);
  const backup=new DatabaseSync(join(folder,files[0]),{readOnly:true});
  assert.equal(backup.prepare('SELECT image FROM menu_items WHERE id=?').get('velvet-latte').image,'/assets/images/latte.svg');backup.close();
  const reopened=openDatabase(path);reopened.close();assert.equal(readdirSync(folder).filter(file=>file.endsWith('.bak')).length,1);
 } finally {rmSync(folder,{recursive:true,force:true});}
});
