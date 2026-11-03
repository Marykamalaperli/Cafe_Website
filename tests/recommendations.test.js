import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mealContext, mealRecommendations } from '../public/recommendations.js';
import { openDatabase } from '../server/database.js';
import { readMenu } from '../server/food-menu.js';

const india = time => new Date(`2030-01-10T${time}:00+05:30`);

test('meal recommendations switch at Bangalore breakfast, lunch, snack, dinner and overnight boundaries', () => {
  for (const [time, key] of [
    ['00:00','afterHours'],['04:59','afterHours'],['05:00','breakfast'],['11:59','breakfast'],
    ['12:00','lunch'],['15:59','lunch'],['16:00','evening'],['18:59','evening'],
    ['19:00','dinner'],['22:59','dinner'],['23:00','afterHours']
  ]) assert.equal(mealContext(india(time)).key, key, time);
});

test('the restaurant timezone determines the meal rather than the visitor or execution host timezone', () => {
  // 07:00 UTC is 12:30pm in Bangalore, but still early morning in New York.
  const instant = new Date('2030-01-10T07:00:00Z');
  assert.equal(mealContext(instant).key, 'lunch');
  assert.equal(mealContext(instant, { timezone: 'America/New_York' }).key, 'afterHours');
});

test('meal inspiration does not imply the kitchen is open before 10am, during the afternoon break or after 11pm', () => {
  assert.equal(mealContext(india('08:30')).key, 'breakfast');
  assert.equal(mealContext(india('08:30')).isOpen, false);
  assert.equal(mealContext(india('08:30')).kitchenStatus, 'Kitchen opens at 10am');
  assert.equal(mealContext(india('10:00')).isOpen, true);
  assert.equal(mealContext(india('14:59')).kitchenStatus, 'Kitchen open until 3pm');
  assert.equal(mealContext(india('15:00')).isOpen, false);
  assert.equal(mealContext(india('15:00')).kitchenStatus, 'Kitchen opens at 6pm');
  assert.equal(mealContext(india('18:00')).isOpen, true);
  assert.equal(mealContext(india('23:00')).kitchenStatus, 'Kitchen opens tomorrow at 10am');
  assert.equal(mealContext(india('01:00')).kitchenStatus, 'Kitchen opens at 10am');
});

test('actual breakfast picks are tiffins; lunch picks include biryani, rice meals and curries', () => {
  const db = openDatabase(':memory:');
  try {
    const menu = readMenu(db);
    const breakfast = mealRecommendations(menu, { now: india('09:00') });
    assert.deepEqual(breakfast.items.map(item => item.id), ['idli-sambar','masala-dosa','medu-vada','filter-coffee']);
    const lunch = mealRecommendations(menu, { now: india('13:00') });
    assert.deepEqual(lunch.items.map(item => item.id), ['hyderabadi-biryani','veg-biryani','south-indian-meals','paneer-butter-masala']);
    const evening = mealRecommendations(menu, { now: india('17:00') });
    assert.equal(evening.items[0].id, 'samosa');
  } finally { db.close(); }
});

test('time picks respect diet and availability without changing catalogue order or excluding the rest of the menu', () => {
  const db = openDatabase(':memory:');
  try {
    const menu = readMenu(db), original = JSON.stringify(menu);
    for (const diet of ['veg','vegan','non-veg']) {
      const { items } = mealRecommendations(menu, { now: india('13:00'), diet });
      assert.ok(items.length);
      assert.ok(items.every(item => diet === 'veg' ? item.diet !== 'non-veg' : item.diet === diet));
    }
    const disabled = menu.map(item => ({...item, available: item.id === 'idli-sambar' ? 0 : 1}));
    assert.ok(!mealRecommendations(disabled, { now: india('09:00') }).items.some(item => item.id === 'idli-sambar'));
    assert.equal(JSON.stringify(menu), original);
    assert.equal(menu.length, 50);
    assert.deepEqual(mealRecommendations([], { now: india('09:00') }).items, []);
  } finally { db.close(); }
});
