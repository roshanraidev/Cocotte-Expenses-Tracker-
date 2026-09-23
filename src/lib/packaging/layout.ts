import type {ExtractedLine} from './parse';
export type PositionedText={str:string;transform:number[];width:number};
type Row={y:number;items:PositionedText[]};
const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
const numeric=(s:string)=>/^£?\s*\d[\d,]*(?:\.\d{1,4})?$/.test(s.trim())?s.replace(/[£,\s]/g,''):'';
/** Read visual rows left-to-right, not PDF content-stream order. No financial values are inferred. */
export function positionedInvoice(items:PositionedText[],tolerance=3){
 const rows:Row[]=[];
 for(const item of items.filter(i=>i.str.trim()).sort((a,b)=>b.transform[5]-a.transform[5])){let row=rows.find(r=>Math.abs(r.y-item.transform[5])<=tolerance);if(!row){row={y:item.transform[5],items:[]};rows.push(row);}row.items.push(item);}
 rows.forEach(r=>{r.items.sort((a,b)=>a.transform[4]-b.transform[4]);for(let i=0;i<r.items.length-1;i++){const a=r.items[i],b=r.items[i+1];const joined=clean(a.str+' '+b.str);if(/^(no of|unit price|price £|net £|invoice no:|order no:|order date:|delivery date:|received date:)$/i.test(joined)&&b.transform[4]-(a.transform[4]+a.width)<35){r.items.splice(i,2,{...a,str:joined,width:b.transform[4]+b.width-a.transform[4]});i--;}}});
 const text=rows.map(r=>r.items.map(i=>i.str).join('  ')).join('\n');const lines:ExtractedLine[]=[];
 for(let h=0;h<rows.length;h++){
  const row=rows[h];const description=row.items.find(i=>/^(description|product(?:\s+name)?|item\s+description)$/i.test(clean(i.str)));const net=row.items.find(i=>/^(net(?:\s*£|\s+amount|\s+total)?|(?:line\s+)?total\s+(?:ex.*vat|net)|amount\s+ex.*vat)$/i.test(clean(i.str)));
  if(!description||!net)continue;
  const nearby=rows.slice(Math.max(0,h-1),h+3).flatMap(r=>r.items);
  const quantity=nearby.find(i=>/^no\.?\s*of$/i.test(clean(i.str)))||row.items.find(i=>/^(qty|quantity|cases)$/i.test(clean(i.str)))||nearby.find(i=>/^(qty|quantity|cases)$/i.test(clean(i.str)));
  if(!quantity)continue;
  const price=row.items.find(i=>/^(?:unit\s+)?price(?:\s*£|\s+ex.*vat)?$/i.test(clean(i.str)));
  const anchors=[{key:'description',x:description.transform[4]},{key:'quantity',x:quantity.transform[4]},{key:'net',x:net.transform[4]},...(price?[{key:'price',x:price.transform[4]}]:[])].sort((a,b)=>a.x-b.x);
  const casePack=nearby.find(i=>/^case$/i.test(clean(i.str))&&i.transform[4]<quantity.transform[4]&&i.transform[4]>description.transform[4]);
  if(casePack)anchors.push({key:'pack',x:casePack.transform[4]});anchors.sort((a,b)=>a.x-b.x);
  const isCases=nearby.some(i=>/^cases$/i.test(clean(i.str))&&Math.abs(i.transform[4]-quantity.transform[4])<25);
  for(let n=h+1;n<rows.length;n++){
   const r=rows[n];const joined=clean(r.items.map(i=>i.str).join(' '));if(/^(net\b|vat\b|total\b|£?\s*vat analysis|bank details|subtotal)/i.test(joined))break;
   const cells:Record<string,string[]>={};for(const i of r.items){if(!numeric(i.str))continue;const x=i.transform[4]+i.width/2;if(x<description.transform[4]-8)continue;let target=anchors[0];for(const a of anchors.slice(1)){if(Math.abs(x-a.x)<Math.abs(x-target.x))target=a;} // Numbers are right-aligned; join description fragments separately below.
    (cells[target.key]??=[]).push(i.str);
   }
   const qty=numeric((cells.quantity||[]).join('')),amount=numeric((cells.net||[]).join(''));
   if(!qty||!amount)continue;
   const boundary=Math.min(...anchors.filter(a=>a.key!=='description').map(a=>a.x))-20;
   const name=clean(r.items.filter(i=>i.transform[4]>=description.transform[4]-8&&i.transform[4]<boundary).map(i=>i.str).join(' '));if(!name||!/[a-z]/i.test(name))continue;
   const unitPrice=numeric((cells.price||[]).join(''));const pack=numeric((cells.pack||[]).join(''));
   lines.push({description:name,quantity:qty,unit:isCases?'case':'',packSize:isCases&&pack?`${pack} per case`:'',unitPrice,lineNet:amount,uncertain:true});
  }
 }
 // Label/value rows can be separated visually (e.g. Invoice No above its value).
 const metadata:string[]=[];
 for(let n=0;n<rows.length-1;n++)for(const item of rows[n].items){const label=clean(item.str);if(!/^(invoice\s*(?:no\.?|number)|order\s*(?:no\.?|number|date)|delivery\s*date|received\s*date|invoice\s*date)\s*:$/i.test(label))continue;const next=rows[n+1].items.filter(v=>Math.abs(v.transform[4]-item.transform[4])<18);if(next.length===1)metadata.push(`${label} ${next[0].str}`);}
 return {text:text+'\n'+metadata.join('\n'),lines};
}
