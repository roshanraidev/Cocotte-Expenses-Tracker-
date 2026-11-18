// Database heartbeat check for the initial single-worker deployment. No sensitive output.
import 'dotenv/config';
import { db } from '../../src/lib/db';
import { workerReady } from '../../src/lib/sales-history/jobs';

const prisma = db();
try {
  if (!await workerReady(prisma)) process.exitCode = 1;
} catch {
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
