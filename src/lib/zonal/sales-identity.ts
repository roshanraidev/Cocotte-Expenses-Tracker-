// DailySales stores official net sales only. Detailed Zonal figures can be
// compared only when the latest import still owns that exact sales revision.
export function salesIdentity(net:string,hash:string,sale:{amountPence:bigint;version:number}|null,prior?:{fingerprint:string;salesVersion:number}|null){
 if(!sale)return 'NEW' as const;
 if(sale.amountPence!==BigInt(net))return 'CORRECTION_REQUIRED' as const;
 if(prior&&sale.version===prior.salesVersion+1&&prior.fingerprint!==hash)return 'CORRECTION_REQUIRED' as const;
 return 'ALREADY_IMPORTED' as const;
}
