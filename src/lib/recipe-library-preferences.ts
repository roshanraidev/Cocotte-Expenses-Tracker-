import {z} from 'zod';
export const libraryFiltersSchema=z.object({q:z.string().max(200).default(''),type:z.string().max(100).default(''),tab:z.enum(['active','archived']).default('active'),sort:z.enum(['recent','oldest','name','name-desc']).default('recent')});
export type LibraryFilters=z.infer<typeof libraryFiltersSchema>;
export const emptyLibraryFilters:LibraryFilters={q:'',type:'',tab:'active',sort:'recent'};
export function safeLibraryFilters(value:unknown,typeIds:string[],archiveAllowed:boolean):LibraryFilters{
 const parsed=libraryFiltersSchema.safeParse(value),filters=parsed.success?parsed.data:{...emptyLibraryFilters};
 return {...filters,type:typeIds.includes(filters.type)?filters.type:'',tab:archiveAllowed?filters.tab:'active'};
}
export function orderedRecipes<T extends {id:string}>(rows:T[],personal:unknown,restaurant:string[]):T[]{
 const order=Array.isArray(personal)?personal.filter((v):v is string=>typeof v==='string'):restaurant;
 const rank=new Map(order.map((id,index)=>[id,index]));
 // Unranked/new recipes follow the existing stable collection ordering.
 return rows.map((row,index)=>({row,index})).sort((a,b)=>(rank.get(a.row.id)??Infinity)-(rank.get(b.row.id)??Infinity)||a.index-b.index).map(({row})=>row);
}
export function libraryUrl(filters:LibraryFilters){return '/recipes?'+new URLSearchParams(filters).toString();}
/** Reorder only visible slots. Unfiltered recipes keep their positions in the full collection. */
export function mergeVisibleRecipeOrder(full:string[],visible:string[]):string[]{
 const slots=new Set(visible),known=new Set(full);
 if(known.size!==full.length||slots.size!==visible.length||visible.some(id=>!known.has(id)))throw new Error('Invalid visible recipe order.');
 let index=0;return full.map(id=>slots.has(id)?visible[index++]:id);
}
/** Filters/navigation wait for an in-flight autosave, without sharing credentials or browser storage. */
export async function waitForRecipeOrder(){
 const pending:Promise<boolean>[]=[];
 document.dispatchEvent(new CustomEvent('recipe-order-before-navigation',{detail:{waitUntil:(promise:Promise<boolean>)=>pending.push(promise)}}));
 return (await Promise.all(pending)).every(Boolean);
}
