import {test,expect} from '@playwright/test';
import axe from 'axe-core';
import {cloudFixture,signIn,SITE} from './helpers/cloud-browser.js';
async function check(page){
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=650){window.scrollTo(0,y);await new Promise(resolve=>requestAnimationFrame(resolve));}window.scrollTo(0,0);});
 await page.addScriptTag({content:axe.source});
 const violations=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return r.violations.map(v=>({rule:v.id,nodes:v.nodes.map(n=>({selector:n.target,reason:n.failureSummary}))}));});
 expect(violations).toEqual([]);
}
for(const width of [390,1440])test(`customer and staff screens meet automated WCAG checks at ${width}px`,async({page,context})=>{
 const fixture=cloudFixture();await fixture.attach(context);await page.setViewportSize({width,height:900});
 await page.goto(SITE);await expect(page.locator('.menu-card')).toHaveCount(12);await check(page);
 await page.goto(SITE+'auth/');await expect(page.locator('#auth-form')).toBeVisible();await check(page);
 await signIn(page,'customer');await expect(page).toHaveURL(SITE);await page.goto(SITE+'orders/');await expect(page.locator('#tracking-detail .history-empty')).toBeVisible();await check(page);
 await signIn(page,'admin','/Cafe_Website/admin/');await expect(page).toHaveURL(SITE+'admin/');await check(page);await page.locator('[data-panel-link=orders]').click();await check(page);
 await signIn(page,'chef','/Cafe_Website/kitchen/');await expect(page).toHaveURL(SITE+'kitchen/');await check(page);
});
