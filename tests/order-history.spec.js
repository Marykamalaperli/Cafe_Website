import{test,expect}from'@playwright/test';
import{cloudFixture,signIn,SITE}from'./helpers/cloud-browser.js';

function savedOrder(fixture,{reference,owner,createdAt,status='collected',fulfilment='pickup'}){
 const order=structuredClone(fixture.orders[0]);
 Object.assign(order,{reference,owner,createdAt,status,fulfilment,requestId:crypto.randomUUID(),timeline:[{status:'received',at:createdAt},...(status==='collected'?[{status:'preparing',at:createdAt},{status:'ready',at:createdAt},{status:'collected',at:createdAt}]:[])]});
 if(fulfilment==='delivery')order.delivery={status:'unassigned',timeline:[]};
 fixture.orders.push(order);return order;
}
const refreshVisible=page=>page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));

test('main navigation opens a useful guest history page without requiring signup or creating a session',async({page,context})=>{
 const fixture=cloudFixture();await fixture.attach(context);await page.goto(SITE);
 const link=page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'My orders',exact:true});
 await expect(link).toBeVisible();await link.click();await expect(page).toHaveURL(SITE+'orders/');
 await expect(page).toHaveTitle('Your orders — BitesBro');await expect(page.getByRole('heading',{name:'No orders in this browser yet.',exact:true})).toBeVisible();
 await expect(page.locator('#history-session-info')).toContainText('browser that placed the order');await expect(page.getByRole('link',{name:'Sign in to your account',exact:true})).toBeVisible();await expect(page.locator('#history-search-field')).toBeHidden();
 expect(fixture.guestUsers).toHaveLength(0);expect(fixture.calls.some(call=>call.path.endsWith('/get_order_history')||call.path.endsWith('/get_operations'))).toBe(false);
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const width of[320,360,768,1024,1440]){
  await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if(await page.locator('#nav-toggle').isVisible()){
   await page.getByRole('button',{name:'Open navigation',exact:true}).click();await expect(page.locator('#main-nav a[aria-current=page]')).toHaveText('My orders');await page.keyboard.press('Escape');await expect(page.locator('#nav-toggle')).toBeFocused();await expect(page.locator('#nav-toggle')).toHaveAttribute('aria-expanded','false');
  }else await expect(page.locator('#main-nav a[aria-current=page]')).toBeVisible();
 }
 await page.setViewportSize({width:360,height:900});await page.screenshot({path:'test-results/order-history-visitor-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Order food',exact:true}).click();await expect(page).toHaveURL(SITE+'#menu');await expect(page.locator('#menu-count')).toContainText('50 dishes');
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'My orders',exact:true}).click();await expect(page).toHaveURL(SITE+'orders/');await expect(page.locator('#nav-toggle')).toHaveAttribute('aria-expanded','false');
});

test('registered customers with no orders receive a menu invitation rather than a missing-order error',async({page,context})=>{
 const fixture=cloudFixture();await fixture.attach(context);await signIn(page,'customer');await expect(page).toHaveURL(SITE);
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'My orders',exact:true}).click();await expect(page.getByRole('heading',{name:'Your first bite starts here.',exact:true})).toBeVisible();await expect(page.locator('#history-title')).toHaveText('Order history');await expect(page.locator('#history-policy')).toContainText('5 orders per page');await expect(page.locator('#history-active-count')).toHaveText('0');await expect(page.getByRole('link',{name:'Sign in to your account',exact:true})).toHaveCount(0);
});

test('the existing version-six server remains usable while the owner prepares the history migration',async({page,context})=>{
 const fixture=cloudFixture({historyReady:false});await fixture.attach(context);
 const owner=fixture.users.find(user=>user.role==='customer').id;
 for(let i=1;i<=7;i++)savedOrder(fixture,{reference:'BB-LEGACY-'+i,owner,createdAt:new Date(1700000000000+i*1000).toISOString()});
 await signIn(page,'customer');await expect(page).toHaveURL(SITE);await page.goto(SITE+'orders/');await expect(page.locator('#order-history > li')).toHaveCount(5);await expect(page.locator('#history-range')).toHaveText('1–5 of 7 orders');
 await page.getByRole('button',{name:'Older orders',exact:true}).click();await expect(page.locator('#order-history > li')).toHaveCount(2);await expect(page.locator('#tracking-reference')).toHaveText('BB-LEGACY-2');
 expect(fixture.calls.some(call=>call.path.endsWith('/get_order_history'))).toBe(true);expect(fixture.calls.some(call=>call.path.endsWith('/get_operations'))).toBe(true);
});

test('members see five orders per page and retrieve older history by pagination, reference search and private links',async({page,context})=>{
 const fixture=cloudFixture();await fixture.attach(context);
 const owner=fixture.users.find(user=>user.role==='customer').id;
 for(let i=1;i<=12;i++)savedOrder(fixture,{reference:'BB-MEMBER-'+String(i).padStart(2,'0'),owner,createdAt:new Date(1700000000000+i*1000).toISOString(),status:i===1?'received':'collected'});
 await signIn(page,'customer');await expect(page).toHaveURL(SITE);await page.goto(SITE+'orders/?order=BB-MEMBER-01');
 await expect(page.locator('#order-history > li')).toHaveCount(5);await expect(page.locator('#history-range')).toHaveText('1–5 of 12 orders');await expect(page.locator('#tracking-reference')).toHaveText('BB-MEMBER-01');
 await expect(page.locator('#order-history')).not.toContainText('BB-ORDER-OTHER');
 await page.getByRole('button',{name:'Older orders',exact:true}).click();await expect(page.locator('#history-range')).toHaveText('6–10 of 12 orders');await expect(page.locator('#tracking-reference')).toHaveText('BB-MEMBER-07');
 await page.getByRole('button',{name:'Older orders',exact:true}).click();await expect(page.locator('#order-history > li')).toHaveCount(2);await expect(page.locator('#history-range')).toHaveText('11–12 of 12 orders');await expect(page.locator('#history-older')).toBeDisabled();
 await page.getByRole('button',{name:'Newer orders',exact:true}).click();await expect(page.locator('#order-history > li')).toHaveCount(5);
 await page.locator('#history-search').fill('member-01');await expect(page.locator('#order-history > li')).toHaveCount(1);await expect(page.locator('#tracking-reference')).toHaveText('BB-MEMBER-01');await expect(page.locator('#history-pagination')).toBeHidden();
 await page.locator('#history-search').fill('BB-ORDER-OTHER');await expect(page.locator('#order-history')).toHaveText('No matching orders.');await expect(page.locator('#tracking-detail')).toContainText('outside your available history');await expect(page.locator('#active-history-section')).toBeHidden();
 await page.locator('#history-search').fill('');await expect(page.locator('#history-range')).toHaveText('1–5 of 12 orders');
 await expect(page.locator('.history-footer-brand')).toContainText('BitesBro');await expect(page.locator('#history-jump')).toBeVisible();await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});await page.screenshot({path:'test-results/order-history-member-desktop.png',fullPage:true});
 expect(fixture.orders).toHaveLength(13);expect(await page.evaluate(()=>localStorage.getItem('bitesbro.demo.v1'))).toBeNull();
});

test('guest redirects after checkout, sees three recent orders, and follows an older active delivery through kitchen and admin completion',async({browser})=>{
 const customerContext=await browser.newContext(),chefContext=await browser.newContext(),adminContext=await browser.newContext(),fixture=cloudFixture();
 try{
  for(const context of[customerContext,chefContext,adminContext])await fixture.attach(context);
  const customer=await customerContext.newPage(),chef=await chefContext.newPage(),admin=await adminContext.newPage();
  await customer.goto(SITE);await customer.getByRole('button',{name:'Add Bangalore Masala Dosa to bag',exact:true}).click();await customer.locator('#dish-add').click();await customer.getByRole('button',{name:'Open bag, 1 item',exact:true}).click();
  const form=customer.locator('#order-form');for(const [name,value]of Object.entries({name:'Guest history fixture',email:'guest@fixture.invalid',phone:'9000000000',date:'2030-06-01'}))await form.locator(`[name=${name}]`).fill(value);
  await form.locator('[name=time]').selectOption('10:00');await form.locator('[name=consent]').check();await form.getByRole('button',{name:'Place food order',exact:false}).click();
  await expect(customer).toHaveURL(SITE+'orders/?order=BB-ORDER-TEST1');await expect(customer.locator('#tracking-reference')).toHaveText('BB-ORDER-TEST1');
  const owner=fixture.guestUsers[0].id,placed=fixture.orders.find(order=>order.owner===owner),instant=Date.parse(placed.createdAt);
  savedOrder(fixture,{reference:'BB-GUEST-01',owner,createdAt:new Date(instant-4000).toISOString()});
  const active=savedOrder(fixture,{reference:'BB-GUEST-02',owner,createdAt:new Date(instant-3000).toISOString(),status:'received',fulfilment:'delivery'});
  for(let i=4;i<=5;i++)savedOrder(fixture,{reference:'BB-GUEST-0'+i,owner,createdAt:new Date(instant+i*1000).toISOString()});
  await customer.reload();await expect(customer.locator('#order-history > li')).toHaveCount(3);await expect(customer.locator('#order-history')).not.toContainText('BB-GUEST-01');await expect(customer.locator('#history-pagination')).toBeHidden();
  await customer.locator('#active-order-history a').click();await expect(customer.locator('#tracking-reference')).toHaveText(active.reference);await expect(customer.locator('.delivery-timeline > li')).toHaveCount(5);await expect(customer.getByRole('button',{name:'Mark out for delivery',exact:true})).toHaveCount(0);
  await signIn(chef,'chef');await expect(chef).toHaveURL(SITE+'kitchen/');const ticket=chef.locator(`[data-ticket="${active.reference}"]`);
  await ticket.getByRole('button',{name:'Start preparing',exact:true}).click();await refreshVisible(customer);await expect(customer.locator('#tracking-detail .status-chip')).toHaveText('Preparing');
  await ticket.getByRole('button',{name:'Mark ready',exact:true}).click();await refreshVisible(customer);await expect(customer.locator('#tracking-detail .status-chip')).toHaveText('Ready');await expect(ticket.getByRole('button',{name:'Mark collected',exact:true})).toHaveCount(0);await expect(ticket.getByRole('button',{name:'Mark out for delivery',exact:true})).toHaveCount(0);
  await signIn(admin,'admin');await expect(admin).toHaveURL(SITE+'admin/');await admin.getByRole('link',{name:/Orders/}).click();await admin.locator('#admin-order-search').fill(active.reference);await admin.getByRole('button',{name:'View order '+active.reference,exact:true}).click();
  await admin.getByRole('button',{name:'Mark out for delivery',exact:true}).click();await expect(admin.locator('#order-dialog-content .status-chip')).toHaveText('Out for delivery');await refreshVisible(customer);await expect(customer.locator('#tracking-detail .status-chip')).toHaveText('Out for delivery');await expect(customer.locator('.delivery-timeline [aria-current=step]')).toContainText('Out for delivery');
  for(const width of[320,360,768,1440]){await customer.setViewportSize({width,height:1000});expect(await customer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
  await customer.locator('#history-jump').click();await expect(customer).toHaveURL(/#tracking-detail$/);await expect(customer.locator('#tracking-reference')).toBeInViewport();await customer.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});await customer.screenshot({path:'test-results/order-delivery-tracking.png',fullPage:true});
  await admin.getByRole('button',{name:'Mark delivered',exact:true}).click();await expect(admin.locator('#order-dialog-content .status-chip')).toHaveText('Delivered');await refreshVisible(customer);await expect(customer.locator('#active-history-section')).toBeHidden();await expect(customer.locator('#tracking-detail')).toContainText('outside your available history');await expect(customer.locator('#order-history > li')).toHaveCount(3);
  await customer.goto(SITE+'orders/?order=BB-GUEST-01');await expect(customer.locator('#tracking-detail')).toContainText('outside your available history');
  await admin.locator('#order-dialog [data-close-dialog]').click();await admin.locator('#admin-order-status').selectOption('delivered');await expect(admin.locator('#admin-orders')).toContainText(active.reference);expect(fixture.orders.filter(order=>order.owner===owner)).toHaveLength(5);
 }finally{await customerContext.close();await chefContext.close();await adminContext.close();}
});
