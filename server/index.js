import { createServer } from 'node:http';
import { openDatabase } from './database.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
const db = openDatabase(process.env.DATABASE_PATH || './data/bitesbro.sqlite');
const max = Number(process.env.RATE_LIMIT_MAX || 30);
if (!Number.isInteger(max) || max < 1) throw new Error('RATE_LIMIT_MAX must be a positive integer.');
const server = createServer(createApp({ db, siteUrl: process.env.SITE_URL || `http://localhost:${port}`, timezone: process.env.CAFE_TIMEZONE || 'Asia/Kolkata', rateLimitMax: max }));
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`BitesBro listening on port ${port}. SQLite connected.`));
server.on('error', error => { console.error('Server could not start:', error.code); db.close(); process.exit(1); });
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
