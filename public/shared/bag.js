// Bag storage contains selections only. Menu prices and order totals stay authoritative.
export const BAG_KEY = 'bitesbro.food-bag.v2';
export const LEGACY_BAG_KEY = 'bitesbro.bag.v1';
export const bagLineKey = line => JSON.stringify([line.id, line.variant, line.spice, [...line.addons].sort()]);

export function readBag(menu) {
 try {
  const saved = JSON.parse(localStorage.getItem(BAG_KEY) || localStorage.getItem(LEGACY_BAG_KEY) || '[]');
  if (!Array.isArray(saved)) return [];
  const result = [], keys = new Set(); let total = 0;
  for (const entry of saved) {
   if (!entry || !Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 10 || total + entry.quantity > 30) continue;
   const item = menu.find(item => item.id === entry.id); if (!item) continue;
   const variant = entry.variant || item.variants[0].id, spice = entry.spice || item.spice, addons = entry.addons || [];
   if (!item.variants.some(option => option.id === variant) || !Array.isArray(addons) || new Set(addons).size !== addons.length || addons.some(id => !item.addons.some(option => option.id === id)) || !(item.spice === 'none' ? ['none'] : ['mild', 'medium', 'hot']).includes(spice)) continue;
   const line = { id: item.id, variant, spice, addons: [...addons].sort(), quantity: entry.quantity }; line.key = bagLineKey(line);
   if (keys.has(line.key)) continue;
   keys.add(line.key); total += line.quantity; result.push(line);
  }
  return result;
 } catch { return []; }
}

export function writeBag(lines) {
 // Explicit allowlist: never persist prices, menu snapshots or checkout contact details.
 localStorage.setItem(BAG_KEY, JSON.stringify(lines.map(({ id, variant, spice, addons, quantity }) => ({ id, variant, spice, addons, quantity }))));
 localStorage.removeItem(LEGACY_BAG_KEY);
}

export function updateBagButton(lines) {
 const count = lines.reduce((sum, line) => sum + line.quantity, 0);
 const button = document.querySelector('#open-cart'), badge = document.querySelector('#bag-count');
 if (badge) badge.textContent = count;
 if (button) button.setAttribute('aria-label', `Open bag, ${count} ${count === 1 ? 'item' : 'items'}`);
}
