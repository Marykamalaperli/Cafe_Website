import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

let count = 0;
for (const directory of ['public', 'server', 'scripts']) {
 for (const name of readdirSync(directory, { recursive: true }).filter(name => name.endsWith('.js'))) {
  execFileSync(process.execPath, ['--check', join(directory, name)], { stdio: 'inherit' }); count++;
 }
}
console.log(`Syntax checked ${count} JavaScript modules.`);
