import Link from 'next/link';
import type { ComponentNode } from '@/lib/recipe-features';
import { recipeDetailMethod, recipeDetailText } from './recipe-detail-values';

export default function ComponentDetails({ nodes }: { nodes: ComponentNode[] }) {
  return (
    <div className="space-y-3">
      {nodes.map(({ recipe, children }) => {
        const method = recipeDetailMethod(recipe);
        const allergens = recipeDetailText(recipe.allergens);
        const mayContain = recipeDetailText(recipe.mayContain);

        return (
          <details key={recipe.id} className="rounded-lg border border-stone-200 p-3">
            <summary className="cursor-pointer font-semibold text-sm">
              {recipe.name}
              {recipe.archivedAt && <span className="ml-2 text-xs font-normal text-amber-800">Archived · retained reference</span>}
            </summary>
            <div className="mt-3 space-y-3">
              <Link className="text-xs underline" href={'/recipes/' + recipe.id}>Open {recipe.name} recipe</Link>
              <p className="text-sm whitespace-pre-wrap">
                <strong>Allergens in {recipe.name}: </strong>{allergens ?? 'Allergen information has not been entered.'}
              </p>
              <p className="text-sm whitespace-pre-wrap">
                <strong>May contain in {recipe.name}: </strong>{mayContain ?? 'Cross-contact information has not been entered.'}
              </p>
              {recipe.ingredients.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead><tr><th>Ingredient</th><th>Quantity</th><th>Unit</th></tr></thead>
                    <tbody>
                      {recipe.ingredients.map((ingredient, index) => (
                        <tr key={index}>
                          <td>{ingredient.name}</td><td>{ingredient.quantity}</td><td>{ingredient.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {method && (
                <div>
                  <h3 className="text-sm font-semibold">Preparation / Method</h3>
                  <p className="recipe-step whitespace-pre-wrap mt-2">{method}</p>
                </div>
              )}
              {children.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold mb-2">Components of {recipe.name}</h3>
                  <ComponentDetails nodes={children} />
                </section>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
