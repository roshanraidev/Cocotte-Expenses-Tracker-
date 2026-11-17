import {deliveryFingerprint} from './delivery-identity';
export type DeliveryEvidence={detailRead:boolean;net:string|null;vat:string|null;supplierCode:string|null;accepted:boolean|null;electronic:boolean|null;accrual:boolean|null;lineCount:number;manualPosted?:boolean;manualChecks?:{manual:boolean;nonAccrual:boolean;manualSource:boolean;receivedQuantities:boolean;dateMatches:boolean};classificationVerified:boolean;contradictoryLineClassification?:boolean;lineFingerprint?:string;creditVerified:boolean;reason:string|null};
export type DeliveryRecord={id:string;date:string;supplier:string;document:string;items:string;unknown:string;invoice:string;credit:string;total:string;period:string;evidence?:DeliveryEvidence};
export type DeliverySupplier={id:string;name:string;active:boolean;foodWorkspace:boolean;packagingWorkspace?:boolean};
export type DeliveryPurchase={id:string;supplierId:string;reference:string;voidedAt:Date|null};
export const supplierName=(value:string)=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleUpperCase('en-GB');
export const invoiceReference=(value:string)=>value.normalize('NFKC').trim().replace(/\s+/g,'').toLocaleUpperCase('en-GB');
export type DeliveryLedger={deliveryId:string;supplierId:string;fingerprint:string;purchase:{voidedAt:Date|null;amountPence:bigint;supplierId?:string;reference?:string;accountingDate?:Date}};
export function deliveryReviewReasons(record:DeliveryRecord,supplier?:DeliverySupplier){
 const e=record.evidence;if(!e?.detailRead)return [e?.reason??'The delivery detail has not been read; net VAT basis and submitted status are unavailable.'];
 const reasons:string[]=[];
 if(e.reason)reasons.push(e.reason);if(e.net!==null&&BigInt(e.net)<=0n)reasons.push('Zero/negative invoices require a separate credit or adjustment workflow.');
 if(e.net===null)reasons.push('The detail does not provide a readable amount labelled Invoice Amount (Net).');
 if(e.vat===null)reasons.push('The separate VAT Amount field is missing or unreadable.');
 if(e.accrual!==false)reasons.push('This is an accrual; a final received invoice is not verified.');
 if(!(e.electronic===true?e.accepted===true:e.manualPosted===true)){
  const statusReasonCount=reasons.length;
  if(e.electronic===true)reasons.push('Zonal marks this electronic invoice as not accepted.');
  else if(e.manualChecks){
   if(!e.manualChecks.manualSource)reasons.push('The source document type is not a verified manual receipt.');
   if(!e.manualChecks.receivedQuantities)reasons.push('Received quantities are missing, invalid or all zero.');
   if(!e.manualChecks.dateMatches)reasons.push('The saved stock-movement date is missing or differs from the delivery date.');
   if(!e.manualChecks.manual)reasons.push('The electronic/manual flag is not established.');
  }else reasons.push('This manual delivery has no separately verified received/submitted marker. Its invoice-acceptance flag does not establish manual submission.');
  if(reasons.length===statusReasonCount)reasons.push('Saved receipt completion was not verified by the source reader.');
 }
 if(!e.lineCount)reasons.push('No product lines are available to verify goods received.');
 if(e.contradictoryLineClassification)reasons.push('Zonal line data contradicts a food-only classification.');
 if(!e.classificationVerified&&!(supplier?.foodWorkspace===true&&supplier.packagingWorkspace===false&&!e.contradictoryLineClassification))reasons.push('Mixed or unclassified supplier: verified food/non-food line values are required.');
 const supplierFood=supplier?.foodWorkspace===true&&supplier.packagingWorkspace===false&&!e.contradictoryLineClassification;
 if(record.unknown!=='0'&&!supplierFood)reasons.push('The Unknown adjustment has no verified food/non-food allocation.');
 if(BigInt(record.items)+BigInt(record.unknown)!==BigInt(record.invoice))reasons.push('Items plus Unknown do not reconcile to the displayed invoice amount.');
 if(record.credit!=='0')reasons.push('A credit is displayed, but its acceptance and inclusion in Total are not verified; it must not be deducted twice.');
 if(record.credit==='0'&&!e.creditVerified)reasons.push('Invoice and zero-credit Total do not reconcile.');
 return reasons;
}
export function matchDelivery(record:DeliveryRecord,suppliers:DeliverySupplier[],purchases:DeliveryPurchase[],imports:DeliveryLedger[]=[]){
 const matches=suppliers.filter(s=>supplierName(s.name)===supplierName(record.supplier));
 const reasons=deliveryReviewReasons(record,matches.length===1?matches[0]:undefined);
 const common={...record,eligible:false as boolean,verifiedNet:record.evidence?.detailRead&&record.evidence.net!==null&&!record.evidence.reason?record.evidence.net:null,reviewReasons:reasons,reason:reasons.join(' ')};
 if(!matches.length)return {...common,match:'UNMATCHED' as const,status:'Supplier Not Registered',reason:'No unique exact supplier-name match exists in Cocotte. This delivery is skipped; no supplier is created.',supplierId:null,duplicate:false};
 if(matches.length!==1)return {...common,match:'AMBIGUOUS' as const,status:'Needs Review',reason:'Multiple registered suppliers have the same normalised name.',reviewReasons:['Multiple registered suppliers have the same normalised name.'],supplierId:null,duplicate:false};
 const supplier=matches[0];const prior=imports.find(i=>i.deliveryId===record.id);
 if(prior){const unchanged=prior.supplierId===supplier.id&&prior.fingerprint===deliveryFingerprint(record)&&!prior.purchase.voidedAt&&prior.purchase.amountPence.toString()===common.verifiedNet&&(!prior.purchase.supplierId||prior.purchase.supplierId===supplier.id)&&(!prior.purchase.reference||invoiceReference(prior.purchase.reference)===invoiceReference(record.document))&&(!prior.purchase.accountingDate||prior.purchase.accountingDate.toISOString().slice(0,10)===record.date);const reason=unchanged?'This source delivery is already imported without changes.':'The Zonal delivery or its canonical purchase changed; an audited correction is required.';return {...common,match:'MATCHED' as const,status:unchanged?'Already Imported':'Needs Review',reason,reviewReasons:unchanged?[]:[reason],supplierId:supplier.id,duplicate:true};}
 const existing=purchases.filter(p=>p.supplierId===supplier.id&&invoiceReference(p.reference).replace(/[^\p{L}\p{N}]/gu,'')===invoiceReference(record.document).replace(/[^\p{L}\p{N}]/gu,''));
 if(existing.length){const reason=existing.some(p=>p.voidedAt)?'A matching Cocotte supplier/document reference exists in historical voided purchases. Review it; do not recreate it.':'A matching Cocotte supplier/document reference exists. This may be a manual duplicate or correction; no Zonal source linkage proves an unchanged prior import.';return {...common,match:'MATCHED' as const,status:'Needs Review',reason,reviewReasons:[reason,...reasons],supplierId:supplier.id,duplicate:true};}
 const supplierReason=!supplier.active?'The registered supplier is inactive.':!supplier.foodWorkspace?'The supplier is not enabled for the food purchasing ledger; non-food spending requires a separate classified posting.':null;
 const all=supplierReason?[supplierReason,...reasons]:reasons;
 return {...common,match:'MATCHED' as const,status:all.length?'Needs Review':'Ready to Import',eligible:all.length===0&&common.verifiedNet!==null&&BigInt(common.verifiedNet)>0n,supplierId:supplier.id,duplicate:false,reviewReasons:all,reason:all.join(' ')};
}
export type DeliveryPreviewRow=ReturnType<typeof matchDelivery>;
