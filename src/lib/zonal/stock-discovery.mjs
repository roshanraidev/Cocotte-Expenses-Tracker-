// Catalogue metadata only. Never infer stock values from Financial Detail.
export async function discoverStockReports(page,stage=()=>{}){
 stage('REPORT_NAVIGATION','STARTED');
 await page.getByRole('link',{name:'Reports',exact:true}).click();
 await page.getByRole('link',{name:'Financial',exact:true}).waitFor({state:'visible',timeout:15000});
 const read=async()=>page.getByRole('link').evaluateAll(elements=>elements.map(e=>(e.textContent??'').trim().replace(/\s+/g,' ')).filter(name=>name.length<=100&&/stock|inventory|valuation|transfer|delivery|credit/i.test(name)&&/^[A-Za-z0-9 .,&()/%+–-]+$/.test(name)).slice(0,40));
 const folders=await read();
 const stock=folders.find(name=>/^stock(?: control| reports)?\.?$/i.test(name));
 let reports=[];
 if(stock){
  const link=page.getByRole('link',{name:stock,exact:true});
  if(await link.count()===1){await link.click();await page.waitForTimeout(1500);reports=await read();}
 }
 const reportNames=[...new Set([...folders,...reports].filter(name=>/\.$/.test(name)))];
 let reportOpened=false;
 let parameterLabels=[];
 let branchAvailable=false;
 // Exact title observed in the authorised catalogue; absence/ambiguity stops inspection.
 const report=page.getByRole('link',{name:'Stock Result Summary.',exact:true});
 if(await report.count()===1){
  await report.click();
  page=page.context().pages().at(-1)??page;
  await page.waitForLoadState('domcontentloaded',{timeout:15000});
  await page.waitForTimeout(1000);
  const known=['Start Date','End Date','Stock Date','Stocktake Date','Stock Period','Period','Profit Centre','Branch','Site'];
  for(const label of known)if(await page.getByLabel(label,{exact:true}).count()>0)parameterLabels.push(label);
  branchAvailable=await page.getByLabel('003 - Parsons Green',{exact:true}).count()>0||await page.locator('option').filter({hasText:/003.*Parsons Green/i}).count()>0;
  reportOpened=parameterLabels.length>0;
 }
 stage('REPORT_NAVIGATION','OK');
 return {catalogueVerified:true,folders,reportNames,extractionVerified:false,reportOpened,parameterLabels,branchAvailable};
}
