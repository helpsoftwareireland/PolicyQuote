import { generateFactorCases, type GeneratedCase } from '../src/kb/kb-case-generator';
import { getKnowledgeBase, resetKnowledgeBaseCache } from '../src/kb/kb.loader';
import type { KnowledgeBase, RiskFactor } from '../src/kb/kb.types';
import { priceQuote } from '../src/quote/quote.service';
import { baseInput, buildKb } from './fixtures/kb.fixture';

/**
 * Review item G3: tests generated FROM the Knowledge Base.
 * Every factor in the real kb/risk-kb.json gets boundary cases derived from its condition data —
 * a factor added in the live demo is covered here automatically, with no new test code.
 */
const neutral = baseInput();

/** Price the case's input and return the points this factor contributed (0 if not applied). */
const pointsFor = (kb: KnowledgeBase, c: GeneratedCase): number =>
  priceQuote(c.input, kb).appliedFactors.find((f) => f.id === c.factorId)?.points ?? 0;

resetKnowledgeBaseCache();
const realKb = getKnowledgeBase();

describe(`generated from the real KB (v${realKb.version})`, () => {
  describe.each(realKb.factors.map((f) => [f.id, f] as const))('%s', (_id, factor) => {
    const { cases } = generateFactorCases(factor, neutral);

    it('can be triggered by a valid request, and avoided by one', () => {
      expect(cases.some((c) => c.kind === 'hit')).toBe(true);
      expect(cases.some((c) => c.kind === 'miss')).toBe(true);
    });

    it.each(cases.map((c) => [c.kind, c.label, c] as const))('%s: %s', (_kind, _label, c) => {
      expect(pointsFor(realKb, c)).toBe(c.expectedPoints);
    });
  });
});

describe('generator behaviour', () => {
  const factor = (condition: RiskFactor['condition'], extra: Partial<RiskFactor> = {}): RiskFactor => ({
    id: 'probe',
    description: 'probe',
    points: 10,
    condition,
    ...extra,
  });
  const labels = (f: RiskFactor, kind: GeneratedCase['kind']) =>
    generateFactorCases(f, neutral)
      .cases.filter((c) => c.kind === kind)
      .map((c) => c.label);

  it('derives just-inside / just-outside values for numeric thresholds', () => {
    expect(labels(factor({ field: 'propertyValue', operator: 'gt', value: 750000 }), 'hit')).toEqual(['propertyValue=750001']);
    expect(labels(factor({ field: 'propertyValue', operator: 'gt', value: 750000 }), 'miss')).toEqual(['propertyValue=750000']);
    expect(labels(factor({ field: 'age', operator: 'outside_range', min: 25, max: 75 }), 'hit')).toEqual(['age=24', 'age=76']);
    expect(labels(factor({ field: 'age', operator: 'outside_range', min: 25, max: 75 }), 'miss')).toEqual(['age=25', 'age=75']);
  });

  it('derives one hit per prefix and a non-matching miss for starts_with', () => {
    const flood = factor({ field: 'postcode', operator: 'starts_with', value: ['EX', 'PL'] });
    expect(labels(flood, 'hit')).toEqual(['postcode=EX1 1AA', 'postcode=PL1 1AA']);
    expect(labels(flood, 'miss')).toEqual(['postcode=ZZ9 9ZZ']);
  });

  it('AND: one all-true hit, and one miss per child that is made false', () => {
    const flatOver500k = factor({
      all: [
        { field: 'propertyType', operator: 'eq', value: 'Flat' },
        { field: 'propertyValue', operator: 'gt', value: 500000 },
      ],
    });
    expect(labels(flatOver500k, 'hit')).toEqual(['propertyType=Flat, propertyValue=500001']);
    expect(labels(flatOver500k, 'miss')).toEqual(['propertyValue=500001, propertyType=House', 'propertyType=Flat, propertyValue=500000']);
  });

  it('OR: one hit per child made true (others false), and one all-false miss', () => {
    const seniorOrClaims = factor({
      any: [
        { field: 'age', operator: 'gt', value: 70 },
        { field: 'previousClaims', operator: 'gte', value: 2 },
      ],
    });
    expect(labels(seniorOrClaims, 'hit')).toEqual(['previousClaims=1, age=71', 'age=70, previousClaims=2']);
    expect(labels(seniorOrClaims, 'miss')).toEqual(['age=70, previousClaims=1']);
  });

  it('multiplies expected points for perOccurrence factors', () => {
    const claims = factor({ field: 'previousClaims', operator: 'between', min: 1, max: 2 }, { points: 15, perOccurrence: true });
    expect(generateFactorCases(claims, neutral).cases.map((c) => c.expectedPoints)).toEqual([15, 30, 0, 0]);
  });

  it('flags probes no valid request can reach — a factor that can never apply is detectable', () => {
    // "age < 18" can never fire: the request schema rejects under-18s.
    const minors = generateFactorCases(factor({ field: 'age', operator: 'lt', value: 18 }), neutral);
    expect(minors.cases.filter((c) => c.kind === 'hit')).toEqual([]);
    expect(minors.unreachable).toEqual([
      { factorId: 'probe', kind: 'hit', label: 'age=17', reason: 'age: Minimum age is 18' },
    ]);
    // A typo'd enum value in an eq condition is caught the same way.
    const castle = generateFactorCases(factor({ field: 'propertyType', operator: 'eq', value: 'Castle' }), neutral);
    expect(castle.unreachable.map((u) => u.label)).toEqual(['propertyType=Castle']);
  });

  it('covers every operator, and the cases agree with the engine', () => {
    const kb = buildKb({
      factors: [
        { id: 'f_eq', description: 'x', points: 1, condition: { field: 'propertyType', operator: 'eq', value: 'Bungalow' } },
        { id: 'f_neq', description: 'x', points: 1, condition: { field: 'propertyType', operator: 'neq', value: 'House' } },
        { id: 'f_lt', description: 'x', points: 1, condition: { field: 'age', operator: 'lt', value: 30 } },
        { id: 'f_lte', description: 'x', points: 1, condition: { field: 'age', operator: 'lte', value: 30 } },
        { id: 'f_in', description: 'x', points: 1, condition: { field: 'postcode', operator: 'in', values: ['M1 1AE', 'B33 8TH'] } },
        { id: 'f_in_num', description: 'x', points: 1, condition: { field: 'previousClaims', operator: 'in', values: [4, 5] } },
      ],
    });
    const all = kb.factors.flatMap((f) => generateFactorCases(f, neutral).cases);
    expect(all.length).toBeGreaterThanOrEqual(12);
    for (const c of all) {
      expect({ case: `${c.factorId} ${c.kind} ${c.label}`, points: pointsFor(kb, c) }).toEqual({
        case: `${c.factorId} ${c.kind} ${c.label}`,
        points: c.expectedPoints,
      });
    }
  });
});
