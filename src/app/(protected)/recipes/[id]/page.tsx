import {can} from '@/lib/permissions';
import MethodPresentation from '../method-presentation';
import ComponentDetails from '../component-details';
import {recipeComponents} from '@/lib/recipe-features';
import {preparationMethod} from '@/lib/recipe-method';
import Link from 'next/link';
import {Utensils,ArrowLeft,ArrowUpRight,Leaf,ChefHat} from 'lucide-react';
import {notFound} from 'next/navigation';
import {requirePermission} from '@/lib/auth';
import RecipeActionForm from '../action-form';
import {restoreRecipeFormAction} from '../actions';
import {recipe} from '@/lib/recipes';
export default async function RecipePage({params}:{params:Promise<{id:string}>}){
 const user=await requirePermission('recipes.view'),{id}=await params,r=await recipe(user.restaurantId,id,can(user,'recipes.edit')||can(user,'recipes.create')||can(user,'recipes.archive')||can(user,'recipes.restore'));if(!r)notFound();
 const components=await recipeComponents(user.restaurantId,id,can(user,'recipes.edit')||can(user,'recipes.create')||can(user,'recipes.archive')||can(user,'recipes.restore'));
 return <>
  <nav className="recipe-detail-navigation" aria-label="Recipe navigation"><Link href="/recipes"><ArrowLeft size={15}/>Recipe library</Link>{can(user,'recipes.edit')&&!r.archivedAt&&<Link href={'/recipes/edit?id='+r.id}>EDIT RECIPE<ArrowUpRight size={14}/></Link>}</nav>
  {r.archivedAt&&<section className="recipe-archive-notice" role="status"><div><strong>Archived recipe</strong><p>Kept for reference. Restore it to return it to active recipe selections.</p></div>{can(user,'recipes.restore')&&<RecipeActionForm action={restoreRecipeFormAction}><input type="hidden" name="id" value={r.id}/><button className="btn">Restore Recipe</button></RecipeActionForm>}</section>}
  <header className={"recipe-identity"+(r.hasImage?'':' recipe-identity-no-photo')}>
   <div className="recipe-identity-photo">{r.hasImage?<img src={'/recipes/'+r.id+'/image?v='+encodeURIComponent(r.imageVersion)} alt={r.name} width={208} height={156}/>:<div><Utensils size={26} strokeWidth={1.2}/><span>No image</span></div>}</div>
   <div className="recipe-identity-copy"><p className="eyebrow">{r.typeName}{!r.visible&&<span className="recipe-hidden-label">Hidden</span>}</p><h1 className="page-title">{r.name}</h1><dl className="recipe-identity-facts"><div><dt>Prep time</dt><dd>Not recorded</dd></div><div><dt>Yield</dt><dd>Not recorded</dd></div><div><dt>Recipe cost</dt><dd>Not available</dd></div></dl></div>
   <section className="recipe-editorial-section recipe-dietary"><p className="eyebrow">Dietary reference</p><h2>Allergens</h2><p>{r.allergens||'Not recorded'}</p><h3>May contain</h3><p>{r.mayContain||'Not recorded'}</p><h3>Suitability</h3><p>{r.suitability||'Not recorded'}</p></section>
  </header>
  <div className="recipe-service-layout">
   <aside className="recipe-ingredient-column">
    <section className="recipe-editorial-section"><div className="recipe-section-heading"><h2><Leaf size={21} aria-hidden="true"/>Ingredients</h2><span>{r.ingredients.length} ingredients</span></div><div className="recipe-ingredient-scroll"><table className="recipe-ingredient-table"><thead><tr><th>Ingredient</th><th>Quantity</th><th>Unit</th></tr></thead><tbody>{r.ingredients.map((i,n)=><tr key={n}><td>{i.name}</td><td>{i.quantity}</td><td>{i.unit}</td></tr>)}</tbody></table></div>{!r.ingredients.length&&<p className="recipe-unrecorded">No ingredients recorded.</p>}</section>
   </aside>
   <div className="recipe-method-column"><section className="recipe-editorial-section"><div className="recipe-section-heading"><h2><ChefHat size={23} aria-hidden="true"/>Preparation / Method</h2><span>For service</span></div><MethodPresentation text={preparationMethod(r)||'No preparation method recorded.'}/></section>
   {!!components.length&&<details className="recipe-editorial-section recipe-linked-preparations"><summary>Components &amp; Preparations<span>{components.length} linked</span></summary><p className="recipe-unrecorded">Allergens remain listed separately for each component and nested preparation.</p><ComponentDetails nodes={components}/></details>}</div>
  </div>
 </>;
}
