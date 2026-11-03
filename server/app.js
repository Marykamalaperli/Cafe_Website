import { randomBytes } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { cafe, bookingSlots, foodSlots, openingHours } from './cafe.js';

const publicRoot = resolve(fileURLToPath(new URL('../public/', import.meta.url)));
export const SLOTS = bookingSlots;
export const SLOT_CAPACITY = cafe.seatsPerSitting;
import { categories, readMenu } from './food-menu.js';
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };

export class HttpError extends Error {
  constructor(status, message, fields) { super(message); this.status = status; this.fields = fields; }
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': types['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function text(value, field, min = 1, max = 120) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    throw new HttpError(400, `Please check your ${field}.`, { [field]: `Use ${min}–${max} characters.` });
  }
  return value.trim();
}

function email(value) {
  const result = text(value, 'email', 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new HttpError(400, 'Please enter a valid email address.', { email: 'Enter a valid email address.' });
  return result;
}

function customer(data) {
  const name = text(data.name, 'name', 2, 80);
  const mail = email(data.email);
  const phone = text(data.phone, 'phone', 7, 24);
  if (!/^\+?[\d\s().-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7) throw new HttpError(400, 'Please enter a valid phone number.', { phone: 'Enter a valid phone number.' });
  return { name, email: mail, phone };
}

function consent(data) {
  if (data.website) throw new HttpError(400, 'We could not accept this request.');
  if (data.consent !== true) throw new HttpError(400, 'Please agree to the privacy notice.', { consent: 'Your permission is required.' });
}

export function cafeClock(now = new Date(), timezone = 'Asia/Kolkata') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = type => parts.find(p => p.type === type).value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}

function dateCheck(value, clock) {
  const date = text(value, 'date', 10, 10);
  const parsed = new Date(`${date}T12:00:00Z`);
  const today = new Date(`${clock.date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date || parsed < today || parsed - today > 60 * 86400000) {
    throw new HttpError(400, 'Choose a date between today and the next 60 days.', { date: 'Choose a valid date in the next 60 days.' });
  }
  return date;
}

function slotCheck(date, time, clock) {
  if (!SLOTS.includes(time) || (date === clock.date && time <= clock.time)) throw new HttpError(400, 'Choose an upcoming time during opening hours.', { time: 'Choose an available future time.' });
}

async function body(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new HttpError(415, 'Send this request as application/json.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 16384) { req.resume(); throw new HttpError(413, 'Your request is too large.'); }
    chunks.push(chunk);
  }
  let result;
  try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Please send valid JSON.'); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new HttpError(400, 'Please send a JSON object.');
  return result;
}

function ref(prefix) { return `BB-${prefix}-${randomBytes(5).toString('hex').toUpperCase()}`; }

export function createApp({ db, siteUrl = 'http://localhost:3000', timezone = 'Asia/Kolkata', now = () => new Date(), rateLimitMax = 30 } = {}) {
  const canonicalOrigin = new URL(siteUrl).origin;
  new Intl.DateTimeFormat('en', { timeZone: timezone }); // Fail fast on invalid configuration.
  const rateBuckets = new Map();
  const windowMs = 15 * 60 * 1000;

  return async function app(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
    try {
      const url = new URL(req.url, 'http://local');
      const path = url.pathname;
      const clock = cafeClock(now(), timezone);
      if (req.method === 'GET' && path === '/api/health') {
        db.prepare('SELECT 1').get();
        return json(res, 200, { status: 'ok', database: 'connected' });
      }
      if (req.method === 'GET' && path === '/api/cafe') {
        return json(res, 200, { name: cafe.name, currency: cafe.currency, timezone, today: clock.date, currentTime: clock.time, slots: SLOTS, foodSlots, deliveryFee: cafe.deliveryFee, freeDeliveryFrom: cafe.freeDeliveryFrom, maxAdvanceDays: cafe.maxAdvanceDays, maxGuests: cafe.maxGuests, demo: cafe.demo, city: cafe.city, hours: openingHours, address: cafe.address, email: cafe.email, phone: cafe.phone });
      }
      if (req.method === 'GET' && path === '/api/menu') {
        const category = url.searchParams.get('category') || 'all';
        if (category !== 'all' && !categories.some(item=>item.id===category)) throw new HttpError(400,'Unknown menu category.');
        const diet=url.searchParams.get('diet')||'all';
        if(!['all','veg','vegan','non-veg'].includes(diet)) throw new HttpError(400,'Unknown dietary filter.');
        const query=(url.searchParams.get('q')||'').slice(0,120).toLowerCase();
        let items=readMenu(db,category).filter(item=>diet==='all'||(diet==='veg'?item.diet!=='non-veg':item.diet===diet));
        if(query) items=items.filter(item=>(item.name+' '+item.description+' '+item.ingredients.join(' ')).toLowerCase().includes(query));
        return json(res,200,{currency:'INR',categories,items});
      }
      if(req.method==='GET' && path==='/api/fulfilment'){
        const date=dateCheck(url.searchParams.get('date'),clock);
        const minute=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
        return json(res,200,{date,timezone,slots:foodSlots.map(time=>({time,available:date!==clock.date||minute(time)>=minute(clock.time)+30}))});
      }
      if (req.method === 'GET' && path === '/api/availability') {
        const date = dateCheck(url.searchParams.get('date'), clock);
        const rows = db.prepare('SELECT time, SUM(guests) AS booked FROM reservations WHERE date = ? GROUP BY time').all(date);
        return json(res, 200, { date, timezone, slots: SLOTS.map(time => {
          const seatsLeft = SLOT_CAPACITY - (rows.find(row => row.time === time)?.booked || 0);
          const past = date === clock.date && time <= clock.time;
          return { time, seatsLeft, past, available: seatsLeft > 0 && !past };
        }) });
      }
      if (req.method === 'POST' && path.startsWith('/api/')) {
        // Same-origin JSON writes only. Trust no forwarded headers by default.
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}` && req.headers.origin !== canonicalOrigin) throw new HttpError(403, 'Please submit this form from the BitesBro website.');
        const key = req.socket.remoteAddress || 'unknown';
        const timestamp = now().valueOf();
        for (const [ip, bucket] of rateBuckets) if (bucket.reset <= timestamp) rateBuckets.delete(ip);
        let bucket = rateBuckets.get(key);
        if (!bucket) { bucket = { count: 0, reset: timestamp + windowMs }; rateBuckets.set(key, bucket); }
        bucket.count++;
        if (bucket.count > rateLimitMax) { res.setHeader('Retry-After', String(Math.ceil((bucket.reset - timestamp) / 1000))); throw new HttpError(429, 'A few too many requests. Please try again in 15 minutes.'); }
        const data = await body(req);
        consent(data);
        if (path === '/api/reservations') {
          const person = customer(data);
          const date = dateCheck(data.date, clock);
          slotCheck(date, data.time, clock);
          if (!Number.isInteger(data.guests) || data.guests < 1 || data.guests > 8) throw new HttpError(400, 'Choose between 1 and 8 guests.', { guests: 'Choose 1–8 guests.' });
          const notes = text(data.notes || '', 'notes', 0, 500);
          const reference = ref('TABLE');
          db.exec('BEGIN IMMEDIATE');
          try {
            const booked = db.prepare('SELECT COALESCE(SUM(guests), 0) AS count FROM reservations WHERE date = ? AND time = ?').get(date, data.time).count;
            if (booked + data.guests > SLOT_CAPACITY) throw new HttpError(409, 'That sitting is full. Please choose another time.');
            if (db.prepare('SELECT 1 FROM reservations WHERE email = ? AND date = ? AND time = ?').get(person.email, date, data.time)) throw new HttpError(409, 'A request with this email already exists for that sitting.');
            db.prepare('INSERT INTO reservations (reference, name, email, phone, date, time, guests, notes, consent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)').run(reference, person.name, person.email, person.phone, date, data.time, data.guests, notes);
            db.exec('COMMIT');
          } catch (error) { db.exec('ROLLBACK'); throw error; }
          return json(res, 201, { reference, date, time: data.time, guests: data.guests, message: 'Your demo reservation request has been saved. No email is sent.' });
        }
        if (path === '/api/orders') {
          const person = customer(data);
          const date = dateCheck(data.date, clock);
          const minute=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
          if(!foodSlots.includes(data.time)||(date===clock.date&&minute(data.time)<minute(clock.time)+30)) throw new HttpError(400,'Choose a future food pickup time, at least 30 minutes from now.',{time:'Choose another time.'});
          const fulfilment=data.fulfilment||'pickup';
          if(!['pickup','delivery'].includes(fulfilment)) throw new HttpError(400,'Choose pickup or delivery.');
          const address=fulfilment==='delivery'?text(data.address,'address',10,300):'';
          const postcode=fulfilment==='delivery'?text(data.postcode,'postcode',6,6):'';
          if(fulfilment==='delivery'&&!/^560\d{3}$/.test(postcode)) throw new HttpError(400,'Demo delivery is limited to Bangalore postcodes beginning 560.',{postcode:'Use a Bangalore 560xxx postcode.'});
          const instructions=text(data.instructions||'','instructions',0,500);
          if(!Array.isArray(data.items)||!data.items.length||data.items.length>20) throw new HttpError(400,'Add food to your bag before checking out.');
          const keys=new Set();
          const items=data.items.map(line=>{
            if(!line||typeof line.id!=='string'||!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>10) throw new HttpError(400,'Please check your food quantities (1–10 per item).');
            const item=db.prepare('SELECT id,name,price,details FROM menu_items WHERE id=? AND available=1').get(line.id);
            if(!item) throw new HttpError(409,'An item is no longer available. Refresh the menu.');
            const details=JSON.parse(item.details);
            const variant=details.variants.find(v=>v.id===(line.variant||details.variants[0].id));
            if(!variant) throw new HttpError(400,'Choose a valid portion.');
            const spice=line.spice||details.spice;
            if(!(details.spice==='none'?['none']:['mild','medium','hot']).includes(spice)) throw new HttpError(400,'Choose a valid spice level.');
            const ids=line.addons||[];
            if(!Array.isArray(ids)||ids.length>5||new Set(ids).size!==ids.length) throw new HttpError(400,'Please check your add-ons.');
            const addons=ids.map(id=>{const addon=details.addons.find(a=>a.id===id);if(!addon) throw new HttpError(400,'An add-on is not available for this dish.');return addon;});
            const key=JSON.stringify([item.id,variant.id,spice,[...ids].sort()]);
            if(keys.has(key)) throw new HttpError(400,'Combine identical dishes into a single quantity.');
            keys.add(key);
            return {id:item.id,name:item.name,quantity:line.quantity,price:item.price+variant.price+addons.reduce((n,a)=>n+a.price,0),options:{variant,spice,addons}};
          });
          if(items.reduce((n,item)=>n+item.quantity,0)>30) throw new HttpError(400,'Please limit your order to 30 items.');
          const subtotal=items.reduce((n,item)=>n+item.price*item.quantity,0);
          const deliveryFee=fulfilment==='delivery'&&subtotal<cafe.freeDeliveryFrom?cafe.deliveryFee:0;
          const total=subtotal+deliveryFee,reference=ref('ORDER');
          db.exec('BEGIN IMMEDIATE');
          try{
            const saved=db.prepare('INSERT INTO orders(reference,name,email,phone,pickup_date,pickup_time,total,consent,fulfilment,address,postcode,instructions,delivery_fee,subtotal) VALUES(?,?,?,?,?,?,?,1,?,?,?,?,?,?)').run(reference,person.name,person.email,person.phone,date,data.time,total,fulfilment,address,postcode,instructions,deliveryFee,subtotal);
            const add=db.prepare('INSERT INTO order_items(order_id,menu_item_id,name,quantity,unit_price,options) VALUES(?,?,?,?,?,?)');
            for(const item of items) add.run(saved.lastInsertRowid,item.id,item.name,item.quantity,item.price,JSON.stringify(item.options));
            db.exec('COMMIT');
          }catch(error){db.exec('ROLLBACK');throw error;}
          return json(res,201,{reference,total,subtotal,deliveryFee,fulfilment,currency:'INR',date,time:data.time,message:'Your demo food order is saved. No payment is taken, delivery is not dispatched, and no email is sent.'});
        }
        if (path === '/api/newsletter') {
          db.prepare('INSERT OR IGNORE INTO subscribers (email, consent) VALUES (?, 1)').run(email(data.email));
          return json(res, 200, { message: 'You’re on the list! Your signup is saved. Newsletter delivery will begin when email service is connected.' });
        }
        if (path === '/api/contact') {
          const reference = ref('HELLO');
          db.prepare('INSERT INTO messages (reference, name, email, subject, message, consent) VALUES (?, ?, ?, ?, ?, 1)').run(reference, text(data.name, 'name', 2, 80), email(data.email), text(data.subject, 'subject', 2, 100), text(data.message, 'message', 10, 2000));
          return json(res, 201, { reference, message: 'Your message is saved. Email delivery is not connected yet.' });
        }
        throw new HttpError(404, 'This endpoint does not exist.');
      }
      if (path.startsWith('/api/')) throw new HttpError(404, 'This endpoint does not exist.');
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); throw new HttpError(405, 'Method not allowed.'); }
      let decoded;
      try { decoded = decodeURIComponent(path); } catch { throw new HttpError(400, 'Invalid path.'); }
      const target = resolve(publicRoot, `.${decoded === '/' ? '/index.html' : decoded}`);
      if (!target.startsWith(publicRoot + sep) && target !== resolve(publicRoot, 'index.html')) throw new HttpError(404, 'Page not found.');
      let actual;
      try { actual = await realpath(target); } catch { throw new HttpError(404, 'Page not found.'); }
      if (!actual.startsWith(publicRoot + sep)) throw new HttpError(404, 'Page not found.');
      let content;
      try { content = await readFile(actual); } catch { throw new HttpError(404, 'Page not found.'); }
      const extension = extname(actual);
      if (['.html', '.xml', '.txt'].includes(extension)) content = Buffer.from(content.toString('utf8').replaceAll('{{SITE_URL}}', canonicalOrigin));
      res.writeHead(200, { 'Content-Type': types[extension] || 'application/octet-stream', 'Content-Length': content.length, 'Cache-Control': ['.html', '.xml', '.txt'].includes(extension) ? 'no-cache' : 'public, max-age=3600' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (!error.status) console.error('[BitesBro] Request failed:', error.code || error.name);
      if (!res.headersSent && !res.destroyed) json(res, error.status || 500, { error: error.status ? error.message : 'Something went wrong. Please try again.', ...(error.fields ? { fields: error.fields } : {}) });
    }
  };
}
