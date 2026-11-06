// Local smoke check. Creates and removes only its own short-lived authentication sessions.
// Does not modify users, financial data, integration settings or import records.
import 'dotenv/config';
import { chromium, expect } from '@playwright/test';
import { Pool } from 'pg';
import { createHash, randomBytes } from 'node:crypto';
const base = process.env.ZONAL_CHECK_BASE_URL ?? 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('This check supports localhost only.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sessionIds: string[] = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  console.log('PostgreSQL connected:', (await pool.query('SELECT 1 AS connected')).rows[0].connected === 1);
  const migrations = await pool.query('SELECT migration_name FROM "_prisma_migrations" WHERE migration_name=$1 AND finished_at IS NOT NULL', ['20261104000100_zonal_sales_pilot']);
  expect(migrations.rowCount).toBe(1);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const admin = (await pool.query('SELECT id FROM "User" WHERE role=$1 AND active=true LIMIT 1', ['SUPER_USER'])).rows[0];
  if (!admin) throw new Error('An existing active Super User is required. No accounts will be created.');
  const context = await browser.newContext();
  const token = randomBytes(32).toString('hex');
  const id = `zonal-check-${randomBytes(12).toString('hex')}`;
  await pool.query('INSERT INTO "Session" (id,"tokenHash","userId","expiresAt") VALUES ($1,$2,$3,now()+interval \'5 minutes\')', [id, createHash('sha256').update(token).digest('hex'), admin.id]);
  sessionIds.push(id);
  await context.addCookies([{ name: 'restaurant-session', value: token, url: base, httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', () => pageErrors.push('Browser runtime error'));
  page.on('console', message => { if (message.type() === 'error') pageErrors.push('Browser console error'); });
  const response = await page.goto(`${base}/admin/integrations/zonal`);
  expect(response?.status()).toBe(200);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Zonal Connect', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Not Connected|Credentials saved · login unverified|Login verified · report access pending|Report access verified · approval required/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Import history', exact: true })).toBeVisible();
  await expect(page.getByRole('heading',{name:'Fetch from Zonal',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Fetch from Zonal',exact:true})).toBeVisible();
  await expect(page.getByText('Enter report manually',{exact:true})).toBeVisible();
  const connect = page.getByRole('button', { name: 'Connect Zonal', exact: true });
  if (await connect.isVisible()) {
    await connect.click();
    await expect(page.getByRole('heading', { name: 'Connect Zonal securely', exact: true })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
    await expect(page.getByLabel('Zonal branch mapping')).toHaveValue('003 – Parsons Green');
    if (!process.env.ZONAL_CREDENTIALS_KEY) await expect(page.getByRole('button', { name: 'Connect securely', exact: true })).toBeDisabled();
  }
  await expect(page.getByText("We couldn't complete that request.", { exact: false })).toHaveCount(0);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/cocotte-zonal-${width}.png`, fullPage: true, caret: 'initial' });
  }
  expect(pageErrors).toEqual([]);
  console.log('Super User dashboard: HTTP 200, connection state visible, no runtime errors; responsive at 1440, 390 and 320px.');
  const anonymous = await browser.newPage();
  await anonymous.goto(`${base}/admin/integrations/zonal`);
  await expect(anonymous).toHaveURL(/\/login/);
  console.log('Anonymous access redirects to login.');
} finally {
  await browser?.close();
  for (const id of sessionIds) await pool.query('DELETE FROM "Session" WHERE id=$1', [id]);
  await pool.end();
}
