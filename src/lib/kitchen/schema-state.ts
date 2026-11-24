/** Prisma 7's pg adapter nests raw SQL errors differently from model queries. */
export function missingKitchenSchema(error:unknown){
 const e=error as {code?:string;meta?:{table?:string;modelName?:string;code?:string;message?:string;driverAdapterError?:{cause?:{originalCode?:string;kind?:string;table?:string}}}};
 const meta=e?.meta,cause=meta?.driverAdapterError?.cause;
 const kitchenTable=/\bKitchen(?:Event|Read|Preference|Announcement|PushSubscription|PushDelivery)\b/;
 if(e?.code==='P2021')return kitchenTable.test(String(meta?.table??meta?.modelName??''));
 return e?.code==='P2010'&&(cause?.originalCode==='42P01'&&kitchenTable.test(cause.table??'')||meta?.code==='42P01'&&kitchenTable.test(meta.message??''));
}
