import Decimal from 'decimal.js'

/**
 * Money and quantity arithmetic.
 *
 * RULE: never use JavaScript floats for money. `0.1 + 0.2 !== 0.3` will make the
 * balance sheet fail to balance by a paisa and cost you an hour at 3am.
 * Everything monetary goes through this module.
 */

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP })

export { Decimal }

/** Coerce anything (Prisma Decimal, string, number, null) to a Decimal. */
export const D = (v) => (v instanceof Decimal ? v : new Decimal(v ?? 0))

// ── scale helpers ────────────────────────────────────────────────
/** Monetary amount: 2 dp, half-up. Use for debit/credit/totals. */
export const money = (v) => D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
/** Quantity: 3 dp. */
export const qty = (v) => D(v).toDecimalPlaces(3, Decimal.ROUND_HALF_UP)
/** Unit cost: 4 dp — extra precision so moving-average cost doesn't drift. */
export const cost = (v) => D(v).toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
/** Exchange rate: 6 dp. */
export const rate = (v) => D(v).toDecimalPlaces(6, Decimal.ROUND_HALF_UP)

// ── arithmetic ───────────────────────────────────────────────────
export const sum = (list, pick = (x) => x) =>
  list.reduce((acc, item) => acc.plus(D(pick(item))), new Decimal(0))

export const sumMoney = (list, pick) => money(sum(list, pick))

export const isZero = (v) => D(v).isZero()
export const eq = (a, b) => D(a).equals(D(b))
export const gt = (a, b) => D(a).greaterThan(D(b))
export const gte = (a, b) => D(a).greaterThanOrEqualTo(D(b))
export const lt = (a, b) => D(a).lessThan(D(b))
export const isNeg = (v) => D(v).isNegative()

// ── document maths ───────────────────────────────────────────────
/**
 * Line subtotal, net of tax. Rounded ONCE here — never round intermediate
 * tax maths twice or the totals drift.
 */
export const lineSubtotal = (quantity, unitPrice) => money(D(quantity).times(D(unitPrice)))

/** Tax on a net amount at a percentage rate. */
export const lineTax = (subtotal, taxRate) =>
  money(D(subtotal).times(D(taxRate)).dividedBy(100))

/** Roll a set of {subtotal, taxRate} lines into {untaxed, taxAmount, total}. */
export const documentTotals = (lines) => {
  const untaxed = sumMoney(lines, (l) => l.subtotal)
  const taxAmount = money(
    lines.reduce((acc, l) => acc.plus(lineTax(l.subtotal, l.taxRate ?? 0)), new Decimal(0)),
  )
  return { untaxed, taxAmount, total: money(untaxed.plus(taxAmount)) }
}

// ── currency conversion ──────────────────────────────────────────
/**
 * Convert a document-currency amount into base currency.
 * exchangeRate = how many BASE units equal 1 unit of the document currency.
 */
export const toBase = (amount, exchangeRate) => money(D(amount).times(D(exchangeRate)))

// ── serialisation ────────────────────────────────────────────────
/**
 * Prisma returns Decimal objects that JSON.stringify renders unhelpfully.
 * Send money to the client as a STRING so no float rounding can occur in transit;
 * the frontend formats for display and never recomputes a total.
 */
export const decimalReplacer = (_key, value) =>
  value instanceof Decimal || (value?.constructor?.name === 'Decimal') ? value.toString() : value

export const fmt = (v, dp = 2) => D(v).toFixed(dp)
