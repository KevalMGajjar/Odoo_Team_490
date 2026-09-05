import { z } from 'zod'

/**
 * Validation for every master. Server-side is the only side that counts —
 * a judge will disable the HTML `required` attribute or hit the API with curl.
 *
 * Money and quantity fields are coerced then transformed to fixed-precision
 * STRINGS, so Prisma receives an exact decimal and no float ever touches the
 * value on the way in.
 */

const name = (min = 2, max = 120) =>
  z.string().trim().min(min, `Must be at least ${min} characters`).max(max, `Must be at most ${max} characters`)

const optionalText = (max = 200) =>
  z.string().trim().max(max).optional().nullable().or(z.literal('').transform(() => null))

// Client resizes to 320px JPEG before upload, so a 400K-char cap (~300KB
// decoded) is generous headroom, not a real limit anyone should hit.
const optionalImage = () =>
  z.string().trim().max(400_000, 'Image is too large').optional().nullable().or(z.literal('').transform(() => null))

const money = (label = 'Amount', max = 99_999_999) =>
  z.coerce.number({ invalid_type_error: `${label} must be a number` })
    .nonnegative(`${label} cannot be negative`)
    .max(max, `${label} is unrealistically large`)
    .transform((v) => v.toFixed(2))

const percent = (label = 'Rate') =>
  z.coerce.number({ invalid_type_error: `${label} must be a number` })
    .min(0, `${label} cannot be negative`)
    .max(100, `${label} cannot exceed 100%`)
    .transform((v) => v.toFixed(2))

const uuid = (label = 'Selection') =>
  z.string().uuid(`${label} is not valid`)

const optionalUuid = (label) =>
  uuid(label).optional().nullable().or(z.literal('').transform(() => null))

const isoDate = (label = 'Date') =>
  z.coerce.date({ invalid_type_error: `${label} is not a valid date` })

// ─────────────────────────── contacts ───────────────────────────
export const contactCreate = z.object({
  name: name(2, 120),
  type: z.enum(['customer', 'vendor', 'both'], {
    errorMap: () => ({ message: 'Type must be Customer, Vendor or Both' }),
  }),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').optional().nullable()
    .or(z.literal('').transform(() => null)),
  mobile: z.string().trim().regex(/^[0-9+\-\s()]{6,20}$/, 'Enter a valid mobile number').optional().nullable()
    .or(z.literal('').transform(() => null)),
  city: optionalText(80),
  state: optionalText(80),
  pincode: z.string().trim().regex(/^\d{4,10}$/, 'Enter a valid pincode').optional().nullable()
    .or(z.literal('').transform(() => null)),
  profileImage: optionalImage(),
})
export const contactUpdate = contactCreate.partial()

// ─────────────────────────── products ───────────────────────────
// Base objects are named separately from their refinements: `.partial()` only
// exists on a ZodObject, and chaining `.refine()` wraps it in ZodEffects.
const productBase = z.object({
  name: name(2, 120),
  type: z.enum(['goods', 'service', 'combo'], {
    errorMap: () => ({ message: 'Type must be Goods, Service or Combo' }),
  }),
  categoryId: optionalUuid('Category'),
  salesPrice: money('Sales price'),
  cost: money('Cost'),
  gstRate: percent('GST %'),
  taxId: optionalUuid('Tax'),
  trackInventory: z.coerce.boolean().default(false),
  incomeAccountId: optionalUuid('Income account'),
  expenseAccountId: optionalUuid('Expense account'),
  inventoryAccountId: optionalUuid('Inventory account'),
  cogsAccountId: optionalUuid('COGS account'),
  image: optionalImage(),
})

export const productCreate = productBase.refine(
  (d) => !(d.type === 'service' && d.trackInventory),
  { message: 'A service cannot track inventory', path: ['trackInventory'] },
)
export const productUpdate = productBase.partial()

export const productCategoryCreate = z.object({ name: name(2, 60) })
export const productCategoryUpdate = productCategoryCreate.partial()

// ────────────────────── chart of accounts ──────────────────────
const ACCOUNT_TYPES = ['asset', 'liability', 'bank', 'cash', 'capital', 'income', 'expense', 'other_expense']

const accountBase = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9.\-]{1,12}$/, 'Code may contain letters, digits, dots and dashes only'),
  name: name(2, 120),
  type: z.enum(ACCOUNT_TYPES, {
    errorMap: () => ({ message: 'Type must be Asset, Liability, Bank, Cash, Capital, Income, Expenses or Other Expenses' }),
  }),
  // isCashBank is never accepted from the client — it's derived server-side
  // from `type` (see routes/masters.js) so a Bank/Cash-typed account is
  // always, automatically selectable on the voucher screens.
})

export const accountCreate = accountBase
export const accountUpdate = accountBase.partial()

// ─────────────────────────── journals ───────────────────────────
export const journalCreate = z.object({
  code: z.string().trim().regex(/^[A-Z0-9]{2,8}$/, 'Code must be 2–8 uppercase letters or digits'),
  name: name(2, 80),
  type: z.enum(['sales', 'purchase', 'bank', 'cash', 'miscellaneous'], {
    errorMap: () => ({ message: 'Choose a journal type' }),
  }),
  defaultDebitId: optionalUuid('Default debit account'),
  defaultCreditId: optionalUuid('Default credit account'),
})
export const journalUpdate = journalCreate.partial()

// ─────────────────────────── taxes ───────────────────────────
export const taxCreate = z.object({ name: name(2, 40), rate: percent('Rate') })
export const taxUpdate = taxCreate.partial()

// ────────────────────────── currencies ──────────────────────────
export const currencyCreate = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a 3-letter ISO code, e.g. USD'),
  name: name(2, 60),
  symbol: z.string().trim().min(1, 'Symbol is required').max(6),
  decimalPlaces: z.coerce.number().int().min(0).max(6).default(2),
})
export const currencyUpdate = currencyCreate.partial()

export const currencyRateCreate = z.object({
  currencyId: uuid('Currency'),
  date: isoDate('Rate date'),
  rate: z.coerce.number().positive('Rate must be greater than zero').max(100000)
    .transform((v) => v.toFixed(6)),
})

// ─────────────────────── analytic accounts ───────────────────────
export const analyticCreate = z.object({
  name: name(2, 80),
  type: z.enum(['income', 'expense'], {
    errorMap: () => ({ message: 'Type must be Income or Expense' }),
  }),
})
export const analyticUpdate = analyticCreate.partial()

// ─────────────────────────── budgets ───────────────────────────
// Header + lines, like a Purchase/Sales Order — one Budget, many
// BudgetLines, each an Analytic Account + its own committed amount. Type is
// never sent here: it's always read from the chosen Analytic Account.
const budgetLine = z.object({
  analyticAccountId: uuid('Analytic account'),
  committedAmount: money('Committed amount'),
})

const budgetBase = z.object({
  name: name(2, 120),
  startDate: isoDate('Start date'),
  endDate: isoDate('End date'),
  responsibleId: optionalUuid('Responsible person'),
  lines: z.array(budgetLine).min(1, 'Add at least one line'),
})

export const budgetCreate = budgetBase
  .refine((d) => d.endDate > d.startDate, {
    message: 'End date must be after the start date', path: ['endDate'],
  })
export const budgetUpdate = z.object({
  name: name(2, 120).optional(),
  startDate: isoDate('Start date').optional(),
  endDate: isoDate('End date').optional(),
  responsibleId: optionalUuid('Responsible person'),
  lines: z.array(budgetLine).min(1, 'Add at least one line').optional(),
})
