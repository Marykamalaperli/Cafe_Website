import {test,expect} from '@playwright/test';
import {cloudFixture,signIn,SITE} from './helpers/cloud-browser.js';
test('admin task filters respect dates and recover cleanly from empty search on mobile',async({page,context})=>{
 const fixture=cloudFixture();await fixture.attach(context);const template=structuredClone(fixture.orders[0]);fixture.orders.length=0;
 for(const [reference,status,deliveryStatus] of [['BB-PREP','preparing','unassigned'],['BB-ASSIGN','ready','unassigned'],['BB-PICKUP','ready','assigned'],['BB-DRIVE','collected','out_for_delivery'],['BB-DONE','collected','delivered']])fixture.orders.push({...structuredClone(template),reference,status,fulfilment:'delivery',delivery:{status:deliveryStatus,version:10,timeline:[]}});
 fixture.orders.push({...structuredClone(template),reference:'BB-OLD-ASSIGN',status:'ready',fulfilment:'delivery',createdAt:'2020-01-01T00:00:00Z',delivery:{status:'unassigned',version:10,timeline:[]}});
 await signIn(page,'admin');await expect(page).toHaveURL(SITE+'admin/');await page.locator('[data-panel-link=orders]').click();
 await page.getByRole('button',{name:'Assign partner',exact:true}).click();await expect(page.locator('[data-order-row]')).toHaveCount(1);await expect(page.locator('#admin-orders')).toContainText('BB-ASSIGN');await expect(page.locator('#admin-orders')).not.toContainText('BB-OLD-ASSIGN');
 await page.getByRole('button',{name:'Delivery in progress',exact:true}).click();await expect(page.locator('#admin-orders')).toContainText('BB-DRIVE');await expect(page.locator('#admin-orders')).not.toContainText('BB-DONE');
 await page.locator('#admin-order-search').fill('missing');await expect(page.getByRole('button',{name:'Clear order filters',exact:true})).toBeVisible();await page.getByRole('button',{name:'Clear order filters',exact:true}).click();await expect(page.locator('[data-order-row]')).toHaveCount(5);
 for(const width of [320,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await expect(page.getByRole('button',{name:'View BB-ASSIGN',exact:true})).toBeVisible();}
 await page.setViewportSize({width:360,height:900});await page.screenshot({path:'test-results/admin-task-mobile.png',fullPage:true});
});

test('private history shows a safe loading message until configuration is ready',async({page,context})=>{
 const fixture=cloudFixture();await fixture.attach(context);let release;const ready=new Promise(resolve=>{release=resolve;});
 await context.route('**/supabase-config.json',async route=>{await ready;await route.fallback();});
 try{await page.goto(SITE+'orders/',{waitUntil:'domcontentloaded'});await expect(page.locator('.ops-access-loading')).toBeVisible();await expect(page.locator('main')).toBeHidden();}
 finally{release();}
 await expect(page.getByRole('heading',{name:'No orders in this browser yet.',exact:true})).toBeVisible();await expect(page.locator('.ops-access-loading')).toBeHidden();
});
