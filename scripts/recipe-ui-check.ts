// All writes are confined to a disposable database. Never reads DATABASE_URL or real images.
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {Pool} from 'pg';
import {chromium,expect,type Page} from '@playwright/test';
import {spawn,execFile,type ChildProcess} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {hashPassword} from '../src/lib/password';
const exec=promisify(execFile),root=await mkdtemp(join(tmpdir(),'cocotte-recipe-ui-')),cluster=join(root,'postgres');
await exec('initdb',['-D',cluster,'-A','trust','-U','recipe_ui','--no-locale']);
await exec('pg_ctl',['-D',cluster,'-l',join(root,'postgres.log'),'-o',`-p 51947 -h 127.0.0.1 -k ${root}`,'-w','start']);
const url='postgresql://recipe_ui@127.0.0.1:51947/postgres';
if(url===process.env.DATABASE_URL)throw new Error('Disposable database required.');
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:url,max:3})}),pool=new Pool({connectionString:url});
const password=randomBytes(24).toString('base64url'),base='http://localhost:3182';
let app:ChildProcess|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined,poolClosed=false;
const photo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
async function login(page:Page,email:string){
 await page.goto(base+'/login');await page.getByLabel('Email address').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in to your kitchen'}).click();await expect(page).toHaveURL(/dashboard/);
}
async function noOverflow(page:Page){await expect.poll(async()=>await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
try{
 for(const dir of (await readdir('prisma/migrations')).sort())if(dir!=='migration_lock.toml')await pool.query(await readFile('prisma/migrations/'+dir+'/migration.sql','utf8'));
 await pool.end();poolClosed=true;
 await prisma.restaurant.create({data:{id:'restaurant',name:'COCOTTE · UI TEST',settings:{create:{}}}});
 for(const [id,email,role] of [['admin','admin@recipe-ui.test','SUPER_USER'],['chef','chef@recipe-ui.test','CHEF']] as const)await prisma.user.create({data:{id,email,role,restaurantId:'restaurant',name:role==='SUPER_USER'?'Test Super User':'Test Chef',passwordHash:await hashPassword(password)}});
 const mains=await prisma.recipeType.create({data:{restaurantId:'restaurant',name:'Main dishes',sortOrder:0}}),preps=await prisma.recipeType.create({data:{restaurantId:'restaurant',name:'Preparations',sortOrder:1}}),hiddenType=await prisma.recipeType.create({data:{restaurantId:'restaurant',name:'Private test category',visible:false,sortOrder:2}});
 const ingredients=[{name:'Chicken breast',quantity:'180',unit:'g'},{name:'Butter',quantity:'12.5',unit:'g'},{name:'Cream',quantity:'1/2',unit:'tbsp'}];
 const fixtureNames=['Roast Chicken','Leek & Mushroom Tart','Seasonal Greens','Potato Gratin','Roasted Carrots','Braised Leeks','Herb Salad','Caramelised Onions','Grilled Cauliflower','Lemon Posset'];
 const fixtures=[];
 for(const [index,name] of fixtureNames.entries())fixtures.push(await prisma.recipe.create({data:{restaurantId:'restaurant',typeId:mains.id,name,sortOrder:index,ingredients,beforeService:'1. Prepare and weigh ingredients.\n2. Cook gently.',onOrder:'Finish to order and check seasoning.',allergens:'Milk',mayContain:'Mustard',suitability:'Contains dairy',...(index===0?{imageBytes:photo,imageMime:'image/png'}:{})}}));
 const stock=await prisma.recipe.create({data:{restaurantId:'restaurant',typeId:preps.id,name:'Chicken Stock',ingredients:[{name:'Celery',quantity:'100',unit:'g'}],allergens:'Celery',beforeService:'Simmer gently.'}});
 const sauce=await prisma.recipe.create({data:{restaurantId:'restaurant',typeId:preps.id,name:'Mushroom Sauce',ingredients:[{name:'Mushrooms',quantity:'200',unit:'g'}],allergens:'Milk',beforeService:'Reduce and finish.'}});
 await prisma.recipeComponent.createMany({data:[{restaurantId:'restaurant',recipeId:fixtures[0].id,componentId:sauce.id},{restaurantId:'restaurant',recipeId:sauce.id,componentId:stock.id}]});
 const hidden=await prisma.recipe.create({data:{restaurantId:'restaurant',typeId:mains.id,name:'Hidden test dish',visible:false,ingredients:[]}});
 const privateRecipe=await prisma.recipe.create({data:{restaurantId:'restaurant',typeId:hiddenType.id,name:'Private category dish',ingredients:[],imageBytes:photo,imageMime:'image/png'}});
 const originals=await prisma.recipe.findMany({orderBy:{id:'asc'}}),linksBefore=await prisma.recipeComponent.findMany({orderBy:{recipeId:'asc'}});

 app=spawn('node',['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3182'],{env:{...process.env,DATABASE_URL:url,DATABASE_POOL_SIZE:'3'},stdio:'ignore'});
 for(let n=0;n<100;n++){try{if((await fetch(base+'/login')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];
 page.on('pageerror',()=>errors.push('Browser runtime error'));
 await login(page,'admin@recipe-ui.test');
 const dashboardStyles=await page.locator('.card').first().evaluate(el=>({radius:getComputedStyle(el).borderRadius,background:getComputedStyle(el).backgroundColor}));
 await page.goto(base+'/recipes');
 const library=page.locator('section[aria-label="Recipe library"]');
 await expect(library.locator('.recipe-card')).toHaveCount(14);
 await expect(library).toBeVisible();
 await expect.poll(async()=>await library.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(4);
 assert.equal(await library.locator('.recipe-card').evaluateAll(es=>es.filter(el=>el.getBoundingClientRect().bottom<=innerHeight).length),8);
 const firstCard=library.locator('.recipe-card').filter({has:page.getByRole('link',{name:fixtures[0].name,exact:true})}),firstLink=firstCard.locator('.recipe-card-link');
 await firstLink.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
 await expect(firstLink).toBeFocused();await expect(firstLink).toHaveCSS('outline-style','solid');
 await expect(firstLink).toHaveCSS('outline-width','3px');
 await page.keyboard.press('Enter');await expect(page).toHaveURL(new RegExp('/recipes/'+fixtures[0].id+'$'));
 await page.goto(base+'/recipes');
 await firstCard.hover();
 await expect.poll(async()=>await firstCard.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m42)).toBeLessThan(-3.9);
 await expect.poll(async()=>await firstCard.locator('img').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m11)).toBeGreaterThan(1.02);
 await expect.poll(async()=>await firstCard.locator('.recipe-card-arrow').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m41)).toBeGreaterThan(3);
 await page.emulateMedia({reducedMotion:'reduce'});await firstCard.hover();
 await expect(firstCard).toHaveCSS('transform','none');await expect(firstCard.locator('img')).toHaveCSS('transform','none');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.mouse.move(0,0);

 await page.getByLabel('Search recipes',{exact:true}).fill('Mushroom');
 await page.getByRole('button',{name:'FILTER',exact:true}).click();
 await expect(library.locator('.recipe-card')).toHaveCount(2);
 await page.getByLabel('Search recipes',{exact:true}).fill('');await page.getByRole('combobox',{name:'Recipe type',exact:true}).selectOption(preps.id);await page.getByRole('button',{name:'FILTER',exact:true}).click();
 await expect(library.locator('.recipe-card')).toHaveCount(2);
 await page.getByLabel('Search recipes',{exact:true}).fill('No matching test recipe');await page.getByRole('button',{name:'FILTER',exact:true}).click();
 await expect(page.getByText('No recipes match this filter.',{exact:true})).toBeVisible();
 await page.goto(base+'/recipes');
 await page.locator('.recipe-entry-actions').first().locator('summary').click();
 await expect(page.locator('.recipe-entry-menu a').first()).toBeVisible();
 page.once('dialog',dialog=>dialog.dismiss());await page.locator('.recipe-entry-menu button').first().click();
 assert.equal(await prisma.recipe.count(),14);
 await page.goto(base+'/recipes/'+fixtures[0].id);
 await expect(page.getByRole('heading',{name:'Roast Chicken',exact:true})).toBeVisible();
 for(const row of ingredients){
  const tr=page.locator('.recipe-ingredient-table tr').filter({has:page.getByRole('cell',{name:row.name,exact:true})});
  await expect(tr.getByRole('cell',{name:row.quantity,exact:true})).toBeVisible();await expect(tr.getByRole('cell',{name:row.unit,exact:true})).toBeVisible();
 }
 await expect(page.locator('.recipe-service-method')).toHaveText('Before Service\n1. Prepare and weigh ingredients.\n2. Cook gently.\n\nOn Order\nFinish to order and check seasoning.');
 await expect(page.locator('.recipe-dietary')).toContainText('Milk');await expect(page.locator('.recipe-dietary')).toContainText('Contains dairy');
 await page.locator('summary').filter({hasText:'Components & Preparations'}).click();await page.locator('summary').filter({hasText:'Mushroom Sauce'}).click();await page.locator('summary').filter({hasText:'Chicken Stock'}).click();
 await expect(page.getByText('Allergens in Chicken Stock:')).toBeVisible();
 const image=await page.context().request.get(base+'/recipes/'+fixtures[0].id+'/image');
 assert.equal(image.status(),200);assert.equal(image.headers()['cache-control'],'private, no-store');assert.deepEqual(await image.body(),photo);
 for(const viewport of [{width:1440,height:1000},{width:1024,height:768},{width:768,height:1024},{width:390,height:844},{width:320,height:740}]){await page.setViewportSize(viewport);await noOverflow(page);}
 assert.deepEqual(await prisma.recipe.findMany({orderBy:{id:'asc'}}),originals);
 assert.deepEqual(await prisma.recipeComponent.findMany({orderBy:{recipeId:'asc'}}),linksBefore);
 // The existing actions alone perform these writes, strictly in this disposable fixture.
 await page.goto(base+'/recipes/edit');await page.getByLabel('Recipe name',{exact:true}).fill('New test preparation');await page.getByLabel('Recipe type').selectOption(preps.id);await page.getByLabel('Ingredients',{exact:false}).fill('Eggs | 2 | Each\nButter | 12.5 | g');await page.getByLabel('Preparation / Method',{exact:false}).fill('1. Whisk gently.\n2. Finish to order.');
 await page.getByLabel('Recipe photo',{exact:true}).setInputFiles({name:'test.png',mimeType:'image/png',buffer:photo});
 await page.getByLabel('Add Component Recipe').selectOption(stock.id);await page.getByRole('button',{name:'Add Component',exact:true}).click();
 await page.getByRole('button',{name:'SAVE RECIPE',exact:true}).click();await expect(page).toHaveURL(/recipes$/);
 const created=await prisma.recipe.findFirstOrThrow({where:{name:'New test preparation'}});
 assert.deepEqual(created.ingredients,[{name:'Eggs',quantity:'2',unit:'Each'},{name:'Butter',quantity:'12.5',unit:'g'}]);assert.deepEqual(Buffer.from(created.imageBytes!),photo);
 await page.goto(base+'/recipes/edit?id='+created.id);
 await page.getByLabel('Recipe name',{exact:true}).fill('Edited test preparation');await page.getByRole('button',{name:'SAVE RECIPE',exact:true}).click();await expect(page).toHaveURL(/recipes$/);
 let changed=await prisma.recipe.findUniqueOrThrow({where:{id:created.id}});assert.deepEqual(Buffer.from(changed.imageBytes!),photo);assert.deepEqual(changed.ingredients,created.ingredients);
 await page.goto(base+'/recipes/edit?id='+created.id);
 const replacement=Buffer.concat([photo,Buffer.from('fixture-replacement')]);
 await page.getByLabel('Recipe photo',{exact:true}).setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:replacement});await page.getByRole('button',{name:'SAVE RECIPE',exact:true}).click();await expect(page).toHaveURL(/recipes$/);
 changed=await prisma.recipe.findUniqueOrThrow({where:{id:created.id}});assert.deepEqual(Buffer.from(changed.imageBytes!),replacement);
 await page.goto(base+'/recipes/edit?id='+created.id);await page.getByRole('button',{name:'Remove Photo',exact:true}).click();await page.getByRole('button',{name:'SAVE RECIPE',exact:true}).click();await expect(page).toHaveURL(/recipes$/);
 assert.equal((await prisma.recipe.findUniqueOrThrow({where:{id:created.id}})).imageBytes,null);
 // Existing circular-link error and unsaved field/photo preservation.
 await page.goto(base+'/recipes/edit?id='+stock.id);await page.getByLabel('Ingredients',{exact:false}).fill('Keep unsaved text | 5 | g');
 await page.getByLabel('Recipe photo',{exact:true}).setInputFiles({name:'test.png',mimeType:'image/png',buffer:photo});
 await page.getByLabel('Add Component Recipe').selectOption(fixtures[0].id);await page.getByRole('button',{name:'Add Component',exact:true}).click();await page.getByRole('button',{name:'SAVE RECIPE',exact:true}).click();
 await expect(page.locator('p[role="alert"]')).toContainText('circular recipe link');await expect(page.getByLabel('Ingredients',{exact:false})).toHaveValue('Keep unsaved text | 5 | g');
 assert.equal(await page.getByLabel('Recipe photo',{exact:true}).evaluate((el:HTMLInputElement)=>el.files?.length),1);
 assert.deepEqual(await prisma.recipe.findMany({where:{id:{in:originals.map(r=>r.id)}},orderBy:{id:'asc'}}),originals);
 await page.goto(base+'/recipes?manage=types');await expect(page.getByRole('heading',{name:'Recipe types',exact:true})).toBeVisible();await noOverflow(page);

 // Specials retain their existing publishing workflow and compact recipe entries.
 await page.goto(base+'/recipes');
 await page.getByText('Add Weekly Special / Manage Specials',{exact:true}).click();
 const management=page.locator('details').filter({has:page.getByText('Add Weekly Special / Manage Specials',{exact:true})});
 await management.getByLabel('Enable Weekly Specials for this restaurant').check();
 await management.getByRole('button',{name:'Save setting',exact:true}).click();
 const specialForm=management.locator('form').filter({has:page.getByRole('button',{name:'Save Draft',exact:true})}).first();
 await specialForm.getByLabel('Special recipe').selectOption(fixtures[0].id);
 await specialForm.getByRole('button',{name:'Publish',exact:true}).click();
 await expect.poll(async()=>await prisma.weeklySpecial.count({where:{status:'PUBLISHED'}})).toBe(1);
 const chef=await browser.newPage({viewport:{width:390,height:844}});
 chef.on('pageerror',()=>errors.push('Chef runtime error'));await login(chef,'chef@recipe-ui.test');await chef.goto(base+'/recipes');
 await expect(chef.locator('section[aria-label="Recipe library"] .recipe-card')).toHaveCount(13);
 await expect(chef.getByRole('heading',{name:'Weekly Specials',exact:true})).toBeVisible();
 await expect(chef.getByRole('link',{name:'New Recipe',exact:true})).toHaveCount(0);await expect(chef.locator('.recipe-entry-actions')).toHaveCount(0);
 await expect(chef.getByText(hidden.name,{exact:true})).toHaveCount(0);await expect(chef.getByText(privateRecipe.name,{exact:true})).toHaveCount(0);
 for(const viewport of [{width:1440,height:1000},{width:1024,height:768},{width:768,height:1024},{width:375,height:812},{width:390,height:844},{width:430,height:932},{width:320,height:740}]){
  await chef.setViewportSize(viewport);await noOverflow(chef);
  if(viewport.width===768||viewport.width===1024)assert.equal(await chef.locator('section[aria-label="Recipe library"]').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),4);
  if([320,375,390,430,768,1024,1440].includes(viewport.width)){
   const visible=await chef.locator('section[aria-label="Recipe library"] .recipe-card').evaluateAll(elements=>elements.filter(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}).length);
   console.log('Synthetic initial viewport entries:',viewport.width,viewport.height,visible);
   assert(visible>=4);
   assert.equal(await chef.locator('section[aria-label="Recipe library"]').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),4);
  }
  if([1440,1024,768,375,390].includes(viewport.width))await chef.screenshot({path:'/tmp/cocotte-recipe-library-'+viewport.width+'.png',fullPage:true});
 }
 await chef.goto(base+'/recipes/edit?id='+fixtures[0].id);await expect(chef).toHaveURL(/dashboard/);
 const forbidden=await chef.goto(base+'/recipes/'+hidden.id);assert([200,404].includes(forbidden?.status()??0));
 await expect(chef.getByRole('heading',{name:'404',exact:true})).toBeVisible();
 await expect(chef.getByRole('heading',{name:hidden.name,exact:true})).toHaveCount(0);
 assert.equal((await chef.context().request.get(base+'/recipes/'+privateRecipe.id+'/image')).status(),404);
 await chef.goto(base+'/recipes/'+fixtures[0].id);await expect(chef.getByRole('link',{name:'EDIT RECIPE',exact:true})).toHaveCount(0);await noOverflow(chef);
 for(const width of [375,390,768,1440]){
  await chef.setViewportSize({width,height:1000});await noOverflow(chef);
  await chef.waitForTimeout(300);
  if(width<768){const sheet=await chef.locator('.recipe-service-layout').boundingBox();const ingredients=await chef.locator('.recipe-ingredient-table').boundingBox();assert(sheet&&ingredients&&ingredients.width>sheet.width-40,'Mobile ingredient rows must fill the sheet');}
  await chef.screenshot({path:'/tmp/cocotte-recipe-sheet-'+width+'.png',fullPage:true});
 }
 const placeholderPage=await browser.newPage({viewport:{width:375,height:812}});
 await login(placeholderPage,'chef@recipe-ui.test');await placeholderPage.goto(base+'/recipes/'+fixtures[1].id);
 await expect(placeholderPage.getByText('No image',{exact:true})).toBeVisible();
 assert((await placeholderPage.locator('.recipe-identity-photo').boundingBox())!.height<=65);await noOverflow(placeholderPage);await placeholderPage.close();
 await chef.setViewportSize({width:1440,height:1000});await chef.waitForTimeout(300);await chef.screenshot({path:'/tmp/cocotte-recipe-detail-test.png',fullPage:true});
 const touch=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await login(touch,'chef@recipe-ui.test');await touch.goto(base+'/recipes');
 assert(await touch.evaluate(()=>matchMedia('(hover: none)').matches));
 const touchCard=touch.locator('section[aria-label="Recipe library"] .recipe-card').first();
 await touchCard.hover();await expect(touchCard).toHaveCSS('transform','none');
 const hit=await touchCard.boundingBox();assert(hit);await touch.mouse.move(hit.x+20,hit.y+20);await touch.mouse.down();
 await expect.poll(async()=>await touchCard.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m42)).toBeGreaterThan(.5);
 await touch.mouse.up();await expect(touch).toHaveURL(new RegExp('/recipes/'+fixtures[0].id+'$'));
 await touch.goto(base+'/recipes');await touch.locator('section[aria-label="Recipe library"] .recipe-card-link').first().tap();await expect(touch).toHaveURL(new RegExp('/recipes/'+fixtures[0].id+'$'));await touch.close();
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/dashboard');
 assert.deepEqual(await page.locator('.card').first().evaluate(el=>({radius:getComputedStyle(el).borderRadius,background:getComputedStyle(el).backgroundColor})),dashboardStyles);
 assert.deepEqual(errors,[]);
 console.log('PASS synthetic recipe UI: four columns at every tested width, eight desktop cards, desktop hover/image/arrow, keyboard focus/Enter, reduced motion, touch press/tap, search/category/empty states, preserved existing ingredients/units/method/allergens/images/links, create/edit, keep/replace/remove photo, cycle validation retaining edits, delete cancellation, hidden/role protection, 320–1440px and unchanged dashboard styling.');
}finally{
 await browser?.close();app?.kill('SIGTERM');if(!poolClosed)await pool.end();await prisma.$disconnect();
 await exec('pg_ctl',['-D',cluster,'-m','fast','-w','stop']);await rm(root,{recursive:true,force:true});
}
