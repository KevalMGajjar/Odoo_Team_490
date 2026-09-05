import { describe, it, expect } from 'vitest';
import { resolve } from 'path';

const moneyPath = resolve(process.cwd(), 'backend/src/lib/money.js');
const { D, money, qty, cost } = await import(moneyPath);

/** Compare a Decimal to a numeric value, ignoring trailing-zero formatting. */
const eq = (actual: any, expected: number | string) =>
  expect(D(actual).toNumber()).toBe(D(expected).toNumber());

describe('Journal Engine: Calculations', () => {
  it('CALC-001: PO 100 × ₹1,000 = ₹100,000 — verify exact multiplication', () => {
    const q = qty('100');
    const p = cost('1000');
    const total = money(q.times(p));
    eq(total, 100000);
  });

  it('CALC-002: PO 100 × ₹333.33 = ₹33,333.00 — float rounding (NOT 33332.99999…)', () => {
    const q = qty('100');
    const p = cost('333.33');
    const total = money(q.times(p));
    eq(total, 33333);
  });

  it('CALC-003: SO Net ₹15,000, Tax 18% → Tax ₹2,700, Gross ₹17,700', () => {
    const net = D('15000');
    const taxRate = D('0.18');
    const tax = money(net.times(taxRate));
    const gross = money(net.plus(tax));
    eq(tax, 2700);
    eq(gross, 17700);
  });

  it('CALC-004: SO Net ₹10,000.33, Tax 18% → Tax ₹1,800.06 (half-up), Gross ₹11,800.39', () => {
    const net = D('10000.33');
    const taxRate = D('0.18');
    const tax = money(net.times(taxRate));     // 1800.0594 → rounds to 1800.06
    const gross = money(net.plus(tax));
    eq(tax, 1800.06);
    eq(gross, 11800.39);
  });

  describe('Deep Accounting Edge Cases', () => {
    it('Tax on ₹0.01 at 18% → rounds to ₹0.00 (not negative)', () => {
      const net = D('0.01');
      const tax = money(net.times(D('0.18')));  // 0.0018 → rounds to 0.00
      expect(tax.toNumber()).toBe(0);
      expect(tax.isNegative()).toBe(false);
    });

    it('Tax at 0% → gross equals net exactly, tax is zero', () => {
      const net = D('1500');
      const tax = money(net.times(D('0')));
      const gross = money(net.plus(tax));
      expect(tax.toNumber()).toBe(0);
      eq(gross, 1500);
    });

    it('Tax at 100% → gross is exactly double the net', () => {
      const net = D('1234.56');
      const tax = money(net.times(D('1')));
      const gross = money(net.plus(tax));
      eq(tax, 1234.56);
      eq(gross, 2469.12);
    });

    it('Tax at 28% on ₹77.77 → 21.7756 rounds to ₹21.78 (half-up)', () => {
      const net = D('77.77');
      const tax = money(net.times(D('0.28'))); // 21.7756 → 21.78
      eq(tax, 21.78);
    });

    it('₹0.005 rounding: goes to ₹0.01 (half-up) not ₹0.00', () => {
      const val = money(D('0.005'));
      eq(val, 0.01); // Decimal.ROUND_HALF_UP
    });

    it('₹0.004 rounds down to ₹0.00', () => {
      const val = money(D('0.004'));
      eq(val, 0);
    });

    it('Large multiplication: 999,999 × ₹999.99 — no overflow or precision loss', () => {
      const total = money(D('999999').times(D('999.99')));
      eq(total, 999989000.01); // 999999 × 999.99 = 999,989,000.01
    });

    it('Sum of 20 per-line taxes vs tax on the total — rounding consistency', () => {
      // 20 lines of ₹100.33 each at 18%
      const lineNet = D('100.33');
      const rate = D('0.18');
      let sumOfLineTaxes = D(0);
      for (let i = 0; i < 20; i++) {
        sumOfLineTaxes = sumOfLineTaxes.plus(money(lineNet.times(rate)));
      }
      const totalNet = lineNet.times(20);
      const taxOnTotal = money(totalNet.times(rate));

      // Per-line: money(100.33 × 0.18) = money(18.0594) = 18.06 × 20 = 361.20
      // On total: money(2006.60 × 0.18) = money(361.188) = 361.19
      // These may differ by up to ₹0.01 × numLines due to per-line rounding
      const diff = sumOfLineTaxes.minus(taxOnTotal).abs();
      expect(diff.toNumber()).toBeLessThanOrEqual(0.20); // max 1 paisa per line
    });

    it.todo('CALC-005: Multi-line SO, per-line tax vs total tax consistency check');
    it.todo('CALC-006: Payment allocation across 3 installments — running outstanding: ₹39k → ₹24k → ₹0');
    it.todo('CALC-007: Budget Variance = Budget − Actual (consistent sign convention)');
    it.todo('CALC-008: Cumulative rounding across 50 invoices summed in report vs manually');
  });
});
