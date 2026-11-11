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
 await expect(page.locator('#tracking-reference')).toHaveText('BB-ORDER-TEST1');await expect(page.locator('#demo-role-nav')).toHaveCount(0);await expect(page.locator('.site-header #customer-account')).toContainText('Sign in');await expect(page.locator('#history-session-info')).toContainText('Guest history stays in this browser');await expect(page.getByRole('heading',{name:'Recent guest orders',exact:true})).toBeVisible();await expect(page.locator('#order-history')).not.toContainText('BB-ORDER-OTHER');
 await page.goto(SITE);await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'My orders',exact:true}).click();await expect(page.locator('#tracking-reference')).toHaveText('BB-ORDER-TEST1');await expect(page.locator('#history-session-info')).toContainText('Signing into another customer account');
 await page.reload();await expect(page.locator('#tracking-reference')).toHaveText('BB-ORDER-TEST1');await page.getByRole('button',{name:'Cancel order',exact:true}).click();await expect(page.locator('#tracking-detail .status-chip')).toHaveText('Cancelled');
 await page.setViewportSize({width:360,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'test-results/guest-tracking-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});
 expect(await page.evaluate(()=>localStorage.getItem('bitesbro.demo.v1'))).toBeNull();
 await page.goto(SITE+'admin/');await expect(page).toHaveURL(/\/auth\/\?portal=admin/);await page.goto(SITE+'kitchen/');await expect(page).toHaveURL(/\/auth\/\?portal=kitchen/);await page.goto(SITE);
 await page.getByRole('link',{name:'Sign in',exact:true}).click();await expect(page.locator('#auth-form')).toBeVisible();await expect(page.locator('#auth-description')).toContainText('guest checkout');
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

test('guest checkout requires durable storage before saving an order',async({page,context})=>{
 const fixture=cloudFixture();await fixture.attach(context);
 await context.addInitScript(()=>{
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
   if(key.includes('auth-token')||key==='supabase.auth.token')throw new DOMException('Storage blocked','SecurityError');
   return original.call(this,key,value);
  };
 });
 await guestOrder(page);
 await expect(page.locator('#order-form .form-result')).toContainText('Enable browser site storage');
 expect(fixture.calls.some(call=>call.path.endsWith('/place_order'))).toBe(false);
 await expect(page.locator('#cart-content')).toContainText('Bangalore Masala Dosa');
});

test('returning guests restore only their latest three orders, including after token refresh',async({browser})=>{
 const fixture=cloudFixture(),first=await browser.newContext(),other=await browser.newContext();let returning;
 try{
  await fixture.attach(first);await fixture.attach(other);
  const page=await first.newPage(),stranger=await other.newPage();
  for(let i=1;i<=4;i++){
   await guestOrder(page);await expect(page.locator('#tracking-reference')).toHaveText('BB-ORDER-TEST'+i);
  }
  await guestOrder(stranger);await expect(stranger.locator('#tracking-reference')).toHaveText('BB-ORDER-TEST5');
  const refs=['BB-ORDER-TEST4','BB-ORDER-TEST3','BB-ORDER-TEST2'];
  await page.reload();await expect(page.locator('#order-history [data-track-order]')).toHaveText(refs.map(()=>/BB-ORDER-TEST/));
  expect(await page.locator('#order-history [data-track-order]').evaluateAll(links=>links.map(link=>link.dataset.trackOrder))).toEqual(refs);
  const storageState=await first.storageState();
  // Simulate returning after the access token expires; the SDK must retain the
  // guest owner while exchanging its saved refresh token.
  for(const origin of storageState.origins)for(const entry of origin.localStorage)if(entry.name.endsWith('-auth-token')){
   const session=JSON.parse(entry.value);session.expires_at=1;entry.value=JSON.stringify(session);
  }
  await first.close();returning=await browser.newContext({storageState});await fixture.attach(returning);
  const restored=await returning.newPage();await restored.goto(SITE+'orders/');
  await expect(restored.locator('#order-history [data-track-order]')).toHaveCount(3);
  expect(await restored.locator('#order-history [data-track-order]').evaluateAll(links=>links.map(link=>link.dataset.trackOrder))).toEqual(refs);
  await restored.goto(SITE+'orders/?order=BB-ORDER-TEST5');await expect(restored.locator('#tracking-detail')).toContainText('outside your available history');
  await stranger.reload();await expect(stranger.locator('#order-history')).not.toContainText('BB-ORDER-TEST4');
  expect(fixture.guestUsers).toHaveLength(2);
  expect(fixture.calls.some(call=>call.query.grant_type==='refresh_token')).toBe(true);
 }finally{await first.close();await other.close();await returning?.close();}
});
