// Keep legacy sections readable without changing the database schema.
export function preparationMethod(recipe: { beforeService: string; onOrder: string }) {
  if (recipe.beforeService && recipe.onOrder) {
    return `Before Service\n${recipe.beforeService}\n\nOn Order\n${recipe.onOrder}`;
  }
  return recipe.beforeService || recipe.onOrder;
}
