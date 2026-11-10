import Link from 'next/link';
import type { ComponentNode } from '@/lib/recipe-features';
import { preparationMethod } from '@/lib/recipe-method';
export default function ComponentDetails({ nodes }: { nodes: ComponentNode[] }) {
  return <div className="space-y-3">{nodes.map(({recipe, children}) => <details key={recipe.id} className="rounded-lg border border-stone-200 p-3">
    <summary className="cursor-pointer font-semibold text-sm">{recipe.name}</summary>
    <div className="mt-3 space-y-3">
      <Link className="text-xs underline" href={'/recipes/'+recipe.id}>Open {recipe.name} recipe</Link>
      <p className="text-sm whitespace-pre-wrap"><strong>Allergens in {recipe.name}: </strong>{recipe.allergens || 'None recorded'}</p>
      <p className="text-sm whitespace-pre-wrap"><strong>May contain in {recipe.name}: </strong>{recipe.mayContain || 'None recorded'}</p>
      <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Ingredient</th><th>Quantity</th><th>Unit</th></tr></thead><tbody>{recipe.ingredients.map((i, n) => <tr key={n}><td>{i.name}</td><td>{i.quantity}</td><td>{i.unit}</td></tr>)}</tbody></table></div>
      <div><h3 className="text-sm font-semibold">Preparation / Method</h3><p className="recipe-step whitespace-pre-wrap mt-2">{preparationMethod(recipe) || '—'}</p></div>
      {!!children.length && <section><h3 className="text-sm font-semibold mb-2">Components of {recipe.name}</h3><ComponentDetails nodes={children} /></section>}
    </div>
  </details>)}</div>;
}
