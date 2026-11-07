import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { cloudFixture, signIn, SITE } from './helpers/cloud-browser.js';
const catalogue = JSON.parse(await readFile('public/menu.json', 'utf8'));
const dosa = catalogue.items.find(item => item.id === 'masala-dosa');
const refresh = page => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
function ownedOrder(fixture, fields = {}) {
 const order = structuredClone(fixture.orders[0]);
 Object.assign(order, { reference: 'BB-REPEAT-01', owner: fixture.users.find(user => user.role === 'customer').id, status: 'collected', createdAt: '2030-05-20T08:00:00Z', ...fields });
 const stages=['received','preparing','ready','collected'];order.timeline=stages.slice(0,stages.indexOf(order.status)+1).map((status,index)=>({status,at:new Date(Date.parse(order.createdAt)+index*600000).toISOString()}));
 fixture.orders.push(order); return order;
}
async function addDosa(page) { await page.getByRole('button', { name: 'Add Bangalore Masala Dosa to bag', exact: true }).click(); await page.locator('#dish-add').click(); }

test('order again previews fresh prices/options, reviews a changed bag, and opens checkout without placing an order', async ({ page, context }) => {
 const fixture = cloudFixture(); await fixture.attach(context);
 const past = ownedOrder(fixture); past.items[0].quantity = 2; past.items[0].unitPrice = 16000;
 past.subtotal=32000;past.total=32000;
 past.items[0].options = { variant: dosa.variants.find(item => item.id === 'ghee-roast'), spice: 'mild', addons: [dosa.addons.find(item => item.id === 'extra-sambar')] };
 const current = structuredClone(catalogue); current.items.find(item => item.id === 'masala-dosa').price += 1000;
 await context.route('**/rest/v1/rpc/get_menu', route => route.fulfill({ json: current, headers: { 'Access-Control-Allow-Origin': '*' } }));
 await signIn(page, 'customer'); await addDosa(page); await page.goto(SITE + 'orders/?order=' + past.reference);
 await page.locator('#tracking-detail').getByRole('button', { name: 'Order again', exact: true }).click();
 await expect(page.locator('#reorder-subtotal')).toHaveText('₹340'); await expect(page.locator('#reorder-items')).toContainText('Ghee-roasted · mild spice · Extra sambar'); await expect(page.locator('.reorder-price-change')).toContainText('previously ₹160');
 const other = await context.newPage(); await other.goto(SITE); await addDosa(other); await expect(other.locator('#bag-count')).toHaveText('2');
 await expect(page.locator('#reorder-notice')).toContainText('another tab'); await page.locator('#reorder-confirm').click(); await expect(page).toHaveURL(SITE + 'orders/?order=' + past.reference); await expect(page.locator('#reorder-notice')).toContainText('Review the selections');
 await page.locator('#reorder-confirm').click(); await expect(page.locator('#cart-dialog')).toBeVisible(); await expect(page.locator('#bag-count')).toHaveText('4'); await expect(page.locator('#cart-total')).toHaveText('₹600');
 await expect(page.locator('#order-form [name=phone]')).toHaveValue(''); expect(fixture.calls.filter(call => call.path.endsWith('/place_order'))).toHaveLength(0); expect(fixture.orders).toHaveLength(2);
 const bag = await page.evaluate(() => JSON.parse(localStorage.getItem('bitesbro.food-bag.v2'))); expect(Object.keys(bag[0]).sort()).toEqual(['addons', 'id', 'quantity', 'spice', 'variant']);
});

test('mobile tracking opens an active ticket first and unavailable repeat selections require an explicit review', async ({ page, context }) => {
 const fixture = cloudFixture(); await fixture.attach(context);
 const recent = ownedOrder(fixture, { reference: 'BB-PAST-02', createdAt: '2030-05-22T08:00:00Z' });
 const active = ownedOrder(fixture, { reference: 'BB-ACTIVE-01', status: 'preparing' });
 recent.items[0].options.variant = { id: 'retired-portion', label: 'Old portion', price: 0 };
 await page.setViewportSize({ width: 360, height: 900 });await signIn(page, 'customer','/Cafe_Website/orders/');await expect(page).toHaveURL(SITE+'orders/');
 await expect(page.locator('#tracking-reference')).toHaveText(active.reference); await expect(page.locator('.history-progress-heading h3')).toBeInViewport();
 const detail = await page.locator('#tracking-detail').boundingBox(), history = await page.locator('.tracking-history').boundingBox(); expect(detail.y).toBeLessThan(history.y);
 const savedBag=await page.evaluate(()=>localStorage.getItem('bitesbro.food-bag.v2'));
 await page.locator('#order-history').getByRole('button', { name: 'Order again ' + recent.reference, exact: true }).click();
 await expect(page.locator('#reorder-issues')).toContainText('original portion'); await expect(page.locator('#reorder-confirm')).toBeDisabled();
 expect(await page.evaluate(() => localStorage.getItem('bitesbro.food-bag.v2'))).toBe(savedBag);
 await page.keyboard.press('Escape'); await page.locator('#order-history [data-track-order="' + recent.reference + '"]').click(); await expect(page.locator('#tracking-reference')).toBeInViewport();
 for (const width of [320, 360, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }
 await page.setViewportSize({ width: 360, height: 900 }); await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await page.screenshot({ path: 'test-results/order-history-mobile-improved.png' });
});

test('dish favourites survive reloads, sync between tabs and keep a visible checkout total on small screens', async ({ page, context }) => {
 const fixture = cloudFixture(); await fixture.attach(context); await page.goto(SITE);
 const save = page.locator('#menu-grid').getByRole('button', { name: 'Save Bangalore Masala Dosa to favourites', exact: true }); await save.click();
 await expect(page.locator('#favourites-count')).toHaveText('1'); await expect(page.locator('#menu-grid [data-favourite=masala-dosa]')).toBeFocused();
 await page.reload(); await page.getByRole('button', { name: 'Show favourite dishes', exact: true }).click(); await expect(page.locator('#menu-grid .menu-card')).toHaveCount(1);
 const other = await context.newPage(); await other.goto(SITE); await other.locator('#menu-grid [data-favourite=masala-dosa]').click(); await expect(page.locator('#favourites-count')).toHaveText('0'); await expect(page.locator('#menu-grid')).toContainText('Tap a heart');
 await page.getByRole('button', { name: 'Show the whole menu', exact: true }).click(); await addDosa(page); await page.getByRole('button', { name: 'Open bag, 1 item', exact: true }).click();
 await page.locator('#fulfilment').selectOption('delivery'); await expect(page.locator('#sticky-cart-total')).toHaveText('₹160');
 for (const width of [320, 360, 768, 1440]) {
  await page.setViewportSize({ width, height: 900 }); await page.locator('#order-form [name=name]').focus(); await expect(page.locator('.checkout-sticky-footer button')).toBeInViewport(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
 }
 await page.setViewportSize({ width: 360, height: 900 }); await page.locator('#order-form [name=phone]').focus(); await page.screenshot({ path: 'test-results/sticky-checkout-mobile.png' });
});

test('kitchen sound is opt-in, announces only new received tickets and remains silent when switched off', async ({ page, context }) => {
 await page.addInitScript(() => {
  window.demoToneCount = 0;
  window.AudioContext = class {
   state = 'suspended'; currentTime = 0; destination = {};
   async resume() { this.state = 'running'; } async close() { this.state = 'closed'; }
   createOscillator() { return { frequency: { value: 0 }, connect() {}, start() { window.demoToneCount++; }, stop() {} }; }
   createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  };
 });
 const fixture = cloudFixture(); await fixture.attach(context); await signIn(page, 'chef');await expect(page).toHaveURL(SITE+'kitchen/');await expect(page.getByRole('button',{name:'Enable new order sounds',exact:true})).toBeVisible();
 await expect(page.locator('#kitchen-arrival-note')).toBeHidden(); expect(await page.evaluate(() => window.demoToneCount)).toBe(0);
 await page.getByRole('button', { name: 'Enable new order sounds', exact: true }).click(); expect(await page.evaluate(() => window.demoToneCount)).toBe(2);
 fixture.orders.push({ ...structuredClone(fixture.orders[0]), reference: 'BB-NEW-ALERT' }); await refresh(page);
 await expect(page.locator('#kitchen-arrival-note')).toContainText('1 new order'); expect(await page.evaluate(() => window.demoToneCount)).toBe(4);
 await refresh(page); expect(await page.evaluate(() => window.demoToneCount)).toBe(4);
 await page.getByRole('button', { name: 'View received orders', exact: true }).click(); await expect(page.locator('[data-queue=received]')).toHaveAttribute('aria-pressed', 'true');
 await page.getByRole('button', { name: 'Disable new order sounds', exact: true }).click(); fixture.orders.push({ ...structuredClone(fixture.orders[0]), reference: 'BB-SILENT-ALERT' }); await refresh(page);
 await expect(page.locator('#kitchen-arrival-note')).toContainText('2 new orders'); expect(await page.evaluate(() => window.demoToneCount)).toBe(4);
});

test('closing a repeat preview during a delayed menu request keeps the bag and a later preview intact',async({page,context})=>{
 const fixture=cloudFixture();await fixture.attach(context);const first=ownedOrder(fixture),second=ownedOrder(fixture,{reference:'BB-REPEAT-02'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const idli=catalogue.items.find(item=>item.id==='idli-sambar');second.items=[{id:idli.id,name:idli.name,image:idli.image,quantity:1,unitPrice:idli.price,options:{variant:idli.variants[0],spice:idli.spice,addons:[]}}];
 const initialMenu=page.waitForResponse(response=>response.url().endsWith('/rest/v1/rpc/get_menu'));
 await signIn(page,'customer','/Cafe_Website/orders/');await initialMenu;await expect(page.locator('#tracking-reference')).toContainText('BB-REPEAT');
 const before=await page.evaluate(()=>localStorage.getItem('bitesbro.food-bag.v2'));
 let release;const gate=new Promise(resolve=>{release=resolve;});let waiting=0;
 await context.route('**/rest/v1/rpc/get_menu',async route=>{waiting++;if(waiting===1)await gate;await route.fulfill({json:catalogue,headers:{'Access-Control-Allow-Origin':'*'}});});
 await page.locator('#order-history').getByRole('button',{name:'Order again '+first.reference,exact:true}).click();await expect.poll(()=>waiting).toBeGreaterThan(0);await page.keyboard.press('Escape');
 await page.locator('#order-history').getByRole('button',{name:'Order again '+second.reference,exact:true}).click();await expect(page.locator('#reorder-confirm')).toBeEnabled();await expect(page.locator('#reorder-items')).toContainText(idli.name);
 const delayed=page.waitForResponse(response=>response.url().endsWith('/rest/v1/rpc/get_menu'));release();await(await delayed).finished();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await expect(page.locator('.reorder-intro')).toContainText(second.reference);await expect(page.locator('#reorder-items')).toContainText(idli.name);await expect(page.locator('#reorder-items')).not.toContainText(dosa.name);
 expect(await page.evaluate(()=>localStorage.getItem('bitesbro.food-bag.v2'))).toBe(before);expect(errors).toEqual([]);await page.keyboard.press('Escape');
});
