import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createUserSchema } from '../src/lib/validation';
import { hashPassword } from '../src/lib/password';
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env first.');
const input = createUserSchema.parse({ name: process.env.SEED_ADMIN_NAME || 'Head Chef', email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD, role: 'SUPER_USER' });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction(async tx => {
    // Serializes first-run provisioning; reruns never reset existing credentials.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7843201)`;
    if (await tx.user.count()) throw new Error('Accounts already exist. Use the administrator interface to add accounts. Seed will not overwrite passwords.');
    const restaurant = await tx.restaurant.upsert({ where: { id: 'restaurant' }, update: {}, create: { id: 'restaurant', name: process.env.RESTAURANT_NAME || 'My Restaurant', settings: { create: {} } } });
    const user = await tx.user.create({ data: { name: input.name, email: input.email, role: 'SUPER_USER', passwordHash, restaurantId: restaurant.id } });
    await tx.auditLog.create({ data: { restaurantId: restaurant.id, actorId: user.id, action: 'INITIAL_ADMIN_CREATED', entity: 'User', entityId: user.id, after: { name: user.name, email: user.email, role: user.role } } });
  });
  console.log('Restaurant and initial administrator created. Sign in at http://localhost:3000.');
} finally { await prisma.$disconnect(); }
