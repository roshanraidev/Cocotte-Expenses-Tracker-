import {z} from 'zod';
import {parsePounds} from '../money';
import {decimal4,stockLinePence} from '../finance';
import {validDateKey} from '../dates';
export const keyOf=(s:string)=>s.trim().toLowerCase().replace(/\s+/g,' ');
export const invoiceNumberKey=(s:string)=>s.trim().toUpperCase().replace(/\s+/g,'');
export const decimalLabel=(n:bigint,places=4)=>{const scale=10n**BigInt(places);return `${n/scale}.${String(n%scale).padStart(places,'0')}`.replace(/\.?0+$/,'')||'0';};
const amount=z.string().regex(/^\d{1,12}(\.\d{1,2})?$/,'Enter GBP with up to two decimals.');
const decimal=z.string().regex(/^\d{1,10}(\.\d{1,4})?$/,'Use up to four decimal places.');
const optionalDecimal=z.union([z.literal(''),decimal]);
export const reviewLineSchema=z.object({description:z.string().trim().min(1).max(500),productId:z.string().max(100).default(''),category:z.enum(['PACKAGING','CHEMICAL']),unit:z.string().trim().max(60),packSize:z.string().trim().max(60),quantity:optionalDecimal,unitPrice:optionalDecimal,lineNet:amount}).refine(v=>!v.quantity||decimal4(v.quantity)>0n,{message:'Quantity must be positive or blank.',path:['quantity']});
export const reviewSchema=z.object({invoiceNumber:z.string().trim().max(100),invoiceDate:z.string().refine(v=>v===''||validDateKey(v),'Check invoice date.'),net:amount,vat:z.union([z.literal(''),amount]),gross:z.union([z.literal(''),amount]),lines:z.array(reviewLineSchema).min(1).max(150),reason:z.string().trim().max(500).default(''),netConfirmed:z.boolean(),reconciled:z.boolean(),duplicateReviewed:z.boolean().default(false)});
export type ReviewLine=z.infer<typeof reviewLineSchema>;
export type Review=z.infer<typeof reviewSchema>;
export function reconcile(review:Review) {
 const sum=review.lines.reduce((s,l)=>s+parsePounds(l.lineNet),0n);const net=parsePounds(review.net);const issues:string[]=[];
 if(sum!==net)issues.push('Product lines must add up to the confirmed net total. Correct or add the missing line before confirming.');
 review.lines.forEach((l,i)=>{if(l.quantity&&l.unitPrice&&stockLinePence(l.quantity,l.unitPrice)!==parsePounds(l.lineNet))issues.push(`Line ${i+1}: quantity × unit price differs from its net total (check discounts or rounding).`);});
 if(review.vat&&review.gross&&net+parsePounds(review.vat)!==parsePounds(review.gross))issues.push('Net + VAT does not equal the gross total.');
 return {sum,net,issues,balanced:sum===net};
}
