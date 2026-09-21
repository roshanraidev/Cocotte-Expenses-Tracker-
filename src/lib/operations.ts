import 'server-only';
import { financialWeek } from './financial-data';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { SalesActor } from './sales-service';
import { addDays, dateValue, dateKey, londonToday, mondayOf, validDateKey } from './dates';
import { formatGBP, parsePounds } from './money';
import { decimal4, stockLinePence } from './finance';
export class OperationError extends Error {}
const text = z.string().trim().min(1).max(200);
const reason = z.string().trim().min(3).max(500);
const date = z.string().refine(validDateKey, 'Choose a valid date.');
const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).transform(parsePounds);
const decimal = z.string().regex(/^\d{1,10}(\.\d{1,4})?$/);
const optionalMoney = z.union([z.literal('').transform(() => null), money]);
const monday = date.refine(v => validDateKey(v) && mondayOf(v) === v, 'Choose a Monday.');
function admin(actor: SalesActor) { if (actor.role !== 'SUPER_USER') throw new OperationError('Only Super Users can make this change.'); }
export async function assertOpen(tx: Prisma.TransactionClient, restaurantId: string, day: string) {
  const week = await tx.weeklyForecast.findUnique({ where: { restaurantId_weekStart: { restaurantId, weekStart: dateValue(mondayOf(day)) } } });
  if (week?.finalizedAt) throw new OperationError('This accounting week is finalized. A Super User must reopen it with a reason.');
  return week;
}
function revision(actual: Date, expected: string) { if (actual.toISOString() !== expected) throw new OperationError('This record changed. Reload before saving.'); }
export async function runOperation(prisma: PrismaClient, actor: SalesActor, operation: string, raw: Record<string, unknown>, today = londonToday()) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "restaurantId" FROM "RestaurantSettings" WHERE "restaurantId" = ${actor.restaurantId} FOR UPDATE`;
    const invalidatePurchases = async (day: string) => { await tx.weeklyForecast.updateMany({ where: { restaurantId: actor.restaurantId, weekStart: dateValue(mondayOf(day)) }, data: { purchasesConfirmedAt: null } }); };
    const audit = async (action: string, entity: string, entityId: string, before: unknown, after: unknown, explanation?: string) => {
      const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v, (_, n) => typeof n === 'bigint' ? n.toString() : n));
      await tx.auditLog.create({ data: { restaurantId: actor.restaurantId, actorId: actor.id, action, entity, entityId, ...(before ? { before: json(before) } : {}), after: json(after), reason: explanation || null } });
    };
    if (operation === 'supplier') {
      admin(actor); const v = z.object({ name: text, contact: z.string().trim().max(500), email: z.union([z.literal(''), z.email()]), phone: z.string().max(100), deliverySchedule: z.string().max(500) }).parse(raw);
      const row = await tx.supplier.create({ data: { ...v, restaurantId: actor.restaurantId } }); await audit('SUPPLIER_CREATED', 'Supplier', row.id, null, v); return;
    }
    if (operation === 'supplier-edit') {
      admin(actor);
      const v = z.object({ id: text, previous: z.string().max(3000), name: text, contact: z.string().trim().max(500), email: z.union([z.literal(''),z.email()]), phone: z.string().max(100), deliverySchedule: z.string().max(500) }).parse(raw);
      const row = await tx.supplier.findFirstOrThrow({ where: { id: v.id, restaurantId: actor.restaurantId } });
      if (JSON.stringify([row.name,row.contact,row.email,row.phone,row.deliverySchedule]) !== v.previous) throw new OperationError('Supplier changed. Reload before saving.');
      const updated = await tx.supplier.update({ where: { id: row.id }, data: { name: v.name, contact: v.contact, email: v.email, phone: v.phone, deliverySchedule: v.deliverySchedule } });
      await audit('SUPPLIER_EDITED','Supplier',row.id,row,updated); return;
    }
    if (operation === 'closing-total') {
      admin(actor);
      const v = z.object({ weekStart: monday, stamp: text, amount: money, reason: z.string().trim().max(500).default('') }).parse(raw);
      const week = await assertOpen(tx,actor.restaurantId,v.weekStart);
      if (!week) throw new OperationError('Create the weekly forecast first.');
      revision(week.updatedAt,v.stamp);
      if (addDays(v.weekStart,6) > today) throw new OperationError('Enter actual closing stock on or after Sunday.');
      if (week.actualClosingStockPence !== null || addDays(v.weekStart,6) < today) reason.parse(v.reason);
      const updated = await tx.weeklyForecast.update({ where: { id: week.id }, data: { actualClosingStockPence: v.amount } });
      await audit('CLOSING_STOCK_TOTAL_RECORDED','WeeklyForecast',week.id,week,updated,v.reason); return;
    }
    if (operation === 'supplier-status') {
      admin(actor); const v = z.object({ id: text, active: z.enum(['true','false']) }).parse(raw);
      const row = await tx.supplier.findFirstOrThrow({ where: { id: v.id, restaurantId: actor.restaurantId } });
      await tx.supplier.update({ where: { id: row.id }, data: { active: v.active === 'true' } }); await audit('SUPPLIER_STATUS_CHANGED', 'Supplier', row.id, { active: row.active }, { active: v.active === 'true' }); return;
    }
    if (operation === 'product') {
      admin(actor); const v = z.object({ name: text, category: text, countingUnit: text, unitCost: decimal, supplierId: text }).parse(raw);
      await tx.supplier.findFirstOrThrow({ where: { id: v.supplierId, restaurantId: actor.restaurantId, active: true } });
      const row = await tx.product.create({ data: { ...v, restaurantId: actor.restaurantId } }); await audit('PRODUCT_CREATED', 'Product', row.id, null, v); return;
    }
    if (operation === 'product-price') {
      admin(actor); const v = z.object({ id: text, unitCost: decimal, previous: decimal, reason }).parse(raw);
      const row = await tx.product.findFirstOrThrow({ where: { id: v.id, restaurantId: actor.restaurantId } });
      if (decimal4(row.unitCost.toFixed(4)) !== decimal4(v.previous)) throw new OperationError('Price changed. Reload first.');
      await tx.product.update({ where: { id: row.id }, data: { unitCost: v.unitCost } }); await audit('PRODUCT_PRICE_CHANGED','Product',row.id,{ unitCost: row.unitCost },{ unitCost: v.unitCost },v.reason); return;
    }
    const checkBudget = async (delivery: string, amount: bigint, acknowledged: unknown) => {
      const available = (await financialWeek(actor.restaurantId,mondayOf(delivery),today,tx)).finance?.allowance;
      if (available != null && amount > available && acknowledged !== 'on') throw new OperationError(`Budget warning: this order exceeds the available ${formatGBP(available)} by ${formatGBP(amount-available)}. Tick the acknowledgement to save the unchanged amount.`);
    };
    if (operation === 'order') {
      const v = z.object({ supplierId: text, orderDate: date.optional(), expectedDeliveryDate: date, estimatedAmount: money, status: z.enum(['DRAFT','PLACED','RECEIVED','CANCELLED']).default('DRAFT'), reference: z.string().default(''), invoiceAmount: z.string().default(''), acknowledge: z.string().optional(), notes: z.string().max(500) }).parse(raw);
      if (v.orderDate && (v.orderDate > today || v.orderDate > v.expectedDeliveryDate)) throw new OperationError('Order date must not be in the future or after delivery.');
      if (v.expectedDeliveryDate < today) throw new OperationError('New orders must have a current or future delivery date.');
      await assertOpen(tx, actor.restaurantId, v.expectedDeliveryDate);
      await tx.supplier.findFirstOrThrow({ where: { id: v.supplierId, restaurantId: actor.restaurantId, active: true } });
      if (v.status === 'PLACED') { await checkBudget(v.expectedDeliveryDate,v.estimatedAmount,v.acknowledge); await invalidatePurchases(v.expectedDeliveryDate); }
      const row = await tx.supplierOrder.create({ data: { restaurantId: actor.restaurantId, supplierId: v.supplierId, expectedDeliveryDate: dateValue(v.expectedDeliveryDate), orderDate: dateValue(v.orderDate ?? today), estimatedAmountPence: v.estimatedAmount, status: v.status, receivedDate: v.status === 'RECEIVED' ? dateValue(v.expectedDeliveryDate) : null, notes: v.notes } });
      if (v.status === 'RECEIVED') {
        if (v.expectedDeliveryDate > today) throw new OperationError('Cannot receive a future delivery.');
        await invalidatePurchases(v.expectedDeliveryDate);
        const invoice = await tx.purchaseInvoice.create({ data: { restaurantId: actor.restaurantId, supplierId: v.supplierId, orderId: row.id, reference: text.parse(v.reference), accountingDate: dateValue(v.expectedDeliveryDate), amountPence: money.parse(v.invoiceAmount), confirmedAt: new Date() } });
        await tx.supplierOrder.update({ where: { id: row.id }, data: { receivedDate: dateValue(v.expectedDeliveryDate) } });
        await audit('INVOICE_CONFIRMED','PurchaseInvoice',invoice.id,null,invoice);
      }
      await audit('ORDER_REGISTERED','SupplierOrder',row.id,null,row); return;
    }
    if (operation === 'order-status' || operation === 'receipt') {
      const v = z.object({ id: text, stamp: text, status: z.enum(['PLACED','CANCELLED','RECEIVED']), reference: z.string().max(200).default(''), amount: z.string().default(''), accountingDate: z.string().default(''), acknowledge: z.string().optional() }).parse(raw);
      const row = await tx.supplierOrder.findFirstOrThrow({ where: { id: v.id, restaurantId: actor.restaurantId } }); revision(row.updatedAt,v.stamp);
      await assertOpen(tx,actor.restaurantId,dateKey(row.expectedDeliveryDate));
      if (v.status === 'PLACED' && row.status !== 'DRAFT' || v.status === 'CANCELLED' && !['DRAFT','PLACED'].includes(row.status) || v.status === 'RECEIVED' && row.status !== 'PLACED') throw new OperationError('This order cannot make that status transition.');
      if (v.status === 'PLACED') await checkBudget(dateKey(row.expectedDeliveryDate),row.estimatedAmountPence,v.acknowledge);
      await invalidatePurchases(dateKey(row.expectedDeliveryDate));
      if (v.status === 'RECEIVED') {
        const accountingDate = date.parse(v.accountingDate); if (accountingDate > today) throw new OperationError('Cannot receive a future delivery.');
        await assertOpen(tx,actor.restaurantId,accountingDate);
        await invalidatePurchases(accountingDate);
        const invoice = await tx.purchaseInvoice.create({ data: { restaurantId: actor.restaurantId, supplierId: row.supplierId, orderId: row.id, reference: text.parse(v.reference), accountingDate: dateValue(accountingDate), amountPence: money.parse(v.amount), confirmedAt: new Date() } });
        const updated = await tx.supplierOrder.update({ where: { id: row.id }, data: { status: 'RECEIVED', receivedDate: dateValue(accountingDate) } });
        await audit('ORDER_RECEIVED','SupplierOrder',row.id,row,updated); await audit('INVOICE_CONFIRMED','PurchaseInvoice',invoice.id,null,invoice);
      } else {
        const updated = await tx.supplierOrder.update({ where: { id: row.id }, data: { status: v.status } }); await audit('ORDER_STATUS_CHANGED','SupplierOrder',row.id,row,updated);
      } return;
    }
    if (operation === 'invoice' || operation === 'credit') {
      const v = z.object({ supplierId: text, reference: text, accountingDate: date, amount: money, creditForId: z.string().default(''), reason: z.string().trim().max(500).default('') }).parse(raw);
      if (v.accountingDate > today) throw new OperationError('Invoices cannot be confirmed for a future date.');
      await assertOpen(tx,actor.restaurantId,v.accountingDate);
      await invalidatePurchases(v.accountingDate);
      await tx.supplier.findFirstOrThrow({ where: { id: v.supplierId, restaurantId: actor.restaurantId } });
      if (operation === 'credit') { admin(actor); reason.parse(v.reason); await tx.purchaseInvoice.findFirstOrThrow({ where: { id: v.creditForId, restaurantId: actor.restaurantId, supplierId: v.supplierId, creditForId: null, voidedAt: null, confirmedAt: { not: null } } }); }
      const row = await tx.purchaseInvoice.create({ data: { restaurantId: actor.restaurantId, supplierId: v.supplierId, reference: v.reference, accountingDate: dateValue(v.accountingDate), amountPence: operation === 'credit' ? -v.amount : v.amount, creditForId: operation === 'credit' ? v.creditForId : null, confirmedAt: new Date() } });
      await audit(operation === 'credit' ? 'CREDIT_CONFIRMED' : 'INVOICE_CONFIRMED','PurchaseInvoice',row.id,null,row,v.reason); return;
    }
    if (operation === 'invoice-correct') {
      admin(actor); const v = z.object({ id: text, stamp: text, amount: money, accountingDate: date, reason }).parse(raw);
      const row = await tx.purchaseInvoice.findFirstOrThrow({ where: { id: v.id, restaurantId: actor.restaurantId, voidedAt: null } }); revision(row.updatedAt,v.stamp);
      if (v.accountingDate > today) throw new OperationError('Cannot move an invoice into the future.');
      await assertOpen(tx,actor.restaurantId,dateKey(row.accountingDate)); await assertOpen(tx,actor.restaurantId,v.accountingDate);
      await invalidatePurchases(dateKey(row.accountingDate)); await invalidatePurchases(v.accountingDate);
      const updated = await tx.purchaseInvoice.update({ where: { id: row.id }, data: { accountingDate: dateValue(v.accountingDate), amountPence: row.creditForId ? -v.amount : v.amount } });
      await audit('INVOICE_CORRECTED','PurchaseInvoice',row.id,row,updated,v.reason); return;
    }
    if (operation === 'stock-line') {
      const v = z.object({ date, productId: text, quantity: decimal, stamp: z.string(), reason: z.string().trim().max(500) }).parse(raw);
      if (dateValue(v.date).getUTCDay() !== 0 || v.date > today) throw new OperationError('Stock counts must be on a Sunday, not in the future.');
      if (mondayOf(v.date) !== mondayOf(today)) { admin(actor); reason.parse(v.reason); }
      await assertOpen(tx,actor.restaurantId,v.date);
      const product = await tx.product.findFirstOrThrow({ where: { id: v.productId, restaurantId: actor.restaurantId } });
      const existing = await tx.stockCount.findUnique({ where: { restaurantId_date: { restaurantId: actor.restaurantId, date: dateValue(v.date) } } });
      if (existing) revision(existing.updatedAt,v.stamp); else if (v.stamp) throw new OperationError('Reload the stock count.');
      if (existing?.status === 'CONFIRMED') { admin(actor); reason.parse(v.reason); }
      const count = await tx.stockCount.upsert({ where: { restaurantId_date: { restaurantId: actor.restaurantId, date: dateValue(v.date) } }, create: { restaurantId: actor.restaurantId, date: dateValue(v.date) }, update: { status: 'DRAFT', confirmedAt: null, totalValuePence: null } });
      const prior = await tx.stockCountItem.findUnique({ where: { stockCountId_productId: { stockCountId: count.id, productId: product.id } } });
      const price = prior?.unitCost ?? product.unitCost;
      const valuePence = stockLinePence(v.quantity,price.toFixed(4));
      const item = await tx.stockCountItem.upsert({ where: { stockCountId_productId: { stockCountId: count.id, productId: product.id } }, create: { stockCountId: count.id, productId: product.id, productName: product.name, countingUnit: product.countingUnit, quantity: v.quantity, unitCost: price, valuePence }, update: { quantity: v.quantity, valuePence } });
      await audit(prior ? 'STOCK_LINE_CORRECTED' : 'STOCK_LINE_RECORDED','StockCount',count.id,prior,item,v.reason); return;
    }
    if (operation === 'stock-confirm') {
      const v = z.object({ id: text, stamp: text }).parse(raw);
      const count = await tx.stockCount.findFirstOrThrow({ where: { id: v.id, restaurantId: actor.restaurantId }, include: { items: true } }); revision(count.updatedAt,v.stamp);
      if (mondayOf(dateKey(count.date)) !== mondayOf(today)) admin(actor);
      await assertOpen(tx,actor.restaurantId,dateKey(count.date));
      const products = await tx.product.findMany({ where: { restaurantId: actor.restaurantId, active: true } });
      if (!count.items.length || products.some(p => !count.items.some(i => i.productId === p.id))) throw new OperationError('Count every active product, entering zero where appropriate, before confirming.');
      const total = count.items.reduce((sum,item) => sum + item.valuePence,0n);
      await tx.stockCount.update({ where: { id: count.id }, data: { status: 'CONFIRMED', confirmedAt: new Date(), totalValuePence: total } });
      await audit('STOCK_CONFIRMED','StockCount',count.id,{ status: count.status },{ totalValuePence: total, items: count.items }); return;
    }
    if (operation === 'planning') {
      admin(actor);
      const v = z.object({ weekStart: monday, stamp: text, opening: optionalMoney, expectedClosing: optionalMoney, sufficient: z.string().optional(), nextDelivery: z.string(), followingDelivery: z.string() }).parse(raw);
      const week = await assertOpen(tx,actor.restaurantId,v.weekStart); if (!week) throw new OperationError('Create the weekly forecast first.'); revision(week.updatedAt,v.stamp);
      if (v.weekStart !== mondayOf(today)) admin(actor);
      if ((v.nextDelivery || v.followingDelivery) && (!validDateKey(v.nextDelivery) || !validDateKey(v.followingDelivery) || v.nextDelivery < v.weekStart || v.nextDelivery > addDays(v.weekStart,6) || v.followingDelivery <= v.nextDelivery || v.followingDelivery > addDays(v.weekStart,7))) throw new OperationError('Delivery coverage must start in this week and end no later than next Monday.');
      const updated = await tx.weeklyForecast.update({ where: { id: week.id }, data: { openingStockPence: v.opening, expectedClosingStockPence: v.expectedClosing, stockAvailabilityConfirmed: v.sufficient === 'on', nextDeliveryDate: v.nextDelivery ? dateValue(v.nextDelivery) : null, followingDeliveryDate: v.followingDelivery ? dateValue(v.followingDelivery) : null } });
      await audit('PLANNING_UPDATED','WeeklyForecast',week.id,week,updated); return;
    }
    if (operation === 'purchases-confirm') {
      admin(actor); const v = z.object({ weekStart: monday, stamp: text }).parse(raw); const week = await assertOpen(tx,actor.restaurantId,v.weekStart);
      if (!week) throw new OperationError('Create a forecast first.'); revision(week.updatedAt,v.stamp);
      if (addDays(v.weekStart,6) > today) throw new OperationError('Confirm completeness only on or after the week-ending Sunday.');
      if (await tx.supplierOrder.count({ where: { restaurantId: actor.restaurantId, status: 'PLACED', expectedDeliveryDate: { gte: dateValue(v.weekStart), lte: dateValue(addDays(v.weekStart,6)) } } })) throw new OperationError('Receive or cancel outstanding orders before confirming purchases.');
      if (await tx.purchaseInvoice.count({ where: { restaurantId: actor.restaurantId, accountingDate: { gte: dateValue(v.weekStart), lte: dateValue(addDays(v.weekStart,6)) }, confirmedAt: null, voidedAt: null } })) throw new OperationError('Confirm all invoices before closing purchases.');
      await tx.weeklyForecast.update({ where: { id: week.id }, data: { purchasesConfirmedAt: new Date() } }); await audit('PURCHASES_CONFIRMED','WeeklyForecast',week.id,null,{ complete: true }); return;
    }
    if (operation === 'finalize') {
      admin(actor); const v = z.object({ weekStart: monday, stamp: text }).parse(raw);
      const data = await financialWeek(actor.restaurantId,v.weekStart,today,tx);
      if (!data.week) throw new OperationError('Create a forecast first.'); revision(data.week.updatedAt,v.stamp);
      if (data.week.finalizedAt) throw new OperationError('Week is already finalized.');
      if (addDays(v.weekStart,6) >= today || data.finance?.actualCost === null || !data.finance) throw new OperationError('Finalization requires all seven sales, confirmed Sunday stock, opening stock and complete purchases with no outstanding orders.');
      if (!data.target.id) await tx.weeklyTarget.create({ data: { restaurantId: actor.restaurantId, weekStart: dateValue(v.weekStart), originalBps: data.target.targetBps, targetBps: data.target.targetBps, source: 'DEFAULT' } });
      await tx.weeklyForecast.update({ where: { id: data.week.id }, data: { finalizedAt: new Date(), openingStockPence: data.opening } });
      await audit('WEEK_FINALIZED','WeeklyForecast',data.week.id,null,{ weekStart: v.weekStart, targetBps: data.target.targetBps, originalTargetBps: data.target.originalBps, actualSalesPence: data.sales!.actualPence, purchasesPence: data.purchases, openingPence: data.opening, closingPence: data.closing, actualCostPence: data.finance.actualCost, actualBps: data.finance.actualBps }); return;
    }
    if (operation === 'reopen') {
      admin(actor); const v = z.object({ weekStart: monday, reason, stamp: text }).parse(raw);
      const week = await tx.weeklyForecast.findUniqueOrThrow({ where: { restaurantId_weekStart: { restaurantId: actor.restaurantId, weekStart: dateValue(v.weekStart) } } }); revision(week.updatedAt,v.stamp);
      if (!week.finalizedAt) throw new OperationError('This week is already open.');
      await tx.weeklyForecast.update({ where: { id: week.id }, data: { finalizedAt: null, purchasesConfirmedAt: null } }); await audit('WEEK_REOPENED','WeeklyForecast',week.id,{ finalizedAt: week.finalizedAt },{ finalizedAt: null },v.reason); return;
    }
    throw new OperationError('Unknown operation.');
  });
}
