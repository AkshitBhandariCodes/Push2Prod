import { PrismaClient } from '@prisma/client';

// Global variable declare karenge NodeJS global namespace me taaki Next.js hot-reload dev runtime 
// me multiple Prisma connections open na kare. Isse "Too many connections" error avoid hoga.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Singleton instance export kar rahe hain
export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  ...(process.env.DATABASE_URL ? {
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    }
  } : {})
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

// Enums aur models direct re-export kar rahe hain taaki pure workspace me types easily mil sakein
export * from '@prisma/client';
