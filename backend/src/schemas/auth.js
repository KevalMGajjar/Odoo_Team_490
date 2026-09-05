import { z } from 'zod'

const email = z.string().trim().toLowerCase().email('Enter a valid email address')

const password = z
  .string()
  .min(6, 'Password must be at least 6 characters')
  .max(128, 'Password is too long')

export const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email,
  password,
  // Portal contacts are created from the Contact master, never by self-signup.
  role: z.enum(['admin', 'invoicing_user'], {
    errorMap: () => ({ message: 'Role must be Admin or Invoicing User' }),
  }).default('invoicing_user'),
})

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
})

export const forgotSchema = z.object({ email })

export const resetSchema = z.object({
  email,
  otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  password,
})
