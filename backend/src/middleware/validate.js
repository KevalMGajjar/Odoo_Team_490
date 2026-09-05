import { ZodError } from 'zod'

/**
 * Generic Zod validation middleware.
 *
 *   router.post('/', verifyJWT, requireRole(['admin']), validate(createContactSchema), handler)
 *
 * The route then reads as a specification. On failure returns 422 with
 * `errors: [{ field, message }]` so the frontend renders each message inline
 * under its own field rather than in a toast.
 *
 * On success `req[source]` is REPLACED with the parsed value, so downstream code
 * gets coerced types (dates as Date, numeric strings as numbers) for free.
 */
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source])

  if (!result.success) {
    return res.status(422).json({
      message: 'Validation failed',
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join('.') || source,
        message: issue.message,
      })),
    })
  }

  req[source] = result.data
  next()
}

/** Convert a ZodError thrown outside the middleware into the same wire shape. */
export const zodToResponse = (err) => {
  if (!(err instanceof ZodError)) return null
  return {
    status: 422,
    body: {
      message: 'Validation failed',
      errors: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    },
  }
}
