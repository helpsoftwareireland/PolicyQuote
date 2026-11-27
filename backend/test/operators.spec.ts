import { applyOperator, OPERATORS } from '../src/engine/operators';
import type { LeafCondition, Operator } from '../src/kb/kb.types';

describe('operator registry (KB-04)', () => {
  it('registers exactly the documented operators', () => {
    const expected: Operator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'outside_range', 'in', 'starts_with'];
    expect(Object.keys(OPERATORS).sort()).toEqual([...expected].sort());
  });

  it('is immutable at runtime', () => {
    expect(Object.isFrozen(OPERATORS)).toBe(true);
  });

  type Case = [description: string, condition: LeafCondition, actual: string | number, expected: boolean];

  const cases: Case[] = [
    ['eq matches strings case-insensitively', { field: 'propertyType', operator: 'eq', value: 'Flat' }, 'flat', true],
    ['eq rejects different strings', { field: 'propertyType', operator: 'eq', value: 'Flat' }, 'House', false],
    ['eq matches numbers', { field: 'age', operator: 'eq', value: 40 }, 40, true],
    ['eq does not coerce number to string', { field: 'age', operator: 'eq', value: '40' }, 40, false],
    ['neq true for different value', { field: 'propertyType', operator: 'neq', value: 'Flat' }, 'House', true],
    ['neq false for same value', { field: 'propertyType', operator: 'neq', value: 'Flat' }, 'FLAT', false],
    ['gt strict above', { field: 'propertyValue', operator: 'gt', value: 750000 }, 750001, true],
    ['gt false at boundary', { field: 'propertyValue', operator: 'gt', value: 750000 }, 750000, false],
    ['gte true at boundary', { field: 'previousClaims', operator: 'gte', value: 3 }, 3, true],
    ['gte false below', { field: 'previousClaims', operator: 'gte', value: 3 }, 2, false],
    ['lt strict below', { field: 'age', operator: 'lt', value: 25 }, 24, true],
    ['lt false at boundary', { field: 'age', operator: 'lt', value: 25 }, 25, false],
    ['lte true at boundary', { field: 'age', operator: 'lte', value: 25 }, 25, true],
    ['lte false above', { field: 'age', operator: 'lte', value: 25 }, 26, false],
    ['between inclusive min', { field: 'previousClaims', operator: 'between', min: 1, max: 2 }, 1, true],
    ['between inclusive max', { field: 'previousClaims', operator: 'between', min: 1, max: 2 }, 2, true],
    ['between false outside', { field: 'previousClaims', operator: 'between', min: 1, max: 2 }, 3, false],
    ['outside_range below', { field: 'age', operator: 'outside_range', min: 25, max: 75 }, 24, true],
    ['outside_range above', { field: 'age', operator: 'outside_range', min: 25, max: 75 }, 76, true],
    ['outside_range false at min edge', { field: 'age', operator: 'outside_range', min: 25, max: 75 }, 25, false],
    ['outside_range false at max edge', { field: 'age', operator: 'outside_range', min: 25, max: 75 }, 75, false],
    ['in matches a member', { field: 'propertyType', operator: 'in', values: ['Flat', 'Bungalow'] }, 'bungalow', true],
    ['in rejects a non-member', { field: 'propertyType', operator: 'in', values: ['Flat', 'Bungalow'] }, 'House', false],
    ['in matches numbers', { field: 'previousClaims', operator: 'in', values: [4, 5] }, 5, true],
    ['starts_with single prefix', { field: 'postcode', operator: 'starts_with', value: 'EX' }, 'EX1 1AA', true],
    ['starts_with is case-insensitive', { field: 'postcode', operator: 'starts_with', value: 'ex' }, 'EX1 1AA', true],
    ['starts_with any-of list', { field: 'postcode', operator: 'starts_with', value: ['EX', 'PL'] }, 'PL4 8AA', true],
    ['starts_with rejects other prefix', { field: 'postcode', operator: 'starts_with', value: ['EX', 'PL'] }, 'SW1A 1AA', false],
  ];

  it.each(cases)('%s', (_description, condition, actual, expected) => {
    expect(applyOperator(condition, actual)).toBe(expected);
  });

  describe('type safety: numeric/string operators never match the wrong type', () => {
    it.each<LeafCondition>([
      { field: 'age', operator: 'gt', value: 1 },
      { field: 'age', operator: 'gte', value: 1 },
      { field: 'age', operator: 'lt', value: 100 },
      { field: 'age', operator: 'lte', value: 100 },
      { field: 'age', operator: 'between', min: 0, max: 100 },
      { field: 'age', operator: 'outside_range', min: 50, max: 60 },
    ])('%o is false for a string value', (condition) => {
      expect(applyOperator(condition, '40')).toBe(false);
    });

    it('starts_with is false for a number', () => {
      expect(applyOperator({ field: 'postcode', operator: 'starts_with', value: '4' }, 40)).toBe(false);
    });
  });
});
