import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

/**
 * Ensure a platform-owner (ADMIN) account exists. Idempotent.
 * Reads OWNER_EMAIL / OWNER_PASSWORD (falls back to sensible dev defaults).
 * Run with: `npx ts-node prisma/seed-admin.ts`.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = (process.env.OWNER_EMAIL || 'owner@wristband.local').toLowerCase();
  const password = process.env.OWNER_PASSWORD || 'ChangeMe123!';

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.profile.upsert({
    where: { email },
    update: { isVerified: true },
    create: {
      email,
      password: passwordHash,
      fullName: 'Platform Owner',
      isVerified: true,
    },
  });

  const hasAdmin = await prisma.userRole.findFirst({
    where: { userId: user.id, role: 'admin' },
  });
  if (!hasAdmin) {
    await prisma.userRole.create({ data: { userId: user.id, role: 'admin' } });
  }

  console.log(`Owner account ready: ${email} (admin role ensured).`);
  if (!process.env.OWNER_PASSWORD) {
    console.log('  Default password: ChangeMe123!  — set OWNER_PASSWORD to override.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
