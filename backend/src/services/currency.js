import { D, money, rate as toRate } from '../lib/money.js'
import { notFound, invalidField } from '../lib/errors.js'
import { toDateOnly } from './ledger.js'

/**
 * Multi-currency support.
 *
 * ONE RULE makes this tractable: the ledger is always stored in BASE currency.
 * debit/credit are base; amount_currency carries the foreign figure for
 * reference only. Reports therefore never convert anything.
 *
 * rate = how many BASE units equal 1 unit of the foreign currency.
 *   USD rate 83.50  →  1 USD = ₹83.50
 */

export async function getBaseCurrency(tx) {
  const base = await tx.currency.findFirst({ where: { isBase: true } })
  if (!base) throw notFound('Base currency — seed a currency with isBase = true')
  return base
}

/**
 * Latest rate on or before `date`. Rates are business records held in the
 * database, never fetched from a live API at render time — that keeps the app
 * working with no internet and makes historical documents reproducible.
 */
export async function getRateOn(tx, currencyId, date) {
  const currency = await tx.currency.findUnique({ where: { id: currencyId } })
  if (!currency) throw invalidField('currencyId', 'Currency does not exist')
  if (currency.isBase) return { currency, rate: toRate(1) }

  const row = await tx.currencyRate.findFirst({
    where: { currencyId, date: { lte: toDateOnly(date) } },
    orderBy: { date: 'desc' },
  })
  if (!row) {
    throw invalidField(
      'currencyId',
      `No exchange rate for ${currency.code} on or before ${toDateOnly(date).toISOString().slice(0, 10)} — add one under Masters → Currencies`,
    )
  }
  return { currency, rate: toRate(row.rate) }
}

/** Convert a document-currency amount into base currency. */
export const toBaseAmount = (amount, exchangeRate) => money(D(amount).times(D(exchangeRate)))

/**
 * Build the foreign-currency annotation for a journal item.
 * Returns nulls when the document is already in base currency, so we don't
 * clutter domestic entries with redundant data.
 */
export const currencyAnnotation = (currency, isBase, amountCurrency) =>
  isBase ? { currencyId: null, amountCurrency: null } : { currencyId: currency.id, amountCurrency }

/**
 * Realised FX difference at settlement.
 *
 * A document booked at one rate and settled at another leaves a gain or loss.
 * Booked ₹83.50/USD, settled at ₹84.20 → ₹0.70 per dollar of difference.
 *
 * @returns {{ amount, isGain }} amount is always positive; isGain picks the account.
 */
export function realisedFxDifference({ foreignAmount, bookedRate, settledRate }) {
  const booked = money(D(foreignAmount).times(D(bookedRate)))
  const settled = money(D(foreignAmount).times(D(settledRate)))
  const diff = money(settled.minus(booked))
  return { amount: diff.abs(), isGain: diff.greaterThan(0), booked, settled }
}
