import {createHash} from 'node:crypto';
import {allowZonalRequest} from './network-policy.mjs';
import {ORIGIN,LOGIN_SELECTORS} from './browser-session.mjs';
const GET_PERIOD='/stock/picker/picker.aspx/getchosenperiodid';
const SET_PERIOD='/stock/picker/picker.aspx/setchosenperiodid';
export function allowDeliveryRequest(url,method,type,body){
 if(allowZonalRequest(url,method,type))return true;
 if(url.origin!==ORIGIN||method!=='POST'||type!=='xhr')return false;
 if(url.pathname.toLowerCase()===GET_PERIOD)return true;
 if(url.pathname.toLowerCase()!==SET_PERIOD)return false;
 // Picker.js emits an ASP.NET object literal with an unquoted property name,
 // not strict JSON. Accept only this one numeric view-selection field.
 return /^\{\s*(?:chosenPeriodID|"chosenPeriodID")\s*:\s*(?:0|[1-9]\d{0,12})\s*\}$/.test(body??'');
}
export function deliveryDate(value){
 let year,month,day;const numeric=value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
 if(numeric){[,day,month,year]=numeric;}else{
 const words=value.trim().match(/^(\d{2}) ([A-Za-z]{3}) (\d{4})$/);if(!words)throw new Error('DELIVERY_DATE_CHANGED');
 day=words[1];month=String(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(words[2])+1).padStart(2,'0');year=words[3];
 }
 const result=`${year}-${month}-${day}`;if(month==='00'||new Date(result+'T00:00:00Z').toISOString().slice(0,10)!==result)throw new Error('DELIVERY_DATE_CHANGED');return result;
}
export function deliveryPeriod(label){const parts=label.trim().split(' - ');if(parts.length!==2)throw new Error('PERIOD_LAYOUT_CHANGED');const from=deliveryDate(parts[0]),to=deliveryDate(parts[1]);if(from>to)throw new Error('PERIOD_LAYOUT_CHANGED');return {from,to};}
export function deliveryMoney(value){
 let v=value.trim(),negative=false;if(/^\(.*\)$/.test(v)){negative=true;v=v.slice(1,-1);}if(v.startsWith('-')||v.startsWith('−')){negative=true;v=v.slice(1);}v=v.replace(/^£\s*/,'');
 if(!/^(?:\d{1,12}|\d{1,3}(?:,\d{3}){1,3})\.\d{2}$/.test(v))throw new Error('DELIVERY_AMOUNT_CHANGED');
 const [whole,fraction]=v.replaceAll(',','').split('.');return ((BigInt(whole)*100n+BigInt(fraction))*(negative?-1n:1n)).toString();
}
export function parseDeliveryRow(raw,period){
 if(!raw.id||raw.id.length>150||raw.cells.length!==11)throw new Error('DELIVERY_LAYOUT_CHANGED');
 const cells=raw.cells.map(v=>v.trim());if(!cells[2]||!cells[3]||cells[2].length>254||cells[3].length>254)throw new Error('DELIVERY_IDENTITY_MISSING');
 return {id:raw.id,date:deliveryDate(cells[1]),supplier:cells[2],document:cells[3],items:deliveryMoney(cells[4]),unknown:deliveryMoney(cells[5]),invoice:deliveryMoney(cells[6]),credit:deliveryMoney(cells[7]),total:deliveryMoney(cells[8]),period};
}
export function uniqueDeliveries(rows){const result=new Map();for(const row of rows){const prior=result.get(row.id);if(prior){const financial=r=>JSON.stringify({...r,period:undefined,evidence:undefined});if(financial(prior)!==financial(row))throw new Error('DELIVERY_CHANGED_BETWEEN_PERIODS');}else result.set(row.id,row);}return [...result.values()];}
const tableSelector='#parentThisStockPeriods';
async function ready(page){
 await page.locator('#ddlPreviousPeriods option').first().waitFor({state:'attached'});
 await page.locator('#ProfitCentreLoading').waitFor({state:'hidden',timeout:20000});
}
async function assertBranch(page){if(await page.locator(LOGIN_SELECTORS.password).isVisible())throw new Error('SESSION_EXPIRED');if(await page.getByText(/003\s*[–-]?\s*Parsons Green/i).filter({visible:true}).count()!==1)throw new Error('BRANCH_NOT_VERIFIED');}
export async function readDeliveries(page,from,to,stage=()=>{},registeredNames=[]){
 // Only navigation and period selection. Never enter the editable detail view:
 // its navigation handlers were observed attempting an automatic Save.
 const timings={navigationMs:0,tableMs:0,detailsMs:0};let started=performance.now();
 stage('STOCK_NAVIGATION');await page.getByRole('link',{name:'Stock',exact:true}).filter({visible:true}).click();await ready(page);await assertBranch(page);
 const link=page.getByRole('link',{name:'Deliveries',exact:true}).filter({visible:true});if(await link.count()!==1)throw new Error('DELIVERY_NAVIGATION_CHANGED');
 stage('DELIVERY_NAVIGATION');await link.click();await page.locator(tableSelector).waitFor();await ready(page);await assertBranch(page);
 timings.navigationMs+=performance.now()-started;
 const options=await page.locator('#ddlPreviousPeriods option').evaluateAll(es=>es.map(e=>({value:e.value,label:e.textContent.trim()})));
 const periods=options.map(o=>({...o,...deliveryPeriod(o.label)})).filter(p=>p.from<=to&&p.to>=from).sort((a,b)=>a.from.localeCompare(b.from));
 if(!periods.length||periods.length>6||periods[0].from>from||periods.at(-1).to<to)throw new Error('PERIOD_RANGE_UNAVAILABLE');
 for(let i=1;i<periods.length;i++){const next=new Date(periods[i-1].to+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);if(periods[i].from>next.toISOString().slice(0,10))throw new Error('PERIOD_RANGE_UNAVAILABLE');}
 let records=[];let rowsChecked=0;const evidenceCache=new Map();const normal=s=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();const registered=new Set(registeredNames.map(normal));
 for(const [index,period] of periods.entries()){
  started=performance.now();stage('PERIOD_SELECTION',index+1,periods.length);
  if(await page.locator('#ddlPreviousPeriods').inputValue()!==period.value){
   const navigation=page.waitForEvent('framenavigated',{predicate:f=>f===page.mainFrame(),timeout:20000});
   await page.locator('#ddlPreviousPeriods').selectOption(period.value);await navigation;await page.waitForLoadState('domcontentloaded');await ready(page);
   await page.waitForFunction(v=>document.querySelector('#ddlPreviousPeriods')?.value===v,period.value,{timeout:15000});
  }
  await assertBranch(page);await page.locator(tableSelector).waitFor();
  timings.navigationMs+=performance.now()-started;started=performance.now();stage('DELIVERY_ROWS',index+1,periods.length);const headers=await page.locator(tableSelector+' thead tr').first().locator('th').allTextContents();
  if(headers.slice(1,9).map(v=>v.trim()).join('|')!=='Date|Supplier|Doc Number|Items|Unknown|Invoice Amount|Credit|Total')throw new Error('DELIVERY_LAYOUT_CHANGED');
  await page.locator(tableSelector+' tbody tr').first().waitFor({state:'attached',timeout:15000});
  const raw=await page.locator(tableSelector+' tbody tr[deliveryid]').evaluateAll(es=>es.map(e=>({id:e.getAttribute('deliveryid'),cells:[...e.cells].map(c=>c.textContent),detailLink:e.getAttribute('data-link')})));
  if(raw.length>500)throw new Error('DELIVERY_LIMIT');rowsChecked+=raw.length;
  const parsed=raw.map(r=>parseDeliveryRow(r,period.label));timings.tableMs+=performance.now()-started;started=performance.now();
  const candidates=parsed.map((record,position)=>({record,link:raw[position].detailLink})).filter(({record})=>record.date>=from&&record.date<=to&&registered.has(normal(record.supplier)));
  await verifyDetailBatches(candidates,async({record,link})=>{
   stage('DELIVERY_EVIDENCE',index+1,periods.length);
   // Keep the session on this period until both bounded GETs finish.
   if(!evidenceCache.has(record.id))evidenceCache.set(record.id,await readDeliveryEvidence(page,record,link));
   record.evidence=evidenceCache.get(record.id);
  },()=>page.waitForTimeout(500));
  timings.detailsMs+=performance.now()-started;
  records.push(...parsed);
 }
 records=uniqueDeliveries(records).filter(r=>r.date>=from&&r.date<=to);if(records.length>500)throw new Error('DELIVERY_LIMIT');
 return {records,periods:periods.map(p=>p.label),rowsChecked,timings:Object.fromEntries(Object.entries(timings).map(([key,value])=>[key,Math.round(value)]))};
}

// Read the observed HTML document without executing its editor JavaScript.
// This avoids the editor's before-unload Save handler entirely.
export async function readDeliveryEvidence(page,record,detailLink){
 const unavailable=reason=>({detailRead:false,net:null,vat:null,supplierCode:null,accepted:null,electronic:null,accrual:null,lineCount:0,manualPosted:false,classificationVerified:false,creditVerified:false,reason});
 try{
  const url=new URL(detailLink,page.url());const id=[...url.searchParams].find(([key])=>key.toLowerCase()==='deliveryid')?.[1];
  if(url.origin!==ORIGIN||!/^\/stock\/deliveries\/deliverydetails.aspx$/i.test(url.pathname)||id!==record.id)return unavailable('This row does not expose a verified delivery-detail identity; credit/accrual documents need separate handling.');
  const response=await page.context().request.get(url.href,{timeout:12000,maxRedirects:0,maxRetries:0});
  try{
   if(response.status()!==200||new URL(response.url()).origin!==ORIGIN)return unavailable('The delivery detail was unavailable or the Zonal session expired.');
   const html=await response.text();if(html.length>2000000)return unavailable('The delivery detail exceeded the safe document limit.');
   const data=await page.evaluate(html=>{
    const d=new DOMParser().parseFromString(html,'text/html');
    const input=id=>d.querySelector('input[id$="'+id+'"]')?.value;
    let records=[],lines=[];try{records=JSON.parse(input('hiddenDeliveryDetails')??'[]');lines=JSON.parse(input('hiddenInvoiceDT')??'[]');}catch{/* Missing evidence remains missing. */}
    const r=Array.isArray(records)&&records.length===1?records[0]:null;
    return {netLabel:d.querySelector('label[for="txtInvoiceAmount"]')?.textContent.trim(),net:typeof r?.InvoiceAmount==='number'||typeof r?.InvoiceAmount==='string'?String(r.InvoiceAmount):d.querySelector('#txtInvoiceAmount')?.value,vat:typeof r?.VAT==='number'||typeof r?.VAT==='string'?String(r.VAT):d.querySelector('#txtVATAmount')?.value,document:typeof r?.DocumentNo==='string'?r.DocumentNo:d.querySelector('#txtDocumentNumber')?.value,supplier:r?.SupplierName,supplierCode:Number.isSafeInteger(r?.SupplierID)?String(r.SupplierID):typeof r?.SupplierID==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(r.SupplierID)?r.SupplierID:null,accepted:r?.InvoiceAcceptedYN??null,electronic:r?.ElectronicInvoiceYN??null,accrual:input('hiddenIsAccrual')==='True'?true:input('hiddenIsAccrual')==='False'?false:null,lineFingerprint:JSON.stringify(lines),contradictoryLineClassification:Array.isArray(lines)&&lines.some(l=>[true,1,'True','true','1'].includes(l.AncillaryYN??l.IsAncillary)||[l.CategoryName,l.Category,l.DepartmentName,l.Department].some(value=>['DRINK','DRINKS','BEVERAGE','BEVERAGES','NONFOOD','PACKAGING','CHEMICAL','CHEMICALS','DISPOSABLES','CLEANING'].includes(String(value??'').toUpperCase().replace(/[^A-Z]/g,'')))),lineCount:Array.isArray(lines)?lines.length:0,movementDate:typeof r?.StockMovementDate==='string'?r.StockMovementDate:null,documentSource:typeof r?.DocumentSource==='number'?r.DocumentSource:/^[123]$/.test(String(r?.DocumentSource??''))?Number(r.DocumentSource):null,receivedQuantities:Array.isArray(lines)&&lines.length>0&&lines.every(l=>/^\d{1,10}(?:\.\d{1,4})?$/.test(String(l.DeliveryQty)))&&lines.some(l=>/[1-9]/.test(String(l.DeliveryQty)))};
   },html);
   data.accepted=zonalBoolean(data.accepted);data.electronic=zonalBoolean(data.electronic);
   const normal=s=>String(s??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
   if(normal(data.document)!==normal(record.document)||normal(data.supplier)!==normal(record.supplier))return unavailable('The detail supplier/document does not match the delivery-list record; the source may have changed.');
   let net=null,vat=null;
   const plain=value=>{if(typeof value!=='string'||!value.trim())throw new Error();let v=value.trim();if(/^-?\d+(?:\.\d{1,2})?$/.test(v)){const [a,b='']=v.split('.');v=a+'.'+b.padEnd(2,'0');}return deliveryMoney(v);};
   try{if(data.netLabel==='Invoice Amount (Net)')net=plain(data.net);}catch{/* Never infer or default an unreadable amount. */}
   try{vat=plain(data.vat);}catch{/* Separate VAT stays unavailable. */}
   let movementDate=null;try{if(typeof data.movementDate==='string'){if(/^\d{2}\/\d{2}\/\d{4}$/.test(data.movementDate))movementDate=deliveryDate(data.movementDate);else if(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(data.movementDate))movementDate=data.movementDate.slice(0,10);else{const dotnet=data.movementDate.match(/^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/);if(dotnet)movementDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Number(dotnet[1])));}}}catch{/* Unreadable movement date remains unverified. */}
   const manualPosted=data.electronic===false&&data.accrual===false&&data.documentSource===1&&data.receivedQuantities&&movementDate===record.date;
   return {detailRead:true,net,vat,supplierCode:data.supplierCode,accepted:data.accepted,electronic:data.electronic,accrual:data.accrual,lineCount:data.lineCount,lineFingerprint:createHash('sha256').update(data.lineFingerprint).digest('hex'),contradictoryLineClassification:data.contradictoryLineClassification,manualPosted,manualChecks:{manual:data.electronic===false,nonAccrual:data.accrual===false,manualSource:data.documentSource===1,receivedQuantities:data.receivedQuantities,dateMatches:movementDate===record.date},classificationVerified:false,creditVerified:record.credit==='0'&&net!==null&&net===record.total,reason:net!==null&&net!==record.invoice?'The list and detail net amounts differ; the source changed or requires reconciliation.':null};
  }finally{await response.dispose();}
 }catch{return unavailable('The read-only delivery detail request failed or timed out; no retry or modification was attempted.');}
}

// Two document GETs at most; a pause between pairs bounds request pressure.
export async function verifyDetailBatches(items,read,pause){
 for(let offset=0;offset<items.length;offset+=2){await Promise.all(items.slice(offset,offset+2).map(read));if(offset+2<items.length)await pause();}
}

export function zonalBoolean(value){
 if(value===true||value===1||typeof value==='string'&&/^(true|1)$/i.test(value))return true;
 if(value===false||value===0||typeof value==='string'&&/^(false|0)$/i.test(value))return false;
 return null;
}
