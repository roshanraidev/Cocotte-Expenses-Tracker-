import { preparationMethod } from '@/lib/recipe-method';

const placeholder = /^(?:not (?:recorded|available|specified)|n\/?a|[-–—]+)\.?$/i;

export function recipeDetailText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && !placeholder.test(trimmed) ? value : undefined;
}

export function recipeDetailMethod(recipe: { beforeService: string; onOrder: string }) {
  return preparationMethod({
    beforeService: recipeDetailText(recipe.beforeService) ?? '',
    onOrder: recipeDetailText(recipe.onOrder) ?? '',
  });
}
