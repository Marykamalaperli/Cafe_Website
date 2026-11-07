import { BAG_LIMITS, bagLineKey, normaliseBag } from './bag.js?v=customer-flow-1';

// Pure selection planner. Never copies contact, address, schedule, instructions,
// payment details or historical prices into the new food bag.
export function planReorder(items, menu, existing = [], mode = 'merge') {
 const selected = [], issues = [];
 for (const saved of Array.isArray(items) ? items : []) {
  const item = menu.find(item => item.id === saved?.id && item.available !== false && !item.archived);
  const name = typeof saved?.name === 'string' ? saved.name : 'Saved dish';
  const skip = reason => issues.push({ name, reason });
  if (!item) { skip('This dish is not available on the current menu.'); continue; }
  if (!Number.isInteger(saved.quantity) || saved.quantity < 1 || saved.quantity > BAG_LIMITS.quantity) { skip('The saved quantity needs to be chosen again.'); continue; }
  const variantID = saved.options?.variant?.id || item.variants[0]?.id;
  const variant = item.variants.find(option => option.id === variantID);
  if (!variant) { skip('The original portion is no longer available. Choose a new portion on the menu.'); continue; }
  const spice = saved.options?.spice || item.spice;
  if (!(item.spice === 'none' ? ['none'] : ['mild', 'medium', 'hot']).includes(spice)) { skip('The original spice choice is no longer available.'); continue; }
  const savedAddons = saved.options?.addons || [];
  if (!Array.isArray(savedAddons)) { skip('The saved add-ons need to be chosen again.'); continue; }
  const addonIDs = savedAddons.map(option => typeof option === 'string' ? option : option?.id);
  if (new Set(addonIDs).size !== addonIDs.length || addonIDs.some(id => !item.addons.some(option => option.id === id))) { skip('An original add-on is no longer available. Review this dish on the menu.'); continue; }
  const addons = item.addons.filter(option => addonIDs.includes(option.id));
  const unitPrice = item.price + variant.price + addons.reduce((sum, option) => sum + option.price, 0);
  if (!Number.isSafeInteger(unitPrice) || unitPrice < 1) { skip('The current price could not be confirmed.'); continue; }
  const line = { id: item.id, variant: variant.id, spice, addons: [...addonIDs].sort(), quantity: saved.quantity }; line.key = bagLineKey(line);
  selected.push({ line, item, variant, addons, unitPrice, previousPrice: Number.isSafeInteger(saved.unitPrice) ? saved.unitPrice : null, oldName: name });
 }
 const lines = mode === 'replace' ? [] : normaliseBag(menu, existing).map(line => ({ ...line, addons: [...line.addons] }));
 for (const { line } of selected) {
  const match = lines.find(existing => existing.key === line.key);
  if (match) match.quantity += line.quantity;
  else lines.push({ ...line, addons: [...line.addons] });
 }
 let blocked = '';
 if (!selected.length) blocked = 'These selections cannot be repeated right now. Browse the current menu for another good meal.';
 else if (lines.some(line => line.quantity > BAG_LIMITS.quantity) || lines.length > BAG_LIMITS.lines || lines.reduce((sum, line) => sum + line.quantity, 0) > BAG_LIMITS.items) blocked = 'This would exceed your bag limit: 10 of each selection, 20 selections and 30 items. Replace the bag or adjust its quantities first.';
 return { selected, issues, lines: blocked ? [] : lines, blocked, quantity: selected.reduce((sum, item) => sum + item.line.quantity, 0), subtotal: selected.reduce((sum, item) => sum + item.unitPrice * item.line.quantity, 0) };
}
