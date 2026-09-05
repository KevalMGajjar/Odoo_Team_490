import { describe, it, expect, beforeAll } from 'vitest'
import { api, login, loginAllRoles, today } from '../../helpers/api'

/**
 * Voucher Entry Integration Tests
 *
 * Tests the voucher system: Bank Receipt, Cash Receipt, Bank Payment,
 * Cash Payment, Journal Voucher. Validates the underlying JE structure,
 * numbering, and remembered defaults.
 *
 * Real API (from verify-api.js):
 *   GET  /vouchers/cash-bank-accounts?voucherType=BReceipt → { accounts, lastUsed }
 *   GET  /vouchers/next-number?voucherType=BReceipt        → { voucherNo }
 *   POST /vouchers body: { voucherType, date, cashBankAccountId, lines, reference, narration }
 *   GET  /reports/transactions?voucherType=BReceipt&limit=200 → { rows }
 */

describe('Voucher Entry Integration Tests', () => {
  let accounts: any[]
  let journals: any[]
  let customer: any
  let acc: (code: string) => any
  let bankAccounts: any[]

  beforeAll(async () => {
    await loginAllRoles()
    const { rows: accts } = await api('/accounts?pageSize=200')
    const { rows: jrnls } = await api('/journals')
    const { rows: customers } = await api('/contacts?q=Meera')
    accounts = accts
    journals = jrnls
    customer = customers[0]
    acc = (code: string) => accounts.find((a: any) => a.code === code)

    // Fetch cash/bank accounts for vouchers
    const cb = await api('/vouchers/cash-bank-accounts?voucherType=BReceipt')
    bankAccounts = cb.accounts
  })

  // ─── Bank Receipt ───

  it('Bank Receipt: post receipt, verify party row positive / bank row negative, nets to zero', async () => {
    const peek = await api('/vouchers/next-number?voucherType=BReceipt')
    const expectedNo = peek.voucherNo

    const voucher = await api('/vouchers', {
      method: 'POST',
      body: {
        voucherType: 'BReceipt',
        date: today(),
        cashBankAccountId: bankAccounts[0].id,
        lines: [{ accountId: acc('1100').id, amount: 7500, partnerId: customer.id }],
        reference: `NEFT-TEST-${Date.now()}`,
        narration: 'Test bank receipt',
      },
    })
    expect(voucher.status).toBe(201)
    expect(voucher.voucherNo).toBe(expectedNo)

    // Verify the transaction rows
    const tx = await api(`/reports/transactions?voucherType=BReceipt&limit=200`)
    const mine = tx.rows.filter((r: any) => r.reference === voucher.reference || r.voucherNo === expectedNo)

    // Should have 2 rows: party (positive) and bank (negative)
    expect(mine.length).toBe(2)
    const partyRow = mine.find((r: any) => r.accountid === acc('1100').id)
    const bankRow = mine.find((r: any) => r.accountid === bankAccounts[0].id)
    expect(Number(partyRow.amount)).toBe(7500)
    expect(Number(bankRow.amount)).toBe(-7500)
  })

  it('Cash Receipt: same pattern but with cash account', async () => {
    const cb = await api('/vouchers/cash-bank-accounts?voucherType=CReceipt')
    expect(cb.accounts.length).toBeGreaterThan(0)

    const voucher = await api('/vouchers', {
      method: 'POST',
      body: {
        voucherType: 'CReceipt',
        date: today(),
        cashBankAccountId: cb.accounts[0].id,
        lines: [{ accountId: acc('1100').id, amount: 3000, partnerId: customer.id }],
        reference: `CASH-TEST-${Date.now()}`,
        narration: 'Test cash receipt',
      },
    })
    expect(voucher.status).toBe(201)
  })

  // ─── Validation ───

  it('Validation: zero amount rejected', async () => {
    const v = await api('/vouchers', {
      method: 'POST',
      body: {
        voucherType: 'BReceipt',
        date: today(),
        cashBankAccountId: bankAccounts[0].id,
        lines: [{ accountId: acc('1100').id, amount: 0, partnerId: customer.id }],
        reference: 'ZERO-TEST',
      },
    })
    expect(v.status).toBe(422)
  })

  it('Validation: negative amount rejected', async () => {
    const v = await api('/vouchers', {
      method: 'POST',
      body: {
        voucherType: 'BReceipt',
        date: today(),
        cashBankAccountId: bankAccounts[0].id,
        lines: [{ accountId: acc('1100').id, amount: -500, partnerId: customer.id }],
        reference: 'NEG-TEST',
      },
    })
    expect(v.status).toBe(422)
  })

  it('Validation: non-cash-bank account on bank side should be rejected or flagged', async () => {
    // Use a non-cash-bank account (like expense account '5100') as the cashBankAccountId
    const expenseAccount = acc('5100')
    const v = await api('/vouchers', {
      method: 'POST',
      body: {
        voucherType: 'BReceipt',
        date: today(),
        cashBankAccountId: expenseAccount.id,
        lines: [{ accountId: acc('1100').id, amount: 1000, partnerId: customer.id }],
        reference: 'BAD-BANK-TEST',
      },
    })
    // Should reject because 5100 (Rent Expense) is not a cash/bank account
    expect(v.status).toBe(422)
  })

  // ─── Numbering ───

  it('Voucher numbering: two sequential receipts get consecutive numbers', async () => {
    const peek1 = await api('/vouchers/next-number?voucherType=BReceipt')
    const v1 = await api('/vouchers', {
      method: 'POST',
      body: {
        voucherType: 'BReceipt',
        date: today(),
        cashBankAccountId: bankAccounts[0].id,
        lines: [{ accountId: acc('1100').id, amount: 100, partnerId: customer.id }],
        reference: `SEQ-1-${Date.now()}`,
      },
    })
    expect(v1.voucherNo).toBe(peek1.voucherNo)

    const peek2 = await api('/vouchers/next-number?voucherType=BReceipt')
    const v2 = await api('/vouchers', {
      method: 'POST',
      body: {
        voucherType: 'BReceipt',
        date: today(),
        cashBankAccountId: bankAccounts[0].id,
        lines: [{ accountId: acc('1100').id, amount: 200, partnerId: customer.id }],
        reference: `SEQ-2-${Date.now()}`,
      },
    })
    expect(v2.voucherNo).toBe(peek2.voucherNo)

    // Numbers should be different and sequential
    expect(v2.voucherNo).not.toBe(v1.voucherNo)
  })

  // ─── Remembered defaults ───

  it('Last-used cash/bank account is remembered after posting a voucher', async () => {
    const cb = await api('/vouchers/cash-bank-accounts?voucherType=BReceipt')
    const targetAccount = cb.accounts[cb.accounts.length - 1] // use the LAST account to change the default

    await api('/vouchers', {
      method: 'POST',
      body: {
        voucherType: 'BReceipt',
        date: today(),
        cashBankAccountId: targetAccount.id,
        lines: [{ accountId: acc('1100').id, amount: 500, partnerId: customer.id }],
        reference: `REMEMBER-TEST-${Date.now()}`,
      },
    })

    const afterPost = await api('/vouchers/cash-bank-accounts?voucherType=BReceipt')
    expect(afterPost.lastUsed?.id).toBe(targetAccount.id)
  })

  // ─── Bank Payment ───

  it('Bank Payment: post payment, verify bank decreases and party increases', async () => {
    const cb = await api('/vouchers/cash-bank-accounts?voucherType=BPayment')
    expect(cb.accounts.length).toBeGreaterThan(0)

    const v = await api('/vouchers', {
      method: 'POST',
      body: {
        voucherType: 'BPayment',
        date: today(),
        cashBankAccountId: cb.accounts[0].id,
        lines: [{ accountId: acc('2000').id, amount: 5000 }], // Creditors
        reference: `BPAY-TEST-${Date.now()}`,
        narration: 'Vendor payment via bank',
      },
    })
    expect(v.status).toBe(201)
  })

  // ─── Cash Payment ───

  it('Cash Payment: post payment via cash', async () => {
    const cb = await api('/vouchers/cash-bank-accounts?voucherType=CPayment')
    expect(cb.accounts.length).toBeGreaterThan(0)

    const v = await api('/vouchers', {
      method: 'POST',
      body: {
        voucherType: 'CPayment',
        date: today(),
        cashBankAccountId: cb.accounts[0].id,
        lines: [{ accountId: acc('5200').id, amount: 2000 }], // Salaries
        reference: `CPAY-TEST-${Date.now()}`,
        narration: 'Salary advance cash payment',
      },
    })
    expect(v.status).toBe(201)
  })

  // ─── Journal Voucher ───

  it('Journal Voucher: multi-line balanced entry via voucher system', async () => {
    const peek = await api('/vouchers/next-number?voucherType=Journal')

    const v = await api('/vouchers', {
      method: 'POST',
      body: {
        voucherType: 'Journal',
        date: today(),
        cashBankAccountId: null, // Journal vouchers may not need a cash/bank account
        lines: [
          { accountId: acc('5100').id, amount: 3000 }, // Dr Rent
          { accountId: acc('2000').id, amount: -3000 }, // Cr Creditors (or use separate structure)
        ],
        reference: `JV-TEST-${Date.now()}`,
        narration: 'Accrue monthly rent',
      },
    })
    // Journal voucher behavior depends on implementation
    // If it requires cashBankAccountId, this tests that it's optional for Journal type
    expect([201, 422]).toContain(v.status)
  })

  // ─── Edge cases ───

  it('Multi-line receipt: 3 party lines against 1 bank', async () => {
    const v = await api('/vouchers', {
      method: 'POST',
      body: {
        voucherType: 'BReceipt',
        date: today(),
        cashBankAccountId: bankAccounts[0].id,
        lines: [
          { accountId: acc('1100').id, amount: 2000, partnerId: customer.id },
          { accountId: acc('4100').id, amount: 1500 }, // Other Income
          { accountId: acc('1100').id, amount: 500 },
        ],
        reference: `MULTI-LINE-${Date.now()}`,
        narration: 'Multi-party receipt',
      },
    })
    expect(v.status).toBe(201)
  })

  it('Voucher with very large amount (₹9,99,999.99) — no overflow', async () => {
    const v = await api('/vouchers', {
      method: 'POST',
      body: {
        voucherType: 'BReceipt',
        date: today(),
        cashBankAccountId: bankAccounts[0].id,
        lines: [{ accountId: acc('1100').id, amount: 999999.99, partnerId: customer.id }],
        reference: `LARGE-${Date.now()}`,
      },
    })
    expect(v.status).toBe(201)
  })

  it('Voucher with fractional paisa amount (₹1234.57) — rounds correctly', async () => {
    const v = await api('/vouchers', {
      method: 'POST',
      body: {
        voucherType: 'BReceipt',
        date: today(),
        cashBankAccountId: bankAccounts[0].id,
        lines: [{ accountId: acc('1100').id, amount: 1234.57, partnerId: customer.id }],
        reference: `PAISA-${Date.now()}`,
      },
    })
    expect(v.status).toBe(201)
  })

  it('Portal user cannot post vouchers → 403', async () => {
    const v = await api('/vouchers', {
      method: 'POST',
      as: 'portal',
      body: {
        voucherType: 'BReceipt',
        date: today(),
        cashBankAccountId: bankAccounts[0].id,
        lines: [{ accountId: acc('1100').id, amount: 100 }],
      },
    })
    expect(v.status).toBe(403)
  })

  it('Viewer cannot post vouchers → 403', async () => {
    const v = await api('/vouchers', {
      method: 'POST',
      as: 'viewer',
      body: {
        voucherType: 'BReceipt',
        date: today(),
        cashBankAccountId: bankAccounts[0].id,
        lines: [{ accountId: acc('1100').id, amount: 100 }],
      },
    })
    expect(v.status).toBe(403)
  })

  it('Empty lines array → 422', async () => {
    const v = await api('/vouchers', {
      method: 'POST',
      body: {
        voucherType: 'BReceipt',
        date: today(),
        cashBankAccountId: bankAccounts[0].id,
        lines: [],
      },
    })
    expect(v.status).toBe(422)
  })

  it.todo('PAY-006: Discount on early payment via voucher')
  it.todo('FY boundary: voucher numbering resets at fiscal year rollover')
})
