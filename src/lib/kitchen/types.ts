import type {PublishedSpecialCard} from '@/lib/weekly-specials';
export const categories={new:'New recipes',updates:'Recipe updates',specials:'Weekly Specials',ingredients:'Ingredients & allergens',announcements:'Kitchen announcements'} as const;
export type Category=keyof typeof categories;
export type Choices=Partial<Record<Category,boolean>>;
export type KitchenNotice={id:string;category:Category;action:string;name:string;read:boolean;createdAt:string};
export type KitchenSnapshot={available:boolean|null;specials:PublishedSpecialCard[];notifications:KitchenNotice[];unread:number;preferences:{inApp:Choices;push:Choices;pushEnabled:boolean};pushKey:string|null};
export const emptyKitchen:KitchenSnapshot={available:null,specials:[],notifications:[],unread:0,preferences:{inApp:{},push:{},pushEnabled:false},pushKey:null};
export function enabled(choices:Choices,category:string){return choices[category as Category]!==false;}
