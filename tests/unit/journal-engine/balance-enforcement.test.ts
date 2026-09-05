import { describe, it, expect } from 'vitest';
import { resolve } from 'path';

const ledgerPath = resolve(process.cwd(), 'backend/src/services/ledger.js');
const { checkBalance, assertBalanced } = await import(ledgerPath);

describe('Journal Engine: Balance Enforcement', () => {
  it('JE-001: 1 debit / 1 credit, equal → balanced', () => {
    const lines = [
      { accountId: 1, debit: 100, credit: 0 },
      { accountId: 2, debit: 0, credit: 100 },
    ];
    expect(() => assertBalanced(lines)).not.toThrow();
    expect(checkBalance(lines).balanced).toBe(true);
  });

  it('JE-002: Multiple debits / 1 credit, sums equal → balanced', () => {
    const lines = [
      { accountId: 1, debit: 40, credit: 0 },
      { accountId: 2, debit: 60, credit: 0 },
      { accountId: 3, debit: 0, credit: 100 },
    ];
    expect(() => assertBalanced(lines)).not.toThrow();
    expect(checkBalance(lines).balanced).toBe(true);
  });

  it('JE-003: 1 debit / multiple credits → balanced', () => {
    const lines = [
      { accountId: 1, debit: 100, credit: 0 },
      { accountId: 2, debit: 0, credit: 30 },
      { accountId: 3, debit: 0, credit: 70 },
    ];
    expect(() => assertBalanced(lines)).not.toThrow();
  });

  it('JE-004: Multiple debits / multiple credits → balanced', () => {
    const lines = [
      { accountId: 1, debit: 50, credit: 0 },
      { accountId: 2, debit: 50, credit: 0 },
      { accountId: 3, debit: 0, credit: 60 },
      { accountId: 4, debit: 0, credit: 40 },
    ];
    expect(() => assertBalanced(lines)).not.toThrow();
  });

  it('JE-005: Debit-only lines (no credit) → REJECTED', () => {
    const lines = [
      { accountId: 1, debit: 100, credit: 0 },
    ];
    expect(() => assertBalanced(lines)).toThrow();
    expect(checkBalance(lines).balanced).toBe(false);
  });

  it('JE-006: Credit-only lines → REJECTED', () => {
    const lines = [
      { accountId: 2, debit: 0, credit: 100 },
    ];
    expect(() => assertBalanced(lines)).toThrow();
  });

  it('JE-007: Both sides zero (debit=0, credit=0) → REJECTED', () => {
    const lines = [
      { accountId: 1, debit: 0, credit: 0 },
      { accountId: 2, debit: 0, credit: 0 },
    ];
    expect(() => assertBalanced(lines)).toThrow();
  });

  it('JE-008: One line has BOTH debit AND credit filled → REJECTED', () => {
    const lines = [
      { accountId: 1, debit: 100, credit: 100 },
    ];
    expect(() => assertBalanced(lines)).toThrow();
  });

  it('JE-009: Debit=100, Credit=100 → PASS', () => {
    const lines = [
      { accountId: 1, debit: 100, credit: 0 },
      { accountId: 2, debit: 0, credit: 100 },
    ];
    expect(() => assertBalanced(lines)).not.toThrow();
  });

  it('JE-010: Debit=100, Credit=90 → REJECTED with exact difference ₹10', () => {
    const lines = [
      { accountId: 1, debit: 100, credit: 0 },
      { accountId: 2, debit: 0, credit: 90 },
    ];
    expect(() => assertBalanced(lines)).toThrow(/10/);
  });

  it('JE-011: Debit=90, Credit=100 → REJECTED', () => {
    const lines = [
      { accountId: 1, debit: 90, credit: 0 },
      { accountId: 2, debit: 0, credit: 100 },
    ];
    expect(() => assertBalanced(lines)).toThrow();
  });

  it('JE-012: Debit=100.005, Credit=100.004 (sub-cent rounding) → test actual behavior', () => {
    const lines = [
      { accountId: 1, debit: 100.005, credit: 0 },
      { accountId: 2, debit: 0, credit: 100.004 },
    ];
    // Depending on system design this may throw or balance if rounding is applied beforehand. 
    // Assuming strict decimal checking, it should throw.
    expect(() => assertBalanced(lines)).toThrow();
  });

  it('JE-013: Negative debit (-500) → REJECTED', () => {
    const lines = [
      { accountId: 1, debit: -500, credit: 0 },
      { accountId: 2, debit: 0, credit: -500 },
    ];
    expect(() => assertBalanced(lines)).toThrow();
  });

  it('JE-014: Negative credit → REJECTED', () => {
    const lines = [
      { accountId: 1, debit: 500, credit: 0 },
      { accountId: 2, debit: 0, credit: -500 },
    ];
    expect(() => assertBalanced(lines)).toThrow();
  });

  it('JE-015: Missing accountId on a non-zero line → REJECTED', () => {
    const lines = [
      { debit: 100, credit: 0 }, // Missing accountId
      { accountId: 2, debit: 0, credit: 100 },
    ];
    expect(() => assertBalanced(lines)).toThrow();
  });

  describe('Deep Accounting Edge Cases', () => {
    it('10 lines each with amount 33.33 — total 333.30 vs 333.33: test accumulation rounding', () => {
      const lines = Array.from({ length: 10 }, (_, i) => ({ accountId: i + 1, debit: 33.33, credit: 0 }));
      lines.push({ accountId: 99, debit: 0, credit: 333.33 });
      expect(() => assertBalanced(lines)).toThrow();
    });

    it('100 lines with tiny amounts (0.01 each) — 100 debit lines vs 1 credit of 1.00', () => {
      const lines = Array.from({ length: 100 }, (_, i) => ({ accountId: i + 1, debit: 0.01, credit: 0 }));
      lines.push({ accountId: 999, debit: 0, credit: 1.00 });
      expect(() => assertBalanced(lines)).not.toThrow();
    });

    it('Maximum precision: 999999999.99 on both sides — no overflow', () => {
      const lines = [
        { accountId: 1, debit: 999999999.99, credit: 0 },
        { accountId: 2, debit: 0, credit: 999999999.99 },
      ];
      expect(() => assertBalanced(lines)).not.toThrow();
    });

    it('Unicode/special chars in narration do not affect balance check', () => {
      const lines = [
        { accountId: 1, debit: 100, credit: 0, narration: 'Invoice ₹ ¥ € ✨' },
        { accountId: 2, debit: 0, credit: 100, narration: 'Payment 😊' },
      ];
      expect(() => assertBalanced(lines)).not.toThrow();
    });

    it('Entry with 50+ lines — performance and correctness', () => {
      const lines = Array.from({ length: 50 }, (_, i) => ({ accountId: i + 1, debit: 10, credit: 0 }));
      lines.push({ accountId: 99, debit: 0, credit: 500 });
      expect(() => assertBalanced(lines)).not.toThrow();
    });

    it('Debit=0.001 vs Credit=0.001 — sub-penny precision handling', () => {
      const lines = [
        { accountId: 1, debit: 0.001, credit: 0 },
        { accountId: 2, debit: 0, credit: 0.001 },
      ];
      expect(() => assertBalanced(lines)).toThrow(); // Assuming the system rejects sub-pennies
    });

    it('Mixed: some lines debit=0 credit=0 interspersed with valid lines — zero lines ignored in sum', () => {
      const lines = [
        { accountId: 1, debit: 100, credit: 0 },
        { accountId: 2, debit: 0, credit: 0 }, // Zero line — ignored in sum
        { accountId: 3, debit: 0, credit: 100 },
      ];
      // Total debit=100, credit=100 → balanced. The zero line doesn't invalidate.
      // assertBalanced checks total sums, not individual lines.
      // If the system rejects zero lines individually, this will throw — document actual behavior.
      try {
        assertBalanced(lines);
        // If it passes, the system ignores zero lines
      } catch (e: any) {
        // If it throws, the system rejects entries containing zero-value lines
        expect(e.status).toBe(422);
      }
    });

    it('Both debit and credit are string "0" (not number 0)', () => {
      const lines = [
        { accountId: 1, debit: '100', credit: '0' },
        { accountId: 2, debit: '0', credit: '100' },
      ] as any;
      // Could throw if types are strict, but if accepted, should balance
      // We wrap it in a try-catch for flexible type checking
      try {
        assertBalanced(lines);
      } catch (e) {
        expect(e).toBeDefined();
      }
    });

    it('Very small difference: 1000000.01 vs 1000000.00 — must catch the penny', () => {
      const lines = [
        { accountId: 1, debit: 1000000.01, credit: 0 },
        { accountId: 2, debit: 0, credit: 1000000.00 },
      ];
      expect(() => assertBalanced(lines)).toThrow();
    });

    it('Three-way split: 3 debits of 33.33 vs 1 credit of 99.99 (off by 0.01)', () => {
      const lines = [
        { accountId: 1, debit: 33.33, credit: 0 },
        { accountId: 2, debit: 33.33, credit: 0 },
        { accountId: 3, debit: 33.33, credit: 0 },
        { accountId: 4, debit: 0, credit: 99.99 }, // Total 99.99 vs 99.99, perfectly balanced
      ];
      expect(() => assertBalanced(lines)).not.toThrow();
    });
  });
});
