// Read-only live UI check. The only writes are this script's own temporary Session.
import 'dotenv/config';
import {Pool} from 'pg';
import {chromium,expect} from '@playwright/test';
import {createHash,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const pool=new Pool({connectionString:process.env.DATABASE_URL}),base='http://localhost:3000',sessionId='recipe-ui-readonly-'+randomBytes(12).toString('hex');
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
async function snapshot(){
 const recipes=(await pool.query(`SELECT id,md5((to_jsonb(t)-'imageBytes')::text||COALESCE(md5("imageBytes"),'')) AS digest FROM "Recipe" t ORDER BY id`)).rows;
 const tables:Record<string,string>={};
 for(const table of ['RecipeType','RecipeComponent','RecipeFeatureSettings','WeeklySpecial','DailySales','WeeklyForecast','ForecastDay','PurchaseInvoice','User','ZonalConnection']){
  tables[table]=(await pool.query(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) AS digest FROM "${table}" t`)).rows[0].digest;
 }
 return {recipes,tables};
}
try{
 const before=await snapshot();
 const admin=(await pool.query('SELECT id,"restaurantId" FROM "User" WHERE role=$1 AND active=true LIMIT 1',['SUPER_USER'])).rows[0];
 if(!admin)throw new Error('Existing Super User required.');
 const token=randomBytes(32).toString('hex');
 await pool.query('INSERT INTO "Session"(id,"tokenHash","userId","expiresAt") VALUES($1,$2,$3,now()+interval \'5 minutes\')',[sessionId,createHash('sha256').update(token).digest('hex'),admin.id]);
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addCookies([{name:'restaurant-session',value:token,url:base,httpOnly:true,sameSite:'Lax'}]);
 const page=await context.newPage(),errors:string[]=[];page.on('pageerror',()=>errors.push('Browser runtime error'));
 await page.goto(base+'/dashboard');await expect(page.getByRole('heading',{name:'Weekly Sales Overview',exact:true})).toBeVisible();const dashboard=await page.locator('.card:visible').first().evaluate(el=>({radius:getComputedStyle(el).borderRadius,background:getComputedStyle(el).backgroundColor}));
 const rows=(await pool.query(`SELECT r.*,t.name AS "typeName" FROM "Recipe" r JOIN "RecipeType" t ON t.id=r."typeId" AND t."restaurantId"=r."restaurantId" WHERE r."restaurantId"=$1 ORDER BY t."sortOrder",r."sortOrder",r.name`,[admin.restaurantId])).rows;
 await page.goto(base+'/recipes');
 await expect(page.getByRole('heading',{name:'Recipe Library',exact:true})).toBeVisible();await expect(page.locator('section[aria-label="Recipe library"] .recipe-card')).toHaveCount(rows.length);
 if(rows.length){
  const r=rows.find(r=>/proven|herb.*sauce/i.test(r.name))??[...rows].sort((a,b)=>b.ingredients.length-a.ingredients.length)[0];
  await page.getByLabel('Search recipes',{exact:true}).fill(r.name);await page.getByRole('button',{name:'FILTER',exact:true}).click();
  await expect(page.locator('section[aria-label="Recipe library"]').getByRole('link',{name:r.name,exact:true})).toBeVisible();
  await page.goto(base+'/recipes/'+r.id);await expect(page.getByRole('heading',{name:r.name,exact:true})).toBeVisible();
  const method=r.beforeService&&r.onOrder?'Before Service\n'+r.beforeService+'\n\nOn Order\n'+r.onOrder:r.beforeService||r.onOrder;
  if((await page.locator('.recipe-service-method').textContent())!==(method||'No preparation method recorded.').replace(/\r\n?/g,'\n'))throw new Error('Recipe method display differs from stored content after normal browser newline normalization.');
  const displayed=await page.locator('.recipe-ingredient-table tbody tr').evaluateAll(elements=>elements.map(el=>[...el.querySelectorAll('td')].map(td=>td.textContent??'')));
  if(JSON.stringify(displayed)!==JSON.stringify(r.ingredients.map((i:{name:string;quantity:string;unit:string})=>[String(i.name),String(i.quantity),String(i.unit)])))throw new Error('Displayed ingredient names, quantities or units differ from stored records.');
  if(r.imageBytes){
   const image=await context.request.get(base+'/recipes/'+r.id+'/image');
   assert.equal(image.status(),200);assert.equal(image.headers()['cache-control'],'private, no-store');if(!(await image.body()).equals(r.imageBytes))throw new Error('Authenticated image bytes differ from the stored photo.');
  }
  for(const width of [390,768,1440]){
   await page.setViewportSize({width,height:1000});
   await expect.poll(async()=>await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await expect(page.locator('.recipe-method-line').first()).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
   await expect(page.locator('.recipe-identity .recipe-dietary')).toHaveCount(1);
   await expect(page.locator('.recipe-ingredient-table th').first()).toHaveCSS('background-color','rgb(16, 65, 45)');
   const header=await page.locator('.recipe-identity').boundingBox(),dietary=await page.locator('.recipe-dietary').boundingBox(),copy=await page.locator('.recipe-identity-copy').boundingBox();
   assert(header&&dietary&&copy);
   if(width===1440)assert(dietary.x>copy.x+copy.width-1,'Desktop allergens must sit beside the recipe identity');
   if(width===390)assert(dietary.y>=copy.y+copy.height,'Mobile allergens must follow the recipe identity');
   await page.screenshot({path:'/tmp/cocotte-service-sheet-live-'+width+'.png',fullPage:true});
  }
  console.log('Inspected existing recipe sheet: '+r.ingredients.length+' ingredients at 390, 768 and 1440px; exact method and ingredient data preserved.');
  await page.goto(base+'/recipes/edit?id='+r.id);await expect(page.getByLabel('Recipe name',{exact:true})).toHaveValue(r.name);
  await expect(page.locator('textarea[name="ingredients"]')).toHaveValue(r.ingredients.map((i:{name:string;quantity:string;unit:string})=>[i.name,i.quantity,i.unit].join(' | ')).join('\n'));
 }
 for(const viewport of [{width:1440,height:1000},{width:1024,height:768},{width:768,height:1024},{width:375,height:812},{width:390,height:844},{width:320,height:740}]){
  await page.setViewportSize(viewport);await page.goto(base+'/recipes');
  await expect(page.getByRole('heading',{name:'Recipe Library',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'New Recipe',exact:true})).toBeVisible();
  await expect(page.locator('.recipe-entry-metadata')).toHaveCount(0);
  await expect.poll(async()=>await page.locator('section[aria-label="Recipe library"]').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(4);
  await expect.poll(async()=>await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(viewport.width>=375){
   const images=await page.locator('.recipe-card-image img').evaluateAll(async elements=>await Promise.all(elements.map(async el=>{const img=el as HTMLImageElement;img.loading='eager';await img.decode().catch(()=>{});return img.naturalWidth>0;})));
   assert(images.every(Boolean),'Existing recipe images must decode successfully');
   await page.screenshot({path:'/tmp/cocotte-library-live-'+viewport.width+'.png',fullPage:true});
  }
 }
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/dashboard');
 await expect(page.getByRole('heading',{name:'Weekly Sales Overview',exact:true})).toBeVisible();
 assert.deepEqual(await page.locator('.card:visible').first().evaluate(el=>({radius:getComputedStyle(el).borderRadius,background:getComputedStyle(el).backgroundColor})),dashboard);
 assert.deepEqual(await snapshot(),before);assert.deepEqual(errors,[]);
 console.log('PASS localhost Recipes: existing recipe count, search, detail/editor fields and ingredient quantities, authenticated images, 320–1440px; all recipe/image/relationship/allergen and financial hashes unchanged; dashboard styling unaffected.');
}finally{
 await browser?.close();await pool.query('DELETE FROM "Session" WHERE id=$1',[sessionId]);await pool.end();
}
