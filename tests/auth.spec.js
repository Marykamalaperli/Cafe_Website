import{test,expect}from'@playwright/test';
import{cloudFixture,signIn,SITE,CLOUD,PASSWORD}from'./helpers/cloud-browser.js';

test('anonymous users must sign in for staff pages, including attempted demo bypasses',async({page,context})=>{
 const fixture=cloudFixture();await fixture.attach(context);
 await page.goto(SITE+'admin/?demo=1');await expect(page).toHaveURL(/\/auth\//);await expect(page.locator('#auth-form')).toBeVisible();
 await page.goto(SITE+'kitchen/?demo=1');await expect(page).toHaveURL(/\/auth\//);
 expect(fixture.calls.filter(call=>call.path.endsWith('get_operations'))).toHaveLength(0);
});

test('signup requires matching passwords and sends customer display name without a staff role',async({page,context})=>{
 const fixture=cloudFixture();await fixture.attach(context);await page.goto(SITE+'auth/');
 await page.getByRole('button',{name:'Create account',exact:true}).first().click();
 await page.locator('[name=name]').fill('New Customer');await page.locator('[name=email]').fill('new@bitesbro.invalid');await page.locator('[name=password]').fill(PASSWORD);await page.locator('[name=confirmation]').fill('Does-not-match-123');await page.locator('[name=consent]').check();
 await page.locator('#auth-submit').click();await expect(page.locator('#auth-status')).toHaveText('The two passwords must match.');
 await page.locator('[name=confirmation]').fill(PASSWORD);await page.locator('#auth-submit').click();await expect(page.locator('#auth-status')).toContainText('Check your email');
 const signup=fixture.calls.find(call=>call.path.endsWith('/signup'));expect(signup.body.data).toEqual({display_name:'New Customer'});expect(signup.body.data.role).toBeUndefined();expect(signup.apikey).toBe('sb_publishable_browser_fixture');
});

for(const failure of[
 {code:'email_address_not_authorized',status:403,message:'Email address not authorized',expected:'BitesBro needs its signup email service configured'},
 {code:'over_email_send_rate_limit',status:429,message:'Email rate limit exceeded',expected:'confirmation email limit has been reached'},
 {code:'weak_password',status:422,message:'Weak password',expected:'Choose a longer, unique password'},
 {code:'unexpected_failure',status:500,message:'Error sending confirmation email',expected:'confirmation email could not be sent'},
 {code:'unexpected_failure',status:500,message:'Database error saving new user',expected:'check its account database configuration'},
 {status:400,message:'No API key found in request',expected:'did not receive its public connection key'}
])test(`failed signup explains ${failure.code}: ${failure.message} and preserves the form for retry`,async({page,context})=>{
 const fixture=cloudFixture();await fixture.attach(context);
 await page.route('**/auth/v1/signup?**',route=>route.fulfill({status:failure.status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*','X-Supabase-Api-Version':'2024-01-01','Access-Control-Expose-Headers':'X-Supabase-Api-Version'},body:JSON.stringify({code:failure.code,msg:failure.message,message:failure.message})}));
 await page.goto(SITE+'auth/');await page.getByRole('button',{name:'Create account',exact:true}).first().click();
 await page.locator('[name=name]').fill('Signup Fixture');await page.locator('[name=email]').fill('signup@bitesbro.invalid');await page.locator('[name=password]').fill(PASSWORD);await page.locator('[name=confirmation]').fill(PASSWORD);await page.locator('[name=consent]').check();await page.locator('#auth-submit').click();
 await expect(page.locator('#auth-status')).toContainText(failure.expected);await expect(page.locator('#auth-status')).toContainText(`Reference: ${failure.code&&failure.status<500?failure.code:'HTTP '+failure.status}`);
 await expect(page.locator('#auth-status')).not.toContainText('Check your email for a confirmation link');await expect(page.locator('[name=email]')).toHaveValue('signup@bitesbro.invalid');await expect(page.locator('#auth-submit')).toBeEnabled();
});

test('customer sign-in ignores forged metadata and staff destinations; real checkout and private tracking work',async({page,context})=>{
 const fixture=cloudFixture();await fixture.attach(context);
 await signIn(page,'customer','/Cafe_Website/admin/');await expect(page.locator('#auth-status')).toContainText('does not have administrator access');
 await signIn(page,'customer');await expect(page).toHaveURL(SITE);
 await expect(page.getByRole('navigation',{name:'Main navigation'})).toContainText('My orders');await expect(page.locator('.site-header #account-signout')).toBeVisible();await expect(page.locator('#demo-role-nav')).toHaveCount(0);
 await page.goto(SITE+'kitchen/?demo=1');await expect(page).toHaveURL(/\/auth\/\?portal=kitchen/);await page.goto(SITE);
 await expect(page.locator('#demo-checkout-panel')).toBeHidden();await expect(page.locator('.menu-card')).toHaveCount(12);
 await page.getByRole('button',{name:'Add Bangalore Masala Dosa to bag',exact:true}).click();await page.locator('#dish-add').click();await page.getByRole('button',{name:'Open bag, 1 item',exact:true}).click();
 const form=page.locator('#order-form');await expect(form.locator('[name=email]')).toHaveValue('customer@bitesbro.invalid');await form.locator('[name=phone]').fill('9000000000');await form.locator('[name=date]').fill('2030-06-01');await form.locator('[name=time]').selectOption('10:00');await form.locator('[name=consent]').check();await form.getByRole('button',{name:'Place food order',exact:false}).click();
 await expect(page).toHaveURL(SITE+'orders/?order=BB-ORDER-TEST1');
 const placed=fixture.calls.find(call=>call.path.endsWith('place_order'));expect(placed.role).toBe('customer');expect(placed.body.p.requestId).toMatch(/^[a-f0-9-]{36}$/);expect(placed.apikey).toBe('sb_publishable_browser_fixture');expect(placed.authorization).toMatch(/^Bearer /);expect(placed.authorization).not.toBe('Bearer sb_publishable_browser_fixture');
 await expect(page.locator('#tracking-reference')).toHaveText('BB-ORDER-TEST1');await expect(page.locator('#order-history')).not.toContainText('BB-ORDER-OTHER');
 await expect(page.locator('#tracking-detail')).toContainText('₹120');await page.getByRole('button',{name:'Cancel order',exact:true}).click();await expect(page.locator('#tracking-detail .status-chip')).toHaveText('Cancelled');
 const stored=await page.evaluate(()=>localStorage.getItem('bitesbro.demo.v1'));expect(stored).toBeNull();
});

test('chef credentials open only the kitchen; tickets omit contacts and permit preparation actions',async({page,context})=>{
 const fixture=cloudFixture();await fixture.attach(context);await signIn(page,'chef');await expect(page).toHaveURL(SITE+'kitchen/');
 await expect(page.locator('[data-ticket="BB-ORDER-OTHER"]')).toBeVisible();await expect(page.locator('main')).not.toContainText('private@bitesbro.invalid');await expect(page.locator('main')).not.toContainText('Private address');
 const navigation=page.getByRole('navigation',{name:'Account navigation'});await expect(navigation).toContainText('Kitchen Display');await expect(navigation).not.toContainText('Administrator');
 await page.locator('[data-ticket="BB-ORDER-OTHER"]').getByRole('button',{name:'Start preparing',exact:true}).click();await expect(page.locator('[data-ticket="BB-ORDER-OTHER"] .status-chip')).toHaveText('Preparing');
 await page.goto(SITE+'admin/');await expect(page).toHaveURL(/\/auth\/\?portal=admin/);await expect(page.locator('#auth-form')).toBeVisible();
});

test('admin can enter the kitchen, assign staff and upload every licensed photo to Supabase files',async({page,context})=>{
 const fixture=cloudFixture();await fixture.attach(context);await signIn(page,'admin','https://outside.invalid/admin/');await expect(page).toHaveURL(SITE+'admin/');
 await expect(page.getByRole('navigation',{name:'Account navigation'})).toContainText('Kitchen Display');
 await page.getByRole('link',{name:'Open kitchen',exact:false}).click();await expect(page).toHaveURL(/\/auth\/\?portal=kitchen/);await signIn(page,'admin','/Cafe_Website/kitchen/');await expect(page).toHaveURL(SITE+'kitchen/');await page.goto(SITE+'admin/#settings');
 await expect(page.locator('#upload-menu-photos')).toBeVisible();await expect(page.locator('.reset-panel')).toBeHidden();
 await page.locator('#staff-access-form [name=email]').fill('chef@bitesbro.invalid');await page.locator('#staff-access-form [name=role]').selectOption('chef');await page.getByRole('button',{name:'Update account access',exact:true}).click();await expect(page.locator('#staff-access-result')).toContainText('Account access updated');
 await page.getByRole('button',{name:'Upload menu photographs',exact:true}).click();await expect(page.locator('#photo-upload-result')).toContainText('40 licensed photos stored in Supabase');
 expect(fixture.uploads.size).toBe(40);expect(fixture.linked.size).toBe(40);expect([...fixture.uploads.keys()].every(path=>/^files\/[a-z0-9-]+-[a-f0-9]{12}\.jpg$/.test(path))).toBe(true);
 await page.getByRole('button',{name:'Upload menu photographs',exact:true}).click();await expect(page.locator('#photo-upload-result')).toContainText('40 licensed photos stored in Supabase');expect(fixture.uploads.size).toBe(40);
 await page.goto(SITE+'admin/#menu');await expect(page.locator('.table-dish img').first()).toHaveAttribute('src',new RegExp(CLOUD.replaceAll('.','\\.')+'/storage/v1/object/public/menu-images/files/'));
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page).toHaveURL(/\/auth\/\?portal=admin/);await expect(page.locator('#auth-form')).toBeVisible();
});

test('changed database roles override an existing login session on the next page load',async({page,context})=>{
 const fixture=cloudFixture();await fixture.attach(context);await signIn(page,'chef');await expect(page).toHaveURL(SITE+'kitchen/');await expect(page.locator('[data-ticket]')).toHaveCount(1);
 fixture.roles.set(fixture.users.find(user=>user.role==='chef').id,'customer');await page.reload();await expect(page).toHaveURL(SITE);await expect(page.getByRole('navigation',{name:'Main navigation'})).not.toContainText('Kitchen Display');await expect(page.locator('#demo-role-nav')).toHaveCount(0);
});

test('password reset requests use the project auth callback and show an honest email notice',async({page,context})=>{
 const fixture=cloudFixture();await fixture.attach(context);await page.goto(SITE+'auth/');await expect(page.locator('#auth-form')).toBeVisible();await page.getByRole('button',{name:'Forgot your password?',exact:true}).click();await page.locator('[name=email]').fill('customer@bitesbro.invalid');await page.getByRole('button',{name:'Send reset link',exact:true}).click();await expect(page.locator('#auth-status')).toContainText('If this email has an account');expect(fixture.calls.some(call=>call.path.endsWith('/recover'))).toBe(true);
});
