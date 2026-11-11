// BitesBro's business details. Set the remaining contact details here when ready.
// All days currently share these hours. Times are local to Asia/Kolkata.
export const cafe = {
  name: 'BitesBro',
  city: 'Bangalore',
  address: 'White Rose Layout, 2nd Cross Rd, near Narayana School, Pattandur Agrahara, Whitefield, Bengaluru, Karnataka 560066',
  email: null,
  phone: null,
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  openingPeriods: [{ open: '10:00', close: '15:00' }, { open: '18:00', close: '23:00' }],
  sittingMinutes: 90,
  seatsPerSitting: 24,
  maxGuests: 8,
  maxAdvanceDays: 60,
  deliveryFee: 4000,
  freeDeliveryFrom: 49900,
  // Stay in demo mode until address, contact, operations and privacy are finalised.
  demo: true
};

const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const clock = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
export const bookingSlots = cafe.openingPeriods.flatMap(({ open, close }) => {
  const slots = [];
  for (let time = minutes(open); time + cafe.sittingMinutes <= minutes(close); time += cafe.sittingMinutes) slots.push(clock(time));
  return slots;
});
function pretty(time) {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`;
}
export const openingHours = `Daily, ${cafe.openingPeriods.map(({ open, close }) => `${pretty(open)}–${pretty(close)}`).join(' & ')}`;

export const foodSlots = cafe.openingPeriods.flatMap(({open,close}) => {
 const slots=[]; for(let t=minutes(open);t+30<=minutes(close);t+=30) slots.push(clock(t)); return slots;
});
