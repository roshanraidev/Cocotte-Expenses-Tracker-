import 'server-only';
import type {Prisma} from '@/generated/prisma/client';
import type {Report} from '../validation';
import {reportInput} from '../validation';
import {dateValue} from '../../dates';
import {localAgentConfig} from './config';
import {wireReportSchema} from './protocol';
/** Called inside the successful local fetch transaction, including unchanged days.
 * No HTTP, credentials or browser operations take place in this transaction. */
export async function enqueueAgentReport(tx:Prisma.TransactionClient,restaurantId:string,report:Report,capturedAt:Date){
 const config=localAgentConfig();if(!config||restaurantId!==config.restaurantId)return;
 await tx.zonalAgentOutbox.create({data:{restaurantId,agentId:config.agentId,date:dateValue(report.date),capturedAt,payload:wireReportSchema.parse(reportInput(report))}});
}
