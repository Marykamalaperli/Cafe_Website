// Track arrivals, not status changes. The first snapshot never sounds an alarm.
export function createArrivalTracker() {
 let seen;
 return orders => {
  if (!seen) { seen = new Set(orders.map(order => order.reference)); return []; }
  const arrivals = orders.filter(order => order.status === 'received' && !seen.has(order.reference));
  for (const order of orders) seen.add(order.reference);
  return arrivals;
 };
}

export function mountKitchenAlerts({ showReceived, notify, initialOrders }) {
 const arrivals = createArrivalTracker(); arrivals(initialOrders);
 const button = document.createElement('button'); button.type = 'button'; button.className = 'ops-button ops-button-small kitchen-sound-toggle'; button.setAttribute('aria-pressed', 'false');
 const speaker = '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
 let enabled = false, audio; const pending = new Set();
 const label = () => { button.innerHTML = speaker + (enabled ? 'Sound on' : 'Sound off'); button.setAttribute('aria-pressed', String(enabled)); button.setAttribute('aria-label', enabled ? 'Sound on — disable new order sounds' : 'Sound off — enable new order sounds'); button.title = 'Sound alerts play while this kitchen display is open.'; };
 label(); document.querySelector('.ops-header-right').prepend(button);
 const notice = document.createElement('div'); notice.id = 'kitchen-arrival-note'; notice.className = 'kitchen-arrival-note'; notice.hidden = true;
 notice.innerHTML = '<p role="status"></p><button class="ops-button ops-button-small" type="button" data-show-received>View received orders</button><button class="icon-button" type="button" data-dismiss-arrivals aria-label="Dismiss new order alert">×</button>';
 document.querySelector('#kitchen-queue').before(notice);
 notice.querySelector('[data-show-received]').addEventListener('click', showReceived);
 notice.querySelector('[data-dismiss-arrivals]').addEventListener('click', () => { notice.hidden = true; pending.clear(); });
 function sound() {
  if (!enabled || !audio || audio.state !== 'running') return;
  for (const offset of [0, 0.18]) {
   const tone = audio.createOscillator(), gain = audio.createGain(), time = audio.currentTime + offset;
   tone.type = 'sine'; tone.frequency.value = offset ? 880 : 660; gain.gain.setValueAtTime(0.07, time); gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
   tone.connect(gain); gain.connect(audio.destination); tone.start(time); tone.stop(time + 0.16);
  }
 }
 button.addEventListener('click', async () => {
  if (enabled) { enabled = false; label(); return; }
  button.disabled = true;
  try {
   const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
   if (!Audio) throw new Error('This browser cannot play alerts. New orders will still have a visible notice.');
   audio ||= new Audio(); await audio.resume();
   if (audio.state !== 'running') throw new Error('Allow sound for this website, then try enabling alerts again.');
   enabled = true; label(); sound();
  } catch (error) { notify(error.message, true); }
  finally { button.disabled = false; }
 });
 window.addEventListener('pagehide', () => { audio?.close().catch(() => {}); }, { once: true });
 return { update(orders) {
  const incoming = arrivals(orders);
  for (const order of incoming) pending.add(order.reference);
  for (const reference of pending) if (!orders.some(order => order.reference === reference && order.status === 'received')) pending.delete(reference);
  if (incoming.length) { notice.hidden = false; sound(); }
  if (!pending.size) notice.hidden = true;
  notice.querySelector('[role=status]').textContent = `${pending.size} new ${pending.size === 1 ? 'order is' : 'orders are'} waiting in Received.`;
 } };
}
