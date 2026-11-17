import {createHash} from 'node:crypto';
import type {DeliveryRecord} from './delivery-matching';
/** Only stable source fields; exclude period, diagnostics and derived matches. */
export function deliveryFingerprint(r:DeliveryRecord){return createHash('sha256').update(JSON.stringify([r.id,r.date,r.supplier,r.document,r.items,r.unknown,r.invoice,r.credit,r.total,r.evidence?.net,r.evidence?.vat,r.evidence?.supplierCode,r.evidence?.accepted,r.evidence?.electronic,r.evidence?.accrual,r.evidence?.manualPosted,r.evidence?.lineFingerprint])).digest('hex');}
