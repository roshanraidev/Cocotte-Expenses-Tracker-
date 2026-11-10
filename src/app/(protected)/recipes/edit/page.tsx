import ComponentSelector from '../component-selector';
import RecipeActionForm from '../action-form';
import { componentLinks } from '@/lib/recipe-features';
import { notFound } from 'next/navigation';
import RecipePhoto from '../recipe-photo';
import { preparationMethod } from '@/lib/recipe-method';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { recipe, recipeTypes, recipes } from '@/lib/recipes';
import { recipeFormAction } from '../actions';
export default async function RecipeEditor({searchParams}:{searchParams:Promise<{id?:string}>}){
 const user=await requireAdmin(),{id}=await searchParams,types=await recipeTypes(user.restaurantId,true),r=id?await recipe(user.restaurantId,id,true):null;
 if(id&&!r)notFound();
 const choices=(await recipes(user.restaurantId,true)).filter(item=>item.id!==id).map(({id,name,typeName})=>({id,name,typeName}));
 const initialIds=id?(await componentLinks(user.restaurantId)).filter(link=>link.recipeId===id).map(link=>link.componentId):[];
 const lines=r?.ingredients.map(i=>[i.name,i.quantity,i.unit].join(' | ')).join('\n')??'';
 return <><header className="recipe-library-heading"><div><p className="eyebrow">The chef’s working book</p><h1 className="page-title">{r?'Edit Recipe':'Add Recipe'}</h1><p className="recipe-library-intro">Ingredients, preparations and declarations in one place.</p></div><Link className="btn btn-secondary" href="/recipes">CANCEL</Link></header><RecipeActionForm action={recipeFormAction} className="card recipe-editor" multipart>{r&&<input type="hidden" name="id" value={r.id}/>}<div className="recipe-editor-top"><label>Recipe name<input name="name" required maxLength={120} defaultValue={r?.name}/></label><label>Recipe type<select name="typeId" required defaultValue={r?.typeId??''}><option value="" disabled>Select type</option>{types.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Sort order<input name="sortOrder" type="number" defaultValue={r?.sortOrder??0}/></label><label className="recipe-check"><input name="visible" type="checkbox" defaultChecked={r?.visible??true}/> Visible to chefs</label></div><RecipePhoto initialUrl={r?.hasImage?'/recipes/'+r.id+'/image?v='+encodeURIComponent(r.imageVersion):undefined}/><label>Ingredients <span className="font-normal text-stone-500">— one per line: Ingredient | Quantity | Unit</span><textarea name="ingredients" className="recipe-textarea recipe-ingredients" defaultValue={lines} placeholder="Eggs | 2 | Each&#10;Bacon | 100 | g"/></label><label>Preparation / Method<textarea name="method" className="recipe-textarea recipe-ingredients" defaultValue={r?preparationMethod(r):''} placeholder="Write cooking instructions, including numbered steps"/></label><div className="recipe-editor-columns"><label>Allergens<textarea name="allergens" className="recipe-textarea small" defaultValue={r?.allergens}/></label><label>May Contain<textarea name="mayContain" className="recipe-textarea small" defaultValue={r?.mayContain}/></label><label>Suitability<textarea name="suitability" className="recipe-textarea small" defaultValue={r?.suitability}/></label></div><ComponentSelector choices={choices} initialIds={initialIds}/><button className="btn">SAVE RECIPE</button></RecipeActionForm></>;
}