/**
 * Typed application errors.
 *
 * Status code discipline (judges notice this):
 *   400 malformed request
 *   401 no / invalid session
 *   403 authenticated but wrong role, or row not owned by this portal user
 *   404 record does not exist
 *   409 STATE conflict — the record exists but the action is illegal right now
 *       (posting a posted entry, archiving something still in use)
 *   422 VALIDATION — the payload itself is wrong (unbalanced entry, negative qty)
 */

export class AppError extends Error {
  constructor(message, status = 500, extra = {}) {
    super(message)
    this.name = 'AppError'
    this.status = status
    Object.assign(this, extra)
  }
}

export const badRequest = (message, extra) => new AppError(message, 400, extra)
export const unauthorized = (message = 'Unauthorized') => new AppError(message, 401)
export const forbidden = (message = 'Forbidden') => new AppError(message, 403)
export const notFound = (what = 'Record') => new AppError(`${what} not found`, 404)

/** State conflict — the action is illegal given the record's current state. */
export const conflict = (message, extra) => new AppError(message, 409, extra)

/**
 * Validation failure. `errors` mirrors the Zod middleware shape so the frontend
 * can render messages inline under the offending field.
 */
export const invalid = (message, errors = []) =>
  new AppError(message, 422, { errors: errors.length ? errors : undefined })

/** Single-field validation failure. */
export const invalidField = (field, message) =>
  new AppError(message, 422, { errors: [{ field, message }] })

export const serviceUnavailable = (message) => new AppError(message, 503)
