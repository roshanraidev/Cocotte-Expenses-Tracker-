import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { recipeComponents } from '@/lib/recipe-features';
import { recipe } from '@/lib/recipes';
import RecipeActionForm from '../action-form';
import { restoreRecipeFormAction } from '../actions';
import ComponentDetails from '../component-details';
import MethodPresentation from '../method-presentation';
import { recipeDetailMethod, recipeDetailText } from '../recipe-detail-values';

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('recipes.view');
  const { id } = await params;
  const canViewHidden = can(user, 'recipes.edit') || can(user, 'recipes.create') ||
    can(user, 'recipes.archive') || can(user, 'recipes.restore');
  const r = await recipe(user.restaurantId, id, canViewHidden);
  if (!r) notFound();

  const components = await recipeComponents(user.restaurantId, id, canViewHidden);
  const category = recipeDetailText(r.typeName);
  const suitability = recipeDetailText(r.suitability);
  const allergens = recipeDetailText(r.allergens);
  const mayContain = recipeDetailText(r.mayContain);
  const method = recipeDetailMethod(r);
  const hasIngredients = r.ingredients.length > 0;
  const hasPreparations = Boolean(method) || components.length > 0;
  const hasRecipeBody = hasIngredients || hasPreparations;

  return (
    <article className="recipe-sheet">
      <nav className="recipe-detail-navigation" aria-label="Recipe navigation">
        <Link href="/recipes"><ArrowLeft size={15} />Recipe library</Link>
        {can(user, 'recipes.edit') && !r.archivedAt &&
          <Link href={'/recipes/edit?id=' + r.id}>EDIT RECIPE<ArrowUpRight size={14} /></Link>}
      </nav>

      {r.archivedAt && (
        <section className="recipe-archive-notice" role="status">
          <div>
            <strong>Archived recipe</strong>
            <p>Kept for reference. Restore it to return it to active recipe selections.</p>
          </div>
          {can(user, 'recipes.restore') && (
            <RecipeActionForm action={restoreRecipeFormAction}>
              <input type="hidden" name="id" value={r.id} />
              <button className="btn">Restore Recipe</button>
            </RecipeActionForm>
          )}
        </section>
      )}

      <header className={r.hasImage ? 'recipe-identity' : 'recipe-identity recipe-identity-no-photo'}>
        {r.hasImage && (
          <div className="recipe-identity-photo">
            <img src={'/recipes/' + r.id + '/image?v=' + encodeURIComponent(r.imageVersion)} alt={r.name} width={208} height={156} />
          </div>
        )}

        <div className="recipe-identity-copy">
          {(category || !r.visible) && (
            <p className="recipe-category">
              {category}
              {!r.visible && <span className="recipe-hidden-label">{category ? ' · Hidden' : 'Hidden'}</span>}
            </p>
          )}
          <h1 className="page-title">{r.name}</h1>
        </div>

        <section className="recipe-editorial-section recipe-dietary">
          <h2>Allergens</h2>
          <p>{allergens ?? 'Allergen information has not been entered.'}</p>
          <h3>May contain</h3>
          <p>{mayContain ?? 'Cross-contact information has not been entered.'}</p>
          {suitability && (
            <>
              <h3>Suitability</h3>
              <p>{suitability}</p>
            </>
          )}
        </section>
      </header>

      {hasRecipeBody && (
        <div className="recipe-service-layout">
          {hasIngredients && (
            <div className="recipe-ingredient-column">
              <section className="recipe-editorial-section">
                <div className="recipe-section-heading"><h2>Ingredients</h2></div>
                <div className="recipe-ingredient-scroll">
                  <table className="recipe-ingredient-table">
                    <thead><tr><th>Ingredient</th><th>Quantity</th><th>Unit</th></tr></thead>
                    <tbody>
                      {r.ingredients.map((ingredient, index) => (
                        <tr key={index}>
                          <td>{ingredient.name}</td><td>{ingredient.quantity}</td><td>{ingredient.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {hasPreparations && (
            <div className="recipe-method-column">
              {method && (
                <section className="recipe-editorial-section">
                  <div className="recipe-section-heading"><h2>Preparation</h2></div>
                  <MethodPresentation text={method} />
                </section>
              )}
              {components.length > 0 && (
                <details className="recipe-editorial-section recipe-linked-preparations">
                  <summary>Components &amp; Preparations<span>{components.length} linked</span></summary>
                  <p className="recipe-unrecorded">Allergens remain listed separately for each component and nested preparation.</p>
                  <ComponentDetails nodes={components} />
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
