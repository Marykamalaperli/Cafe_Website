import{test,expect}from'@playwright/test';
const password='Demo-only-BitesBro-123!';
async function signIn(page,role,base){
 await page.goto(base+'auth/?reviewRole='+role);
 await page.locator('#auth-form').waitFor({state:'visible'});
 await page.locator('[name=email]').fill(`demo.${role}@bitesbro.invalid`);
 await page.locator('[name=password]').fill(password);await page.locator('#auth-submit').click();
 await expect(page).toHaveURL(base+(role==='admin'?'admin/':role==='chef'?'kitchen/':''));
}
for(const scenario of[
 {name:'Node review',base:'http://127.0.0.1:3210/'},
 {name:'GitHub Pages static review',base:'http://127.0.0.1:3212/Cafe_Website/review/',static:true}
])test(`${scenario.name}: YouPI claim → bank approval → chef → courier → email previews`,async({context})=>{
 test.setTimeout(60000);
 const{base}=scenario,customer=await context.newPage(),chef=await context.newPage(),admin=await context.newPage(),errors=[],external=[];
 context.on('request',request=>{if(/^https?:/.test(request.url())&&new URL(request.url()).origin!==new URL(base).origin)external.push(request.url());});
 for(const page of[customer,chef,admin])page.on('pageerror',error=>errors.push(error.message));
 if(scenario.static){await customer.goto(base+'review.html');await expect(customer.locator('#review-status')).toContainText('Ready.',{timeout:25000});}
 await signIn(customer,'customer',base);await signIn(chef,'chef',base);await signIn(admin,'admin',base);
 await expect(customer.locator('.review-banner')).toContainText('simulated');
 await customer.getByRole('button',{name:'Add Bangalore Masala Dosa to bag',exact:true}).click();
 await customer.locator('#dish-add').click();await customer.getByRole('button',{name:'Open bag, 1 item',exact:true}).click();
 const form=customer.locator('#order-form');await form.locator('[name=fulfilment]').selectOption('delivery');
 await form.locator('[name=address]').fill('Isolated review delivery address');await form.locator('[name=postcode]').fill('560001');await form.locator('[name=phone]').fill('9000000000');
 const date=await form.locator('[name=date]').getAttribute('min'),tomorrow=new Date(date+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);await form.locator('[name=date]').fill(tomorrow.toISOString().slice(0,10));await form.locator('[name=time]').selectOption('10:00');
 await form.locator('[name=paymentMethod]').selectOption('upi');await form.locator('[name=consent]').check();
 await form.getByRole('button',{name:'Place food order',exact:false}).click();
 await expect(customer.getByRole('dialog')).toContainText('YOUPI');
 if(scenario.static){await customer.setViewportSize({width:390,height:844});await customer.screenshot({path:'test-results/review-youpi-mobile.png'});expect(await customer.getByRole('dialog').evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);}
 await customer.getByRole('button',{name:'Submit demo UPI reference',exact:true}).click();
 await expect(customer.locator('#cart-content')).toContainText('awaiting administrator bank verification');
 const link=customer.getByRole('link',{name:'Track my order',exact:false}),reference=new URL(await link.getAttribute('href')).searchParams.get('order');await link.click();
 await expect(customer.locator('#tracking-detail')).toContainText('Bank reference awaiting review');
 await chef.reload();await expect(chef.locator(`[data-ticket="${reference}"]`)).toHaveCount(0);
 await admin.getByRole('link',{name:/05Settings|05 Settings/}).click();
 const receipt=admin.locator('#upi-review-list .delivery-card').filter({hasText:reference});await expect(receipt).toBeVisible({timeout:12000});
 await receipt.getByRole('button',{name:'Confirm bank receipt',exact:true}).click();await expect(receipt).toHaveCount(0);
 await chef.reload();const ticket=chef.locator(`[data-ticket="${reference}"]`);await expect(ticket).toBeVisible();await expect(ticket).not.toContainText('9000000000');await expect(ticket).not.toContainText('123456789012');
 await ticket.getByRole('button',{name:'Start preparing',exact:true}).click();await ticket.getByRole('button',{name:'Mark ready',exact:true}).click();
 await admin.getByRole('link',{name:'06 Deliveries',exact:true}).click();
 const delivery=admin.locator(`[data-courier-card="${reference}"]`);await expect(delivery).toBeVisible({timeout:12000});
 await delivery.locator('[name=latitude]').fill('12.98');await delivery.locator('[name=longitude]').fill('77.60');await delivery.getByRole('button',{name:'Get courier quote',exact:true}).click();
 await expect(delivery).toContainText('Quoted courier cost:');await delivery.getByRole('button',{name:/Book courier for/}).click();
 await expect(delivery).toContainText('Porter: booked');await delivery.getByRole('button',{name:'Simulate courier pickup',exact:true}).click();
 await delivery.getByRole('button',{name:'Simulate courier delivery',exact:true}).click();await expect(delivery).toContainText('Porter: delivered');
 await customer.reload();await expect(customer.locator('#tracking-detail')).toContainText('Delivered');await expect(customer.locator('#tracking-detail')).toContainText('Paid');
 await admin.getByRole('link',{name:/05Settings|05 Settings/}).click();await admin.getByRole('button',{name:'Process queued emails & refunds',exact:true}).click();await expect(admin.locator('#order-messages-result')).toContainText('3 email(s) submitted');
 await admin.getByRole('button',{name:'Preview simulated emails',exact:true}).click();await expect(admin.getByRole('dialog')).toContainText('Your BitesBro order is received');
 await expect(admin.getByRole('dialog')).toContainText(reference);expect(errors).toEqual([]);expect(external).toEqual([],'Review makes no production Supabase or provider requests.');
 await customer.reload();await expect(customer.locator('#tracking-detail')).toContainText('submitted to email provider');
 await expect(customer.locator('footer')).not.toContainText('no online payments');
 await customer.screenshot({path:`test-results/review-${scenario.static?'static':'node'}-delivered.png`,fullPage:true});
});

test('YouPI hosted checkout offers an authenticated bank-reference fallback without trusting the browser',async({page})=>{
 const base='http://127.0.0.1:3210/';
 // Exercise the hosted-checkout UI against the isolated API, without opening
 // an external portal or touching production Auth, funds or customer records.
 await page.route('**/supabase-config.json',async route=>{const response=await route.fetch(),config=await response.json();await route.fulfill({json:{...config,url:new URL(config.url,base).href,reviewSandbox:false}});});
 await signIn(page,'customer',base);
 await page.getByRole('button',{name:'Add Bangalore Masala Dosa to bag',exact:true}).click();await page.locator('#dish-add').click();await page.getByRole('button',{name:'Open bag, 1 item',exact:true}).click();
 const form=page.locator('#order-form');await form.locator('[name=phone]').fill('9000000000');const tomorrow=new Date((await form.locator('[name=date]').getAttribute('min'))+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);await form.locator('[name=date]').fill(tomorrow.toISOString().slice(0,10));await form.locator('[name=time]').selectOption('10:00');await form.locator('[name=consent]').check();await form.locator('[name=paymentMethod]').selectOption('upi');await form.getByRole('button',{name:'Place food order',exact:false}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.getByRole('link',{name:'Open YouPI checkout',exact:true})).toHaveAttribute('href',/^https:\/\/checkout\.youpi-simulator\.invalid\/checkout\//);
 await dialog.getByRole('button',{name:'Check gateway status',exact:true}).click();await expect(dialog.locator('[role=status]')).toContainText('INITIATED');
 await dialog.locator('summary').click();await dialog.locator('[name=bankReference]').fill('888888888888');await dialog.getByRole('button',{name:'Submit bank reference',exact:true}).click();
 await page.getByRole('link',{name:'Track my order',exact:false}).click();await expect(page.locator('#tracking-detail')).toContainText('Bank reference awaiting review');await expect(page.locator('#tracking-detail')).not.toContainText('Paid ·');
});
