// Pure presentation fallback for the fictional demo and pre-migration servers.
// Cloud SQL independently enforces guest visibility and member pagination.
export function isActiveOrder(order) {
 if (order.status === 'cancelled') return false;
 if (order.fulfilment === 'delivery' && order.delivery) return order.delivery.status !== 'delivered';
 return order.status !== 'collected';
}
export function orderHistory(orders, { guest = true, page = 0, search = '', reference } = {}) {
 const sorted = [...orders].sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt) || b.reference.localeCompare(a.reference,undefined,{numeric:true}));
 const available = guest ? sorted.slice(0,3) : sorted;
 const matching = available.filter(order => order.reference.toLowerCase().includes(search.trim().toLowerCase()));
 const pageSize = guest ? 3 : 5, currentPage = guest ? 0 : Math.max(0,page);
 const items = matching.slice(currentPage*pageSize,(currentPage+1)*pageSize), activeOrders = sorted.filter(isActiveOrder);
 const selectedOrder = available.find(order=>order.reference===reference) || activeOrders.find(order=>order.reference===reference) || null;
 return { history: { items, page:currentPage, pageSize, total:matching.length, guest, hasOlder:!guest&&(currentPage+1)*pageSize<matching.length, hasNewer:!guest&&currentPage>0, staffRecordsRetained:true }, activeOrders, selectedOrder };
}
export function visibleOrders(data) {
 return [...new Map([...(data.history?.items || data.orders || []),...(data.activeOrders || []),...(data.selectedOrder?[data.selectedOrder]:[])].map(order=>[order.reference,order])).values()];
}
