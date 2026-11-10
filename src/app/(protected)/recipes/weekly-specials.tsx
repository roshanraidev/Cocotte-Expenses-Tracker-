import { londonToday } from '@/lib/dates';
import { weeklySpecials, type SpecialRow } from '@/lib/recipe-features';
import { recipes, type RecipeRow } from '@/lib/recipes';
import RecipeCard from './recipe-card';
import RecipeActionForm from './action-form';
import ConfirmDelete from './confirm-delete';
import { removeWeeklySpecial, setWeeklySpecialsEnabled, specialFormAction } from './special-actions';

function SpecialFields({ choices, special }: { choices: RecipeRow[]; special?: SpecialRow }) {
  return <>
    {special && <input name="id" type="hidden" value={special.id}/>}
    <div className="grid gap-3 sm:grid-cols-3">
      <label>Special recipe<select name="recipeId" defaultValue={special?.recipeId ?? ''} required><option value="" disabled>Select an existing recipe</option>{choices.map(r => <option key={r.id} value={r.id}>{r.name} · {r.typeName}{!r.visible ? ' (Hidden)' : ''}</option>)}</select></label>
      <label>Start date (optional)<input name="startDate" type="date" defaultValue={special?.startDate ?? ''}/></label>
      <label>End date (optional)<input name="endDate" type="date" defaultValue={special?.endDate ?? ''}/></label>
    </div>
    <div className="flex flex-wrap gap-2 mt-3">
      {special?.status === 'PUBLISHED' ? <><button className="btn" name="status" value="PUBLISHED">Save</button><button className="btn btn-secondary" name="status" value="DRAFT">Unpublish</button></> : <><button className="btn btn-secondary" name="status" value="DRAFT">Save Draft</button><button className="btn" name="status" value="PUBLISHED">Publish</button></>}
    </div>
  </>;
}
export default async function WeeklySpecials({ restaurantId, admin }: { restaurantId: string; admin: boolean }) {
  const today = londonToday();
  const { enabled, specials } = await weeklySpecials(restaurantId, admin, today);
  if (!admin && !specials.length) return null;
  const choices = await recipes(restaurantId, admin);
  const active = specials.filter(s => enabled && s.status === 'PUBLISHED' && s.recipeVisible && (!s.startDate || s.startDate <= today) && (!s.endDate || s.endDate >= today));
  const lookup = new Map(choices.map(r => [r.id, r]));
  return <section className="mb-5">
    {!!active.length && <><h2 className="section-title">Weekly Specials</h2><div className="recipe-grid mb-4">{active.map(s => lookup.has(s.recipeId) && <RecipeCard key={s.id} recipe={lookup.get(s.recipeId)!}/>)}</div></>}
    {admin && <details className="card">
      <summary className="cursor-pointer font-semibold">Add Weekly Special / Manage Specials</summary>
      <form action={setWeeklySpecialsEnabled} className="flex flex-wrap items-center gap-3 mt-4 mb-4">
        <label className="recipe-check"><input type="checkbox" name="enabled" defaultChecked={enabled}/>Enable Weekly Specials for this restaurant</label><button className="btn btn-secondary">Save setting</button>
      </form>
      <p className="page-description mb-4">Publish any number of existing recipes. Dates include the whole selected day in Europe/London. Leave both blank to keep a published special active until you unpublish it. Disabling this feature keeps your drafts and published specials.</p>
      <h3 className="section-title">Add Weekly Special</h3>
      <RecipeActionForm action={specialFormAction}><SpecialFields choices={choices}/></RecipeActionForm>
      {!!specials.length && <div className="mt-5 space-y-3">{specials.map(s => <details className="rounded-lg border border-stone-200 p-3" key={s.id}>
        <summary className="cursor-pointer text-sm font-semibold">{s.recipeName} · {s.status === 'DRAFT' ? 'Draft' : active.some(a => a.id === s.id) ? 'Published · Active' : 'Published · Not currently active'} · Edit</summary>
        <div className="mt-3">
          {!s.recipeVisible && <p className="page-description mb-3">This recipe or its category is hidden. Staff cannot see this special.</p>}
          <RecipeActionForm action={specialFormAction}><SpecialFields choices={choices} special={s}/></RecipeActionForm>
          <form action={removeWeeklySpecial} className="mt-3"><input type="hidden" name="id" value={s.id}/><ConfirmDelete className="text-xs underline" message={'Remove special “'+s.recipeName+'”? Its recipe will be kept.'} label="Remove special"/></form>
        </div>
      </details>)}</div>}
    </details>}
  </section>;
}
