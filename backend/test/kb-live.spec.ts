import { getKnowledgeBase, resetKnowledgeBaseCache } from '../src/kb/kb.loader';
import type { KnowledgeBase } from '../src/kb/kb.types';
import { priceQuote } from '../src/quote/quote.service';
import { baseInput } from './fixtures/kb.fixture';

/**
 * Contract tests against the REAL kb/risk-kb.json.
 * The add-kb-factor skill appends a case here whenever a factor is added or changed.
 */
describe('production KB (kb/risk-kb.json)', () => {
  let kb: KnowledgeBase;

  beforeAll(() => {
    resetKnowledgeBaseCache();
    kb = getKnowledgeBase();
  });

  const ids = (input: Parameters<typeof baseInput>[0]) => priceQuote(baseInput(input), kb).appliedFactors.map((f) => f.id);

  it('is valid and versioned', () => {
    expect(kb.schemaVersion).toBe(1);
    expect(kb.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Object.keys(kb.riskBands)).toEqual(['STANDARD', 'ELEVATED', 'HIGH_RISK']);
  });

  it('prices the three bands as specified in the brief', () => {
    expect(priceQuote(baseInput(), kb)).toMatchObject({ riskBand: 'STANDARD', annualPremium: 360, monthlyPremium: 30 });
    expect(priceQuote(baseInput({ age: 30, previousClaims: 2 }), kb)).toMatchObject({ riskBand: 'ELEVATED', annualPremium: 540, monthlyPremium: 45 });
    expect(priceQuote(baseInput({ age: 22, propertyType: 'Flat', propertyValue: 800000, previousClaims: 3 }), kb)).toMatchObject({
      riskBand: 'HIGH_RISK',
      riskScore: 180, // 20 + 90 + 10 + 25 + 35 (compound flat_high_value)
      annualPremium: 792,
      monthlyPremium: 66,
    });
  });

  it('flat_high_value (compound AND) applies only to Flats over £500k', () => {
    expect(ids({ propertyType: 'Flat', propertyValue: 600000 })).toEqual(['property_type_flat', 'flat_high_value']);
    expect(ids({ propertyType: 'Flat', propertyValue: 400000 })).toEqual(['property_type_flat']);
    expect(ids({ propertyType: 'House', propertyValue: 600000 })).toEqual([]);
  });
});
