import { test, expect } from '@playwright/test';

async function tomorrow(page) {
  const cafe = await (await page.request.get('/api/cafe')).json();
  const date = new Date(`${cafe.today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
async function selectTime(form, date, time = '10:00') {
  await form.locator('[name=date]').fill(date);
  const select = form.locator('[name=time]');
  await expect(select).toBeEnabled();
  await expect(select.locator(`option[value="${time}"]`)).toHaveCount(1);
  await select.selectOption(time);
}
async function customer(form, email) {
  await form.locator('[name=name]').fill('Browser Guest');
  await form.locator('[name=email]').fill(email);
  await form.locator('[name=phone]').fill('+91 90000 00000');
  await form.locator('[name=consent]').check();
}

test('desktop renders all local assets, functional navigation and eight menu items without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto('/');
  await expect(page).toHaveTitle('BitesBro — Good bites. Better days.');
  await expect(page.locator('.menu-card')).toHaveCount(8);
  await expect(page.locator('#visit-address')).toContainText('Bangalore');
  await expect(page.locator('#visit-hours')).toContainText('10am–3pm & 6pm–11pm');
  for (const image of await page.locator('main img').all()) await image.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.locator('main img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
  for (const link of await page.locator('a[href^="#"]').all()) {
    const href = await link.getAttribute('href');
    await expect(page.locator(href)).toHaveCount(1);
  }
  for (const element of await page.locator('.reveal').all()) { await element.scrollIntoViewIfNeeded(); await expect(element).toHaveClass(/is-visible/); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/bitesbro-desktop.png', fullPage: true, animations: 'disabled' });
  expect(errors).toEqual([]);
});

test('menu categories, search, empty state and reset are functional', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.menu-card')).toHaveCount(8);
  await page.getByRole('button', { name: 'Matcha & more', exact: true }).click();
  await expect(page.locator('.menu-card')).toHaveCount(1);
  await expect(page.locator('.menu-card h3')).toHaveText('Vanilla Cloud Matcha');
  await page.getByRole('button', { name: 'All the good stuff', exact: true }).click();
  await expect(page.locator('.menu-card')).toHaveCount(8);
  await page.getByRole('searchbox').fill('velvet latte');
  await expect(page.locator('.menu-card')).toHaveCount(1);
  await page.getByRole('searchbox').fill('something not on this menu');
  await expect(page.getByText('No bites found. Yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Show the whole menu' }).click();
  await expect(page.locator('.menu-card')).toHaveCount(8);
  let failNext = true;
  await page.route('**/api/menu?*', route => {
    if (failNext) { failNext = false; return route.abort('failed'); }
    return route.continue();
  });
  await page.reload();
  await expect(page.getByText('A little brewing delay.')).toBeVisible();
  await page.getByRole('button', { name: 'Matcha & more', exact: true }).click();
  await expect(page.locator('.menu-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Add Vanilla Cloud Matcha to bag', exact: true }).click();
  await expect(page.locator('#bag-count')).toHaveText('1');
});

test('bag persists across reloads and checkout saves a server-priced pickup order', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Velvet Latte to bag', exact: true }).click();
  await page.getByRole('button', { name: 'Open bag, 1 item', exact: true }).click();
  await page.getByRole('button', { name: 'Add one Velvet Latte', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open bag, 2 items', exact: true }).click();
  await expect(page.locator('#cart-total')).toHaveText('₹440');
  const form = page.locator('#order-form');
  await customer(form, 'pickup-browser@example.com');
  await selectTime(form, await tomorrow(page));
  const response = page.waitForResponse(response => response.url().endsWith('/api/orders') && response.request().method() === 'POST');
  await form.getByRole('button', { name: 'Place pickup request' }).click();
  const saved = await (await response).json();
  expect(saved.total).toBe(44000);
  expect(saved.reference).toMatch(/^BB-ORDER-/);
  await expect(page.getByText('A little good, all saved.')).toBeVisible();
  await expect(page.locator('#bag-count')).toHaveText('0');
  await expect(page.locator('#cart-content')).toContainText(saved.reference);
});

test('signature feature uses menu prices and adds its real product to the bag', async ({ page }) => {
  await page.goto('/');
  const menu = await (await page.request.get('/api/menu')).json();
  const signature = menu.items.find(item => item.id === 'iced-brown-sugar');
  await expect(page.locator('#signature-name')).toHaveText(signature.name);
  await expect(page.locator('#signature-price')).toHaveText('₹260');
  const treat = page.getByRole('button', { name: 'Treat yourself to Iced Brown Sugar' });
  await treat.click();
  await treat.click();
  await page.getByRole('button', { name: 'Open bag, 2 items', exact: true }).click();
  await expect(page.locator('#cart-content')).toContainText(signature.name);
  await expect(page.locator('#cart-total')).toHaveText('₹520');
});

test('reservation form stores a real request and reduces available capacity', async ({ page }) => {
  await page.goto('/');
  const date = await tomorrow(page);
  const before = await (await page.request.get(`/api/availability?date=${date}`)).json();
  const form = page.locator('#reservation-form');
  await customer(form, 'table-browser@example.com');
  await selectTime(form, date);
  await form.locator('[name=notes]').fill('A quiet little corner, please.');
  await form.getByRole('button', { name: 'Save me a seat' }).click();
  await expect(form.locator('.form-result')).toContainText('BB-TABLE-');
  const after = await (await page.request.get(`/api/availability?date=${date}`)).json();
  expect(after.slots[0].seatsLeft).toBe(before.slots[0].seatsLeft - 2);
});

test('newsletter submission and nested privacy dialog work with keyboard focus', async ({ page }) => {
  await page.goto('/');
  const form = page.locator('#newsletter-form');
  await form.locator('[name=email]').fill('newsletter-browser@example.com');
  await form.getByRole('button', { name: 'Privacy notice', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'A little privacy, please.' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(form.getByRole('button', { name: 'Privacy notice', exact: true })).toBeFocused();
  await form.locator('[name=consent]').check();
  await form.getByRole('button', { name: 'Join the BitesBro newsletter' }).click();
  await expect(form.locator('.form-result')).toContainText('You’re on the list!');
  await expect(form.locator('.form-result')).toContainText('email service is connected');
});

test('contact modal saves a message and reports its reference honestly', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Say a little hello', exact: true }).click();
  const form = page.locator('#contact-form');
  await form.locator('[name=name]').fill('Browser Guest');
  await form.locator('[name=email]').fill('contact-browser@example.com');
  await form.locator('[name=message]').fill('Hello BitesBro, I would love to know more about your opening.');
  await form.locator('[name=consent]').check();
  await form.getByRole('button', { name: 'Send a little hello' }).click();
  await expect(form.locator('.form-result')).toContainText('BB-HELLO-');
});

test('mobile navigation, bag, and layouts from 320px to desktop have no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.locator('#main-nav')).toBeVisible();
  await page.locator('#main-nav').getByRole('link', { name: 'The menu' }).click();
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Add The Butter Croissant to bag', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open bag, 1 item', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View your bag', exact: true })).toBeVisible();
  await expect(page.locator('#mobile-bag-total')).toHaveText('₹180');
  await expect(page.locator('#mobile-bag-count')).toHaveText('1 little treat');
  await page.getByRole('button', { name: 'View your bag', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Your good-stuff bag.' })).toBeVisible();
  await expect(page.locator('#cart-total')).toHaveText('₹180');
  await page.getByRole('button', { name: 'Close bag' }).click();
  for (const width of [320, 375, 390, 640, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `overflow at ${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const element of await page.locator('.reveal').all()) await element.scrollIntoViewIfNeeded();
  for (const element of await page.locator('.reveal').all()) { await element.scrollIntoViewIfNeeded(); await expect(element).toHaveClass(/is-visible/); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/bitesbro-mobile.png', fullPage: true, animations: 'disabled' });
});

test('reduced-motion preferences stop continuous motion; dialogs close and restore focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.ticker-track')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.story-copy')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Open bag, 0 items', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open bag, 0 items', exact: true })).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Pause animations', exact: true }).click();
  await expect(page.locator('.ticker-track')).toHaveCSS('animation-play-state', 'paused');
  await page.getByRole('button', { name: 'Resume animations', exact: true }).click();
  await expect(page.locator('.ticker-track')).toHaveCSS('animation-play-state', 'running');
});
