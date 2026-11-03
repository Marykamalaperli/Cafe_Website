import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
async function tomorrow(page){const cafe=await(await page.request.get('/api/cafe')).json();const date=new Date(cafe.today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10);}
async function addDish(page,name,options={}){
 await page.getByRole('button',{name:'Add '+name+' to bag',exact:true}).click();
 const dialog=page.locator('#dish-dialog');await expect(dialog).toBeVisible();
 if(options.variant)await dialog.locator('[name=variant]').selectOption(options.variant);
 if(options.spice)await dialog.locator('[name=spice]').selectOption(options.spice);
 if(options.addon)await dialog.getByLabel(options.addon,{exact:false}).check();
 await dialog.getByRole('button',{name:/^Add to order/}).click();
}
async function customer(form,email){await form.locator('[name=name]').fill('Food Test Guest');await form.locator('[name=email]').fill(email);await form.locator('[name=phone]').fill('+91 90000 00000');await form.locator('[name=consent]').check();}
async function chooseTime(form,date,time='10:00'){
 await form.locator('[name=date]').fill(date);const select=form.locator('[name=time]');await expect(select).toBeEnabled();await expect(select.locator(`option[value="${time}"]`)).toHaveCount(1);await select.selectOption(time);
}

test('new food homepage renders local assets, South Indian dishes and full catalogue count without errors',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.goto('/');await expect(page).toHaveTitle('BitesBro — Good food. Great moods.');
 await expect(page.locator('.menu-card')).toHaveCount(12);await expect(page.locator('#menu-count')).toContainText('50 dishes');
 await expect(page.locator('#hero-title')).toContainText('Good food.');await expect(page.locator('#hero-title')).toContainText('Great moods.');
 await expect(page.locator('#visit-address')).toContainText('Bangalore');
 for(const image of await page.locator('main img').all())await image.scrollIntoViewIfNeeded();
 await expect.poll(()=>page.locator('main img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);
 for(const el of await page.locator('.reveal').all()){await el.scrollIntoViewIfNeeded();await expect(el).toHaveClass(/is-visible/);}
 await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:'test-results/bitesbro-food-desktop.png',fullPage:true,animations:'disabled'});
 expect(errors).toEqual([]);
});

test('cuisine, diet, ingredient search, price sorting and pagination work together',async({page})=>{
 await page.goto('/');await expect(page.locator('.menu-card')).toHaveCount(12);
 await page.getByRole('button',{name:'South Indian',exact:true}).click();await expect(page.locator('#menu-count')).toContainText('16 dishes');
 await page.getByRole('button',{name:'More good food'}).click();await expect(page.locator('.menu-card')).toHaveCount(16);
 await page.locator('#diet-filter').selectOption('non-veg');await expect(page.locator('.menu-card')).toHaveCount(1);await expect(page.locator('.menu-card h3')).toHaveText('Chettinad Chicken Dosa');
 await page.locator('#diet-filter').selectOption('all');await page.getByRole('button',{name:'All cravings',exact:true}).click();
 await page.getByRole('searchbox').fill('samosa');await expect(page.locator('.menu-card')).toHaveCount(1);await expect(page.locator('.menu-card h3')).toHaveText('Punjabi Samosa');
 await page.getByRole('searchbox').fill('not on the menu');await expect(page.getByText('No bites found. Yet.')).toBeVisible();await page.getByRole('button',{name:'Show the whole menu'}).click();
 await page.locator('#sort-filter').selectOption('price-low');await expect(page.locator('.menu-card h3').first()).toHaveText('Garlic Butter Naan');
});

test('customised food persists across reloads and checkout uses server-calculated prices',async({page})=>{
 await page.goto('/');await addDish(page,'Bangalore Masala Dosa',{variant:'ghee-roast',spice:'mild',addon:'Extra sambar'});
 await page.getByRole('button',{name:'Open bag, 1 item',exact:true}).click();await page.getByRole('button',{name:'Add one Bangalore Masala Dosa',exact:true}).click();await page.reload();
 await page.getByRole('button',{name:'Open bag, 2 items',exact:true}).click();await expect(page.locator('#cart-total')).toHaveText('₹320');await expect(page.locator('#cart-content')).toContainText('Ghee-roasted · mild spice · Extra sambar');
 const form=page.locator('#order-form');await customer(form,'custom-food@example.com');await chooseTime(form,await tomorrow(page));
 const response=page.waitForResponse(r=>r.url().endsWith('/api/orders')&&r.request().method()==='POST');await form.getByRole('button',{name:'Place food order'}).click();
 const data=await(await response).json();expect(data.total).toBe(32000);expect(data.reference).toMatch(/^BB-ORDER-/);await expect(page.locator('#cart-content')).toContainText(data.reference);await expect(page.locator('#bag-count')).toHaveText('0');
});

test('two portions of the same dish stay as distinct bag lines',async({page})=>{
 await page.goto('/');await addDish(page,'Bangalore Masala Dosa',{variant:'regular'});await addDish(page,'Bangalore Masala Dosa',{variant:'ghee-roast'});
 await page.getByRole('button',{name:'Open bag, 2 items',exact:true}).click();await expect(page.locator('.cart-item')).toHaveCount(2);await expect(page.locator('#cart-total')).toHaveText('₹265');
});

test('Bangalore delivery checkout requires an address and applies the actual fee',async({page})=>{
 await page.goto('/');await addDish(page,'Bangalore Masala Dosa');await page.getByRole('button',{name:'Open bag, 1 item',exact:true}).click();
 const form=page.locator('#order-form');await form.locator('[name=fulfilment]').selectOption('delivery');await expect(form.locator('[name=address]')).toHaveAttribute('required','');
 await expect(page.locator('#cart-delivery')).toHaveText('₹40');await expect(page.locator('#cart-total')).toHaveText('₹160');
 await form.locator('[name=address]').fill('12 Test Street, Bangalore');await form.locator('[name=postcode]').fill('560001');await form.locator('[name=instructions]').fill('Please ring the bell.');
 await customer(form,'delivery-food@example.com');await chooseTime(form,await tomorrow(page),'18:00');
 const response=page.waitForResponse(r=>r.url().endsWith('/api/orders')&&r.request().method()==='POST');await form.getByRole('button',{name:'Place food order'}).click();
 const data=await(await response).json();expect(data.fulfilment).toBe('delivery');expect(data.deliveryFee).toBe(4000);expect(data.total).toBe(16000);await expect(page.locator('#cart-content')).toContainText('no delivery is dispatched');
});

test('South Indian signature opens a real customiser with ingredient and allergen information',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Customise Bangalore Masala Dosa',exact:true}).click();
 await expect(page.locator('#dish-title')).toHaveText('Bangalore Masala Dosa');await expect(page.locator('#dish-detail')).toContainText('Mustard');await expect(page.locator('#dish-detail')).toContainText('Rice, urad dal, potato');
 await page.locator('#dish-variant').selectOption('ghee-roast');await expect(page.locator('#dish-add')).toContainText('₹145');await page.keyboard.press('Escape');
 await expect(page.getByRole('button',{name:'Customise Bangalore Masala Dosa',exact:true})).toBeFocused();
});

test('dining reservation continues to reduce real seat availability',async({page})=>{
 await page.goto('/');const date=await tomorrow(page);const before=await(await page.request.get('/api/availability?date='+date)).json();
 const form=page.locator('#reservation-form');await customer(form,'food-table@example.com');await chooseTime(form,date);await form.getByRole('button',{name:'Save me a seat'}).click();await expect(form.locator('.form-result')).toContainText('BB-TABLE-');
 const after=await(await page.request.get('/api/availability?date='+date)).json();expect(after.slots[0].seatsLeft).toBe(before.slots[0].seatsLeft-2);
});

test('contact, newsletter and privacy dialog retain their server connections',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Say a little hello',exact:true}).click();
 const contact=page.locator('#contact-form');await contact.locator('[name=name]').fill('Food Guest');await contact.locator('[name=email]').fill('food-contact@example.com');await contact.locator('[name=message]').fill('Please tell me more about your South Indian menu.');await contact.locator('[name=consent]').check();await contact.getByRole('button',{name:'Send a little hello'}).click();await expect(contact.locator('.form-result')).toContainText('BB-HELLO-');await page.getByRole('button',{name:'Close contact form'}).click();
 const newsletter=page.locator('#newsletter-form');await newsletter.getByRole('button',{name:'Privacy notice',exact:true}).click();await expect(page.locator('#privacy-dialog')).toBeVisible();await page.keyboard.press('Escape');
 await newsletter.locator('[name=email]').fill('food-news@example.com');await newsletter.locator('[name=consent]').check();await newsletter.getByRole('button',{name:'Join the BitesBro newsletter'}).click();await expect(newsletter.locator('.form-result')).toContainText('You’re on the list!');
});

test('mobile bag and all responsive layouts stay within the viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.locator('#main-nav').getByRole('link',{name:'Order food'}).click();await expect(page.locator('#nav-toggle')).toHaveAttribute('aria-expanded','false');
 await addDish(page,'Idli Sambar');await expect(page.locator('#mobile-bag-total')).toHaveText('₹80');await page.getByRole('button',{name:'View your bag',exact:true}).click();await expect(page.locator('#cart-total')).toHaveText('₹80');await page.getByRole('button',{name:'Close bag'}).click();
 for(const width of [320,375,390,640,768,1024,1440]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow at '+width).toBe(true);}
 await page.setViewportSize({width:390,height:844});for(const el of await page.locator('.reveal').all()){await el.scrollIntoViewIfNeeded();await expect(el).toHaveClass(/is-visible/);}await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'test-results/bitesbro-food-mobile.png',fullPage:true,animations:'disabled'});
});

test('reduced motion and pause controls work while dialog focus is restored',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await expect(page.locator('.ticker-track')).toHaveCSS('animation-name','none');await expect(page.locator('.story-copy')).toHaveCSS('opacity','1');
 await page.getByRole('button',{name:'Open bag, 0 items',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Open bag, 0 items',exact:true})).toBeFocused();
 await page.emulateMedia({reducedMotion:'no-preference'});await page.getByRole('button',{name:'Pause animations',exact:true}).click();await expect(page.locator('.ticker-track')).toHaveCSS('animation-play-state','paused');
});

test('built GitHub Pages site displays the new food catalogue and honest browse-only checkout',async({page})=>{
 const root=resolve('_site');const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
 await page.route('**/api/**',r=>r.fulfill({status:404,contentType:'text/plain',body:'GitHub Pages has no backend'}));
 await page.route('**/Cafe_Website/**',async route=>{const pathname=new URL(route.request().url()).pathname;const relative=decodeURIComponent(pathname.slice('/Cafe_Website/'.length))||'index.html';const file=resolve(root,relative);if(!file.startsWith(root+'/'))return route.fulfill({status:404});try{await route.fulfill({status:200,contentType:mime[extname(file)]||'application/octet-stream',body:await readFile(file)});}catch{await route.fulfill({status:404});}});
 const assetRequests=[];page.on('request',r=>{if(r.url().includes('/assets/'))assetRequests.push(new URL(r.url()).pathname);});
 await page.goto('/Cafe_Website/');await expect(page.locator('#hero-title')).toContainText('Good food.');await expect(page.locator('.menu-card')).toHaveCount(12);await expect(page.locator('#menu-count')).toContainText('50 dishes');await expect(page.locator('#connection-note')).toContainText('Sample menu view');
 await addDish(page,'Bangalore Masala Dosa');await page.getByRole('button',{name:'Open bag, 1 item',exact:true}).click();await expect(page.locator('#cart-total')).toHaveText('₹120');await expect(page.locator('#order-form button[type=submit]')).toBeDisabled();await expect(page.locator('#order-form .form-result')).toContainText('server is not connected');
 expect(assetRequests.length).toBeGreaterThan(5);expect(assetRequests.every(path=>path.startsWith('/Cafe_Website/assets/'))).toBe(true);
});
