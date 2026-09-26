import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const canViewHidden = user.role === 'SUPER_USER';

  const rows = await db().$queryRaw<{ imageMime: string | null; imageBytes: Uint8Array | null }[]>(
    Prisma.sql`
      SELECT r."imageMime", r."imageBytes"
      FROM "Recipe" r
      JOIN "RecipeType" t ON t.id = r."typeId"
      WHERE r.id = ${id}
        AND r."restaurantId" = ${user.restaurantId}
        ${canViewHidden ? Prisma.empty : Prisma.sql`AND r.visible = true AND t.visible = true`}
      LIMIT 1
    `,
  );

  const recipe = rows[0];
  if (!recipe?.imageBytes) return new Response(null, { status: 404 });

  const mime = recipe.imageMime || 'image/jpeg';
  const bytes = new Uint8Array(recipe.imageBytes);
  return new Response(bytes.buffer, {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
