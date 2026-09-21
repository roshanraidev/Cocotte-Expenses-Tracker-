import { requireUser } from '@/lib/auth';
import { addDays, londonToday } from '@/lib/dates';
import { selectedWeek } from '@/lib/week-data';
import { financialWeek } from '@/lib/financial-data';
import { poundsInput } from '@/lib/money';
import { percentInput } from '@/lib/targets';
import { ratioLabel } from '@/lib/finance';
export async function GET(request: Request) {
  const user=await requireUser();const today=londonToday();const monday=selectedWeek(new URL(request.url).searchParams.get('week')??undefined,today);
  const rows=[['Week starting','Week ending','Target %','Original target %','Source','Projected sales GBP ex VAT','Actual sales GBP ex VAT','Purchases GBP ex VAT','Outstanding orders GBP ex VAT','Opening stock GBP','Closing stock GBP','Remaining allowance GBP','Actual cost GBP','Actual cost %','Status']];
  const money=(v:bigint|null|undefined)=>v===null||v===undefined?'':poundsInput(v);
  for(let i=0;i<8;i++){const date=addDays(monday,-7*i);const d=await financialWeek(user.restaurantId,date,today);rows.push([date,addDays(date,6),percentInput(d.target.targetBps),percentInput(d.target.originalBps),d.target.source,money(d.sales?.projectedPence),money(d.sales?.actualPence),money(d.purchases),money(d.commitments),money(d.opening),money(d.closing),money(d.finance?.allowance),money(d.finance?.actualCost),ratioLabel(d.finance?.actualBps??null),d.week?.finalizedAt?'Finalized':'Provisional']);}
  const csv=rows.map(row=>row.map(value=>`"${value.replaceAll('"','""')}"`).join(',')).join('\r\n');
  return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="food-cost-${monday}.csv"`,'Cache-Control':'private, no-store'}});
}
