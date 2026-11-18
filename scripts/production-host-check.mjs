// Run after build:production. No database, real credentials or Zonal access needed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { request as httpRequest } from 'node:http';

const base = 'http://127.0.0.1:3190';
const env = { ...process.env, NODE_ENV: 'production' };
delete env.DATABASE_URL;
delete env.ZONAL_CREDENTIALS_KEY;
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3190'], {
  env, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
app.stdout.on('data', value => { log += String(value); });
app.stderr.on('data', value => { log += String(value); });
// Raw HTTP preserves the explicit Host header for local virtual-host checks.
const request = (path, host = 'localhost') => new Promise((resolve, reject) => {
  const req = httpRequest(base + path, { headers: { host }, signal: AbortSignal.timeout(5000) }, response => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', chunk => { body += chunk; });
    response.on('error', reject);
    response.on('end', () => resolve({
      status: response.statusCode,
      headers: new Headers(Object.entries(response.headers).flatMap(([key, value]) =>
        value === undefined ? [] : [[key, Array.isArray(value) ? value.join(', ') : value]])),
      json: async () => JSON.parse(body),
    }));
  });
  req.on('error', reject);
  req.end();
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (app.exitCode !== null) throw new Error('Production server exited before readiness.');
    try { ready = (await request('/api/health')).status === 200; } catch { /* startup */ }
    if (ready) break;
    await delay(250);
  }
  assert(ready, 'Production server did not become live.');
  for (const host of ['localhost', 'www.mrcocotte.com', 'preview.example.vercel.app']) {
    const response = await request('/api/health', host);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
  }
  const apex = await request('/recipes/example?week=2026-11-16', 'mrcocotte.com');
  assert.equal(apex.status, 308);
  assert.equal(apex.headers.get('location'), 'https://www.mrcocotte.com/recipes/example?week=2026-11-16');
  const dashboard = await request('/dashboard', 'www.mrcocotte.com');
  assert.equal(dashboard.status, 307);
  assert.equal(new URL(dashboard.headers.get('location'), base).pathname, '/login');
  assert.equal((await request('/login', 'www.mrcocotte.com')).status, 200);
  console.log('PASS production host checks: apex path/query redirect, www/local/preview liveness, no-store/security headers, unauthenticated dashboard protection and login rendering. No database or Zonal calls.');
} catch (error) {
  console.error('Production test server diagnostics:', log);
  throw error;
} finally {
  if (app.exitCode === null) {
    await new Promise(resolve => {
      const timeout = setTimeout(() => { app.kill('SIGKILL'); resolve(); }, 5000);
      app.once('exit', () => { clearTimeout(timeout); resolve(); });
      app.kill('SIGTERM');
    });
  }
}
