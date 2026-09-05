import { z } from 'zod'

const email = z.string().trim().toLowerCase().email('Enter a valid email address')

const loginId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{6,12}$/, 'Login ID must be 6-12 letters/numbers')

/**
 * Clients send PBKDF2-SHA256(password, salt = loginId) as 64 hex characters,
 * never the typed password — see frontend/lib/password.js. The server bcrypts
 * this before storing it, so a plaintext password is never received, logged,
 * or persisted.
 *
 * Consequence worth being explicit about: strength rules (length, upper,
 * lower, special) can no longer be enforced here, because the server never
 * sees the password to judge. They are enforced client-side before
 * derivation. Requiring the derived shape at least guarantees a client that
 * skipped derivation is rejected outright rather than silently storing a
 * bcrypt of the raw password.
 */
const password = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'Password was not processed correctly by the client — please retry')

export const signupSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
    loginId,
    email,
    password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
// Self-signup always creates the least-privileged role, `user`. An admin
// promotes from there (PUT /users/:id); the client cannot pick its own role.

export const loginSchema = z.object({
  loginId: z.string().trim().min(1, 'Login ID is required'),
  password: z.string().min(1, 'Password is required'),
})

/**
 * Step two of sign-in. The challenge id stands in for the credentials — it is
 * proof the password step already succeeded, so this step does not (and must
 * not) take the password again.
 */
export const loginVerifySchema = z.object({
  challengeId: z.string().regex(/^[a-f0-9]{64}$/, 'That sign-in request is not valid'),
  otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export const forgotSchema = z.object({ email })

export const resetSchema = z.object({
  email,
  // Needed because the new password is salted with it client-side; the route
  // checks it really belongs to this email.
  loginId,
  otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  password,
})

export const userCreateSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
    loginId,
    email,
    password,
    role: z.enum(['admin', 'accountant', 'user'], {
      errorMap: () => ({ message: 'Role must be Admin, Accountant or Portal User' }),
    }),
    contactId: z.string().uuid('Select a contact').optional().nullable(),
  })
  .refine((d) => d.role !== 'user' || d.contactId, {
    message: 'A Portal User must be linked to a contact',
    path: ['contactId'],
  })

export const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  role: z.enum(['admin', 'accountant', 'user']).optional(),
  contactId: z.string().uuid().optional().nullable(),
})
