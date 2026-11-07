import { createDemoStore, DEMO_KEY } from './demo-model.js?v=portal-auth-1';

let connection;
export function connectDemoStore() {
 if (!connection) connection = (async () => {
  const response = await fetch(new URL('../menu.json?v=three-roles-1', import.meta.url), { cache: 'no-cache', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('The sample menu could not load. Please retry.');
  const catalogue = await response.json();
  let storage;
  try { storage = window.localStorage; } catch { throw new Error('Enable browser site storage to use the connected demonstration.'); }
  const store = createDemoStore({ catalogue, storage,
   withLock: operation => navigator.locks ? navigator.locks.request(DEMO_KEY, operation) : Promise.resolve().then(operation) });
  window.addEventListener('storage', event => { if (event.key === DEMO_KEY || event.key === null) store.notify(); });
  return store;
 })().catch(error => { connection = null; throw error; });
 return connection;
}

export function clearDamagedDemo() {
 window.localStorage.removeItem(DEMO_KEY);
 connection = null;
}
