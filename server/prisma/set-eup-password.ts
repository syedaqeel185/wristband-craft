import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

/**
 * Set the password on the EUP (house wholesaler) account, and make sure it has
 * the `eup` role.
 *
 * This app has no forgot-password flow — `auth/change-password` requires an
 * existing session, and there is no admin reset endpoint — so recovering a lost
 * EUP login means writing the hash directly. That is what this does.
 *
 * The password is read from an environment variable rather than argv so it does
 * not end up in shell history.
 *
 *   PowerShell:
 *     $env:DOTENV_CONFIG_PATH=".env.vercel.production"
 *     $env:EUP_EMAIL="wholesale@euwristbands.com"
 *     $env:NEW_PASSWORD="<choose a strong one>"
 *     npx ts-node prisma/set-eup-password.ts
 *
 * Afterwards, clear it from the session:
 *     $env:NEW_PASSWORD=""
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * Which database this run will actually modify. `dotenv/config` silently
 * defaults to server/.env (local Docker), so state the target before touching
 * anything — mixing the two up has cost us real time.
 */
function describeTarget(): { host: string; isLocal: boolean } {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Did you forget DOTENV_CONFIG_PATH?');
  const host = url.replace(/^\w+:\/\/[^@]*@/, '').replace(/[/?].*$/, '');
  return { host, isLocal: /^(localhost|127\.0\.0\.1|\[::1\])/.test(host) };
}

async function main() {
  const email = (process.env.EUP_EMAIL || 'wholesale@euwristbands.com').toLowerCase();
  const newPassword = process.env.NEW_PASSWORD;

  const { host, isLocal } = describeTarget();
  console.log(`→ target database: ${host}  ${isLocal ? '(LOCAL — not production)' : '(remote)'}`);
  if (isLocal) {
    console.log('  If you meant production, re-run with:');
    console.log('    $env:DOTENV_CONFIG_PATH=".env.vercel.production"');
  }

  if (!newPassword || newPassword.length < 8) {
    throw new Error('Set NEW_PASSWORD to at least 8 characters before running this.');
  }

  const profile = await prisma.profile.findUnique({
    where: { email },
    include: { roles: true },
  });
  if (!profile) {
    throw new Error(
      `No account found for ${email}. Run prisma/seed-wholesaler.ts first, or set EUP_EMAIL to the right address.`,
    );
  }

  const supplier = await prisma.supplier.findUnique({ where: { userId: profile.id } });
  if (!supplier) {
    throw new Error(`${email} has no supplier record — it is not an EUP account.`);
  }
  if (!supplier.isWholesaler) {
    console.warn(
      `⚠️  ${supplier.companyName} is not flagged as a wholesaler. Promote it from the platform dashboard, or EUP's tools will still refuse it.`,
    );
  }

  await prisma.profile.update({
    where: { id: profile.id },
    data: { password: await bcrypt.hash(newPassword, 10), isVerified: true },
  });

  // The `eup` role is what routes this account to /eup and unlocks the price
  // list and freight endpoints. Add it if a previous seed predates the role.
  const hasEup = profile.roles.some((r) => r.role === 'eup');
  if (!hasEup) {
    await prisma.userRole.create({ data: { userId: profile.id, role: 'eup' } });
  }

  console.log(`✅ Password updated for ${email} (${supplier.companyName})`);
  console.log(`   roles: ${[...profile.roles.map((r) => r.role), ...(hasEup ? [] : ['eup'])].join(', ')}`);
  console.log('   Sign in at /supplier-login — you will land on /eup.');
}

main()
  .catch((e) => {
    console.error('❌', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
