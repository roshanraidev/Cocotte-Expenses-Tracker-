import {expect,it,describe} from 'vitest';
import {deliveryDate,deliveryMoney,deliveryPeriod,parseDeliveryRow,uniqueDeliveries,allowDeliveryRequest,verifyDetailBatches,zonalBoolean} from '../src/lib/zonal/delivery-reader.mjs';
import {matchDelivery} from '../src/lib/zonal/delivery-matching';
// Synthetic fixtures only: never used as live delivery data.
const raw={id:'fixture-1',cells:['','09/11/2026','ALBION FINE FOOD','INV 123','£100.00','£0.00','£100.00','£0.00','£100.00','','']};
const record=parseDeliveryRow(raw,'09 Nov 2026 - 15 Nov 2026');
const supplier={id:'supplier',name:'Albion Fine Food',active:true,foodWorkspace:true};
describe('verified delivery table parser',()=>{
 it('preserves names and original document numbers with integer pence',()=>{expect(record.document).toBe('INV 123');expect(record.invoice).toBe('10000');expect(record.date).toBe('2026-11-09');});
 it.each([['£1,234.56','123456'],['(£1.01)','-101'],['−£0.01','-1'],['£0.00','0']])('parses GBP %s exactly',(value,wanted)=>expect(deliveryMoney(value)).toBe(wanted));
 it.each(['','—','£1,23.00','£1.234','EUR 12.00'])('never substitutes zero for %s',value=>expect(()=>deliveryMoney(value)).toThrow());
 it('validates business dates and stock periods',()=>{expect(deliveryPeriod('02 Nov 2026 - 08 Nov 2026')).toEqual({from:'2026-11-02',to:'2026-11-08'});expect(()=>deliveryDate('31/02/2026')).toThrow();expect(()=>deliveryPeriod('bad period')).toThrow();});
 it('rejects missing identity and changed layouts',()=>{expect(()=>parseDeliveryRow({...raw,id:''},'test')).toThrow();expect(()=>parseDeliveryRow({...raw,cells:[]},'test')).toThrow();});
 it('deduplicates repeated period rows and rejects changed figures',()=>{expect(uniqueDeliveries([record,{...record,period:'other'}])).toHaveLength(1);expect(()=>uniqueDeliveries([record,{...record,total:'1'}])).toThrow('CHANGED');});
 it('allows only observed view-selection posts and blocks Save',()=>{const url=(p:string)=>new URL('https://mm.zonalconnect.com'+p);expect(allowDeliveryRequest(url('/Stock/Picker/Picker.aspx/getChosenPeriodID'),'POST','xhr','{}')).toBe(true);expect(allowDeliveryRequest(url('/Stock/Picker/Picker.aspx/setChosenPeriodID'),'POST','xhr','{"chosenPeriodID":123}')).toBe(true);expect(allowDeliveryRequest(url('/Stock/Picker/Picker.aspx/setChosenPeriodID'),'POST','xhr','{chosenPeriodID: 123}')).toBe(true);expect(allowDeliveryRequest(url('/Stock/Picker/Picker.aspx/setChosenPeriodID'),'POST','xhr','{"chosenPeriodID":123,"save":true}')).toBe(false);expect(allowDeliveryRequest(url('/stock/deliveries/deliverydetails.aspx/Save'),'POST','xhr','{}')).toBe(false);});
});
describe('registered supplier and duplicate preview controls',()=>{
 it('matches unique case/space normalised names but never enables registration',()=>{const result=matchDelivery({...record,supplier:'  ALBION   FINE FOOD '},[supplier],[]);expect(result.match).toBe('MATCHED');expect(result.eligible).toBe(false);});
 it('skips unregistered and fuzzy-only names',()=>{expect(matchDelivery(record,[],[]).status).toBe('Supplier Not Registered');expect(matchDelivery(record,[{...supplier,name:'Albion Fine Food Supplier'}],[]).match).toBe('UNMATCHED');});
 it('flags ambiguous suppliers',()=>expect(matchDelivery(record,[supplier,{...supplier,id:'second'}],[]).match).toBe('AMBIGUOUS'));
 it('detects existing manual references even when spaces/case differ',()=>{const result=matchDelivery(record,[supplier],[{id:'purchase',supplierId:supplier.id,reference:'inv123',voidedAt:null}]);expect(result.duplicate).toBe(true);expect(result.status).toBe('Needs Review');expect(result.eligible).toBe(false);});
 it('isolates supplier references',()=>expect(matchDelivery(record,[supplier],[{id:'foreign',supplierId:'other',reference:'INV123',voidedAt:null}]).duplicate).toBe(false));
 it('keeps non-food, credits and missing VAT behind verification',()=>{expect(matchDelivery(record,[{...supplier,foodWorkspace:false}],[]).eligible).toBe(false);expect(matchDelivery({...record,credit:'10000',total:'0',evidence:{detailRead:true,net:'10000',vat:'2000',supplierCode:'fixture',accepted:true,electronic:true,accrual:false,lineCount:2,classificationVerified:false,creditVerified:false,reason:null}},[supplier],[]).reason).toContain('credit');expect(matchDelivery(record,[supplier],[]).reason).toContain('VAT');});
});

describe('automatic detail evidence assessment',()=>{
 const evidence={detailRead:true,net:'10000',vat:'2000',supplierCode:'test-code',accepted:false,electronic:false,accrual:false,lineCount:2,classificationVerified:false as const,creditVerified:true,reason:null};
 it('displays verified net without claiming a manual record is submitted',()=>{const r=matchDelivery({...record,evidence},[supplier],[]);expect(r.verifiedNet).toBe('10000');expect(r.status).toBe('Needs Review');expect(r.reviewReasons.join(' ')).toContain('manual delivery');expect(r.reviewReasons.join(' ')).toContain('Mixed or unclassified');expect(r.reason).not.toContain('VAT basis');});
 it('recognises an accepted electronic invoice while retaining the actual classification blocker',()=>{const r=matchDelivery({...record,evidence:{...evidence,electronic:true,accepted:true}},[supplier],[]);expect(r.reason).not.toContain('not accepted');expect(r.reason).toContain('classified');expect(r.eligible).toBe(false);});
 it('identifies an unaccepted electronic invoice specifically',()=>expect(matchDelivery({...record,evidence:{...evidence,electronic:true}},[supplier],[]).reason).toContain('not accepted'));
 it('reports missing VAT without silently inventing zero',()=>{const r=matchDelivery({...record,evidence:{...evidence,vat:null}},[supplier],[]);expect(r.reason).toContain('VAT Amount field is missing');expect(r.evidence?.vat).toBeNull();});
 it('does not display an unchecked or changed amount as verified',()=>{const r=matchDelivery({...record,evidence:{...evidence,reason:'Source net amount changed'}},[supplier],[]);expect(r.verifiedNet).toBeNull();expect(r.reason).toContain('changed');});
 it('preserves explicit detail-read failures',()=>{const r=matchDelivery({...record,evidence:{...evidence,detailRead:false,net:null,reason:'The read-only delivery detail request failed or timed out; no retry or modification was attempted.'}},[supplier],[]);expect(r.reason).toContain('timed out');expect(r.eligible).toBe(false);});
 it('does not treat a manual reference match as a source-verified unchanged import',()=>{const r=matchDelivery({...record,evidence},[supplier],[{id:'manual',supplierId:supplier.id,reference:'INV123',voidedAt:null}]);expect(r.status).toBe('Needs Review');expect(r.reason).toContain('manual duplicate');expect(r.duplicate).toBe(true);});
});

it('deduplicates period rows using financial identity, not transient detail-read availability',()=>{
 const first={...record,evidence:{detailRead:false,reason:'temporary read failure'}};
 const second={...record,period:'another period',evidence:{detailRead:true,net:'10000'}};
 expect(uniqueDeliveries([first,second])).toHaveLength(1);
});

it('bounds detail concurrency to two and pauses only between batches',async()=>{
 let active=0,peak=0,read=0,pauses=0;
 await verifyDetailBatches([1,2,3,4,5],async()=>{active++;peak=Math.max(peak,active);await Promise.resolve();read++;active--;},async()=>{pauses++;});
 expect(peak).toBe(2);expect(read).toBe(5);expect(pauses).toBe(2);
});

it('does not convert a supplier food-workspace flag into proof that food or mixed lines are classified',()=>{
 const registered={id:'supplier',name:'ALBION FINE FOOD',active:true,foodWorkspace:true};
 const base={detailRead:true,net:'10000',vat:'0',supplierCode:'fixture',accepted:true,electronic:true,accrual:false,lineCount:2,classificationVerified:false as const,creditVerified:true,reason:null};
 const foodOrMixed=matchDelivery({...record,evidence:base},[registered],[]);
 const nonFood=matchDelivery({...record,evidence:base},[{...registered,foodWorkspace:false}],[]);
 expect(foodOrMixed.eligible).toBe(false);expect(foodOrMixed.reason).toContain('classified');
 expect(nonFood.eligible).toBe(false);expect(nonFood.reason).toContain('non-food spending');
});

it('permits an explicitly food-only supplier with a saved received manual invoice',()=>{
 const result=matchDelivery({...record,evidence:{detailRead:true,net:'10000',vat:'0',supplierCode:'fixture',accepted:false,electronic:false,manualPosted:true,accrual:false,lineCount:2,classificationVerified:false,creditVerified:true,reason:null}},[{...supplier,packagingWorkspace:false}],[]);
 expect(result.status).toBe('Ready to Import');expect(result.eligible).toBe(true);
});
it('blocks conflicting non-food lines even on a food-only supplier',()=>{
 const result=matchDelivery({...record,evidence:{detailRead:true,net:'10000',vat:'0',supplierCode:'fixture',accepted:false,electronic:false,manualPosted:true,accrual:false,lineCount:2,classificationVerified:false,contradictoryLineClassification:true,creditVerified:true,reason:null}},[{...supplier,packagingWorkspace:false}],[]);
 expect(result.eligible).toBe(false);expect(result.reason).toContain('contradicts');
});

it('parses Zonal boolean/string flags without treating unrecognised values as confirmed',()=>{expect(zonalBoolean('False')).toBe(false);expect(zonalBoolean('True')).toBe(true);expect(zonalBoolean(0)).toBe(false);expect(zonalBoolean(1)).toBe(true);expect(zonalBoolean(null)).toBeNull();expect(zonalBoolean('pending')).toBeNull();});
