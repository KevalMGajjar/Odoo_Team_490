import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import { AppError } from '../lib/errors.js'

export const notFoundHandler = (req, res) =>
  res.status(404).json({ message: `No route for ${req.method} ${req.originalUrl}` })

/**
 * Centralised error responder. Every route just throws (or calls next(err));
 * translation to a wire response happens once, here.
 */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  // ── our own typed errors ──
  if (err instanceof AppError) {
    return res.status(err.status).json({
      message: err.message,
      ...(err.errors ? { errors: err.errors } : {}),
    })
  }

  // ── zod thrown outside the validate() middleware ──
  if (err instanceof ZodError) {
    return res.status(422).json({
      message: 'Validation failed',
      errors: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    })
  }

  // ── prisma ──
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const fields = err.meta?.target
        const field = Array.isArray(fields) ? fields.join(', ') : String(fields ?? 'value')
        return res.status(409).json({
          message: `A record with this ${field} already exists`,
          errors: [{ field, message: 'Must be unique' }],
        })
      }
      case 'P2025':
        return res.status(404).json({ message: 'Record not found' })
      case 'P2003':
        return res.status(422).json({
          message: 'Referenced record does not exist',
          errors: [{ field: String(err.meta?.field_name ?? 'reference'), message: 'Invalid reference' }],
        })
      case 'P2014':
        return res.status(409).json({ message: 'This change would break a required relation' })
      default:
        console.error('[prisma]', err.code, err.message)
        return res.status(400).json({ message: 'Database request could not be completed' })
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error('[prisma:validation]', err.message)
    return res.status(400).json({ message: 'Malformed database query' })
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    console.error('[prisma:init]', err.message)
    return res.status(503).json({ message: 'Database unavailable' })
  }

  // ── unknown ──
  console.error('[unhandled]', err)
  return res.status(500).json({
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' ? { detail: err.message } : {}),
  })
}
