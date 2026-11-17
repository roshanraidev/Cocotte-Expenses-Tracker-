// One-time LOCAL setup. Never prints the generated key; never replaces an existing key.
import { randomBytes } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
const path = resolve(process.cwd(), '.env');
try {
  if (process.env.NODE_ENV === 'production') throw new Error();
  if (process.env.ZONAL_CREDENTIALS_KEY) {
    console.log('The server environment already supplies an encryption key. No changes made.');
  } else {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error();
    const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const lines = existing.split(/\r?\n/);
    const keyLines = lines.filter(line => /^\s*(?:export\s+)?ZONAL_CREDENTIALS_KEY\s*=/.test(line));
    if (keyLines.some(line => !/^\s*(?:export\s+)?ZONAL_CREDENTIALS_KEY\s*=\s*(?:""|'')?\s*(?:#.*)?$/.test(line))) {
      console.log('A credential encryption key already exists in .env. It was not displayed or changed.');
    } else {
      const filtered = lines.filter(line => !/^\s*(?:export\s+)?ZONAL_CREDENTIALS_KEY\s*=/.test(line)).join('\n');
      if (existsSync(path)) chmodSync(path, 0o600);
      writeFileSync(path, `${filtered.trimEnd()}\n\n# Server-only Zonal credential encryption; never commit this file.\nZONAL_CREDENTIALS_KEY=${randomBytes(32).toString('base64')}\n`, { mode: 0o600 });
      console.log('Local encryption key created in ignored .env with restricted permissions. The key was not displayed. Restart Cocotte. Keep the key backed up securely, separately from the database.');
    }
  }
} catch {
  console.error('Local key setup stopped. Configure ZONAL_CREDENTIALS_KEY securely through your server administrator. No key was displayed.');
  process.exitCode = 1;
}
