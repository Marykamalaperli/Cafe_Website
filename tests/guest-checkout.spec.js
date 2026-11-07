import{test,expect}from'@playwright/test';
import{cloudFixture,SITE,signIn}from'./helpers/cloud-browser.js';

async function guestOrder(page){
 await page.goto(SITE);await page.getByRole('button',{name:'Add Bangalore Masala Dosa to bag',exact:true}).click();await page.locator('#dish-add').click();await page.getByRole('button',{name:'Open bag, 1 item',exact:true}).click();
 const form=page.locator('#order-form');await expect(form.locator('[name=email]')).toBeEditable();await form.locator('[name=name]').fill('Guest fixture');await form.locator('[name=email]').fill('shared-contact@bitesbro.invalid');await form.locator('[name=phone]').fill('9000000000');await form.locator('[name=date]').fill('2030-06-01');await form.locator('[name=time]').selectOption('10:00');await form.locator('[name=consent]').check();await form.getByRole('button',{name:'Place food order',exact:false}).click();
}

test('guest orders without signup/password, tracks and cancels privately, and cannot enter staff pages',async({page,context})=>{
 const fixture=cloudFixture();await fixture.attach(context);await guestOrder(page);
 await expect(page).toHaveURL(SITE+'orders/?order=BB-ORDER-TEST1');
 const signup=fixture.calls.filter(call=>call.path==='/auth/v1/signup');expect(signup).toHaveLength(1);expect(signup[0].body.email).toBeUndefined();expect(signup[0].body.password).toBeUndefined();expect(signup[0].apikey).toBe('sb_publishable_browser_fixture');expect(fixture.guestUsers).toHaveLength(1);
 const placed=fixture.calls.find(call=>call.path.endsWith('/place_order'));expect(placed.role).toBe('customer');expect(placed.body.p.email).toBe('shared-contact@bitesbro.invalid');
 await expect(page.locator('#tracking-reference')).toHaveText('BB-ORDER-TEST1');await expect(page.locator('#demo-role-nav')).toContainText('Guest checkout');await expect(page.locator('#demo-role-nav')).toContainText('track using this browser');await expect(page.getByRole('heading',{name:'Recent guest orders',exact:true})).toBeVisible();await expect(page.locator('#order-history')).not.toContainText('BB-ORDER-OTHER');
 await page.reload();await expect(page.locator('#tracking-reference')).toHaveText('BB-ORDER-TEST1');await page.getByRole('button',{name:'Cancel order',exact:true}).click();await expect(page.locator('#tracking-detail .status-chip')).toHaveText('Cancelled');
 await page.setViewportSize({width:360,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'test-results/guest-tracking-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});
 expect(await page.evaluate(()=>localStorage.getItem('bitesbro.demo.v1'))).toBeNull();
 await page.goto(SITE+'admin/');await expect(page).toHaveURL(SITE);await page.goto(SITE+'kitchen/');await expect(page).toHaveURL(SITE);
 await page.getByRole('link',{name:'Sign in / Create account',exact:true}).click();await expect(page.locator('#auth-form')).toBeVisible();await expect(page.locator('#auth-description')).toContainText('guest checkout');
 await signIn(page,'customer');await expect(page).toHaveURL(SITE);await page.goto(SITE+'orders/');await expect(page.locator('#order-history')).not.toContainText('BB-ORDER-TEST1');
});

for(const options of[{guestReady:false},{guestAuthEnabled:false}])test(`guest setup ${JSON.stringify(options)} fails honestly and keeps the bag`,async({page,context})=>{
 const fixture=cloudFixture(options);await fixture.attach(context);await guestOrder(page);
 await expect(page.locator('#order-form .form-result')).toContainText('Guest checkout is not available yet');await expect(page.locator('#cart-content')).toContainText('Bangalore Masala Dosa');
 expect(fixture.calls.some(call=>call.path.endsWith('/place_order'))).toBe(false);expect(fixture.guestUsers).toHaveLength(0);
 if(options.guestReady===false)expect(fixture.calls.some(call=>call.path==='/auth/v1/signup')).toBe(false);
});

test('two independent guests using the same contact email never share order history',async({browser})=>{
 const first=await browser.newContext(),second=await browser.newContext(),fixture=cloudFixture();
 try{
  await fixture.attach(first);await fixture.attach(second);const a=await first.newPage(),b=await second.newPage();
  await guestOrder(a);await expect(a.locator('#tracking-reference')).toHaveText('BB-ORDER-TEST1');
  await guestOrder(b);await expect(b.locator('#tracking-reference')).toHaveText('BB-ORDER-TEST2');
  await expect(b.locator('#order-history')).not.toContainText('BB-ORDER-TEST1');await a.reload();await expect(a.locator('#order-history')).not.toContainText('BB-ORDER-TEST2');expect(fixture.guestUsers).toHaveLength(2);
 }finally{await first.close();await second.close();}
});
