import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'path';

let D: any, money: any, qty: any, cost: any;

describe('Journal Engine Calculations', () => {
  beforeAll(async () => {
    const moneyLib = await import(resolve(process.cwd(), 'backend/src/lib/money.js'));
    D = moneyLib.D;
    money = moneyLib.money;
    qty = moneyLib.qty;
    cost = moneyLib.cost;
  });

  it('CALC-005: Multi-line SO with 5 lines, per-line tax vs total tax', () => {
    const lineAmount = D('10.33');
    const numLines = 5;
    const taxRate = D('0.18');
    
    let totalPerLineTax = D('0');
    for (let i = 0; i < numLines; i++) {
      totalPerLineTax = totalPerLineTax.plus(money(lineAmount.times(taxRate)));
    }
    
    const totalAmount = lineAmount.times(numLines);
    const totalTax = money(totalAmount.times(taxRate));
    
    const diff = totalPerLineTax.minus(totalTax).abs();
    expect(diff.toNumber()).toBeLessThanOrEqual(numLines * 0.01);
  });

  it('CALC-006: Payment allocation: ₹39,000 invoice, pay ₹15k → residual 24k, pay ₹24k → residual 0', () => {
    const invoiceTotal = D('39000');
    
    let payment1 = D('15000');
    let residual1 = money(invoiceTotal.minus(payment1));
    expect(residual1.toNumber()).toBe(24000);
    
    let payment2 = D('24000');
    let residual2 = money(residual1.minus(payment2));
    expect(residual2.toNumber()).toBe(0);
  });

  it('CALC-007: Budget variance = Budget - Actual, verify sign convention (positive = under budget)', () => {
    const budget = D('10000');
    const actual = D('8500');
    const variance = money(budget.minus(actual));
    
    expect(variance.toNumber()).toBe(1500);
    expect(variance.toNumber()).toBeGreaterThan(0);
    
    const actualOver = D('12000');
    const varianceOver = money(budget.minus(actualOver));
    expect(varianceOver.toNumber()).toBe(-2000);
  });

  it('CALC-008: Cumulative rounding: sum of money(D(i + \'.99\').times(0.18)) for i=1..50', () => {
    let sum = D('0');
    for (let i = 1; i <= 50; i++) {
      const val = D(i + '.99').times(0.18);
      sum = sum.plus(money(val));
    }
    
    let rawSum = D('0');
    for (let i = 1; i <= 50; i++) {
      rawSum = rawSum.plus(D(i + '.99').times(0.18));
    }
    
    const roundedRawSum = money(rawSum);
    const diff = sum.minus(roundedRawSum).abs();
    expect(diff.toNumber()).toBeLessThanOrEqual(50 * 0.01);
  });
});
