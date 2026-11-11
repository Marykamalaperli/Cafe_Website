import { demoMetrics } from './demo-model.js';
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'});
export const bangaloreDay=value=>formatter.format(new Date(value));
const shift=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
export function reportPeriod(kind='day',date=bangaloreDay(new Date())) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||shift(date,0)!==date)throw new Error('Choose a valid report date.');
 let start=date,end=shift(date,1);
 if(kind==='week'){const weekday=new Date(date+'T00:00:00Z').getUTCDay();start=shift(date,-((weekday+6)%7));end=shift(start,7);}
 else if(kind==='month'){start=date.slice(0,7)+'-01';end=new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7)),1)).toISOString().slice(0,10);}
 else if(kind==='all'){start=null;end=null;}
 else if(kind!=='day')throw new Error('Choose a supported reporting period.');
 return{kind,date,start,end,includes:value=>{const day=bangaloreDay(value);return(!start||day>=start)&&(!end||day<end);}};
}
export function adminReport(state,period) {
 const orders=state.orders.filter(order=>period.includes(order.createdAt));
 const scoped={...state,orders,activity:state.activity.filter(event=>period.includes(event.at))};
 const metrics=demoMetrics(scoped);
 const groups=new Map();
 // Finite periods include quiet days. All-time lists only dates with orders.
 if(period.start)for(let date=period.start;date<period.end;date=shift(date,1))groups.set(date,[]);
 for(const order of orders){const date=bangaloreDay(order.createdAt);if(!groups.has(date))groups.set(date,[]);groups.get(date).push(order);}
 metrics.days=[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([date,items])=>({date,orders:items.length,collected:items.filter(order=>order.status==='collected').length,sales:items.filter(order=>order.status==='collected').reduce((sum,order)=>sum+order.total,0)}));
 return{state:scoped,metrics};
}
