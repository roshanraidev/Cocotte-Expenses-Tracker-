// Isolated browser check: the configured DATABASE_URL is never used.
import { startPrismaDevServer } from '@prisma/dev';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { chromium, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/lib/password';

const server = await startPrismaDevServer({ name: `recipe-features-${process.pid}`, persistenceMode: 'stateless', port: 51683, databasePort: 51684, shadowDatabasePort: 51685, streamsPort: 51686 });
const url = server.database.connectionString;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });
const pool = new Pool({ connectionString: url });
const password = randomBytes(24).toString('base64url');
const base = 'http://localhost:3167';
let app: ChildProcess | undefined, log = '';
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  // Initialize only the disposable test database from the committed SQL, never the user's database.
  for (const dir of (await readdir('prisma/migrations')).sort()) {
    if (dir !== 'migration_lock.toml') await pool.query(await readFile(`prisma/migrations/${dir}/migration.sql`, 'utf8'));
  }
  await pool.end();
  await prisma.restaurant.create({ data: { id: 'restaurant', name: 'Cocotte Test', settings: { create: {} } } });
  const passwordHash = await hashPassword(password);
  for (const [email, role] of [['admin@recipes.test', 'SUPER_USER'], ['chef@recipes.test', 'CHEF']] as const) {
    await prisma.user.create({ data: { email, role, name: role === 'SUPER_USER' ? 'Executive Chef' : 'Chef', passwordHash, restaurantId: 'restaurant' } });
  }
  const type = await prisma.recipeType.create({ data: { restaurantId: 'restaurant', name: 'Kitchen' } });
  const recipe = (name: string, allergens = '') => prisma.recipe.create({ data: { name, allergens, restaurantId: 'restaurant', typeId: type.id, ingredients: [{name:'Ingredient',quantity:'1',unit:'Each'}], beforeService: '1. Prepare carefully.' } });
  const stock = await recipe('Chicken Stock', 'Celery'), sauce = await recipe('Mushroom Sauce', 'Milk'), side = await recipe('Potato Puree');
  await prisma.recipeComponent.create({ data: { restaurantId: 'restaurant', recipeId: sauce.id, componentId: stock.id } });
  app = spawn('node', ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3167'], { env: { ...process.env, DATABASE_URL: url, DATABASE_POOL_SIZE: '2' }, stdio: ['ignore', 'pipe', 'pipe'] });
  app.stdout?.on('data', c => log += c); app.stderr?.on('data', c => log += c);
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(base+'/login')).ok) break; } catch { /* wait for startup */ }
    if(n===99)throw new Error('Test application did not start.');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  async function login(page: Page, email: string) {
    await page.goto(base+'/login'); await page.getByLabel('Email address').fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in to your kitchen', exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/);
  }
  await login(page, 'admin@recipes.test');
  await page.goto(base+'/recipes/edit');
  await page.getByLabel('Recipe name').fill('Chicken Supreme'); await page.getByLabel('Recipe type').selectOption(type.id);
  for (const id of [sauce.id, side.id]) { await page.getByLabel('Add Component Recipe').selectOption(id); await page.getByRole('button', { name: 'Add Component', exact: true }).click(); }
  await page.getByRole('button', { name: 'SAVE RECIPE', exact: true }).click(); await expect(page).toHaveURL(/\/recipes$/);
  const dish = await prisma.recipe.findFirstOrThrow({ where: { name: 'Chicken Supreme' } });
  expect((await prisma.recipeComponent.findMany({where:{recipeId:dish.id},orderBy:{position:'asc'}})).map(c=>c.componentId)).toEqual([sauce.id,side.id]);
  await page.goto(base+'/recipes/'+dish.id);
  await page.locator('summary').filter({hasText:'Components & Preparations'}).click();
  await page.locator('summary').filter({hasText:'Mushroom Sauce'}).click();
  await expect(page.getByText('Allergens in Mushroom Sauce:')).toBeVisible();
  await page.locator('summary').filter({hasText:'Chicken Stock'}).click();
  await expect(page.getByText('Allergens in Chicken Stock:')).toBeVisible();
  await page.goto(base+'/recipes/edit?id='+stock.id);
  await page.getByLabel('Ingredients').fill('Keep my edit | 2 | Each');
  await page.getByLabel('Recipe photo', {exact:true}).setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});
  await page.getByLabel('Add Component Recipe').selectOption(dish.id); await page.getByRole('button',{name:'Add Component',exact:true}).click();
  await page.getByRole('button',{name:'SAVE RECIPE',exact:true}).click();
  await expect(page.locator('form p[role=alert]')).toContainText('circular recipe link');
  await expect(page.getByLabel('Ingredients')).toHaveValue('Keep my edit | 2 | Each');
  expect(await page.getByLabel('Recipe photo',{exact:true}).evaluate((input:HTMLInputElement)=>input.files?.length)).toBe(1);
  await page.getByRole('button',{name:'Remove Component',exact:true}).click();await page.getByRole('button',{name:'SAVE RECIPE',exact:true}).click();await expect(page).toHaveURL(/\/recipes$/);
  expect((await prisma.recipe.findUniqueOrThrow({where:{id:stock.id}})).imageBytes?.length).toBeGreaterThan(0);
  const manage = page.locator('details').filter({has:page.locator('summary').filter({hasText:'Add Weekly Special / Manage Specials'})}).first();
  await manage.locator('summary').first().click();await manage.getByLabel('Enable Weekly Specials for this restaurant').check();await manage.getByRole('button',{name:'Save setting',exact:true}).click();
  await expect.poll(async()=>(await prisma.recipeFeatureSettings.findUnique({where:{restaurantId:'restaurant'}}))?.weeklySpecialsEnabled).toBe(true);
  for (const id of [dish.id,sauce.id]) {
    const add = manage.locator('form').filter({has:page.getByRole('button',{name:'Save Draft',exact:true})}).first();
    await add.getByLabel('Special recipe').selectOption(id);await add.getByRole('button',{name:'Publish',exact:true}).click();
    await expect.poll(()=>prisma.weeklySpecial.count({where:{status:'PUBLISHED'}})).toBe(id===dish.id?1:2);
  }
  const staff = await browser.newPage({viewport:{width:390,height:844}});staff.on('pageerror',error=>errors.push(error.message));await login(staff,'chef@recipes.test');await staff.goto(base+'/recipes');
  await expect(staff.getByRole('heading',{name:'Weekly Specials',exact:true})).toBeVisible();
  expect(await staff.locator('section').filter({has:staff.getByRole('heading',{name:'Weekly Specials',exact:true})}).locator('.recipe-card').count()).toBe(2);
  await expect(staff.getByText('Add Weekly Special / Manage Specials')).toHaveCount(0);
  expect(await staff.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await prisma.recipe.update({where:{id:stock.id},data:{visible:false}});await staff.goto(base+'/recipes/'+dish.id);
  await staff.locator('summary').filter({hasText:'Components & Preparations'}).click();await staff.locator('summary').filter({hasText:'Mushroom Sauce'}).click();
  await expect(staff.getByText('Chicken Stock',{exact:true})).toHaveCount(0);
  expect(await staff.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await manage.getByLabel('Enable Weekly Specials for this restaurant').uncheck();await manage.getByRole('button',{name:'Save setting',exact:true}).click();
  await expect.poll(async()=>(await prisma.recipeFeatureSettings.findUnique({where:{restaurantId:'restaurant'}}))?.weeklySpecialsEnabled).toBe(false);
  await staff.goto(base+'/recipes');await expect(staff.getByRole('heading',{name:'Weekly Specials',exact:true})).toHaveCount(0);await expect(staff.getByRole('link',{name:'Chicken Supreme',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
  console.log('PASS: desktop component creation, nested details/allergens, cycle error preserving text/photo, published specials, mobile staff visibility, feature disable and no horizontal overflow or runtime errors. Only disposable records were used.');
} catch(error) {console.log('Test application diagnostics:',log);throw error;} finally {
  await browser?.close();
  if(app&&app.exitCode===null){app.kill('SIGTERM');await new Promise<void>(resolve=>{app!.once('exit',()=>resolve());setTimeout(resolve,5000);});}
  await pool.end().catch(()=>{});await prisma.$disconnect();await server.close();
}
