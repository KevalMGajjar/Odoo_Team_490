import 'dotenv/config'
import { prisma } from '../lib/prisma.js'
import {
  postVoucher, listTransactions, fiscalYearOf, fiscalYearLabel,
  peekVoucherNo, cashBankAccounts, getLastCashBankAccount,
} from '../services/voucher.js'
import { D, money } from '../lib/money.js'

/**
 * Voucher entry + `transactions` view verification.
 * Reproduces the supplied sample rows exactly. Rolled back at the end.
 *
 *   node src/db/verify-voucher.js
 */

let pass = 0, fail = 0
const ok = (n) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${n}`) }
const bad = (n, d) => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }
const assert = (c, n, d = '') => (c ? ok(n) : bad(n, d))
const assertEq = (a, e, n) => {
  const A = D(a).toString(), E = D(e).toString()
  return A === E ? ok(`${n}  (${A})`) : bad(n, `expected ${E}, got ${A}`)
}
const assertThrows = async (fn, status, n) => {
  try { await fn(); bad(n, `expected ${status}, nothing thrown`) }
  catch (e) {
    e.status === status ? ok(`${n}  → ${status}: "${e.message.slice(0, 62)}"`)
      : bad(n, `expected ${status}, got ${e.status ?? '?'}: ${e.message}`)
  }
}
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`)
class Rollback extends Error {}

const APR1 = new Date('2026-04-01T00:00:00Z')
const APR5 = new Date('2026-04-05T00:00:00Z')

async function main() {
  console.log('\n\x1b[1m═══ Voucher entry & transactions view ═══\x1b[0m')

  try {
    await prisma.$transaction(async (tx) => {
      // ── fixtures ──
      const acc = (code, name, type, isCashBank = false) =>
        tx.chartOfAccount.create({ data: { code, name, type, isCashBank } })

      const abcParty = await acc('V1101', 'Abc Party', 'asset')
      const kishan = await acc('V1102', 'Kishan Auto Parts', 'asset')
      const bank = await acc('V1010', 'Bank Account', 'asset', true)
      const cash = await acc('V1000', 'Cash Account', 'asset', true)
      const rent = await acc('V5100', 'Rent Expense', 'expense')
      const creditors = await acc('V2000', 'Creditors', 'liability')

      await tx.journal.create({ data: { name: 'V Bank', type: 'bank', code: 'VBNK' } })
      await tx.journal.create({ data: { name: 'V Cash', type: 'cash', code: 'VCSH' } })
      await tx.journal.create({ data: { name: 'V Misc', type: 'miscellaneous', code: 'VMSC' } })

      const user = await tx.user.create({
        data: { name: 'Voucher Tester', email: `vt-${Date.now()}@test.local`, password: 'x', role: 'admin' },
      })

      // ── 1. financial year ──
      section('1. Financial year (Apr–Mar)')
      assertEq(fiscalYearOf(APR1), 2026, '01-Apr-2026 falls in FY 2026')
      assertEq(fiscalYearOf(new Date('2026-03-31T00:00:00Z')), 2025, '31-Mar-2026 falls in FY 2025')
      assert(fiscalYearLabel(2026) === '2026-27', 'FY label renders as 2026-27')

      const peek = await peekVoucherNo(tx, 'BReceipt', APR1)
      assertEq(peek.voucherNo, 1, 'first voucher number is 1')

      // ── 2. bank receipt ──
      section('2. Bank Receipt — Credit party, Debit bank')
      const br = await postVoucher(tx, {
        voucherType: 'BReceipt', date: APR1, cashBankAccountId: bank.id,
        lines: [{ accountId: abcParty.id, amount: 5000 }],
        reference: 'T112312', narration: 'neft received as per no. BOBxyz', userId: user.id,
      })
      assertEq(br.voucherNo, 1, 'voucher_no allocated')
      assertEq(br.fiscalYear, 2026, 'fiscal_year stamped')

      let rows = await listTransactions(tx, { voucherType: 'BReceipt' })
      const brParty = rows.find((r) => r.accountid === abcParty.id)
      const brBank = rows.find((r) => r.accountid === bank.id)

      assertEq(brParty.amount, '5000', 'party row is POSITIVE (credit)')
      assertEq(brBank.amount, '-5000', 'bank row is NEGATIVE (debit)')
      assert(brParty.reference === 'T112312', 'reference carried onto both rows')
      assert(brParty.narration === 'neft received as per no. BOBxyz', 'narration carried')
      assert(brParty.voucher_type === 'BReceipt', 'voucher_type projected')
      assertEq(D(brParty.amount).plus(D(brBank.amount)), 0, 'voucher nets to zero')

      // ── 3. cash receipt ──
      section('3. Cash Receipt')
      const cr = await postVoucher(tx, {
        voucherType: 'CReceipt', date: APR1, cashBankAccountId: cash.id,
        lines: [{ accountId: kishan.id, amount: 5500 }],
        reference: 'C101', narration: 'CASH received as per no. AAA', userId: user.id,
      })
      assertEq(cr.voucherNo, 1, 'CReceipt numbering is INDEPENDENT of BReceipt')

      rows = await listTransactions(tx, { voucherType: 'CReceipt' })
      assertEq(rows.find((r) => r.accountid === kishan.id).amount, '5500', 'party credit +5500')
      assertEq(rows.find((r) => r.accountid === cash.id).amount, '-5500', 'cash debit -5500')

      // ── 4. bank payment ──
      section('4. Bank Payment — Debit party, Credit bank')
      const bp = await postVoucher(tx, {
        voucherType: 'BPayment', date: APR5, cashBankAccountId: bank.id,
        lines: [{ accountId: abcParty.id, amount: 4500 }],
        reference: 'P112312', narration: 'Paid neft', userId: user.id,
      })
      assertEq(bp.voucherNo, 1, 'BPayment numbering independent')

      rows = await listTransactions(tx, { voucherType: 'BPayment' })
      assertEq(rows.find((r) => r.accountid === abcParty.id).amount, '-4500', 'party row NEGATIVE (debit)')
      assertEq(rows.find((r) => r.accountid === bank.id).amount, '4500', 'bank row POSITIVE (credit)')

      // ── 5. numbering increments ──
      section('5. Numbering')
      const br2 = await postVoucher(tx, {
        voucherType: 'BReceipt', date: APR5, cashBankAccountId: bank.id,
        lines: [{ accountId: abcParty.id, amount: 100 }], reference: 'T2', userId: user.id,
      })
      assertEq(br2.voucherNo, 2, 'second BReceipt is voucher_no 2 (last + 1)')

      // ── 6. journal voucher ──
      section('6. Journal Voucher — Debit first, Credit second')
      const jv = await postVoucher(tx, {
        voucherType: 'Journal', date: APR5,
        debitAccountId: rent.id, creditAccountId: creditors.id, amount: 12000,
        reference: 'JV-1', narration: 'Rent for April', userId: user.id,
      })
      assertEq(jv.voucherNo, 1, 'Journal numbering independent')

      rows = await listTransactions(tx, { voucherType: 'Journal' })
      assertEq(rows.find((r) => r.accountid === rent.id).amount, '-12000', 'debit account NEGATIVE')
      assertEq(rows.find((r) => r.accountid === creditors.id).amount, '12000', 'credit account POSITIVE')

      // ── 7. multi-line receipt ──
      section('7. Multi-line receipt (bank side derived, cannot go out of balance)')
      const multi = await postVoucher(tx, {
        voucherType: 'BReceipt', date: APR5, cashBankAccountId: bank.id,
        lines: [
          { accountId: abcParty.id, amount: 1500 },
          { accountId: kishan.id, amount: 2500 },
        ],
        reference: 'T3', narration: 'Two parties, one deposit', userId: user.id,
      })
      assertEq(multi.total, 4000, 'bank side = sum of party lines')
      assertEq(multi.items.length, 3, 'entry has 3 lines (2 party + 1 bank)')
      const bankLine = multi.items.find((i) => i.accountId === bank.id)
      assertEq(bankLine.debit, '4000', 'single derived bank debit')

      // ── 8. validation ──
      section('8. Validation')
      await assertThrows(() => postVoucher(tx, {
        voucherType: 'BReceipt', date: APR1, cashBankAccountId: bank.id,
        lines: [{ accountId: abcParty.id, amount: 0 }], userId: user.id,
      }), 422, 'zero amount rejected')

      await assertThrows(() => postVoucher(tx, {
        voucherType: 'BReceipt', date: APR1, cashBankAccountId: bank.id,
        lines: [{ accountId: bank.id, amount: 500 }], userId: user.id,
      }), 422, 'party account same as bank account rejected')

      await assertThrows(() => postVoucher(tx, {
        voucherType: 'BReceipt', date: APR1, cashBankAccountId: rent.id,
        lines: [{ accountId: abcParty.id, amount: 500 }], userId: user.id,
      }), 422, 'non-cash/bank account on the bank side rejected')

      await assertThrows(() => postVoucher(tx, {
        voucherType: 'Journal', date: APR1,
        debitAccountId: rent.id, creditAccountId: rent.id, amount: 100, userId: user.id,
      }), 422, 'journal voucher with identical accounts rejected')

      await assertThrows(() => postVoucher(tx, {
        voucherType: 'BReceipt', date: APR1, cashBankAccountId: bank.id,
        lines: [], userId: user.id,
      }), 422, 'voucher with no lines rejected')

      // ── 9. account filter + remembered default ──
      section('9. Account filter and remembered default')
      const banks = await cashBankAccounts(tx)
      assert(banks.length === 2, `cash/bank filter returns only flagged accounts (${banks.length})`)
      assert(!banks.some((b) => b.id === rent.id), 'expense account excluded from the filter')

      const last = await getLastCashBankAccount(tx, user.id, 'BReceipt')
      assert(last?.id === bank.id, 'last account used is remembered per voucher type')

      const lastCash = await getLastCashBankAccount(tx, user.id, 'CReceipt')
      assert(lastCash?.id === cash.id, 'remembered separately for each voucher type')

      // ── 10. ledger invariants still hold ──
      section('10. Ledger invariants still hold for vouchers')
      const agg = await tx.journalItem.aggregate({ _sum: { debit: true, credit: true } })
      assertEq(money(agg._sum.debit ?? 0), money(agg._sum.credit ?? 0), 'Σ debit == Σ credit')

      const all = await listTransactions(tx, {})
      const net = all.reduce((a, r) => a.plus(D(r.amount)), D(0))
      assertEq(net, 0, 'every transactions row nets to zero overall')

      const byVoucher = new Map()
      for (const r of all) {
        const k = `${r.voucher_type}/${r.voucher_no}`
        byVoucher.set(k, (byVoucher.get(k) ?? D(0)).plus(D(r.amount)))
      }
      const unbalanced = [...byVoucher.entries()].filter(([, v]) => !v.isZero())
      assert(unbalanced.length === 0, `each individual voucher nets to zero (${byVoucher.size} vouchers checked)`)

      // ── sample output ──
      section('Sample — transactions view')
      const sample = await listTransactions(tx, { limit: 6, fiscalYear: 2026 })
      console.log('\n  date        vno  type      account              amount     reference  narration')
      console.log('  ' + '─'.repeat(94))
      for (const r of sample.slice(0, 6)) {
        const d = new Date(r.date).toISOString().slice(0, 10)
        console.log(
          `  ${d}  ${String(r.voucher_no).padStart(3)}  ${String(r.voucher_type).padEnd(9)} ` +
          `${String(r.account_name).padEnd(20)} ${String(D(r.amount).toFixed(2)).padStart(9)}  ` +
          `${String(r.reference ?? '').padEnd(9)}  ${String(r.narration ?? '').slice(0, 30)}`,
        )
      }

      throw new Rollback()
    }, { timeout: 60000, maxWait: 10000 })
  } catch (err) {
    if (!(err instanceof Rollback)) { console.error('\n\x1b[31mHARNESS ERROR\x1b[0m', err); fail++ }
  }

  console.log(`\n\x1b[1m${'─'.repeat(56)}\x1b[0m`)
  console.log(`\x1b[1m  ${pass} passed, ${fail} failed\x1b[0m`)
  console.log(`\x1b[1m${'─'.repeat(56)}\x1b[0m\n`)

  await prisma.$disconnect()
  process.exit(fail === 0 ? 0 : 1)
}

main()
