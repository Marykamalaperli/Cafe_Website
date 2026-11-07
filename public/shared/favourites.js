// Device preferences contain dish identifiers only, scoped to this website folder.
// /review/ therefore cannot change the production site's saved favourites.
export const FAVOURITES_KEY = 'bitesbro.favourites.v1:' + new URL('../', import.meta.url).pathname;
const validID = id => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(id);
export function parseFavouriteIDs(value) {
 try { const ids = JSON.parse(value || '[]'); return Array.isArray(ids) ? [...new Set(ids.filter(validID))].slice(0, 200) : []; }
 catch { return []; }
}
export function readFavourites(storage) {
 try { storage ||= globalThis.localStorage; return new Set(parseFavouriteIDs(storage.getItem(FAVOURITES_KEY))); } catch { return new Set(); }
}
export function toggleFavourite(id, storage) {
 if (!validID(id)) throw new Error('This dish cannot be saved as a favourite.');
 try{storage ||= globalThis.localStorage;}catch{throw new Error('Allow browser storage to save your favourite dishes.');}
 const ids = readFavourites(storage);
 if (ids.has(id)) ids.delete(id);
 else { if (ids.size >= 200) throw new Error('You can save up to 200 favourite dishes.'); ids.add(id); }
 try { storage.setItem(FAVOURITES_KEY, JSON.stringify([...ids].sort())); }
 catch { throw new Error('Your favourite could not be saved. Allow browser storage and try again.'); }
 return ids;
}
