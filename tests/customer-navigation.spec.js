import { test, expect } from '@playwright/test';
import { cloudFixture, SITE } from './helpers/cloud-browser.js';

async function addDosa(page, customised = false) {
 await page.getByRole('button', { name: 'Add Bangalore Masala Dosa to bag', exact: true }).click();
 if (customised) {
  await page.locator('#dish-variant').selectOption('ghee-roast');
  await page.locator('#dish-spice').selectOption('mild');
  await page.getByLabel('Extra sambar', { exact: false }).check();
 }
 await page.locator('#dish-add').click();
}

test('all customer pages have navbar sign-in and a working shared bag with customised checkout', async ({ page, context }) => {
 const fixture = cloudFixture(); await fixture.attach(context);
 await page.goto(SITE); await addDosa(page, true); await addDosa(page);
 await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'My orders', exact: true }).click();
 await expect(page.locator('#bag-count')).toHaveText('2');
 const bag = page.locator('#customer-bag-dialog');
 await page.getByRole('button', { name: 'Open bag, 2 items', exact: true }).click();
 await expect(bag.locator('.cart-item')).toHaveCount(2);
 await expect(bag).toContainText('Ghee-roasted · mild spice · Extra sambar');
 await expect(page.locator('#customer-bag-total')).toHaveText('₹280');
 await bag.getByRole('button', { name: 'Add one Bangalore Masala Dosa', exact: true }).first().click();
 await expect(page.locator('#customer-bag-total')).toHaveText('₹440');
 await expect(bag.getByRole('button', { name: 'Add one Bangalore Masala Dosa', exact: true }).first()).toBeFocused();
 await bag.getByRole('link', { name: 'Continue to checkout', exact: false }).click();
 await expect(page.locator('#cart-dialog')).toBeVisible(); await expect(page.locator('#cart-total')).toHaveText('₹440');
 await expect(page.locator('#order-form')).toBeVisible(); await page.keyboard.press('Escape');
 await page.locator('.site-header #customer-account').getByRole('link', { name: 'Sign in', exact: true }).click();
 await expect(page.locator('#auth-form')).toBeVisible(); await expect(page.locator('#bag-count')).toHaveText('3');
 await page.getByRole('button', { name: 'Open bag, 3 items', exact: true }).click();
 await bag.getByRole('button', { name: 'Remove one Bangalore Masala Dosa', exact: true }).first().click();
 await expect(page.locator('#customer-bag-total')).toHaveText('₹280'); await page.keyboard.press('Escape');
 await expect(page.locator('#open-cart')).toBeFocused();

 for (const path of ['', 'orders/', 'auth/', 'photo-credits.html']) {
  await page.goto(SITE + path); await expect(page.locator('#bag-count')).toHaveText('2');
  await expect(page.locator('#demo-role-nav')).toHaveCount(0);
  for (const width of [320, 360, 768, 1024, 1440]) {
   await page.setViewportSize({ width, height: 900 });
   await expect(page.locator('.site-header #customer-account').getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
   await expect(page.getByRole('button', { name: 'Open bag, 2 items', exact: true })).toBeVisible();
   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), path + ' at ' + width).toBe(true);
   if (path === '' && width === 360) await page.screenshot({ path: 'test-results/customer-navbar-mobile.png' });
   if (path === 'orders/' && width === 1440) await page.screenshot({ path: 'test-results/customer-navbar-history-desktop.png' });
  }
 }
 await page.setViewportSize({ width: 360, height: 900 });
 await page.getByRole('button', { name: 'Open bag, 2 items', exact: true }).click();
 await bag.getByRole('button', { name: 'Remove Bangalore Masala Dosa from bag', exact: true }).last().click();
 await expect(page.locator('#customer-bag-total')).toHaveText('₹160');
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
 await page.screenshot({ path: 'test-results/customer-bag-mobile.png' });
 await bag.getByRole('link', { name: 'Continue to checkout', exact: false }).click();
 await expect(page.locator('#cart-total')).toHaveText('₹160'); await expect(page.locator('#cart-content')).toContainText('Ghee-roasted · mild spice · Extra sambar');
 expect(fixture.guestUsers).toHaveLength(0);
 const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bitesbro.food-bag.v2')));
 expect(Object.keys(saved[0]).sort()).toEqual(['addons', 'id', 'quantity', 'spice', 'variant']);
});

test('bag counts, quantities and empty state update across customer tabs without replacing sessions', async ({ context }) => {
 const fixture = cloudFixture(); await fixture.attach(context);
 const menu = await context.newPage(), history = await context.newPage();
 await menu.goto(SITE); await addDosa(menu);
 await history.goto(SITE + 'orders/'); await expect(history.locator('#bag-count')).toHaveText('1');
 await history.getByRole('button', { name: 'Open bag, 1 item', exact: true }).click();
 await history.getByRole('button', { name: 'Add one Bangalore Masala Dosa', exact: true }).click();
 await expect(menu.locator('#bag-count')).toHaveText('2');
 await menu.getByRole('button', { name: 'Open bag, 2 items', exact: true }).click();
 await expect(menu.locator('#cart-total')).toHaveText('₹240');
 await menu.getByRole('button', { name: 'Remove Bangalore Masala Dosa from bag', exact: true }).click();
 await expect(history.locator('#bag-count')).toHaveText('0');
 await expect(history.locator('#customer-bag-dialog')).toContainText('A little room for good food.');
 await expect(history.locator('#customer-bag-checkout')).toBeHidden();
 await history.getByRole('link', { name: 'Find your craving', exact: false }).click();
 await expect(history).toHaveURL(SITE + '#menu'); await expect(history.locator('.menu-card')).toHaveCount(12);
 expect(fixture.guestUsers).toHaveLength(0);
});
