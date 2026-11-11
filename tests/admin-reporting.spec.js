import {test,expect} from '@playwright/test';
import {cloudFixture,signIn,SITE} from './helpers/cloud-browser.js';
test('admin defaults to today, explores historical day/week/month/all time, and returns to today',async({page,context})=>{
 const fixture=cloudFixture();await fixture.attach(context);
 await page.clock.install({time:new Date('2026-11-11T08:00:00Z')});
 const template=structuredClone(fixture.orders[0]);fixture.orders.length=0;
 for(const [reference,createdAt,total,status] of [['BB-TODAY','2026-11-11T07:00:00Z',15000,'collected'],['BB-YESTERDAY','2026-11-10T07:00:00Z',22000,'collected'],['BB-OCTOBER','2026-10-10T07:00:00Z',33000,'collected'],['BB-CANCELLED','2026-11-11T07:30:00Z',90000,'cancelled']])fixture.orders.push({...structuredClone(template),reference,createdAt,total,status});
 await signIn(page,'admin');await expect(page.locator('#admin-stats [data-metric=sales]')).toContainText('₹150');
 await expect(page.locator('#admin-stats [data-metric=total]')).toContainText('2');
 await page.locator('[data-panel-link=orders]').click();await expect(page.locator('#admin-orders')).toContainText('BB-TODAY');await expect(page.locator('#admin-orders')).not.toContainText('BB-YESTERDAY');
 await page.locator('[data-panel-link=reports]').click();await page.locator('#admin-report-date').fill('2026-11-10');
 await expect(page.locator('#report-stats [data-metric=sales]')).toContainText('₹220');await expect(page.locator('#daily-summary tbody tr')).toHaveCount(1);
 await page.locator('#admin-period').selectOption('week');await expect(page.locator('#report-stats [data-metric=sales]')).toContainText('₹370');await expect(page.locator('#daily-summary tbody tr')).toHaveCount(7);
 await page.locator('#admin-period').selectOption('month');await expect(page.locator('#report-stats [data-metric=sales]')).toContainText('₹370');await expect(page.locator('#daily-summary tbody tr')).toHaveCount(30);
 await page.locator('#admin-period').selectOption('all');await expect(page.locator('#report-stats [data-metric=sales]')).toContainText('₹700');
 await page.getByRole('button',{name:'Back to today',exact:true}).click();await expect(page.locator('#report-stats [data-metric=sales]')).toContainText('₹150');await expect(page.locator('#admin-period')).toHaveValue('day');
 await page.locator('#admin-report-date').fill('2026-10-10');await page.locator('[data-panel-link=overview]').click();await expect(page.locator('#admin-report-date')).toHaveValue('2026-11-11');await expect(page.locator('#admin-stats [data-metric=sales]')).toContainText('₹150');
 await page.reload();await expect(page.locator('#admin-stats [data-metric=sales]')).toContainText('₹150');
 for(const width of [320,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
});
