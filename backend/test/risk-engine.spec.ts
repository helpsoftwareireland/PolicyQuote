import { buildRiskSummary, calculatePremium, resolveBand, round2, scoreRisk } from '../src/engine/risk-engine';
import { KnowledgeBaseError } from '../src/errors';
import type { KnowledgeBase } from '../src/kb/kb.types';
import { priceQuote } from '../src/quote/quote.service';
import { baseInput, buildKb } from './fixtures/kb.fixture';

describe('risk engine', () => {
  const kb: KnowledgeBase = buildKb();

  describe('all three risk bands end-to-end (NFR-06, BRD §11)', () => {
    it('STANDARD: 40-year-old, House £300k, no claims → score 0, £360/yr, £30/month', () => {
      const quote = priceQuote(baseInput(), kb);

      expect(quote.riskScore).toBe(0);
      expect(quote.riskBand).toBe('STANDARD');
      expect(quote.annualPremium).toBe(360);
      expect(quote.monthlyPremium).toBe(30);
      expect(quote.appliedFactors).toEqual([]);
      expect(quote.coverageDetails).toMatchObject({ basePremium: 300, riskMultiplier: 1, coverageLoadFactor: 1.2 });
    });

    it('ELEVATED: 2 previous claims → 2 × 15 = 30 points, £540/yr, £45/month', () => {
      const quote = priceQuote(baseInput({ age: 30, previousClaims: 2 }), kb);

      expect(quote.riskScore).toBe(30);
      expect(quote.riskBand).toBe('ELEVATED');
      expect(quote.annualPremium).toBe(540);
      expect(quote.monthlyPremium).toBe(45);
      expect(quote.appliedFactors).toEqual([
        { id: 'previous_claims_low', description: '1–2 previous claims', points: 30, occurrences: 2 },
      ]);
    });

    it('HIGH_RISK: 22-year-old, Flat £800k, 3 claims → 20 + 90 + 10 + 25 = 145, £792/yr, £66/month', () => {
      const quote = priceQuote(
        baseInput({ age: 22, propertyType: 'Flat', propertyValue: 800000, previousClaims: 3 }),
        kb,
      );

      expect(quote.riskScore).toBe(145);
      expect(quote.riskBand).toBe('HIGH_RISK');
      expect(quote.annualPremium).toBe(792);
      expect(quote.monthlyPremium).toBe(66);
      expect(quote.appliedFactors.map((f) => [f.id, f.points])).toEqual([
        ['age_young_elderly', 20],
        ['previous_claims_high', 90],
        ['property_type_flat', 10],
        ['property_value_high', 25],
      ]);
    });
  });

  describe('resolveBand boundaries', () => {
    it.each([
      [0, 'STANDARD'],
      [25, 'STANDARD'],
      [26, 'ELEVATED'],
      [60, 'ELEVATED'],
      [61, 'HIGH_RISK'],
      [100000, 'HIGH_RISK'],
    ])('score %d → %s', (score, band) => {
      expect(resolveBand(score, kb.riskBands).id).toBe(band);
    });

    it('carries the KB multiplier and label with the band', () => {
      expect(resolveBand(30, kb.riskBands)).toMatchObject({ id: 'ELEVATED', riskMultiplier: 1.5, label: 'Elevated' });
    });

    it('throws KnowledgeBaseError when a score falls in a gap between bands (BR-2)', () => {
      // Unreachable with a validated KB (contiguity is enforced); the engine still fails loudly.
      const gappy = {
        LOW: { min: 0, max: 10, riskMultiplier: 1, label: 'Low', summary: 'Low.' },
        HIGH: { min: 20, max: null, riskMultiplier: 2, label: 'High', summary: 'High.' },
      };
      expect(() => resolveBand(15, gappy)).toThrow(KnowledgeBaseError);
    });

    it("treats the highest band as open-ended even with a finite max (the brief's 999)", () => {
      const briefBands = buildKb({
        riskBands: {
          STANDARD: { min: 0, max: 25, riskMultiplier: 1.0, label: 'Standard', summary: 's' },
          ELEVATED: { min: 26, max: 60, riskMultiplier: 1.5, label: 'Elevated', summary: 'e' },
          HIGH_RISK: { min: 61, max: 999, riskMultiplier: 2.2, label: 'High risk', summary: 'h' },
        },
      }).riskBands;
      expect(resolveBand(999, briefBands).id).toBe('HIGH_RISK');
      expect(resolveBand(1500, briefBands).id).toBe('HIGH_RISK'); // e.g. 50 claims × 30 points
    });
  });

  describe('scoreRisk', () => {
    it('perOccurrence multiplies points by the field value (BR-1)', () => {
      const { score, appliedFactors } = scoreRisk(baseInput({ previousClaims: 1 }), kb.factors);
      expect(score).toBe(15);
      expect(appliedFactors[0]).toMatchObject({ id: 'previous_claims_low', points: 15, occurrences: 1 });
    });

    it('perOccurrence honours an explicit occurrenceField on a compound condition', () => {
      const compoundKb = buildKb({
        factors: [
          {
            id: 'young_with_claims',
            description: 'Under 25 with claims',
            condition: { all: [{ field: 'age', operator: 'lt', value: 25 }, { field: 'previousClaims', operator: 'gte', value: 1 }] },
            points: 5,
            perOccurrence: true,
            occurrenceField: 'previousClaims',
          },
        ],
      });
      expect(scoreRisk(baseInput({ age: 20, previousClaims: 4 }), compoundKb.factors).score).toBe(20);
    });

    it('fails loudly on an unvalidated perOccurrence factor with no numeric field', () => {
      const broken = [
        {
          id: 'broken',
          description: 'x',
          condition: { all: [{ field: 'age' as const, operator: 'gt' as const, value: 1 }] },
          points: 1,
          perOccurrence: true,
        },
      ];
      expect(() => scoreRisk(baseInput(), broken)).toThrow(KnowledgeBaseError);
    });

    it('preserves KB order in appliedFactors', () => {
      const { appliedFactors } = scoreRisk(baseInput({ age: 80, propertyType: 'Flat' }), kb.factors);
      expect(appliedFactors.map((f) => f.id)).toEqual(['age_young_elderly', 'property_type_flat']);
    });
  });

  describe('premium formula (FR-16)', () => {
    it('applies basePremium × riskMultiplier × coverageLoadFactor using KB values only', () => {
      const custom = { basePremium: 250, coverageLoadFactor: 1.1 };
      const band = { min: 0, max: null, riskMultiplier: 1.3, label: 'x', summary: 'x' };
      // 250 × 1.3 × 1.1 = 357.5 → monthly 29.79
      expect(calculatePremium(custom, band)).toEqual({ annualPremium: 357.5, monthlyPremium: 29.79 });
    });

    it('round2 removes floating point artefacts', () => {
      expect(round2(300 * 1.5 * 1.2)).toBe(540);
      expect(round2(1.005)).toBe(1.01);
      expect(round2(66.666666)).toBe(66.67);
    });
  });

  describe('buildRiskSummary', () => {
    it('uses the KB band summary and says when no factors applied', () => {
      const band = resolveBand(0, kb.riskBands);
      expect(buildRiskSummary(band, { score: 0, appliedFactors: [] })).toBe(
        'Standard risk. Your risk score is 0; no risk factors were applied.',
      );
    });

    it('lists KB descriptions with points, singular/plural aware', () => {
      const one = scoreRisk(baseInput({ propertyType: 'Flat' }), kb.factors);
      expect(buildRiskSummary(resolveBand(one.score, kb.riskBands), one)).toBe(
        'Standard risk. Your risk score is 10 from 1 factor: Flat — higher shared risk (+10).',
      );
      const two = scoreRisk(baseInput({ age: 80, previousClaims: 1 }), kb.factors);
      expect(buildRiskSummary(resolveBand(two.score, kb.riskBands), two)).toContain('from 2 factors:');
    });
  });
});
