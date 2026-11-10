import Link from 'next/link';
import {Utensils,MoreHorizontal,ArrowRight} from 'lucide-react';
import type {RecipeRow} from '@/lib/recipes';
import {deleteRecipe} from './actions';
import ConfirmDelete from './confirm-delete';
export default function RecipeCard({recipe:r,admin=false}:{recipe:RecipeRow;admin?:boolean}){
 return <article className="recipe-card">
  <Link href={'/recipes/'+r.id} className="recipe-card-link" aria-label={r.name}>
   <div className="recipe-card-image">
    {r.hasImage?<img src={'/recipes/'+r.id+'/image?v='+encodeURIComponent(r.imageVersion)} alt="" loading="lazy" decoding="async" width={480} height={270}/>:<span className="recipe-card-placeholder" aria-hidden="true"><Utensils size={25} strokeWidth={1.2}/><span>No photo</span></span>}
    {!r.visible&&<span className="recipe-card-status">Hidden</span>}
   </div>
   <div className="recipe-card-body">
    <h2 className="recipe-card-name">{r.name}</h2>
    <p className="recipe-entry-category">{r.typeName}</p>
    <div className="recipe-card-footer">{r.allergens?<p className="recipe-entry-allergens" title={'Allergens: '+r.allergens}><span>Allergens</span> {r.allergens}</p>:r.suitability?<p className="recipe-entry-allergens" title={'Suitability: '+r.suitability}>{r.suitability}</p>:<span className="recipe-card-open">View recipe</span>}<ArrowRight className="recipe-card-arrow" size={16} aria-hidden="true"/></div>
   </div>
  </Link>
  {admin&&<details className="recipe-entry-actions"><summary aria-label={'Actions for '+r.name}><MoreHorizontal size={20}/></summary><div className="recipe-entry-menu"><Link href={'/recipes/edit?id='+r.id}>Edit</Link><form action={deleteRecipe}><input type="hidden" name="id" value={r.id}/><ConfirmDelete message={'Delete recipe “'+r.name+'”? This also removes its specials and component links; other recipes are kept.'}/></form></div></details>}
 </article>;
}
