import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { menuSeed } from './menu.js';

export function openDatabase(path = './data/bitesbro.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  if (db.prepare('SELECT COUNT(*) AS count FROM menu_items').get().count === 0) {
    const insert = db.prepare(`INSERT INTO menu_items
      (id, name, category, description, price, image, badge, dietary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const item of menuSeed) insert.run(item.id, item.name, item.category, item.description,
        item.price, `/assets/images/${item.image}`, item.badge, JSON.stringify(item.dietary));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      db.close();
      throw error;
    }
  }
  return db;
}
