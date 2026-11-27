import { KnowledgeBaseError } from '../src/errors';
import { parseKnowledgeBase } from '../src/kb/kb.loader';
import { buildKb, rawKb } from './fixtures/kb.fixture';

/** Run the validator and return the issue list ("path: message"), or [] if valid. */
function issuesFor(mutate: (kb: Record<string, unknown>) => void): string[] {
  const kb = rawKb();
  mutate(kb);
  try {
    parseKnowledgeBase(kb);
    return [];
  } catch (err) {
    if (!(err instanceof KnowledgeBaseError)) throw err;
    return err.issues.map((i) => `${i.path}: ${i.message}`);
  }
}

type Json = Record<string, unknown>;
const factors = (kb: Json) => kb.factors as Json[];
const bands = (kb: Json) => kb.riskBands as Record<string, Json>;

describe('KB schema validation (KB-07)', () => {
  it('accepts the brief-shaped KB and returns a deeply frozen object', () => {
    const kb = buildKb();
    expect(kb.factors).toHaveLength(5);
    expect(Object.isFrozen(kb)).toBe(true);
    expect(Object.isFrozen(kb.factors[0]?.condition)).toBe(true);
  });

  it('accepts the real kb/risk-kb.json shape including compound conditions', () => {
    expect(() =>
      buildKb({
        factors: [
          {
            id: 'flat_high_value',
            description: 'Flat over £500k',
            condition: { all: [{ field: 'propertyType', operator: 'eq', value: 'Flat' }, { any: [{ field: 'propertyValue', operator: 'gt', value: 500000 }] }] },
            points: 35,
          },
        ],
      }),
    ).not.toThrow();
  });

  describe('structural errors point at the exact path', () => {
    it.each<[string, (kb: Json) => void, string]>([
      ['missing max on between', (kb) => delete factors(kb)[1]!.condition, 'factors[1].condition'],
      [
        'between without max',
        (kb) => (factors(kb)[1]!.condition = { field: 'previousClaims', operator: 'between', min: 1 }),
        'factors[1].condition.max',
      ],
      ['unknown operator', (kb) => (factors(kb)[0]!.condition = { field: 'age', operator: 'approx', value: 1 }), 'factors[0].condition'],
      ['unknown field', (kb) => (factors(kb)[0]!.condition = { field: 'income', operator: 'gt', value: 1 }), 'factors[0].condition.field'],
      ['typo in optional key (strict)', (kb) => (factors(kb)[1]!.perOccurence = true), 'factors[1]'],
      ['non-integer points', (kb) => (factors(kb)[0]!.points = 1.5), 'factors[0].points'],
      ['negative base premium', (kb) => (kb.basePremium = -1), 'basePremium'],
      ['bad semver', (kb) => (kb.version = 'v1'), 'version'],
      ['empty all[]', (kb) => (factors(kb)[0]!.condition = { all: [] }), 'factors[0].condition.all'],
      [
        'bad leaf nested inside all[]',
        (kb) => (factors(kb)[0]!.condition = { all: [{ field: 'age', operator: 'gt', value: 'old' }] }),
        'factors[0].condition.all[0].value',
      ],
    ])('%s', (_name, mutate, expectedPath) => {
      const issues = issuesFor(mutate);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.startsWith(expectedPath))).toBe(true);
    });
  });

  describe('semantic errors', () => {
    it.each<[string, (kb: Json) => void, RegExp]>([
      ['duplicate factor ids', (kb) => (factors(kb)[1]!.id = 'age_young_elderly'), /factors\[1\]\.id: Duplicate factor id/],
      [
        'numeric operator on a string field',
        (kb) => (factors(kb)[3]!.condition = { field: 'propertyType', operator: 'gt', value: 1 }),
        /needs a number field, but "propertyType" is a string/,
      ],
      [
        'starts_with on a numeric field',
        (kb) => (factors(kb)[0]!.condition = { field: 'age', operator: 'starts_with', value: '2' }),
        /needs a string field, but "age" is a number/,
      ],
      [
        'eq value type does not match field type',
        (kb) => (factors(kb)[0]!.condition = { field: 'age', operator: 'eq', value: '40' }),
        /value must be a number/,
      ],
      [
        'in values type does not match field type',
        (kb) => (factors(kb)[0]!.condition = { field: 'propertyType', operator: 'in', values: ['Flat', 3] }),
        /values must all be strings/,
      ],
      [
        'range min > max',
        (kb) => (factors(kb)[0]!.condition = { field: 'age', operator: 'between', min: 80, max: 20 }),
        /min must be <= max/,
      ],
      [
        'perOccurrence on a string field',
        (kb) => (factors(kb)[3]!.perOccurrence = true),
        /perOccurrence needs a numeric field/,
      ],
      [
        'perOccurrence on compound condition without occurrenceField',
        (kb) => {
          factors(kb)[1]!.condition = { all: [{ field: 'previousClaims', operator: 'gte', value: 1 }] };
        },
        /requires "occurrenceField"/,
      ],
      ['unsupported schemaVersion', (kb) => (kb.schemaVersion = 2), /Unsupported schemaVersion 2/],
      ['no bands', (kb) => (kb.riskBands = {}), /At least one risk band/],
      ['lowest band not starting at 0', (kb) => (bands(kb).STANDARD!.min = 5), /lowest band must start at 0/],
      ['gap between bands', (kb) => (bands(kb).ELEVATED!.min = 27), /must be contiguous \(expected min 26\)/],
      ['band max < min', (kb) => (bands(kb).ELEVATED!.max = 20), /ELEVATED has max < min/],
      ['top band not open-ended', (kb) => (bands(kb).HIGH_RISK!.max = 999), /highest band must be open-ended/],
      ['open-ended band that is not the highest', (kb) => (bands(kb).ELEVATED!.max = null), /open-ended but is not the highest/],
    ])('%s', (_name, mutate, expected) => {
      expect(issuesFor(mutate).join('\n')).toMatch(expected);
    });
  });
});
