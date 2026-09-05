import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * Prisma client over the `pg` driver adapter.
 *
 * We run the queryCompiler preview (pure JS/WASM) rather than Prisma's native
 * Rust query engine, because this machine is Windows on ARM64 and Prisma only
 * publishes an x64 Windows engine — an x64 .node addon cannot load into an
 * arm64 Node process. The adapter path has no native binary at all, so it also
 * makes the project portable across the team's machines.
 */

const globalForPrisma = globalThis

const createClient = () => {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export const prisma = globalForPrisma.__ufPrisma ?? createClient()

// nodemon restarts would otherwise leak a new pool on every reload
if (process.env.NODE_ENV !== 'production') globalForPrisma.__ufPrisma = prisma

export default prisma
