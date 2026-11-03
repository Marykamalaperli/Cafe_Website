// Shared, deterministic meal suggestions. Times are always in the restaurant's
// timezone, regardless of the visitor's device timezone. Never changes availability.
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';
export const DEFAULT_OPENING_PERIODS = [
  { open: '10:00', close: '15:00' },
  { open: '18:00', close: '23:00' }
];

const periods = {
  breakfast: {
    label: 'Breakfast & tiffin', lead: 'Breakfast,', emphasis: 'your way.',
    description: 'Soft idlis, crisp dosas, pongal and a warming filter coffee. A little southern comfort to start your day.',
    ids: ['idli-sambar', 'masala-dosa', 'medu-vada', 'filter-coffee', 'pongal', 'set-dosa', 'podi-idli', 'appam-stew', 'chicken-chettinad-dosa']
  },
  lunch: {
    label: 'Lunch', lead: 'Lunch that', emphasis: 'hits the spot.',
    description: 'Make room for fragrant biryani, a rice-filled thali or a comforting curry. A proper afternoon meal.',
    ids: ['hyderabadi-biryani', 'veg-biryani', 'south-indian-meals', 'paneer-butter-masala', 'donne-biryani', 'bisi-bele-bath', 'butter-chicken', 'dal-tadka', 'mutton-biryani', 'chicken-fried-rice']
  },
  evening: {
    label: 'Evening bites', lead: 'A little', emphasis: 'evening pick-me-up.',
    description: 'Crisp samosas, buttery pav bhaji, a warm coffee or a little street-food treat for the evening.',
    ids: ['samosa', 'pav-bhaji', 'medu-vada', 'filter-coffee', 'fries', 'gobi-manchurian', 'lime-soda', 'chicken-burger', 'chilli-chicken', 'podi-idli']
  },
  dinner: {
    label: 'Dinner', lead: 'Make it a', emphasis: 'good dinner.',
    description: 'Settle into a generous curry, a South Indian meal, biryani or a comforting bowl of noodles.',
    ids: ['paneer-butter-masala', 'butter-chicken', 'south-indian-meals', 'hyderabadi-biryani', 'alfredo-pasta', 'hakka-noodles', 'veg-biryani', 'chicken-burger', 'gobi-manchurian']
  },
  afterHours: {
    label: 'After-hours inspiration', lead: 'Plan your next', emphasis: 'good breakfast.',
    description: 'The kitchen is closed. Here is a little breakfast inspiration for your next visit—idlis, dosas and the good southern stuff.',
    ids: ['idli-sambar', 'masala-dosa', 'medu-vada', 'filter-coffee', 'pongal', 'set-dosa', 'podi-idli', 'chicken-chettinad-dosa']
  }
};
const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const prettyTime = value => {
  const [hour, minute] = value.split(':').map(Number);
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${hour >= 12 ? 'pm' : 'am'}`;
};

export function mealContext(now = new Date(), { timezone = DEFAULT_TIMEZONE, openingPeriods = DEFAULT_OPENING_PERIODS } = {}) {
  const date = new Date(now);
  if (!Number.isFinite(date.valueOf())) throw new RangeError('A valid recommendation date is required.');
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const hour = Number(parts.find(part => part.type === 'hour').value);
  const minute = Number(parts.find(part => part.type === 'minute').value);
  const localMinutes = hour * 60 + minute;
  const key = hour >= 5 && hour < 12 ? 'breakfast' : hour >= 12 && hour < 16 ? 'lunch' : hour >= 16 && hour < 19 ? 'evening' : hour >= 19 && hour < 23 ? 'dinner' : 'afterHours';
  const open = openingPeriods.find(period => localMinutes >= minutes(period.open) && localMinutes < minutes(period.close));
  const next = openingPeriods.find(period => localMinutes < minutes(period.open));
  const kitchenStatus = open ? `Kitchen open until ${prettyTime(open.close)}` : next ? `Kitchen opens at ${prettyTime(next.open)}` : openingPeriods.length ? `Kitchen opens tomorrow at ${prettyTime(openingPeriods[0].open)}` : 'Kitchen hours unavailable';
  return { key, ...periods[key], timezone, isOpen: Boolean(open), kitchenStatus,
    localTime: new Intl.DateTimeFormat('en-IN', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true }).format(date),
    iso: date.toISOString() };
}

export function mealRecommendations(items, { now = new Date(), timezone = DEFAULT_TIMEZONE, openingPeriods = DEFAULT_OPENING_PERIODS, diet = 'all', limit = 4 } = {}) {
  const context = mealContext(now, { timezone, openingPeriods });
  const byId = new Map(items.filter(item => item.available !== 0 && item.available !== false).map(item => [item.id, item]));
  const suggestions = context.ids.map(id => byId.get(id)).filter(item => item && (diet === 'all' || (diet === 'veg' ? ['veg', 'vegan'].includes(item.diet) : item.diet === diet))).slice(0, limit);
  return { context, items: suggestions };
}
