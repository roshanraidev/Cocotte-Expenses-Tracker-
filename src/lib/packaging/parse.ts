import {validDateKey} from '../dates';
export type ExtractedLine={description:string;quantity:string;unit:string;unitPrice:string;lineNet:string;packSize:string;uncertain:boolean;printedLineTotal?:string};
export type Extraction={supplierName:string;invoiceNumber:string;invoiceDate:string;orderNumber:string;orderDate:string;deliveryDate:string;net:string;vat:string;gross:string;printedTotal:string;lines:ExtractedLine[];warnings:string[]};
const calendar=(s:string)=>{const p=s.split(/[/.\-]/);const key=p[0].length===4?s:`${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;return validDateKey(key)?key:'';};
/** Suggestions retain only printed values; dates never substitute for one another. */
export function parseInvoiceText(text:string):Extraction {
 const result:Extraction={supplierName:'',invoiceNumber:'',invoiceDate:'',orderNumber:'',orderDate:'',deliveryDate:'',net:'',vat:'',gross:'',printedTotal:'',lines:[],warnings:['Check the suggested products and net amounts against the original.']};
 const rows=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);const money='([0-9][0-9,]*(?:\\.[0-9]{2,4})?)';
 const netColumns=rows.some(r=>/\b(description|product|qty|quantity|unit\s+price|price|amount|line\s+total)\b/i.test(r)&&/\bnet\b|ex(?:cluding|cl)?\.?\s*VAT/i.test(r));
 const priceColumn=/unit\s+price|price\s*£/i.test(text);
 const hasTableHeader=rows.some(r=>/\b(description|product|item)\b/i.test(r));let inTable=false,tableEnded=false;
 for(const row of rows){
  if(/\b(description|product(?:\s+name)?|item\s+description)\b/i.test(row)&&/\b(qty|quantity|price|net|amount|total)\b/i.test(row))inTable=true;
  if(inTable&&/^(?:net|vat|gross|total|subtotal|bank|registered|due|co\s+reg)\b/i.test(row)){inTable=false;tableEnded=true;}
  const supplier=row.match(/^(?:supplier|sold by|from)\s*:\s*(.+)/i);if(supplier)result.supplierName=supplier[1];
  for(const [label,key] of [['invoice','invoiceNumber'],['(?:purchase\\s+)?order','orderNumber']] as const){const m=row.match(new RegExp('\\b'+label+'\\s*(?:no\\.?|number|#)\\s*[:#]?\\s*([A-Z0-9][A-Z0-9/_.-]*)','i'));if(m)result[key]=m[1];}
  for(const [label,key] of [['invoice','invoiceDate'],['(?:purchase\\s+)?order','orderDate'],['(?:delivery|received|received/delivery)','deliveryDate']] as const){const m=row.match(new RegExp('\\b'+label+'\\s+date\\s*:?\\s*(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.]\\d{1,2}[/.]\\d{4})','i'));if(m)result[key]=calendar(m[1]);}
  const total=row.match(new RegExp('(?:^|\\s{2,})(net(?:\\s+(?:total|amount))?|total\\s+(?:net|ex(?:cluding|cl)?\\.?\\s*VAT)|VAT(?:\\s+(?:amount|total))?|gross(?:\\s+total)?|total\\s+inc(?:luding|l)?\\.?\\s*VAT)\\s*[:£ ]+'+money+'(?:\\s|$)','i'));
  if(total){const value=total[2].replaceAll(',','');if(/vat/i.test(total[1])&&!/ex|inc/i.test(total[1]))result.vat=value;else if(/gross|inc/i.test(total[1]))result.gross=value;else result.net=value;continue;}
  const printed=row.match(new RegExp('(?:^|\\s{2,})total(?:\\s+(?:amount|due))?\\s*[:£ ]+'+money+'(?:\\s|$)','i'));if(printed){result.printedTotal=printed[1].replaceAll(',','');continue;}
  if(/^(?:total|subtotal|net|vat|gross|balance|invoice|order|delivery|received|bank|account|tel|code|due)\b/i.test(row))continue;
  const full=row.match(new RegExp('^(.+?)\\s+(\\d+(?:\\.\\d{1,4})?)\\s+(?:([A-Za-z][A-Za-z0-9/-]*)\\s+)?£?'+money+'\\s+£?'+money+'\\s*$'));
  const short=!full&&inTable&&!priceColumn?row.match(new RegExp('^(.+?)\\s+(\\d+(?:\\.\\d{1,4})?)\\s+£?'+money+'\\s*$')):null;
  const unclear=!full&&!short&&inTable?row.match(new RegExp('^(.+?)\\s+([?IlO-])\\s+£?'+money+'\\s+£?'+money+'\\s*$')):null;
  if(unclear){result.lines.push({description:unclear[1].replace(/\s+/g,' '),quantity:'',unit:'',unitPrice:'',lineNet:netColumns?unclear[4].replaceAll(',',''):'',printedLineTotal:unclear[4].replaceAll(',',''),packSize:'',uncertain:true});continue;}
  if((full||short)&&!tableEnded&&(inTable||(!hasTableHeader&&!!full?.[3]))){const m=(full||short)!;if(!/[a-z]/i.test(m[1]))continue;const amount=(full?m[5]:m[3]).replaceAll(',','');result.lines.push({description:m[1].replace(/\s+/g,' '),quantity:m[2],unit:full?(m[3]||''):'',unitPrice:full&&netColumns?m[4].replaceAll(',',''):'',lineNet:netColumns?amount:'',printedLineTotal:amount,packSize:'',uncertain:true});}
 }
 if(!result.supplierName){const domain=text.match(/www\.([a-z0-9-]+)\./i)?.[1];const candidates=rows.filter(r=>r.length<=100&&/\b(?:ltd\.?|limited|plc)\s*$/i.test(r));result.supplierName=(domain?candidates.find(r=>r.toLowerCase().includes(domain.toLowerCase())):rows.slice(0,3).find(r=>candidates.includes(r)))||'';}
 if(!result.net)result.warnings.push('Net total was not found. Enter the verified amount excluding VAT; a printed total is not assumed to be net.');
 if(!netColumns&&result.lines.length)result.warnings.push('Printed line amounts have an unclear VAT basis. Enter their verified net amounts.');
 if(!result.lines.length)result.warnings.push('No product rows could be read. Add products manually.');
 return result;
}
