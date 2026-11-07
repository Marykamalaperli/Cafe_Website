import { test, expect } from '@playwright/test';
import { startPaymentReview } from '../scripts/serve-payment-review.js';
let app, base;
test.beforeAll(async () => { app = await startPaymentReview({ port: 0 }); base = app.base; });
test.afterAll(async () => { await app.close(); });
test.setTimeout(90000);

async function signIn(page, role) {
 const portal = role === 'chef' ? 'kitchen' : role, destination = new URL(role === 'customer' ? './' : portal + '/', base);
 await page.goto(base + 'auth/?portal=' + portal + '&reviewRole=' + role + '&next=' + encodeURIComponent(destination.pathname));
 await expect(page.locator('#auth-form')).toBeVisible();
 await expect(page.locator('[name=email]')).toHaveValue('demo.' + role + '@bitesbro.invalid');
 await page.locator('#auth-submit').click(); await expect(page).toHaveURL(destination.href);
}
async function checkout(page, { payment = 'youpi', outcome = 'MANUAL_REVIEW', reference = '123456789012' } = {}) {
 await page.goto(base); await page.getByRole('button', { name: 'Add Bangalore Masala Dosa to bag', exact: true }).click(); await page.locator('#dish-add').click();
 await page.getByRole('button', { name: 'Open bag, 1 item', exact: true }).click();
 if (payment === 'youpi') await page.locator('#payment-method').selectOption('youpi');
 else await expect(page.locator('#payment-method')).toHaveCount(0);
 const form = page.locator('#order-form'), date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
 for (const [name, value] of Object.entries({ name: 'Fictional payment demo', email: 'guest@fixture.invalid', phone: '9000000000', date })) {
  const field=form.locator('[name=' + name + ']');if(await field.evaluate(input=>input.readOnly))continue;await field.fill(value);
 }
 await form.locator('[name=time]').selectOption('10:00');
 await form.getByRole('button',{name:'privacy notice',exact:true}).click();await expect(page.locator('#privacy-dialog .prose')).toContainText('this browser only');await page.keyboard.press('Escape');
 await form.locator('[name=consent]').check();
 await form.getByRole('button', { name: 'Place food order', exact: false }).click();
 await expect(page.locator('#tracking-reference')).toContainText('BB-ORDER-');
 const saved = await page.locator('#tracking-reference').textContent();
 if (payment === 'youpi') {
  const dialog = page.locator('#youpi-payment-dialog'); await expect(dialog).toBeVisible();
  await expect(page.locator('#youpi-payment-status')).toContainText('Ready for a simulated response');
  await dialog.locator('[name=outcome]').selectOption(outcome);
  if (!['FAILED', 'EXPIRED'].includes(outcome)) await dialog.locator('[name=bankReference]').fill(reference);
  await dialog.getByRole('button', { name: 'Simulate UPI response', exact: true }).click();
  await expect(page.locator('#youpi-payment-status')).toContainText('Response saved');
  await dialog.getByRole('button', { name: 'Follow order progress', exact: true }).click();
 }
 return saved;
}
const refresh = page => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
async function reviewCard(page, reference) {
 await page.goto(base + 'admin/#settings'); const card = page.locator('[data-payment-review="' + reference + '"]'); await expect(card).toBeVisible(); return card;
}

test('isolated GitHub Pages demo runs guest UPI → bank review → chef preparation with independent sessions', async ({ context, page }) => {
 const requests = [], errors = []; context.on('request', request => requests.push(request.url())); page.on('pageerror', error => errors.push(error.message));
 await page.goto(base + 'review.html'); await expect(page.locator('#review-status')).toContainText('Ready.');
 await page.evaluate(()=>{localStorage.setItem('bitesbro.food-bag.v2','retained production bag');localStorage.setItem('sb-production-fixture-auth-token','retained production session');});
 const order = await checkout(page), admin = await context.newPage(), chef = await context.newPage();
 await expect(page.locator('.payment-status')).toHaveText('Bank verification pending'); await page.reload(); await expect(page.locator('#tracking-reference')).toHaveText(order);
 await signIn(admin, 'admin'); await signIn(chef, 'chef');
 await expect(chef.locator('[data-ticket="' + order + '"]')).toHaveCount(0);
 const card = await reviewCard(admin, order); await expect(card).toContainText('123456789012');
 await card.getByRole('button', { name: 'Save receipt review', exact: true }).click(); await expect(card.locator('[role=status]')).toContainText('Confirm that you checked');
 await card.locator('[name=checkedReceipt]').check(); await card.getByRole('button', { name: 'Save receipt review', exact: true }).click(); await expect(card).toHaveCount(0);
 await refresh(page); await expect(page.locator('.payment-status')).toHaveText('Payment received');
 await refresh(chef); const ticket = chef.locator('[data-ticket="' + order + '"]'); await expect(ticket).toBeVisible();
 await ticket.getByRole('button', { name: 'Start preparing', exact: true }).click(); await refresh(page); await expect(page.locator('#tracking-detail .status-chip')).toHaveText('Preparing');
 await ticket.getByRole('button', { name: 'Mark ready', exact: true }).click(); await refresh(page); await expect(page.locator('#tracking-detail .status-chip')).toHaveText('Ready');
 await ticket.getByRole('button', { name: 'Mark collected', exact: true }).click(); await refresh(page); await expect(page.locator('#tracking-detail .status-chip')).toHaveText('Collected');
 for (const width of [320, 360, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }
 await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: 'test-results/youpi-payment-history-desktop.png' });
 await admin.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(admin).toHaveURL(/portal=admin/);
 await page.reload(); await expect(page.locator('#tracking-reference')).toHaveText(order); await chef.reload(); await expect(chef).toHaveURL(base + 'kitchen/');
 for(const tab of [page,chef])expect(await tab.evaluate(async()=>{const {cloudClient}=await import('../shared/cloud.js?v=portal-auth-1');const result=await(await cloudClient()).auth.refreshSession();return !result.error&&Boolean(result.data.session);})).toBe(true);
 await page.reload();await expect(page.locator('#tracking-reference')).toHaveText(order);
 expect(errors).toEqual([]); expect(requests.filter(url => /^https?:/.test(url) && new URL(url).origin !== new URL(base).origin)).toEqual([]);
 expect(await page.evaluate(()=>localStorage.getItem('bitesbro.food-bag.v2'))).toBe('retained production bag');expect(await page.evaluate(()=>localStorage.getItem('sb-production-fixture-auth-token'))).toBe('retained production session');
});

test('payment failure, corrected bank claim, cancellation/refund and paused-UPI cash checkout remain honest and usable', async ({ context, page }) => {
 await page.goto(base + 'review.html'); await expect(page.locator('#review-status')).toContainText('Ready.');
 await signIn(page, 'customer'); const order = await checkout(page, { outcome: 'FAILED' });
 await expect(page.locator('.payment-status')).toHaveText('Gateway reported a failure');
 await page.getByRole('button', { name: 'Already paid? Submit bank reference', exact: true }).click();
 let dialog = page.locator('#youpi-payment-dialog'); await dialog.locator('[name=bankReference]').fill('234567890123'); await dialog.getByRole('button', { name: 'Simulate UPI response', exact: true }).click();
 await expect(page.locator('#youpi-payment-status')).toContainText('Response saved'); await dialog.getByRole('button', { name: 'Follow order progress', exact: true }).click();
 const admin = await context.newPage(); await signIn(admin, 'admin'); let card = await reviewCard(admin, order);
 await card.locator('[name=decision]').selectOption('reject'); await card.locator('[name=note]').fill('No matching bank credit. Check the bank reference.'); await card.getByRole('button', { name: 'Save receipt review', exact: true }).click(); await expect(card).toHaveCount(0);
 await refresh(page); await expect(page.locator('.payment-review-note')).toContainText('No matching bank credit');
 await page.getByRole('button', { name: 'Review / correct bank reference', exact: true }).click(); dialog = page.locator('#youpi-payment-dialog');
 await dialog.locator('[name=bankReference]').fill('234567890124'); await dialog.getByRole('button', { name: 'Simulate UPI response', exact: true }).click(); await expect(page.locator('#youpi-payment-status')).toContainText('Response saved'); await dialog.getByRole('button', { name: 'Follow order progress', exact: true }).click();
 await refresh(admin); card = admin.locator('[data-payment-review="' + order + '"]'); await expect(card).toContainText('234567890124'); await card.locator('[name=checkedReceipt]').check(); await card.getByRole('button', { name: 'Save receipt review', exact: true }).click(); await expect(card).toHaveCount(0);
 await refresh(page); await expect(page.locator('.payment-status')).toHaveText('Payment received');
 await page.getByRole('button', { name: 'Cancel order', exact: true }).click(); await expect(page.locator('.payment-status')).toHaveText('Refund awaiting restaurant');
 await refresh(admin); card = admin.locator('[data-payment-review="' + order + '"]'); await expect(card).toBeVisible(); await card.locator('[name=refundReference]').fill('987654321098'); await card.getByRole('button', { name: 'Record completed refund', exact: true }).click(); await expect(card).toHaveCount(0);
 await refresh(page); await expect(page.locator('.payment-status')).toHaveText('Refund recorded'); await expect(page.locator('.payment-panel')).toContainText('987654321098');
 await admin.locator('.payment-enable [name=enabled]').uncheck(); await admin.locator('.payment-enable').getByRole('button', { name: 'Save payment preference', exact: true }).click();
 await expect(admin.locator('#ops-notice')).toHaveText('Payment record updated.');
 const cash = await checkout(page, { payment: 'cod' }); await expect(page.locator('.payment-status')).toHaveText('Pay on pickup / delivery');
 await refresh(admin); await admin.locator('.payment-cash-list summary').click(); const cashForm = admin.locator('form[data-action=cash]').filter({ has: admin.locator('input[value="' + cash + '"]') });
 const cashButton=cashForm.getByRole('button', { name: 'Record cash received', exact: true });await expect(cashButton).toBeVisible();
 const update=admin.waitForResponse(response=>response.url().includes('/rest/v1/rpc/get_operations'));await refresh(admin);await update;await expect(cashButton).toBeVisible();
 await cashButton.click(); await refresh(page); await expect(page.locator('.payment-status')).toHaveText('Payment received');
 await page.setViewportSize({ width: 360, height: 900 }); await page.screenshot({ path: 'test-results/youpi-payment-history-mobile.png' });
});
