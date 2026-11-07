import{test,expect}from'@playwright/test';
import{cloudFixture,signIn,SITE,CLOUD,PASSWORD}from'./helpers/cloud-browser.js';
import{portalStorageKey}from'../public/shared/session-scope.js';

async function guestOrder(page){
 await page.goto(SITE);await page.getByRole('button',{name:'Add Bangalore Masala Dosa to bag',exact:true}).click();await page.locator('#dish-add').click();await page.getByRole('button',{name:'Open bag, 1 item',exact:true}).click();
 const form=page.locator('#order-form');for(const [name,value]of Object.entries({name:'Portal isolation fixture',email:'guest@example.invalid',phone:'9000000000',date:'2030-06-01'}))await form.locator(`[name=${name}]`).fill(value);
 await form.locator('[name=time]').selectOption('10:00');await form.locator('[name=consent]').check();await form.getByRole('button',{name:'Place food order',exact:false}).click();await expect(page.locator('#tracking-reference')).toHaveText('BB-ORDER-TEST1');
}
async function refreshedAccount(page){
 return page.evaluate(async root=>{
  const auth=await import(root+'shared/cloud.js?v=portal-auth-1'),client=await auth.cloudClient(),result=await client.auth.refreshSession();
  if(result.error)throw new Error('The remaining portal session could not refresh.');
  return{role:await auth.rpc('my_role'),id:result.data.user.id,guest:result.data.user.is_anonymous===true};
 },SITE);
}
const authPortal=(page,portal)=>expect(page).toHaveURL(new RegExp('/auth/\\?portal='+portal));

test('one browser keeps guest, chef and admin sessions independent through staff sign-in, sign-out, reload and order progress',async({context})=>{
 const fixture=cloudFixture();await fixture.attach(context);
 const customer=await context.newPage(),chef=await context.newPage(),admin=await context.newPage();
 await guestOrder(customer);const guest=fixture.guestUsers[0].id;
 await signIn(chef,'chef','/Cafe_Website/kitchen/');await expect(chef).toHaveURL(SITE+'kitchen/');
 await signIn(admin,'admin','/Cafe_Website/admin/');await expect(admin).toHaveURL(SITE+'admin/');
 expect(await refreshedAccount(customer)).toEqual({role:'customer',id:guest,guest:true});await customer.reload();await expect(customer.locator('#tracking-reference')).toHaveText('BB-ORDER-TEST1');
 const secondAdmin=await context.newPage();await secondAdmin.goto(SITE+'admin/');await expect(secondAdmin.locator('#admin-stats')).toBeVisible();
 await admin.getByRole('button',{name:'Sign out',exact:true}).click();await authPortal(admin,'admin');await authPortal(secondAdmin,'admin');
 expect((await refreshedAccount(chef)).role).toBe('chef');expect((await refreshedAccount(customer)).id).toBe(guest);
 const ticket=chef.locator('[data-ticket="BB-ORDER-TEST1"]');await ticket.getByRole('button',{name:'Start preparing',exact:true}).click();await customer.reload();await expect(customer.locator('#tracking-detail .status-chip')).toHaveText('Preparing');
 await chef.getByRole('button',{name:'Sign out',exact:true}).click();await authPortal(chef,'kitchen');
 await customer.reload();await expect(customer.locator('#tracking-reference')).toHaveText('BB-ORDER-TEST1');expect((await refreshedAccount(customer)).id).toBe(guest);expect(fixture.guestUsers).toHaveLength(1);
 expect(await customer.evaluate(()=>localStorage.getItem('bitesbro.demo.v1'))).toBeNull();
});

test('customer logout and admin logout do not revoke an administrator independently signed into the kitchen',async({context})=>{
 const fixture=cloudFixture();await fixture.attach(context);const customer=await context.newPage(),admin=await context.newPage(),kitchen=await context.newPage();
 await signIn(customer,'customer');await expect(customer).toHaveURL(SITE);await signIn(admin,'admin','/Cafe_Website/admin/');await expect(admin).toHaveURL(SITE+'admin/');await signIn(kitchen,'admin','/Cafe_Website/kitchen/');await expect(kitchen).toHaveURL(SITE+'kitchen/');
 await customer.getByRole('button',{name:'Sign out',exact:true}).click();await authPortal(customer,'customer');
 expect((await refreshedAccount(admin)).role).toBe('admin');expect((await refreshedAccount(kitchen)).role).toBe('admin');
 await admin.getByRole('button',{name:'Sign out',exact:true}).click();await authPortal(admin,'admin');expect((await refreshedAccount(kitchen)).role).toBe('admin');await kitchen.reload();await expect(kitchen.locator('[data-ticket]')).toHaveCount(1);
 await kitchen.getByRole('button',{name:'Sign out',exact:true}).click();await authPortal(kitchen,'kitchen');
});

test('staff credentials entered on the general account page preserve an existing guest identity',async({context})=>{
 const fixture=cloudFixture();await fixture.attach(context);const customer=await context.newPage(),admin=await context.newPage(),chef=await context.newPage();
 await guestOrder(customer);const guest=fixture.guestUsers[0].id;
 await signIn(admin,'admin');await expect(admin).toHaveURL(SITE+'admin/');await signIn(chef,'chef');await expect(chef).toHaveURL(SITE+'kitchen/');
 expect((await refreshedAccount(customer)).id).toBe(guest);expect((await refreshedAccount(admin)).role).toBe('admin');expect((await refreshedAccount(chef)).role).toBe('chef');await customer.reload();await expect(customer.locator('#tracking-reference')).toHaveText('BB-ORDER-TEST1');
});

test('a disallowed staff login cannot replace an existing customer session or an active chef login',async({context})=>{
 const fixture=cloudFixture();await fixture.attach(context);const customer=await context.newPage(),chef=await context.newPage(),attempt=await context.newPage();
 await guestOrder(customer);const guest=fixture.guestUsers[0].id;await signIn(chef,'chef','/Cafe_Website/kitchen/');await expect(chef).toHaveURL(SITE+'kitchen/');
 await signIn(attempt,'chef','/Cafe_Website/admin/');await expect(attempt.locator('#auth-status')).toContainText('does not have administrator access');await expect(attempt.locator('#show-signup')).toBeHidden();
 expect((await refreshedAccount(customer)).id).toBe(guest);expect((await refreshedAccount(chef)).role).toBe('chef');
 const adminKey=portalStorageKey(CLOUD,SITE,'admin');expect(await attempt.evaluate(key=>localStorage.getItem(key),adminKey)).toBeNull();
 for(const width of[320,360,768,1440]){await attempt.setViewportSize({width,height:900});expect(await attempt.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
 await attempt.screenshot({path:'test-results/administrator-signin-portal.png',fullPage:true});
});

test('a legacy staff session moves to its staff portal once and cannot return after logout',async({page,context})=>{
 const fixture=cloudFixture();await fixture.attach(context);await page.goto(SITE);await expect(page.locator('.menu-card')).toHaveCount(12);
 const legacyKey=portalStorageKey(CLOUD,SITE,'customer'),adminKey=portalStorageKey(CLOUD,SITE,'admin'),session=fixture.sessionFor('admin');
 await page.evaluate(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:legacyKey,session});await page.goto(SITE+'admin/');await expect(page.locator('#admin-stats')).toBeVisible();
 expect(await page.evaluate(key=>localStorage.getItem(key),legacyKey)).toBeNull();expect(await page.evaluate(key=>Boolean(localStorage.getItem(key)),adminKey)).toBe(true);
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await authPortal(page,'admin');
 // A stale pre-update tab must not silently restore the migrated login.
 await page.evaluate(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:legacyKey,session});await page.goto(SITE+'admin/');await authPortal(page,'admin');await expect(page.locator('#auth-form')).toBeVisible();
 await page.goto(SITE);await expect(page.locator('#demo-role-nav')).toContainText('Guest checkout');await expect(page.getByRole('navigation',{name:'Account navigation'})).not.toContainText('Administrator');
});

test('kitchen password recovery uses the unchanged callback and leaves customer and admin sessions intact',async({context})=>{
 const fixture=cloudFixture({callbackRole:'chef'});await fixture.attach(context);const customer=await context.newPage(),admin=await context.newPage(),recovery=await context.newPage();
 await guestOrder(customer);const guest=fixture.guestUsers[0].id;await signIn(admin,'admin','/Cafe_Website/admin/');await expect(admin).toHaveURL(SITE+'admin/');
 await recovery.goto(SITE+'auth/?portal=kitchen');await expect(recovery.locator('#auth-form')).toBeVisible();await recovery.getByRole('button',{name:'Forgot your password?',exact:true}).click();await recovery.locator('[name=email]').fill('chef@bitesbro.invalid');await recovery.getByRole('button',{name:'Send reset link',exact:true}).click();await expect(recovery.locator('#auth-status')).toContainText('If this email has an account');
 const request=fixture.calls.find(call=>call.path==='/auth/v1/recover');expect(request.query.redirect_to).toBe(SITE+'auth/');
 await recovery.goto(SITE+'auth/?code=fixture-recovery-code');await expect(recovery.getByRole('button',{name:'Save new password',exact:true})).toBeVisible();
 await recovery.locator('[name=password]').fill(PASSWORD);await recovery.locator('[name=confirmation]').fill(PASSWORD);await recovery.getByRole('button',{name:'Save new password',exact:true}).click();await expect(recovery.locator('#auth-status')).toContainText('Password updated');
 expect((await refreshedAccount(customer)).id).toBe(guest);expect((await refreshedAccount(admin)).role).toBe('admin');
});
