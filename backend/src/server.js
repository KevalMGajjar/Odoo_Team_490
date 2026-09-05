import 'dotenv/config'
import http from 'node:http'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'

import { prisma } from './lib/prisma.js'
import { decimalReplacer } from './lib/money.js'
import { initRealtime } from './lib/realtime.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import authRoutes from './routes/auth.js'
import masterRoutes from './routes/masters.js'

// Fail fast rather than starting a server that cannot issue valid sessions.
for (const key of ['JWT_SECRET', 'DATABASE_URL']) {
  if (!process.env[key]) {
    console.error(`\x1b[31mMissing required environment variable: ${key}\x1b[0m`)
    process.exit(1)
  }
}

const PORT = Number(process.env.PORT || 4000)
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

const app = express()

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({ origin: FRONTEND_URL, credentials: true }))
app.use(express.json({ limit: '25mb' })) // headroom for OCR uploads
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'))

/**
 * Money crosses the wire as a STRING.
 *
 * Prisma returns Decimal objects; serialising them as JS numbers would
 * reintroduce float error in the client. The frontend formats for display and
 * never recomputes a total the backend didn't send.
 */
app.set('json replacer', decimalReplacer)

// ─────────────────────────── health ───────────────────────────
/**
 * Green/amber/red for each dependency. Proves the graceful-degradation story
 * in five seconds during a demo: the app runs on local Postgres alone, and
 * Odoo and the AI agent are optional extras.
 */
app.get('/health', async (req, res) => {
  const checks = {}

  try {
    const t0 = Date.now()
    await prisma.$queryRaw`SELECT 1`
    checks.database = { status: 'up', latencyMs: Date.now() - t0 }
  } catch (err) {
    checks.database = { status: 'down', detail: err.message }
  }

  checks.erp = process.env.ERP_ENABLED === 'true'
    ? { status: 'configured', url: process.env.ERP_BASE_URL }
    : { status: 'disabled', detail: 'Optional — the app is fully functional without it' }

  checks.ai = process.env.AI_ENABLED === 'true'
    ? { status: 'configured', model: process.env.AI_MODEL, offline: /localhost|127\.0\.0\.1/.test(process.env.AI_BASE_URL ?? '') }
    : { status: 'disabled', detail: 'Optional — document entry works without it' }

  const healthy = checks.database.status === 'up'
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    service: 'urban-furniture-api',
    uptimeSec: Math.round(process.uptime()),
    checks,
  })
})

app.get('/', (req, res) => {
  res.json({
    service: 'Urban Furniture — Accounting System API',
    version: '1.0.0',
    docs: '/health for dependency status',
  })
})

// ─────────────────────────── routes ───────────────────────────
app.use('/auth', authRoutes)
app.use('/', masterRoutes)

app.use(notFoundHandler)
app.use(errorHandler)

// ─────────────────────────── boot ─────────────────────────────
const server = http.createServer(app)
initRealtime(server, { origin: FRONTEND_URL })

server.listen(PORT, () => {
  console.log(`\n  \x1b[1mUrban Furniture API\x1b[0m`)
  console.log(`  http://localhost:${PORT}`)
  console.log(`  health   http://localhost:${PORT}/health`)
  console.log(`  cors     ${FRONTEND_URL}`)
  console.log(`  realtime socket.io ready\n`)
})

const shutdown = async (signal) => {
  console.log(`\n  ${signal} — shutting down`)
  server.close()
  await prisma.$disconnect()
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

export default app
