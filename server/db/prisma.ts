/**
 * Centralized Prisma Client Singleton & Lifecycle Management
 */

import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __globalPrismaClient: PrismaClient | undefined;
}

export function createPrismaClient(): PrismaClient {
  const isProduction = process.env.NODE_ENV === 'production';

  const client = new PrismaClient({
    log: isProduction ? ['error', 'warn'] : ['error', 'warn'],
  });

  return client;
}

export const prisma: PrismaClient = globalThis.__globalPrismaClient || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__globalPrismaClient = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
