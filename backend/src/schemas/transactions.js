import { z } from 'zod'

/**
 * Validation for every transactional document.
 *
 * Line subtotals are NEVER accepted from the client — they are recomputed on the
 * server from quantity × unit price. A client that sends a subtotal is ignored,
 * so a tampered payload cannot alter the ledger.
 */

const uuid = (label = 'Selection') => z.string().uuid(`${label} is not valid`)
const optionalUuid = (label) =>
  uuid(label).optional().nullable().or(z.literal('').transform(() => null))

const isoDate = (label = 'Date') =>
  z.coerce.date({ invalid_type_error: `${label} is not a valid date` })

const quantity = z.coerce
  .number({ invalid_type_error: 'Quantity must be a number' })
  .positive('Quantity must be greater than zero')
  .max(1_000_000, 'Quantity is unrealistically large')

const unitPrice = z.coerce
  .number({ invalid_type_error: 'Unit price must be a number' })
  .nonnegative('Unit price cannot be negative')
  .max(99_999_999, 'Unit price is unrealistically large')

const amount = (label = 'Amount') =>
  z.coerce.number({ invalid_type_error: `${label} must be a number` })
    .positive(`${label} must be greater than zero`)
    .max(99_999_999, `${label} is unrealistically large`)

const taxRate = z.coerce.number().min(0).max(100, 'Tax rate cannot exceed 100%').optional()

const note = (max = 300) =>
  z.string().trim().max(max).optional().nullable().or(z.literal('').transform(() => null))

// ─────────────────────────── document lines ───────────────────────────
const documentLine = z.object({
  productId: uuid('Product'),
  description: note(200),
  quantity,
  unitPrice,
  /** Defaults to the product's GST % when omitted. */
  taxRate,
  accountId: optionalUuid('Account'),
  analyticAccountId: optionalUuid('Analytic account'),
})

const lines = z.array(documentLine).min(1, 'Add at least one line')

// ─────────────────────────── purchase side ───────────────────────────
export const purchaseOrderCreate = z.object({
  vendorId: uuid('Vendor'),
  orderDate: isoDate('Order date'),
  currencyId: optionalUuid('Currency'),
  reference: note(60),
  lines,
})

export const vendorBillCreate = z.object({
  vendorId: uuid('Vendor'),
  purchaseOrderId: optionalUuid('Purchase order'),
  billDate: isoDate('Bill date'),
  dueDate: isoDate('Due date').optional().nullable(),
  currencyId: optionalUuid('Currency'),
  reference: note(60),
  lines,
}).refine((d) => !d.dueDate || d.dueDate >= d.billDate, {
  message: 'Due date cannot be before the bill date',
  path: ['dueDate'],
})

// ───────────────────────────── sales side ─────────────────────────────
export const salesOrderCreate = z.object({
  customerId: uuid('Customer'),
  orderDate: isoDate('Order date'),
  currencyId: optionalUuid('Currency'),
  reference: note(60),
  lines,
})

export const customerInvoiceCreate = z.object({
  customerId: uuid('Customer'),
  salesOrderId: optionalUuid('Sales order'),
  invoiceDate: isoDate('Invoice date'),
  dueDate: isoDate('Due date').optional().nullable(),
  currencyId: optionalUuid('Currency'),
  reference: note(60),
  lines,
}).refine((d) => !d.dueDate || d.dueDate >= d.invoiceDate, {
  message: 'Due date cannot be before the invoice date',
  path: ['dueDate'],
})

// ─────────────────────────── payments ───────────────────────────
export const paymentCreate = z.object({
  direction: z.enum(['inbound', 'outbound'], {
    errorMap: () => ({ message: 'Direction must be inbound (received) or outbound (paid)' }),
  }),
  partnerId: uuid('Contact'),
  journalId: uuid('Bank or cash journal'),
  paymentDate: isoDate('Payment date'),
  currencyId: optionalUuid('Currency'),
  amount: amount('Payment amount'),
  allocations: z.array(z.object({
    invoiceId: optionalUuid('Invoice'),
    billId: optionalUuid('Bill'),
    amount: amount('Allocated amount'),
  }).refine((a) => Boolean(a.invoiceId) !== Boolean(a.billId), {
    message: 'Each allocation must reference exactly one invoice or one bill',
  })).default([]),
})

/** Shortcut used by the "Register payment" button on an invoice or bill. */
export const registerPayment = z.object({
  journalId: uuid('Bank or cash journal'),
  paymentDate: isoDate('Payment date'),
  amount: amount('Payment amount'),
  currencyId: optionalUuid('Currency'),
  note: note(300),
})

// ─────────────────────────── vouchers ───────────────────────────
const voucherLine = z.object({
  accountId: uuid('Account'),
  amount: amount('Amount'),
  partnerId: optionalUuid('Partner'),
  analyticAccountId: optionalUuid('Analytic account'),
  label: note(200),
})

export const receiptPaymentVoucher = z.object({
  voucherType: z.enum(['BReceipt', 'BPayment', 'CReceipt', 'CPayment']),
  date: isoDate('Voucher date'),
  cashBankAccountId: uuid('Bank or cash account'),
  journalId: optionalUuid('Journal'),
  lines: z.array(voucherLine).min(1, 'Add at least one account line'),
  reference: note(60),
  narration: note(300),
})

export const journalVoucher = z.object({
  voucherType: z.literal('Journal'),
  date: isoDate('Voucher date'),
  debitAccountId: uuid('Debit account'),
  creditAccountId: uuid('Credit account'),
  debitPartnerId: optionalUuid('Debit partner'),
  creditPartnerId: optionalUuid('Credit partner'),
  amount: amount('Amount'),
  journalId: optionalUuid('Journal'),
  reference: note(60),
  narration: note(300),
})

/** One endpoint serves all five voucher screens. */
export const voucherCreate = z.discriminatedUnion('voucherType', [
  receiptPaymentVoucher,
  journalVoucher,
])

// ────────────────────── manual journal entry ──────────────────────
const journalItemInput = z.object({
  accountId: uuid('Account'),
  partnerId: optionalUuid('Partner'),
  analyticAccountId: optionalUuid('Analytic account'),
  label: note(200),
  debit: z.coerce.number().nonnegative('Debit cannot be negative').default(0),
  credit: z.coerce.number().nonnegative('Credit cannot be negative').default(0),
}).refine((i) => !(i.debit > 0 && i.credit > 0), {
  message: 'A line cannot have both a debit and a credit',
})

export const journalEntryCreate = z.object({
  journalId: uuid('Journal'),
  date: isoDate('Accounting date'),
  reference: note(60),
  narration: note(300),
  items: z.array(journalItemInput).min(2, 'A journal entry needs at least two lines'),
})

/** Drives the live Dr/Cr footer on the entry screen — no persistence. */
export const balancePreview = z.object({
  items: z.array(z.object({
    debit: z.coerce.number().nonnegative().default(0),
    credit: z.coerce.number().nonnegative().default(0),
  })).default([]),
})

export const reverseEntryInput = z.object({
  date: isoDate('Reversal date').optional(),
  reason: note(300),
})
