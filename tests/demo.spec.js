import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const base = '/Cafe_Website/';
async function pages(context) {
 const root = resolve('_site');
 const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
 await context.route('**/api/**', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"GitHub Pages has no backend"}' }));
 await context.route('**/Cafe_Website/**', async route => {
  const pathname = new URL(route.request().url()).pathname;
  let relative = decodeURIComponent(pathname.slice(base.length));
  if (!relative || relative.endsWith('/')) relative += 'index.html';
  const file = resolve(root, relative);
  if (!file.startsWith(root + '/')) return route.fulfill({ status: 404 });
  try { await route.fulfill({ status: 200, contentType: mime[extname(file)] || 'application/octet-stream', body: await readFile(file) }); }
  catch { await route.fulfill({ status: 404 }); }
 });
}
async function addDosa(page, customised = true) {
 await page.getByRole('button', { name: 'Add Bangalore Masala Dosa to bag', exact: true }).click();
 await expect(page.locator('#dish-dialog')).toBeVisible();
 if (customised) { await page.locator('#dish-variant').selectOption('ghee-roast'); await page.locator('#dish-spice').selectOption('mild'); await page.getByLabel('Extra sambar', { exact: false }).check(); }
 await page.locator('#dish-add').click();
}
async function placeDemo(page, customised = true) {
 await addDosa(page, customised); await page.getByRole('button', { name: 'Open bag, 1 item', exact: true }).click();
 await page.getByRole('button', { name: 'Demo checkout', exact: false }).click();
 await expect(page.locator('#demo-checkout-dialog')).toBeVisible();
 await page.locator('#demo-instruction').selectOption('mild');
 await page.getByRole('button', { name: 'Place demo order', exact: true }).click();
 await expect(page.locator('#track-new-demo-order')).toBeVisible();
 const reference = new URL(await page.locator('#track-new-demo-order').getAttribute('href')).searchParams.get('order');
 await page.locator('#track-new-demo-order').click();
 await expect(page.locator('#tracking-reference')).toHaveText(reference);
 return reference;
}

test('GitHub Pages customer, kitchen and admin complete one connected fictional order across tabs', async ({ page: customer, context }) => {
 await pages(context); const errors = [], writes = [];
 context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
 customer.on('pageerror', error => errors.push(error.message));
 context.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/')) writes.push(request.url()); });
 await customer.goto(base + '?demo=1'); await expect(customer.locator('.menu-card')).toHaveCount(12);
 await expect(customer.locator('#connection-note')).toContainText('Demo Mode — No real orders or payments.');
 const kitchen = await context.newPage(), admin = await context.newPage();
 await kitchen.goto(base + 'kitchen/'); await admin.goto(base + 'admin/');
 await expect(admin.locator('[data-metric=total] strong')).toHaveText('6');
 const reference = await placeDemo(customer);
 await expect(customer.locator('#tracking-detail .status-chip')).toHaveText('Received');
 const ticket = kitchen.locator(`[data-ticket="${reference}"]`);
 await expect(ticket).toContainText('Ghee-roasted · mild spice · Extra sambar');
 await expect(ticket).toContainText('Please keep the heat mild');
 await expect(admin.locator('[data-metric=total] strong')).toHaveText('7');
 await ticket.getByRole('button', { name: 'Start preparing', exact: true }).click();
 await expect(customer.locator('#tracking-detail .status-chip')).toHaveText('Preparing');
 await expect(admin.locator('[data-metric=preparing] strong')).toHaveText('2');
 await ticket.getByRole('button', { name: 'Mark ready', exact: true }).click();
 await expect(customer.locator('#tracking-detail .status-chip')).toHaveText('Ready');
 await expect(admin.locator('[data-metric=ready] strong')).toHaveText('2');
 await ticket.getByRole('button', { name: 'Mark collected', exact: true }).click();
 await expect(customer.locator('#tracking-detail .status-chip')).toHaveText('Collected');
 await expect(admin.locator('[data-metric=collected] strong')).toHaveText('3');
 await expect(admin.locator('[data-metric=sales] strong')).toHaveText('₹950');
 await kitchen.getByRole('button', { name: 'Completed history', exact: true }).click();
 await expect(kitchen.locator(`[data-ticket="${reference}"] .status-chip`)).toHaveText('Collected');
 await customer.reload(); await expect(customer.locator('#tracking-detail .status-chip')).toHaveText('Collected');
 const stored = await customer.evaluate(() => localStorage.getItem('bitesbro.demo.v1'));
 expect(stored).not.toMatch(/"(?:email|phone|address|postcode|customerName|payment)"\s*:/);
 expect(writes).toEqual([]); expect(errors).toEqual([]);
 await admin.screenshot({ path: 'test-results/bitesbro-admin-desktop.png', fullPage: true, animations: 'disabled' });
 await kitchen.getByRole('button', { name: 'Active queue', exact: true }).click();
 await kitchen.screenshot({ path: 'test-results/bitesbro-kitchen-desktop.png', fullPage: true, animations: 'disabled' });
 await customer.screenshot({ path: 'test-results/bitesbro-tracking-desktop.png', fullPage: true, animations: 'disabled' });
});

test('admin menu edits, availability, archive and additions update the demo customer and kitchen views', async ({ page: admin, context }) => {
 await pages(context); await admin.goto(base + 'admin/#menu');
 const customer = await context.newPage(), kitchen = await context.newPage();
 await customer.goto(base + '?demo=1'); await kitchen.goto(base + 'kitchen/');
 await expect(admin.locator('#admin-menu-count')).toContainText('50 dishes');
 await admin.getByRole('button', { name: 'Edit Bangalore Masala Dosa', exact: true }).click();
 const form = admin.locator('#demo-menu-form');
 await form.locator('[name=price]').fill('175.50'); await form.locator('[name=category]').selectOption('north-indian');
 await form.getByRole('button', { name: 'Save demo dish', exact: true }).click();
 await expect(admin.locator('#menu-dialog')).not.toBeVisible();
 const customerCard = customer.locator('.menu-card').filter({ has: customer.getByRole('heading', { name: 'Bangalore Masala Dosa', exact: true }) });
 await expect(customerCard.locator('.menu-price')).toHaveText('₹175.50'); await expect(customerCard).toHaveAttribute('data-kind', 'north-indian');
 await addDosa(customer, false); await expect(customer.locator('#bag-count')).toHaveText('1');
 await admin.getByRole('button', { name: 'Pause Bangalore Masala Dosa', exact: true }).click();
 await expect(customer.locator('#bag-count')).toHaveText('0'); await expect(customerCard).toHaveCount(0);
 await kitchen.locator('#availability-panel summary').click(); await kitchen.locator('#availability-search').fill('Bangalore Masala');
 await expect(kitchen.locator('.availability-row')).toContainText('Unavailable');
 await kitchen.getByRole('button', { name: 'Make available: Bangalore Masala Dosa', exact: true }).click();
 await expect(customerCard).toHaveCount(1);
 await admin.getByRole('button', { name: 'Archive Bangalore Masala Dosa', exact: true }).click();
 await expect(customerCard).toHaveCount(0);
 await admin.locator('#admin-menu-status').selectOption('archived');
 await admin.getByRole('button', { name: 'Restore Bangalore Masala Dosa', exact: true }).click();
 await expect(customerCard).toHaveCount(1); await admin.locator('#admin-menu-status').selectOption('active');
 await admin.getByRole('button', { name: 'Add demo dish +', exact: true }).click();
 await form.locator('[name=name]').fill('Demo Lemon Rice');
 await form.locator('[name=description]').fill('A fictional bowl of lemon rice for the connected kitchen demonstration.');
 await form.locator('[name=price]').fill('155.25'); await form.locator('[name=diet]').selectOption('vegan');
 await form.getByRole('button', { name: 'Save demo dish', exact: true }).click();
 await expect(admin.locator('#admin-menu-count')).toContainText('51 dishes');
 await customer.locator('#menu-search').fill('Demo Lemon Rice');
 await expect(customer.locator('.menu-card h3')).toHaveText('Demo Lemon Rice'); await expect(customer.locator('.menu-card .menu-price')).toHaveText('₹155.25');
 await kitchen.locator('#availability-search').fill('Demo Lemon Rice'); await expect(kitchen.locator('.availability-row')).toContainText('Available');
 await admin.getByRole('link', { name: /Settings/ }).click();
 await admin.locator('#open-reset-demo').click(); await admin.locator('#confirm-reset-demo').click();
 await expect(admin.locator('#ops-notice')).toContainText('50 sample dishes and six fictional orders restored');
 await customer.locator('#menu-search').fill('');
 await expect(customer.locator('#menu-count')).toContainText('50 dishes');
});

test('demo kitchen preferences control checkout and customer cancellation stays consistent', async ({ page: customer, context }) => {
 await pages(context); await customer.goto(base + '?demo=1');
 const admin = await context.newPage(); await admin.goto(base + 'admin/#settings');
 await expect(admin.locator('#demo-settings-form')).toBeVisible();
 await admin.locator('#demo-accepting').uncheck(); await admin.getByRole('button', { name: 'Save demo preferences' }).click();
 await addDosa(customer, false); await customer.getByRole('button', { name: 'Open bag, 1 item', exact: true }).click();
 await customer.locator('#open-demo-checkout').click();
 await expect(customer.locator('#place-demo-order')).toBeDisabled(); await expect(customer.locator('#demo-checkout-result')).toContainText('paused');
 await admin.locator('#demo-accepting').check(); await admin.locator('#demo-prep').fill('35'); await admin.getByRole('button', { name: 'Save demo preferences' }).click();
 await expect(customer.locator('#place-demo-order')).toBeEnabled(); await expect(customer.locator('#demo-checkout-summary')).toContainText('35 minutes');
 await customer.locator('#place-demo-order').click(); await customer.locator('#track-new-demo-order').click();
 await customer.getByRole('button', { name: 'Cancel demo order', exact: true }).click();
 await expect(customer.locator('#tracking-detail .status-chip')).toHaveText('Cancelled'); await expect(customer.locator('.cancelled-note')).toContainText('No payment or refund occurred');
 await expect(customer.getByRole('button', { name: 'Cancel demo order', exact: true })).toHaveCount(0);
 await admin.goto(base + 'admin/#orders'); await admin.locator('#admin-order-status').selectOption('cancelled');
 await expect(admin.locator('#admin-order-count')).toHaveText('2 demonstration orders');
});

test('nested demo pages, shared assets and navigation work at every required viewport', async ({ page, context }) => {
 await pages(context); const errors = [], requests = [];
 page.on('pageerror', error => errors.push(error.message));
 page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + response.url()); });
 page.on('request', request => requests.push(new URL(request.url()).pathname));
 await page.emulateMedia({ reducedMotion: 'reduce' });
 for (const path of ['?demo=1', 'kitchen/', 'admin/', 'orders/']) {
  await page.goto(base + path); await expect(page.locator('#demo-role-nav')).toContainText('Demo Mode — No real orders or payments.');
  await page.evaluate(() => document.fonts.ready);
  if (path === 'kitchen/') await expect(page.locator('.ticket-card').first()).toBeVisible();
  if (path === 'admin/') await expect(page.locator('[data-metric=total] strong')).toHaveText('6');
  for (const width of [320, 360, 768, 1024, 1440]) {
   await page.setViewportSize({ width, height: 900 });
   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} overflows at ${width}`).toBe(true);
  }
  await page.reload(); await expect(page.locator('#demo-role-nav a').first()).toHaveAttribute('href', /\/Cafe_Website\/\?demo=1$/);
 }
 expect(errors).toEqual([]);
 expect(requests.filter(path => path.includes('/assets/') || path.endsWith('.js') || path.endsWith('.css')).every(path => path.startsWith(base))).toBe(true);
 await page.setViewportSize({ width: 360, height: 900 });
 await page.goto(base + 'kitchen/'); await expect(page.locator('.ticket-card').first()).toBeVisible();
 await page.screenshot({ path: 'test-results/bitesbro-kitchen-mobile.png', fullPage: true, animations: 'disabled' });
 await page.goto(base + 'admin/'); await expect(page.locator('[data-metric=total] strong')).toHaveText('6');
 await page.screenshot({ path: 'test-results/bitesbro-admin-mobile.png', fullPage: true, animations: 'disabled' });
});

test('dish editor keeps keyboard focus and escapes editable text rather than executing it', async ({ page, context }) => {
 await pages(context); await page.goto(base + 'admin/#menu');
 const edit = page.getByRole('button', { name: 'Edit Bangalore Masala Dosa', exact: true });
 await edit.click(); await page.keyboard.press('Escape'); await expect(edit).toBeFocused();
 await edit.click(); const form = page.locator('#demo-menu-form');
 const literal = '<img src=x onerror="window.demoXss=1">';
 await form.locator('[name=name]').fill(literal); await form.getByRole('button', { name: 'Save demo dish', exact: true }).click();
 await expect(page.locator('#admin-menu')).toContainText(literal);
 expect(await page.evaluate(() => window.demoXss)).toBeUndefined();
 await page.goto(base + '?demo=1'); await expect(page.locator('.menu-card h3').first()).toHaveText(literal);
 expect(await page.evaluate(() => window.demoXss)).toBeUndefined();
});

test('administrator reports calculate status counts, collected sales and popular dishes from the shared tickets', async ({ page, context }) => {
 await pages(context); await page.goto(base + 'admin/#reports');
 await expect(page.locator('#daily-summary tbody tr')).toHaveCount(7);
 await expect(page.locator('#sales-trend')).toContainText('₹790');
 expect(await page.locator('#daily-summary tbody tr td:nth-child(2)').evaluateAll(cells => cells.reduce((sum, cell) => sum + Number(cell.textContent), 0))).toBe(6);
 await expect(page.locator('#report-popular-items')).toContainText('Bangalore Masala Dosa');
 await expect(page.locator('#status-summary')).toContainText('Cancelled');
 await page.getByRole('link', { name: /Orders/, exact: false }).filter({ has: page.locator('.nav-number') }).click();
 await page.getByRole('button', { name: 'View BB-DEMO-1003', exact: true }).click();
 await page.getByRole('button', { name: 'Mark collected', exact: true }).click();
 await expect(page.locator('#order-dialog .status-chip')).toHaveText('Collected'); await page.keyboard.press('Escape');
 await page.getByRole('link', { name: /Reports/ }).filter({ has: page.locator('.nav-number') }).click();
 await expect(page.locator('#sales-trend')).toContainText('₹1,140');
 await expect(page.locator('#status-summary meter[aria-label="Collected orders"]')).toHaveAttribute('value', '3');
 await page.setViewportSize({ width: 320, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: 'test-results/bitesbro-reports-desktop.png', fullPage: true, animations: 'disabled' });
});

test('damaged browser demo data exposes a reset and never a false success screen', async ({ page, context }) => {
 await pages(context); await page.goto(base + 'admin/');
 await expect(page.locator('[data-metric=total] strong')).toHaveText('6');
 await page.evaluate(() => localStorage.setItem('bitesbro.demo.v1', '{broken'));
 await page.reload(); await expect(page.getByRole('heading', { name: 'The demo couldn’t open.' })).toBeVisible();
 await expect(page.getByText('Saved demo data could not be read.', { exact: false })).toBeVisible();
 await page.getByRole('button', { name: 'Reset fictional demo data', exact: true }).click();
 await expect(page.locator('[data-metric=total] strong')).toHaveText('6');
});
