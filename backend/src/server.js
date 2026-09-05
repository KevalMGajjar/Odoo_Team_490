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
import swaggerUi from 'swagger-ui-express'
import authRoutes from './routes/auth.js'
import masterRoutes from './routes/masters.js'
import reportRoutes from './routes/reports.js'
import transactionRoutes from './routes/transactions.js'
import auditRoutes from './routes/audit.js'
import portalRoutes from './routes/portal.js'
import stockRoutes from './routes/stock.js'
import odooRoutes from './routes/odoo.js'
import userRoutes from './routes/users.js'
import budgetRoutes from './routes/budgets.js'
import voiceRoutes from './routes/voice.js'
import { buildOpenApiDocument } from './docs/openapi.js'

// Fail fast rather than starting a server that cannot issue valid sessions.
for (const key of ['JWT_SECRET', 'DATABASE_URL']) {
  if (!process.env[key]) {
    console.error(`\x1b[31mMissing required environment variable: ${key}\x1b[0m`)
    process.exit(1)
  }
}

const PORT = Number(process.env.PORT || 4000)
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

/**
 * Allowed browser origins. The web app plus any companion clients — set
 * CORS_ORIGINS as a comma-separated list. Native apps send no Origin header
 * and are unaffected by CORS entirely; they authenticate with a bearer token.
 */
const ALLOWED_ORIGINS = [
  FRONTEND_URL,
  ...(process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
]

const app = express()

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({
  origin(origin, cb) {
    // no Origin = native app, curl, or same-origin — always allowed
    if (!origin) return cb(null, true)
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    // dev convenience: any localhost port, so a teammate can run on 5173, 8081, …
    if (process.env.NODE_ENV === 'development' && /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/.test(origin)) {
      return cb(null, true)
    }
    return cb(new Error(`Origin ${origin} is not allowed by CORS`))
  },
  credentials: true,
}))
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

  if (process.env.ERP_ENABLED === 'true') {
    const { odooPing } = await import('./services/odooClient.js')
    const ping = await odooPing()
    checks.erp = ping.reachable
      ? { status: 'up', url: process.env.ERP_BASE_URL, latencyMs: ping.latencyMs }
      : { status: 'down', url: process.env.ERP_BASE_URL, detail: ping.error }
  } else {
    checks.erp = { status: 'disabled', detail: 'Optional — the app is fully functional without it' }
  }

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

// ──────────────────────── API documentation ────────────────────────
const openApiDocument = buildOpenApiDocument({ port: PORT })

app.get('/openapi.json', (req, res) => res.json(openApiDocument))

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, {
  customSiteTitle: 'Urban Furniture API',
  swaggerOptions: { persistAuthorization: true, docExpansion: 'none', tagsSorter: 'alpha' },
  // Odoo plum, so the docs look like part of the product
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #714B67 }
    .swagger-ui .btn.authorize { border-color: #714B67; color: #714B67 }
    .swagger-ui .btn.authorize svg { fill: #714B67 }
    .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #714B67 }
    .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #017E84 }
  `,
}))

app.get('/', (req, res) => {
  res.json({
    service: 'Urban Furniture — Accounting System API',
    version: '1.0.0',
    docs: `http://localhost:${PORT}/docs`,
    openapi: `http://localhost:${PORT}/openapi.json`,
    health: `http://localhost:${PORT}/health`,
  })
})

// ─────────────────────────── routes ───────────────────────────
app.use('/auth', authRoutes)
app.use('/reports', reportRoutes)
app.use('/', transactionRoutes)
app.use('/audit', auditRoutes)
app.use('/portal', portalRoutes)
app.use('/odoo', odooRoutes)
app.use('/users', userRoutes)
app.use('/voice', voiceRoutes)
app.use('/', budgetRoutes)
app.use('/', stockRoutes)
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
