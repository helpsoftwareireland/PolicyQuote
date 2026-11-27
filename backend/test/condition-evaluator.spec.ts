import { evaluateCondition } from '../src/engine/condition-evaluator';
import type { Condition } from '../src/kb/kb.types';
import { baseInput } from './fixtures/kb.fixture';

describe('evaluateCondition (KB-06, KB-08)', () => {
  const flat: Condition = { field: 'propertyType', operator: 'eq', value: 'Flat' };
  const over500k: Condition = { field: 'propertyValue', operator: 'gt', value: 500000 };
  const flatAndOver500k: Condition = { all: [flat, over500k] };
  const floodPostcode: Condition = { field: 'postcode', operator: 'starts_with', value: ['EX', 'PL'] };

  it('evaluates a leaf against the matching input field', () => {
    expect(evaluateCondition(flat, baseInput({ propertyType: 'Flat' }))).toBe(true);
    expect(evaluateCondition(flat, baseInput({ propertyType: 'House' }))).toBe(false);
  });

  describe('all (AND) — "Flat AND value > £500k"', () => {
    it.each([
      ['Flat', 600000, true],
      ['Flat', 400000, false],
      ['House', 600000, false],
      ['House', 400000, false],
    ] as const)('%s @ £%d → %s', (propertyType, propertyValue, expected) => {
      expect(evaluateCondition(flatAndOver500k, baseInput({ propertyType, propertyValue }))).toBe(expected);
    });
  });

  describe('any (OR)', () => {
    const flatOrFlood: Condition = { any: [flat, floodPostcode] };

    it.each([
      ['Flat', 'SW1A 1AA', true],
      ['House', 'EX1 1AA', true],
      ['Flat', 'PL1 1AA', true],
      ['House', 'SW1A 1AA', false],
    ] as const)('%s / %s → %s', (propertyType, postcode, expected) => {
      expect(evaluateCondition(flatOrFlood, baseInput({ propertyType, postcode }))).toBe(expected);
    });
  });

  it('supports nesting: (Flat AND >£500k) OR (flood postcode AND age > 75)', () => {
    const nested: Condition = {
      any: [flatAndOver500k, { all: [floodPostcode, { field: 'age', operator: 'gt', value: 75 }] }],
    };
    expect(evaluateCondition(nested, baseInput({ propertyType: 'Flat', propertyValue: 600000 }))).toBe(true);
    expect(evaluateCondition(nested, baseInput({ postcode: 'EX1 1AA', age: 80 }))).toBe(true);
    expect(evaluateCondition(nested, baseInput({ postcode: 'EX1 1AA', age: 50 }))).toBe(false);
  });
});
