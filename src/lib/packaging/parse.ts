export type ExtractedLine={description:string;quantity:string;unit:string;unitPrice:string;lineNet:string;packSize:string;uncertain:boolean};
export type Extraction={supplierName:string;invoiceNumber:string;invoiceDate:string;net:string;vat:string;gross:string;printedTotal:string;lines:ExtractedLine[];warnings:string[]};
/** Conservative suggestions only: unspecified tax basis never becomes a net value. */
export function parseInvoiceText(text:string):Extraction {
 const result:Extraction={supplierName:'',invoiceNumber:'',invoiceDate:'',net:'',vat:'',gross:'',printedTotal:'',lines:[],warnings:['Review every extracted value against the original invoice.']};
 const rows=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const money='([0-9][0-9,]*(?:\\.[0-9]{2,4})?)';
 const netColumns=/\b(?:unit\s+price|price|line\s+total|amount)\b[^\n]*(?:ex(?:cluding|cl)?\.?\s*VAT|net)\b/i.test(text);
 for(const row of rows){
  const supplier=row.match(/^(?:supplier|sold by|from)\s*:\s*(.+)/i);if(supplier)result.supplierName=supplier[1];
  const number=row.match(/\binvoice\s*(?:no\.?|number|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9/_.-]*)/i);if(number)result.invoiceNumber=number[1];
  const date=row.match(/invoice\s+date\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i);if(date){const p=date[1].split('/');result.invoiceDate=p.length===3?`${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`:date[1];}
  const total=row.match(new RegExp('^(net(?:\\s+(?:total|amount))?|total\\s+(?:net|ex(?:cluding|cl)?\\.?\\s*VAT)|VAT(?:\\s+(?:amount|total))?|gross(?:\\s+total)?|total\\s+inc(?:luding|l)?\\.?\\s*VAT)\\s*[:£ ]+('+money+')\\s*$','i'));
  if(total){const value=total[2].replaceAll(',','');if(/vat/i.test(total[1])&&!/ex|inc/i.test(total[1]))result.vat=value;else if(/gross|inc/i.test(total[1]))result.gross=value;else result.net=value;continue;}
  const printed=row.match(new RegExp('^total(?:\\s+(?:amount|due))?\\s*[:£ ]+'+money+'\\s*$','i'));if(printed){result.printedTotal=printed[1].replaceAll(',','');continue;}
  const line=row.match(new RegExp('^(.+?)\\s+(\\d+(?:\\.\\d{1,4})?)\\s+([A-Za-z][A-Za-z0-9/-]*)\\s+£?'+money+'\\s+£?'+money+'\\s*$'));
  if(line&&!/^(?:total|subtotal|net|vat|gross|balance)\b/i.test(line[1]))result.lines.push({description:line[1],quantity:line[2],unit:line[3],unitPrice:netColumns?line[4].replaceAll(',',''):'',lineNet:netColumns?line[5].replaceAll(',',''):'',packSize:'',uncertain:true});
 }
 if(!result.supplierName){const heading=rows.slice(0,3).find(r=>r.length<=100&&/\b(?:ltd\.?|limited|plc)\s*$/i.test(r));if(heading)result.supplierName=heading;}
 if(!result.net)result.warnings.push('Net total is unclear. Confirm the amount excluding VAT manually; gross is never substituted.');
 if(!netColumns&&result.lines.length)result.warnings.push('Line tax basis is unclear; net prices and totals need manual entry.');
 if(!result.lines.length)result.warnings.push('No reliable product rows found. Add the lines manually using the original invoice.');
 return result;
}
