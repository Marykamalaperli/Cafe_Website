import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bangaloreDay,reportPeriod,adminReport} from '../public/shared/admin-reporting.js';
const order=(createdAt,status='collected',total=10000)=>({createdAt,status,total,items:[{id:'dosa',name:'Dosa',quantity:1}]});
const state={orders:[order('2026-11-10T18:29:59Z'),order('2026-11-10T18:30:00Z'),order('2026-11-11T18:29:59Z','received'),order('2026-11-11T18:30:00Z'),order('2026-10-31T00:00:00Z')],menu:[],activity:[{at:'2026-11-10T18:29:59Z'},{at:'2026-11-10T18:30:00Z'}]};
test('daily orders, revenue, popularity and activity use Bangalore midnight boundaries',()=>{
 const {state:scoped,metrics}=adminReport(state,reportPeriod('day','2026-11-11'));
 assert.equal(bangaloreDay('2026-11-10T18:30:00Z'),'2026-11-11');
 assert.equal(metrics.totalOrders,2);assert.equal(metrics.sales,10000);assert.equal(metrics.counts.received,1);assert.equal(metrics.popular[0].quantity,2);assert.equal(scoped.activity.length,1);assert.equal(metrics.days.length,1);assert.equal(state.orders.length,5);
});
test('calendar weeks, leap months, all time and empty days are complete',()=>{
 const week=reportPeriod('week','2026-11-15');assert.equal(week.start,'2026-11-09');assert.equal(week.end,'2026-11-16');assert.equal(adminReport(state,week).metrics.days.length,7);
 const month=reportPeriod('month','2024-02-29');assert.equal(month.end,'2024-03-01');assert.equal(adminReport(state,month).metrics.days.length,29);
 assert.equal(adminReport(state,reportPeriod('all','2026-11-11')).metrics.totalOrders,5);
 assert.equal(adminReport(state,reportPeriod('day','2026-01-01')).metrics.sales,0);
 assert.throws(()=>reportPeriod('day','2026-02-30'));
});
