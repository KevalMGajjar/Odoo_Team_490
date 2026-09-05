import { describe, it, expect } from 'vitest'
import { resolve } from 'path'
import { withRollback, getMoneyHelpers } from '../../helpers/db'

const ledgerPath = resolve(process.cwd(), 'backend/src/services/ledger.js')
const { postEntry, reverseEntry, assertMutable, checkBalance, assertBalanced } = await import(ledgerPath)
const { D, money } = await import(resolve(process.cwd(), 'backend/src/lib/money.js'))

describe('Journal Posting Engine', () => {
  it('JE-016: Same account twice in one entry', async () => {
    await withRollback(async (tx) => {
      const journal = await tx.journal.create({
        data: { name: 'General', code: 'GEN1', type: 'general' }
      });
      const acct1 = await tx.account.create({
        data: { name: 'Expense', code: 'E16', type: 'expense' }
      });
      const acct2 = await tx.account.create({
        data: { name: 'Bank', code: 'B16', type: 'asset' }
      });
      
      const entry = await postEntry(tx, {
        journalId: journal.id,
        kind: 'general',
        date: new Date(),
        reference: 'JE-016',
        narration: 'Same account twice',
        items: [
          { accountId: acct1.id, debit: 100, credit: 0 },
          { accountId: acct1.id, debit: 50, credit: 0 },
          { accountId: acct2.id, debit: 0, credit: 150 }
        ],
        userId: 'system'
      });
      
      expect(entry.items.length).toBe(3);
    });
  });

  it('JE-017: Very large amount (₹999,999,999.99)', () => {
    const items = [
      { accountId: 1, debit: 999999999.99, credit: 0 },
      { accountId: 2, debit: 0, credit: 999999999.99 }
    ];
    expect(() => assertBalanced(items)).not.toThrow();
  });

  it('JE-018: Decimal amounts to 2 places, multi-line', () => {
    const items = [
      { accountId: 1, debit: 33.33, credit: 0 },
      { accountId: 1, debit: 33.33, credit: 0 },
      { accountId: 1, debit: 33.33, credit: 0 },
      { accountId: 1, debit: 33.33, credit: 0 },
      { accountId: 1, debit: 33.33, credit: 0 },
      { accountId: 2, debit: 0, credit: 166.65 }
    ];
    expect(() => assertBalanced(items)).not.toThrow();
  });

  it.todo('JE-019: Auto-generated entry from Customer Invoice matches totals');

  it.todo('JE-020: Auto-generated entry from Vendor Bill matches totals');

  it('Posting to archived journal → 409', async () => {
    await withRollback(async (tx) => {
      const journal = await tx.journal.create({
        data: { name: 'Archived Jnl', code: 'ARCH', type: 'general', status: 'archived' }
      });
      const acct1 = await tx.account.create({
        data: { name: 'Expense', code: 'E1', type: 'expense' }
      });
      const acct2 = await tx.account.create({
        data: { name: 'Bank', code: 'B1', type: 'asset' }
      });
      
      await expect(postEntry(tx, {
        journalId: journal.id,
        kind: 'general',
        date: new Date(),
        reference: 'Archived Test',
        narration: 'test',
        items: [
          { accountId: acct1.id, debit: 100, credit: 0 },
          { accountId: acct2.id, debit: 0, credit: 100 }
        ],
        userId: 'system'
      })).rejects.toThrow();
    });
  });

  it('Reversal creates mirror-image lines (debit↔credit)', async () => {
    await withRollback(async (tx) => {
      const journal = await tx.journal.create({
        data: { name: 'Gen', code: 'G', type: 'general' }
      });
      const acct1 = await tx.account.create({
        data: { name: 'Expense', code: 'E2', type: 'expense' }
      });
      const acct2 = await tx.account.create({
        data: { name: 'Bank', code: 'B2', type: 'asset' }
      });
      
      const entry = await postEntry(tx, {
        journalId: journal.id,
        kind: 'general',
        date: new Date(),
        reference: 'Rev1',
        narration: 'To be reversed',
        items: [
          { accountId: acct1.id, debit: 5000, credit: 0 },
          { accountId: acct2.id, debit: 0, credit: 5000 }
        ],
        userId: 'system'
      });
      
      const reversal = await reverseEntry(tx, entry.id, 'system');
      
      expect(reversal.kind).toBe('reversal');
      expect(reversal.items.length).toBe(2);
      
      const reversedAcct1Line = reversal.items.find((i: any) => i.accountId === acct1.id);
      const reversedAcct2Line = reversal.items.find((i: any) => i.accountId === acct2.id);
      
      expect(Number(reversedAcct1Line.credit)).toBe(5000);
      expect(Number(reversedAcct1Line.debit)).toBe(0);
      
      expect(Number(reversedAcct2Line.debit)).toBe(5000);
      expect(Number(reversedAcct2Line.credit)).toBe(0);
    });
  });

  it('Double-reversal blocked', async () => {
    await withRollback(async (tx) => {
      const journal = await tx.journal.create({
        data: { name: 'Gen', code: 'G2', type: 'general' }
      });
      const acct1 = await tx.account.create({
        data: { name: 'Exp', code: 'E3', type: 'expense' }
      });
      const acct2 = await tx.account.create({
        data: { name: 'Bnk', code: 'B3', type: 'asset' }
      });
      
      const entry = await postEntry(tx, {
        journalId: journal.id,
        kind: 'general',
        date: new Date(),
        reference: 'Rev2',
        narration: 'To be double reversed',
        items: [
          { accountId: acct1.id, debit: 100, credit: 0 },
          { accountId: acct2.id, debit: 0, credit: 100 }
        ],
        userId: 'system'
      });
      
      await reverseEntry(tx, entry.id, 'system');
      await expect(reverseEntry(tx, entry.id, 'system')).rejects.toThrow();
    });
  });

  it('assertMutable blocks editing posted entries', async () => {
    await withRollback(async (tx) => {
      const journal = await tx.journal.create({
        data: { name: 'Gen', code: 'G3', type: 'general' }
      });
      const acct1 = await tx.account.create({
        data: { name: 'Exp', code: 'E4', type: 'expense' }
      });
      const acct2 = await tx.account.create({
        data: { name: 'Bnk', code: 'B4', type: 'asset' }
      });
      
      const entry = await postEntry(tx, {
        journalId: journal.id,
        kind: 'general',
        date: new Date(),
        reference: 'Mut',
        narration: 'Mut test',
        items: [
          { accountId: acct1.id, debit: 100, credit: 0 },
          { accountId: acct2.id, debit: 0, credit: 100 }
        ],
        userId: 'system'
      });
      
      await expect(assertMutable(tx, entry.id)).rejects.toThrow();
    });
  });

  it('Entry numbering format', async () => {
    await withRollback(async (tx) => {
      const journal = await tx.journal.create({
        data: { name: 'Test Jnl', code: 'TESTJ', type: 'general' }
      });
      const acct1 = await tx.account.create({
        data: { name: 'Exp', code: 'E5', type: 'expense' }
      });
      const acct2 = await tx.account.create({
        data: { name: 'Bnk', code: 'B5', type: 'asset' }
      });
      
      const entry = await postEntry(tx, {
        journalId: journal.id,
        kind: 'general',
        date: new Date('2026-05-01'),
        reference: 'Num',
        narration: 'Num format test',
        items: [
          { accountId: acct1.id, debit: 100, credit: 0 },
          { accountId: acct2.id, debit: 0, credit: 100 }
        ],
        userId: 'system'
      });
      
      expect(entry.number).toMatch(/^TESTJ\/2026\/\d{4}$/);
    });
  });

  it('Numbering is sequential', async () => {
    await withRollback(async (tx) => {
      const journal = await tx.journal.create({
        data: { name: 'Seq Jnl', code: 'SEQJ', type: 'general' }
      });
      const acct1 = await tx.account.create({
        data: { name: 'Exp', code: 'E6', type: 'expense' }
      });
      const acct2 = await tx.account.create({
        data: { name: 'Bnk', code: 'B6', type: 'asset' }
      });
      
      const baseEntryArgs = {
        journalId: journal.id,
        kind: 'general',
        date: new Date('2026-05-01'),
        narration: 'Num format test',
        items: [
          { accountId: acct1.id, debit: 100, credit: 0 },
          { accountId: acct2.id, debit: 0, credit: 100 }
        ],
        userId: 'system'
      };
      
      const e1 = await postEntry(tx, { ...baseEntryArgs, reference: 'R1' });
      const e2 = await postEntry(tx, { ...baseEntryArgs, reference: 'R2' });
      const e3 = await postEntry(tx, { ...baseEntryArgs, reference: 'R3' });
      
      expect(e1.number).toMatch(/0001$/);
      expect(e2.number).toMatch(/0002$/);
      expect(e3.number).toMatch(/0003$/);
    });
  });

  it('Empty items array → 422', () => {
    expect(() => assertBalanced([])).toThrow();
  });

  it('Null/undefined items → 422', () => {
    expect(() => assertBalanced(null as any)).toThrow();
    expect(() => assertBalanced(undefined as any)).toThrow();
  });

  it('checkBalance returns correct structure', () => {
    const items = [
      { accountId: 1, debit: 100, credit: 0 },
      { accountId: 2, debit: 0, credit: 100 }
    ];
    const res = checkBalance(items);
    
    expect(Number(res.totalDebit)).toBe(100);
    expect(Number(res.totalCredit)).toBe(100);
    expect(Number(res.difference)).toBe(0);
    expect(res.balanced).toBe(true);
  });

  it('checkBalance with unbalanced returns balanced: false and exact difference', () => {
    const items = [
      { accountId: 1, debit: 100, credit: 0 },
      { accountId: 2, debit: 0, credit: 99 }
    ];
    const res = checkBalance(items);
    expect(res.balanced).toBe(false);
    expect(Number(res.difference)).toBe(1);
  });
});
